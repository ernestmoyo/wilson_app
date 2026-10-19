/**
 * Exports (contract C, 19 October 2026): the completed check sheet as a PDF
 * that follows the workbooks, and the job bundle ZIP (checksheet, certificate,
 * non-compliance report, evidence named by appendix).
 *
 * The job is built through the API from the G2 Chiller workbook's own
 * findings (so every item is answered, as on a real sheet), then a few items
 * are changed to cover each result: a red finding with its reason, a blue
 * general comment, an N/A with a reason, an item left unassessed. Two
 * sections are excluded directly in the table (one not chosen, one not in
 * scope). Evidence (a photo and a PDF) goes through /api/evidence/upload in
 * disk mode. Test data only, on PGlite; no Blob or Spaces is ever called.
 *
 * SAMPLE_PDF_OUT=<path> writes the rendered PDF there for a visual check.
 */
import request from 'supertest';
import { randomUUID, createHash } from 'crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { inflateSync } from 'zlib';
import { unzipSync } from 'fflate';

// Disk mode for evidence and exports, whatever the shell carries.
for (const k of ['BLOB_READ_WRITE_TOKEN', 'SPACES_BUCKET', 'DATABASE_URL', 'POSTGRES_URL', 'SIGNATURE_IMAGE_PATH']) delete process.env[k];
process.env.EVIDENCE_DIR = mkdtempSync(join(tmpdir(), 'export-test-evidence-'));

const { connect, migrate } = await import('../src/db.mjs');
const { buildApp } = await import('../src/app.mjs');
const { hashPasscode } = await import('../src/auth.mjs');
const { setExportStore } = await import('../src/export/bundle.mjs');

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

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', '..', 'packages', 'checksheets', 'data');
const instance = (name) => JSON.parse(readFileSync(join(dataDir, `g2-chiller-class-6-and-8-location-checksheets--${name}.instance.json`), 'utf8'));
const GENERAL = 'wks17-general', CLASS68 = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8';

const db = await connect({ url: null });
await migrate(db);
const certEmail = 'export.certifier@example.com', viewerEmail = 'export.viewer@example.com';
await db.query(`INSERT INTO app_user (full_name, occupation, email, role, authorisation_number, passcode_hash)
                VALUES ('Export Test Certifier','Compliance certifier',$1,'certifier','TST100250',$2)`, [certEmail, hashPasscode('cert-pass')]);
await db.query(`INSERT INTO app_user (full_name, occupation, email, role, passcode_hash)
                VALUES ('Export Test Viewer','Client contact',$1,'viewer',$2)`, [viewerEmail, hashPasscode('view-pass')]);
