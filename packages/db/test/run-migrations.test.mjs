#!/usr/bin/env node
/**
 * Run every migration against a real Postgres (PGlite — Postgres compiled to
 * WASM), then exercise the guards.
 *
 * Constraints and triggers that have never been executed are decoration. Each
 * test below asserts that a rule the regulations require is actually enforced
 * by the database, and — just as important — that the LEGAL path still works.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const generatedSql = join(here, '..', '..', 'checksheets', 'generated', 'seed-templates.sql');

let pass = 0;
const failures = [];

function check(name, fn) {
  return fn().then(
    () => { pass++; console.log(`  ok    ${name}`); },
    (e) => { failures.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
  );
}

/** Assert that a statement is rejected, and that the message mentions `clause`. */
async function rejects(db, sql, clause, params = []) {
  try {
    await db.query(sql, params);
  } catch (e) {
    if (clause && !e.message.includes(clause))
      throw new Error(`rejected, but not for ${clause} — got: ${e.message}`);
    return;
  }
  throw new Error('expected the database to reject this, but it succeeded');
}

const db = new PGlite();
console.log('PGlite starting…\n');

// ── migrations ─────────────────────────────────────────────────────────────
console.log('MIGRATIONS');
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

await check('001_template_layer.sql (generated)', async () => {
  await db.exec(readFileSync(generatedSql, 'utf8'));
});
for (const f of files) {
  await check(f, async () => {
    await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  });
}

if (failures.length) {
  console.log(`\n${failures.length} migration(s) failed — stopping.`);
  process.exit(1);
}

// ── fixtures ───────────────────────────────────────────────────────────────
console.log('\nFIXTURES');
await check('seed certifier, client, site, location, job', async () => {
  await db.exec(`
    INSERT INTO app_user (id, full_name, occupation, email, role, authorisation_number)
    VALUES (1, 'Bryan Wilson', 'Compliance certifier', 'compliancecertifier@assuresafety.co.nz',
            'certifier', 'TST100250');

    INSERT INTO client (id, legal_name, nzbn, companies_number)
    VALUES (1, 'Argenta Manufacturing Limited', '9429033971360', '1846134');

    INSERT INTO site (id, client_id, address)
    VALUES (1, 1, '2 Sterling Avenue, Manurewa East, Auckland 2102');

    INSERT INTO hs_location (id, site_id, name, summary)
    VALUES (1, 1, 'G2 Chiller', 'Dedicated storage for class 6.1B and 6.1C');

    INSERT INTO job (id, client_id, hs_location_id, class_key)
    VALUES (1, 1, 1, 'class_6_8');

    INSERT INTO inspection (id, job_id, hs_location_id, certifier_id, inspected_at, equipment_used)
    VALUES (1, 1, 1, 1, now(), 'iPad, tape measure');
  `);
});

const itemId = (await db.query(`
  SELECT i.id FROM checksheet_item i
  JOIN checksheet_section s ON s.id = i.section_id
  JOIN checksheet_template t ON t.id = s.template_id
  WHERE t.code = 'wks17-general' AND s.ordinal = 4 AND i.ordinal = 3
`)).rows[0]?.id;

// ── the template layer actually loaded ─────────────────────────────────────
console.log('\nTEMPLATE LAYER');
await check('98 items seeded across 3 templates', async () => {
  const r = await db.query('SELECT count(*)::int AS n FROM checksheet_item');
  if (r.rows[0].n !== 98) throw new Error(`expected 98 items, got ${r.rows[0].n}`);
});

await check('class-conditional regulation refs survived the seed', async () => {
  const r = await db.query(`
    SELECT regulation_refs, regulation_refs_by_class
    FROM checksheet_item i
    JOIN checksheet_section s ON s.id = i.section_id
    JOIN checksheet_template t ON t.id = s.template_id
    WHERE t.code = 'wks17-general' AND s.ordinal = 1 AND i.ordinal = 1
  `);
  const row = r.rows[0];
  if (!row) throw new Error('item not found');
  if (JSON.stringify(row.regulation_refs) !== JSON.stringify(['10.34']))
    throw new Error(`base refs wrong: ${JSON.stringify(row.regulation_refs)}`);
  const byClass = typeof row.regulation_refs_by_class === 'string'
    ? JSON.parse(row.regulation_refs_by_class) : row.regulation_refs_by_class;
  if (byClass.class_6_8.length !== 5)
    throw new Error(`class_6_8 overlay wrong: ${JSON.stringify(byClass.class_6_8)}`);
});

