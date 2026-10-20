#!/usr/bin/env node
/**
 * Roles and peer review (phase 2, package B; Tatenda Katai, 20 Oct 2026, Q5/Q6).
 *
 *   peer reviewer  reads only jobs flagged for a reg 17.91 peer review, and
 *                  sends only peer_review.comment and peer_review.decide
 *   gate           a flagged job issues only after an approval of the job as
 *                  it stands (snapshot hash); an edit after approval lapses it
 *   second issuer  issues in their own login; the certificate names the
 *                  holder (Bryan Wilson, TST100250), issued_by and the event
 *                  log name who pressed Issue
 *   people         a reviewer with can_administer manages people; a plain
 *                  reviewer cannot; peer_reviewer is a role people can hold
 *   migration 016  runs twice without harm and flags the TST100250 holder
 *
 * Test data only, own PGlite.
 */

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
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
const person = async (name, role, extra = {}) => (await db.query(
  `INSERT INTO app_user (full_name, occupation, email, role, authorisation_number, can_administer)
   VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
  [name, role, `${name.toLowerCase().replace(/\W+/g, '.')}.${randomUUID().slice(0, 6)}@test.example`, role,
   extra.authorisationNumber ?? null, !!extra.canAdminister])).rows[0].id;

const second = await person('Second Certifier', 'certifier', { authorisationNumber: 'TST999001' });
const peer = await person('Peer Reviewer Test', 'peer_reviewer');
const reviewer = await person('Plain Reviewer Test', 'reviewer');
const adminReviewer = await person('Admin Reviewer Test', 'reviewer', { canAdminister: true });

const app = buildApp(db);
const api = request(app);
const as = (userId) => ({ 'x-device-id': `ipad-pr-${userId}`, 'x-user-id': String(userId) });
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const syncAs = (userId, events) => api.post('/api/sync').set(as(userId)).send({ deviceId: `ipad-pr-${userId}`, events });
const BRYAN = 1;

/** A class 6/8 job at final validation, every item compliant: it can be granted. */
async function readyJob(name, { peerReviewRequired = false } = {}) {
  const r = await api.post('/api/jobs').set(as(BRYAN)).send({
    client: { legalName: `${name} Limited` }, site: { address: '1 Peer Road' },
    location: { name: 'Tank farm' }, classKey: 'class_6_8', peerReviewRequired,
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
      events.push(ev('finding.upsert', { inspectionId, templateCode: code, sectionOrdinal: s.ordinal, itemOrdinal: i.ordinal, status: 'compliant' }));
    }
  }
  events.push(ev('interest.declare', { jobId, conflictFound: false }));
  const s = await syncAs(BRYAN, events);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected).slice(0, 300));
  const w = await walk('compliance_evaluation', 'final_validation');
  expect(w.body.rejected.length === 0, JSON.stringify(w.body.rejected));
  return { jobId, inspectionId };
}

const issueAs = (userId, jobId, inspectionId, extra) => api.post(`/api/jobs/${jobId}/certificate`).set(as(userId)).send({
  inspectionId, decision: 'granted', issuedTo: 'Site manager', appliesTo: '1 Peer Road',
  certificateNumber: `TST100250-2026-P${jobId}`, issueDate: '2026-10-20', expiryDate: '2029-10-20', ...extra,
});

let flagged, plain;

await step('a job is created flagged for peer review; another is not', async () => {
  flagged = await readyJob('Peer Flagged', { peerReviewRequired: true });
  plain = await readyJob('Peer Unflagged');
  const j = (await api.get(`/api/jobs/${flagged.jobId}`).set(as(BRYAN))).body;
  expect(j.peerReviewRequired === true && j.peerReviewState === 'not_requested', `${j.peerReviewRequired} ${j.peerReviewState}`);
  const u = (await api.get(`/api/jobs/${plain.jobId}`).set(as(BRYAN))).body;
  expect(u.peerReviewRequired === false && u.peerReviewState === 'not_required', `${u.peerReviewRequired} ${u.peerReviewState}`);
});

await step('the peer reviewer sees only flagged jobs on the board and cannot open an unflagged one', async () => {
  const board = await api.get('/api/jobs').set(as(peer));
  expect(board.status === 200, `${board.status}`);
  const ids = board.body.map((r) => Number(r.id));
  expect(ids.includes(flagged.jobId), 'flagged job missing');
  expect(!ids.includes(plain.jobId), 'unflagged job shown');
  expect(board.body.every((r) => r.peer_review_required === true), 'a non-flagged row on the board');
  const hidden = await api.get(`/api/jobs/${plain.jobId}`).set(as(peer));
  expect(hidden.status === 404, `unflagged job: ${hidden.status}`);
  const open = await api.get(`/api/jobs/${flagged.jobId}`).set(as(peer));
  expect(open.status === 200 && open.body.findings.length > 0, `flagged job: ${open.status}`);
  const pdf = await api.get(`/api/jobs/${plain.jobId}/checksheet.pdf`).set(as(peer));
  expect(pdf.status === 404, `unflagged PDF: ${pdf.status}`);
  const dash = await api.get('/api/dashboard').set(as(peer));
  expect(dash.status === 200 && dash.body.reminders.every((r) => Number(r.jobId) !== plain.jobId), 'dashboard leaks other jobs');
});

await step('the peer reviewer is refused every other event, and every write route', async () => {
  const r = await syncAs(peer, [
    ev('finding.upsert', { inspectionId: flagged.inspectionId, templateCode: 'wks17-general', sectionOrdinal: 1, itemOrdinal: 1, status: 'non_compliant', failureReason: 'x' }),
    ev('job.transition', { jobId: flagged.jobId, toStage: 'site_inspection' }),
    ev('communication.record', { jobId: flagged.jobId, direction: 'outbound', medium: 'email', party: 'x', summary: 'x' }),
    ev('peer_review.comment', { jobId: plain.jobId, body: 'on an unflagged job' }),
  ]);
  expect(r.body.applied.length === 0, `applied ${JSON.stringify(r.body.applied)}`);
  const clauses = r.body.rejected.map((x) => x.clause);
  expect(clauses.slice(0, 3).every((c) => c === 'Role'), `clauses ${clauses}`);
  expect(r.body.rejected[3].clause === 'reg 17.91', `unflagged comment: ${JSON.stringify(r.body.rejected[3])}`);
  const create = await api.post('/api/jobs').set(as(peer)).send({ client: { legalName: 'X' }, site: { address: 'x' }, location: { name: 'x' } });
  expect(create.status === 403 && create.body.clause === 'Role', `create job: ${create.status}`);
  const send = await api.post(`/api/jobs/${flagged.jobId}/send`).set(as(peer)).send({ document: 'non_compliance', to: 'a@b.c' });
  expect(send.status === 403, `send: ${send.status}`);
});

await step('a comment and an approval are recorded with the person', async () => {
  const c = await syncAs(peer, [ev('peer_review.comment', { jobId: flagged.jobId, body: 'Bund capacity checked against the 17.91 report.' })]);
  expect(c.body.applied.length === 1, JSON.stringify(c.body.rejected));
  const j = (await api.get(`/api/jobs/${flagged.jobId}`).set(as(BRYAN))).body;
  const mine = j.peerReviewComments.find((x) => x.body.startsWith('Bund capacity'));
  expect(mine && mine.author_name === 'Peer Reviewer Test', JSON.stringify(j.peerReviewComments));
  const hist = j.events.find((e) => e.type === 'peer_review.comment');
  expect(hist && hist.user_name === 'Peer Reviewer Test', 'history does not name the peer reviewer');
  // The certifier answers in the same thread.
  const a = await syncAs(BRYAN, [ev('peer_review.comment', { jobId: flagged.jobId, body: 'Report rev 2 attached.' })]);
  expect(a.body.applied.length === 1, JSON.stringify(a.body.rejected));
});

await step('only the peer reviewer decides; a request for changes needs a comment', async () => {
  const byCert = await syncAs(BRYAN, [ev('peer_review.decide', { jobId: flagged.jobId, decision: 'approved' })]);
  expect(byCert.body.rejected[0]?.clause === 'Role', `certifier decided: ${JSON.stringify(byCert.body)}`);
  const byRev = await syncAs(reviewer, [ev('peer_review.decide', { jobId: flagged.jobId, decision: 'approved' })]);
  expect(byRev.body.rejected[0]?.clause === 'Role', `reviewer decided: ${JSON.stringify(byRev.body)}`);
  const bare = await syncAs(peer, [ev('peer_review.decide', { jobId: flagged.jobId, decision: 'changes_requested' })]);
  expect(bare.body.rejected[0]?.clause === 'reg 17.91', `no comment: ${JSON.stringify(bare.body)}`);
  const ch = await syncAs(peer, [ev('peer_review.decide', { jobId: flagged.jobId, decision: 'changes_requested', comment: 'Add the bund calculation.' })]);
  expect(ch.body.applied.length === 1, JSON.stringify(ch.body.rejected));
  const j = (await api.get(`/api/jobs/${flagged.jobId}`).set(as(BRYAN))).body;
  expect(j.peerReviewState === 'changes_requested', j.peerReviewState);
});

await step('issuing a flagged job is refused without an approval (422, reg 17.91 peer review)', async () => {
  const r = await issueAs(BRYAN, flagged.jobId, flagged.inspectionId);
  expect(r.status === 422 && r.body.clause === 'reg 17.91 peer review', `${r.status} ${r.text}`);
  const chk = (await api.get(`/api/jobs/${flagged.jobId}/issuance-check`).set(as(BRYAN))).body;
  expect(chk.blockers.some((b) => b.clause === 'reg 17.91 peer review' && /Peer review: not approved/.test(b.reason)), JSON.stringify(chk.blockers));
  expect(chk.canGrant === false, 'can grant without peer review');
});

await step('approved, then an edit lapses it: issue refused again', async () => {
  const ok = await syncAs(peer, [ev('peer_review.decide', { jobId: flagged.jobId, decision: 'approved', comment: 'Approved.' })]);
  expect(ok.body.applied.length === 1, JSON.stringify(ok.body.rejected));
  let j = (await api.get(`/api/jobs/${flagged.jobId}`).set(as(BRYAN))).body;
  expect(j.peerReviewState === 'approved', j.peerReviewState);
  const latest = j.peerReviews[j.peerReviews.length - 1];
  expect(latest.reviewer_name === 'Peer Reviewer Test' && latest.decision === 'approved', JSON.stringify(latest));
  // An edit after the approval.
  const edit = await syncAs(BRYAN, [ev('finding.upsert', { inspectionId: flagged.inspectionId, templateCode: 'wks17-general',
    sectionOrdinal: 1, itemOrdinal: 1, status: 'compliant', comment: 'Re-checked after approval' })]);
  expect(edit.body.applied.length === 1, JSON.stringify(edit.body.rejected));
  j = (await api.get(`/api/jobs/${flagged.jobId}`).set(as(BRYAN))).body;
  expect(j.peerReviewState === 'lapsed', `state ${j.peerReviewState}`);
  const chk = (await api.get(`/api/jobs/${flagged.jobId}/issuance-check`).set(as(BRYAN))).body;
  expect(chk.blockers.some((b) => b.clause === 'reg 17.91 peer review' && /lapsed/.test(b.reason)), JSON.stringify(chk.blockers));
  const r = await issueAs(BRYAN, flagged.jobId, flagged.inspectionId);
  expect(r.status === 422 && r.body.clause === 'reg 17.91 peer review', `${r.status} ${r.text}`);
});

await step('approved again, the second certifier issues: the certificate names the holder', async () => {
  const ok = await syncAs(peer, [ev('peer_review.decide', { jobId: flagged.jobId, decision: 'approved' })]);
  expect(ok.body.applied.length === 1, JSON.stringify(ok.body.rejected));
  const r = await issueAs(second, flagged.jobId, flagged.inspectionId);
  expect(r.status === 201, `${r.status} ${r.text}`);
  const c = (await db.query(`SELECT certifier_id, issued_by FROM certificate WHERE job_id = $1`, [flagged.jobId])).rows[0];
  expect(Number(c.certifier_id) === BRYAN, `certifier_id ${c.certifier_id}`);
  expect(Number(c.issued_by) === second, `issued_by ${c.issued_by}`);
  const html = (await api.get(`/api/jobs/${flagged.jobId}/certificate.html`).set(as(BRYAN))).text;
  expect(html.includes('Bryan Wilson') && html.includes('TST100250'), 'holder not on the certificate');
  expect(!html.includes('Second Certifier') && !html.includes('TST999001'), 'the issuer, not the holder, is on the certificate');
  const j = (await api.get(`/api/jobs/${flagged.jobId}`).set(as(BRYAN))).body;
  const issued = j.events.find((e) => e.type === 'certificate.issue');
  expect(issued && issued.user_name === 'Second Certifier', `event log: ${JSON.stringify(issued)}`);
  expect(j.certificateIssuedBy === 'Second Certifier', `certificateIssuedBy ${j.certificateIssuedBy}`);
});

await step('an unflagged job issues without a peer review', async () => {
  const r = await issueAs(BRYAN, plain.jobId, plain.inspectionId);
  expect(r.status === 201, `${r.status} ${r.text}`);
});

await step('the flag is the certifier\'s to change (job.peer_review_required)', async () => {
  const fresh = await api.post('/api/jobs').set(as(BRYAN)).send({ client: { legalName: 'Peer Flag Change Limited' }, site: { address: '2 Peer Road' }, location: { name: 'Yard' } });
  const jobId = fresh.body.jobId;
  const byRev = await syncAs(reviewer, [ev('job.peer_review_required', { jobId, required: true })]);
  expect(byRev.body.rejected[0]?.clause === 'Role', JSON.stringify(byRev.body));
  const bad = await syncAs(BRYAN, [ev('job.peer_review_required', { jobId, required: 'yes' })]);
  expect(bad.body.rejected.length === 1, 'a non-boolean flag was accepted');
  const ok = await syncAs(BRYAN, [ev('job.peer_review_required', { jobId, required: true })]);
  expect(ok.body.applied.length === 1, JSON.stringify(ok.body.rejected));
  const j = (await api.get(`/api/jobs/${jobId}`).set(as(BRYAN))).body;
  expect(j.peerReviewRequired === true, 'flag not set');
});

// ── people ─────────────────────────────────────────────────────────────────

await step('a reviewer with can_administer manages people; a plain reviewer cannot', async () => {
  const plainList = await api.get('/api/users').set(as(reviewer));
  expect(plainList.status === 403, `plain reviewer listed people: ${plainList.status}`);
  const list = await api.get('/api/users').set(as(adminReviewer));
  expect(list.status === 200, `admin reviewer: ${list.status} ${list.text}`);
  const me = list.body.find((u) => u.id === adminReviewer);
  expect(me.canAdminister === true, 'canAdminister missing');
  const holder = list.body.find((u) => u.id === BRYAN);
  expect(holder.isCertificateHolder === true, `holder flag ${JSON.stringify(holder)}`);
  const add = await api.post('/api/users').set(as(adminReviewer)).send({ fullName: 'New Peer', occupation: 'Peer reviewer', email: `new.peer.${randomUUID().slice(0, 6)}@test.example`, role: 'peer_reviewer', passcode: 'abcdef1' });
  expect(add.status === 201 && add.body.role === 'peer_reviewer', `${add.status} ${add.text}`);
});

await step('an administering reviewer cannot make a certifier, grant administration, or touch a certifier\'s account', async () => {
  const cert = await api.post('/api/users').set(as(adminReviewer)).send({ fullName: 'Sneaky', occupation: 'x', email: `sneaky.${randomUUID().slice(0, 6)}@test.example`, role: 'certifier', passcode: 'abcdef1' });
  expect(cert.status === 403, `made a certifier: ${cert.status}`);
  const grant = await api.patch(`/api/users/${reviewer}`).set(as(adminReviewer)).send({ canAdminister: true });
  expect(grant.status === 403, `granted administration: ${grant.status}`);
  const reset = await api.post(`/api/users/${BRYAN}/passcode`).set(as(adminReviewer)).send({ passcode: 'takeover1' });
  expect(reset.status === 403, `reset the certifier's passcode: ${reset.status}`);
});

await step('a certifier grants can_administer', async () => {
  const r = await api.patch(`/api/users/${reviewer}`).set(as(BRYAN)).send({ canAdminister: true });
  expect(r.status === 200 && r.body.canAdminister === true, `${r.status} ${r.text}`);
  const back = await api.patch(`/api/users/${reviewer}`).set(as(BRYAN)).send({ canAdminister: false });
  expect(back.status === 200 && back.body.canAdminister === false, 'revoke');
});

// ── migration ──────────────────────────────────────────────────────────────

await step('migration 016 re-runs without harm and keeps one holder', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, '..', '..', '..', 'packages', 'db', 'migrations', '016_roles_review_conditions.sql'), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  const h = await db.query(`SELECT id FROM app_user WHERE is_certificate_holder`);
  expect(h.rows.length === 1 && Number(h.rows[0].id) === BRYAN, JSON.stringify(h.rows));
  const n = await db.query(`SELECT count(*)::int AS n FROM peer_review WHERE job_id = $1`, [flagged.jobId]);
  expect(n.rows[0].n >= 3, 'rows lost on re-run');
});

console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) process.exit(1);
