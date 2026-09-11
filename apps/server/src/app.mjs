/**
 * HTTP surface. Thin by design: the regulations are enforced in the schema,
 * and the sync handlers own the app↔DB translation. Routes validate shape,
 * call through, and turn rejections into clause-bearing JSON.
 */

import express from 'express';
import cors from 'cors';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { applyEvents, EVENT_TYPES } from './sync/apply.mjs';
import { explain, isClientError } from './sync/errors.mjs';
import { assetPath } from './db.mjs';
import { authenticate, hashPasscode, login, logout, tokenFromRequest } from './auth.mjs';
import { canDecide, canRecord } from './roles.mjs';
import { mailConfigured, sendMail } from './mail.mjs';
import { randomUUID } from 'crypto';

// The certificate renderer lives in packages/checksheets; vendored on Vercel.
const renderMod = await import(
  pathToFileURL(assetPath('lib/render-certificate.mjs', 'packages/checksheets/lib/render-certificate.mjs')).href
);
const { renderCertificateHtml, CERTIFICATE_DEFAULTS } = renderMod;
const reportMod = await import(
  pathToFileURL(assetPath('lib/render-report.mjs', 'packages/checksheets/lib/render-report.mjs')).href
);
const { renderNonComplianceReport } = reportMod;
const formCertMod = await import(
  pathToFileURL(assetPath('lib/render-form-certificate.mjs', 'packages/checksheets/lib/render-form-certificate.mjs')).href
);
const { renderFormCertificate } = formCertMod;
const readJson = (vendorRel, repoRel) => JSON.parse(readFileSync(assetPath(vendorRel, repoRel), 'utf8'));
const SHEET_SETS = readJson('data/sheet-sets.json', 'packages/checksheets/data/sheet-sets.json');
const AUTHORISATION = readJson('data/authorisation.json', 'packages/checksheets/data/authorisation.json');
const sheetSetFor = (classKey) => SHEET_SETS.sets.find((x) => x.key === classKey) ?? SHEET_SETS.sets[0];
const kindFor = (classKey) => sheetSetFor(classKey).kind ?? 'location';
const templatesForClass = (classKey) =>
  (SHEET_SETS.sets.find((x) => x.key === classKey) ?? SHEET_SETS.sets[0]).templates;

/** The letterhead images as data URLs, shared by every rendered document. */
function letterheadImages() {
  const brand = (name) => {
    const p = assetPath(`brand/${name}`, `packages/checksheets/brand/${name}`);
    return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null;
  };
  return { logo: brand('logo-white.png'), ribbon: brand('bottom-ribbon.png') };
}

