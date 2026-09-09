#!/usr/bin/env node
/**
 * The real G2 Chiller job, end to end, through HTTP.
 *
 * packages/db proved the schema enforces the regulations. This proves the API
 * carries them faithfully to a client: every mutation goes through POST /sync
 * as the field app would send it, rejections come back with their clause, and
 * a retried batch is a no-op. The same data as the db e2e; a different edge of
 * the graph.
 */

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';

import { connect, migrate } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '..', '..', '..', 'packages', 'checksheets', 'data');
const j = (p) => JSON.parse(readFileSync(p, 'utf8'));

const general = j(join(data, 'g2-chiller-class-6-and-8-location-checksheets--wks17-locations-general.instance.json'));
const class68 = j(join(data, 'g2-chiller-class-6-and-8-location-checksheets--wks17-class-6-1a-6-1b-6-1c-8-2a-8.instance.json'));
const cert = j(join(data, 'certificates', 'g2-chiller', 'certificate.json'));
const evidence = j(join(data, 'evidence', 'g2-chiller', 'evidence-manifest.json'));
const sb = general.siteBlock;

let pass = 0;
const problems = [];
async function step(name, fn) {
  try {
    const msg = await fn();
    pass++;
    console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`);
  } catch (e) {
    problems.push(`${name}: ${e.message}`);
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// Evidence bytes go to a scratch dir, never into the repo.
const { tmpdir } = await import('os');
const { mkdtempSync } = await import('fs');
process.env.EVIDENCE_DIR = mkdtempSync(join(tmpdir(), 'assure-evidence-'));

const db = await connect({ url: null });
await migrate(db);
const app = buildApp(db);
const api = request(app);

const DEVICE = 'ipad-bryan-001';
const H = { 'x-device-id': DEVICE, 'x-user-id': '1' };
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = (events) => api.post('/api/sync').set(H).send({ deviceId: DEVICE, userId: 1, events });

let jobId, hsLocationId, inspectionId;

console.log('BOOT');
await step('health reports the template layer', async () => {
  const r = await api.get('/api/health');
  expect(r.status === 200 && r.body.templateItems === 98, JSON.stringify(r.body));
  return `db=${r.body.db}, ${r.body.templateItems} template items`;
});

await step('templates endpoint serves the canonical check sheets', async () => {
  const r = await api.get('/api/templates/wks17-general');
  expect(r.status === 200, `status ${r.status}`);
  const item1 = r.body.sections[0].items[0];
  expect(item1.regulation_refs_by_class?.class_6_8?.length === 5, 'class overlay missing from API');
  expect(item1.action.startsWith('Verify that the hazardous substances are present'), 'verbatim text missing');
  return `${r.body.sections.length} sections, class overlay present`;
});

console.log('\nSTAGE 1 — enquiry');
await step('seed the certifier (until auth lands)', async () => {
  await db.query(
    `INSERT INTO app_user (id, full_name, occupation, email, role, authorisation_number)
     VALUES (1,$1,'Compliance certifier',$2,'certifier',$3)`,
    [cert.certifier.fullName, cert.certifier.email, cert.certifier.authorisationNumber]);
  return cert.certifier.fullName;
});

await step('POST /api/jobs creates client, site, location and job', async () => {
  const r = await api.post('/api/jobs').set(H).send({
    client: { legalName: sb['Legal Entity Name'], tradingName: sb['Trading as Name'], nzbn: sb['NZBN'],
              companiesNumber: cert.location.companyNumber, postalAddress: sb['Postal Address'],
              phone: sb['Business Phone Number'], website: sb['Business Website'],
              industry: sb['Description of Business Type / Industry'] },
    site: { address: sb['Site / Location Address'] },
    location: { name: 'G2 Chiller', summary: sb['Brief location summary'] },
    classKey: 'class_6_8',
  });
  expect(r.status === 201, `status ${r.status}: ${JSON.stringify(r.body)}`);
  jobId = r.body.jobId; hsLocationId = r.body.hsLocationId;
  return `job ${jobId} at stage ${r.body.stage}`;
});

console.log('\nSTAGE 2-4 — walk to site inspection via sync');
await step('job.transition events move the stage; an illegal jump is rejected with its clause', async () => {
  const r = await sync([
    ev('job.transition', { jobId, toStage: 'application' }),
    ev('job.transition', { jobId, toStage: 'document_review' }),
    ev('job.transition', { jobId, toStage: 'certificate_issued' }),   // illegal from document_review
    ev('job.transition', { jobId, toStage: 'site_inspection' }),
  ]);
  expect(r.status === 200, `status ${r.status}: ${JSON.stringify(r.body)}`);
  expect(r.body.applied.length === 3, `applied ${r.body.applied.length}`);
  expect(r.body.rejected.length === 1, `rejected ${r.body.rejected.length}`);
  expect(r.body.rejected[0].clause === 'Process Flow', JSON.stringify(r.body.rejected[0]));
  return `3 applied, 1 rejected — "${r.body.rejected[0].reason}"`;
});

await step('inspection.open pins the template revisions', async () => {
  const r = await sync([ev('inspection.open', {
    jobId, hsLocationId, certifierId: 1, inspectedAt: cert.issueDate,
    equipmentUsed: 'iPad, tape measure',
    templateCodes: ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'],
  })]);
  expect(r.body.applied.length === 1, JSON.stringify(r.body));
  inspectionId = r.body.applied[0].result.inspectionId;
  return `inspection ${inspectionId}`;
});

await step('IPS 21(1)(d): an inspection with blank equipment is rejected with its clause', async () => {
  const r = await sync([ev('inspection.open', {
    jobId, hsLocationId, certifierId: 1, equipmentUsed: '   ',
  })]);
  expect(r.body.rejected.length === 1, JSON.stringify(r.body));
  expect(r.body.rejected[0].clause === 'IPS 21(1)(d)', JSON.stringify(r.body.rejected[0]));
  return r.body.rejected[0].reason;
});

console.log('\nSTAGE 4 — the 54 real findings through the sync contract');
const findingEvents = [
  ...general.findings.map((f) => ev('finding.upsert', {
    inspectionId, templateCode: 'wks17-general',
    sectionOrdinal: f.sectionOrdinal, itemOrdinal: f.itemOrdinal,
    status: f.status, comment: f.comment,
    failureReason: f.status === 'non_compliant' ? f.comment : null,
  })),
  ...class68.findings.map((f) => ev('finding.upsert', {
    inspectionId, templateCode: 'wks17-class-6-1a-6-1b-6-1c-8-2a-8',
    sectionOrdinal: f.sectionOrdinal, itemOrdinal: f.itemOrdinal,
    status: f.status, comment: f.comment,
    failureReason: f.status === 'non_compliant' ? f.comment : null,
  })),
];

await step('54 finding.upsert events apply, resolved by (templateCode, section, item)', async () => {
  const r = await sync(findingEvents);
  expect(r.status === 200, `status ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  expect(r.body.applied.length === 54, `applied ${r.body.applied.length}, rejected ${JSON.stringify(r.body.rejected.slice(0, 2))}`);
  return `54/54 applied`;
});

