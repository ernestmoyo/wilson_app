#!/usr/bin/env node
/**
 * Re-seeding a CHANGED template must create a new revision, never merge.
 *
 * Reproduces what happened on the deployed database: the class 2/3.1 sheet
 * went from 25 sections to 23 and the class 6/8 sheet from 10 to 9 after the
 * extractor was fixed; re-running the seed under the same revision merged old
 * and new rows and 98 items became 116. The fix keys every revision by a
 * content hash. This test applies the seed as it was before the fix, records
 * a finding against one of its items, applies the current seed, and checks:
 *
 *   - the current revisions hold exactly 98 items
 *   - the old revisions are marked superseded and keep their rows
 *   - the old finding still resolves to its (now superseded) item
 *   - re-running the current seed is a no-op
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

// The seed as it stood before content-hash revisioning (first pushed commit
// of the checksheets package). If git is unavailable the test is skipped.
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
const n = async (sql, p = []) => (await db.query(sql, p)).rows[0].n;

await check('apply the pre-fix seed, then instance migrations', async () => {
  await db.exec(seedOld);
  for (const f of ['002_instance_layer.sql', '003_guards_and_events.sql', '004_sync.sql', '005_inspection_signatures.sql'])
    await db.exec(readFileSync(join(mig, f), 'utf8'));
  // The old seed had no meta column; the current seed adds it. Old rows have
  // no contentHash, which is what marks them as a different revision.
  const items = await n(`SELECT count(*)::int n FROM checksheet_item`);
  return `${items} items under the old revisions`;
});

let oldItemId;
await check('record a finding against an old-revision item', async () => {
  await db.exec(`
    INSERT INTO app_user (id, full_name, occupation) VALUES (1,'Bryan Wilson','Compliance certifier');
    INSERT INTO client (id, legal_name) VALUES (1,'Argenta');
    INSERT INTO site (id, client_id, address) VALUES (1,1,'2 Sterling Avenue');
    INSERT INTO hs_location (id, site_id, name) VALUES (1,1,'G2 Chiller');
    INSERT INTO job (id, client_id, hs_location_id) VALUES (1,1,1);
    INSERT INTO inspection (id, job_id, hs_location_id, certifier_id, inspected_at, equipment_used)
      VALUES (1,1,1,1,now(),'iPad');`);
  const r = await db.query(`
    SELECT i.id FROM checksheet_item i
    JOIN checksheet_section s ON s.id = i.section_id
    JOIN checksheet_template t ON t.id = s.template_id
    WHERE t.code = 'wks17-general' AND s.ordinal = 4 AND i.ordinal = 4`);
  oldItemId = r.rows[0].id;
  await db.query(`INSERT INTO finding (inspection_id, item_id, status, comment) VALUES (1,$1,'compliant','ok')`, [oldItemId]);
  return `finding on item ${oldItemId}`;
});

await check('apply the current seed: new revisions, old ones superseded, no merge', async () => {
  await db.exec(seedNow);
  const current = await n(`
    SELECT count(i.id)::int n FROM checksheet_item i
    JOIN checksheet_section s ON s.id = i.section_id
    JOIN checksheet_template t ON t.id = s.template_id WHERE t.status = 'current'`);
  // 98 location items plus the three form sheets (40 + 6 + 6).
  if (current !== 149) throw new Error(`current items ${current}, expected 149`);
  const revs = await db.query(`SELECT code, revision, status FROM checksheet_template ORDER BY code, revision`);
  const superseded = revs.rows.filter((r) => r.status === 'superseded').length;
  const cur = revs.rows.filter((r) => r.status === 'current').length;
  // Three location sheets re-seeded as rev 2, plus the three form sheets.
  if (cur !== 6) throw new Error(`current revisions ${cur}, expected 6`);
  if (superseded !== 3) throw new Error(`superseded revisions ${superseded}, expected 3`);
  return revs.rows.map((r) => `${r.code}@${r.revision}:${r.status}`).join('  ');
});

await check('the old finding still resolves to its superseded item', async () => {
  const r = await db.query(`
    SELECT t.code, t.status, s.ordinal AS sec, i.ordinal AS item
    FROM finding f JOIN checksheet_item i ON i.id = f.item_id
    JOIN checksheet_section s ON s.id = i.section_id
    JOIN checksheet_template t ON t.id = s.template_id
    WHERE f.item_id = $1`, [oldItemId]);
  const x = r.rows[0];
  if (!x || x.status !== 'superseded' || x.sec !== 4 || x.item !== 4) throw new Error(JSON.stringify(x));
  return `${x.code} (${x.status}) s${x.sec}/i${x.item}`;
});

await check('re-running the current seed is a no-op', async () => {
  const before = await n(`SELECT count(*)::int n FROM checksheet_template`);
  const itemsBefore = await n(`SELECT count(*)::int n FROM checksheet_item`);
  await db.exec(seedNow);
  const after = await n(`SELECT count(*)::int n FROM checksheet_template`);
  const itemsAfter = await n(`SELECT count(*)::int n FROM checksheet_item`);
  if (before !== after || itemsBefore !== itemsAfter) throw new Error(`templates ${before}→${after}, items ${itemsBefore}→${itemsAfter}`);
  return `${after} template rows, ${itemsAfter} item rows, unchanged`;
});

console.log(`\n${'─'.repeat(60)}`);
if (fail.length) { console.log(`FAILED — ${pass} passed, ${fail.length} failed`); process.exit(1); }
console.log(`OK — ${pass} checks: a changed template becomes a new revision, never a merge.`);