/** Evidence bytes: Vercel Blob when a token is present, local disk otherwise. */
async function storeEvidence(sha256, ext, buf, mime) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Private store: a photograph of a hazardous substance location is not a
    // public document. Bytes come back only through GET /api/evidence/:key,
    // which needs a signed-in user.
    const { put } = await import('@vercel/blob');
    const key = `evidence/${sha256}.${ext}`;
    // The key is the SHA-256 of the bytes, so a second upload of the same
    // photograph (another device, a retry) carries identical bytes: writing
    // them again is harmless, and refusing would fail the retry (IPS 21(4)
    // wants the record, not a duplicate error).
    const b = await put(key, buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: mime });
    return { storageKey: key, url: b.url, backend: 'vercel-blob' };
  }
  // On Vercel the bundle is read-only; /tmp is the only writable path and is
  // per-instance and ephemeral. That is a smoke-test fallback only — real
  // evidence goes to Blob (BLOB_READ_WRITE_TOKEN) or object storage.
  const dir =
    process.env.EVIDENCE_DIR ??
    (process.env.VERCEL ? '/tmp/evidence' : join(process.cwd(), 'data', 'evidence'));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${sha256}.${ext}`);
  if (!existsSync(file)) writeFileSync(file, buf);
  return { storageKey: `${sha256}.${ext}`, url: null, backend: 'disk' };
}

async function readEvidence(storageKey) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { get } = await import('@vercel/blob');
    // Uploads live under evidence/; the route is called with the bare key.
    const pathname = storageKey.startsWith('evidence/') ? storageKey : 'evidence/' + storageKey;
    const r = await get(pathname, { access: 'private' }).catch(() => null);
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    const chunks = [];
    for await (const c of r.stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return { buf: Buffer.concat(chunks), mime: r.blob?.contentType ?? null };
  }
  // On Vercel the bundle is read-only; /tmp is the only writable path and is
  // per-instance and ephemeral. That is a smoke-test fallback only — real
  // evidence goes to Blob (BLOB_READ_WRITE_TOKEN) or object storage.
  const dir =
    process.env.EVIDENCE_DIR ??
    (process.env.VERCEL ? '/tmp/evidence' : join(process.cwd(), 'data', 'evidence'));
  const file = join(dir, storageKey);
  if (!existsSync(file)) return null;
  return { buf: readFileSync(file), mime: null };
}

/** Routes a device may call before it has signed in. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/templates', '/api/sync/event-types']);
const isPublic = (req) =>
  PUBLIC_PATHS.has(req.path) || req.path.startsWith('/api/templates/') || !req.path.startsWith('/api/');

export function buildApp(db, { allowedOrigin, requireAuth = process.env.AUTH_REQUIRED === '1' } = {}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cors({ origin: allowedOrigin ?? true, credentials: true }));

  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  // Identity. A bearer token (or ?token= for pages the browser opens itself)
  // names the user; that name is the server's, not the client's. With
  // AUTH_REQUIRED=1 nothing else is accepted. Without it (tests, local dev)
  // the x-user-id header still works, and the sync route's body userId too.
  app.use((req, _res, next) => (async () => {
    const session = await authenticate(db, tokenFromRequest(req));
    const headerUser = requireAuth ? null : (req.header('x-user-id') ? Number(req.header('x-user-id')) : null);
    let role = session?.role ?? null;
    if (!role && headerUser) {
      const u = await db.query(`SELECT role FROM app_user WHERE id = $1`, [headerUser]);
      role = u.rows[0]?.role ?? null;
    }
    req.ctx = {
      deviceId: req.header('x-device-id') ?? session?.deviceId ?? null,
      userId: session?.userId ?? headerUser,
      role,
      authenticated: !!session,
    };
    if (requireAuth && !session && !isPublic(req)) {
      return _res.status(401).json({ error: 'login required', clause: 'IPS 21(5)' });
    }
    next();
  })().catch(next));

  // ── auth ─────────────────────────────────────────────────────────────────
  app.post('/api/auth/login', wrap(async (req, res) => {
    const b = req.body ?? {};
    if (!b.passcode) return res.status(400).json({ error: 'passcode is required' });
    const out = await login(db, { email: b.email, passcode: b.passcode, deviceId: b.deviceId ?? req.ctx.deviceId });
    if (!out) return res.status(401).json({ error: 'email or passcode not recognised' });
    res.json(out);
  }));
  app.post('/api/auth/logout', wrap(async (req, res) => {
    await logout(db, tokenFromRequest(req));
    res.json({ ok: true });
  }));
  app.get('/api/auth/me', wrap(async (req, res) => {
    if (!req.ctx.userId) return res.status(401).json({ error: 'not signed in' });
    const r = await db.query(
      `SELECT id, full_name, occupation, email, role, authorisation_number FROM app_user WHERE id = $1`,
      [req.ctx.userId]);
    const u = r.rows[0];
    res.json({ id: u.id, fullName: u.full_name, occupation: u.occupation, email: u.email,
               role: u.role, authorisationNumber: u.authorisation_number, authenticated: req.ctx.authenticated });
  }));

  // ── health ───────────────────────────────────────────────────────────────
  app.get('/api/health', wrap(async (_req, res) => {
    // Items of CURRENT template revisions only — superseded revisions keep
    // their rows so old findings resolve, but they are not the check sheet.
    const r = await db.query(`
      SELECT count(i.id)::int AS n
      FROM checksheet_item i
      JOIN checksheet_section s ON s.id = i.section_id
      JOIN checksheet_template t ON t.id = s.template_id
      WHERE t.status = 'current'`);
    res.json({ ok: true, db: db.kind, templateItems: r.rows[0].n });
  }));

  // ── templates: the canonical check sheets, from the database ─────────────
  // The app ships these compiled in; this endpoint lets it confirm its bundle
  // matches what the server holds before an inspection begins.
  app.get('/api/templates', wrap(async (req, res) => {
    // Current revisions by default; ?all=1 includes superseded ones.
    const all = req.query.all === '1';
    const r = await db.query(`
      SELECT t.code, t.revision, t.title, t.status, t.class_scope,
             count(i.id)::int AS item_count
      FROM checksheet_template t
      LEFT JOIN checksheet_section s ON s.template_id = t.id
      LEFT JOIN checksheet_item i ON i.section_id = s.id
      ${all ? '' : `WHERE t.status = 'current'`}
      GROUP BY t.id ORDER BY t.code, t.revision`);
    res.json(r.rows);
  }));

  app.get('/api/templates/:code', wrap(async (req, res) => {
    const t = await db.query(
      `SELECT id, code, revision, title, status, class_scope, ps_reference, meta
       FROM checksheet_template WHERE code = $1 AND status = 'current'
       ORDER BY revision DESC LIMIT 1`,
      [req.params.code]);
    if (!t.rows.length) return res.status(404).json({ error: 'template not found' });
    const sections = await db.query(
      `SELECT id, ordinal, number, title FROM checksheet_section
       WHERE template_id = $1 ORDER BY ordinal`, [t.rows[0].id]);
    const items = await db.query(
      `SELECT i.section_id, i.ordinal, i.number, i.regulation_refs, i.regulation_refs_by_class,
              i.regulation_raw, i.guidance_url, i.action, i.records, i.evidence_required
       FROM checksheet_item i
       JOIN checksheet_section s ON s.id = i.section_id
       WHERE s.template_id = $1 ORDER BY s.ordinal, i.ordinal`, [t.rows[0].id]);
    res.json({
      ...t.rows[0],
      sections: sections.rows.map((s) => ({
        ...s,
        items: items.rows.filter((i) => i.section_id === s.id).map(({ section_id, ...i }) => i),
      })),
    });
  }));

  // ── jobs ─────────────────────────────────────────────────────────────────
  /**
   * The jobs board. One row per job with what a certifier scans for: who,
   * where, which stage, how far the inspection has got, and when anything
   * last happened. Computed here so every device sees the same numbers.
   */
  app.get('/api/jobs', wrap(async (_req, res) => {
    const r = await db.query(`
      SELECT j.id, j.stage, j.class_key, j.opened_at, j.subject,
             c.legal_name AS client, c.trading_name, l.name AS location, s.address,
             i.id AS inspection_id, i.inspected_at,
             COALESCE(items.n, 0)::int       AS item_total,
             COALESCE(fc.assessed, 0)::int   AS assessed,
             COALESCE(fc.non_compliant, 0)::int AS non_compliant,
             cert.decision                   AS certificate_decision,
             GREATEST(j.opened_at, tr.at, fc.last_at, cm.at) AS last_activity
      FROM job j
      JOIN client c ON c.id = j.client_id
      LEFT JOIN hs_location l ON l.id = j.hs_location_id
      LEFT JOIN site s ON s.id = l.site_id
      LEFT JOIN LATERAL (SELECT id, inspected_at FROM inspection
                         WHERE job_id = j.id ORDER BY inspected_at DESC LIMIT 1) i ON true
      LEFT JOIN LATERAL (SELECT count(ci.id) AS n
                         FROM inspection_template it
                         JOIN checksheet_section cs ON cs.template_id = it.template_id
                         JOIN checksheet_item ci ON ci.section_id = cs.id
                         WHERE it.inspection_id = i.id) items ON true
      LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE f.status <> 'pending') AS assessed,
                                count(*) FILTER (WHERE f.status = 'non_compliant') AS non_compliant,
                                max(f.updated_at) AS last_at
                         FROM finding f WHERE f.inspection_id = i.id) fc ON true
      LEFT JOIN LATERAL (SELECT max(occurred_at) AS at FROM job_stage_transition WHERE job_id = j.id) tr ON true
      LEFT JOIN LATERAL (SELECT max(occurred_at) AS at FROM communication WHERE job_id = j.id) cm ON true
      LEFT JOIN LATERAL (SELECT decision FROM certificate WHERE job_id = j.id LIMIT 1) cert ON true
      ORDER BY last_activity DESC NULLS LAST, j.id DESC`);
    res.json(r.rows.map((row) => ({ ...row, kind: kindFor(row.class_key) })));
  }));

  /** Create a client + site + location + job in one call (stage 1, enquiry). */
  /** Client + site + location + job, plus contacts and substances, in one transaction. */
  async function createJob(tx, b) {
      const c = await tx.query(
        `INSERT INTO client (legal_name, trading_name, nzbn, companies_number, postal_address, phone, website, industry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [b.client.legalName, b.client.tradingName ?? null, b.client.nzbn ?? null,
         b.client.companiesNumber ?? null, b.client.postalAddress ?? null,
         b.client.phone ?? null, b.client.website ?? null, b.client.industry ?? null]);
      const s = await tx.query(`INSERT INTO site (client_id, address) VALUES ($1,$2) RETURNING id`,
        [c.rows[0].id, b.site.address]);
      const l = await tx.query(
        `INSERT INTO hs_location (site_id, name, summary) VALUES ($1,$2,$3) RETURNING id`,
        [s.rows[0].id, b.location.name, b.location.summary ?? null]);
      const j = await tx.query(
        `INSERT INTO job (client_id, hs_location_id, class_key) VALUES ($1,$2,$3) RETURNING id, stage`,
        [c.rows[0].id, l.rows[0].id, b.classKey ?? null]);
      // Site block rows 10, 12 and 13 come from contacts and substances; accept
      // them at creation so a job is complete from its first render.
      for (const ct of Array.isArray(b.contacts) ? b.contacts : []) {
        if (!ct?.name) continue;
        await tx.query(
          `INSERT INTO contact (client_id, name, role, phone, email, is_site_manager)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [c.rows[0].id, ct.name, ct.role ?? null, ct.phone ?? null, ct.email ?? null, !!ct.isSiteManager]);
      }
      for (const sb of Array.isArray(b.substances) ? b.substances : []) {
        if (!sb?.name || !sb?.hazardClass) continue;
        await tx.query(
          `INSERT INTO substance (hs_location_id, name, hazard_class, quantity, unit, un_number, hsno_approval, lifecycles)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [l.rows[0].id, sb.name, sb.hazardClass, sb.quantity ?? null, sb.unit ?? null,
           sb.unNumber ?? null, sb.hsnoApproval ?? null, sb.lifecycles ?? null]);
      }
      if (b.subject && typeof b.subject === 'object') {
        await tx.query(`UPDATE job SET subject = $2::jsonb WHERE id = $1`, [j.rows[0].id, JSON.stringify(b.subject)]);
      }
      let ord = 0;
      for (const u of Array.isArray(b.units) ? b.units : []) {
        await tx.query(`INSERT INTO job_unit (job_id, ordinal, fields) VALUES ($1,$2,$3::jsonb)`,
          [j.rows[0].id, ++ord, JSON.stringify(u?.fields ?? u ?? {})]);
      }
      return { jobId: j.rows[0].id, clientId: c.rows[0].id, siteId: s.rows[0].id,
               hsLocationId: l.rows[0].id, stage: j.rows[0].stage };
  }

  app.post('/api/jobs', wrap(async (req, res) => {
    const b = req.body ?? {};
    if (!canRecord(req.ctx.role)) return res.status(403).json({ error: 'a viewer cannot create a job', clause: 'Role' });
    if (!b.client?.legalName || !b.site?.address || !b.location?.name)
      return res.status(400).json({ error: 'client.legalName, site.address and location.name are required' });
    const out = await db.withTx((tx) => createJob(tx, b));
    res.status(201).json(out);
  }));

  /**
   * Backfill the site-block sources (contacts, substances) on an existing job.
   * Idempotent by name: a contact or substance already present is left alone,
   * so a client can call this on every open without duplicating rows. Exists
   * because jobs created before these were captured have blank rows 10–13.
   */
  app.post('/api/jobs/:id/site-block', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    const out = await db.withTx(async (tx) => {
      const j = await tx.query(`SELECT client_id, hs_location_id FROM job WHERE id = $1`, [id]);
      if (!j.rows.length) return null;
      const { client_id, hs_location_id } = j.rows[0];
      let contacts = 0, substances = 0;
      for (const ct of Array.isArray(b.contacts) ? b.contacts : []) {
        if (!ct?.name) continue;
        const r = await tx.query(
          `INSERT INTO contact (client_id, name, role, phone, email, is_site_manager)
           SELECT $1,$2,$3,$4,$5,$6
           WHERE NOT EXISTS (SELECT 1 FROM contact WHERE client_id = $1 AND lower(name) = lower($2))`,
          [client_id, ct.name, ct.role ?? null, ct.phone ?? null, ct.email ?? null, !!ct.isSiteManager]);
        contacts += r.rowCount ?? 0;
      }
      if (hs_location_id) {
        for (const sb of Array.isArray(b.substances) ? b.substances : []) {
          if (!sb?.name || !sb?.hazardClass) continue;
          const r = await tx.query(
            `INSERT INTO substance (hs_location_id, name, hazard_class, quantity, unit, un_number, hsno_approval, lifecycles)
             SELECT $1,$2,$3,$4,$5,$6,$7,$8
             WHERE NOT EXISTS (SELECT 1 FROM substance WHERE hs_location_id = $1 AND lower(name) = lower($2))`,
            [hs_location_id, sb.name, sb.hazardClass, sb.quantity ?? null, sb.unit ?? null,
             sb.unNumber ?? null, sb.hsnoApproval ?? null, sb.lifecycles ?? null]);
          substances += r.rowCount ?? 0;
        }
      }
      return { jobId: id, contactsAdded: contacts, substancesAdded: substances };
    });
    if (!out) return res.status(404).json({ error: 'job not found' });
    res.json(out);
  }));

  /** Everything the app needs to render a job, in one round trip. */
  app.get('/api/jobs/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const j = await db.query(`
      SELECT j.id, j.stage, j.class_key, j.opened_at, j.closed_at, j.subject,
             json_build_object('id', c.id, 'legalName', c.legal_name, 'tradingName', c.trading_name,
                               'nzbn', c.nzbn, 'companiesNumber', c.companies_number,
                               'postalAddress', c.postal_address, 'phone', c.phone,
                               'website', c.website, 'industry', c.industry) AS client,
             json_build_object('id', l.id, 'name', l.name, 'summary', l.summary,
                               'address', s.address) AS location
      FROM job j
      JOIN client c ON c.id = j.client_id
      LEFT JOIN hs_location l ON l.id = j.hs_location_id
      LEFT JOIN site s ON s.id = l.site_id
      WHERE j.id = $1`, [id]);
    if (!j.rows.length) return res.status(404).json({ error: 'job not found' });

    const [insp, findings, evidence, cert, retention, transitions, interests, contacts, substances,
           correctiveActions, allowedNext, communications, events, units] = await Promise.all([
      db.query(`SELECT i.id, i.inspected_at, i.equipment_used, i.status, i.certifier_id,
                       i.conducted_by_id, i.supervised,
                       i.declaration_signed_at, i.declaration_signed_by,
                       i.scope_confirmed_at, i.scope_confirmed_by,
                       array_agg(t.code ORDER BY t.code) FILTER (WHERE t.code IS NOT NULL) AS template_codes
                FROM inspection i
                LEFT JOIN inspection_template it ON it.inspection_id = i.id
                LEFT JOIN checksheet_template t ON t.id = it.template_id
                WHERE i.job_id = $1 GROUP BY i.id ORDER BY i.inspected_at DESC`, [id]),
      db.query(`SELECT f.id, f.inspection_id, t.code AS template_code, s.ordinal AS section_ordinal,
                       i.ordinal AS item_ordinal, f.status, f.comment, f.verification_method,
                       f.failure_reason, f.decided_at, f.updated_at,
                       (SELECT count(*)::int FROM evidence e WHERE e.finding_id = f.id) AS evidence_count
                FROM finding f
                JOIN inspection ins ON ins.id = f.inspection_id
                JOIN checksheet_item i ON i.id = f.item_id
                JOIN checksheet_section s ON s.id = i.section_id
                JOIN checksheet_template t ON t.id = s.template_id
                WHERE ins.job_id = $1 ORDER BY t.code, s.ordinal, i.ordinal`, [id]),
      db.query(`SELECT id, finding_id, kind, sha256, mime, bytes, provenance,
                       captured_by_name, captured_by_occupation, captured_at, captured_where, retain_until
                FROM evidence WHERE job_id = $1 ORDER BY created_at`, [id]),
      db.query(`SELECT id, decision, register_number, certificate_number, issue_date, in_force_date,
                       expiry_date, conditions, requirements_not_met, worksafe_register_due
                FROM certificate WHERE job_id = $1`, [id]),
      db.query(`SELECT trigger, retain_until FROM retention_clock WHERE job_id = $1`, [id]),
      db.query(`SELECT from_stage, to_stage, occurred_at, actor_id, reason
                FROM job_stage_transition WHERE job_id = $1 ORDER BY id`, [id]),
      db.query(`SELECT certifier_id, conflict_found, description, declared_at
                FROM interest_declaration WHERE job_id = $1`, [id]),
      // Site block rows 10 and 12: Manager Name, Direct Dial / Mobile.
      db.query(`SELECT ct.id, ct.name, ct.role, ct.phone, ct.email, ct.is_site_manager
                FROM contact ct JOIN job j ON j.client_id = ct.client_id
                WHERE j.id = $1 ORDER BY ct.is_site_manager DESC, ct.id`, [id]),
      // Site block row 13: Hazardous substance name(s) at this location.
      db.query(`SELECT s.id, s.name, s.hazard_class, s.quantity, s.unit, s.un_number, s.hsno_approval, s.lifecycles
                FROM substance s JOIN job j ON j.hs_location_id = s.hs_location_id
                WHERE j.id = $1 ORDER BY s.name`, [id]),
      // Process flow stage 5: corrective actions keyed the way the app keys findings.
      db.query(`SELECT ca.id, ca.finding_id, ca.severity, ca.description, ca.due_date, ca.status,
                       ca.reverified_by, ca.reverified_at, ca.created_at,
                       f.inspection_id, t.code AS template_code, s.ordinal AS section_ordinal, i.ordinal AS item_ordinal
                FROM corrective_action ca
                JOIN finding f ON f.id = ca.finding_id
                JOIN inspection ins ON ins.id = f.inspection_id
                JOIN checksheet_item i ON i.id = f.item_id
                JOIN checksheet_section s ON s.id = i.section_id
                JOIN checksheet_template t ON t.id = s.template_id
                WHERE ins.job_id = $1 ORDER BY ca.id`, [id]),
      // The stages this job may legally move to next, from the same function
      // the trigger enforces. The app offers only these.
      db.query(`SELECT e.enumlabel AS stage
                FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid
                WHERE ty.typname = 'job_stage'
                  AND job_stage_allowed((SELECT stage FROM job WHERE id = $1), e.enumlabel::job_stage)
                ORDER BY e.enumsortorder`, [id]),
      // IPS 21(2)(a): every communication with the applicant is a record of
      // the job. Stages 1 to 3 of the process flow live here (enquiry, pack,
      // RFI and its answer).
      db.query(`SELECT id, direction, medium, party, summary, body, occurred_at, recorded_by
                FROM communication WHERE job_id = $1 ORDER BY occurred_at, id`, [id]),
      // IPS 22: who did what on this job, newest first. Events name a job
      // directly or through an inspection of it.
      db.query(`SELECT e.id, e.type, e.payload, e.occurred_at, e.outcome, e.reject_clause,
                       u.full_name AS user_name, u.role AS user_role, e.device_id
                FROM sync_event e
                LEFT JOIN app_user u ON u.id = e.user_id
                WHERE NULLIF(e.payload->>'jobId','')::bigint = $1
                   OR NULLIF(e.payload->>'inspectionId','')::bigint IN (SELECT id FROM inspection WHERE job_id = $1)
                   OR NULLIF(e.payload->>'correctiveActionId','')::bigint IN (
                        SELECT ca.id FROM corrective_action ca JOIN finding f ON f.id = ca.finding_id
                        JOIN inspection i ON i.id = f.inspection_id WHERE i.job_id = $1)
                ORDER BY e.occurred_at DESC, e.received_at DESC LIMIT 100`, [id]),
      db.query(`SELECT id, ordinal, fields, updated_at FROM job_unit WHERE job_id = $1 ORDER BY ordinal`, [id]),
    ]);

    const counts = findings.rows.reduce((a, f) => ((a[f.status] = (a[f.status] ?? 0) + 1), a), {});
    res.json({
      ...j.rows[0],
      inspections: insp.rows,
      findings: findings.rows,
      findingCounts: counts,
      evidence: evidence.rows,
      certificate: cert.rows[0] ?? null,
      retention: retention.rows[0] ?? null,
      transitions: transitions.rows,
      interestDeclarations: interests.rows,
      contacts: contacts.rows,
      substances: substances.rows,
      correctiveActions: correctiveActions.rows,
      allowedNext: allowedNext.rows.map((r) => r.stage),
      communications: communications.rows,
      events: events.rows,
      units: units.rows,
      kind: kindFor(j.rows[0].class_key),
    });
  }));

  /**
   * Dry-run the issuance guards without mutating anything. This is what makes
   * the app's "Can grant / Cannot grant" pill server-authoritative rather than
   * a local guess — the same PL/pgSQL that will block the real transition.
   */
  app.get('/api/jobs/:id/issuance-check', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const blockers = [];
    try {
      await db.withTx(async (tx) => {
        await tx.query('SELECT assert_can_issue_certificate($1)', [id]);
        throw new ROLLBACK_SENTINEL();
      });
    } catch (e) {
      if (!(e instanceof ROLLBACK_SENTINEL)) {
        const why = explain(e);
        blockers.push(why);
      }
    }
    const nc = await db.query(`
      SELECT count(*)::int AS n
      FROM finding f JOIN inspection i ON i.id = f.inspection_id
      LEFT JOIN corrective_action ca ON ca.finding_id = f.id
      WHERE i.job_id = $1 AND f.status = 'non_compliant'
        AND (ca.id IS NULL OR ca.status <> 'verified')`, [id]);
    res.json({
      canGrant: blockers.length === 0 && nc.rows[0].n === 0,
      canIssueConditional: blockers.length === 0,
      unresolvedNonCompliances: nc.rows[0].n,
      blockers,
    });
  }));

  /** Issue the certificate. The stage transition and the insert share one transaction. */
  app.post('/api/jobs/:id/certificate', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    if (!canDecide(req.ctx.role)) {
      return res.status(403).json({ error: 'issuing a certificate needs a compliance certifier', clause: 'Role' });
    }
    const out = await db.withTx(async (tx) => {
      await tx.query(`UPDATE job SET stage = 'certificate_issued' WHERE id = $1`, [id]);
      const r = await tx.query(
        `INSERT INTO certificate
           (job_id, inspection_id, decision, register_number, certificate_number, certifier_id,
            issued_to, applies_to, issue_date, in_force_date, expiry_date, details,
            requirements_not_met, conditions, signed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id, worksafe_register_due`,
        [id, b.inspectionId ?? null, b.decision, b.registerNumber ?? null, b.certificateNumber ?? null,
         b.certifierId ?? req.ctx.userId, b.issuedTo, b.appliesTo, b.issueDate,
         b.inForceDate ?? b.issueDate, b.expiryDate ?? null, b.details ?? null,
         b.requirementsNotMet ?? [], b.conditions ?? [], b.signedAt ?? new Date().toISOString()]);
      const rc = await tx.query(`SELECT retain_until FROM retention_clock WHERE job_id = $1`, [id]);
      return { certificateId: r.rows[0].id, worksafeRegisterDue: r.rows[0].worksafe_register_due,
               retainUntil: rc.rows[0]?.retain_until ?? null };
    });
    res.status(201).json(out);
  }));

  // ── certificate rendered FROM the job ────────────────────────────────────
  // The same renderer that reproduces the legacy workbook, fed from findings.
  // The certificate stops being a separately-typed document.
  async function fetchCertificateHtml(id) {
    const jk = await db.query(`SELECT class_key, subject FROM job WHERE id = $1`, [id]);
    if (!jk.rows.length) return null;
    if (kindFor(jk.rows[0].class_key) !== 'location') return fetchFormCertificateHtml(id, jk.rows[0]);
    const r = await db.query(`
      SELECT c.*, u.full_name, u.authorisation_number, u.email AS certifier_email,
             cl.legal_name, cl.postal_address, cl.nzbn, cl.companies_number,
             j.hs_location_id, l.name AS loc_name, l.summary AS loc_summary, s.address,
             ct.name AS contact_name, ct.phone AS contact_phone, ct.email AS contact_email
      FROM certificate c
      JOIN job j        ON j.id = c.job_id
      JOIN app_user u   ON u.id = c.certifier_id
      JOIN client cl    ON cl.id = j.client_id
      LEFT JOIN hs_location l ON l.id = j.hs_location_id
      LEFT JOIN site s        ON s.id = l.site_id
      LEFT JOIN contact ct    ON ct.client_id = cl.id AND ct.is_site_manager
      WHERE c.job_id = $1`, [id]);
    if (!r.rows.length) return null;
    const row = r.rows[0];
    const subs = row.hs_location_id
      ? await db.query(`SELECT name, hazard_class, quantity, unit FROM substance
                        WHERE hs_location_id = $1 ORDER BY name`, [row.hs_location_id])
      : { rows: [] };
    const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);
    const cert = {
      ...CERTIFICATE_DEFAULTS,
      certificateNumber: row.certificate_number,
      registerNumber: row.register_number,
      certifier: { fullName: row.full_name, postNominals: null,
                   authorisationNumber: row.authorisation_number, email: row.certifier_email },
      issuedTo: { name: row.issued_to, phone: row.contact_phone, email: row.contact_email },
      pcbu: { legalName: row.legal_name, postalAddress: row.postal_address, nzbn: row.nzbn },
      location: { address: row.address ?? row.applies_to, companyNumber: row.companies_number,
                  siteDetails: row.loc_summary },
      substances: subs.rows.map((s) => ({
        name: s.name, hazardClass: s.hazard_class,
        maxQuantity: s.quantity != null ? `${s.quantity} ${s.unit ?? ''}`.trim() : '',
      })),
      detailsOfCertification: row.details,
      requirementsNotMet: row.requirements_not_met ?? [],
      conditions: row.conditions ?? [],
      decision: row.decision,
      issueDate: d(row.issue_date), inForceDate: d(row.in_force_date), expiryDate: d(row.expiry_date),
    };
    let signatureDataUrl = null;
    const sigPath = assetPath('signature.png', 'packages/checksheets/data/certificates/g2-chiller/signature.png');
    if (existsSync(sigPath))
      signatureDataUrl = `data:image/png;base64,${readFileSync(sigPath).toString('base64')}`;
    // Letterhead: the three images the workbook's Certificate sheet carries.
    const brand = (name) => {
      const p = assetPath(`brand/${name}`, `packages/checksheets/brand/${name}`);
      return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null;
    };
    const letterhead = {
      logo: brand('logo-white.png'),
      details: brand('company-details.png'),
      ribbon: brand('bottom-ribbon.png'),
    };
    return renderCertificateHtml(cert, { signatureDataUrl, letterhead });
  }

  /** Certified handler and cylinder importation certificates. */
  async function fetchFormCertificateHtml(id, job) {
    const set = sheetSetFor(job.class_key);
    const [cert, tpl, units, user, subs] = await Promise.all([
      db.query(`SELECT * FROM certificate WHERE job_id = $1`, [id]),
      db.query(`SELECT meta->'sheet'->'certificate' AS certificate FROM checksheet_template
                WHERE code = $1 AND status = 'current' LIMIT 1`, [set.templates[0]]),
      db.query(`SELECT ordinal, fields FROM job_unit WHERE job_id = $1 ORDER BY ordinal`, [id]),
      db.query(`SELECT u.full_name, u.authorisation_number, u.email FROM certificate c JOIN app_user u ON u.id = c.certifier_id WHERE c.job_id = $1`, [id]),
      db.query(`SELECT s.name, s.hazard_class, s.lifecycles FROM substance s JOIN job j ON j.hs_location_id = s.hs_location_id WHERE j.id = $1 ORDER BY s.id`, [id]),
    ]);
    if (!cert.rows.length) return null;
    const certificateTemplate = tpl.rows[0]?.certificate;
    if (!certificateTemplate) return null;
    const u = user.rows[0] ?? {};
    return renderFormCertificate({
      certificateTemplate, subject: job.subject ?? {}, units: units.rows, substances: subs.rows, cert: cert.rows[0],
      certifier: { fullName: u.full_name, authorisationNumber: u.authorisation_number, email: u.email },
      letterhead: letterheadImages(),
    });
  }

  app.get('/api/jobs/:id/certificate.html', wrap(async (req, res) => {
    const html = await fetchCertificateHtml(Number(req.params.id));
    if (!html) return res.status(404).json({ error: 'no certificate issued for this job' });
    res.type('html').send(html);
  }));

  // ── catalogues: what the certifier may certify, and the sheet sets ──────
  app.get('/api/authorisation', (_req, res) => res.json(AUTHORISATION));
  app.get('/api/sheet-sets', (_req, res) => {
    const byKey = Object.fromEntries(AUTHORISATION.authorisations.map((a) => [a.key, a]));
    res.json({
      sets: SHEET_SETS.sets.map((x) => ({
        ...x,
        authorised: !!(x.authorisation && byKey[x.authorisation]),
        authorisationEntry: x.authorisation ? byKey[x.authorisation] ?? null : null,
      })),
      planned: SHEET_SETS.planned,
      certifier: AUTHORISATION.certifier,
    });
  });

  // ── people: who may sign in, and as what ─────────────────────────────────
  // Person → Role. Managed by a compliance certifier (or admin) from the
  // People screen. Every account is one person, so History and photographs
  // (IPS 21(4): name and occupation) carry the right name.
  const ROLES = ['certifier', 'reviewer', 'viewer', 'admin'];
  const personRow = (u) => ({
    id: u.id, fullName: u.full_name, occupation: u.occupation, email: u.email, role: u.role,
    authorisationNumber: u.authorisation_number, active: u.active, createdAt: u.created_at, hasPasscode: !!u.passcode_hash,
  });
  const PERSON_COLS = 'id, full_name, occupation, email, role, authorisation_number, active, created_at, passcode_hash';

  app.get('/api/users', wrap(async (req, res) => {
    if (!canDecide(req.ctx.role)) return res.status(403).json({ error: 'managing people needs a compliance certifier', clause: 'Role' });
    const r = await db.query(`SELECT ${PERSON_COLS} FROM app_user ORDER BY active DESC, id`);
    res.json(r.rows.map(personRow));
  }));

  app.post('/api/users', wrap(async (req, res) => {
    if (!canDecide(req.ctx.role)) return res.status(403).json({ error: 'adding a person needs a compliance certifier', clause: 'Role' });
    const b = req.body ?? {};
    const fullName = String(b.fullName ?? '').trim(), occupation = String(b.occupation ?? '').trim();
    const email = String(b.email ?? '').trim().toLowerCase(), role = String(b.role ?? 'reviewer');
    if (!fullName || !occupation) return res.status(400).json({ error: 'a person needs a name and an occupation', clause: 'IPS 21(4)' });
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return res.status(400).json({ error: 'a sign-in email is required' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    if (String(b.passcode ?? '').length < 6) return res.status(400).json({ error: 'a passcode of at least 6 characters is required' });
    const dup = await db.query(`SELECT id FROM app_user WHERE lower(email) = $1`, [email]);
    if (dup.rows.length) return res.status(409).json({ error: 'that email is already a person here' });
    const r = await db.query(
      `INSERT INTO app_user (full_name, occupation, email, role, authorisation_number, passcode_hash)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${PERSON_COLS}`,
      [fullName, occupation, email, role, b.authorisationNumber ? String(b.authorisationNumber).trim() : null, hashPasscode(b.passcode)]);
    res.status(201).json(personRow(r.rows[0]));
  }));

  app.patch('/api/users/:id', wrap(async (req, res) => {
    if (!canDecide(req.ctx.role)) return res.status(403).json({ error: 'changing a person needs a compliance certifier', clause: 'Role' });
    const id = Number(req.params.id);
    const b = req.body ?? {};
    if (b.role !== undefined && !ROLES.includes(b.role)) return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    if (b.active === false && id === req.ctx.userId) return res.status(400).json({ error: 'you cannot deactivate yourself' });
    if (b.email !== undefined) {
      const email = String(b.email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) return res.status(400).json({ error: 'a sign-in email is required' });
      const dup = await db.query(`SELECT id FROM app_user WHERE lower(email) = $1 AND id <> $2`, [email, id]);
      if (dup.rows.length) return res.status(409).json({ error: 'that email is already a person here' });
      b.email = email;
    }
    const r = await db.query(
      `UPDATE app_user SET
         full_name = COALESCE($2, full_name), occupation = COALESCE($3, occupation), email = COALESCE($4, email),
         role = COALESCE($5, role), authorisation_number = COALESCE($6, authorisation_number), active = COALESCE($7, active)
       WHERE id = $1 RETURNING ${PERSON_COLS}`,
      [id, b.fullName?.trim() || null, b.occupation?.trim() || null, b.email ?? null, b.role ?? null,
       b.authorisationNumber === undefined ? null : String(b.authorisationNumber).trim(), typeof b.active === 'boolean' ? b.active : null]);
    if (!r.rows.length) return res.status(404).json({ error: 'person not found' });
    if (b.active === false) await db.query(`UPDATE auth_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
    res.json(personRow(r.rows[0]));
  }));

  /** A new passcode signs that person out everywhere. */
  app.post('/api/users/:id/passcode', wrap(async (req, res) => {
    if (!canDecide(req.ctx.role)) return res.status(403).json({ error: 'resetting a passcode needs a compliance certifier', clause: 'Role' });
    const id = Number(req.params.id);
    const passcode = String(req.body?.passcode ?? '');
    if (passcode.length < 6) return res.status(400).json({ error: 'a passcode of at least 6 characters is required' });
    const r = await db.query(`UPDATE app_user SET passcode_hash = $2 WHERE id = $1 RETURNING id`, [id, hashPasscode(passcode)]);
    if (!r.rows.length) return res.status(404).json({ error: 'person not found' });
    await db.query(`UPDATE auth_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
    res.json({ ok: true, id });
  }));

  // ── dashboard: what needs attention, and what just happened ─────────────
  app.get('/api/dashboard', wrap(async (_req, res) => {
    const [renewals, rfi, actions, stalled, activity, noAction, triage, decide] = await Promise.all([
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location, c.expiry_date
                FROM certificate c JOIN job j ON j.id = c.job_id
                JOIN client cl ON cl.id = j.client_id LEFT JOIN hs_location l ON l.id = j.hs_location_id
                WHERE c.expiry_date IS NOT NULL AND c.expiry_date <= now() + interval '180 days'
                ORDER BY c.expiry_date`),
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location, t.occurred_at AS since
                FROM job j JOIN client cl ON cl.id = j.client_id LEFT JOIN hs_location l ON l.id = j.hs_location_id
                JOIN LATERAL (SELECT max(occurred_at) AS occurred_at FROM job_stage_transition WHERE job_id = j.id) t ON true
                WHERE j.stage = 'rfi' AND t.occurred_at < now() - interval '7 days'`),
      db.query(`SELECT ca.id, ca.description, ca.severity, ca.due_date, ca.status, j.id AS job_id,
                       cl.legal_name AS client, l.name AS location
                FROM corrective_action ca JOIN finding f ON f.id = ca.finding_id
                JOIN inspection i ON i.id = f.inspection_id JOIN job j ON j.id = i.job_id
                JOIN client cl ON cl.id = j.client_id LEFT JOIN hs_location l ON l.id = j.hs_location_id
                WHERE ca.status <> 'verified' AND ca.due_date IS NOT NULL AND ca.due_date <= now() + interval '14 days'
                ORDER BY ca.due_date`),
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location, fc.last_at
                FROM job j JOIN client cl ON cl.id = j.client_id LEFT JOIN hs_location l ON l.id = j.hs_location_id
                LEFT JOIN LATERAL (SELECT max(f.updated_at) AS last_at FROM finding f JOIN inspection i ON i.id = f.inspection_id WHERE i.job_id = j.id) fc ON true
                WHERE j.stage = 'site_inspection' AND COALESCE(fc.last_at, j.opened_at) < now() - interval '14 days'`),
      db.query(`SELECT e.type, e.occurred_at, e.payload, u.full_name AS user_name,
                       COALESCE(NULLIF(e.payload->>'jobId','')::bigint, i.job_id, ci.job_id) AS job_id,
                       cl.legal_name AS client, l.name AS location
                FROM sync_event e
                LEFT JOIN app_user u ON u.id = e.user_id
                LEFT JOIN inspection i ON i.id = NULLIF(e.payload->>'inspectionId','')::bigint
                LEFT JOIN corrective_action ca ON ca.id = NULLIF(e.payload->>'correctiveActionId','')::bigint
                LEFT JOIN finding cf ON cf.id = ca.finding_id
                LEFT JOIN inspection ci ON ci.id = cf.inspection_id
                LEFT JOIN job j ON j.id = COALESCE(NULLIF(e.payload->>'jobId','')::bigint, i.job_id, ci.job_id)
                LEFT JOIN client cl ON cl.id = j.client_id
                LEFT JOIN hs_location l ON l.id = j.hs_location_id
                WHERE e.outcome = 'applied'
                ORDER BY e.occurred_at DESC LIMIT 30`),
      // Stage 5: a non-compliance with no corrective action yet.
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location, count(*)::int AS n
                FROM finding f JOIN inspection i ON i.id = f.inspection_id JOIN job j ON j.id = i.job_id
                JOIN client cl ON cl.id = j.client_id LEFT JOIN hs_location l ON l.id = j.hs_location_id
                WHERE f.status = 'non_compliant'
                  AND j.stage IN ('compliance_evaluation', 'gap_closure', 'final_validation')
                  AND NOT EXISTS (SELECT 1 FROM corrective_action ca WHERE ca.finding_id = f.id)
                GROUP BY j.id, cl.legal_name, l.name`),
      // Stages 1 and 2: an enquiry or application untouched for 2 days.
      db.query(`SELECT j.id AS job_id, j.stage, cl.legal_name AS client, l.name AS location, j.opened_at
                FROM job j JOIN client cl ON cl.id = j.client_id LEFT JOIN hs_location l ON l.id = j.hs_location_id
                LEFT JOIN LATERAL (SELECT max(occurred_at) AS at FROM job_stage_transition WHERE job_id = j.id) t ON true
                WHERE j.stage IN ('enquiry', 'application') AND COALESCE(t.at, j.opened_at) < now() - interval '2 days'`),
      // Stage 6: at final validation with nothing left to resolve; decide.
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location
                FROM job j JOIN client cl ON cl.id = j.client_id LEFT JOIN hs_location l ON l.id = j.hs_location_id
                WHERE j.stage = 'final_validation' AND NOT EXISTS (SELECT 1 FROM certificate c WHERE c.job_id = j.id)`),
    ]);
    const reminders = [
      ...renewals.rows.map((r) => ({ kind: 'renewal', jobId: r.job_id, client: r.client, location: r.location,
        when: r.expiry_date, text: `Certificate expires ${new Date(r.expiry_date).toISOString().slice(0, 10)}: start the renewal` })),
      ...rfi.rows.map((r) => ({ kind: 'rfi', jobId: r.job_id, client: r.client, location: r.location,
        when: r.since, text: 'Waiting on further information for more than 7 days' })),
      ...actions.rows.map((r) => ({ kind: 'action', jobId: r.job_id, client: r.client, location: r.location,
        when: r.due_date, text: `Corrective action ${new Date(r.due_date) < new Date() ? 'overdue' : 'due'} ${new Date(r.due_date).toISOString().slice(0, 10)}: ${r.description}` })),
      ...stalled.rows.map((r) => ({ kind: 'stalled', jobId: r.job_id, client: r.client, location: r.location,
        when: r.last_at, text: 'Site inspection open with no findings recorded for 14 days' })),
      ...noAction.rows.map((r) => ({ kind: 'no_action', jobId: r.job_id, client: r.client, location: r.location,
        when: null, text: `${r.n} non-compliance${r.n === 1 ? '' : 's'} with no corrective action raised` })),
      ...triage.rows.map((r) => ({ kind: 'triage', jobId: r.job_id, client: r.client, location: r.location,
        when: r.opened_at, text: r.stage === 'enquiry' ? 'Enquiry waiting for triage' : 'Application pack not yet sent' })),
      ...decide.rows.map((r) => ({ kind: 'decide', jobId: r.job_id, client: r.client, location: r.location,
        when: null, text: 'At final validation: run the issuance check and decide' })),
    ];
    res.json({ reminders, activity: activity.rows, mailConfigured: mailConfigured() });
  }));

  // ── the non-compliance report: what goes to the client after the visit ──
  async function nonComplianceData(id) {
    const j = await db.query(`
      SELECT j.id, j.stage, cl.legal_name AS client, l.name AS location, s.address,
             i.inspected_at, u.full_name AS certifier
      FROM job j JOIN client cl ON cl.id = j.client_id
      LEFT JOIN hs_location l ON l.id = j.hs_location_id LEFT JOIN site s ON s.id = l.site_id
      LEFT JOIN LATERAL (SELECT inspected_at, certifier_id FROM inspection WHERE job_id = j.id ORDER BY inspected_at DESC LIMIT 1) i ON true
      LEFT JOIN app_user u ON u.id = i.certifier_id
      WHERE j.id = $1`, [id]);
    if (!j.rows.length) return null;
    const items = await db.query(`
      SELECT t.title AS sheet, COALESCE(ci.number, ci.ordinal::text) AS number, ci.action, ci.regulation_raw AS regulation,
             f.id AS finding_id, f.failure_reason AS reason, f.comment
      FROM finding f JOIN inspection ins ON ins.id = f.inspection_id
      JOIN checksheet_item ci ON ci.id = f.item_id JOIN checksheet_section cs ON cs.id = ci.section_id
      JOIN checksheet_template t ON t.id = cs.template_id
      WHERE ins.job_id = $1 AND f.status = 'non_compliant' ORDER BY t.code, cs.ordinal, ci.ordinal`, [id]);
    const cas = await db.query(`
      SELECT ca.finding_id, ca.severity, ca.description, ca.due_date AS "dueDate", ca.status
      FROM corrective_action ca JOIN finding f ON f.id = ca.finding_id JOIN inspection i ON i.id = f.inspection_id
      WHERE i.job_id = $1 ORDER BY ca.id`, [id]);
    const row = j.rows[0];
    return {
      job: { id: row.id, client: row.client, location: row.location, address: row.address,
             inspectedAt: row.inspected_at, certifier: row.certifier, stage: row.stage },
      items: items.rows.map((it) => ({ ...it, actions: cas.rows.filter((c) => c.finding_id === it.finding_id) })),
    };
  }

  app.get('/api/jobs/:id/non-compliance.html', wrap(async (req, res) => {
    const data = await nonComplianceData(Number(req.params.id));
    if (!data) return res.status(404).json({ error: 'job not found' });
    res.type('html').send(renderNonComplianceReport({ ...data, letterhead: letterheadImages() }));
  }));

  // ── send a document to the client, and record that it went ──────────────
  app.post('/api/jobs/:id/send', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { document, to, subject } = req.body ?? {};
    if (!canRecord(req.ctx.role)) return res.status(403).json({ error: 'a viewer cannot send', clause: 'Role' });
    if (!to || !/^[^@\s]+@[^@\s]+$/.test(to)) return res.status(400).json({ error: 'a recipient email is required' });
    let html, label;
    if (document === 'certificate') {
      if (!canDecide(req.ctx.role)) return res.status(403).json({ error: 'sending a certificate needs a compliance certifier', clause: 'Role' });
      const r = await fetchCertificateHtml(id);
      if (!r) return res.status(404).json({ error: 'no certificate issued for this job' });
      html = r; label = 'certificate';
    } else if (document === 'non_compliance') {
      const data = await nonComplianceData(id);
      if (!data) return res.status(404).json({ error: 'job not found' });
      html = renderNonComplianceReport({ ...data, letterhead: letterheadImages() }); label = 'non-compliance report';
    } else {
      return res.status(400).json({ error: "document must be 'certificate' or 'non_compliance'" });
    }
    const result = await sendMail({ to, subject: subject ?? `Assure Safety: ${label}`, html,
      text: `Please find the ${label} attached.`, attachments: [{ filename: `${label.replace(/ /g, '-')}.html`, content: html }] });
    const summary = result.sent
      ? `Emailed the ${label} to ${to}`
      : `Prepared the ${label} for ${to} (email not sent: ${result.reason})`;
    await db.query(
      `INSERT INTO communication (job_id, direction, medium, party, summary, occurred_at, recorded_by)
       VALUES ($1,'outbound','email',$2,$3,now(),$4)`,
      [id, to, summary, req.ctx.userId ?? null]);
    res.json({ ...result, summary });
  }));

  // ── import a job that already exists on paper (a past workbook) ─────────
  app.post('/api/jobs/import', wrap(async (req, res) => {
    const b = req.body ?? {};
    if (!canDecide(req.ctx.role)) return res.status(403).json({ error: 'importing a job needs a compliance certifier', clause: 'Role' });
    if (!b.client?.legalName || !b.site?.address || !b.location?.name) {
      return res.status(400).json({ error: 'client.legalName, site.address and location.name are required' });
    }
    const classKey = b.classKey ?? 'class_6_8';
    const created = await db.withTx((tx) => createJob(tx, { ...b, classKey }));
    const target = b.stage ?? 'site_inspection';
    const path = ['application', 'document_review', 'site_inspection', 'compliance_evaluation', 'final_validation'];
    const stop = path.indexOf(target);
    const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: b.inspection?.inspectedAt ?? new Date().toISOString() });
    const events = [
      ...path.slice(0, Math.max(0, Math.min(stop, 2)) + 1).map((st) => ev('job.transition', { jobId: created.jobId, toStage: st, reason: 'imported from workbook' })),
      ev('inspection.open', { jobId: created.jobId, hsLocationId: created.hsLocationId,
        inspectedAt: b.inspection?.inspectedAt, equipmentUsed: b.inspection?.equipmentUsed ?? 'iPad, tape measure',
        templateCodes: templatesForClass(classKey) }),
    ];
    const ctx = { deviceId: 'import', userId: req.ctx.userId, role: req.ctx.role };
    const first = await db.withTx((tx) => applyEvents(tx, ctx, events));
    if (first.rejected.length) return res.status(422).json({ error: 'import stopped', rejected: first.rejected, jobId: created.jobId });
    const inspectionId = first.applied.find((a) => a.type === 'inspection.open')?.result?.inspectionId;
    const findings = (b.findings ?? []).map((f) => ev('finding.upsert', {
      inspectionId, templateCode: f.templateCode, sectionOrdinal: f.sectionOrdinal, itemOrdinal: f.itemOrdinal,
      status: f.status ?? 'pending', comment: f.comment ?? null, verificationMethod: f.verificationMethod ?? null,
      failureReason: f.failureReason ?? null, decidedAt: b.inspection?.inspectedAt,
    }));
    const second = findings.length ? await db.withTx((tx) => applyEvents(tx, ctx, findings)) : { applied: [], rejected: [] };
    const later = stop > 2
      ? await db.withTx((tx) => applyEvents(tx, ctx, path.slice(3, stop + 1).map((st) => ev('job.transition', { jobId: created.jobId, toStage: st, reason: 'imported from workbook' }))))
      : { rejected: [] };
    res.status(201).json({ jobId: created.jobId, inspectionId, findings: second.applied.length,
      rejected: [...second.rejected, ...later.rejected] });
  }));

  // ── evidence bytes ───────────────────────────────────────────────────────
  // Content-addressed: the client hashes at capture, the server verifies the
  // hash on receipt, and the object is stored under it. The evidence.attach
  // sync event then references the sha256 — same key on both sides.
  app.post('/api/evidence/upload', express.raw({ type: '*/*', limit: '4mb' }), wrap(async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'empty body' });
    const mime = req.header('content-type') ?? 'application/octet-stream';
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const claimed = req.header('x-sha256');
    if (claimed && claimed.toLowerCase() !== sha256) {
      // The device's hash-at-capture disagrees with what arrived. Refuse it —
      // an evidence record whose bytes do not match their hash is worse than none.
      return res.status(409).json({ error: 'sha256 mismatch: bytes differ from the hash computed at capture',
                                    clause: 'IPS 21(4)', claimed, received: sha256 });
    }
    const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg'
              : mime.includes('mp4') ? 'mp4' : mime.includes('pdf') ? 'pdf' : 'bin';
    const stored = await storeEvidence(sha256, ext, buf, mime);
    res.status(201).json({ sha256, bytes: buf.length, mime, ...stored });
  }));

  app.get('/api/evidence/:key', wrap(async (req, res) => {
    const found = await readEvidence(req.params.key);
    if (!found) return res.status(404).json({ error: 'not found' });
    const ext = req.params.key.split('.').pop();
    res.type(found.mime ?? (ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'application/octet-stream'));
    res.send(found.buf);
  }));

  // ── sync: the offline contract ───────────────────────────────────────────
  app.get('/api/sync/event-types', (_req, res) => res.json(EVENT_TYPES));

  app.post('/api/sync', wrap(async (req, res) => {
    const { deviceId, userId, events } = req.body ?? {};
    // The signed-in user outranks whatever the body claims (IPS 21(5)).
    const ctx = { deviceId: deviceId ?? req.ctx.deviceId,
                  userId: req.ctx.authenticated ? req.ctx.userId : (userId ?? req.ctx.userId),
                  role: req.ctx.role };
    if (!ctx.deviceId) return res.status(400).json({ error: 'deviceId is required' });
    if (!Array.isArray(events)) return res.status(400).json({ error: 'events must be an array' });
    for (const ev of events) {
      if (!ev?.id || !ev?.type)
        return res.status(400).json({ error: 'every event needs a client-generated id and a type' });
    }
    const result = await db.withTx((tx) => applyEvents(tx, ctx, events));
    res.json({ ...result, serverTime: new Date().toISOString() });
  }));

  // ── errors ───────────────────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    const why = explain(err.cause ?? err);
    const status = isClientError(err.cause ?? err) ? 422 : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: why.reason, clause: why.clause, code: why.code });
  });

  return app;
}

class ROLLBACK_SENTINEL extends Error {}
