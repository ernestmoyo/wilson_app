#!/usr/bin/env node
/**
 * End-to-end: run the REAL G2 Chiller / Argenta job through the real schema.
 *
 * Not synthetic fixtures — this loads the actual data extracted from
 * "G2 Chiller Class 6 and 8 location checksheets.xlsx": the real client, the
 * real 54 findings with their recovered statuses, the real evidence manifest,
 * and the real certificate. Then it walks the job through all eight stages of
 * the process flow, twice: once as the workbook actually stands (where the
 * guards refuse to issue), and again after remediation (where they permit it).
 *
 * A system that only ever says no is useless, so both halves matter.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const mig = join(here, '..', 'migrations');
const cs = join(here, '..', '..', 'checksheets');
const data = join(cs, 'data');

const j = (p) => JSON.parse(readFileSync(p, 'utf8'));

let pass = 0;
const problems = [];
const notes = [];

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

const db = new PGlite();

// ── schema ─────────────────────────────────────────────────────────────────
console.log('SCHEMA');
await step('migrations + generated template seed', async () => {
  await db.exec(readFileSync(join(cs, 'generated', 'seed-templates.sql'), 'utf8'));
  await db.exec(readFileSync(join(mig, '002_instance_layer.sql'), 'utf8'));
  await db.exec(readFileSync(join(mig, '003_guards_and_events.sql'), 'utf8'));
  const r = await db.query('SELECT count(*)::int n FROM checksheet_item');
  return `${r.rows[0].n} template items loaded`;
});

// ── real data ──────────────────────────────────────────────────────────────
const general = j(join(data, 'g2-chiller-class-6-and-8-location-checksheets--wks17-locations-general.instance.json'));
const class68 = j(join(data, 'g2-chiller-class-6-and-8-location-checksheets--wks17-class-6-1a-6-1b-6-1c-8-2a-8.instance.json'));
const cert = j(join(data, 'certificates', 'g2-chiller', 'certificate.json'));
const evidence = j(join(data, 'evidence', 'g2-chiller', 'evidence-manifest.json'));
const sb = general.siteBlock;

console.log('\nSTAGE 1-2 — enquiry → application');
await step('load the real PCBU, site and hazardous substance location', async () => {
  await db.query(
    `INSERT INTO app_user (id, full_name, occupation, email, role, authorisation_number)
     VALUES (1, $1, 'Compliance certifier', $2, 'certifier', $3)`,
    [cert.certifier.fullName, cert.certifier.email, cert.certifier.authorisationNumber]
  );
  await db.query(
    `INSERT INTO client (id, legal_name, trading_name, nzbn, companies_number,
                         postal_address, phone, website, industry)
     VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8)`,
    [sb['Legal Entity Name'], sb['Trading as Name'], sb['NZBN'], cert.location.companyNumber,
     sb['Postal Address'], sb['Business Phone Number'], sb['Business Website'],
     sb['Description of Business Type / Industry']]
  );
  await db.query(`INSERT INTO site (id, client_id, address) VALUES (1,1,$1)`,
    [sb['Site / Location Address']]);
  await db.query(`INSERT INTO hs_location (id, site_id, name, summary) VALUES (1,1,$1,$2)`,
    ['G2 Chiller', sb['Brief location summary']]);
  await db.query(`INSERT INTO job (id, client_id, hs_location_id, class_key)
                  VALUES (1,1,1,'class_6_8')`);
  await db.exec(`UPDATE job SET stage='application' WHERE id=1`);
  return `${sb['Legal Entity Name']} — NZBN ${sb['NZBN']}`;
});

console.log('\nSTAGE 3-4 — document review → site inspection');
await step('open the inspection with IPS 21(1)(d) equipment recorded', async () => {
  await db.exec(`UPDATE job SET stage='document_review' WHERE id=1`);
  await db.exec(`UPDATE job SET stage='site_inspection' WHERE id=1`);
  // "this audit utilized an iPad and tape measure" — from the workbook's own
  // declaration, which is exactly what 21(1)(d) asks to be recorded.
  await db.query(
    `INSERT INTO inspection (id, job_id, hs_location_id, certifier_id, inspected_at, equipment_used)
     VALUES (1,1,1,1,$1,'iPad, tape measure')`, [cert.issueDate]);
  await db.exec(`
    INSERT INTO inspection_template (inspection_id, template_id)
    SELECT 1, id FROM checksheet_template
    WHERE code IN ('wks17-general','wks17-class-6-1a-6-1b-6-1c-8-2a-8')`);
  return 'inspection 1 pinned to the two template revisions it was conducted against';
});

// ── load the real findings ─────────────────────────────────────────────────
async function loadFindings(code, inst) {
  let loaded = 0;
  const rejected = [];
  for (const f of inst.findings) {
    const r = await db.query(
      `SELECT i.id FROM checksheet_item i
       JOIN checksheet_section s ON s.id = i.section_id
       JOIN checksheet_template t ON t.id = s.template_id
       WHERE t.code=$1 AND s.ordinal=$2 AND i.ordinal=$3`,
      [code, f.sectionOrdinal, f.itemOrdinal]);
    const itemId = r.rows[0]?.id;
    if (!itemId) { rejected.push(`no item for ${code} s${f.sectionOrdinal}/i${f.itemOrdinal}`); continue; }

    // In the workbook a non-compliance's Comments cell IS the reason it failed;
    // there is no separate field. Mapping it to failure_reason lets legacy data
    // satisfy IPS 21(1)(f) honestly, rather than by inventing text.
    const failureReason = f.status === 'non_compliant' ? f.comment : null;
    try {
      await db.query(
        `INSERT INTO finding (inspection_id, item_id, status, comment, failure_reason)
         VALUES (1,$1,$2,$3,$4)`,
        [itemId, f.status, f.comment, failureReason]);
      loaded++;
    } catch (e) {
      rejected.push(`s${f.sectionOrdinal}/i${f.itemOrdinal} (${f.status}): ${e.message.split('\n')[0]}`);
    }
  }
  return { loaded, rejected };
}

console.log('\nSTAGE 4 — load the real findings recovered from the workbook');
await step('36 general findings', async () => {
  const { loaded, rejected } = await loadFindings('wks17-general', general);
  if (rejected.length) throw new Error(`${rejected.length} rejected: ${rejected[0]}`);
  return `${loaded}/36 loaded`;
});

await step('18 class 6 & 8 findings', async () => {
  const { loaded, rejected } = await loadFindings('wks17-class-6-1a-6-1b-6-1c-8-2a-8', class68);
  if (rejected.length) throw new Error(`${rejected.length} rejected: ${rejected[0]}`);
  return `${loaded}/18 loaded`;
});

await step('statuses survived the round trip through Postgres', async () => {
  const r = await db.query(`SELECT status, count(*)::int n FROM finding GROUP BY status ORDER BY status`);
  const got = Object.fromEntries(r.rows.map((x) => [x.status, x.n]));
  const want = { compliant: 29, non_compliant: 4, not_applicable: 20, pending: 1 };
  for (const [k, v] of Object.entries(want))
    if (got[k] !== v) throw new Error(`${k}: expected ${v}, got ${got[k] ?? 0}`);
  return JSON.stringify(got);
});

// ── the real evidence ──────────────────────────────────────────────────────
console.log('\nSTAGE 4 — load the real evidence portfolio');
await step('8 evidence images + 3 branding, provenance honestly marked', async () => {
  for (const e of evidence) {
    await db.query(
      `INSERT INTO evidence (job_id, inspection_id, kind, sha256, storage_key, mime, bytes, provenance)
       VALUES (1,1,$1,$2,$3,$4,$5,$6)`,
      [e.classification === 'branding' ? 'branding' : 'photo',
       e.sha256, e.file, e.mime, e.bytes,
       e.classification === 'branding' ? 'none' : 'migrated']);
  }
  const r = await db.query(`SELECT provenance, count(*)::int n FROM evidence GROUP BY provenance`);
  return r.rows.map((x) => `${x.provenance}=${x.n}`).join('  ');
});

await step('IPS 21(4): every migrated photo is flagged as lacking provenance', async () => {
  const r = await db.query(`
    SELECT count(*)::int n FROM evidence
    WHERE kind='photo' AND provenance='migrated' AND captured_by_name IS NULL`);
  if (r.rows[0].n !== 8) throw new Error(`expected 8, got ${r.rows[0].n}`);
  notes.push(`${r.rows[0].n} evidence images carry no photographer, occupation, date or place — IPS 21(4) unmet until back-filled`);
  return `${r.rows[0].n} images need back-fill before they are records`;
});

// ── the workbook as it actually stands ─────────────────────────────────────
console.log('\nSTAGE 5-6 — compliance evaluation → final validation');
await step('walk to final_validation', async () => {
  await db.exec(`UPDATE job SET stage='compliance_evaluation' WHERE id=1`);
  await db.exec(`UPDATE job SET stage='final_validation' WHERE id=1`);
  return 'job at final_validation';
});

console.log('\nSTAGE 7 — attempt to issue the certificate the workbook contains');
await step('IPS 23(1): blocked — no interest declaration', async () => {
  try {
    await db.exec(`UPDATE job SET stage='certificate_issued' WHERE id=1`);
  } catch (e) {
    if (!e.message.includes('IPS 23(1)')) throw new Error(`blocked for the wrong reason: ${e.message}`);
    return 'correctly refused';
  }
  throw new Error('the database allowed issuance with no interest declaration');
});

await step('record the interest declaration (IPS 23)', async () => {
  await db.exec(`INSERT INTO interest_declaration (job_id, certifier_id, conflict_found)
                 VALUES (1,1,false)`);
  return 'no conflict declared';
});

await step('reg 13.39: still blocked — 1 item was never assessed', async () => {
  try {
    await db.exec(`UPDATE job SET stage='certificate_issued' WHERE id=1`);
  } catch (e) {
    if (!e.message.includes('reg 13.39')) throw new Error(`blocked for the wrong reason: ${e.message}`);
    notes.push('1 class 6/8 item was never assessed in the source workbook — the guard caught it');
    return 'correctly refused: the workbook left an item unassessed';
  }
  throw new Error('the database allowed issuance with an unassessed item');
});

await step('the 4 unresolved non-compliances are visible', async () => {
  const r = await db.query(`
    SELECT s.title, i.ordinal, left(f.failure_reason, 66) AS reason
    FROM finding f
    JOIN checksheet_item i ON i.id = f.item_id
    JOIN checksheet_section s ON s.id = i.section_id
    WHERE f.status='non_compliant' ORDER BY s.ordinal, i.ordinal`);
  if (r.rows.length !== 4) throw new Error(`expected 4, got ${r.rows.length}`);
  notes.push('4 unresolved non-compliances: ' + r.rows.map((x) => `${x.title} #${x.ordinal}`).join(', '));
  return r.rows.map((x) => `${x.title} #${x.ordinal} — ${x.reason}…`).join('\n        ');
});

console.log('\nCROSS-CHECK — does the workbook agree with itself?');
await step('the check sheet decision contradicts the certificate', async () => {
  const refusedOnSheet = (class68.trailing.decision || '').toLowerCase().includes('refused');
  const grantedOnCert = cert.decision === 'granted' && cert.requirementsNotMet.length === 0;
  if (!refusedOnSheet || !grantedOnCert)
    throw new Error('expected the contradiction to be present in the source data');
  notes.push(
    'SOURCE DATA CONFLICT: the class 6 & 8 sheet records "compliance certificate refused" ' +
    'with 2 reasons, while the Certificate sheet in the same workbook shows a granted ' +
    'certificate with "Location Requirements Not Met: None".'
  );
  return 'contradiction confirmed — see notes';
});

// ── remediation: prove the system also says YES when it should ─────────────
console.log('\nSTAGE 5 — gap closure: remediate what the inspection found');
await step('assess the item the workbook left pending', async () => {
  await db.exec(`UPDATE finding
                 SET status='not_applicable',
                     comment='Assessed during migration review — threshold not triggered'
                 WHERE status='pending'`);
  const r = await db.query(`SELECT count(*)::int n FROM finding WHERE status='pending'`);
  if (r.rows[0].n !== 0) throw new Error(`still pending: ${r.rows[0].n}`);
  return 'no items left unassessed';
});

await step('raise corrective actions against all 4 non-compliances', async () => {
  await db.exec(`
    INSERT INTO corrective_action (finding_id, severity, description, due_date, status)
    SELECT id, 'major', 'Remediate: ' || left(coalesce(failure_reason,''), 60),
           date '2026-08-31', 'open'
    FROM finding WHERE status='non_compliant'`);
  const r = await db.query('SELECT count(*)::int n FROM corrective_action');
  return `${r.rows[0].n} corrective actions raised`;
});

await step('a corrective action cannot be "verified" without naming a verifier', async () => {
  try {
    await db.exec(`UPDATE corrective_action SET status='verified'`);
  } catch (e) {
    if (!e.message.includes('verified_needs_verifier'))
      throw new Error(`rejected for the wrong reason: ${e.message}`);
    return 'a claim that someone re-checked it must name them';
  }
  throw new Error('allowed verified with no verifier recorded');
});

await step('re-verify each corrective action, naming the verifier', async () => {
  await db.exec(`UPDATE corrective_action
                 SET status='verified', reverified_by=1, reverified_at=now()`);
  const r = await db.query(`SELECT count(*)::int n FROM corrective_action WHERE status='verified'`);
  return `${r.rows[0].n} verified by Bryan Wilson`;
});

console.log('\nSTAGE 6-7 — final validation → issue');
await step('the job may now be issued', async () => {
  await db.exec(`UPDATE job SET stage='certificate_issued' WHERE id=1`);
  const r = await db.query('SELECT stage FROM job WHERE id=1');
  return `stage = ${r.rows[0].stage}`;
});

await step('issue the real certificate', async () => {
  await db.query(
    `INSERT INTO certificate (id, job_id, decision, register_number, certificate_number,
       certifier_id, issued_to, applies_to, issue_date, in_force_date, expiry_date, details)
     VALUES (1,1,'granted',$1,$2,1,$3,$4,$5,$6,$7,$8)`,
    [cert.registerNumber, cert.certificateNumber, cert.issuedTo.name,
     `G2 Chiller, ${cert.location.address}`, cert.issueDate, cert.inForceDate,
     cert.expiryDate, cert.detailsOfCertification]);
  return `${cert.registerNumber} / ${cert.certificateNumber}`;
});

await step('IPS 21(6): retention computed and stamped onto every evidence object', async () => {
  const rc = await db.query('SELECT trigger, retain_until FROM retention_clock WHERE job_id=1');
  const iso = new Date(rc.rows[0].retain_until).toISOString().slice(0, 10);
  if (iso !== '2034-07-04') throw new Error(`expected 2034-07-04, got ${iso}`);
  const ev = await db.query(`SELECT count(*)::int n FROM evidence WHERE retain_until = date '2034-07-04'`);
  if (ev.rows[0].n !== evidence.length)
    throw new Error(`stamped ${ev.rows[0].n} of ${evidence.length} evidence objects`);
  return `retain until ${iso} (${rc.rows[0].trigger}), stamped on all ${ev.rows[0].n} objects`;
});

await step('reg 6.22(5): WorkSafe register deadline set from issue date', async () => {
  const r = await db.query('SELECT worksafe_register_due FROM certificate WHERE id=1');
  return `register by ${new Date(r.rows[0].worksafe_register_due).toISOString().slice(0, 10)}`;
});

console.log('\nSTAGE 8 — monitoring');
await step('job moves to monitoring, with its full history intact', async () => {
  await db.exec(`UPDATE job SET stage='monitoring' WHERE id=1`);
  const r = await db.query(`SELECT to_stage FROM job_stage_transition WHERE job_id=1 ORDER BY id`);
  return `${r.rows.length} recorded transitions: ${r.rows.map((x) => x.to_stage).join(' → ')}`;
});

await step('audit chain verifies', async () => {
  await db.query(
    `INSERT INTO event (actor_id, entity_type, entity_id, action, payload)
     VALUES (1,'certificate',1,'issued',$1::jsonb)`,
    [JSON.stringify({ decision: 'granted', register: cert.registerNumber })]);
  const r = await db.query('SELECT * FROM verify_event_chain()');
  if (r.rows.length) throw new Error(`chain broken at seq ${r.rows[0].broken_at}`);
  return 'intact';
});

// ── report ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(72)}`);
if (notes.length) {
  console.log('FINDINGS FOR THE CERTIFIER');
  for (const n of notes) console.log('  • ' + n);
  console.log('');
}
if (problems.length) {
  console.log(`FAILED — ${pass} passed, ${problems.length} failed`);
  for (const p of problems) console.log('  • ' + p);
  process.exit(1);
}
console.log(`OK — ${pass} steps passed. The real job ran end to end against the real schema.`);