await step('a retried batch is a no-op — every event reported as duplicate', async () => {
  const r = await sync(findingEvents);
  expect(r.body.duplicate.length === 54, `duplicate ${r.body.duplicate.length}`);
  expect(r.body.applied.length === 0, `applied ${r.body.applied.length}`);
  const count = await db.query('SELECT count(*)::int n FROM finding');
  expect(count.rows[0].n === 54, `finding rows ${count.rows[0].n}`);
  return '54 duplicates, 0 applied, still 54 rows';
});

await step('IPS 21(1)(f): a non-compliant finding without a reason is rejected with its clause', async () => {
  const bad = ev('finding.upsert', {
    inspectionId, templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 1,
    status: 'non_compliant', comment: 'signs missing', failureReason: '',
  });
  const r = await sync([bad]);
  expect(r.body.rejected.length === 1, JSON.stringify(r.body));
  expect(r.body.rejected[0].clause === 'IPS 21(1)(f)', JSON.stringify(r.body.rejected[0]));
  // Replaying the same rejected event must still surface the clause.
  const again = await sync([bad]);
  expect(again.body.duplicate.length === 1, JSON.stringify(again.body));
  expect(again.body.duplicate[0].clause === 'IPS 21(1)(f)', 'replay lost the clause: ' + JSON.stringify(again.body.duplicate[0]));
  return r.body.rejected[0].reason + ' (clause survives replay)';
});

await step('GET /api/jobs/:id returns the findings with counts matching the workbook', async () => {
  const r = await api.get(`/api/jobs/${jobId}`);
  expect(r.status === 200, `status ${r.status}`);
  const c = r.body.findingCounts;
  expect(c.compliant === 29 && c.non_compliant === 4 && c.not_applicable === 20 && c.pending === 1,
    JSON.stringify(c));
  return JSON.stringify(c);
});

