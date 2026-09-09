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

// The certificate renderer lives in packages/checksheets; vendored on Vercel.
const renderMod = await import(
  pathToFileURL(assetPath('lib/render-certificate.mjs', 'packages/checksheets/lib/render-certificate.mjs')).href
);
const { renderCertificateHtml, CERTIFICATE_DEFAULTS } = renderMod;

/** Evidence bytes: Vercel Blob when a token is present, local disk otherwise. */
async function storeEvidence(sha256, ext, buf, mime) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const key = `evidence/${sha256}.${ext}`;
    const b = await put(key, buf, { access: 'public', addRandomSuffix: false, contentType: mime });
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
    const { head } = await import('@vercel/blob');
    const meta = await head(storageKey).catch(() => null);
    if (!meta) return null;
    const r = await fetch(meta.url);
    return { buf: Buffer.from(await r.arrayBuffer()), mime: meta.contentType };
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

export function buildApp(db, { allowedOrigin } = {}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cors({ origin: allowedOrigin ?? true, credentials: true }));

  // Until real auth lands, identity comes from headers the app sets. This is
  // deliberately a single place to replace.
  app.use((req, _res, next) => {
    req.ctx = {
      deviceId: req.header('x-device-id') ?? null,
      userId: req.header('x-user-id') ? Number(req.header('x-user-id')) : null,
    };
    next();
  });

  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  // ── health ───────────────────────────────────────────────────────────────
  app.get('/api/health', wrap(async (_req, res) => {
    const r = await db.query('SELECT count(*)::int AS n FROM checksheet_item');
    res.json({ ok: true, db: db.kind, templateItems: r.rows[0].n });
  }));

  // ── templates: the canonical check sheets, from the database ─────────────
  // The app ships these compiled in; this endpoint lets it confirm its bundle
  // matches what the server holds before an inspection begins.
  app.get('/api/templates', wrap(async (_req, res) => {
    const r = await db.query(`
      SELECT t.code, t.revision, t.title, t.status, t.class_scope,
             count(i.id)::int AS item_count
      FROM checksheet_template t
      LEFT JOIN checksheet_section s ON s.template_id = t.id
      LEFT JOIN checksheet_item i ON i.section_id = s.id
      GROUP BY t.id ORDER BY t.code, t.revision`);
    res.json(r.rows);
  }));

  app.get('/api/templates/:code', wrap(async (req, res) => {
    const t = await db.query(
      `SELECT id, code, revision, title, status, class_scope, ps_reference
       FROM checksheet_template WHERE code = $1 ORDER BY revision DESC LIMIT 1`,
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
  app.get('/api/jobs', wrap(async (_req, res) => {
    const r = await db.query(`
      SELECT j.id, j.stage, j.class_key, j.opened_at,
             c.legal_name AS client, l.name AS location, s.address
      FROM job j
      JOIN client c ON c.id = j.client_id
      LEFT JOIN hs_location l ON l.id = j.hs_location_id
      LEFT JOIN site s ON s.id = l.site_id
      ORDER BY j.opened_at DESC`);
    res.json(r.rows);
  }));

  /** Create a client + site + location + job in one call (stage 1, enquiry). */
  app.post('/api/jobs', wrap(async (req, res) => {
    const b = req.body ?? {};
    if (!b.client?.legalName || !b.site?.address || !b.location?.name)
      return res.status(400).json({ error: 'client.legalName, site.address and location.name are required' });

    const out = await db.withTx(async (tx) => {
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
      return { jobId: j.rows[0].id, clientId: c.rows[0].id, siteId: s.rows[0].id,
               hsLocationId: l.rows[0].id, stage: j.rows[0].stage };
    });
    res.status(201).json(out);
  }));

  /** Everything the app needs to render a job, in one round trip. */
  app.get('/api/jobs/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const j = await db.query(`
      SELECT j.id, j.stage, j.class_key, j.opened_at, j.closed_at,
             json_build_object('id', c.id, 'legalName', c.legal_name, 'tradingName', c.trading_name,
                               'nzbn', c.nzbn, 'companiesNumber', c.companies_number,
                               'postalAddress', c.postal_address) AS client,
             json_build_object('id', l.id, 'name', l.name, 'summary', l.summary,
                               'address', s.address) AS location
      FROM job j
      JOIN client c ON c.id = j.client_id
      LEFT JOIN hs_location l ON l.id = j.hs_location_id
      LEFT JOIN site s ON s.id = l.site_id
      WHERE j.id = $1`, [id]);
    if (!j.rows.length) return res.status(404).json({ error: 'job not found' });

    const [insp, findings, evidence, cert, retention, transitions, interests] = await Promise.all([
      db.query(`SELECT i.id, i.inspected_at, i.equipment_used, i.status, i.certifier_id,
                       i.conducted_by_id, i.supervised,
                       array_agg(t.code ORDER BY t.code) FILTER (WHERE t.code IS NOT NULL) AS template_codes
                FROM inspection i
                LEFT JOIN inspection_template it ON it.inspection_id = i.id
                LEFT JOIN checksheet_template t ON t.id = it.template_id
                WHERE i.job_id = $1 GROUP BY i.id ORDER BY i.inspected_at DESC`, [id]),
      db.query(`SELECT f.id, f.inspection_id, t.code AS template_code, s.ordinal AS section_ordinal,
                       i.ordinal AS item_ordinal, f.status, f.comment, f.verification_method,
                       f.failure_reason, f.decided_at,
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
  app.get('/api/jobs/:id/certificate.html', wrap(async (req, res) => {
    const id = Number(req.params.id);
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
    if (!r.rows.length) return res.status(404).json({ error: 'no certificate issued for this job' });
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
    res.type('html').send(renderCertificateHtml(cert, { signatureDataUrl }));
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
    const ctx = { deviceId: deviceId ?? req.ctx.deviceId, userId: userId ?? req.ctx.userId };
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
