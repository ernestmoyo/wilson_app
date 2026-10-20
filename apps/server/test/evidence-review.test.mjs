/**
 * Evidence review and versions (phase 2 package A; Tatenda Katai's answers of
 * 20 October 2026, Q3 and Q4). The reviewer accepts evidence that shows
 * compliance; a replaced file is kept as an earlier version; the upload date
 * and person are recorded; the version used is named in the downloaded
 * checksheet PDF and ZIP, earlier versions under "Previous versions/".
 *
 * Own subjects (two jobs), own PGlite, disk mode for evidence and exports.
 * Never Blob, Spaces or a live database.
 */
import request from 'supertest';
import { randomUUID, createHash } from 'crypto';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { inflateSync } from 'zlib';
import { unzipSync } from 'fflate';

for (const k of ['BLOB_READ_WRITE_TOKEN', 'SPACES_BUCKET', 'SPACES_KEY', 'SPACES_SECRET', 'VERCEL', 'DATABASE_URL', 'POSTGRES_URL', 'SIGNATURE_IMAGE_PATH']) delete process.env[k];
process.env.EVIDENCE_DIR = mkdtempSync(join(tmpdir(), 'evidence-review-test-'));

const { connect, migrate } = await import('../src/db.mjs');
const { buildApp } = await import('../src/app.mjs');
const { hashPasscode } = await import('../src/auth.mjs');
const { applyEvents } = await import('../src/sync/apply.mjs');

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** The text a PDF draws: inflate each stream, decode the hex strings of every TJ/Tj. */
function pdfText(buf) {
  const s = buf.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) break;
    let body = Buffer.from(s.slice(start, end), 'latin1');
    try { body = inflateSync(body); } catch { /* uncompressed or an image */ }
    const text = body.toString('latin1');
    for (const op of text.matchAll(/\[((?:<[0-9a-fA-F]*>|[^\]])*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
      const hexes = op[1] != null ? [...op[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]) : [op[2]];
      out.push(hexes.map((h) => Buffer.from(h, 'hex').toString('latin1')).join(''));
    }
    re.lastIndex = end + 9;
  }
  return out.join(' ').replace(/\s+/g, ' ');
}
const binary = (res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); };

const db = await connect({ url: null });
await migrate(db);
const people = {};
for (const role of ['certifier', 'reviewer', 'viewer', 'admin']) {
  const email = `evrev.${role}@example.com`;
  const r = await db.query(`INSERT INTO app_user (full_name, occupation, email, role, passcode_hash)
                            VALUES ($1,'Evidence review test',$2,$3,$4) RETURNING id`,
    [`Evrev ${role[0].toUpperCase()}${role.slice(1)}`, email, role, hashPasscode('pass-' + role)]);
  people[role] = { id: r.rows[0].id, name: `Evrev ${role[0].toUpperCase()}${role.slice(1)}` };
}
const app = buildApp(db, { requireAuth: true });
const api = request(app);
for (const role of Object.keys(people)) {
  const r = await api.post('/api/auth/login').send({ email: `evrev.${role}@example.com`, passcode: 'pass-' + role, deviceId: 'evrev-' + role });
  if (r.status !== 200) throw new Error(`login ${role}: ${r.status} ${r.text}`);
  people[role].h = { authorization: `Bearer ${r.body.token}` };
}
const { certifier: cert, reviewer: rev, viewer: view, admin } = people;
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = async (who, events) => (await api.post('/api/sync').set(who.h).send({ deviceId: 'evrev-test', events })).body;
const one = async (who, type, payload) => {
  const b = await sync(who, [ev(type, payload)]);
  return { applied: b.applied?.[0], rejected: b.rejected?.[0], body: b };
};

