#!/usr/bin/env node
/**
 * Loops 1 to 4 from the 10 September call: roles enforced per event, the
 * audit trail by person, the dashboard, the non-compliance report, sending
 * (recorded even when no mail is configured), importing a past workbook's
 * findings, and the sheet-set catalogue tied to the WorkSafe authorisation.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';

import { connect, migrate, seedDefaults } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

process.env.ASSURE_PASSCODE = 'cert-1';
process.env.ASSURE_PASSCODE_REVIEWER = 'rev-1';
process.env.ASSURE_PASSCODE_VIEWER = 'view-1';
delete process.env.SMTP_URL;
const db = await connect({ url: null });
await migrate(db);
await seedDefaults(db);
const app = buildApp(db, { requireAuth: true });
const api = request(app);

const tokens = {};
const login = async (email, passcode, deviceId) => {
  const r = await api.post('/api/auth/login').send({ email, passcode, deviceId });
  expect(r.status === 200, `login ${email}: ${r.status} ${r.text}`);
  return r.body.token;
};
const H = (t, dev = 'd') => ({ authorization: `Bearer ${t}`, 'x-device-id': dev });
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = (t, events, dev = 'd') => api.post('/api/sync').set(H(t, dev)).send({ deviceId: dev, events });

let jobId, hsLocationId, inspectionId;

await step('three people can sign in: certifier, reviewer, viewer, each with a role', async () => {
  tokens.cert = await login('compliancecertifier@assuresafety.co.nz', 'cert-1', 'ipad-bryan');
  tokens.rev = await login('reviewer@assuresafety.co.nz', 'rev-1', 'laptop-reviewer');
  tokens.view = await login('viewer@assuresafety.co.nz', 'view-1', 'phone-viewer');
  const me = await api.get('/api/auth/me').set(H(tokens.rev));
  expect(me.body.role === 'reviewer', JSON.stringify(me.body));
});

await step('the sheet-set catalogue marks what TST100250 may certify', async () => {
  const r = await api.get('/api/sheet-sets').set(H(tokens.view));
  expect(r.status === 200, `${r.status}`);
  const c68 = r.body.sets.find((x) => x.key === 'class_6_8');
  const c23 = r.body.sets.find((x) => x.key === 'class_2_3');
  expect(c68.authorised === true && c68.name === 'Location: classes 6 or 8', JSON.stringify(c68));
  expect(c68.authorisationEntry.regulation.includes('13.38'), 'register entry missing');
  expect(c23.authorised === false, 'class 2/3.1 is outside the authorisation');
  expect(r.body.certifier.number === 'TST100250', 'certifier number');
  return `${r.body.sets.length} sets, ${r.body.planned.length} planned`;
});

await step('a viewer can read but not create or record', async () => {
  const c = await api.post('/api/jobs').set(H(tokens.view)).send({ client: { legalName: 'X' }, site: { address: 'Y' }, location: { name: 'Z' } });
  expect(c.status === 403 && c.body.clause === 'Role', `${c.status} ${c.text}`);
  const j = await api.get('/api/jobs').set(H(tokens.view));
  expect(j.status === 200, 'viewer should read the board');
});

await step('a reviewer creates the job, walks it to site inspection, opens and records findings', async () => {
  const r = await api.post('/api/jobs').set(H(tokens.rev)).send({
    client: { legalName: 'Argenta Manufacturing Limited' }, site: { address: '2 Sterling Avenue' },
    location: { name: 'G2 Chiller' }, classKey: 'class_6_8',
    contacts: [{ name: 'Jesh Chandra', role: 'Site manager', email: 'jesh@example.com', isSiteManager: true }],
  });
  expect(r.status === 201, `${r.status} ${r.text}`);
  jobId = r.body.jobId; hsLocationId = r.body.hsLocationId;
  const s = await sync(tokens.rev, [
    ev('job.transition', { jobId, toStage: 'application' }),
    ev('job.transition', { jobId, toStage: 'document_review' }),
    ev('job.transition', { jobId, toStage: 'site_inspection' }),
    ev('inspection.open', { jobId, hsLocationId, equipmentUsed: 'iPad', templateCodes: ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'] }),
  ], 'laptop-reviewer');
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  inspectionId = s.body.applied[3].result.inspectionId;
  const f = await sync(tokens.rev, [
    ev('finding.upsert', { inspectionId, templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 4,
      status: 'non_compliant', failureReason: 'reg 2.6(3): no signage at the room entrance', comment: 'Door unmarked' }),
    ev('finding.upsert', { inspectionId, templateCode: 'wks17-general', sectionOrdinal: 1, itemOrdinal: 1, status: 'compliant' }),
    ev('corrective_action.raise', { inspectionId, templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 4,
      severity: 'major', description: 'Install compliant signage at the entrance', dueDate: new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10) }),
  ], 'laptop-reviewer');
  expect(f.body.rejected.length === 0, JSON.stringify(f.body.rejected));
});

await step('a reviewer cannot sign, declare interests, verify, or issue; each refusal names the role', async () => {
  const ca = (await api.get(`/api/jobs/${jobId}`).set(H(tokens.rev))).body.correctiveActions[0];
  const s = await sync(tokens.rev, [
    ev('inspection.sign', { inspectionId, which: 'declaration' }),
    ev('interest.declare', { jobId, conflictFound: false }),
    ev('corrective_action.update', { correctiveActionId: ca.id, status: 'verified' }),
    ev('corrective_action.update', { correctiveActionId: ca.id, status: 'resolved' }),
  ], 'laptop-reviewer');
  expect(s.body.rejected.length === 3 && s.body.applied.length === 1, JSON.stringify(s.body));
  expect(s.body.rejected.every((r) => r.clause === 'Role'), JSON.stringify(s.body.rejected));
  const issue = await api.post(`/api/jobs/${jobId}/certificate`).set(H(tokens.rev)).send({ decision: 'granted' });
  expect(issue.status === 403 && issue.body.clause === 'Role', `${issue.status}`);
  return s.body.rejected[0].reason;
});

await step('the certifier does what the reviewer could not; the audit trail names both people', async () => {
  const s = await sync(tokens.cert, [
    ev('interest.declare', { jobId, conflictFound: false }),
    ev('inspection.sign', { inspectionId, which: 'declaration' }),
  ], 'ipad-bryan');
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  const j = (await api.get(`/api/jobs/${jobId}`).set(H(tokens.cert))).body;
  const names = new Set(j.events.map((e) => e.user_name));
  expect(names.has('Bryan Wilson') && names.has('Document reviewer'), `events by ${[...names].join(', ')}`);
  const signed = j.events.find((e) => e.type === 'inspection.sign' && e.outcome === 'applied');
  expect(signed, `no applied signature among ${JSON.stringify(j.events.map((e) => [e.type, e.outcome, e.user_name]))}`);
  expect(signed.user_name === 'Bryan Wilson', 'signature not attributed to the certifier');
  const refused = j.events.find((e) => e.type === 'inspection.sign' && e.outcome === 'rejected');
  expect(refused.user_name === 'Document reviewer' && refused.reject_clause === 'Role', 'refusal not on record');
  return `${j.events.length} events on the job`;
});

await step('the non-compliance report lists the item in the sheet\'s words with its action', async () => {
  const r = await api.get(`/api/jobs/${jobId}/non-compliance.html`).set(H(tokens.view));
  expect(r.status === 200, `${r.status}`);
  expect(r.text.includes('Verify that compliant signage'), 'requirement wording missing');
  expect(r.text.includes('no signage at the room entrance'), 'reason missing');
  expect(r.text.includes('Install compliant signage at the entrance'), 'corrective action missing');
  expect(r.text.includes('59A Vintage Drive'), 'letterhead missing');
});

await step('sending records a communication even with no mail server configured', async () => {
  const r = await api.post(`/api/jobs/${jobId}/send`).set(H(tokens.rev)).send({ document: 'non_compliance', to: 'jesh@example.com' });
  expect(r.status === 200 && r.body.sent === false, `${r.status} ${r.text}`);
  const j = (await api.get(`/api/jobs/${jobId}`).set(H(tokens.rev))).body;
  const c = j.communications.find((x) => x.party === 'jesh@example.com');
  expect(c && c.summary.includes('non-compliance report') && c.summary.includes('not sent'), JSON.stringify(j.communications));
  const cert = await api.post(`/api/jobs/${jobId}/send`).set(H(tokens.rev)).send({ document: 'certificate', to: 'jesh@example.com' });
  expect(cert.status === 403, 'a reviewer must not send a certificate');
  return c.summary;
});

await step('the dashboard carries the corrective action due soon and the activity by person', async () => {
  const r = await api.get('/api/dashboard').set(H(tokens.cert));
  expect(r.status === 200, `${r.status}`);
  expect(r.body.reminders.some((x) => x.kind === 'action' && x.jobId === jobId), JSON.stringify(r.body.reminders));
  // The imported job below has not run yet; this job has an action, so no 'no_action' reminder for it.
  expect(!r.body.reminders.some((x) => x.kind === 'no_action' && x.jobId === jobId), 'a finding with an action must not be flagged');
  expect(r.body.activity.length >= 5 && r.body.activity[0].user_name, JSON.stringify(r.body.activity[0]));
  expect(r.body.activity.every((a) => a.job_id === jobId), 'activity should resolve the job');
  expect(r.body.mailConfigured === false, 'mail flag');
  return `${r.body.reminders.length} reminders, ${r.body.activity.length} events`;
});

await step('a past workbook imports as a job at site inspection with its findings', async () => {
  const r = await api.post('/api/jobs/import').set(H(tokens.cert)).send({
    client: { legalName: 'Old Client Ltd' }, site: { address: '1 Past Road' }, location: { name: 'Store A' },
    classKey: 'class_6_8', stage: 'site_inspection',
    inspection: { inspectedAt: '2025-03-04T00:00:00Z', equipmentUsed: 'iPad and tape measure' },
    findings: [
      { templateCode: 'wks17-general', sectionOrdinal: 1, itemOrdinal: 1, status: 'compliant', comment: 'from workbook' },
      { templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 4, status: 'non_compliant', failureReason: 'No signage' },
    ],
  });
  expect(r.status === 201, `${r.status} ${r.text}`);
  expect(r.body.findings === 2 && r.body.rejected.length === 0, JSON.stringify(r.body));
  const j = (await api.get(`/api/jobs/${r.body.jobId}`).set(H(tokens.cert))).body;
  expect(j.stage === 'site_inspection' && j.findings.length === 2, `${j.stage} ${j.findings.length}`);
  expect(j.inspections[0].inspected_at.startsWith('2025-03-04'), 'inspection date not kept');
  const asReviewer = await api.post('/api/jobs/import').set(H(tokens.rev)).send({ client: { legalName: 'X' }, site: { address: 'Y' }, location: { name: 'Z' } });
  expect(asReviewer.status === 403, 'import is for the certifier');
  return `job ${r.body.jobId} imported`;
});

console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
