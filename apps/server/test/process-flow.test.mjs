#!/usr/bin/env node
/**
 * Stages 5 to 8 of the process flow, driven the way the Job screen drives
 * them: corrective actions raised and verified through /api/sync, the
 * interest declaration, the legal next stages the server offers, the
 * issuance dry-run, and the certificate.
 *
 * api.e2e covers the whole G2 job with the workbook's data. This one is the
 * screen's contract: what the app sends and what it must get back.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';

import { connect, migrate } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const db = await connect({ url: null });
await migrate(db);
await db.query(`INSERT INTO app_user (id, full_name, occupation, authorisation_number)
                VALUES (1,'Bryan Wilson','Compliance certifier','TST100250') ON CONFLICT DO NOTHING`);
const app = buildApp(db);
const api = request(app);
const H = { 'x-device-id': 'ipad-test', 'x-user-id': '1' };
const NOUSER = { 'x-device-id': 'ipad-test' };
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = (events, h = H) => api.post('/api/sync').set(h).send({ deviceId: 'ipad-test', userId: h['x-user-id'] ? 1 : null, events });
const job = async () => (await api.get(`/api/jobs/${jobId}`).set(H)).body;

let jobId, hsLocationId, inspectionId, ncFindingId, caId;

await step('create the job and walk it to site inspection', async () => {
  const r = await api.post('/api/jobs').set(H).send({
    client: { legalName: 'Argenta Manufacturing Limited' },
    site: { address: '2 Sterling Avenue' },
    location: { name: 'G2 Chiller' },
    classKey: 'class_6_8',
  });
  expect(r.status === 201, `job create ${r.status}`);
  jobId = r.body.jobId; hsLocationId = r.body.hsLocationId;
  const j0 = await job();
  expect(JSON.stringify(j0.allowedNext) === JSON.stringify(['application', 'closed', 'referred']),
    `enquiry may go to ${JSON.stringify(j0.allowedNext)}`);
  const s = await sync([
    ev('communication.record', { jobId, direction: 'inbound', medium: 'phone', party: 'Jesh Chandra',
      summary: 'Enquiry: LCC for G2 Chiller, classes 6.1B and 6.1C' }),
    ev('communication.record', { jobId, direction: 'outbound', medium: 'email', party: 'Jesh Chandra',
      summary: 'Sent application form, required documents checklist, terms and fee estimate' }),
    ev('job.transition', { jobId, toStage: 'application' }),
    ev('job.transition', { jobId, toStage: 'document_review' }),
  ]);
  expect(s.body.applied.length === 4, `applied ${s.body.applied.length}: ${JSON.stringify(s.body.rejected)}`);
  const j = await job();
  expect(j.communications.length === 2 && j.communications[0].direction === 'inbound',
    `communications ${JSON.stringify(j.communications)}`);
  return `job ${jobId} at document_review with ${j.communications.length} communications on record`;
});

await step('stage 3: RFI with a list of gaps, the answer, and back to document review', async () => {
  const s = await sync([
    ev('communication.record', { jobId, direction: 'outbound', medium: 'email', party: 'Jesh Chandra',
      summary: 'Request for further information', body: 'Current SDS for Abamectin\nEmergency response plan' }),
    ev('job.transition', { jobId, toStage: 'rfi', reason: 'RFI issued' }),
  ]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  let j = await job();
  expect(j.stage === 'rfi' && JSON.stringify(j.allowedNext) === JSON.stringify(['document_review']),
    `rfi allows ${JSON.stringify(j.allowedNext)}`);
  const s2 = await sync([
    ev('communication.record', { jobId, direction: 'inbound', medium: 'email', party: 'Jesh Chandra',
      summary: 'SDS and ERP received' }),
    ev('job.transition', { jobId, toStage: 'document_review', reason: 'RFI answered' }),
    ev('job.transition', { jobId, toStage: 'site_inspection' }),
    ev('inspection.open', { jobId, hsLocationId, equipmentUsed: 'iPad and tape measure',
      templateCodes: ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'] }),
  ]);
  expect(s2.body.rejected.length === 0, JSON.stringify(s2.body.rejected));
  inspectionId = s2.body.applied[3].result.inspectionId;
  j = await job();
  const rfi = j.communications.find((c) => c.summary === 'Request for further information');
  expect(rfi && rfi.body.includes('Emergency response plan'), 'the gap list is not on record');
  expect(j.transitions.some((t) => t.to_stage === 'rfi' && t.reason === 'RFI issued'), 'RFI move not in history');
  return `${j.communications.length} communications, stage ${j.stage}`;
});

await step('record one non-compliance and mark every other item compliant', async () => {
  const t = (await api.get('/api/templates').set(H)).body;
  const events = [];
  for (const code of ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8']) {
    const full = (await api.get(`/api/templates/${code}`).set(H)).body;
    for (const s of full.sections) for (const i of s.items) {
      const nc = code === 'wks17-general' && s.ordinal === 4 && i.ordinal === 4;
      events.push(ev('finding.upsert', {
        inspectionId, templateCode: code, sectionOrdinal: s.ordinal, itemOrdinal: i.ordinal,
        status: nc ? 'non_compliant' : 'compliant',
        failureReason: nc ? 'reg 2.6(3): no signage at the room entrance' : null,
        verificationMethod: 'Sighted on site',
      }));
    }
  }
  const s = await sync(events);
  expect(s.body.rejected.length === 0, `rejected: ${JSON.stringify(s.body.rejected)}`);
  const j = await job();
  const nc = j.findings.filter((f) => f.status === 'non_compliant');
  expect(nc.length === 1, `non-compliances: ${nc.length}`);
  ncFindingId = nc[0].id;
  return `${t.length} templates, ${events.length} findings, finding ${ncFindingId} non-compliant`;
});

await step('stage 5: raise a corrective action by sheet/section/item, the way the app keys findings', async () => {
  const s = await sync([ev('corrective_action.raise', {
    inspectionId, templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 4,
    severity: 'major', description: 'Install compliant hazard signage at the G2 Chiller entrance',
    dueDate: '2026-10-01',
  })]);
  expect(s.body.applied.length === 1, JSON.stringify(s.body.rejected));
  caId = s.body.applied[0].result.correctiveActionId;
  expect(s.body.applied[0].result.findingId === ncFindingId, 'resolved to the wrong finding');
  const j = await job();
  const ca = j.correctiveActions.find((c) => c.id === caId);
  expect(ca && ca.status === 'open' && ca.template_code === 'wks17-general' && ca.section_ordinal === 4,
    `payload carries ${JSON.stringify(j.correctiveActions)}`);
  return `corrective action ${caId} open, due ${ca.due_date}`;
});

await step('a corrective action cannot be verified without an authenticated verifier (reg 6.24)', async () => {
  const s = await sync([ev('corrective_action.update', { correctiveActionId: caId, status: 'verified' })], NOUSER);
  expect(s.body.rejected.length === 1, `expected rejection, got ${JSON.stringify(s.body)}`);
  expect(s.body.rejected[0].clause === 'reg 6.24', `clause ${s.body.rejected[0].clause}`);
  return s.body.rejected[0].reason;
});

await step('the issuance dry-run names the blockers while the action is open', async () => {
  const c = (await api.get(`/api/jobs/${jobId}/issuance-check`).set(H)).body;
  expect(c.canGrant === false, 'should not be grantable');
  expect(c.unresolvedNonCompliances === 1, `unresolved ${c.unresolvedNonCompliances}`);
  expect(c.blockers.some((b) => b.clause === 'IPS 23(1)'), `blockers ${JSON.stringify(c.blockers)}`);
});

await step('resolve, then verify as the signed-in certifier; declare interests (IPS 23)', async () => {
  const s = await sync([
    ev('corrective_action.update', { correctiveActionId: caId, status: 'resolved' }),
    ev('corrective_action.update', { correctiveActionId: caId, status: 'verified' }),
    ev('interest.declare', { jobId, conflictFound: false }),
  ]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  const j = await job();
  const ca = j.correctiveActions.find((c) => c.id === caId);
  expect(ca.status === 'verified' && ca.reverified_by === 1 && ca.reverified_at, JSON.stringify(ca));
  expect(j.interestDeclarations.length === 1, 'interest declaration missing');
});

await step('stages 5 and 6: compliance evaluation, final validation; the dry-run clears', async () => {
  const s = await sync([
    ev('job.transition', { jobId, toStage: 'compliance_evaluation' }),
    ev('job.transition', { jobId, toStage: 'final_validation', reason: 'All corrective actions verified' }),
  ]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  const j = await job();
  expect(j.stage === 'final_validation', `stage ${j.stage}`);
  expect(j.allowedNext.includes('certificate_issued'), `allowedNext ${j.allowedNext}`);
  const c = (await api.get(`/api/jobs/${jobId}/issuance-check`).set(H)).body;
  expect(c.canGrant === true && c.blockers.length === 0, JSON.stringify(c));
  const last = j.transitions[j.transitions.length - 1];
  expect(last.reason === 'All corrective actions verified' && last.actor_id === 1, JSON.stringify(last));
});

await step('stage 7: issue the certificate from the screen payload; retention and register deadline set', async () => {
  const r = await api.post(`/api/jobs/${jobId}/certificate`).set(H).send({
    inspectionId, decision: 'granted',
    certificateNumber: 'TST100250-2026-0001',
    issuedTo: 'Jesh Chandra', appliesTo: '2 Sterling Avenue, Manurewa East, Auckland 2102',
    issueDate: '2026-09-10', expiryDate: '2027-09-10',
    details: 'Location compliance certificate, G2 Chiller, classes 6.1B and 6.1C',
  });
  expect(r.status === 201, `${r.status} ${r.text}`);
  expect(r.body.retainUntil && r.body.worksafeRegisterDue, JSON.stringify(r.body));
  const j = await job();
  expect(j.stage === 'certificate_issued' && j.certificate?.decision === 'granted', JSON.stringify({ s: j.stage, c: j.certificate }));
  expect(String(j.retention.retain_until).startsWith('2032-09-10'), `retain_until ${j.retention.retain_until}`);
  const html = await api.get(`/api/jobs/${jobId}/certificate.html`).set(H);
  expect(html.status === 200 && html.text.includes('TST100250-2026-0001'), 'certificate page missing the number');
  return `retain until ${j.retention.retain_until}, WorkSafe register due ${j.certificate.worksafe_register_due}`;
});

await step('stage 8: monitoring is the only forward move; renewal re-enters at enquiry', async () => {
  const j = await job();
  expect(JSON.stringify(j.allowedNext) === JSON.stringify(['monitoring', 'closed']), JSON.stringify(j.allowedNext));
  const s = await sync([ev('job.transition', { jobId, toStage: 'monitoring' })]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  const j2 = await job();
  expect(j2.allowedNext.includes('enquiry'), `renewal path missing: ${j2.allowedNext}`);
});

console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
