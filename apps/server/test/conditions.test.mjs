#!/usr/bin/env node
/**
 * Conditions outstanding (phase 2, package B; Tatenda Katai, 20 Oct 2026, Q7).
 *
 * "A conditional certificate's assessment stays open until every condition is
 * met and approved by the certifier."
 *
 *   * a conditional issue creates one certificate_condition per condition,
 *     due on the certificate's conditions date (reg 6.24(2))
 *   * the job cannot move to monitoring or closed while one is unverified
 *     (reg 6.24)
 *   * condition.verify is the certifier's
 *   * the dashboard reminds: due within 14 days, overdue
 *
 * Test data only, own PGlite.
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
await db.query(`INSERT INTO app_user (id, full_name, occupation, authorisation_number, role)
                VALUES (1,'Bryan Wilson','Compliance certifier','TST100250','certifier') ON CONFLICT DO NOTHING`);
const reviewer = (await db.query(
  `INSERT INTO app_user (full_name, occupation, email, role) VALUES ('Conditions Reviewer','Reviewer',$1,'reviewer') RETURNING id`,
  [`cond.reviewer.${randomUUID().slice(0, 6)}@test.example`])).rows[0].id;
const BRYAN = 1;

const app = buildApp(db);
const api = request(app);
const as = (userId) => ({ 'x-device-id': `ipad-cond-${userId}`, 'x-user-id': String(userId) });
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const syncAs = (userId, events) => api.post('/api/sync').set(as(userId)).send({ deviceId: `ipad-cond-${userId}`, events });
const iso = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => iso(new Date(Date.now() + n * 86400e3));

/** A class 6/8 job at final validation with one open non-compliance. */
async function jobWithOneOpenFinding(name) {
  const r = await api.post('/api/jobs').set(as(BRYAN)).send({
    client: { legalName: `${name} Limited` }, site: { address: '1 Condition Road' },
    location: { name: 'Store' }, classKey: 'class_6_8',
  });
  expect(r.status === 201, `job ${r.status} ${r.text}`);
  const { jobId, hsLocationId } = r.body;
  const walk = (...to) => syncAs(BRYAN, to.map((toStage) => ev('job.transition', { jobId, toStage })));
  await walk('application', 'document_review', 'site_inspection');
  const o = await syncAs(BRYAN, [ev('inspection.open', { jobId, hsLocationId, equipmentUsed: 'iPad',
    templateCodes: ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'] })]);
  const inspectionId = o.body.applied[0].result.inspectionId;
  const events = [];
  for (const code of ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8']) {
    const full = (await api.get(`/api/templates/${code}`).set(as(BRYAN))).body;
    for (const s of full.sections) for (const i of s.items) {
      const nc = code === 'wks17-general' && s.ordinal === 4 && i.ordinal === 4;
      events.push(ev('finding.upsert', { inspectionId, templateCode: code, sectionOrdinal: s.ordinal, itemOrdinal: i.ordinal,
        status: nc ? 'non_compliant' : 'compliant', failureReason: nc ? 'no signage at the room entrance' : null }));
    }
  }
  events.push(ev('interest.declare', { jobId, conflictFound: false }));
  const s = await syncAs(BRYAN, events);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected).slice(0, 300));
  const w = await walk('compliance_evaluation', 'final_validation');
  expect(w.body.rejected.length === 0, JSON.stringify(w.body.rejected));
  return { jobId, inspectionId };
}

const issue = (jobId, inspectionId, extra) => api.post(`/api/jobs/${jobId}/certificate`).set(as(BRYAN)).send({
  inspectionId, decision: 'conditional', issuedTo: 'Site manager', appliesTo: '1 Condition Road',
  certificateNumber: `TST100250-2026-C${jobId}`, expiryDate: '2029-10-20', ...extra,
});

let job, conditions;

await step('a conditional issue creates one condition per line, due on the conditions date', async () => {
  job = await jobWithOneOpenFinding('Conditions Two');
  const due = daysFromNow(10);
  const r = await issue(job.jobId, job.inspectionId, {
    issueDate: daysFromNow(0), conditionsDue: due,
    conditions: ['Install signage at the room entrance (reg 2.6(3))', 'Bund the drum store'],
  });
  expect(r.status === 201, `${r.status} ${r.text}`);
  const j = (await api.get(`/api/jobs/${job.jobId}`).set(as(BRYAN))).body;
  conditions = j.conditions;
  expect(Array.isArray(conditions) && conditions.length === 2, JSON.stringify(conditions));
  expect(conditions[0].text.startsWith('Install signage') && conditions[0].ordinal === 1, JSON.stringify(conditions[0]));
  expect(conditions[0].regulation === '2.6(3)', `regulation ${conditions[0].regulation}`);
  expect(conditions.every((c) => String(c.due_date).startsWith(due) && !c.verified_at), JSON.stringify(conditions));
});

await step('the dashboard reminds of a condition due within 14 days', async () => {
  const d = (await api.get('/api/dashboard').set(as(BRYAN))).body;
  const mine = d.reminders.filter((r) => r.kind === 'condition' && Number(r.jobId) === job.jobId);
  expect(mine.length === 2, JSON.stringify(mine));
  expect(mine.every((r) => /^Condition due /.test(r.text)), JSON.stringify(mine.map((r) => r.text)));
});

await step('moving to monitoring (or closing) is refused while a condition is unverified (reg 6.24)', async () => {
  const m = await syncAs(BRYAN, [ev('job.transition', { jobId: job.jobId, toStage: 'monitoring' })]);
  expect(m.body.rejected[0]?.clause === 'reg 6.24', JSON.stringify(m.body));
  const c = await syncAs(BRYAN, [ev('job.transition', { jobId: job.jobId, toStage: 'closed' })]);
  expect(c.body.rejected[0]?.clause === 'reg 6.24', JSON.stringify(c.body));
});

await step('a reviewer cannot verify a condition', async () => {
  const r = await syncAs(reviewer, [ev('condition.verify', { jobId: job.jobId, conditionId: conditions[0].id, note: 'Saw it' })]);
  expect(r.body.rejected[0]?.clause === 'Role', JSON.stringify(r.body));
});

await step('verifying one is not enough; verifying both opens monitoring', async () => {
  const one = await syncAs(BRYAN, [ev('condition.verify', { jobId: job.jobId, conditionId: conditions[0].id, note: 'Signage photographed' })]);
  expect(one.body.applied.length === 1, JSON.stringify(one.body.rejected));
  const again = await syncAs(BRYAN, [ev('condition.verify', { jobId: job.jobId, conditionId: conditions[0].id })]);
  expect(again.body.rejected.length === 1, 'verified twice');
  const still = await syncAs(BRYAN, [ev('job.transition', { jobId: job.jobId, toStage: 'monitoring' })]);
  expect(still.body.rejected[0]?.clause === 'reg 6.24', JSON.stringify(still.body));
  const two = await syncAs(BRYAN, [ev('condition.verify', { jobId: job.jobId, conditionId: conditions[1].id, note: 'Bund installed' })]);
  expect(two.body.applied.length === 1, JSON.stringify(two.body.rejected));
  const j = (await api.get(`/api/jobs/${job.jobId}`).set(as(BRYAN))).body;
  expect(j.conditions.every((c) => c.verified_at && c.verified_by_name === 'Bryan Wilson'), JSON.stringify(j.conditions));
  expect(j.conditions[0].verification_note === 'Signage photographed', 'note');
  const hist = j.events.find((e) => e.type === 'condition.verify');
  expect(hist && hist.user_name === 'Bryan Wilson', 'history does not name the verifier');
  const mv = await syncAs(BRYAN, [ev('job.transition', { jobId: job.jobId, toStage: 'monitoring' })]);
  expect(mv.body.applied.length === 1, JSON.stringify(mv.body.rejected));
  const d = (await api.get('/api/dashboard').set(as(BRYAN))).body;
  expect(!d.reminders.some((r) => r.kind === 'condition' && Number(r.jobId) === job.jobId), 'verified conditions still remind');
});

await step('an overdue condition is reminded as overdue', async () => {
  const late = await jobWithOneOpenFinding('Conditions Overdue');
  const r = await issue(late.jobId, late.inspectionId, { issueDate: daysFromNow(-40), conditionsDue: daysFromNow(-3), conditions: ['Install signage'] });
  expect(r.status === 201, `${r.status} ${r.text}`);
  const d = (await api.get('/api/dashboard').set(as(BRYAN))).body;
  const mine = d.reminders.filter((x) => x.kind === 'condition' && Number(x.jobId) === late.jobId);
  expect(mine.length === 1 && /^Condition overdue /.test(mine[0].text), JSON.stringify(mine));
  const j = (await api.get(`/api/jobs/${late.jobId}`).set(as(BRYAN))).body;
  expect(j.conditions[0].overdue === true, 'overdue flag');
});

await step('with no conditions typed, the requirements not met become the conditions', async () => {
  const bare = await jobWithOneOpenFinding('Conditions From Requirements');
  // The conditions[] array is what the certificate requires; an empty one is
  // refused by the schema, so the app always sends lines. A granted or
  // refused certificate creates no conditions.
  const r = await issue(bare.jobId, bare.inspectionId, { decision: 'refused', issueDate: daysFromNow(0) });
  expect(r.status === 201, `${r.status} ${r.text}`);
  const j = (await api.get(`/api/jobs/${bare.jobId}`).set(as(BRYAN))).body;
  expect(j.conditions.length === 0, 'a refusal created conditions');
  const mv = await syncAs(BRYAN, [ev('job.transition', { jobId: bare.jobId, toStage: 'closed' })]);
  expect(mv.body.applied.length === 1, JSON.stringify(mv.body.rejected));
});

console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) process.exit(1);