// ── guards ─────────────────────────────────────────────────────────────────
console.log('\nGUARDS — IPS 21(1)(f): a non-compliance must state why');
await check('non_compliant with no reason is REJECTED', async () => {
  await rejects(db,
    `INSERT INTO finding (inspection_id, item_id, status) VALUES (1, $1, 'non_compliant')`,
    'non_compliance_needs_reason', [itemId]);
});

await check('non_compliant WITH a reason is accepted', async () => {
  await db.query(
    `INSERT INTO finding (inspection_id, item_id, status, failure_reason)
     VALUES (1, $1, 'non_compliant', 'No signage on the door to the G2 Chiller')`, [itemId]);
});

console.log('\nGUARDS — job state machine');
await check('illegal transition enquiry → certificate_issued is REJECTED', async () => {
  await rejects(db, `UPDATE job SET stage = 'certificate_issued' WHERE id = 1`,
    'illegal job stage transition');
});

await check('legal transition enquiry → application is accepted', async () => {
  await db.exec(`UPDATE job SET stage = 'application' WHERE id = 1`);
});

await check('each stage change is recorded, not overwritten', async () => {
  const r = await db.query(`SELECT from_stage, to_stage FROM job_stage_transition WHERE job_id = 1`);
  if (r.rows.length !== 1) throw new Error(`expected 1 transition row, got ${r.rows.length}`);
  if (r.rows[0].from_stage !== 'enquiry' || r.rows[0].to_stage !== 'application')
    throw new Error(`wrong transition recorded: ${JSON.stringify(r.rows[0])}`);
});

console.log('\nGUARDS — IPS 23(1): no certificate without an interest declaration');
await check('walk the job to final_validation', async () => {
  await db.exec(`
    UPDATE job SET stage = 'document_review' WHERE id = 1;
    UPDATE job SET stage = 'site_inspection' WHERE id = 1;
    UPDATE job SET stage = 'compliance_evaluation' WHERE id = 1;
    UPDATE job SET stage = 'final_validation' WHERE id = 1;
  `);
});

await check('issuing without an interest declaration is REJECTED', async () => {
  await rejects(db, `UPDATE job SET stage = 'certificate_issued' WHERE id = 1`, 'IPS 23(1)');
});

await check('a declared conflict with no description is REJECTED', async () => {
  await rejects(db,
    `INSERT INTO interest_declaration (job_id, certifier_id, conflict_found)
     VALUES (1, 1, true)`, 'conflict_needs_description');
});

await check('declaring no conflict is accepted', async () => {
  await db.exec(`INSERT INTO interest_declaration (job_id, certifier_id, conflict_found)
                 VALUES (1, 1, false)`);
});

console.log('\nGUARDS — reg 13.39: pending items block issuance');
await check('pending findings are REJECTED at issuance', async () => {
  await db.query(`INSERT INTO finding (inspection_id, item_id, status)
                  SELECT 1, i.id, 'pending'
                  FROM checksheet_item i
                  JOIN checksheet_section s ON s.id = i.section_id
                  JOIN checksheet_template t ON t.id = s.template_id
                  WHERE t.code = 'wks17-general' AND s.ordinal = 1`);
  await rejects(db, `UPDATE job SET stage = 'certificate_issued' WHERE id = 1`, 'reg 13.39');
});

await check('clearing the pending items unblocks it', async () => {
  await db.exec(`UPDATE finding SET status = 'not_applicable' WHERE status = 'pending'`);
  await db.exec(`UPDATE job SET stage = 'certificate_issued' WHERE id = 1`);
});

console.log('\nGUARDS — IPS 8(1)(c)(ii): certificate number prefix');
await check('self-assigned number without the prefix is REJECTED', async () => {
  await rejects(db,
    `INSERT INTO certificate (job_id, decision, certificate_number, certifier_id,
                              issued_to, applies_to, issue_date, in_force_date, expiry_date)
     VALUES (1, 'granted', 'LC/26-250-004', 1, 'Argenta', 'G2 Chiller',
             '2026-07-04', '2026-07-04', '2029-07-04')`,
    'IPS 8(1)(c)(ii)');
});

await check('a register number needs no prefix — accepted', async () => {
  await db.exec(`
    INSERT INTO certificate (id, job_id, decision, register_number, certificate_number,
                             certifier_id, issued_to, applies_to,
                             issue_date, in_force_date, expiry_date)
    VALUES (1, 1, 'granted', 'CER-0250-166217', 'LC/26-250-004', 1,
            'Argenta Manufacturing Limited', 'G2 Chiller',
            '2026-07-04', '2026-07-04', '2029-07-04')`);
});

