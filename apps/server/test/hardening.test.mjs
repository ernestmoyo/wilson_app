/**
 * Hardening after the independent review of 19 October 2026 (scope of work
 * phase 1). Each step is one review finding: evidence keys cannot reach
 * outside the evidence store; a direct upload cannot overwrite or delete
 * evidence already on record; size is bounded before hashing; an omitted
 * field never wipes a stored one; excluded sections neither block nor take
 * findings; bundle names carry the stored type. Disk mode on PGlite, plus an
 * injected fake store. Never real storage.
 */
import { createHash, randomUUID } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { unzipSync, strFromU8 } from 'fflate';

for (const k of ['BLOB_READ_WRITE_TOKEN', 'SPACES_BUCKET', 'SPACES_KEY', 'SPACES_SECRET', 'VERCEL', 'DATABASE_URL', 'POSTGRES_URL']) delete process.env[k];
process.env.EVIDENCE_DIR = mkdtempSync(join(tmpdir(), 'assure-hardening-test-'));

const { connect, migrate } = await import('../src/db.mjs');
const { buildApp, spacesEvidenceStore } = await import('../src/app.mjs');
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
await db.query(`INSERT INTO app_user (full_name, occupation, email, role, authorisation_number, passcode_hash)
                VALUES ('Hardening Certifier','Compliance certifier','hardening.cert@example.com','certifier','TST100250',$1)`, [hashPasscode('pass-cert')]);

// A fake direct store (Blob/Spaces stand-in) that records what is asked of it.
const objects = new Map();
const calls = [];
const fakeStore = {
  name: 'fake-direct', direct: true,
  async stat(key) { const b = objects.get(key); return b ? { bytes: b.length } : null; },
  async presignPut(a) { calls.push(['put', a.key]); return { url: `https://storage.invalid/put/${a.key}`, headers: {} }; },
  async presignGet(key, validUntil) { return { url: `https://storage.invalid/get/${key}`, expiresAt: new Date(validUntil).toISOString() }; },
  async hashStored(key) { calls.push(['hash', key]); const b = objects.get(key); return b ? { sha256: sha(b), bytes: b.length, mime: null } : null; },
  async remove(key) { calls.push(['remove', key]); objects.delete(key); },
};

const app = buildApp(db, { requireAuth: true });
const api = request(app);
const direct = request(buildApp(db, { requireAuth: true, evidenceStore: fakeStore }));
const login = async (a) => {
  const r = await a.post('/api/auth/login').send({ email: 'hardening.cert@example.com', passcode: 'pass-cert', deviceId: 'hardening' });
  return { authorization: `Bearer ${r.body.token}` };
};
const H = await login(api);
const DH = await login(direct);
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = (events) => api.post('/api/sync').set(H).send({ deviceId: 'hardening', events });

const job = (await api.post('/api/jobs').set(H).send({ client: { legalName: 'Hardening Test Limited' }, site: { address: '1 Hardening Road' },
  location: { name: 'Hardening store' }, classKey: 'class_2_3', scopeChoices: ['3_1_cabinet'] })).body;
const opened = await sync([ev('inspection.open', { jobId: job.jobId, hsLocationId: job.hsLocationId, equipmentUsed: 'iPad',
  templateCodes: ['wks17-general', 'wks17-class-2-and-3-1-substances'] })]);
const insp = opened.body.applied[0].result.inspectionId;
const inScope = (await db.query(`SELECT template_code, section_ordinal, item_ordinal FROM inspection_item_in_scope WHERE inspection_id = $1
                                 ORDER BY template_code, section_ordinal, item_ordinal`, [insp])).rows;
const at = (r) => ({ inspectionId: insp, templateCode: r.template_code, sectionOrdinal: r.section_ordinal, itemOrdinal: r.item_ordinal });

// A real PDF evidence on disk, attached to the first item.
const pdf = Buffer.from('%PDF-1.4\n% hardening test\n');
const pdfSha = sha(pdf);
await api.post('/api/evidence/upload').set(H).set('content-type', 'application/pdf').set('x-sha256', pdfSha).send(pdf);
await sync([ev('finding.upsert', { ...at(inScope[0]), status: 'compliant', comment: 'ok' })]);

