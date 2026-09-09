#!/usr/bin/env node
/**
 * Findings resolve inside the revision the inspection was opened against.
 *
 * The G2 job was opened on template rev 1. When rev 2 was seeded, the server
 * resolved new findings against the current revision, so one inspection held
 * two findings for the same item. This test opens an inspection on the old
 * seed, lets the current seed land through migrate(), records a finding
 * through /api/sync, and checks it lands on the pinned (now superseded) item.
 */

import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';

import { connect, migrate } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const mig = join(repo, 'packages', 'db', 'migrations');

let seedOld;
try {
  seedOld = execSync('git show 8466802:packages/checksheets/generated/seed-templates.sql', {
    cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch {
  console.log('skip: could not read the pre-fix seed from git');
  process.exit(0);
}

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const db = await connect({ url: null });
const app = buildApp(db);
const api = request(app);
const H = { 'x-device-id': 'ipad-test', 'x-user-id': '1' };
const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
const sync = (events) => api.post('/api/sync').set(H).send({ deviceId: 'ipad-test', userId: 1, events });

let jobId, inspectionId;

await step('old seed + migrations 002–005, tracked so migrate() will not replay them', async () => {
  await db.exec(seedOld);
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const f of ['002_instance_layer.sql', '003_guards_and_events.sql', '004_sync.sql', '005_inspection_signatures.sql']) {
    await db.exec(readFileSync(join(mig, f), 'utf8'));
    await db.query(`INSERT INTO schema_migration (name) VALUES ($1)`, [f]);
  }
  await db.query(`INSERT INTO app_user (id, full_name, occupation) VALUES (1,'Bryan Wilson','Compliance certifier')`);
});

await step('open the job and an inspection pinned to rev 1', async () => {
  const r = await api.post('/api/jobs').set(H).send({
    client: { legalName: 'Argenta Manufacturing Limited' },
    site: { address: '2 Sterling Avenue' },
    location: { name: 'G2 Chiller' },
    classKey: 'class_6_8',
  });
  expect(r.status === 201 || r.status === 200, `job create ${r.status}: ${r.text}`);
  jobId = r.body.jobId;
  const hsLocationId = r.body.hsLocationId;
  const s = await sync([ev('inspection.open', {
    jobId, hsLocationId, equipmentUsed: 'iPad',
    templateCodes: ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'],
  })]);
  expect(s.status === 200, `sync ${s.status}: ${s.text}`);
  inspectionId = s.body.applied[0].result.inspectionId;
  const pin = await db.query(`SELECT t.revision FROM inspection_template p JOIN checksheet_template t ON t.id = p.template_id
                              WHERE p.inspection_id = $1 AND t.code = 'wks17-general'`, [inspectionId]);
  expect(pin.rows.length === 1 && pin.rows[0].revision === 1, `pinned to ${JSON.stringify(pin.rows)}`);
  return `job ${jobId}, inspection ${inspectionId} pinned to rev 1`;
});

await step('rev 2 lands through migrate()', async () => {
  const m = await migrate(db);
  const cur = await db.query(`SELECT revision FROM checksheet_template WHERE code='wks17-general' AND status='current'`);
  expect(cur.rows[0].revision === 2, `current is rev ${cur.rows[0].revision}`);
  return `applied ${m.applied.join(', ') || 'nothing new'}`;
});

await step('a finding recorded now lands on the pinned rev-1 item', async () => {
  const s = await sync([ev('finding.upsert', {
    inspectionId, templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 4,
    status: 'non_compliant', failureReason: 'reg 2.6(3): no signage',
  })]);
  expect(s.status === 200 && s.body.applied.length === 1, `sync ${s.status}: ${s.text}`);
  const r = await db.query(`SELECT t.revision, t.status FROM finding f
                            JOIN checksheet_item i ON i.id = f.item_id
                            JOIN checksheet_section sec ON sec.id = i.section_id
                            JOIN checksheet_template t ON t.id = sec.template_id
                            WHERE f.inspection_id = $1`, [inspectionId]);
  expect(r.rows.length === 1, `expected one finding, got ${r.rows.length}`);
  expect(r.rows[0].revision === 1 && r.rows[0].status === 'superseded', `landed on ${JSON.stringify(r.rows[0])}`);
});

await step('a second write to the same item updates, never duplicates', async () => {
  const s = await sync([ev('finding.upsert', {
    inspectionId, templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 4,
    status: 'non_compliant', failureReason: 'reg 2.6(3): still no signage',
  })]);
  expect(s.status === 200, `sync ${s.status}`);
  const job = await api.get(`/api/jobs/${jobId}`).set(H);
  const f = job.body.findings.filter((x) => x.template_code === 'wks17-general' && x.section_ordinal === 4 && x.item_ordinal === 4);
  expect(f.length === 1, `job shows ${f.length} findings for s4/i4`);
  expect(f[0].failure_reason.endsWith('still no signage'), f[0].failure_reason);
  expect(job.body.findingCounts.non_compliant === 1, `counts ${JSON.stringify(job.body.findingCounts)}`);
});

console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