console.log('\nSTAGE 4 — evidence through the sync contract');
await step('IPS 21(4): app-captured evidence without provenance is rejected', async () => {
  const r = await sync([ev('evidence.attach', {
    jobId, inspectionId, sha256: 'a'.repeat(64), mime: 'image/jpeg', bytes: 1234, provenance: 'app',
  })]);
  expect(r.body.rejected.length === 1 && r.body.rejected[0].clause === 'IPS 21(4)', JSON.stringify(r.body));
  return r.body.rejected[0].reason;
});

await step('fully-provenanced capture attaches to the signage finding', async () => {
  const r = await sync([ev('evidence.attach', {
    jobId, inspectionId, templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 4,
    sha256: 'c'.repeat(64), mime: 'image/jpeg', bytes: 240000, provenance: 'app',
    capturedByName: 'Bryan Wilson', capturedByOccupation: 'Compliance certifier',
    capturedAt: new Date().toISOString(), capturedWhere: 'G2 Chiller door, Argenta Manurewa',
    gpsLat: -37.02, gpsLon: 174.90,
  })]);
  expect(r.body.applied.length === 1, JSON.stringify(r.body));
  expect(r.body.applied[0].result.findingId, 'not linked to the finding');
  return `evidence ${r.body.applied[0].result.evidenceId} → finding ${r.body.applied[0].result.findingId}`;
});

await step('the 8 migrated workbook images load with provenance honestly marked', async () => {
  const r = await sync(evidence.filter((e) => e.classification === 'evidence').map((e) =>
    ev('evidence.attach', { jobId, inspectionId, kind: 'photo', sha256: e.sha256, storageKey: e.file,
                            mime: e.mime, bytes: e.bytes, provenance: 'migrated' })));
  expect(r.body.applied.length === 8, JSON.stringify(r.body.rejected));
  return '8 applied as provenance=migrated';
});

console.log('\nSTAGE 5-7 — issuance through the API');
await step('walk to final_validation', async () => {
  const r = await sync([
    ev('job.transition', { jobId, toStage: 'compliance_evaluation' }),
    ev('job.transition', { jobId, toStage: 'final_validation' }),
  ]);
  expect(r.body.applied.length === 2, JSON.stringify(r.body.rejected));
  return 'at final_validation';
});

await step('issuance-check is server-authoritative: reports every blocker, mutates nothing', async () => {
  const r = await api.get(`/api/jobs/${jobId}/issuance-check`);
  expect(r.status === 200, `status ${r.status}`);
  expect(r.body.canGrant === false, 'should not be grantable yet');
  expect(r.body.blockers[0].clause === 'IPS 23(1)', JSON.stringify(r.body.blockers));
  const stage = await db.query('SELECT stage FROM job WHERE id=$1', [jobId]);
  expect(stage.rows[0].stage === 'final_validation', 'dry run mutated the job');
  return `blocked by ${r.body.blockers[0].clause}; ${r.body.unresolvedNonCompliances} unresolved NCs; stage unchanged`;
});

await step('POST certificate is refused with the clause, and the stage does not move', async () => {
  const r = await api.post(`/api/jobs/${jobId}/certificate`).set(H).send({
    decision: 'granted', registerNumber: cert.registerNumber, certificateNumber: cert.certificateNumber,
    issuedTo: cert.issuedTo.name, appliesTo: 'G2 Chiller', issueDate: cert.issueDate, expiryDate: cert.expiryDate,
  });
  expect(r.status === 422, `status ${r.status}: ${JSON.stringify(r.body)}`);
  expect(r.body.clause === 'IPS 23(1)', JSON.stringify(r.body));
  const stage = await db.query('SELECT stage FROM job WHERE id=$1', [jobId]);
  expect(stage.rows[0].stage === 'final_validation', 'failed issuance leaked a stage change');
  return `422 ${r.body.clause} — transaction rolled back`;
});

await step('remediate: declare interests, assess the pending item, verify corrective actions', async () => {
  const pending = class68.findings.find((f) => f.status === 'pending');
  const r = await sync([
    ev('interest.declare', { jobId, certifierId: 1, conflictFound: false }),
    ev('finding.upsert', { inspectionId, templateCode: 'wks17-class-6-1a-6-1b-6-1c-8-2a-8',
                           sectionOrdinal: pending.sectionOrdinal, itemOrdinal: pending.itemOrdinal,
                           status: 'not_applicable', comment: 'Assessed on review' }),
    ev('communication.record', { jobId, direction: 'outbound', medium: 'email', party: 'Jesh Chandra',
                                 summary: 'Sent corrective action list: signage and ERP approval' }),
  ]);
  expect(r.body.applied.length === 3, JSON.stringify(r.body.rejected));
  await db.query(`
    INSERT INTO corrective_action (finding_id, severity, description, status, reverified_by, reverified_at)
    SELECT id, 'major', 'Remediated', 'verified', 1, now() FROM finding WHERE status='non_compliant'`);
  const chk = await api.get(`/api/jobs/${jobId}/issuance-check`);
  expect(chk.body.canGrant === true, JSON.stringify(chk.body));
  return 'issuance-check now: canGrant = true';
});

