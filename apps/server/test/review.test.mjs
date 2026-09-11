/**
 * Regression tests for the defects the independent server review found
 * (11 September 2026): a malformed payload must not poison history; data
 * errors are the client's (4xx), not ours (500); a payload cannot reach
 * another job's inspection, finding or location; the certifier on a
 * certificate is the signed-in person; a same-stage transition is refused;
 * viewers cannot record through side routes; evidence keys are keys; a
 * duplicate replay carries the original result. Test data only.
 */
import { randomUUID } from 'crypto';
import request from 'supertest';

import { connect, migrate } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';
import { hashPasscode } from '../src/auth.mjs';

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const db = await connect({ url: null });
await migrate(db);
for (const [id, name, occ, email, role, auth] of [
  [1, 'Bryan Wilson', 'Compliance certifier', 'compliancecertifier@assuresafety.co.nz', 'certifier', 'TST100250'],
  [2, 'Test Reviewer', 'Field assessor', 'reviewer@assuresafety.co.nz', 'reviewer', null],
  [3, 'Test Viewer', 'Viewer', 'viewer@assuresafety.co.nz', 'viewer', null],
]) {
  await db.query(`INSERT INTO app_user (id, full_name, occupation, email, role, authorisation_number, passcode_hash)
                  VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET passcode_hash = EXCLUDED.passcode_hash, email = EXCLUDED.email, role = EXCLUDED.role`,
    [id, name, occ, email, role, auth, hashPasscode('pass-' + role)]);
}
const app = buildApp(db, { requireAuth: true });
const api = request(app);
const loginAs = async (email, role) => {
  const r = await api.post('/api/auth/login').send({ email, passcode: 'pass-' + role, deviceId: 'd-' + role });
  return { authorization: `Bearer ${r.body.token}` };
};
const cert = await loginAs('compliancecertifier@assuresafety.co.nz', 'certifier');
const rev = await loginAs('reviewer@assuresafety.co.nz', 'reviewer');
const view = await loginAs('viewer@assuresafety.co.nz', 'viewer');
const ev = (type, payload, extra = {}) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString(), ...extra });
const sync = (who, events) => api.post('/api/sync').set(who).send({ deviceId: 'd', events });
const newJob = async (name) => (await api.post('/api/jobs').set(cert).send({ client: { legalName: name }, site: { address: '1 Test Road' }, location: { name: `${name} store` }, classKey: 'class_6_8' })).body;
const LOC = ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'];
const openAt = async (job) => {
  const s = await sync(cert, [
    ev('job.transition', { jobId: job.jobId, toStage: 'application' }),
    ev('job.transition', { jobId: job.jobId, toStage: 'document_review' }),
    ev('job.transition', { jobId: job.jobId, toStage: 'site_inspection' }),
    ev('inspection.open', { jobId: job.jobId, hsLocationId: job.hsLocationId, equipmentUsed: 'x', templateCodes: LOC }),
  ]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  return s.body.applied[3].result.inspectionId;
};

const A = await newJob('Job A Ltd');
const B = await newJob('Job B Ltd');
const inspA = await openAt(A);
const inspB = await openAt(B);

await step('a malformed id in a payload is rejected and does not poison history', async () => {
  const s = await sync(view, [ev('nope.type', { jobId: 'abc' })]);
  expect(s.status === 200 && s.body.rejected.length === 1 && /positive integer/.test(s.body.rejected[0].reason), JSON.stringify(s.body));
  const s2 = await sync(rev, [ev('communication.record', { jobId: 1.5, direction: 'inbound', medium: 'email', party: 'x', summary: 'x' })]);
  expect(s2.body.rejected.length === 1, JSON.stringify(s2.body));
  const j = await api.get(`/api/jobs/${A.jobId}`).set(cert);
  expect(j.status === 200, `job GET ${j.status} ${j.text}`);
  const d = await api.get('/api/dashboard').set(cert);
  expect(d.status === 200, `dashboard ${d.status}`);
});

await step('data errors are rejections or 4xx, never 500', async () => {
  const s = await sync(cert, [
    ev('evidence.attach', { jobId: A.jobId, inspectionId: inspA, sha256: 'f'.repeat(65), storageKey: 'k', mime: 'image/png', bytes: 1 }),
    ev('communication.record', { jobId: A.jobId, direction: 'inbound', medium: 'email', party: 'x', summary: 'x' }, { occurredAt: 'garbage' }),
  ]);
  expect(s.status === 200 && s.body.rejected.length === 2, `${s.status} ${JSON.stringify(s.body)}`);
  const bad = await api.post('/api/jobs').set(cert).set('content-type', 'application/json').send('{not json');
  expect(bad.status === 400, `malformed body ${bad.status}`);
  const num = await api.patch('/api/users/2').set(cert).send({ fullName: 123 });
  expect(num.status === 400, `numeric name ${num.status}`);
  const nf = await api.get('/api/jobs/abc').set(cert);
  expect(nf.status === 404, `/api/jobs/abc ${nf.status}`);
});

await step('a payload cannot reach another job\'s inspection, finding or location', async () => {
  const s = await sync(cert, [
    ev('evidence.attach', { jobId: A.jobId, inspectionId: inspB, sha256: 'a'.repeat(64), storageKey: 'k.png', mime: 'image/png', bytes: 1 }),
    ev('inspection.open', { jobId: A.jobId, hsLocationId: B.hsLocationId, equipmentUsed: 'x', templateCodes: LOC }),
  ]);
  expect(s.body.rejected.length === 2, JSON.stringify(s.body));
  // A bare itemId from a sheet this inspection is not pinned to is refused.
  const other = await db.query(`SELECT i.id FROM checksheet_item i JOIN checksheet_section s ON s.id = i.section_id JOIN checksheet_template t ON t.id = s.template_id WHERE t.code = 'ci-cylinder-importation-fern' LIMIT 1`);
  const s2 = await sync(cert, [ev('finding.upsert', { inspectionId: inspA, itemId: other.rows[0].id, status: 'compliant' })]);
  expect(s2.body.rejected.length === 1, JSON.stringify(s2.body));
  const j = await api.get(`/api/jobs/${A.jobId}`).set(cert);
  expect(j.body.findings.length === 0 && j.body.evidence.length === 0, 'nothing leaked onto job A');
});

await step('a same-stage transition and an unknown job are refused, not rewritten', async () => {
  const s = await sync(rev, [
    ev('job.transition', { jobId: A.jobId, toStage: 'site_inspection', reason: 'reviewer typed this' }),
    ev('job.transition', { jobId: 99999, toStage: 'application' }),
  ]);
  expect(s.body.rejected.length === 2, JSON.stringify(s.body));
  const j = await api.get(`/api/jobs/${A.jobId}`).set(cert);
  const last = j.body.transitions[j.body.transitions.length - 1];
  expect(last.to_stage === 'site_inspection' && !last.reason, JSON.stringify(last));
});

await step('a viewer cannot record through the site-block or upload routes; evidence keys are keys', async () => {
  const sb = await api.post(`/api/jobs/${A.jobId}/site-block`).set(view).send({ contacts: [{ name: 'x' }] });
  expect(sb.status === 403, `site-block ${sb.status}`);
  const up = await api.post('/api/evidence/upload').set(view).set('content-type', 'image/png').send(Buffer.from([1, 2, 3]));
  expect(up.status === 403, `upload ${up.status}`);
  const tr = await api.get('/api/evidence/..%2Fpackage.json').set(cert);
  expect(tr.status === 404, `traversal ${tr.status}`);
});

await step('the certificate names the signed-in certifier and checks the inspection is the job\'s', async () => {
  const all = (await db.query(`SELECT i.id FROM checksheet_item i JOIN checksheet_section s ON s.id = i.section_id JOIN checksheet_template t ON t.id = s.template_id JOIN inspection_template p ON p.template_id = t.id WHERE p.inspection_id = $1`, [inspA])).rows;
  const s = await sync(cert, [
    ...all.map((r) => ev('finding.upsert', { inspectionId: inspA, itemId: r.id, status: 'compliant', verificationMethod: 'Sighted' })),
    ev('interest.declare', { jobId: A.jobId, conflictFound: false }),
    ev('inspection.sign', { inspectionId: inspA, which: 'declaration' }),
    ev('job.transition', { jobId: A.jobId, toStage: 'compliance_evaluation' }),
    ev('job.transition', { jobId: A.jobId, toStage: 'final_validation' }),
  ]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  const wrong = await api.post(`/api/jobs/${A.jobId}/certificate`).set(cert).send({ inspectionId: inspB, decision: 'granted', certificateNumber: 'TST100250-X', issuedTo: 'x', appliesTo: 'x', issueDate: '2026-09-11' });
  expect(wrong.status === 400, `other job's inspection ${wrong.status}`);
  const spoof = await api.post(`/api/jobs/${A.jobId}/certificate`).set(cert).send({ inspectionId: inspA, certifierId: 2, decision: 'granted', certificateNumber: 'NOPREFIX-1', issuedTo: 'x', appliesTo: 'x', issueDate: '2026-09-11' });
  expect(spoof.status === 422, `certifierId spoof should hit the prefix guard as the real certifier: ${spoof.status} ${spoof.text}`);
  const ok = await api.post(`/api/jobs/${A.jobId}/certificate`).set(cert).send({ inspectionId: inspA, certifierId: 2, decision: 'granted', certificateNumber: 'TST100250-OK', issuedTo: 'x', appliesTo: 'x', issueDate: '2026-09-11' });
  expect(ok.status === 201, `${ok.status} ${ok.text}`);
  const who = await db.query(`SELECT certifier_id FROM certificate WHERE job_id = $1`, [A.jobId]);
  expect(Number(who.rows[0].certifier_id) === 1, `certifier_id ${who.rows[0].certifier_id}`);
});

await step('a replayed applied event carries its original result', async () => {
  const C = await newJob('Job C Ltd');
  const open = ev('inspection.open', { jobId: C.jobId, hsLocationId: C.hsLocationId, equipmentUsed: 'x', templateCodes: LOC });
  await sync(cert, [ev('job.transition', { jobId: C.jobId, toStage: 'application' }), ev('job.transition', { jobId: C.jobId, toStage: 'document_review' }), ev('job.transition', { jobId: C.jobId, toStage: 'site_inspection' })]);
  const first = await sync(cert, [open]);
  const again = await sync(cert, [open]);
  expect(again.body.duplicate.length === 1 && again.body.duplicate[0].result?.inspectionId === first.body.applied[0].result.inspectionId, JSON.stringify(again.body));
});

await step('reopening a verified corrective action needs a certifier; a bad import stage is a 400', async () => {
  const B2 = await newJob('Job D Ltd');
  const insp = await openAt(B2);
  const item = (await db.query(`SELECT i.id FROM checksheet_item i JOIN checksheet_section s ON s.id = i.section_id JOIN checksheet_template t ON t.id = s.template_id JOIN inspection_template p ON p.template_id = t.id WHERE p.inspection_id = $1 LIMIT 1`, [insp])).rows[0].id;
  let s = await sync(cert, [ev('finding.upsert', { inspectionId: insp, itemId: item, status: 'non_compliant', failureReason: 'x' })]);
  const findingId = s.body.applied[0].result.findingId;
  s = await sync(cert, [ev('corrective_action.raise', { inspectionId: insp, findingId, severity: 'minor', description: 'x', dueDate: '2026-10-01' })]);
  const j = await api.get(`/api/jobs/${B2.jobId}`).set(cert);
  const ca = j.body.correctiveActions[0];
  expect(ca, `no corrective action: ${JSON.stringify(s.body)}`);
  s = await sync(cert, [ev('corrective_action.update', { correctiveActionId: ca.id, status: 'verified' })]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  s = await sync(rev, [ev('corrective_action.update', { correctiveActionId: ca.id, status: 'open' })]);
  expect(s.body.rejected.length === 1 && s.body.rejected[0].clause === 'Role', JSON.stringify(s.body));
  const imp = await api.post('/api/jobs/import').set(cert).send({ client: { legalName: 'x' }, site: { address: 'x' }, location: { name: 'x' }, stage: 'nowhere' });
  expect(imp.status === 400, `import stage ${imp.status}`);
  const sub = await sync(cert, [ev('job.subject.set', { jobId: B2.jobId, fields: [1, 2] })]);
  expect(sub.body.rejected.length === 1, JSON.stringify(sub.body));
});

await step('granted needs every non-compliance closed; conditional does not; a move keeps its own date; the set must be authorised', async () => {
  const E = await newJob('Job E Ltd');
  const insp = await openAt(E);
  const item = (await db.query(`SELECT i.id FROM checksheet_item i JOIN checksheet_section s ON s.id = i.section_id JOIN checksheet_template t ON t.id = s.template_id JOIN inspection_template p ON p.template_id = t.id WHERE p.inspection_id = $1 LIMIT 1`, [insp])).rows[0].id;
  const backdated = new Date(Date.now() - 12 * 86400e3).toISOString();
  let s = await sync(cert, [
    ev('finding.upsert', { inspectionId: insp, itemId: item, status: 'non_compliant', failureReason: 'x' }),
    ev('interest.declare', { jobId: E.jobId, conflictFound: false }),
    ev('inspection.sign', { inspectionId: insp, which: 'declaration' }),
    ev('job.transition', { jobId: E.jobId, toStage: 'compliance_evaluation' }, { occurredAt: backdated }),
    ev('job.transition', { jobId: E.jobId, toStage: 'final_validation' }),
  ]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  const j = await api.get(`/api/jobs/${E.jobId}`).set(cert);
  const moved = j.body.transitions.find((t) => t.to_stage === 'compliance_evaluation');
  expect(Math.abs(new Date(moved.occurred_at) - new Date(backdated)) < 1000, `transition kept its date: ${moved.occurred_at}`);
  const granted = await api.post(`/api/jobs/${E.jobId}/certificate`).set(cert).send({ inspectionId: insp, decision: 'granted', certificateNumber: 'TST100250-E', issuedTo: 'x', appliesTo: 'x', issueDate: '2026-09-11' });
  expect(granted.status === 422 && /reg 13.39/.test(granted.text), `granted over open NC: ${granted.status} ${granted.text}`);
  const cond = await api.post(`/api/jobs/${E.jobId}/certificate`).set(cert).send({ inspectionId: insp, decision: 'conditional', conditions: ['Close the finding within 30 days'], certificateNumber: 'TST100250-E', issuedTo: 'x', appliesTo: 'x', issueDate: '2026-09-11' });
  expect(cond.status === 201, `conditional: ${cond.status} ${cond.text}`);
  const outside = await api.post('/api/jobs').set(cert).send({ client: { legalName: 'x' }, site: { address: 'x' }, location: { name: 'x' }, classKey: 'class_2_3' });
  expect(outside.status === 400 && /authorisation/.test(outside.text), `outside authorisation: ${outside.status}`);
  const unknown = await api.post('/api/jobs').set(cert).send({ client: { legalName: 'x' }, site: { address: 'x' }, location: { name: 'x' }, classKey: 'nope' });
  expect(unknown.status === 400, `unknown set: ${unknown.status}`);
});

await db.close();
console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
