/**
 * HTTP surface. Thin by design: the regulations are enforced in the schema,
 * and the sync handlers own the app↔DB translation. Routes validate shape,
 * call through, and turn rejections into clause-bearing JSON.
 */

import express from 'express';
import cors from 'cors';
import { createHash } from 'crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { applyEvents, EVENT_TYPES } from './sync/apply.mjs';
import { explain, isClientError } from './sync/errors.mjs';
import { assetPath } from './db.mjs';
import { authenticate, hashPasscode, login, logout, tokenFromRequest } from './auth.mjs';
import { canDecide, canRecord } from './roles.mjs';
import { mailConfigured, sendMail } from './mail.mjs';
import { randomUUID } from 'crypto';
import { setAuthorised, validateChoices } from './scope.mjs';
import { checksheetPdf, regulationForClass } from './export/checksheet-pdf.mjs';
import { buildBundleZip, bundleFileName, contentDisposition, exportKey, exportStore } from './export/bundle.mjs';
import { safeFileName } from './export/naming.mjs';
import { isPeerReviewer } from './roles.mjs';
import { certificateHolderId, peerReviewBlocker, peerReviewState } from './peer-review.mjs';

// The certificate renderer lives in packages/checksheets; vendored on Vercel.
const renderMod = await import(
  pathToFileURL(assetPath('lib/render-certificate.mjs', 'packages/checksheets/lib/render-certificate.mjs')).href
);
const { renderCertificateHtml, CERTIFICATE_DEFAULTS, locationWording } = renderMod;
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
/** The sheet set catalogue as loaded (tests add a temporary set to it). */
export const sheetSetCatalogue = SHEET_SETS;
// Whether a set is authorised (its own register entry, or one per scope
// choice) is setAuthorised in scope.mjs.

/** The letterhead images as data URLs, shared by every rendered document. */
function letterheadImages() {
  const brand = (name) => {
    const p = assetPath(`brand/${name}`, `packages/checksheets/brand/${name}`);
    return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null;
  };
  return { logo: brand('logo-white.png'), ribbon: brand('bottom-ribbon.png') };
}

/**
 * S3-compatible object storage (DigitalOcean Spaces). Keys are the SHA-256 of
 * the bytes under evidence/, so a second upload of the same photograph writes
 * the same object again: harmless, and the retry succeeds.
 */
const SPACES = process.env.SPACES_BUCKET
  ? {
      bucket: process.env.SPACES_BUCKET,
      region: process.env.SPACES_REGION ?? 'syd1',
      endpoint: process.env.SPACES_ENDPOINT ?? `https://${process.env.SPACES_REGION ?? 'syd1'}.digitaloceanspaces.com`,
      key: process.env.SPACES_KEY,
      secret: process.env.SPACES_SECRET,
    }
  : null;
let s3Client = null;
async function s3() {
  if (s3Client) return s3Client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: SPACES.region,
    endpoint: SPACES.endpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: SPACES.key, secretAccessKey: SPACES.secret },
  });
  return s3Client;
}

