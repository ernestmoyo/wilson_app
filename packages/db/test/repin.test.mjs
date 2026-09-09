#!/usr/bin/env node
/**
 * Migration 006 folds stray findings back onto the pinned revision.
 *
 * Reproduces the G2 job after rev 2 landed: the inspection was pinned to
 * rev 1, but findings written afterwards resolved to rev 2's item rows, so
 * the same logical item carried two findings. This test builds that state
 * and checks the repair keeps one finding per item, on the pinned revision,
 * with the later decision's values, and that re-running it is a no-op.
 */

import { PGlite } from '@electric-sql/pglite';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const mig = join(here, '..', 'migrations');
const seedNow = readFileSync(join(repo, 'packages', 'checksheets', 'generated', 'seed-templates.sql'), 'utf8');
const repair = readFileSync(join(mig, '006_repin_stray_findings.sql'), 'utf8');

let seedOld;
try {
  seedOld = execSync('git show 8466802:packages/checksheets/generated/seed-templates.sql', {
    cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch {
  console.log('skip: could not read the pre-fix seed from git');
  process.exit(0);
}

const db = new PGlite();
let pass = 0;
const fail = [];
const check = async (name, fn) => {
  try { const m = await fn(); pass++; console.log(`  ok    ${name}${m ? `\n        ${m}` : ''}`); }
  catch (e) { fail.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
};
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const itemIn = async (rev, sec, item) => (await one(`
  SELECT i.id FROM checksheet_item i
  JOIN checksheet_section s ON s.id = i.section_id
  JOIN checksheet_template t ON t.id = s.template_id
  WHERE t.code = 'wks17-general' AND t.revision = $1 AND s.ordinal = $2 AND i.ordinal = $3`, [rev, sec, item])).id;

await check('old seed, migrations 002–005, an inspection pinned to rev 1', async () => {
  await db.exec(seedOld);
  for (const f of ['002_instance_layer.sql', '003_guards_and_events.sql', '004_sync.sql', '005_inspection_signatures.sql'])
    await db.exec(readFileSync(join(mig, f), 'utf8'));
  await db.exec(`
    INSERT INTO app_user (id, full_name, occupation) VALUES (1,'Bryan Wilson','Compliance certifier');
    INSERT INTO client (id, legal_name) VALUES (1,'Argenta');
    INSERT INTO site (id, client_id, address) VALUES (1,1,'2 Sterling Avenue');
    INSERT INTO hs_location (id, site_id, name) VALUES (1,1,'G2 Chiller');
    INSERT INTO job (id, client_id, hs_location_id) VALUES (1,1,1);
    INSERT INTO inspection (id, job_id, hs_location_id, certifier_id, inspected_at, equipment_used)
      VALUES (1,1,1,1,now(),'iPad');
    INSERT INTO inspection_template (inspection_id, template_id)
      SELECT 1, id FROM checksheet_template WHERE code IN ('wks17-general','wks17-class-6-1a-6-1b-6-1c-8-2a-8');`);
  const old44 = await itemIn(1, 4, 4);
  await db.query(`INSERT INTO finding (inspection_id, item_id, status, failure_reason, decided_at)
                  VALUES (1,$1,'non_compliant','older reason', now() - interval '1 hour')`, [old44]);
  return `finding on rev-1 item ${old44}`;
});

await check('rev 2 lands; strays are written against its items', async () => {
  await db.exec(seedNow);
  const cur = await one(`SELECT revision, status FROM checksheet_template WHERE code='wks17-general' AND status='current'`);
  if (cur.revision !== 2) throw new Error(`expected rev 2 current, got ${JSON.stringify(cur)}`);
  const new44 = await itemIn(2, 4, 4);
  const new11 = await itemIn(2, 1, 1);
  await db.query(`INSERT INTO finding (inspection_id, item_id, status, failure_reason, decided_at)
                  VALUES (1,$1,'non_compliant','newer reason', now())`, [new44]);
  await db.query(`INSERT INTO finding (inspection_id, item_id, status, comment, decided_at)
                  VALUES (1,$1,'compliant','no counterpart on rev 1', now())`, [new11]);
  const n = (await one(`SELECT count(*)::int n FROM finding WHERE inspection_id = 1`)).n;
  if (n !== 3) throw new Error(`expected 3 findings before repair, got ${n}`);
  return '3 findings, two of them strays on rev 2';
});

await check('006 folds strays onto the pinned revision, later decision wins', async () => {
  await db.exec(repair);
  const rows = (await db.query(`
    SELECT f.id, f.status, f.failure_reason, f.comment, t.revision, s.ordinal AS sec, i.ordinal AS item
    FROM finding f JOIN checksheet_item i ON i.id = f.item_id
    JOIN checksheet_section s ON s.id = i.section_id
    JOIN checksheet_template t ON t.id = s.template_id
    WHERE f.inspection_id = 1 ORDER BY s.ordinal, i.ordinal`)).rows;
  if (rows.length !== 2) throw new Error(`expected 2 findings after repair, got ${rows.length}`);
  if (rows.some((r) => r.revision !== 1)) throw new Error(`a finding is still off the pinned revision: ${JSON.stringify(rows)}`);
  const f44 = rows.find((r) => r.sec === 4 && r.item === 4);
  if (f44.failure_reason !== 'newer reason') throw new Error(`later decision did not win: ${f44.failure_reason}`);
  const f11 = rows.find((r) => r.sec === 1 && r.item === 1);
  if (!f11 || f11.status !== 'compliant') throw new Error('the unmatched stray was not moved');
  return rows.map((r) => `s${r.sec}/i${r.item} rev${r.revision} ${r.status}`).join(', ');
});

await check('re-running 006 changes nothing', async () => {
  const before = (await db.query(`SELECT id, item_id, status, failure_reason, updated_at FROM finding ORDER BY id`)).rows;
  await db.exec(repair);
  const after = (await db.query(`SELECT id, item_id, status, failure_reason, updated_at FROM finding ORDER BY id`)).rows;
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('second run mutated findings');
});

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