await step('POST certificate issues; retention and WorkSafe deadline come back computed', async () => {
  const r = await api.post(`/api/jobs/${jobId}/certificate`).set(H).send({
    inspectionId, decision: 'granted',
    registerNumber: cert.registerNumber, certificateNumber: cert.certificateNumber,
    issuedTo: cert.issuedTo.name, appliesTo: `G2 Chiller, ${cert.location.address}`,
    issueDate: cert.issueDate, inForceDate: cert.inForceDate, expiryDate: cert.expiryDate,
    details: cert.detailsOfCertification,
  });
  expect(r.status === 201, `status ${r.status}: ${JSON.stringify(r.body)}`);
  const retain = new Date(r.body.retainUntil).toISOString().slice(0, 10);
  expect(retain === '2034-07-04', `retainUntil ${retain}`);
  return `certificate ${r.body.certificateId}; retain until ${retain}; register by ${new Date(r.body.worksafeRegisterDue).toISOString().slice(0, 10)}`;
});

await step('GET /api/jobs/:id shows the full graph: certificate, retention, 6 transitions, evidence stamped', async () => {
  const r = await api.get(`/api/jobs/${jobId}`);
  expect(r.body.stage === 'certificate_issued', r.body.stage);
  expect(r.body.certificate?.register_number === cert.registerNumber, 'certificate missing');
  expect(r.body.retention?.trigger === 'expiry_plus_5y', 'retention missing');
  expect(r.body.transitions.length === 6, `transitions ${r.body.transitions.length}`);
  const stamped = r.body.evidence.filter((e) => e.retain_until).length;
  expect(stamped === r.body.evidence.length, `${stamped}/${r.body.evidence.length} evidence stamped`);
  return `${r.body.transitions.length} transitions, ${r.body.evidence.length} evidence objects all retained to 2034, ${r.body.interestDeclarations.length} interest declaration`;
});

console.log('\nCERTIFICATE — rendered from the job, not retyped');
await step('GET /api/jobs/:id/certificate.html renders from findings + certificate rows', async () => {
  const r = await api.get(`/api/jobs/${jobId}/certificate.html`);
  expect(r.status === 200, `status ${r.status}: ${r.text?.slice(0, 200)}`);
  const html = r.text;
  expect(html.includes('COMPLIANCE CERTIFICATE Location'), 'title missing');
  expect(html.includes(cert.registerNumber), 'register number missing');
  expect(html.includes('Argenta Manufacturing Limited'), 'PCBU missing');
  expect(html.includes('TST100250'), 'authorisation number missing');
  expect(html.includes('04/07/2029'), 'expiry date missing');
  return `${(html.length / 1024).toFixed(1)} KB of HTML, register ${cert.registerNumber}`;
});

console.log('\nEVIDENCE BYTES — content-addressed, hash verified on receipt');
const evidenceBytes = Buffer.from('not-really-a-jpeg-but-bytes-are-bytes-' + 'x'.repeat(2000));
const { createHash } = await import('crypto');
const evidenceSha = createHash('sha256').update(evidenceBytes).digest('hex');

await step('upload with a correct hash-at-capture is stored under that hash', async () => {
  const r = await api.post('/api/evidence/upload').set(H)
    .set('content-type', 'image/jpeg').set('x-sha256', evidenceSha).send(evidenceBytes);
  expect(r.status === 201, `status ${r.status}: ${JSON.stringify(r.body)}`);
  expect(r.body.sha256 === evidenceSha, 'server hash differs');
  expect(r.body.storageKey === `${evidenceSha}.jpg`, `storageKey ${r.body.storageKey}`);
  return `${r.body.backend}: ${r.body.storageKey} (${r.body.bytes} bytes)`;
});

await step('IPS 21(4): bytes that do not match the claimed hash are refused', async () => {
  const r = await api.post('/api/evidence/upload').set(H)
    .set('content-type', 'image/jpeg').set('x-sha256', 'f'.repeat(64)).send(evidenceBytes);
  expect(r.status === 409, `status ${r.status}`);
  expect(r.body.clause === 'IPS 21(4)', JSON.stringify(r.body));
  return '409 — a record whose bytes do not match their hash is worse than none';
});