await step('evidence.attach refuses a storage key that is not the content-addressed key of its hash', async () => {
  for (const [storageKey, sha256] of [['../../package.json', pdfSha], ['..\\..\\package.json', pdfSha], [`evidence/../exports/x.zip`, pdfSha],
                                      [`${'0'.repeat(64)}.pdf`, pdfSha], [`${pdfSha}.pdf`, 'not-a-hash']]) {
    const r = await sync([ev('evidence.attach', { jobId: job.jobId, inspectionId: insp, kind: 'document', sha256, storageKey,
      mime: 'application/pdf', bytes: pdf.length, originalName: 'x.pdf', ...at(inScope[0]) })]);
    expect(r.body.rejected?.length === 1, `${storageKey} / ${sha256}: ${JSON.stringify(r.body)}`);
  }
  const ok = await sync([ev('evidence.attach', { jobId: job.jobId, inspectionId: insp, kind: 'document', sha256: pdfSha, storageKey: `${pdfSha}.pdf`,
    mime: 'application/pdf', bytes: pdf.length, originalName: 'evil.html', ...at(inScope[0]) })]);
  expect(ok.body.applied?.length === 1, JSON.stringify(ok.body));
});

await step('a bad key already in the table is never read: the bundle lists it missing, it does not include the file', async () => {
  writeFileSync(join(process.env.EVIDENCE_DIR, '..', 'hardening-secret.txt'), 'SECRET');
  await db.query(`INSERT INTO evidence (job_id, kind, sha256, storage_key, mime, bytes, provenance)
                  VALUES ($1,'document',$2,'../hardening-secret.txt','application/pdf',6,'none')`, [job.jobId, 'a'.repeat(64)]);
  const r = await api.post(`/api/jobs/${job.jobId}/bundle`).set(H).buffer(true).parse((res, cb) => {
    const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  expect(r.status === 200, `${r.status}`);
  const files = unzipSync(new Uint8Array(r.body));
  const all = Object.values(files).map((u) => strFromU8(u, true)).join('\n');
  expect(!all.includes('SECRET'), 'a file outside the evidence store was bundled');
  expect(Object.keys(files).some((n) => /missing/i.test(n)), `no missing list: ${Object.keys(files)}`);
  // Evidence entries carry the stored type's extension (02/03 are the only HTML documents).
  const evNames = Object.keys(files).filter((n) => !/^0[1-3] /.test(n) && !/missing/i.test(n));
  expect(evNames.length > 0 && evNames.every((n) => n.endsWith('.pdf')), `evidence names: ${evNames}`);
});

await step('an appendix name keeps what was typed but takes the stored type\'s extension', async () => {
  const { evidenceFileNames } = await import('../src/export/naming.mjs');
  const names = evidenceFileNames([{ id: 1, appendix_category: 'Appendix 9', original_name: 'Site plan.html', mime: 'application/pdf', storage_key: `${pdfSha}.pdf` }]);
  const n = [...(names.values?.() ?? Object.values(names))][0];
  expect(n === 'Appendix 9 - Site plan.pdf', `got ${JSON.stringify(n)}`);
});

await step('upload-url for an object already stored gives no PUT URL (nothing to overwrite)', async () => {
  objects.set(`${pdfSha}.pdf`, pdf);
  calls.length = 0;
  const u = await direct.post('/api/evidence/upload-url').set(DH).send({ sha256: pdfSha, mime: 'application/pdf', bytes: pdf.length, name: 'x.pdf' });
  expect(u.status === 200 && u.body.mode === 'exists' && !u.body.url && u.body.storageKey === `evidence/${pdfSha}.pdf`, `${u.status} ${u.text}`);
  expect(!calls.some((c) => c[0] === 'put'), 'a PUT URL was signed for an existing object');
});

await step('confirm never deletes an object that evidence already references, even on a mismatch', async () => {
  objects.set(`${pdfSha}.pdf`, Buffer.from('overwritten by someone else'));
  calls.length = 0;
  const c = await direct.post('/api/evidence/confirm').set(DH).send({ sha256: pdfSha, mime: 'application/pdf', bytes: pdf.length, storageKey: `evidence/${pdfSha}.pdf` });
  expect(c.status === 409, `${c.status} ${c.text}`);
  expect(!calls.some((x) => x[0] === 'remove'), 'referenced evidence was deleted');
});

await step('confirm refuses an oversized object from its size, before reading it all', async () => {
  const big = sha(Buffer.from('big'));
  objects.set(`${big}.pdf`, { length: 60 * 1024 * 1024 }); // stat sees 60 MB; never hashed
  calls.length = 0;
  const c = await direct.post('/api/evidence/confirm').set(DH).send({ sha256: big, mime: 'application/pdf', storageKey: `evidence/${big}.pdf` });
  expect(c.status === 413, `${c.status} ${c.text}`);
  expect(!calls.some((x) => x[0] === 'hash'), 'the oversized object was read');
});

await step('Spaces: the presigned PUT is bound to the declared size', async () => {
  const seen = [];
  class PutObjectCommand { constructor(input) { this.input = input; seen.push(input); } }
  const store = spacesEvidenceStore({ bucket: 'b', client: {}, getSignedUrl: async () => 'https://spaces.invalid/put', commands: { PutObjectCommand } });
  await store.presignPut({ key: `${pdfSha}.pdf`, mime: 'application/pdf', bytes: 1234, validUntil: Date.now() + 60000 });
  expect(seen[0]?.ContentLength === 1234, JSON.stringify(seen[0]));
});

await step('a finding event that omits the general comment or N/A reason keeps the stored ones', async () => {
  const r = inScope[1];
  await sync([ev('finding.upsert', { ...at(r), status: 'not_applicable', naReason: 'No cylinders', generalComment: 'Keep this' })]);
  await sync([ev('finding.upsert', { ...at(r), status: 'not_applicable', comment: 'status only' })]);
  const f = (await db.query(`SELECT f.general_comment, f.na_reason FROM finding f JOIN checksheet_item i ON i.id = f.item_id
    JOIN checksheet_section s ON s.id = i.section_id JOIN checksheet_template t ON t.id = s.template_id
    WHERE f.inspection_id = $1 AND t.code = $2 AND s.ordinal = $3 AND i.ordinal = $4`, [insp, r.template_code, r.section_ordinal, r.item_ordinal])).rows[0];
  expect(f.general_comment === 'Keep this' && f.na_reason === 'No cylinders', JSON.stringify(f));
  await sync([ev('finding.upsert', { ...at(r), status: 'not_applicable', generalComment: '' })]);
  const g = (await db.query(`SELECT general_comment FROM finding WHERE inspection_id = $1 AND general_comment IS NOT NULL`, [insp])).rows;
  expect(g.length === 0, 'an explicit empty general comment should clear it');
});

await step('a finding on an excluded section is refused', async () => {
  const x = (await db.query(`SELECT 1 FROM inspection_section_excluded WHERE inspection_id = $1`, [insp])).rows.length;
  expect(x > 0, 'precondition: something excluded');
  const r = await sync([ev('finding.upsert', { inspectionId: insp, templateCode: 'wks17-class-2-and-3-1-substances', sectionOrdinal: 13, itemOrdinal: 1, status: 'compliant' })]);
  expect(r.body.rejected?.length === 1 && /not assessed|scope/i.test(r.body.rejected[0].reason), JSON.stringify(r.body));
});

await step('a pending or non-compliant finding left in an excluded section does not block the certificate', async () => {
  // A finding recorded before the section was excluded (e.g. scope narrowed later).
  await db.query(`INSERT INTO finding (inspection_id, item_id, status, failure_reason)
    SELECT $1, i.id, 'non_compliant', 'old' FROM checksheet_item i JOIN checksheet_section s ON s.id = i.section_id
    JOIN inspection_section_excluded x ON x.section_id = s.id AND x.inspection_id = $1 LIMIT 1`, [insp]);
  await db.query(`INSERT INTO finding (inspection_id, item_id, status)
    SELECT $1, i.id, 'pending' FROM checksheet_item i JOIN checksheet_section s ON s.id = i.section_id
    JOIN inspection_section_excluded x ON x.section_id = s.id AND x.inspection_id = $1
    WHERE NOT EXISTS (SELECT 1 FROM finding f WHERE f.inspection_id = $1 AND f.item_id = i.id) LIMIT 1`, [insp]);
  await sync([ev('interest.declare', { jobId: job.jobId, conflictFound: false }),
    ...inScope.slice(2).map((r) => ev('finding.upsert', { ...at(r), status: 'compliant' }))]);
  const c = await api.get(`/api/jobs/${job.jobId}/issuance-check`).set(H);
  expect(c.body.canGrant === true && c.body.unresolvedNonCompliances === 0, JSON.stringify(c.body));
});

await step('a bundle too big to build in one call is refused with a 413 that says what to do instead', async () => {
  await db.query(`INSERT INTO evidence (job_id, kind, sha256, storage_key, mime, bytes, provenance)
                  VALUES ($1,'document',$2,$3,'application/pdf',$4,'none')`, [job.jobId, 'b'.repeat(64), `${'b'.repeat(64)}.pdf`, 200 * 1024 * 1024]);
  const r = await api.post(`/api/jobs/${job.jobId}/bundle`).set(H);
  expect(r.status === 413 && /separately/.test(r.text), `${r.status} ${r.text?.slice(0, 120)}`);
  await db.query(`DELETE FROM evidence WHERE sha256 = $1`, ['b'.repeat(64)]);
});

await step('the job payload says how many items are in scope', async () => {
  const j = await api.get(`/api/jobs/${job.jobId}`).set(H);
  expect(j.body.itemsInScope === inScope.length, `itemsInScope ${j.body.itemsInScope} vs ${inScope.length}`);
});

await step('responses tell the browser not to send the page address (and its token) onward', async () => {
  const r = await api.get('/api/health');
  expect(r.headers['referrer-policy'] === 'no-referrer', JSON.stringify(r.headers['referrer-policy']));
});

await db.close();
console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
