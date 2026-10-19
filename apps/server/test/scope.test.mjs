/**
 * Scope of work of 19 October 2026, phase 1 (docs/20261019/CHANGE_GRAPH.md):
 * scope choices at job start (A3/B3), the general comment and optional N/A
 * reason on an item (A1/A2), unanswered items blocking a certificate (F8), and
 * certificate issue and send in the audit trail by person (F9). Test data
 * only, on PGlite.
 */
import request from 'supertest';
import { randomUUID } from 'crypto';

import { connect, migrate } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';
import { hashPasscode } from '../src/auth.mjs';
import { setAuthorised, validateChoices, excludedSections } from '../src/scope.mjs';

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// ── the choice rules, on a fixture set (no dependency on the real catalogue) ──
const AUTH = { authorisations: [{ key: 'loc-a' }, { key: 'loc-b' }] };
const SET = {
  key: 'fixture', authorisation: null,
  choices: [
    { key: 'cab', label: 'Cabinet', authorisation: 'loc-a', sections: [{ template: 'T', ordinals: [12] }] },
    { key: 'store', label: 'Store', authorisation: 'loc-a', sections: [{ template: 'T', ordinals: [13, 15] }] },
    { key: 'retail', label: 'Retail', authorisation: 'loc-b', sections: [{ template: 'T', ordinals: [15, 22] }] },
  ],
  notInScope: [{ template: 'T', ordinals: [30], why: 'design certification is excluded' }],
};

await step('a set with choices is authorised when every choice is', async () => {
  expect(setAuthorised(SET, AUTH), 'fixture should be authorised');
  expect(!setAuthorised({ ...SET, choices: [...SET.choices, { key: 'x', authorisation: 'nope', sections: [] }] }, AUTH), 'unknown choice authorisation passed');
  expect(!setAuthorised({ key: 'plain', authorisation: null }, AUTH), 'null authorisation passed');
  expect(setAuthorised({ key: 'plain', authorisation: 'loc-b' }, AUTH), 'plain authorised set refused');
});

await step('choices are required, known and de-duplicated when a set has them', async () => {
  expect(validateChoices(SET, undefined).error, 'no choices accepted');
  expect(validateChoices(SET, []).error, 'empty choices accepted');
  expect(validateChoices(SET, ['cab', 'bogus']).error, 'unknown choice accepted');
  expect(validateChoices(SET, ['cab', 7]).error, 'non-string choice accepted');
  const ok = validateChoices(SET, ['store', 'cab', 'store']);
  expect(!ok.error && JSON.stringify(ok.choices) === '["cab","store"]', JSON.stringify(ok));
  expect(validateChoices({ key: 'plain' }, ['cab']).error, 'choices on a set without any accepted');
  expect(validateChoices({ key: 'plain' }, undefined).choices === null, 'a set without choices stores null');
});

await step('sections of choices not picked are excluded; a shared section stays; not-in-scope always goes', async () => {
  const x = excludedSections(SET, ['store']);
  const key = (s) => `${s.template}#${s.ordinal}:${s.reason}`;
  const got = x.map(key).sort();
  // 12 (cab) and 22 (retail) not chosen; 15 is shared with store, so it stays.
  expect(JSON.stringify(got) === JSON.stringify(['T#12:not_chosen', 'T#22:not_chosen', 'T#30:not_in_scope']), JSON.stringify(got));
  expect(excludedSections({ key: 'plain' }, null).length === 0, 'plain set excluded something');
});

// ── through the API ──────────────────────────────────────────────────────
const db = await connect({ url: null });
await migrate(db);
await db.query(`INSERT INTO app_user (id, full_name, occupation, email, role, authorisation_number, passcode_hash)
                VALUES (1,'Bryan Wilson','Compliance certifier','compliancecertifier@assuresafety.co.nz','certifier','TST100250',$1)
                ON CONFLICT (id) DO UPDATE SET passcode_hash = EXCLUDED.passcode_hash, email = EXCLUDED.email`, [hashPasscode('cert-pass')]);
const app = buildApp(db, { requireAuth: true });
const api = request(app);
const login = await api.post('/api/auth/login').send({ email: 'compliancecertifier@assuresafety.co.nz', passcode: 'cert-pass', deviceId: 'scope-test' });
const H = { authorization: `Bearer ${login.body.token}` };
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = (events) => api.post('/api/sync').set(H).send({ deviceId: 'scope-test', events });