await step('GET /api/evidence/:key returns the stored bytes', async () => {
  const r = await api.get(`/api/evidence/${evidenceSha}.jpg`).buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  expect(r.status === 200, `status ${r.status}`);
  expect(Buffer.compare(r.body, evidenceBytes) === 0, 'bytes differ');
  return `${r.body.length} bytes round-tripped`;
});

console.log('\nSHEET NODES — what the app needs to mirror the workbook');
await step('template meta carries the sheet-level nodes and the class overlay', async () => {
  const r = await api.get('/api/templates/wks17-general');
  const m = r.body.meta;
  expect(m?.sheet?.note === 'NB: Non compliances are in red', JSON.stringify(m?.sheet).slice(0, 200));
  expect(m.sheet.columnHeaders.join('|') === 'Item|Regulation|Action|Records|Comments', 'column headers');
  expect(m.sheetByClass?.class_6_8?.declaration?.includes('Regulation 13.38'), 'class 6/8 declaration');
  expect(m.sheetByClass?.class_2_3?.declaration?.includes('Regulation 17.91'), 'class 2/3 declaration');
  const c68 = await api.get('/api/templates/wks17-class-6-1a-6-1b-6-1c-8-2a-8');
  expect(c68.body.meta.sheet.documentControl?.Owner === 'BW', 'document control');
  expect(c68.body.meta.sheet.footer === 'Section 2/2', 'footer');
  return `general: ${Object.keys(m.sheetByClass).join(', ')} overlays; class 6/8: document control + scope + footer`;
});

await step('IPS 21(5): inspection.sign records (who, when) for declaration and scope', async () => {
  const r = await sync([
    ev('inspection.sign', { inspectionId, which: 'declaration' }),
    ev('inspection.sign', { inspectionId, which: 'scope' }),
  ]);
  expect(r.body.applied.length === 2, JSON.stringify(r.body.rejected));
  const job = await api.get(`/api/jobs/${jobId}`);
  const i = job.body.inspections[0];
  expect(i.declaration_signed_by === 1 && i.declaration_signed_at, 'declaration not signed');
  expect(i.scope_confirmed_by === 1 && i.scope_confirmed_at, 'scope not confirmed');
  return `signed by user ${i.declaration_signed_by} at ${new Date(i.declaration_signed_at).toISOString()}`;
});

await step('a signature without an authenticated signer is rejected with IPS 21(5)', async () => {
  const r = await api.post('/api/sync').set('x-device-id', 'anon-device')
    .send({ deviceId: 'anon-device', events: [ev('inspection.sign', { inspectionId, which: 'declaration' })] });
  expect(r.body.rejected.length === 1 && r.body.rejected[0].clause === 'IPS 21(5)', JSON.stringify(r.body));
  return r.body.rejected[0].reason;
});

await step('job payload carries the site-block sources: contacts and substances', async () => {
  await db.query(`INSERT INTO contact (client_id, name, role, phone, email, is_site_manager)
                  SELECT client_id, 'Jesh Chandra', 'Site manager', '0226787761', 'jesh.chandra@argentaglobal.com', true
                  FROM job WHERE id = $1`, [jobId]);
  await db.query(`INSERT INTO substance (hs_location_id, name, hazard_class, quantity, unit)
                  SELECT hs_location_id, s.n, s.c, s.q, 'kg' FROM job,
                    (VALUES ('Abamectin','6.1B',190),('Eprinomectin','6.1C',2500),
                            ('Ivermectin','6.1B',10),('Moxidectin','6.1B',120)) AS s(n,c,q)
                  WHERE job.id = $1`, [jobId]);
  const job = await api.get(`/api/jobs/${jobId}`);
  expect(job.body.contacts?.[0]?.name === 'Jesh Chandra', 'manager missing');
  expect(job.body.substances?.length === 4, `substances ${job.body.substances?.length}`);
  return `manager ${job.body.contacts[0].name}; ${job.body.substances.map((s) => s.name).join(', ')}`;
});

await step('sync_event holds every event ever received, with outcomes', async () => {
  const r = await db.query(`SELECT outcome, count(*)::int n FROM sync_event GROUP BY outcome ORDER BY outcome`);
  const o = Object.fromEntries(r.rows.map((x) => [x.outcome, x.n]));
  expect(o.rejected >= 4 && o.applied >= 60, JSON.stringify(o));
  return JSON.stringify(o);
});

await db.close();
console.log(`\n${'─'.repeat(72)}`);
if (problems.length) {
  console.log(`FAILED — ${pass} passed, ${problems.length} failed`);
  for (const p of problems) console.log('  • ' + p);
  process.exit(1);
}
console.log(`OK — ${pass} steps passed. The real job ran end to end through the API.`);