/** Evidence bytes: Spaces, Vercel Blob or local disk, chosen by env. */
async function storeEvidence(sha256, ext, buf, mime) {
  if (SPACES) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const key = `evidence/${sha256}.${ext}`;
    await (await s3()).send(new PutObjectCommand({ Bucket: SPACES.bucket, Key: key, Body: buf, ContentType: mime, ACL: 'private' }));
    return { storageKey: key, url: null, backend: 'spaces' };
  }
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
  // Only a content-addressed key is ever read: a value from the evidence
  // table is not trusted as a path (review, 19 Oct 2026).
  const bareKey = String(storageKey ?? '').replace(/^evidence\//, '');
  if (!/^[0-9a-f]{16,64}(\.[a-z0-9]{1,4})?$/.test(bareKey)) return null;
  storageKey = bareKey;
  if (SPACES) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const Key = storageKey.startsWith('evidence/') ? storageKey : 'evidence/' + storageKey;
    try {
      const r = await (await s3()).send(new GetObjectCommand({ Bucket: SPACES.bucket, Key }));
      const buf = Buffer.from(await r.Body.transformToByteArray());
      return { buf, mime: r.ContentType ?? null };
    } catch (e) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
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

// ── evidence: PDFs and large files (scope of work 19 Oct 2026) ─────────────
// Photos and PDFs are accepted as evidence. A Vercel function body stops at
// 4.5 MB, so with Blob or Spaces the device PUTs the bytes straight to
// storage through a short-lived presigned URL, then asks the server to
// confirm: the server reads the stored object back, hashes it itself and
// deletes it on a mismatch (IPS 21(4)). On disk (tests, local, DigitalOcean
// without Spaces) the bytes still come through POST /api/evidence/upload.

export const EVIDENCE_MIME = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' });
export const EVIDENCE_MAX_BYTES = 50 * 1024 * 1024;
/** Vercel's function body limit is 4.5 MB; elsewhere the server takes up to the evidence cap. */
const SERVER_UPLOAD_LIMIT = process.env.VERCEL ? 4 * 1024 * 1024 : EVIDENCE_MAX_BYTES;
const PUT_TTL_MS = 15 * 60 * 1000;
/** A job bundle is built in memory; beyond this it is refused (413). */
const BUNDLE_MAX_BYTES = 150 * 1024 * 1024;
const LINK_TTL_MS = 10 * 60 * 1000;
const EVIDENCE_KEY_RE = /^[0-9a-f]{64}\.[a-z0-9]{1,4}$/;

/** "image/JPG; charset=x" → "image/jpeg"; null when nothing usable. */
export function normaliseEvidenceMime(m) {
  if (typeof m !== 'string') return null;
  const t = m.split(';')[0].trim().toLowerCase();
  return t === 'image/jpg' || t === 'image/pjpeg' ? 'image/jpeg' : t || null;
}
const bareEvidenceKey = (k) => String(k).replace(/^evidence\//, '');
const fullEvidenceKey = (k) => 'evidence/' + bareEvidenceKey(k);

/** Hash an async iterable of byte chunks without holding it all in memory. */
async function hashStream(chunks) {
  const h = createHash('sha256');
  let bytes = 0;
  for await (const c of chunks) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    bytes += b.length;
    h.update(b);
  }
  return { sha256: h.digest('hex'), bytes };
}

const evidenceDir = () =>
  process.env.EVIDENCE_DIR ??
  (process.env.VERCEL ? '/tmp/evidence' : join(process.cwd(), 'data', 'evidence'));

/**
 * An evidence store is { name, direct, presignPut, presignGet, hashStored, remove }.
 * `direct` stores take the bytes from the device (presignPut); the others take
 * them through the server's own upload route. Each backend's SDK is injectable
 * so the presign branch is tested without touching real storage.
 */
export function diskEvidenceStore() {
  return {
    name: 'disk',
    direct: false,
    async presignPut() { throw new Error('disk storage takes uploads through /api/evidence/upload'); },
    async stat(key) {
      const file = join(evidenceDir(), bareEvidenceKey(key));
      return existsSync(file) ? { bytes: statSync(file).size } : null;
    },
    // Not a presigned URL: the server's own route, which needs the session.
    async presignGet(key) { return { url: `/api/evidence/${bareEvidenceKey(key)}`, expiresAt: null }; },
    async hashStored(key) {
      const file = join(evidenceDir(), bareEvidenceKey(key));
      if (!existsSync(file)) return null;
      return { ...(await hashStream(createReadStream(file))), mime: null };
    },
    async remove(key) { rmSync(join(evidenceDir(), bareEvidenceKey(key)), { force: true }); },
  };
}

/** Vercel Blob, private store. `sdk` defaults to @vercel/blob. */
export function blobEvidenceStore({ sdk } = {}) {
  const lib = async () => sdk ?? (await import('@vercel/blob'));
  return {
    name: 'vercel-blob',
    direct: true,
    async presignPut({ key, mime, bytes, validUntil }) {
      const b = await lib();
      const pathname = fullEvidenceKey(key);
      // Scoped to this one object, this one type, this many bytes, for 15 minutes.
      const token = await b.issueSignedToken({
        pathname, operations: ['put'], validUntil, allowedContentTypes: [mime], maximumSizeInBytes: bytes,
      });
      const { presignedUrl } = await b.presignUrl(token, {
        operation: 'put', access: 'private', pathname, validUntil,
        allowedContentTypes: [mime], maximumSizeInBytes: bytes,
        // Never overwrite: an object already stored is evidence on record.
        // upload-url answers "exists" for it instead of signing a PUT.
        addRandomSuffix: false, allowOverwrite: false,
      });
      // The headers @vercel/blob's own put() sends with a presigned URL.
      const headers = {
        'x-vercel-blob-access': 'private',
        'x-content-type': mime,
        'x-add-random-suffix': '0',
        'x-allow-overwrite': '0',
        'x-api-version': process.env.VERCEL_BLOB_API_VERSION_OVERRIDE ?? '12',
      };
      try { headers['x-vercel-blob-store-id'] = b.parseStoreIdFromDelegationToken(token.delegationToken); } catch { /* optional */ }
      return { url: presignedUrl, headers };
    },
    async presignGet(key, validUntil) {
      const b = await lib();
      const pathname = fullEvidenceKey(key);
      const token = await b.issueSignedToken({ pathname, operations: ['get'], validUntil });
      const { presignedUrl } = await b.presignUrl(token, { operation: 'get', access: 'private', pathname, validUntil });
      return { url: presignedUrl, expiresAt: new Date(validUntil).toISOString() };
    },
    async hashStored(key) {
      const b = await lib();
      const r = await b.get(fullEvidenceKey(key), { access: 'private', useCache: false }).catch(() => null);
      if (!r || r.statusCode !== 200 || !r.stream) return null;
      return { ...(await hashStream(r.stream)), mime: r.blob?.contentType ?? null };
    },
    async remove(key) { await (await lib()).del(fullEvidenceKey(key)); },
    async stat(key) {
      const h = await (await lib()).head(fullEvidenceKey(key)).catch(() => null);
      return h ? { bytes: h.size } : null;
    },
  };
}

/** DigitalOcean Spaces (S3). `client`, `getSignedUrl` and `commands` are injectable. */
export function spacesEvidenceStore({ bucket, client, getSignedUrl, commands } = {}) {
  let presignClient = null;
  const deps = async () => {
    const cmds = commands ?? (await import('@aws-sdk/client-s3'));
    const sign = getSignedUrl ?? (await import('@aws-sdk/s3-request-presigner')).getSignedUrl;
    if (!client && !presignClient) {
      // A presigned PUT must not carry the SDK's default CRC32 checksum: the
      // device sends plain bytes, and the signature would not match.
      presignClient = new cmds.S3Client({
        region: SPACES.region, endpoint: SPACES.endpoint, forcePathStyle: false,
        credentials: { accessKeyId: SPACES.key, secretAccessKey: SPACES.secret },
        requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
      });
    }
    return { cmds, sign, c: client ?? presignClient };
  };
  const Bucket = bucket ?? SPACES?.bucket;
  return {
    name: 'spaces',
    direct: true,
    async presignPut({ key, mime, bytes, validUntil }) {
      const { cmds, sign, c } = await deps();
      const expiresIn = Math.max(60, Math.floor((validUntil - Date.now()) / 1000));
      // ContentLength is signed: the device cannot store more than it declared.
      const url = await sign(c, new cmds.PutObjectCommand({ Bucket, Key: fullEvidenceKey(key), ContentType: mime, ContentLength: bytes }), { expiresIn });
      return { url, headers: { 'content-type': mime } };
    },
    async presignGet(key, validUntil) {
      const { cmds, sign, c } = await deps();
      const expiresIn = Math.max(60, Math.floor((validUntil - Date.now()) / 1000));
      const url = await sign(c, new cmds.GetObjectCommand({ Bucket, Key: fullEvidenceKey(key) }), { expiresIn });
      return { url, expiresAt: new Date(validUntil).toISOString() };
    },
    async hashStored(key) {
      const { cmds, c } = await deps();
      try {
        const r = await c.send(new cmds.GetObjectCommand({ Bucket, Key: fullEvidenceKey(key) }));
        return { ...(await hashStream(r.Body)), mime: r.ContentType ?? null };
      } catch (e) {
        if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async remove(key) {
      const { cmds, c } = await deps();
      await c.send(new cmds.DeleteObjectCommand({ Bucket, Key: fullEvidenceKey(key) }));
    },
    async stat(key) {
      const { cmds, c } = await deps();
      try {
        const r = await c.send(new cmds.HeadObjectCommand({ Bucket, Key: fullEvidenceKey(key) }));
        return { bytes: Number(r.ContentLength ?? 0) };
      } catch (e) {
        if (e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
  };
}

/** The store the environment names: Spaces, then Blob, then disk (as storeEvidence). */
export function defaultEvidenceStore() {
  if (SPACES) return spacesEvidenceStore();
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobEvidenceStore();
  return diskEvidenceStore();
}

/** Routes a device may call before it has signed in. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/templates', '/api/sync/event-types']);
const isPublic = (req) =>
  PUBLIC_PATHS.has(req.path) || req.path.startsWith('/api/templates/') || !req.path.startsWith('/api/');

export function buildApp(db, { allowedOrigin, requireAuth = process.env.AUTH_REQUIRED === '1', evidenceStore } = {}) {
  const app = express();
  const evidenceBackend = evidenceStore ?? defaultEvidenceStore();
  app.use(express.json({ limit: '2mb' }));
  // A signed link carries ?token= (documents opened in a new tab); never let
  // the browser pass that address on to another site.
  app.use((_req, res, next) => { res.set('Referrer-Policy', 'no-referrer'); next(); });
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

  // A route id that is not a positive integer is "not found", not a cast error.
  app.param('id', (req, res, next, v) => (/^[1-9][0-9]{0,17}$/.test(v) ? next() : res.status(404).json({ error: 'not found' })));

  // ── the peer reviewer's separate access (Tatenda Katai, 20 Oct 2026, Q5) ─
  // Only jobs flagged for a reg 17.91 peer review exist for them: their
  // sheets, evidence and documents to read; everything else is hidden (404)
  // or refused (403, clause Role). Their two events go through /api/sync,
  // where roles.mjs holds them to peer_review.comment and peer_review.decide.
  app.use((req, res, next) => (async () => {
    if (!isPeerReviewer(req.ctx?.role)) return next();
    const p = req.path;
    if (!p.startsWith('/api/') || isPublic(req) || p.startsWith('/api/auth/')) return next();
    const refuse = () => res.status(403).json({ error: 'a peer reviewer reads the flagged jobs, comments and decides the peer review; nothing else', clause: 'Role' });
    const isGet = req.method === 'GET';
    if (p === '/api/sync' && req.method === 'POST') return next();
    if (isGet && ['/api/jobs', '/api/dashboard', '/api/sheet-sets', '/api/authorisation'].includes(p)) return next();
    const jm = p.match(/^\/api\/jobs\/([1-9][0-9]{0,17})(\/.*)?$/);
    if (jm) {
      if (!(isGet || (req.method === 'POST' && jm[2] === '/bundle'))) return refuse();
      const ok = await db.query(`SELECT 1 FROM job WHERE id = $1 AND peer_review_required`, [jm[1]]);
      return ok.rows.length ? next() : res.status(404).json({ error: 'job not found' });
    }
    const em = p.match(/^\/api\/evidence\/([0-9a-f]{64}\.[a-z0-9]{1,4})(\/link)?$/);
    if (em && isGet) {
      const ok = await db.query(
        `SELECT 1 FROM evidence e JOIN job j ON j.id = e.job_id
         WHERE e.storage_key IN ($1, $2) AND j.peer_review_required LIMIT 1`, [em[1], `evidence/${em[1]}`]);
      return ok.rows.length ? next() : res.status(404).json({ error: 'not found' });
    }
    return refuse();
  })().catch(next));

  // ── auth ─────────────────────────────────────────────────────────────────
  app.post('/api/auth/login', wrap(async (req, res) => {
    const b = req.body ?? {};
    if (!b.passcode) return res.status(400).json({ error: 'passcode is required' });
    const out = await login(db, { email: b.email, passcode: b.passcode, deviceId: b.deviceId ?? req.ctx.deviceId });
    if (!out) return res.status(401).json({ error: 'email or passcode not recognised' });
    res.json({ ...out, user: { ...out.user, ...(await personFlags(out.user.id)) } });
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
               role: u.role, authorisationNumber: u.authorisation_number, authenticated: req.ctx.authenticated,
               ...(await personFlags(u.id)) });
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
    res.json({ ok: true, db: db.kind, templateItems: r.rows[0].n , evidence: SPACES ? 'spaces' : process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : 'disk' });
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
  app.get('/api/jobs', wrap(async (req, res) => {
    // Archived clients are off the board; ?archived=1 lists only them.
    const archived = req.query.archived === '1';
    const r = await db.query(`
      SELECT j.id, j.stage, j.class_key, j.opened_at, j.subject, j.peer_review_required,
             c.id AS client_id, (c.archived_at IS NOT NULL) AS client_archived,
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
      WHERE (c.archived_at IS NOT NULL) = $1
      ORDER BY last_activity DESC NULLS LAST, j.id DESC`, [archived]);
    // A peer reviewer's board holds only the jobs flagged for a peer review.
    const rows = isPeerReviewer(req.ctx.role) ? r.rows.filter((row) => row.peer_review_required) : r.rows;
    res.json(rows.map((row) => ({ ...row, kind: kindFor(row.class_key) })));
  }));

  /** Create a client + site + location + job in one call (stage 1, enquiry). */
  /** Client + site + location + job, plus contacts and substances, in one transaction. */
  async function createJob(tx, b) {
      // A picked client (client.id) is reused; a typed name makes a new one.
      const c = b.client.id != null
        ? await tx.query(`SELECT id FROM client WHERE id = $1 AND archived_at IS NULL FOR SHARE`, [b.client.id])
        : await tx.query(
        `INSERT INTO client (legal_name, trading_name, nzbn, companies_number, postal_address, phone, website, industry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [b.client.legalName, b.client.tradingName ?? null, b.client.nzbn ?? null,
         b.client.companiesNumber ?? null, b.client.postalAddress ?? null,
         b.client.phone ?? null, b.client.website ?? null, b.client.industry ?? null]);
      if (!c.rows.length) throw Object.assign(new Error(`client ${b.client.id} not found or archived`), { code: 'P0001' });
      const s = await tx.query(`INSERT INTO site (client_id, address) VALUES ($1,$2) RETURNING id`,
        [c.rows[0].id, b.site.address]);
      const l = await tx.query(
        `INSERT INTO hs_location (site_id, name, summary) VALUES ($1,$2,$3) RETURNING id`,
        [s.rows[0].id, b.location.name, b.location.summary ?? null]);
      const j = await tx.query(
        `INSERT INTO job (client_id, hs_location_id, class_key, scope_choices) VALUES ($1,$2,$3,$4) RETURNING id, stage`,
        [c.rows[0].id, l.rows[0].id, b.classKey ?? null, b.scopeChoices ?? null]);
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
      // Q5: an existing stationary container system on a reg 17.91 report.
      if (b.peerReviewRequired === true) {
        await tx.query(`UPDATE job SET peer_review_required = true WHERE id = $1`, [j.rows[0].id]);
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
    const set = SHEET_SETS.sets.find((x) => x.key === (b.classKey ?? 'class_6_8'));
    if (!set) return res.status(400).json({ error: `unknown check sheet set "${b.classKey}"` });
    if (!setAuthorised(set, AUTHORISATION)) {
      return res.status(400).json({ error: `"${set.name}" is outside the certifier's WorkSafe authorisation`, clause: 'IPS 8' });
    }
    const scope = validateChoices(set, b.scopeChoices);
    if (scope.error) return res.status(400).json({ error: scope.error, clause: 'IPS 8' });
    b.scopeChoices = scope.choices;
    if (b.client.id != null) {
      // The same shape the sync events accept: a positive integer, or its digits.
      const v = b.client.id;
      const id = (Number.isInteger(v) || (typeof v === 'string' && /^[1-9][0-9]{0,14}$/.test(v))) ? Number(v) : NaN;
      const c = Number.isSafeInteger(id) && id > 0
        ? await db.query(`SELECT 1 FROM client WHERE id = $1 AND archived_at IS NULL`, [id]) : { rows: [] };
      if (!c.rows.length) return res.status(400).json({ error: 'that client is not on the list (unknown or archived); pick another or type a new name' });
      b.client.id = id;
    }
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
    if (!canRecord(req.ctx.role)) return res.status(403).json({ error: 'a viewer cannot record', clause: 'Role' });
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
        contacts += (r.rowCount ?? r.affectedRows ?? 0);
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
          substances += (r.rowCount ?? r.affectedRows ?? 0);
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
      SELECT j.id, j.stage, j.class_key, j.opened_at, j.closed_at, j.subject, j.scope_choices,
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
           correctiveActions, allowedNext, communications, events, units, excluded] = await Promise.all([
      db.query(`SELECT i.id, i.inspected_at, i.equipment_used, i.status, i.certifier_id,
                       i.conducted_by_id, i.supervised,
                       i.declaration_signed_at, i.declaration_signed_by,
                       (SELECT full_name FROM app_user WHERE id = i.declaration_signed_by) AS declaration_signed_by_name,
                       (SELECT full_name FROM app_user WHERE id = i.scope_confirmed_by) AS scope_confirmed_by_name,
                       i.scope_confirmed_at, i.scope_confirmed_by,
                       array_agg(t.code ORDER BY t.code) FILTER (WHERE t.code IS NOT NULL) AS template_codes
                FROM inspection i
                LEFT JOIN inspection_template it ON it.inspection_id = i.id
                LEFT JOIN checksheet_template t ON t.id = it.template_id
                WHERE i.job_id = $1 GROUP BY i.id ORDER BY i.inspected_at DESC`, [id]),
      db.query(`SELECT f.id, f.inspection_id, t.code AS template_code, s.ordinal AS section_ordinal,
                       i.ordinal AS item_ordinal, f.status, f.comment, f.verification_method,
                       f.failure_reason, f.general_comment, f.na_reason, f.decided_at, f.updated_at,
                       (SELECT count(*)::int FROM evidence e WHERE e.finding_id = f.id) AS evidence_count
                FROM finding f
                JOIN inspection ins ON ins.id = f.inspection_id
                JOIN checksheet_item i ON i.id = f.item_id
                JOIN checksheet_section s ON s.id = i.section_id
                JOIN checksheet_template t ON t.id = s.template_id
                WHERE ins.job_id = $1 ORDER BY t.code, s.ordinal, i.ordinal`, [id]),
      db.query(`SELECT id, finding_id, kind, sha256, storage_key, original_name, mime, bytes, provenance,
                       captured_by_name, captured_by_occupation, captured_at, captured_where, retain_until
                FROM evidence WHERE job_id = $1 ORDER BY created_at`, [id]),
      db.query(`SELECT id, decision, register_number, certificate_number, issue_date, in_force_date,
                       expiry_date, conditions, conditions_due, requirements_not_met, worksafe_register_due
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
                       (SELECT full_name FROM app_user WHERE id = ca.reverified_by) AS reverified_by_name,
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
                WHERE int_or_null(e.payload->>'jobId') = $1
                   OR int_or_null(e.payload->>'inspectionId') IN (SELECT id FROM inspection WHERE job_id = $1)
                   OR int_or_null(e.payload->>'correctiveActionId') IN (
                        SELECT ca.id FROM corrective_action ca JOIN finding f ON f.id = ca.finding_id
                        JOIN inspection i ON i.id = f.inspection_id WHERE i.job_id = $1)
                ORDER BY e.occurred_at DESC, e.received_at DESC LIMIT 100`, [id]),
      db.query(`SELECT id, ordinal, fields, updated_at FROM job_unit WHERE job_id = $1 ORDER BY ordinal`, [id]),
      // Sections this job does not assess (scope choices not picked, work outside the authorisation).
      db.query(`SELECT x.inspection_id, t.code AS template_code, s.ordinal AS section_ordinal, x.reason
                FROM inspection_section_excluded x
                JOIN inspection i ON i.id = x.inspection_id
                JOIN checksheet_section s ON s.id = x.section_id
                JOIN checksheet_template t ON t.id = s.template_id
                WHERE i.job_id = $1 ORDER BY t.code, s.ordinal`, [id]),
    ]);

    const review = await peerReviewPayload(id);
    const counts = findings.rows.reduce((a, f) => ((a[f.status] = (a[f.status] ?? 0) + 1), a), {});
    res.json({
      ...review,
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
      excludedSections: excluded.rows,
      // What the latest inspection must answer: its pinned sheets less the
      // sections outside the job's scope. Null before an inspection opens.
      itemsInScope: insp.rows.length
        ? (await db.query(`SELECT count(*)::int AS n FROM inspection_item_in_scope WHERE inspection_id = $1`, [insp.rows[0].id])).rows[0].n
        : null,
      kind: kindFor(j.rows[0].class_key),
    });
  }));

  /**
   * Dry-run the issuance guards without mutating anything. This is what makes
   * the app's "Can grant / Cannot grant" pill server-authoritative rather than
   * a local guess — the same PL/pgSQL that will block the real transition.
   */
  /**
   * Open non-compliances as the lines of "requirements not met":
   * "General 4.4 (reg 2.6(3)): <reason>", with the regulation the job's class
   * cites for that item.
   */
  async function openRequirements(jobId) {
    const r = await db.query(`
      SELECT j.class_key, t.code, cs.ordinal AS s, ci.ordinal AS i, COALESCE(ci.number, ci.ordinal::text) AS number,
             cs.number AS section_number, ci.regulation_raw, ci.regulation_refs_by_class, f.failure_reason, f.comment
      FROM finding_in_scope f JOIN inspection ins ON ins.id = f.inspection_id JOIN job j ON j.id = ins.job_id
      JOIN checksheet_item ci ON ci.id = f.item_id JOIN checksheet_section cs ON cs.id = ci.section_id
      JOIN checksheet_template t ON t.id = cs.template_id
      LEFT JOIN corrective_action ca ON ca.finding_id = f.id
      WHERE ins.job_id = $1 AND f.status = 'non_compliant' AND (ca.id IS NULL OR ca.status <> 'verified')
      ORDER BY t.code <> 'wks17-general', t.code, cs.ordinal, ci.ordinal`, [jobId]);
    return r.rows.map((x) => {
      const sheet = x.code.endsWith('-general') ? 'General' : 'Class sheet';
      const reg = regulationForClass(x, x.class_key);
      const why = x.failure_reason || x.comment || 'not met';
      return `${sheet} ${x.s}.${x.i}${reg ? ` (reg ${reg})` : ''}: ${why}`;
    });
  }

  /** Non-compliant findings with no verified corrective action. */
  async function unresolvedNonCompliances(jobId) {
    const nc = await db.query(`
      SELECT count(*)::int AS n
      FROM finding_in_scope f JOIN inspection i ON i.id = f.inspection_id
      LEFT JOIN corrective_action ca ON ca.finding_id = f.id
      WHERE i.job_id = $1 AND f.status = 'non_compliant'
        AND (ca.id IS NULL OR ca.status <> 'verified')`, [jobId]);
    return nc.rows[0].n;
  }

  /**
   * Phase 2, package B on the job payload: the peer review (state, decisions,
   * comment thread), the conditions of a conditional certificate, and who
   * actually issued a certificate that names the holder.
   */
  async function peerReviewPayload(jobId) {
    const pr = await peerReviewState(db, jobId);
    const [reviews, comments, conditions, issuer] = await Promise.all([
      db.query(`SELECT p.id, p.decision, p.comment, p.snapshot_hash, p.decided_at, p.reviewer_id,
                       u.full_name AS reviewer_name
                FROM peer_review p LEFT JOIN app_user u ON u.id = p.reviewer_id
                WHERE p.job_id = $1 ORDER BY p.id`, [jobId]),
      db.query(`SELECT c.id, c.finding_id, c.body, c.created_at, c.author_id,
                       u.full_name AS author_name, u.role AS author_role,
                       t.code AS template_code, s.ordinal AS section_ordinal, i.ordinal AS item_ordinal
                FROM peer_review_comment c
                LEFT JOIN app_user u ON u.id = c.author_id
                LEFT JOIN finding f ON f.id = c.finding_id
                LEFT JOIN checksheet_item i ON i.id = f.item_id
                LEFT JOIN checksheet_section s ON s.id = i.section_id
                LEFT JOIN checksheet_template t ON t.id = s.template_id
                WHERE c.job_id = $1 ORDER BY c.id`, [jobId]),
      db.query(`SELECT cc.id, cc.ordinal, cc.text, cc.regulation, cc.due_date, cc.verified_by, cc.verified_at,
                       cc.verification_note, u.full_name AS verified_by_name,
                       (cc.verified_at IS NULL AND cc.due_date IS NOT NULL AND cc.due_date < CURRENT_DATE) AS overdue
                FROM certificate_condition cc JOIN certificate c ON c.id = cc.certificate_id
                LEFT JOIN app_user u ON u.id = cc.verified_by
                WHERE c.job_id = $1 ORDER BY cc.ordinal`, [jobId]),
      db.query(`SELECT ib.full_name AS issued_by, h.full_name AS holder, h.authorisation_number AS holder_number
                FROM certificate c LEFT JOIN app_user ib ON ib.id = c.issued_by
                LEFT JOIN app_user h ON h.id = c.certifier_id WHERE c.job_id = $1`, [jobId]),
    ]);
    return {
      peerReviewRequired: pr.required,
      peerReviewState: pr.state,
      peerReviews: reviews.rows.map((r) => ({ ...r, current: pr.currentHash != null && String(r.snapshot_hash).trim() === pr.currentHash })),
      peerReviewComments: comments.rows,
      conditions: conditions.rows,
      certificateIssuedBy: issuer.rows[0]?.issued_by ?? null,
      certificateHolder: issuer.rows[0] ? { name: issuer.rows[0].holder, authorisationNumber: issuer.rows[0].holder_number } : null,
      // The number a new certificate is prefixed with (IPS 8(1)(c)): the
      // holder's, whoever issues.
      holderAuthorisationNumber: AUTHORISATION.certifier?.number ?? null,
    };
  }

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
      FROM finding_in_scope f JOIN inspection i ON i.id = f.inspection_id
      LEFT JOIN corrective_action ca ON ca.finding_id = f.id
      WHERE i.job_id = $1 AND f.status = 'non_compliant'
        AND (ca.id IS NULL OR ca.status <> 'verified')`, [id]);
    // Q5: a flagged job needs the peer reviewer's approval of it as it stands.
    const pr = await peerReviewState(db, id);
    const prBlocker = peerReviewBlocker(pr.state);
    if (prBlocker) blockers.push(prBlocker);
    res.json({
      peerReviewState: pr.state,
      canGrant: blockers.length === 0 && nc.rows[0].n === 0,
      canIssueConditional: blockers.length === 0,
      unresolvedNonCompliances: nc.rows[0].n,
      blockers,
    });
  }));

  /**
   * An action taken through a REST route rather than a sync event (issuing,
   * sending) still goes into the event log, by person, so the audit trail has
   * one place to look (IPS 21(5), 22; scope of work 19 Oct 2026, C4).
   */
  async function recordServerEvent(q, req, type, payload, result = null) {
    await q.query(`INSERT INTO device (id, label, platform) VALUES ('server', 'Server', 'server') ON CONFLICT (id) DO NOTHING`);
    await q.query(
      `INSERT INTO sync_event (id, device_id, user_id, type, payload, occurred_at, outcome, result)
       VALUES ($1, 'server', $2, $3, $4, now(), 'applied', $5)`,
      [randomUUID(), req.ctx.userId ?? null, type, JSON.stringify(payload), result == null ? null : JSON.stringify(result)]);
  }

  /** Issue the certificate. The stage transition and the insert share one transaction. */
  app.post('/api/jobs/:id/certificate', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    if (!canDecide(req.ctx.role)) {
      return res.status(403).json({ error: 'issuing a certificate needs a compliance certifier', clause: 'Role' });
    }
    if (b.inspectionId != null) {
      const own = await db.query(`SELECT 1 FROM inspection WHERE id = $1 AND job_id = $2`, [b.inspectionId, id]);
      if (!own.rows.length) return res.status(400).json({ error: `inspection ${b.inspectionId} is not part of job ${id}` });
    }
    // Q5: a job on a reg 17.91 report issues only after the peer reviewer
    // approved it as it stands now (an edit since lapses the approval).
    const prGate = peerReviewBlocker((await peerReviewState(db, id)).state);
    if (prGate) return res.status(422).json({ error: prGate.reason, clause: prGate.clause });
    if (b.decision === 'granted') {
      const open = await unresolvedNonCompliances(id);
      if (open > 0) {
        return res.status(422).json({
          error: `${open} non-compliance${open === 1 ? '' : 's'} not yet verified as closed: a certificate can be conditional or refused, not granted`,
          clause: 'reg 13.39',
        });
      }
    }
    // Reg 6.24(2): a conditional certificate states the date its conditions
    // must be met by, no more than 3 months after issue (and Tatenda, 20 Oct
    // 2026: "it must clearly state the deadline").
    if (b.decision === 'conditional') {
      const due = /^\d{4}-\d{2}-\d{2}$/.test(b.conditionsDue ?? '') ? new Date(`${b.conditionsDue}T00:00:00Z`) : null;
      const issued = new Date(`${String(b.issueDate ?? '').slice(0, 10)}T00:00:00Z`);
      const limit = new Date(issued); limit.setUTCMonth(limit.getUTCMonth() + 3);
      if (!due || Number.isNaN(due.getTime())) {
        return res.status(422).json({ error: 'a conditional certificate needs the date its conditions must be met by', clause: 'reg 6.24(2)' });
      }
      if (due < issued || due > limit) {
        return res.status(422).json({ error: `the conditions must be met within 3 months of issue (by ${limit.toISOString().slice(0, 10)} at the latest)`, clause: 'reg 6.24(2)' });
      }
    }
    // What was not met, frozen with the decision: every open non-compliance,
    // by sheet item and the regulation the job's class cites, with its reason.
    let notMet = Array.isArray(b.requirementsNotMet) ? b.requirementsNotMet.filter(Boolean) : [];
    if (b.decision !== 'granted' && !notMet.length) notMet = await openRequirements(id);
    // Q6: every certificate is in the holder's name (Bryan Wilson, TST100250);
    // issued_by and the event log record who pressed Issue.
    const issuer = req.ctx.userId ?? b.certifierId ?? null;
    const holder = await certificateHolderId(db, { authorisationNumber: AUTHORISATION.certifier?.number, fallback: issuer });
    const out = await db.withTx(async (tx) => {
      await tx.query(`UPDATE job SET stage = 'certificate_issued' WHERE id = $1`, [id]);
      const r = await tx.query(
        `INSERT INTO certificate
           (job_id, inspection_id, decision, register_number, certificate_number, certifier_id,
            issued_to, applies_to, issue_date, in_force_date, expiry_date, details,
            requirements_not_met, conditions, signed_at, conditions_due, issued_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id, worksafe_register_due`,
        [id, b.inspectionId ?? null, b.decision, b.registerNumber ?? null, b.certificateNumber ?? null,
         holder, b.issuedTo, b.appliesTo, b.issueDate,
         b.inForceDate ?? b.issueDate, b.expiryDate ?? null, b.details ?? null,
         notMet, b.conditions ?? [], b.signedAt ?? new Date().toISOString(),
         b.decision === 'conditional' ? b.conditionsDue : null, issuer]);
      // Q7: each condition is tracked until a certifier verifies it; the job
      // stays open until then (migration 016).
      if (b.decision === 'conditional') {
        const lines = (Array.isArray(b.conditions) && b.conditions.filter(Boolean).length ? b.conditions.filter(Boolean) : notMet).map(String);
        for (let k = 0; k < lines.length; k++) {
          // "… (reg 2.6(3))" → "2.6(3)": the regulation the line cites, if any.
          const reg = /\(reg(?:ulation)?\s+(\d[\d.]*(?:\([0-9a-z]+\))*)/i.exec(lines[k]);
          await tx.query(
            `INSERT INTO certificate_condition (certificate_id, ordinal, text, regulation, due_date) VALUES ($1,$2,$3,$4,$5)`,
            [r.rows[0].id, k + 1, lines[k], reg ? reg[1] : null, b.conditionsDue]);
        }
      }
      // The trigger writes the stage move; name who made it.
      await tx.query(
        `UPDATE job_stage_transition SET actor_id = $2
         WHERE id = (SELECT max(id) FROM job_stage_transition WHERE job_id = $1 AND to_stage = 'certificate_issued')`,
        [id, req.ctx.userId ?? null]);
      await recordServerEvent(tx, req, 'certificate.issue',
        { jobId: id, inspectionId: b.inspectionId ?? null, decision: b.decision, certificateNumber: b.certificateNumber ?? null },
        { certificateId: r.rows[0].id });
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
    const classKey = jk.rows[0]?.class_key;
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
      conditionsDue: d(row.conditions_due),
      issueDate: d(row.issue_date), inForceDate: d(row.in_force_date), expiryDate: d(row.expiry_date),
      // Title and sentences from the decision and the class, never the
      // class 6/8 defaults for everything (20 Oct 2026).
      ...locationWording({ decision: row.decision, classKey, conditionsDue: d(row.conditions_due) }),
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
        authorised: setAuthorised(x, AUTHORISATION),
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
  const ROLES = ['certifier', 'reviewer', 'viewer', 'admin', 'peer_reviewer'];
  /** Roles only a certifier (or admin) may hand out: those that decide. */
  const DECIDING_ROLES = ['certifier', 'admin'];
  const personRow = (u, holder = null) => ({
    id: u.id, fullName: u.full_name, occupation: u.occupation, email: u.email, role: u.role,
    authorisationNumber: u.authorisation_number, active: u.active, createdAt: u.created_at, hasPasscode: !!u.passcode_hash,
    canAdminister: u.can_administer === true,
    isCertificateHolder: holder != null && Number(u.id) === Number(holder),
  });
  const PERSON_COLS = 'id, full_name, occupation, email, role, authorisation_number, active, created_at, passcode_hash, can_administer';
  const holderId = () => certificateHolderId(db, { authorisationNumber: AUTHORISATION.certifier?.number });

  /** Q6: what the app needs to know about a person beyond the role. */
  async function personFlags(userId) {
    const r = await db.query(`SELECT can_administer FROM app_user WHERE id = $1`, [userId]);
    const h = await holderId();
    return { canAdminister: r.rows[0]?.can_administer === true, isCertificateHolder: h != null && Number(h) === Number(userId) };
  }

  /**
   * People are managed by a certifier (or admin), or by a reviewer given
   * can_administer (the reviewer with admin and oversight, Q6). Such a
   * reviewer does not decide, so cannot hand out a deciding role or the
   * administration flag, nor touch a certifier's or admin's account.
   */
  async function canManagePeople(req) {
    if (canDecide(req.ctx.role)) return true;
    if (!req.ctx.userId) return false;
    const r = await db.query(`SELECT can_administer FROM app_user WHERE id = $1 AND active`, [req.ctx.userId]);
    return r.rows[0]?.can_administer === true;
  }
  const refuseDeciding = (res, what) =>
    res.status(403).json({ error: `${what} needs a compliance certifier`, clause: 'Role' });
  async function touchesDecider(id) {
    const r = await db.query(`SELECT role FROM app_user WHERE id = $1`, [id]);
    return DECIDING_ROLES.includes(r.rows[0]?.role);
  }

  app.get('/api/users', wrap(async (req, res) => {
    if (!(await canManagePeople(req))) return res.status(403).json({ error: 'managing people needs a compliance certifier', clause: 'Role' });
    const r = await db.query(`SELECT ${PERSON_COLS} FROM app_user ORDER BY active DESC, id`);
    const h = await holderId();
    res.json(r.rows.map((u) => personRow(u, h)));
  }));

  app.post('/api/users', wrap(async (req, res) => {
    if (!(await canManagePeople(req))) return res.status(403).json({ error: 'adding a person needs a compliance certifier', clause: 'Role' });
    const b = req.body ?? {};
    const fullName = String(b.fullName ?? '').trim(), occupation = String(b.occupation ?? '').trim();
    const email = String(b.email ?? '').trim().toLowerCase(), role = String(b.role ?? 'reviewer');
    if (!fullName || !occupation) return res.status(400).json({ error: 'a person needs a name and an occupation', clause: 'IPS 21(4)' });
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return res.status(400).json({ error: 'a sign-in email is required' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    if (b.canAdminister !== undefined && typeof b.canAdminister !== 'boolean') return res.status(400).json({ error: 'canAdminister must be true or false' });
    if (!canDecide(req.ctx.role) && (DECIDING_ROLES.includes(role) || b.canAdminister === true)) {
      return refuseDeciding(res, 'adding a certifier or another administrator');
    }
    if (String(b.passcode ?? '').length < 6) return res.status(400).json({ error: 'a passcode of at least 6 characters is required' });
    const dup = await db.query(`SELECT id FROM app_user WHERE lower(email) = $1`, [email]);
    if (dup.rows.length) return res.status(409).json({ error: 'that email is already a person here' });
    const r = await db.query(
      `INSERT INTO app_user (full_name, occupation, email, role, authorisation_number, passcode_hash, can_administer)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${PERSON_COLS}`,
      [fullName, occupation, email, role, b.authorisationNumber ? String(b.authorisationNumber).trim() : null, hashPasscode(b.passcode),
       b.canAdminister === true]);
    res.status(201).json(personRow(r.rows[0], await holderId()));
  }));

  app.patch('/api/users/:id', wrap(async (req, res) => {
    if (!(await canManagePeople(req))) return res.status(403).json({ error: 'changing a person needs a compliance certifier', clause: 'Role' });
    const id = Number(req.params.id);
    const b = req.body ?? {};
    for (const k of ['fullName', 'occupation', 'email', 'role', 'authorisationNumber']) {
      if (b[k] !== undefined && b[k] !== null && typeof b[k] !== 'string') return res.status(400).json({ error: `${k} must be text` });
    }
    if (b.role !== undefined && !ROLES.includes(b.role)) return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    if (b.canAdminister !== undefined && typeof b.canAdminister !== 'boolean') return res.status(400).json({ error: 'canAdminister must be true or false' });
    if (!canDecide(req.ctx.role)
        && (DECIDING_ROLES.includes(b.role) || b.canAdminister !== undefined || (await touchesDecider(id)))) {
      return refuseDeciding(res, 'changing a certifier, a deciding role or who administers');
    }
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
         role = COALESCE($5, role), authorisation_number = COALESCE($6, authorisation_number), active = COALESCE($7, active),
         can_administer = COALESCE($8, can_administer)
       WHERE id = $1 RETURNING ${PERSON_COLS}`,
      [id, b.fullName?.trim() || null, b.occupation?.trim() || null, b.email ?? null, b.role ?? null,
       b.authorisationNumber === undefined ? null : String(b.authorisationNumber).trim(), typeof b.active === 'boolean' ? b.active : null,
       typeof b.canAdminister === 'boolean' ? b.canAdminister : null]);
    if (!r.rows.length) return res.status(404).json({ error: 'person not found' });
    if (b.active === false) await db.query(`UPDATE auth_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
    res.json(personRow(r.rows[0], await holderId()));
  }));

  /** A new passcode signs that person out everywhere. */
  app.post('/api/users/:id/passcode', wrap(async (req, res) => {
    if (!(await canManagePeople(req))) return res.status(403).json({ error: 'resetting a passcode needs a compliance certifier', clause: 'Role' });
    const id = Number(req.params.id);
    if (!canDecide(req.ctx.role) && (await touchesDecider(id))) return refuseDeciding(res, "resetting a certifier's passcode");
    const passcode = String(req.body?.passcode ?? '');
    if (passcode.length < 6) return res.status(400).json({ error: 'a passcode of at least 6 characters is required' });
    const r = await db.query(`UPDATE app_user SET passcode_hash = $2 WHERE id = $1 RETURNING id`, [id, hashPasscode(passcode)]);
    if (!r.rows.length) return res.status(404).json({ error: 'person not found' });
    await db.query(`UPDATE auth_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
    res.json({ ok: true, id });
  }));

  // ── dashboard: what needs attention, and what just happened ─────────────
  /** Q7: conditions of a conditional certificate due within 14 days, or overdue. */
  async function conditionReminders() {
    const r = await db.query(`
      SELECT cc.id, cc.text, cc.due_date, j.id AS job_id, cl.legal_name AS client, l.name AS location,
             (cc.due_date < CURRENT_DATE) AS overdue
      FROM certificate_condition cc JOIN certificate c ON c.id = cc.certificate_id JOIN job j ON j.id = c.job_id
      JOIN client cl ON cl.id = j.client_id AND cl.archived_at IS NULL LEFT JOIN hs_location l ON l.id = j.hs_location_id
      WHERE cc.verified_at IS NULL AND cc.due_date IS NOT NULL AND cc.due_date <= CURRENT_DATE + 14
      ORDER BY cc.due_date, cc.id`);
    const day = (v) => (typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10));
    return r.rows.map((x) => ({ kind: 'condition', jobId: x.job_id, client: x.client, location: x.location, when: x.due_date,
      text: `Condition ${x.overdue ? 'overdue' : 'due'} ${day(x.due_date)}: ${x.text}` }));
  }

  app.get('/api/dashboard', wrap(async (_req, res) => {
    // The peer reviewer's access is the flagged jobs only: nothing here is theirs.
    if (isPeerReviewer(_req.ctx.role)) return res.json({ reminders: [], activity: [], mailConfigured: mailConfigured() });
    const [renewals, rfi, actions, stalled, activity, noAction, triage, decide] = await Promise.all([
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location, c.expiry_date
                FROM certificate c JOIN job j ON j.id = c.job_id
                JOIN client cl ON cl.id = j.client_id AND cl.archived_at IS NULL LEFT JOIN hs_location l ON l.id = j.hs_location_id
                WHERE c.expiry_date IS NOT NULL AND c.expiry_date <= now() + interval '180 days'
                ORDER BY c.expiry_date`),
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location, t.occurred_at AS since
                FROM job j JOIN client cl ON cl.id = j.client_id AND cl.archived_at IS NULL LEFT JOIN hs_location l ON l.id = j.hs_location_id
                JOIN LATERAL (SELECT max(occurred_at) AS occurred_at FROM job_stage_transition WHERE job_id = j.id) t ON true
                WHERE j.stage = 'rfi' AND t.occurred_at < now() - interval '7 days'`),
      db.query(`SELECT ca.id, ca.description, ca.severity, ca.due_date, ca.status, j.id AS job_id,
                       cl.legal_name AS client, l.name AS location
                FROM corrective_action ca JOIN finding f ON f.id = ca.finding_id
                JOIN inspection i ON i.id = f.inspection_id JOIN job j ON j.id = i.job_id
                JOIN client cl ON cl.id = j.client_id AND cl.archived_at IS NULL LEFT JOIN hs_location l ON l.id = j.hs_location_id
                WHERE ca.status <> 'verified' AND ca.due_date IS NOT NULL AND ca.due_date <= now() + interval '14 days'
                ORDER BY ca.due_date`),
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location, fc.last_at
                FROM job j JOIN client cl ON cl.id = j.client_id AND cl.archived_at IS NULL LEFT JOIN hs_location l ON l.id = j.hs_location_id
                LEFT JOIN LATERAL (SELECT max(f.updated_at) AS last_at FROM finding f JOIN inspection i ON i.id = f.inspection_id WHERE i.job_id = j.id) fc ON true
                WHERE j.stage = 'site_inspection' AND COALESCE(fc.last_at, j.opened_at) < now() - interval '14 days'`),
      db.query(`SELECT e.type, e.occurred_at, e.payload, u.full_name AS user_name,
                       COALESCE(int_or_null(e.payload->>'jobId'), i.job_id, ci.job_id) AS job_id,
                       COALESCE(cl.legal_name, ac.legal_name) AS client, l.name AS location
                FROM sync_event e
                LEFT JOIN app_user u ON u.id = e.user_id
                LEFT JOIN inspection i ON i.id = int_or_null(e.payload->>'inspectionId')
                LEFT JOIN corrective_action ca ON ca.id = int_or_null(e.payload->>'correctiveActionId')
                LEFT JOIN finding cf ON cf.id = ca.finding_id
                LEFT JOIN inspection ci ON ci.id = cf.inspection_id
                LEFT JOIN job j ON j.id = COALESCE(int_or_null(e.payload->>'jobId'), i.job_id, ci.job_id)
                LEFT JOIN client cl ON cl.id = j.client_id
                LEFT JOIN client ac ON ac.id = int_or_null(e.payload->>'clientId')
                LEFT JOIN hs_location l ON l.id = j.hs_location_id
                WHERE e.outcome = 'applied' AND cl.archived_at IS NULL
                ORDER BY e.occurred_at DESC LIMIT 30`),
      // Stage 5: a non-compliance with no corrective action yet.
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location, count(*)::int AS n
                FROM finding f JOIN inspection i ON i.id = f.inspection_id JOIN job j ON j.id = i.job_id
                JOIN client cl ON cl.id = j.client_id AND cl.archived_at IS NULL LEFT JOIN hs_location l ON l.id = j.hs_location_id
                WHERE f.status = 'non_compliant'
                  AND j.stage IN ('compliance_evaluation', 'gap_closure', 'final_validation')
                  AND NOT EXISTS (SELECT 1 FROM corrective_action ca WHERE ca.finding_id = f.id)
                GROUP BY j.id, cl.legal_name, l.name`),
      // Stages 1 and 2: an enquiry or application untouched for 2 days.
      db.query(`SELECT j.id AS job_id, j.stage, cl.legal_name AS client, l.name AS location, j.opened_at
                FROM job j JOIN client cl ON cl.id = j.client_id AND cl.archived_at IS NULL LEFT JOIN hs_location l ON l.id = j.hs_location_id
                LEFT JOIN LATERAL (SELECT max(occurred_at) AS at FROM job_stage_transition WHERE job_id = j.id) t ON true
                WHERE j.stage IN ('enquiry', 'application') AND COALESCE(t.at, j.opened_at) < now() - interval '2 days'`),
      // Stage 6: at final validation with nothing left to resolve; decide.
      db.query(`SELECT j.id AS job_id, cl.legal_name AS client, l.name AS location
                FROM job j JOIN client cl ON cl.id = j.client_id AND cl.archived_at IS NULL LEFT JOIN hs_location l ON l.id = j.hs_location_id
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
      ...(await conditionReminders()),
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

  // ── exports: the checksheet PDF and the job bundle (contract C) ─────────
  // Any signed-in role may download, a viewer included: these are reads.
  const checksheetPdfFor = (id) => checksheetPdf(db, id, {
    templateOrder: templatesForClass,
    kindFor,
    logoPath: assetPath('brand/logo-white.png', 'packages/checksheets/brand/logo-white.png'),
    company: renderMod.COMPANY,
    // Only ever a file the operator points at; no signature image is in the repo.
    signatureImagePath: process.env.SIGNATURE_IMAGE_PATH || null,
  });

  app.get('/api/jobs/:id/checksheet.pdf', wrap(async (req, res) => {
    const out = await checksheetPdfFor(Number(req.params.id));
    if (!out) return res.status(404).json({ error: 'job not found' });
    const name = `${safeFileName(`Checksheet - Job ${req.params.id} - ${out.data.job.legal_name}`, 100)}.pdf`;
    res.set('Content-Disposition', contentDisposition(name).replace(/^attachment/, 'inline'));
    res.type('application/pdf').send(out.pdf);
  }));

  /** The ZIP's bytes and entry names; null for an unknown job. */
  async function jobBundle(id) {
    const out = await checksheetPdfFor(id);
    if (!out) return null;
    const ncData = await nonComplianceData(id);
    const certificateHtml = await fetchCertificateHtml(id);
    // The whole bundle is built in memory inside one function call: past this
    // size it is refused with a clear message rather than running out.
    const total = out.data.evidence.reduce((n, e) => n + Number(e.bytes ?? 0), 0);
    if (total > BUNDLE_MAX_BYTES) return { tooLarge: total };
    const evidence = [], missing = [];
    for (const e of out.data.evidence) {
      const found = await readEvidence(e.storage_key);
      if (found) evidence.push({ name: e.fileName, buf: found.buf });
      else missing.push(`${e.fileName} (sha256 ${e.sha256})`);
    }
    const { zip, files } = buildBundleZip({
      checksheetPdf: out.pdf,
      certificateHtml,
      nonComplianceHtml: renderNonComplianceReport({ ...ncData, letterhead: letterheadImages() }),
      evidence, missing,
    });
    return { zip, files, fileName: bundleFileName(id, out.data.job.legal_name) };
  }

  /**
   * Disk: the ZIP streams back. Blob / Spaces: stored under exports/ and a
   * presigned GET comes back as JSON ({ url, bytes, files }), or as a
   * redirect for the browser route below.
   */
  async function sendBundle(req, res, { redirect }) {
    const id = Number(req.params.id);
    const b = await jobBundle(id);
    if (!b) return res.status(404).json({ error: 'job not found' });
    if (b.tooLarge) {
      return res.status(413).json({ error: `this job's evidence is ${Math.round(b.tooLarge / 1048576)} MB, more than one download can carry (${BUNDLE_MAX_BYTES / 1048576} MB): download the checksheet PDF and the evidence separately` });
    }
    const store = exportStore();
    if (!store) {
      res.set('Content-Disposition', contentDisposition(b.fileName));
      res.set('X-Bundle-Files', String(b.files.length));
      return res.type('application/zip').send(b.zip);
    }
    const link = await store.put(exportKey(id), b.zip);
    if (redirect) return res.redirect(302, link.url);
    res.json({ url: link.url, expiresAt: link.expiresAt, bytes: b.zip.length, files: b.files, fileName: b.fileName });
  }

  app.post('/api/jobs/:id/bundle', wrap((req, res) => sendBundle(req, res, { redirect: false })));
  // The app opens this in the browser with ?token= (a page cannot POST with a
  // bearer header); same bundle, a download or a redirect to the stored copy.
  app.get('/api/jobs/:id/bundle.zip', wrap((req, res) => sendBundle(req, res, { redirect: true })));

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
    await recordServerEvent(db, req, 'document.send', { jobId: id, document, to, sent: !!result.sent }, { summary });
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
    const importSet = SHEET_SETS.sets.find((x) => x.key === classKey);
    if (!importSet) return res.status(400).json({ error: `unknown check sheet set "${classKey}"` });
    const importScope = validateChoices(importSet, b.scopeChoices);
    if (importScope.error) return res.status(400).json({ error: importScope.error, clause: 'IPS 8' });
    const created = await db.withTx((tx) => createJob(tx, { ...b, client: { ...b.client, id: undefined }, classKey, scopeChoices: importScope.choices }));
    const target = b.stage ?? 'site_inspection';
    const path = ['application', 'document_review', 'site_inspection', 'compliance_evaluation', 'final_validation'];
    const stop = path.indexOf(target);
    if (stop < 0) return res.status(400).json({ error: `stage must be one of ${path.join(', ')}` });
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
  //
  // Accepted: photographs (JPEG, PNG) and PDFs, up to 50 MB. Every upload is
  // kept; nothing is overwritten except by the identical bytes.
  const refuseViewer = (req, res) =>
    canRecord(req.ctx.role) ? false : (res.status(403).json({ error: 'a viewer cannot upload evidence', clause: 'Role' }), true);
  const refuseMime = (mime, res) =>
    EVIDENCE_MIME[mime] ? false
      : (res.status(415).json({ error: `${mime ?? 'no content type'} is not accepted as evidence: photographs (JPEG, PNG) or PDF only` }), true);
  const refuseSize = (bytes, res) =>
    bytes > EVIDENCE_MAX_BYTES
      ? (res.status(413).json({ error: `evidence is limited to ${EVIDENCE_MAX_BYTES / 1024 / 1024} MB` }), true) : false;
  const SHA_RE = /^[0-9a-f]{64}$/;

  // Step 1: where do the bytes go? Blob/Spaces: straight to storage. Disk: here.
  app.post('/api/evidence/upload-url', wrap(async (req, res) => {
    if (refuseViewer(req, res)) return;
    const b = req.body ?? {};
    const sha256 = typeof b.sha256 === 'string' ? b.sha256.toLowerCase() : '';
    if (!SHA_RE.test(sha256)) return res.status(400).json({ error: 'sha256 must be the 64-hex digest computed at capture' });
    const mime = normaliseEvidenceMime(b.mime);
    if (refuseMime(mime, res)) return;
    const bytes = Number(b.bytes);
    if (!Number.isInteger(bytes) || bytes <= 0) return res.status(400).json({ error: 'bytes must be the file size' });
    if (refuseSize(bytes, res)) return;
    const key = `${sha256}.${EVIDENCE_MIME[mime]}`;
    if (evidenceBackend.direct) {
      // Already stored: nothing to upload, and no PUT that could replace it.
      if (await evidenceBackend.stat?.(key)) {
        return res.json({ mode: 'exists', storageKey: fullEvidenceKey(key) });
      }
      const validUntil = Date.now() + PUT_TTL_MS;
      const signed = await evidenceBackend.presignPut({ key, mime, bytes, validUntil });
      return res.json({ mode: 'direct', method: 'PUT', url: signed.url, headers: signed.headers ?? {},
                        storageKey: fullEvidenceKey(key), expiresAt: new Date(validUntil).toISOString() });
    }
    if (bytes > SERVER_UPLOAD_LIMIT) {
      return res.status(413).json({ error: `without object storage this server takes at most ${SERVER_UPLOAD_LIMIT / 1024 / 1024} MB` });
    }
    res.json({ mode: 'server', method: 'POST', url: '/api/evidence/upload',
               headers: { 'content-type': mime, 'x-sha256': sha256 }, storageKey: key });
  }));

  // Step 2 (direct only): the server reads the object back and hashes it
  // itself. The device's word is not the record (IPS 21(4)).
  app.post('/api/evidence/confirm', wrap(async (req, res) => {
    if (refuseViewer(req, res)) return;
    const b = req.body ?? {};
    const sha256 = typeof b.sha256 === 'string' ? b.sha256.toLowerCase() : '';
    if (!SHA_RE.test(sha256)) return res.status(400).json({ error: 'sha256 must be the 64-hex digest computed at capture' });
    const mime = normaliseEvidenceMime(b.mime);
    if (refuseMime(mime, res)) return;
    if (b.bytes != null && refuseSize(Number(b.bytes), res)) return;
    const key = `${sha256}.${EVIDENCE_MIME[mime]}`;
    // Only the content-addressed key for this hash may be confirmed (and, on
    // a mismatch, deleted): never an arbitrary object.
    if (typeof b.storageKey !== 'string' || bareEvidenceKey(b.storageKey) !== key) {
      return res.status(400).json({ error: `storageKey must be evidence/${key}` });
    }
    // Evidence already on record under this key is never deleted from here.
    const onRecord = (await db.query(
      `SELECT 1 FROM evidence WHERE storage_key IN ($1, $2) LIMIT 1`, [key, fullEvidenceKey(key)])).rows.length > 0;
    // Size before reading: an oversized object is refused without hashing it.
    const st = evidenceBackend.stat ? await evidenceBackend.stat(key) : null;
    if (evidenceBackend.stat && !st) return res.status(404).json({ error: 'nothing has been uploaded under that key' });
    if (st && st.bytes > EVIDENCE_MAX_BYTES) {
      if (!onRecord) await evidenceBackend.remove(key);
      return refuseSize(st.bytes, res);
    }
    const stored = await evidenceBackend.hashStored(key);
    if (!stored) return res.status(404).json({ error: 'nothing has been uploaded under that key' });
    if (stored.sha256 !== sha256) {
      if (onRecord) {
        return res.status(409).json({ error: 'sha256 mismatch on evidence already on record: nothing was deleted; tell the certifier',
                                      clause: 'IPS 21(4)', claimed: sha256, received: stored.sha256 });
      }
      await evidenceBackend.remove(key);
      return res.status(409).json({ error: 'sha256 mismatch: the stored bytes differ from the hash computed at capture; the upload was deleted',
                                    clause: 'IPS 21(4)', claimed: sha256, received: stored.sha256 });
    }
    if (stored.bytes > EVIDENCE_MAX_BYTES) {
      if (!onRecord) await evidenceBackend.remove(key);
      return refuseSize(stored.bytes, res);
    }
    const storageKey = evidenceBackend.name === 'disk' ? key : fullEvidenceKey(key);
    res.status(201).json({ sha256, bytes: stored.bytes, mime, storageKey, url: null, backend: evidenceBackend.name });
  }));

  // A short-lived link to the bytes, for documents the device opens itself.
  app.get('/api/evidence/:key/link', wrap(async (req, res) => {
    const key = req.params.key;
    if (!EVIDENCE_KEY_RE.test(key)) return res.status(404).json({ error: 'not found' });
    if (!req.ctx.userId && !req.ctx.authenticated) return res.status(401).json({ error: 'not signed in' });
    const known = await db.query(`SELECT 1 FROM evidence WHERE storage_key IN ($1, $2) LIMIT 1`, [key, fullEvidenceKey(key)]);
    if (!known.rows.length) return res.status(404).json({ error: 'not found' });
    res.json(await evidenceBackend.presignGet(key, Date.now() + LINK_TTL_MS));
  }));

  app.post('/api/evidence/upload', express.raw({ type: '*/*', limit: SERVER_UPLOAD_LIMIT }), wrap(async (req, res) => {
    if (refuseViewer(req, res)) return;
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'empty body' });
    const mime = normaliseEvidenceMime(req.header('content-type'));
    if (refuseMime(mime, res)) return;
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const claimed = req.header('x-sha256');
    if (claimed && claimed.toLowerCase() !== sha256) {
      // The device's hash-at-capture disagrees with what arrived. Refuse it —
      // an evidence record whose bytes do not match their hash is worse than none.
      return res.status(409).json({ error: 'sha256 mismatch: bytes differ from the hash computed at capture',
                                    clause: 'IPS 21(4)', claimed, received: sha256 });
    }
    const stored = await storeEvidence(sha256, EVIDENCE_MIME[mime], buf, mime);
    res.status(201).json({ sha256, bytes: buf.length, mime, ...stored });
  }));

  app.get('/api/evidence/:key', wrap(async (req, res) => {
    if (!/^[0-9a-f]{64}\.[a-z0-9]{1,4}$/.test(req.params.key)) return res.status(404).json({ error: 'not found' });
    const found = await readEvidence(req.params.key);
    if (!found) return res.status(404).json({ error: 'not found' });
    const ext = req.params.key.split('.').pop();
    res.type(found.mime ?? (ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : ext === 'pdf' ? 'application/pdf' : 'application/octet-stream'));
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
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      return res.status(err.status ?? 400).json({ error: err.type === 'entity.too.large' ? 'body too large' : 'malformed JSON body' });
    }
    const why = explain(err.cause ?? err);
    const status = isClientError(err.cause ?? err) ? 422 : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: why.reason, clause: why.clause, code: why.code });
  });

  return app;
}

class ROLLBACK_SENTINEL extends Error {}
