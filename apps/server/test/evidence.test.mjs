/**
 * Evidence: PDFs and large files (scope of work, 19 October 2026). Photos
 * and PDFs are accepted; a file too big for a Vercel function goes straight
 * to storage through a presigned URL and the server re-hashes what landed
 * (IPS 21(4)); a document opens through a short-lived link. Disk mode on
 * PGlite, plus the presign branch against injected fakes: this file never
 * talks to real Blob or Spaces.
 */
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

// Never real storage: no Blob token, no Spaces bucket, not "on Vercel".
for (const k of ['BLOB_READ_WRITE_TOKEN', 'SPACES_BUCKET', 'SPACES_KEY', 'SPACES_SECRET', 'VERCEL', 'DATABASE_URL', 'POSTGRES_URL']) delete process.env[k];
process.env.EVIDENCE_DIR = mkdtempSync(join(tmpdir(), 'assure-evidence-test-'));

const { connect, migrate } = await import('../src/db.mjs');
const { buildApp, blobEvidenceStore, spacesEvidenceStore, EVIDENCE_MAX_BYTES } = await import('../src/app.mjs');
const { hashPasscode } = await import('../src/auth.mjs');

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const db = await connect({ url: null });
await migrate(db);
for (const [email, role] of [
  ['evidence.certifier@example.com', 'certifier'],
  ['evidence.reviewer@example.com', 'reviewer'],
  ['evidence.viewer@example.com', 'viewer'],
]) {
  await db.query(`INSERT INTO app_user (full_name, occupation, email, role, passcode_hash)
                  VALUES ($1,'Evidence test',$2,$3,$4)`, [`Evidence Test ${role}`, email, role, hashPasscode('pass-' + role)]);
}
const app = buildApp(db, { requireAuth: true });
const api = request(app);
const loginAs = async (role, a = api) => {
  const r = await a.post('/api/auth/login').send({ email: `evidence.${role}@example.com`, passcode: 'pass-' + role, deviceId: 'evidence-' + role });
  return { authorization: `Bearer ${r.body.token}` };
};
const cert = await loginAs('certifier');
const rev = await loginAs('reviewer');
const view = await loginAs('viewer');
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = (who, events) => api.post('/api/sync').set(who).send({ deviceId: 'evidence-test', events });

// Own subject: one job with an open inspection.
const job = (await api.post('/api/jobs').set(cert).send({
  client: { legalName: 'Evidence Test Limited' }, site: { address: '1 Evidence Road' },
  location: { name: 'Evidence store' }, classKey: 'class_6_8',
})).body;
const opened = await sync(cert, [
  ev('job.transition', { jobId: job.jobId, toStage: 'application' }),
  ev('job.transition', { jobId: job.jobId, toStage: 'document_review' }),
  ev('job.transition', { jobId: job.jobId, toStage: 'site_inspection' }),
  ev('inspection.open', { jobId: job.jobId, hsLocationId: job.hsLocationId, equipmentUsed: 'x',
                          templateCodes: ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'] }),
]);
const inspectionId = opened.body.applied[3].result.inspectionId;

const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n% Evidence test emergency response plan\n'), Buffer.alloc(6000, 0x41), Buffer.from('\n%%EOF\n')]);
const pdfSha = sha(pdf);

console.log('\nEVIDENCE — PDFs, the upload-url / confirm / link routes (disk)');

await step('a PDF goes upload-url → server mode → upload → attach as a document with its name', async () => {
  const u = await api.post('/api/evidence/upload-url').set(rev).send({ sha256: pdfSha, mime: 'application/pdf', bytes: pdf.length, name: 'ERP rev 2.pdf' });
  expect(u.status === 200 && u.body.mode === 'server' && u.body.url === '/api/evidence/upload', `upload-url ${u.status} ${u.text}`);
  expect(u.body.storageKey === `${pdfSha}.pdf`, `storageKey ${u.body.storageKey}`);
  const up = await api.post(u.body.url).set(rev).set(u.body.headers).send(pdf);
  expect(up.status === 201 && up.body.sha256 === pdfSha && up.body.storageKey === `${pdfSha}.pdf`, `upload ${up.status} ${up.text}`);
  const s = await sync(rev, [ev('evidence.attach', {
    jobId: job.jobId, inspectionId, kind: 'document', sha256: pdfSha, storageKey: up.body.storageKey,
    mime: 'application/pdf', bytes: pdf.length, provenance: 'app', originalName: '  ERP rev 2.pdf ',
  })]);
  expect(s.body.applied?.length === 1, JSON.stringify(s.body));
  const j = await api.get(`/api/jobs/${job.jobId}`).set(view);
  const e = j.body.evidence.find((x) => x.sha256 === pdfSha);
  expect(e && e.kind === 'document' && e.original_name === 'ERP rev 2.pdf' && e.storage_key === `${pdfSha}.pdf`,
    `job evidence row: ${JSON.stringify(e)}`);
  return `${e.original_name} · ${e.bytes} bytes · ${e.storage_key}`;
});

await step('GET /api/evidence/:key serves a PDF as application/pdf', async () => {
  const r = await api.get(`/api/evidence/${pdfSha}.pdf`).set(view).buffer(true).parse((res, cb) => {
    const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c)));
  });
  expect(r.status === 200 && /application\/pdf/.test(r.headers['content-type']), `${r.status} ${r.headers['content-type']}`);
  expect(sha(r.body) === pdfSha, 'bytes differ');
});