console.log('\nGUARDS — IPS 21(6): retention computed, not remembered');
await check('retention clock = expiry + 5 years', async () => {
  const r = await db.query(`SELECT trigger, retain_until FROM retention_clock WHERE job_id = 1`);
  const row = r.rows[0];
  if (!row) throw new Error('no retention clock created');
  const iso = new Date(row.retain_until).toISOString().slice(0, 10);
  if (iso !== '2034-07-04') throw new Error(`expected 2034-07-04, got ${iso}`);
  if (row.trigger !== 'expiry_plus_5y') throw new Error(`wrong trigger: ${row.trigger}`);
});

await check('reg 6.22(5): WorkSafe register deadline set from issue date', async () => {
  const r = await db.query(`SELECT worksafe_register_due FROM certificate WHERE id = 1`);
  const iso = new Date(r.rows[0].worksafe_register_due).toISOString().slice(0, 10);
  if (iso !== '2026-07-25') throw new Error(`expected 2026-07-25, got ${iso}`);
});

console.log('\nGUARDS — reg 6.24 / 6.23(2): conditional and refusal coherence');
await check('conditional certificate with no conditions is REJECTED', async () => {
  await db.exec(`INSERT INTO job (id, client_id, hs_location_id) VALUES (2, 1, 1)`);
  await rejects(db,
    `INSERT INTO certificate (job_id, decision, register_number, certifier_id,
                              issued_to, applies_to, issue_date, in_force_date)
     VALUES (2, 'conditional', 'CER-X', 1, 'x', 'y', '2026-01-01', '2026-01-01')`,
    'conditional_needs_conditions');
});

await check('refusal with no stated reasons is REJECTED', async () => {
  await rejects(db,
    `INSERT INTO certificate (job_id, decision, register_number, certifier_id,
                              issued_to, applies_to, issue_date, in_force_date)
     VALUES (2, 'refused', 'CER-Y', 1, 'x', 'y', '2026-01-01', '2026-01-01')`,
    'refusal_needs_reasons');
});

console.log('\nGUARDS — IPS 21(4): evidence provenance');
await check('an app-captured photo without provenance is REJECTED', async () => {
  await rejects(db,
    `INSERT INTO evidence (job_id, kind, sha256, storage_key, mime, bytes, provenance)
     VALUES (1, 'photo', repeat('a',64), 'k', 'image/png', 100, 'app')`,
    'ips_21_4_provenance');
});

await check('a migrated legacy image IS allowed, and visibly marked', async () => {
  await db.exec(
    `INSERT INTO evidence (job_id, kind, sha256, storage_key, mime, bytes, provenance)
     VALUES (1, 'photo', repeat('b',64), 'k2', 'image/png', 100, 'migrated')`);
});

await check('a fully-provenanced photo is accepted', async () => {
  await db.exec(`
    INSERT INTO evidence (job_id, kind, sha256, storage_key, mime, bytes, provenance,
                          captured_by_name, captured_by_occupation, captured_at, captured_where)
    VALUES (1, 'photo', repeat('c',64), 'k3', 'image/jpeg', 200, 'app',
            'Bryan Wilson', 'Compliance certifier', now(), 'G2 Chiller doorway')`);
});

console.log('\nGUARDS — template immutability');
await check('a published template cannot be edited', async () => {
  await db.exec(`UPDATE checksheet_template SET status = 'current' WHERE code = 'wks17-general'`);
  await rejects(db, `UPDATE checksheet_template SET title = 'tampered' WHERE code = 'wks17-general'`,
    'immutable');
});

console.log('\nGUARDS — append-only event log');
await check('events chain and verify', async () => {
  await db.exec(`
    INSERT INTO event (actor_id, entity_type, entity_id, action, payload)
    VALUES (1, 'job', 1, 'stage.changed', '{"to":"certificate_issued"}'),
           (1, 'certificate', 1, 'issued', '{"decision":"granted"}')`);
  const r = await db.query('SELECT * FROM verify_event_chain()');
  if (r.rows.length) throw new Error(`chain broken at seq ${r.rows[0].broken_at}`);
});

await check('the event log rejects UPDATE', async () => {
  await rejects(db, `UPDATE event SET action = 'tampered' WHERE seq = 1`, 'append-only');
});

await check('the event log rejects DELETE', async () => {
  await rejects(db, `DELETE FROM event WHERE seq = 1`, 'append-only');
});

// ── report ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
if (failures.length) {
  console.log(`FAILED — ${pass} passed, ${failures.length} failed`);
  for (const f of failures) console.log('  • ' + f);
  process.exit(1);
}
console.log(`OK — ${pass} checks passed against real Postgres.`);