const app = buildApp(db, { requireAuth: true });
const api = request(app);
const loginAs = async (email, passcode) => {
  const r = await api.post('/api/auth/login').send({ email, passcode, deviceId: 'export-test' });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${r.text}`);
  return { token: r.body.token, h: { authorization: `Bearer ${r.body.token}` } };
};
const cert = await loginAs(certEmail, 'cert-pass');
const viewer = await loginAs(viewerEmail, 'view-pass');
const sync = async (events) => {
  const r = await api.post('/api/sync').set(cert.h).send({
    deviceId: 'export-test',
    events: events.map(([type, payload]) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() })),
  });
  if (r.status !== 200 || r.body.rejected?.length) throw new Error(`sync: ${r.status} ${JSON.stringify(r.body.rejected ?? r.text)}`);
  return r.body.applied;
};

// ── the subject: a class 6/8 location, every item answered from the workbook ──
const CLIENT = 'Export Test Argenta Limited';
const created = await api.post('/api/jobs/import').set(cert.h).send({
  client: { legalName: CLIENT, tradingName: 'Export Test Argenta', nzbn: '9429033971360', postalAddress: 'PO Box 75340, Manurewa 2243' },
  site: { address: '2 Sterling Avenue, Manurewa East, Auckland 2102' },
  location: { name: 'G2 Chiller', summary: 'Chilled store for finished veterinary products, bunded, single door' },
  contacts: [{ name: 'Jesh Export', phone: '021 555 0101', isSiteManager: true }],
  substances: [{ name: 'Formalin 37%', hazardClass: '6.1B', quantity: 310, unit: 'kg' }, { name: 'Sodium hydroxide', hazardClass: '8.2B', quantity: 120, unit: 'L' }],
  classKey: 'class_6_8', stage: 'site_inspection',
  inspection: { inspectedAt: '2026-10-14T09:30:00+13:00', equipmentUsed: 'iPad, tape measure' },
});
if (created.status !== 201) throw new Error(`import: ${created.status} ${created.text}`);
const { jobId, inspectionId } = created.body;

const finding = (templateCode, f, extra = {}) => ['finding.upsert', {
  inspectionId, templateCode, sectionOrdinal: f.sectionOrdinal, itemOrdinal: f.itemOrdinal,
  status: f.status, comment: f.comment ?? null,
  failureReason: f.status === 'non_compliant' ? (f.comment ?? 'Not met') : null,
  verificationMethod: 'inspection', decidedAt: '2026-10-14T10:00:00+13:00', ...extra,
}];
await sync([
  ...instance('wks17-locations-general').findings.map((f) => finding(GENERAL, f)),
  ...instance('wks17-class-6-1a-6-1b-6-1c-8-2a-8').findings.map((f) => finding(CLASS68, f)),
]);
// One of each result we must see printed.
const RED_REASON = 'No spill kit at the store entrance; the nearest is 40 m away';
const GENERAL_COMMENT = 'Consider relocating the eyewash closer to the decanting bench';
const NA_REASON = 'No class 6.1A substance is held at this location';
await sync([
  ['finding.upsert', { inspectionId, templateCode: GENERAL, sectionOrdinal: 7, itemOrdinal: 1, status: 'non_compliant', failureReason: RED_REASON, comment: 'Spill kit missing' }],
  ['finding.upsert', { inspectionId, templateCode: GENERAL, sectionOrdinal: 3, itemOrdinal: 1, status: 'compliant', comment: 'Training records sighted for all three handlers', generalComment: GENERAL_COMMENT }],
  ['finding.upsert', { inspectionId, templateCode: CLASS68, sectionOrdinal: 1, itemOrdinal: 1, status: 'not_applicable', naReason: NA_REASON }],
  ['finding.upsert', { inspectionId, templateCode: CLASS68, sectionOrdinal: 6, itemOrdinal: 2, status: 'pending' }],
]);
// Two excluded sections, written the way inspection.open will write them.
const sec = async (code, ordinal) => (await db.query(
  `SELECT s.id, s.title FROM checksheet_section s JOIN checksheet_template t ON t.id = s.template_id
   JOIN inspection_template it ON it.template_id = t.id AND it.inspection_id = $1
   WHERE t.code = $2 AND s.ordinal = $3`, [inspectionId, code, ordinal])).rows[0];
const notChosen = await sec(GENERAL, 8);  // Site Plan
const notInScope = await sec(GENERAL, 5); // Fire extinguishers
await db.query(`INSERT INTO inspection_section_excluded (inspection_id, section_id, reason) VALUES ($1,$2,'not_chosen'),($1,$3,'not_in_scope')`,
  [inspectionId, notChosen.id, notInScope.id]);

// Evidence through the real upload route, disk mode.
const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`export test photo ${randomUUID()}`), Buffer.from([0xff, 0xd9])]);
const pdfDoc = Buffer.from(`%PDF-1.4\n% export test ERP ${randomUUID()}\n%%EOF\n`);
const up = async (buf, mime) => {
  const r = await api.post('/api/evidence/upload').set(cert.h).set('content-type', mime).set('x-sha256', sha(buf)).send(buf);
  if (r.status !== 201) throw new Error(`upload: ${r.status} ${r.text}`);
  return r.body;
};
const upPhoto = await up(photo, 'image/jpeg');
const upPdf = await up(pdfDoc, 'application/pdf');
const redFindingId = (await db.query(
  `SELECT f.id FROM finding f JOIN checksheet_item i ON i.id = f.item_id JOIN checksheet_section s ON s.id = i.section_id
   JOIN checksheet_template t ON t.id = s.template_id WHERE f.inspection_id = $1 AND t.code = $2 AND s.ordinal = 7 AND i.ordinal = 1`,
  [inspectionId, GENERAL])).rows[0].id;
const attached = await sync([
  ['evidence.attach', { jobId, inspectionId, findingId: redFindingId, kind: 'photo', sha256: upPhoto.sha256, storageKey: upPhoto.storageKey,
    mime: 'image/jpeg', bytes: photo.length, capturedByName: 'Export Test Certifier', capturedByOccupation: 'Compliance certifier',
    capturedAt: '2026-10-14T10:05:00+13:00', capturedWhere: 'G2 Chiller entrance' }],
  ['evidence.attach', { jobId, inspectionId, kind: 'document', sha256: upPdf.sha256, storageKey: upPdf.storageKey,
    mime: 'application/pdf', bytes: pdfDoc.length, provenance: 'none', appendixCategory: 'Appendix 6' }],
]);
// The file name a document arrived with (evidence.attach learns originalName in package B).
await db.query(`UPDATE evidence SET original_name = 'ERP rev 2.pdf' WHERE id = $1`, [attached[1].result.evidenceId]);
await sync([['inspection.sign', { inspectionId, which: 'declaration', signedAt: '2026-10-14T16:00:00+13:00' }],
            ['inspection.sign', { inspectionId, which: 'scope', signedAt: '2026-10-14T16:01:00+13:00' }]]);

let pdfText0 = '';
await step('the checksheet PDF is a PDF, A4 landscape, and prints the site block and certifier', async () => {
  const r = await api.get(`/api/jobs/${jobId}/checksheet.pdf`).set(cert.h).buffer(true).parse((res, cb) => {
    const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c)));
  });
  expect(r.status === 200, `${r.status} ${r.text}`);
  expect(/application\/pdf/.test(r.headers['content-type']), r.headers['content-type']);
  expect(r.body.subarray(0, 5).toString() === '%PDF-', 'not a PDF');
  expect(/inline; filename="Checksheet - Job \d+ - Export Test Argenta Limited\.pdf"/.test(r.headers['content-disposition']), r.headers['content-disposition']);
  expect(/\/MediaBox \[0 0 841\.89 595\.28\]/.test(r.body.toString('latin1')), 'not A4 landscape');
  if (process.env.SAMPLE_PDF_OUT) writeFileSync(process.env.SAMPLE_PDF_OUT, r.body);
  pdfText0 = pdfText(r.body);
  for (const t of [CLIENT, '2 Sterling Avenue', 'G2 Chiller', 'Jesh Export', 'Formalin 37%', 'TST100250', 'Export Test Certifier', 'Compliance certifier', '14/10/2026'])
    expect(pdfText0.includes(t), `missing "${t}"`);
  return `${r.body.length} bytes, ${(r.body.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length} pages`;
});

await step('results print in the workbook words: red reason, blue general comment, N/A reason, not assessed', async () => {
  expect(pdfText0.includes(`Non-compliance: ${RED_REASON}`), 'red finding reason');
  expect(pdfText0.includes(`General comment: ${GENERAL_COMMENT}`), 'general comment');
  expect(pdfText0.includes(`Not applicable: ${NA_REASON}`), 'N/A reason');
  expect(pdfText0.includes('Not assessed'), 'pending item not marked');
  expect(pdfText0.includes('Confirmed that the store does not have compliant signage'), 'workbook finding text');
});

await step('excluded sections: not chosen is omitted, not in scope is listed once', async () => {
  // Its band ("8 Site Plan") and its items' actions are absent.
  expect(!pdfText0.includes(`8 ${notChosen.title}`), `"${notChosen.title}" band printed though not chosen`);
  const actions = (await db.query(`SELECT action FROM checksheet_item WHERE section_id = $1`, [notChosen.id])).rows;
  for (const a of actions) { const head = a.action.replace(/\s+/g, ' ').slice(0, 40); expect(!pdfText0.includes(head), `item of a not-chosen section printed: ${head}`); }
  expect(pdfText0.includes(`5 ${notInScope.title}`), 'not-in-scope band missing');
  expect(pdfText0.includes(notInScope.title), `"${notInScope.title}" not listed`);
  expect((pdfText0.match(/Not in scope/g) ?? []).length === 1, 'Not in scope should appear exactly once');
});

await step('declaration, decision, document control, scope of authorisation and signature dates print', async () => {
  for (const t of ['Declaration: I verify that I have examined the evidence', 'Decision: not yet made', 'Document Control',
                   'Scope of Authorisation', 'Signed by Export Test Certifier on 14/10/2026', 'Confirmed by Export Test Certifier', 'Authorisation number'])
    expect(pdfText0.includes(t), `missing "${t}"`);
});

await step('the Evidence Portfolio column names the files the ZIP holds', async () => {
  expect(pdfText0.includes('Item 7.1 - 1.jpg'), 'photo name in the PDF');
});

await step('an unknown job is a 404 for both exports', async () => {
  const a = await api.get('/api/jobs/987654321/checksheet.pdf').set(cert.h);
  const b = await api.post('/api/jobs/987654321/bundle').set(cert.h);
  expect(a.status === 404 && b.status === 404, `${a.status} ${b.status}`);
  const anon = await api.get(`/api/jobs/${jobId}/checksheet.pdf`);
  expect(anon.status === 401, `signed-out read: ${anon.status}`);
});

const zipBody = (res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); };

await step('a viewer can download the checksheet and the bundle (?token= for the browser too)', async () => {
  const a = await api.get(`/api/jobs/${jobId}/checksheet.pdf`).set(viewer.h);
  expect(a.status === 200, `viewer pdf: ${a.status}`);
  const b = await api.get(`/api/jobs/${jobId}/bundle.zip?token=${viewer.token}`).buffer(true).parse(zipBody);
  expect(b.status === 200 && /application\/zip/.test(b.headers['content-type']), `viewer zip: ${b.status} ${b.headers['content-type']}`);
});

await step('disk mode: the bundle streams back with the checksheet, report and evidence, bytes intact', async () => {
  const r = await api.post(`/api/jobs/${jobId}/bundle`).set(cert.h).buffer(true).parse(zipBody);
  expect(r.status === 200 && /application\/zip/.test(r.headers['content-type']), `${r.status} ${r.headers['content-type']}`);
  expect(new RegExp(`attachment; filename="Assure Safety - Job ${jobId} - Export Test Argenta Limited\\.zip"`).test(r.headers['content-disposition']), r.headers['content-disposition']);
  const files = unzipSync(new Uint8Array(r.body));
  const names = Object.keys(files).sort();
  const want = ['01 Checksheet.pdf', '03 Non-compliance report.html', 'Appendix 6 - ERP rev 2.pdf', 'Item 7.1 - 1.jpg'];
  expect(JSON.stringify(names) === JSON.stringify(want), `entries: ${JSON.stringify(names)}`);
  expect(sha(Buffer.from(files['Item 7.1 - 1.jpg'])) === upPhoto.sha256, 'photo bytes changed');
  expect(sha(Buffer.from(files['Appendix 6 - ERP rev 2.pdf'])) === upPdf.sha256, 'PDF bytes changed');
  expect(Buffer.from(files['01 Checksheet.pdf']).subarray(0, 5).toString() === '%PDF-', 'checksheet in the zip is not a PDF');
  expect(Buffer.from(files['03 Non-compliance report.html']).toString().includes(RED_REASON), 'NC report lacks the finding');
  return names.join(', ');
});

await step('with a certificate issued, the bundle carries it and the PDF prints the decision', async () => {
  // Answer the one open item, declare interests, move to final validation, issue conditional.
  await sync([
    ['finding.upsert', { inspectionId, templateCode: CLASS68, sectionOrdinal: 6, itemOrdinal: 2, status: 'compliant', comment: 'Sighted' }],
    ['interest.declare', { jobId, conflictFound: false }],
    ['job.transition', { jobId, toStage: 'compliance_evaluation' }],
    ['job.transition', { jobId, toStage: 'final_validation' }],
  ]);
  const c = await api.post(`/api/jobs/${jobId}/certificate`).set(cert.h).send({
    decision: 'conditional', inspectionId, certificateNumber: 'TST100250-EXPORT-1', issuedTo: CLIENT, appliesTo: 'G2 Chiller', issueDate: '2026-10-15',
    expiryDate: '2027-10-15', conditions: ['Spill kit to be installed at the store entrance within 20 working days'],
  });
  expect(c.status === 201, `certificate: ${c.status} ${c.text}`);
  const r = await api.post(`/api/jobs/${jobId}/bundle`).set(cert.h).buffer(true).parse(zipBody);
  const files = unzipSync(new Uint8Array(r.body));
  expect(files['02 Certificate.html'] && Buffer.from(files['02 Certificate.html']).toString().includes('<html'), `entries: ${Object.keys(files)}`);
  const text = pdfText(Buffer.from(files['01 Checksheet.pdf']));
  expect(text.includes('Decision: Compliance certificate issued with conditions'), 'decision not printed');
  expect(text.includes('Spill kit to be installed at the store entrance'), 'condition not printed');
});

await step('Blob / Spaces mode: the zip is stored under exports/ and a presigned link comes back', async () => {
  const puts = [];
  setExportStore({ backend: 'stub', async put(key, buf) { puts.push({ key, buf }); return { url: `https://stub.example/${key}?sig=x`, expiresAt: '2026-10-19T01:00:00Z' }; } });
  try {
    const r = await api.post(`/api/jobs/${jobId}/bundle`).set(viewer.h);
    expect(r.status === 200, `${r.status} ${r.text}`);
    expect(puts.length === 1 && new RegExp(`^exports/${jobId}-\\d{8}T\\d{6}Z\\.zip$`).test(puts[0].key), `key: ${puts[0]?.key}`);
    expect(r.body.url === `https://stub.example/${puts[0].key}?sig=x`, `url: ${r.body.url}`);
    expect(r.body.bytes === puts[0].buf.length && r.body.files.includes('01 Checksheet.pdf') && r.body.files.includes('Item 7.1 - 1.jpg'), JSON.stringify(r.body));
    const g = await api.get(`/api/jobs/${jobId}/bundle.zip?token=${viewer.token}`);
    expect(g.status === 302 && g.headers.location.startsWith('https://stub.example/exports/'), `browser route: ${g.status} ${g.headers.location}`);
  } finally { setExportStore(undefined); }
});