await step('/link returns a usable URL in disk mode (any signed-in role)', async () => {
  const l = await api.get(`/api/evidence/${pdfSha}.pdf/link`).set(view);
  expect(l.status === 200 && l.body.url === `/api/evidence/${pdfSha}.pdf` && 'expiresAt' in l.body, `${l.status} ${l.text}`);
  const r = await api.get(l.body.url).set(view);
  expect(r.status === 200, `following the link: ${r.status}`);
  const unknown = await api.get(`/api/evidence/${'0'.repeat(64)}.pdf/link`).set(view);
  expect(unknown.status === 404, `unknown key ${unknown.status}`);
  const anon = await api.get(`/api/evidence/${pdfSha}.pdf/link`);
  expect(anon.status === 401, `signed out ${anon.status}`);
});

await step('415 for anything but JPEG, PNG or PDF (upload-url and upload)', async () => {
  const u = await api.post('/api/evidence/upload-url').set(rev).send({ sha256: sha(Buffer.from('<p>')), mime: 'text/html', bytes: 3, name: 'x.html' });
  expect(u.status === 415, `upload-url ${u.status} ${u.text}`);
  const up = await api.post('/api/evidence/upload').set(rev).set('content-type', 'text/html').send(Buffer.from('<p>hello</p>'));
  expect(up.status === 415, `upload ${up.status} ${up.text}`);
  const ok = await api.post('/api/evidence/upload-url').set(rev).send({ sha256: pdfSha, mime: 'image/JPG', bytes: 10 });
  expect(ok.status === 200 && ok.body.storageKey.endsWith('.jpg'), `image/JPG is a JPEG: ${ok.status} ${ok.text}`);
});

await step('413 over 50 MB (the size claim, no 50 MB allocation)', async () => {
  const u = await api.post('/api/evidence/upload-url').set(rev).send({ sha256: pdfSha, mime: 'application/pdf', bytes: EVIDENCE_MAX_BYTES + 1 });
  expect(u.status === 413, `upload-url ${u.status} ${u.text}`);
  const at = await api.post('/api/evidence/upload-url').set(rev).send({ sha256: pdfSha, mime: 'application/pdf', bytes: EVIDENCE_MAX_BYTES });
  expect(at.status === 200, `exactly 50 MB is allowed: ${at.status}`);
  const bad = await api.post('/api/evidence/upload-url').set(rev).send({ sha256: 'nope', mime: 'application/pdf', bytes: 1 });
  expect(bad.status === 400, `malformed sha ${bad.status}`);
});

await step('off Vercel the server route takes more than the old 4 MB', async () => {
  const big = Buffer.alloc(5 * 1024 * 1024, 0x25);
  const r = await api.post('/api/evidence/upload').set(rev).set('content-type', 'application/pdf').set('x-sha256', sha(big)).send(big);
  expect(r.status === 201 && r.body.bytes === big.length, `${r.status} ${r.text.slice(0, 200)}`);
});

await step('a viewer cannot ask for an upload URL, upload or confirm', async () => {
  const u = await api.post('/api/evidence/upload-url').set(view).send({ sha256: pdfSha, mime: 'application/pdf', bytes: pdf.length });
  const up = await api.post('/api/evidence/upload').set(view).set('content-type', 'application/pdf').send(pdf);
  const c = await api.post('/api/evidence/confirm').set(view).send({ sha256: pdfSha, mime: 'application/pdf', bytes: pdf.length, storageKey: `${pdfSha}.pdf` });
  expect(u.status === 403 && up.status === 403 && c.status === 403, `upload-url ${u.status}, upload ${up.status}, confirm ${c.status}`);
});

