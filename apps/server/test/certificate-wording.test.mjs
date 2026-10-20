#!/usr/bin/env node
/**
 * Certificate wording follows the decision and the class (20 Oct 2026).
 *
 *   granted      "issued in accordance with regulation 6.23 and regulation
 *                <class reg>", certifies the class regulation's requirements
 *   conditional  regulation 6.24, "with the exception of the requirements set
 *                out below", and the date they must be met by (Tatenda,
 *                20 Oct 2026: it must clearly state the deadline; reg 6.24(2):
 *                no more than 3 months after issue)
 *   refused      a notice of refusal (reg 6.23(2)), never a certificate
 *
 * Class regulations (LCC PS cl 18): class 2/3.1 -> 10.34, 5.1 -> 12.17,
 * 6/8 -> 13.38. Sources: docs/20261019/REGULATORY_ALIGNMENT.md rows 1-3.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';

import { connect, migrate } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';
import { locationWording, renderCertificateHtml, CERTIFICATE_DEFAULTS } from '../../../packages/checksheets/lib/render-certificate.mjs';

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// ── the wording on its own ─────────────────────────────────────────────────

await step('granted, class 2/3.1: regulation 6.23 and 10.34, requirements of 10.34 met', async () => {
  const w = locationWording({ decision: 'granted', classKey: 'class_2_3' });
  expect(w.issuedUnder.includes('regulation 6.23') && w.issuedUnder.includes('regulation 10.34'), w.issuedUnder);
  expect(w.certifiesThat.includes('regulation 10.34') && w.certifiesThat.includes('have been met'), w.certifiesThat);
  expect(!/13\.3[89]/.test(w.issuedUnder + w.certifiesThat), 'class 6/8 regulation on a class 2/3.1 certificate');
});

await step('granted, class 6/8 cites 13.38; class 5.1 cites 12.17', async () => {
  expect(locationWording({ decision: 'granted', classKey: 'class_6_8' }).issuedUnder.includes('regulation 13.38'), '6/8');
  expect(locationWording({ decision: 'granted', classKey: 'class_5_1' }).certifiesThat.includes('regulation 12.17'), '5.1');
});

await step('conditional: regulation 6.24, "with the exception of", and the deadline', async () => {
  const w = locationWording({ decision: 'conditional', classKey: 'class_2_3', conditionsDue: '2027-01-15' });
  expect(w.issuedUnder.includes('regulation 6.24'), w.issuedUnder);
  expect(w.certifiesThat.includes('with the exception of the requirements set out below'), w.certifiesThat);
  expect(w.certifiesThat.includes('15/01/2027'), `deadline missing: ${w.certifiesThat}`);
});

await step('refused: a notice of refusal that never says the requirements were met', async () => {
  const w = locationWording({ decision: 'refused', classKey: 'class_6_8' });
  expect(/NOTICE OF REFUSAL/.test(w.documentTitle), w.documentTitle);
  expect(!w.documentTitle.startsWith('COMPLIANCE CERTIFICATE'), w.documentTitle);
  expect(!w.certifiesThat.includes('have been met'), w.certifiesThat);
  expect(w.issuedUnder.includes('regulation 6.23(2)'), w.issuedUnder);
});

await step('the rendered refusal has no in-force or expiry date and lists what was not met', async () => {
  const base = {
    ...CERTIFICATE_DEFAULTS, ...locationWording({ decision: 'refused', classKey: 'class_6_8' }),
    decision: 'refused', certifier: { fullName: 'Bryan Wilson', authorisationNumber: 'TST100250', email: 'x@y' },
    issuedTo: { name: 'Site manager' }, pcbu: { legalName: 'Test Refusal Limited' }, location: { address: '1 Test Road' },
    substances: [], requirementsNotMet: ['General 4.4 (reg 2.6(3)): no signage at the room entrance'],
    issueDate: '2026-10-20', inForceDate: '2026-10-20', expiryDate: '2027-10-20',
  };
  const html = renderCertificateHtml(base);
  expect(html.includes('NOTICE OF REFUSAL'), 'title');
  expect(!html.includes('Date comes into force') && !html.includes('Expiry Date'), 'a refusal shows in-force or expiry dates');
  expect(html.includes('no signage at the room entrance'), 'unmet requirement not listed');
  expect(!html.includes('Requirements Not Met: None'), 'says None');
});

// ── through the API ────────────────────────────────────────────────────────

const db = await connect({ url: null });
await migrate(db);
await db.query(`INSERT INTO app_user (id, full_name, occupation, authorisation_number)
                VALUES (1,'Bryan Wilson','Compliance certifier','TST100250') ON CONFLICT DO NOTHING`);
const app = buildApp(db);
const api = request(app);
const H = { 'x-device-id': 'ipad-wording', 'x-user-id': '1' };
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = (events) => api.post('/api/sync').set(H).send({ deviceId: 'ipad-wording', userId: 1, events });

/** A class 6/8 job at the point of decision: every item answered, one non-compliance open. */
async function jobWithOneOpenFinding(name) {
  const r = await api.post('/api/jobs').set(H).send({
    client: { legalName: `${name} Limited` }, site: { address: '1 Wording Road' },
    location: { name: 'Store' }, classKey: 'class_6_8',
  });
  expect(r.status === 201, `job ${r.status} ${r.text}`);
  const { jobId, hsLocationId } = r.body;
  const walk = (...to) => sync(to.map((toStage) => ev('job.transition', { jobId, toStage })));
  await walk('application', 'document_review', 'site_inspection');
  const o = await sync([ev('inspection.open', { jobId, hsLocationId, equipmentUsed: 'iPad',
    templateCodes: ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'] })]);
  const inspectionId = o.body.applied[0].result.inspectionId;
  const events = [];
  for (const code of ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8']) {
    const full = (await api.get(`/api/templates/${code}`).set(H)).body;
    for (const s of full.sections) for (const i of s.items) {
      const nc = code === 'wks17-general' && s.ordinal === 4 && i.ordinal === 4;
      events.push(ev('finding.upsert', { inspectionId, templateCode: code, sectionOrdinal: s.ordinal, itemOrdinal: i.ordinal,
        status: nc ? 'non_compliant' : 'compliant', failureReason: nc ? 'no signage at the room entrance' : null }));
    }
  }
  events.push(ev('interest.declare', { jobId, conflictFound: false }));
  const s = await sync(events);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected).slice(0, 300));
  const w = await walk('compliance_evaluation', 'final_validation');
  expect(w.body.rejected.length === 0, JSON.stringify(w.body.rejected));
  return { jobId, inspectionId };
}

const issue = (jobId, inspectionId, extra) => api.post(`/api/jobs/${jobId}/certificate`).set(H).send({
  inspectionId, issuedTo: 'Site manager', appliesTo: '1 Wording Road', certificateNumber: `TST100250-2026-W${jobId}`,
  issueDate: '2026-10-20', expiryDate: '2029-10-20', ...extra,
});

let cond;
await step('a conditional certificate needs the date its conditions must be met by', async () => {
  cond = await jobWithOneOpenFinding('Wording Conditional');
  const r = await issue(cond.jobId, cond.inspectionId, { decision: 'conditional', conditions: ['Install signage'] });
  expect(r.status === 422 && r.body.clause === 'reg 6.24(2)', `${r.status} ${r.text}`);
});

await step('the deadline is no more than 3 months after issue', async () => {
  const r = await issue(cond.jobId, cond.inspectionId, { decision: 'conditional', conditions: ['Install signage'], conditionsDue: '2027-02-21' });
  expect(r.status === 422 && r.body.clause === 'reg 6.24(2)', `${r.status} ${r.text}`);
});

await step('issued with a deadline, the certificate states it and lists the requirement not met', async () => {
  const r = await issue(cond.jobId, cond.inspectionId, { decision: 'conditional', conditions: ['Install signage'], conditionsDue: '2027-01-15' });
  expect(r.status === 201, `${r.status} ${r.text}`);
  const j = (await api.get(`/api/jobs/${cond.jobId}`).set(H)).body;
  expect(String(j.certificate.conditions_due).startsWith('2027-01-15'), `conditions_due ${j.certificate.conditions_due}`);
  const html = (await api.get(`/api/jobs/${cond.jobId}/certificate.html`).set(H)).text;
  expect(html.includes('regulation 6.24') && html.includes('with the exception of'), 'conditional wording');
  expect(html.includes('15/01/2027'), 'deadline not on the certificate');
  expect(html.includes('no signage at the room entrance'), 'the open non-compliance is not listed as not met');
  expect(!html.includes('Requirements Not Met: None'), 'says None');
});

await step('a refused job renders a notice of refusal, not a certificate', async () => {
  const ref = await jobWithOneOpenFinding('Wording Refused');
  const r = await issue(ref.jobId, ref.inspectionId, { decision: 'refused' });
  expect(r.status === 201, `${r.status} ${r.text}`);
  const html = (await api.get(`/api/jobs/${ref.jobId}/certificate.html`).set(H)).text;
  expect(html.includes('NOTICE OF REFUSAL'), 'not a refusal notice');
  expect(!html.includes('COMPLIANCE CERTIFICATE Location'), 'still headed COMPLIANCE CERTIFICATE');
  expect(!html.includes('have been met'), 'says the requirements have been met');
  expect(html.includes('no signage at the room entrance'), 'reason not listed');
});

console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) process.exit(1);