await step('a certified handler job prints its applicant block and assessment rows', async () => {
  const h = await api.post('/api/jobs/import').set(cert.h).send({
    client: { legalName: 'Export Test Handler Co' }, site: { address: '1 Handler Road' }, location: { name: 'Applicant' },
    classKey: 'handler_6', stage: 'site_inspection', subject: { Name: 'A. Export Applicant', 'Application type': 'Renewal' },
    findings: [{ templateCode: 'ch-class-6-handler-assessment', sectionOrdinal: 1, itemOrdinal: 1, status: 'compliant', comment: 'Passport sighted' }],
  });
  expect(h.status === 201, `${h.status} ${h.text}`);
  const r = await api.get(`/api/jobs/${h.body.jobId}/checksheet.pdf`).set(cert.h).buffer(true).parse(zipBody);
  expect(r.status === 200, `${r.status}`);
  const t = pdfText(r.body);
  for (const s of ['Handler Assessment Check Sheet', 'A. Export Applicant', 'Renewal', 'Verification of full legal name', 'Passport sighted', 'Not assessed'])
    expect(t.includes(s), `missing "${s}"`);
});

await step('a class 2/3.1 job prints the class 2/3.1 regulations and scope, not the class 6/8 wording', async () => {
  const c = await api.post('/api/jobs').set(cert.h).send({ client: { legalName: 'Export Test Paints Limited' }, site: { address: '9 Export Road' },
    location: { name: 'Flammables cabinet' }, classKey: 'class_2_3', scopeChoices: ['3_1_cabinet'] });
  expect(c.status === 201, `${c.status} ${c.text}`);
  await sync([['inspection.open', { jobId: c.body.jobId, hsLocationId: c.body.hsLocationId, equipmentUsed: 'iPad',
    templateCodes: ['wks17-general', 'wks17-class-2-and-3-1-substances'] }]]);
  const r = await api.get(`/api/jobs/${c.body.jobId}/checksheet.pdf`).set(cert.h).buffer(true).parse(zipBody);
  const t = pdfText(r.body);
  expect(t.includes('10.34(1)(a)'), 'general sheet item 2.1 should cite 10.34(1)(a) for class 2/3.1');
  expect(!t.includes('13.34(4)'), 'class 6/8 regulation 13.34(4) printed on a class 2/3.1 job');
  expect(!/classes 6 or 8/i.test(t), 'class 6/8 scope wording printed on a class 2/3.1 job');
});

await db.close();
console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