await step('confirm re-hashes the stored bytes: a match is 201, a mismatch is deleted and 409 (IPS 21(4))', async () => {
  const good = await api.post('/api/evidence/confirm').set(rev).send({ sha256: pdfSha, mime: 'application/pdf', bytes: pdf.length, storageKey: `evidence/${pdfSha}.pdf` });
  expect(good.status === 201 && good.body.sha256 === pdfSha && good.body.bytes === pdf.length && good.body.backend === 'disk', `good ${good.status} ${good.text}`);
  // Something other than the captured bytes lands under the key.
  const claimed = sha(Buffer.from('the bytes the device hashed'));
  const file = join(process.env.EVIDENCE_DIR, `${claimed}.pdf`);
  writeFileSync(file, Buffer.from('different bytes arrived'));
  const bad = await api.post('/api/evidence/confirm').set(rev).send({ sha256: claimed, mime: 'application/pdf', bytes: 23, storageKey: `${claimed}.pdf` });
  expect(bad.status === 409 && bad.body.clause === 'IPS 21(4)', `mismatch ${bad.status} ${bad.text}`);
  expect(!existsSync(file), 'the mismatched object is still stored');
  const none = await api.post('/api/evidence/confirm').set(rev).send({ sha256: claimed, mime: 'application/pdf', storageKey: `${claimed}.pdf` });
  expect(none.status === 404, `nothing stored: ${none.status}`);
  const other = await api.post('/api/evidence/confirm').set(rev).send({ sha256: claimed, mime: 'application/pdf', storageKey: `${pdfSha}.pdf` });
  expect(other.status === 400, `a key that is not this hash's: ${other.status}`);
  expect(existsSync(join(process.env.EVIDENCE_DIR, `${pdfSha}.pdf`)), 'another object was touched');
});

console.log('\nEVIDENCE — the direct (presigned) branch, against an injected fake store');

const objects = new Map();
const calls = [];
const fakeStore = {
  name: 'fake-direct',
  direct: true,
  async presignPut(a) { calls.push(['put', a]); return { url: `https://storage.invalid/put/${a.key}?sig=1`, headers: { 'x-test': 'yes' } }; },
  async presignGet(key, validUntil) { calls.push(['get', key]); return { url: `https://storage.invalid/get/${key}?sig=2`, expiresAt: new Date(validUntil).toISOString() }; },
  async hashStored(key) { const b = objects.get(key); return b ? { sha256: sha(b), bytes: b.length, mime: null } : null; },
  async remove(key) { objects.delete(key); },
};
const direct = request(buildApp(db, { requireAuth: true, evidenceStore: fakeStore }));
const dRev = await loginAs('reviewer', direct);
const dView = await loginAs('viewer', direct);

await step('upload-url answers direct PUT with the store\'s URL and headers, under evidence/<sha>.<ext>', async () => {
  const big = 20 * 1024 * 1024;
  const u = await direct.post('/api/evidence/upload-url').set(dRev).send({ sha256: pdfSha, mime: 'application/pdf', bytes: big, name: 'Big.pdf' });
  expect(u.status === 200 && u.body.mode === 'direct' && u.body.method === 'PUT', `${u.status} ${u.text}`);
  expect(u.body.storageKey === `evidence/${pdfSha}.pdf` && u.body.headers['x-test'] === 'yes' && u.body.url.startsWith('https://storage.invalid/put/'), JSON.stringify(u.body));
  const [, a] = calls.find((c) => c[0] === 'put');
  expect(a.mime === 'application/pdf' && a.bytes === big && a.validUntil > Date.now(), JSON.stringify(a));
});

await step('confirm after a direct PUT: right bytes 201, wrong bytes deleted + 409', async () => {
  objects.set(`${pdfSha}.pdf`, pdf);
  const ok = await direct.post('/api/evidence/confirm').set(dRev).send({ sha256: pdfSha, mime: 'application/pdf', bytes: pdf.length, storageKey: `evidence/${pdfSha}.pdf` });
  expect(ok.status === 201 && ok.body.storageKey === `evidence/${pdfSha}.pdf` && ok.body.backend === 'fake-direct', `${ok.status} ${ok.text}`);
  const claimed = sha(Buffer.from('device bytes'));
  objects.set(`${claimed}.png`, Buffer.from('tampered'));
  const bad = await direct.post('/api/evidence/confirm').set(dRev).send({ sha256: claimed, mime: 'image/png', bytes: 12, storageKey: `evidence/${claimed}.png` });
  expect(bad.status === 409 && !objects.has(`${claimed}.png`), `${bad.status} ${bad.text}`);
});

await step('/link returns the store\'s presigned GET with an expiry', async () => {
  const l = await direct.get(`/api/evidence/${pdfSha}.pdf/link`).set(dView);
  expect(l.status === 200 && l.body.url.startsWith('https://storage.invalid/get/') && Date.parse(l.body.expiresAt) > Date.now(), `${l.status} ${l.text}`);
});

console.log('\nEVIDENCE — Blob and Spaces presign, with their SDKs mocked');

