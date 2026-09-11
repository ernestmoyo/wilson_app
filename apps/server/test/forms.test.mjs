#!/usr/bin/env node
/**
 * The form-shaped sheets through the API: a certified-handler job whose
 * subject is an applicant, and a cylinder importation job with two batches.
 * Same stages, same findings, same guards as a location job; only the
 * block above the items and the certificate differ. Test data only.
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
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = (events) => api.post('/api/sync').set(H).send({ deviceId: 'ipad-test', events });

await step('the catalogue carries the three new sets with their kinds and templates', async () => {
  const r = await api.get('/api/sheet-sets').set(H);
  const byKey = Object.fromEntries(r.body.sets.map((x) => [x.key, x]));
  expect(byKey.handler_6?.kind === 'handler' && byKey.handler_6.templates[0] === 'ch-class-6-handler-assessment' && byKey.handler_6.authorised, JSON.stringify(byKey.handler_6));
  expect(byKey.cylinder_fern?.kind === 'cylinder' && byKey.cylinder_fern.authorised, 'cylinder_fern');
  expect(byKey.cylinder_un?.kind === 'cylinder' && byKey.cylinder_un.authorised, 'cylinder_un');
  const t = await api.get('/api/templates/ch-class-6-handler-assessment').set(H);
  expect(t.status === 200 && t.body.meta?.sheet?.kind === 'handler', `handler template meta: ${t.status}`);
  expect(t.body.meta.sheet.subjectBlock.some((x) => x.label === 'Application type' && x.options.length === 3), 'application type options');
  return `${r.body.sets.length} sets`;
});

let hJob, hInsp;
await step('a certified-handler job: the applicant is the subject, recorded by label', async () => {
  const r = await api.post('/api/jobs').set(H).send({
    client: { legalName: 'Test Chemicals Ltd' }, site: { address: '1 Test Road, Auckland' },
    location: { name: 'Handler assessment: A. Applicant' }, classKey: 'handler_6',
    subject: { 'Name': 'A. Applicant', 'Company': 'Test Chemicals Ltd', 'Application type': 'New Applicant' },
  });
  expect(r.status === 201, `${r.status} ${r.text}`);
  hJob = r.body.jobId;
  const s = await sync([
    ev('job.transition', { jobId: hJob, toStage: 'application' }),
    ev('job.transition', { jobId: hJob, toStage: 'document_review' }),
    ev('job.transition', { jobId: hJob, toStage: 'site_inspection' }),
    ev('inspection.open', { jobId: hJob, hsLocationId: r.body.hsLocationId, equipmentUsed: 'Written and verbal assessment',
      templateCodes: ['ch-class-6-handler-assessment'] }),
    ev('job.subject.set', { jobId: hJob, fields: { 'Scope of Certification': 'Storage, Use, Disposal and Transport of Class 6 Hazardous Substances' } }),
  ]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  hInsp = s.body.applied[3].result.inspectionId;
  const j = (await api.get(`/api/jobs/${hJob}`).set(H)).body;
  expect(j.kind === 'handler', `kind ${j.kind}`);
  expect(j.subject['Name'] === 'A. Applicant' && j.subject['Scope of Certification'].startsWith('Storage'), JSON.stringify(j.subject));
  return `job ${hJob}, subject: ${Object.keys(j.subject).join(', ')}`;
});

await step('findings against Performance Standard clauses, then the certified-handler certificate', async () => {
  const t = (await api.get('/api/templates/ch-class-6-handler-assessment').set(H)).body;
  const events = [];
  for (const sec of t.sections) for (const it of sec.items) {
    events.push(ev('finding.upsert', { inspectionId: hInsp, templateCode: t.code, sectionOrdinal: sec.ordinal, itemOrdinal: it.ordinal,
      status: 'compliant', comment: 'Satisfied in the written assessment and interview' }));
  }
  events.push(ev('interest.declare', { jobId: hJob, conflictFound: false }));
  events.push(ev('inspection.sign', { inspectionId: hInsp, which: 'declaration' }));
  events.push(ev('job.transition', { jobId: hJob, toStage: 'compliance_evaluation' }));
  events.push(ev('job.transition', { jobId: hJob, toStage: 'final_validation' }));
  const s = await sync(events);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  const r = await api.post(`/api/jobs/${hJob}/certificate`).set(H).send({
    inspectionId: hInsp, decision: 'granted', certificateNumber: 'TST100250-CH-0001',
    issuedTo: 'A. Applicant', appliesTo: 'Test Chemicals Ltd', issueDate: '2026-09-11', expiryDate: '2031-09-11',
  });
  expect(r.status === 201, `${r.status} ${r.text}`);
  const html = await api.get(`/api/jobs/${hJob}/certificate.html`).set(H);
  expect(html.status === 200, `${html.status}`);
  expect(html.text.includes('Certified Handler'), 'title wording');
  expect(html.text.includes('A. Applicant'), 'subject name');
  expect(html.text.includes('TST100250-CH-0001'), 'certificate number');
  expect(html.text.includes('This Certificate is limited to activities'), 'scope wording from the template');
  return `${events.length - 4} findings, certificate rendered (${html.text.length} bytes)`;
});

let cJob;
await step('a cylinder importation job: two batches as units, each by its labels', async () => {
  const r = await api.post('/api/jobs').set(H).send({
    client: { legalName: 'Test Imports Ltd' }, site: { address: '2 Wharf Road, Auckland' },
    location: { name: 'Cylinder importation: batch TEST-1' }, classKey: 'cylinder_fern',
    subject: { 'Company/Legal Entity': 'Test Imports Ltd', 'Full Name of PCBU': 'T. Importer' },
    units: [{ fields: { 'FERN': 'TEST-0001', 'Country of Manufacturer': 'Testland', 'Number of Cylinders': '10' } }],
  });
  expect(r.status === 201, `${r.status} ${r.text}`);
  cJob = r.body.jobId;
  const s = await sync([
    ev('job.unit.upsert', { jobId: cJob, ordinal: 2, fields: { 'FERN': 'TEST-0002', 'Number of Cylinders': '4' } }),
    ev('job.unit.upsert', { jobId: cJob, ordinal: 1, fields: { 'Design Standard': 'AS/NZS 1841.5-2003' } }),
  ]);
  expect(s.body.rejected.length === 0, JSON.stringify(s.body.rejected));
  const j = (await api.get(`/api/jobs/${cJob}`).set(H)).body;
  expect(j.kind === 'cylinder' && j.units.length === 2, `units ${JSON.stringify(j.units)}`);
  expect(j.units[0].fields['FERN'] === 'TEST-0001' && j.units[0].fields['Design Standard'] === 'AS/NZS 1841.5-2003', 'merge kept the first fields');
  const rm = await sync([ev('job.unit.remove', { jobId: cJob, ordinal: 2 })]);
  expect(rm.body.applied.length === 1, 'remove');
  const j2 = (await api.get(`/api/jobs/${cJob}`).set(H)).body;
  expect(j2.units.length === 1, 'one unit left');
  return `job ${cJob}`;
});

await step('the board rows say which kind each job is', async () => {
  const r = await api.get('/api/jobs').set(H);
  const kinds = Object.fromEntries(r.body.map((x) => [x.id, x.kind]));
  expect(kinds[hJob] === 'handler' && kinds[cJob] === 'cylinder', JSON.stringify(kinds));
});

console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