const GENERAL = 'wks17-general';
async function newJob(name) {
  const job = (await api.post('/api/jobs').set(cert.h).send({
    client: { legalName: name }, site: { address: '1 Evidence Review Road' },
    location: { name: `${name} store` }, classKey: 'class_6_8',
  })).body;
  const opened = await sync(cert, [
    ev('job.transition', { jobId: job.jobId, toStage: 'application' }),
    ev('job.transition', { jobId: job.jobId, toStage: 'document_review' }),
    ev('job.transition', { jobId: job.jobId, toStage: 'site_inspection' }),
    ev('inspection.open', { jobId: job.jobId, hsLocationId: job.hsLocationId, equipmentUsed: 'iPad',
                            templateCodes: [GENERAL, 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'] }),
  ]);
  const inspectionId = opened.applied[3].result.inspectionId;
  const f = await sync(cert, [
    ev('finding.upsert', { inspectionId, templateCode: GENERAL, sectionOrdinal: 1, itemOrdinal: 1, status: 'compliant', comment: 'Sighted' }),
    ev('finding.upsert', { inspectionId, templateCode: GENERAL, sectionOrdinal: 1, itemOrdinal: 2, status: 'compliant', comment: 'Sighted' }),
  ]);
  return { jobId: job.jobId, inspectionId, findingA: f.applied[0].result.findingId, findingB: f.applied[1].result.findingId };
}

const upload = async (buf, mime) => {
  const r = await api.post('/api/evidence/upload').set(rev.h).set('content-type', mime).set('x-sha256', sha(buf)).send(buf);
  if (r.status !== 201) throw new Error(`upload: ${r.status} ${r.text}`);
  return r.body;
};
const jpeg = (label) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`evidence review ${label} ${randomUUID()}`), Buffer.from([0xff, 0xd9])]);
const photoPayload = (job, up, buf, extra = {}) => ({
  jobId: job.jobId, inspectionId: job.inspectionId, findingId: job.findingA, kind: 'photo', sha256: up.sha256, storageKey: up.storageKey,
  mime: 'image/jpeg', bytes: buf.length, capturedByName: 'Evrev Reviewer', capturedByOccupation: 'Reviewer',
  capturedAt: new Date().toISOString(), capturedWhere: 'Store door', ...extra,
});
const jobEvidence = async (jobId) => (await api.get(`/api/jobs/${jobId}`).set(view.h)).body.evidence;
const today = new Date().toLocaleDateString('en-NZ', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Pacific/Auckland' });

const job = await newJob('Evidence Review Test Limited');
const other = await newJob('Evidence Review Other Limited');
const v1Bytes = jpeg('v1'), v2Bytes = jpeg('v2'), otherBytes = jpeg('other');
const v1Up = await upload(v1Bytes, 'image/jpeg');
const v2Up = await upload(v2Bytes, 'image/jpeg');
const otherUp = await upload(otherBytes, 'image/jpeg');
let v1Id, v2Id, otherId;

console.log('\nEVIDENCE REVIEW — versions');

await step('attach v1: version 1, uploaded by the signed-in person, now; submitted and current', async () => {
  const r = await one(rev, 'evidence.attach', photoPayload(job, v1Up, v1Bytes));
  expect(r.applied, JSON.stringify(r.body));
  v1Id = r.applied.result.evidenceId;
  const e = (await jobEvidence(job.jobId)).find((x) => Number(x.id) === Number(v1Id));
  expect(e.version === 1 && e.supersedes_id == null, `version ${e.version} supersedes ${e.supersedes_id}`);
  expect(e.uploaded_by_name === rev.name && Math.abs(Date.parse(e.uploaded_at) - Date.now()) < 60_000, `${e.uploaded_by_name} ${e.uploaded_at}`);
  expect(e.review_state === 'submitted' && e.current === true && e.reviewed_by_name == null, JSON.stringify(e));
});

await step('replace with v2 (supersedesId): version 2, same finding; v1 kept and not current', async () => {
  // No findingId on the replacement: it inherits the finding of the version it replaces.
  const p = photoPayload(job, v2Up, v2Bytes, { supersedesId: v1Id });
  delete p.findingId;
  const r = await one(cert, 'evidence.attach', p);
  expect(r.applied, JSON.stringify(r.body));
  v2Id = r.applied.result.evidenceId;
  const rows = await jobEvidence(job.jobId);
  const v1 = rows.find((x) => Number(x.id) === Number(v1Id));
  const v2 = rows.find((x) => Number(x.id) === Number(v2Id));
  expect(v1 && v1.current === false && v1.sha256 === v1Up.sha256, `v1 ${JSON.stringify(v1)}`);
  expect(v2.version === 2 && Number(v2.supersedes_id) === Number(v1Id) && v2.current === true, `v2 ${JSON.stringify(v2)}`);
  expect(Number(v2.finding_id) === Number(job.findingA), 'v2 is not on the same finding');
  expect(v2.uploaded_by_name === cert.name && v2.review_state === 'submitted', JSON.stringify(v2));
  const cur = await db.query(`SELECT id FROM evidence_current WHERE job_id = $1`, [job.jobId]);
  expect(cur.rows.length === 1 && Number(cur.rows[0].id) === Number(v2Id), `evidence_current: ${JSON.stringify(cur.rows)}`);
});

await step('the finding counts its current evidence only', async () => {
  const j = (await api.get(`/api/jobs/${job.jobId}`).set(view.h)).body;
  const f = j.findings.find((x) => Number(x.id) === Number(job.findingA));
  expect(f.evidence_count === 1, `evidence_count ${f.evidence_count}`);
});

await step('replacing a version that is already replaced is refused', async () => {
  const r = await one(rev, 'evidence.attach', photoPayload(job, otherUp, otherBytes, { supersedesId: v1Id }));
  expect(r.rejected && /already replaced/.test(r.rejected.reason), JSON.stringify(r.body));
});

await step('a replacement on a different finding or job is refused; nothing is written', async () => {
  const a = await one(rev, 'evidence.attach', photoPayload(job, otherUp, otherBytes, { supersedesId: v2Id, findingId: job.findingB }));
  expect(a.rejected && /same finding/.test(a.rejected.reason), `other finding: ${JSON.stringify(a.body)}`);
  const b = await one(rev, 'evidence.attach', photoPayload(other, otherUp, otherBytes, { supersedesId: v2Id }));
  expect(b.rejected && /same job/.test(b.rejected.reason), `other job: ${JSON.stringify(b.body)}`);
  const c = await one(rev, 'evidence.attach', photoPayload(job, otherUp, otherBytes, { supersedesId: 987654321 }));
  expect(c.rejected && /not found/.test(c.rejected.reason), `unknown: ${JSON.stringify(c.body)}`);
  const n = await db.query(`SELECT count(*)::int AS n FROM evidence WHERE sha256 = $1`, [otherUp.sha256]);
  expect(n.rows[0].n === 0, `${n.rows[0].n} rows written`);
});

await step('a second, unreplaced file on the job (stays submitted)', async () => {
  const r = await one(rev, 'evidence.attach', photoPayload(job, otherUp, otherBytes, { findingId: job.findingB }));
  expect(r.applied, JSON.stringify(r.body));
  otherId = r.applied.result.evidenceId;
});

console.log('\nEVIDENCE REVIEW — accept / not accepted');

await step('a viewer cannot review (Role)', async () => {
  const r = await one(view, 'evidence.review', { evidenceId: v2Id, state: 'accepted' });
  expect(r.rejected?.clause === 'Role', JSON.stringify(r.body));
});

await step('a peer reviewer (or any role not on the list) cannot review (Role)', async () => {
  // The role does not exist until package B; the rule is an allow-list, so it is refused already.
  const out = await db.withTx((tx) => applyEvents(tx, { deviceId: 'evrev-peer', userId: people.reviewer.id, role: 'peer_reviewer' },
    [ev('evidence.review', { evidenceId: v2Id, state: 'accepted' })]));
  expect(out.rejected[0]?.clause === 'Role', JSON.stringify(out));
  const st = await db.query(`SELECT review_state FROM evidence WHERE id = $1`, [v2Id]);
  expect(st.rows[0].review_state === 'submitted', st.rows[0].review_state);
});

await step('not accepted needs a note (IPS 21(1)(e)); a bad state is refused', async () => {
  const r = await one(rev, 'evidence.review', { evidenceId: v2Id, state: 'not_accepted', note: '   ' });
  expect(r.rejected?.clause === 'IPS 21(1)(e)', JSON.stringify(r.body));
  const s = await one(rev, 'evidence.review', { evidenceId: v2Id, state: 'maybe' });
  expect(s.rejected && !s.applied, JSON.stringify(s.body));
});

await step('the reviewer marks it not accepted with a note; the certifier and admin can review too', async () => {
  const r = await one(rev, 'evidence.review', { jobId: job.jobId, evidenceId: v2Id, state: 'not_accepted', note: 'Label unreadable' });
  expect(r.applied, JSON.stringify(r.body));
  let e = (await jobEvidence(job.jobId)).find((x) => Number(x.id) === Number(v2Id));
  expect(e.review_state === 'not_accepted' && e.review_note === 'Label unreadable' && e.reviewed_by_name === rev.name && e.reviewed_at, JSON.stringify(e));
  const c = await one(cert, 'evidence.review', { evidenceId: v2Id, state: 'accepted' });
  expect(c.applied, `certifier: ${JSON.stringify(c.body)}`);
  const a = await one(admin, 'evidence.review', { evidenceId: v2Id, state: 'accepted' });
  expect(a.applied, `admin: ${JSON.stringify(a.body)}`);
  const final = await one(rev, 'evidence.review', { jobId: job.jobId, evidenceId: v2Id, state: 'accepted' });
  expect(final.applied, JSON.stringify(final.body));
  e = (await jobEvidence(job.jobId)).find((x) => Number(x.id) === Number(v2Id));
  expect(e.review_state === 'accepted' && e.reviewed_by_name === rev.name && e.review_note == null, JSON.stringify(e));
});

await step('every review is in the event log with the person', async () => {
  const r = await db.query(`SELECT u.full_name FROM sync_event e JOIN app_user u ON u.id = e.user_id
                            WHERE e.type = 'evidence.review' AND e.outcome = 'applied' AND int_or_null(e.payload->>'evidenceId') = $1
                            ORDER BY e.received_at`, [v2Id]);
  expect(r.rows.map((x) => x.full_name).join() === [rev.name, cert.name, admin.name, rev.name].join(), JSON.stringify(r.rows));
});

await step('reviewing a superseded version is refused', async () => {
  const r = await one(rev, 'evidence.review', { evidenceId: v1Id, state: 'accepted' });
  expect(r.rejected && /superseded|replaced/.test(r.rejected.reason), JSON.stringify(r.body));
});

console.log('\nEVIDENCE REVIEW — issuance check, PDF, ZIP');

await step('issuance check: a warning lists current evidence not yet accepted, not a blocker', async () => {
  const r = await api.get(`/api/jobs/${job.jobId}/issuance-check`).set(cert.h);
  expect(r.status === 200, `${r.status} ${r.text}`);
  const w = (r.body.warnings ?? []).find((x) => x.kind === 'evidence_not_accepted');
  expect(w, `warnings: ${JSON.stringify(r.body.warnings)}`);
  const ids = w.evidence.map((x) => Number(x.id));
  expect(ids.length === 1 && ids[0] === Number(otherId), `listed ${JSON.stringify(w.evidence)}`);
  expect(w.evidence[0].review_state === 'submitted' && /Item/.test(w.evidence[0].name), JSON.stringify(w.evidence[0]));
  expect(!JSON.stringify(r.body.blockers).includes('evidence'), 'evidence became a blocker');
  // Once accepted, the warning goes.
  await one(rev, 'evidence.review', { evidenceId: otherId, state: 'accepted' });
  const again = await api.get(`/api/jobs/${job.jobId}/issuance-check`).set(cert.h);
  expect(!(again.body.warnings ?? []).some((x) => x.kind === 'evidence_not_accepted'), JSON.stringify(again.body.warnings));
  // Put it back to not accepted: it is listed with its state.
  await one(rev, 'evidence.review', { evidenceId: otherId, state: 'not_accepted', note: 'Wrong cabinet' });
  const third = await api.get(`/api/jobs/${job.jobId}/issuance-check`).set(cert.h);
  const w3 = third.body.warnings.find((x) => x.kind === 'evidence_not_accepted');
  expect(w3.evidence[0].review_state === 'not_accepted', JSON.stringify(w3));
  return w3.reason;
});

await step('checksheet PDF names the current version: "v2 · uploaded dd/mm/yyyy by X · accepted by Y"', async () => {
  const r = await api.get(`/api/jobs/${job.jobId}/checksheet.pdf`).set(view.h).buffer(true).parse(binary);
  expect(r.status === 200, `${r.status}`);
  const t = pdfText(r.body);
  const want = `v2 · uploaded ${today} by ${cert.name} · accepted by ${rev.name}`;
  expect(t.includes(want), `missing "${want}"`);
  expect(t.includes(`v1 · uploaded ${today} by ${people.reviewer.name} · not accepted by ${rev.name}`), 'the second file\'s line');
  // The replaced v1 (never reviewed) is not in the evidence column.
  expect(!t.includes('not yet reviewed'), 'the superseded v1 is printed');
});

await step('ZIP: the current version where it always was; v1 under "Previous versions/" with " (v1)"', async () => {
  const r = await api.post(`/api/jobs/${job.jobId}/bundle`).set(view.h).buffer(true).parse(binary);
  expect(r.status === 200, `${r.status} ${r.text}`);
  const files = unzipSync(new Uint8Array(r.body));
  const names = Object.keys(files).sort();
  const cur = names.find((n) => /^Item [^/]+ - 1\.jpg$/.test(n) && sha(Buffer.from(files[n])) === v2Up.sha256);
  expect(cur, `current v2 not found: ${names.join(', ')}`);
  const prev = `Previous versions/${cur.replace(/\.jpg$/, ' (v1).jpg')}`;
  expect(files[prev] && sha(Buffer.from(files[prev])) === v1Up.sha256, `missing ${prev}: ${names.join(', ')}`);
  expect(names.filter((n) => n.startsWith('Previous versions/')).length === 1, names.join(', '));
  return names.join(', ');
});

await step('migration 015 is additive: existing rows keep their own upload date', async () => {
  const c = await db.query(`SELECT column_name, is_nullable, column_default FROM information_schema.columns
                            WHERE table_name = 'evidence' AND column_name IN ('supersedes_id','version','uploaded_by','uploaded_at','review_state','reviewed_by','reviewed_at','review_note')`);
  expect(c.rows.length === 8, JSON.stringify(c.rows));
  const m = await db.query(`SELECT 1 FROM schema_migration WHERE name = '015_evidence_review.sql'`);
  expect(m.rows.length === 1, 'not recorded in schema_migration');
});

await db.close();
console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