await step('Blob: a put token scoped to one pathname, type and size; presignUrl with no suffix, overwrite allowed', async () => {
  const seen = [];
  const sdk = {
    async issueSignedToken(o) { seen.push(['token', o]); return { delegationToken: 'payload.sig', clientSigningToken: 'k', validUntil: o.validUntil }; },
    async presignUrl(t, o) { seen.push(['presign', o]); return { presignedUrl: `https://blob.invalid/?pathname=${o.pathname}&op=${o.operation}` }; },
    parseStoreIdFromDelegationToken: () => 'store_test',
  };
  const store = blobEvidenceStore({ sdk });
  const validUntil = Date.now() + 60_000;
  const put = await store.presignPut({ key: `${pdfSha}.pdf`, mime: 'application/pdf', bytes: 1234, validUntil });
  const tok = seen[0][1]; const pre = seen[1][1];
  expect(tok.pathname === `evidence/${pdfSha}.pdf` && tok.operations.join() === 'put' && tok.maximumSizeInBytes === 1234
    && tok.allowedContentTypes.join() === 'application/pdf' && tok.validUntil === validUntil, JSON.stringify(tok));
  expect(pre.operation === 'put' && pre.access === 'private' && pre.addRandomSuffix === false && pre.allowOverwrite === true
    && pre.pathname === `evidence/${pdfSha}.pdf`, JSON.stringify(pre));
  expect(put.headers['x-content-type'] === 'application/pdf' && put.headers['x-vercel-blob-access'] === 'private'
    && put.headers['x-vercel-blob-store-id'] === 'store_test', JSON.stringify(put.headers));
  const get = await store.presignGet(`${pdfSha}.pdf`, validUntil);
  expect(seen[2][1].operations.join() === 'get' && seen[3][1].operation === 'get' && get.expiresAt === new Date(validUntil).toISOString(), JSON.stringify(seen.slice(2)));
});

await step('Blob: hashStored streams the object; remove deletes evidence/<key>', async () => {
  const deleted = [];
  const sdk = {
    async get(p, o) { expect(p === `evidence/${pdfSha}.pdf` && o.access === 'private', `get ${p}`);
      return { statusCode: 200, stream: (async function* () { yield pdf.subarray(0, 100); yield pdf.subarray(100); })(), blob: { contentType: 'application/pdf' } }; },
    async del(p) { deleted.push(p); },
  };
  const store = blobEvidenceStore({ sdk });
  const h = await store.hashStored(`${pdfSha}.pdf`);
  expect(h.sha256 === pdfSha && h.bytes === pdf.length, JSON.stringify(h));
  await store.remove(`${pdfSha}.pdf`);
  expect(deleted[0] === `evidence/${pdfSha}.pdf`, JSON.stringify(deleted));
});

await step('Spaces: getSignedUrl over PutObjectCommand / GetObjectCommand; hash and delete through the client', async () => {
  class Cmd { constructor(input) { this.input = input; } }
  const commands = { PutObjectCommand: class extends Cmd { kind = 'put'; }, GetObjectCommand: class extends Cmd { kind = 'get'; }, DeleteObjectCommand: class extends Cmd { kind = 'del'; } };
  const signed = []; const sent = [];
  const client = { async send(c) { sent.push(c); return c.kind === 'get' ? { Body: (async function* () { yield pdf; })(), ContentType: 'application/pdf' } : {}; } };
  const getSignedUrl = async (c, cmd, o) => { signed.push([cmd, o]); return `https://spaces.invalid/${cmd.input.Key}?X-Amz-Expires=${o.expiresIn}`; };
  const store = spacesEvidenceStore({ bucket: 'test-bucket', client, getSignedUrl, commands });
  const validUntil = Date.now() + 15 * 60_000;
  const put = await store.presignPut({ key: `${pdfSha}.pdf`, mime: 'application/pdf', bytes: 99, validUntil });
  const [pc, po] = signed[0];
  expect(pc.kind === 'put' && pc.input.Bucket === 'test-bucket' && pc.input.Key === `evidence/${pdfSha}.pdf` && pc.input.ContentType === 'application/pdf'
    && po.expiresIn > 800 && po.expiresIn <= 900, JSON.stringify([pc.input, po]));
  expect(put.headers['content-type'] === 'application/pdf', JSON.stringify(put.headers));
  const get = await store.presignGet(`${pdfSha}.pdf`, validUntil);
  expect(signed[1][0].kind === 'get' && get.url.includes(`evidence/${pdfSha}.pdf`), get.url);
  const h = await store.hashStored(`${pdfSha}.pdf`);
  expect(h.sha256 === pdfSha, JSON.stringify(h));
  await store.remove(`${pdfSha}.pdf`);
  expect(sent.at(-1).kind === 'del' && sent.at(-1).input.Key === `evidence/${pdfSha}.pdf`, JSON.stringify(sent.at(-1)));
});

await db.close();
console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