const job = (await api.post('/api/jobs').set(H).send({
  client: { legalName: 'Scope Test Limited' }, site: { address: '1 Scope Road' }, location: { name: 'Scope store' }, classKey: 'class_6_8',
})).body;
const opened = await sync([ev('inspection.open', { jobId: job.jobId, hsLocationId: job.hsLocationId, equipmentUsed: 'iPad',
  templateCodes: ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'] })]);
const insp = opened.body.applied[0].result.inspectionId;
const items = (await db.query(`SELECT item_id, template_code, section_ordinal, item_ordinal FROM inspection_item_in_scope
                               WHERE inspection_id = $1 ORDER BY template_code, section_ordinal, item_ordinal`, [insp])).rows;
const at = (n) => ({ inspectionId: insp, templateCode: items[n].template_code, sectionOrdinal: items[n].section_ordinal, itemOrdinal: items[n].item_ordinal });

await step('a general comment and an N/A reason are kept and come back on the job', async () => {
  const r = await sync([
    ev('finding.upsert', { ...at(0), status: 'compliant', comment: 'Signage in place', generalComment: '  PCBU to make the hatch pattern denser  ' }),
    ev('finding.upsert', { ...at(1), status: 'not_applicable', naReason: 'No cylinders on site' }),
    ev('finding.upsert', { ...at(2), status: 'compliant', naReason: 'should be dropped: not N/A' }),
  ]);
  expect(r.body.rejected.length === 0, JSON.stringify(r.body.rejected));
  const j = await api.get(`/api/jobs/${job.jobId}`).set(H);
  const f = (n) => j.body.findings.find((x) => x.template_code === items[n].template_code && x.section_ordinal === items[n].section_ordinal && x.item_ordinal === items[n].item_ordinal);
  expect(f(0).general_comment === 'PCBU to make the hatch pattern denser', `general comment: ${JSON.stringify(f(0))}`);
  expect(f(1).na_reason === 'No cylinders on site', `N/A reason: ${JSON.stringify(f(1))}`);
  expect(f(2).na_reason === null, `N/A reason on a compliant item: ${f(2).na_reason}`);
});

await step('an N/A without a reason is accepted (the reason is optional)', async () => {
  const r = await sync([ev('finding.upsert', { ...at(3), status: 'not_applicable' })]);
  expect(r.body.rejected.length === 0, JSON.stringify(r.body.rejected));
});

await step('items never answered block the certificate, and the check says how many', async () => {
  await sync([ev('interest.declare', { jobId: job.jobId, conflictFound: false })]);
  const c = await api.get(`/api/jobs/${job.jobId}/issuance-check`).set(H);
  const left = items.length - 4;
  expect(!c.body.canIssueConditional, `issuable with ${left} untouched items: ${JSON.stringify(c.body)}`);
  expect(c.body.blockers.some((b) => String(b.reason ?? b).includes(`${left} check sheet item(s)`) && /not yet assessed/.test(String(b.reason ?? b))), JSON.stringify(c.body.blockers));
});

await step('once every item is answered the certificate can issue', async () => {
  const r = await sync(items.slice(4).map((_, i) => ev('finding.upsert', { ...at(i + 4), status: 'compliant' })));
  expect(r.body.rejected.length === 0, JSON.stringify(r.body.rejected.slice(0, 2)));
  const c = await api.get(`/api/jobs/${job.jobId}/issuance-check`).set(H);
  expect(c.body.canGrant, JSON.stringify(c.body));
});

await step('issuing a certificate is in the audit trail, by person, and the stage move names its actor', async () => {
  for (const st of ['application', 'document_review', 'site_inspection', 'compliance_evaluation', 'final_validation']) {
    const m = await sync([ev('job.transition', { jobId: job.jobId, toStage: st })]);
    expect(m.body.rejected.length === 0, `${st}: ${JSON.stringify(m.body.rejected)}`);
  }
  const r = await api.post(`/api/jobs/${job.jobId}/certificate`).set(H).send({
    inspectionId: insp, decision: 'granted', certificateNumber: 'TST100250-SCOPE-1', issuedTo: 'Scope Test Limited', appliesTo: 'Scope store', issueDate: '2026-10-19' });
  expect(r.status === 201, `${r.status} ${r.text}`);
  const e = (await db.query(`SELECT type, user_id, payload FROM sync_event WHERE type = 'certificate.issue' AND int_or_null(payload->>'jobId') = $1`, [job.jobId])).rows;
  expect(e.length === 1 && Number(e[0].user_id) === 1 && e[0].payload.decision === 'granted', JSON.stringify(e));
  const t = (await db.query(`SELECT actor_id FROM job_stage_transition WHERE job_id = $1 AND to_stage = 'certificate_issued'`, [job.jobId])).rows;
  expect(t.length === 1 && Number(t[0].actor_id) === 1, `actor: ${JSON.stringify(t)}`);
  const j = await api.get(`/api/jobs/${job.jobId}`).set(H);
  expect(j.body.events.some((x) => x.type === 'certificate.issue' && x.user_name === 'Bryan Wilson'), 'not in the job history');
});

await step('sending the certificate is in the audit trail, by person, with the recipient', async () => {
  const r = await api.post(`/api/jobs/${job.jobId}/send`).set(H).send({ document: 'certificate', to: 'client@example.com' });
  expect(r.status === 200, `${r.status} ${r.text}`);
  const e = (await db.query(`SELECT user_id, payload FROM sync_event WHERE type = 'document.send' AND int_or_null(payload->>'jobId') = $1`, [job.jobId])).rows;
  expect(e.length === 1 && Number(e[0].user_id) === 1 && e[0].payload.to === 'client@example.com' && e[0].payload.document === 'certificate'
    && typeof e[0].payload.sent === 'boolean', JSON.stringify(e));
});

await step('a set without choices refuses scopeChoices', async () => {
  const r = await api.post('/api/jobs').set(H).send({ client: { legalName: 'x' }, site: { address: 'x' }, location: { name: 'x' },
    classKey: 'class_6_8', scopeChoices: ['anything'] });
  expect(r.status === 400, `${r.status} ${r.text}`);
});

await db.close();
console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
