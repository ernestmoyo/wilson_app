/**
 * The clean landing (16 October 2026): the board lists clients, a certifier
 * archives a client that is not real work, archived clients leave the board
 * and every reminder but keep their records, and New job reuses an existing
 * client instead of making a duplicate. Test data only, on PGlite.
 */
import request from 'supertest';
import { randomUUID } from 'crypto';

import { connect, migrate } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';
import { hashPasscode } from '../src/auth.mjs';

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const db = await connect({ url: null });
await migrate(db);
await db.query(`INSERT INTO app_user (id, full_name, occupation, email, role, authorisation_number, passcode_hash)
                VALUES (1,'Bryan Wilson','Compliance certifier','compliancecertifier@assuresafety.co.nz','certifier','TST100250',$1)
                ON CONFLICT (id) DO UPDATE SET passcode_hash = EXCLUDED.passcode_hash, email = EXCLUDED.email`, [hashPasscode('cert-pass')]);
await db.query(`INSERT INTO app_user (full_name, occupation, email, role, passcode_hash)
                VALUES ('Clients Test Reviewer','Field assessor','clients.reviewer@example.com','reviewer',$1)`, [hashPasscode('review-pass')]);
const app = buildApp(db, { requireAuth: true });
const api = request(app);
const loginAs = async (email, passcode) => {
  const r = await api.post('/api/auth/login').send({ email, passcode, deviceId: 'clients-test' });
  return r.status === 200 ? { authorization: `Bearer ${r.body.token}` } : null;
};
const bryan = await loginAs('compliancecertifier@assuresafety.co.nz', 'cert-pass');
const reviewer = await loginAs('clients.reviewer@example.com', 'review-pass');

const newJob = (legalName, location, extra = {}) => api.post('/api/jobs').set(bryan).send({
  client: { legalName, ...(extra.client ?? {}) }, site: { address: `${location} Road` }, location: { name: location }, classKey: 'class_6_8',
});
const archive = (who, clientId, archived = true) => api.post('/api/sync').set(who).send({
  deviceId: 'clients-test',
  events: [{ id: randomUUID(), type: 'client.archive', payload: { clientId, archived }, occurredAt: new Date().toISOString() }],
});
const clientCount = async () => (await db.query(`SELECT count(*)::int AS n FROM client`)).rows[0].n;

// Own subjects, named so they cannot collide with anything else in the file.
const real = (await newJob('Clients Test Real Limited', 'Real store')).body;
const demo = (await newJob('Clients Test Demo Limited', 'Demo store')).body;
// Both enquiries opened three days ago, so the triage reminder fires for each.
await db.query(`UPDATE job SET opened_at = now() - interval '3 days' WHERE id = ANY($1)`, [[real.jobId, demo.jobId]]);

await step('every board row carries its client id, so two clients with one name stay two', async () => {
  const r = await api.get('/api/jobs').set(bryan);
  const row = r.body.find((j) => j.id === real.jobId);
  expect(row && row.client_id === real.clientId, `client_id on the row: ${JSON.stringify(row)}`);
});

await step('a reviewer cannot archive a client', async () => {
  const r = await archive(reviewer, demo.clientId);
  expect(r.status === 200 && r.body.rejected?.length === 1, `reviewer: ${r.status} ${r.text}`);
  expect(/certifier/.test(r.body.rejected[0].reason), r.body.rejected[0].reason);
  const still = await api.get('/api/jobs').set(bryan);
  expect(still.body.some((j) => j.id === demo.jobId), 'the client was archived by a reviewer');
});

await step('the certifier archives a client: it leaves the board and every reminder', async () => {
  const before = await api.get('/api/dashboard').set(bryan);
  expect(before.body.reminders.some((x) => x.jobId === demo.jobId), 'precondition: the demo enquiry is a reminder');
  const r = await archive(bryan, demo.clientId);
  expect(r.status === 200 && r.body.applied?.length === 1, `${r.status} ${r.text}`);
  const jobs = await api.get('/api/jobs').set(bryan);
  expect(!jobs.body.some((j) => j.id === demo.jobId), 'archived client still on the board');
  expect(jobs.body.some((j) => j.id === real.jobId), 'the real client went too');
  const dash = await api.get('/api/dashboard').set(bryan);
  expect(!dash.body.reminders.some((x) => x.jobId === demo.jobId), 'archived client still in reminders');
  expect(dash.body.reminders.some((x) => x.jobId === real.jobId), 'the real reminder went too');
  const row = await db.query(`SELECT archived_at, archived_by FROM client WHERE id = $1`, [demo.clientId]);
  expect(row.rows[0].archived_at && row.rows[0].archived_by === 1, `who and when: ${JSON.stringify(row.rows[0])}`);
});

await step('archive hides, it does not remove: the job, its report and ?archived=1 still reach it', async () => {
  const one = await api.get(`/api/jobs/${demo.jobId}`).set(bryan);
  expect(one.status === 200, `job by id: ${one.status}`);
  const nc = await api.get(`/api/jobs/${demo.jobId}/non-compliance.html`).set(bryan);
  expect(nc.status === 200, `report: ${nc.status}`);
  const arch = await api.get('/api/jobs?archived=1').set(bryan);
  const row = arch.body.find((j) => j.id === demo.jobId);
  expect(row && row.client_archived === true, `archived list: ${JSON.stringify(row)}`);
  expect(!arch.body.some((j) => j.id === real.jobId), 'the archived list holds only archived clients');
});

await step('the archive is in the event log, by person, and shows in recent activity', async () => {
  const dash = await api.get('/api/dashboard').set(bryan);
  const a = dash.body.activity.find((x) => x.type === 'client.archive');
  expect(a && a.user_name === 'Bryan Wilson', JSON.stringify(dash.body.activity.slice(0, 3)));
});

await step('unarchive brings the client back to the board', async () => {
  const r = await archive(bryan, demo.clientId, false);
  expect(r.body.applied?.length === 1, r.text);
  const jobs = await api.get('/api/jobs').set(bryan);
  expect(jobs.body.some((j) => j.id === demo.jobId), 'not back');
  await archive(bryan, demo.clientId, true); // leave it archived for the next steps
});

await step('an unknown client is a rejection, not a server error', async () => {
  const r = await archive(bryan, 99999999);
  expect(r.status === 200 && r.body.rejected?.length === 1, `${r.status} ${r.text}`);
});

await step('New job with client.id reuses the client: no new client row', async () => {
  const n0 = await clientCount();
  const r = await api.post('/api/jobs').set(bryan).send({
    client: { id: real.clientId, legalName: 'Clients Test Real Limited' },
    site: { address: '2 Second Site Road' }, location: { name: 'Second store' }, classKey: 'class_6_8',
  });
  expect(r.status === 201 && r.body.clientId === real.clientId, `${r.status} ${r.text}`);
  expect((await clientCount()) === n0, 'a client row was added');
  const jobs = await api.get('/api/jobs').set(bryan);
  const mine = jobs.body.filter((j) => j.client_id === real.clientId);
  expect(mine.length === 2, `two jobs under one client: ${mine.length}`);
});

await step('New job with an unknown or archived client.id is refused', async () => {
  const body = (id) => ({ client: { id, legalName: 'x' }, site: { address: 'a' }, location: { name: 'b' }, classKey: 'class_6_8' });
  const unknown = await api.post('/api/jobs').set(bryan).send(body(99999999));
  expect(unknown.status === 400, `unknown: ${unknown.status}`);
  const archived = await api.post('/api/jobs').set(bryan).send(body(demo.clientId));
  expect(archived.status === 400, `archived: ${archived.status}`);
});

await step('a viewer cannot archive either', async () => {
  await db.query(`INSERT INTO app_user (full_name, occupation, email, role, passcode_hash)
                  VALUES ('Clients Test Viewer','Viewer','clients.viewer@example.com','viewer',$1)`, [hashPasscode('viewer-pass')]);
  const viewer = await loginAs('clients.viewer@example.com', 'viewer-pass');
  const r = await archive(viewer, real.clientId);
  expect(r.body.rejected?.length === 1, r.text);
  const row = await db.query(`SELECT archived_at FROM client WHERE id = $1`, [real.clientId]);
  expect(row.rows[0].archived_at === null, 'a viewer archived a client');
});

await step('archiving twice keeps the first time and person', async () => {
  const before = (await db.query(`SELECT archived_at, archived_by FROM client WHERE id = $1`, [demo.clientId])).rows[0];
  await archive(bryan, demo.clientId);
  const after = (await db.query(`SELECT archived_at, archived_by FROM client WHERE id = $1`, [demo.clientId])).rows[0];
  expect(+after.archived_at === +before.archived_at && after.archived_by === before.archived_by, JSON.stringify({ before, after }));
});

await step('client.id that is not a plain id (true, "1 OR 1=1", 1.5) is refused, never coerced', async () => {
  for (const id of [true, [1], '1e0', '1.0', '0x1', ' 1 ', '1 OR 1=1', 1.5, -1, {}]) {
    const r = await api.post('/api/jobs').set(bryan).send({ client: { id, legalName: 'x' }, site: { address: 'a' }, location: { name: 'b' }, classKey: 'class_6_8' });
    expect(r.status === 400, `${JSON.stringify(id)}: ${r.status}`);
  }
});

await step('client.archive takes only a plain id and a true/false archived', async () => {
  for (const payload of [{ clientId: [1] }, { clientId: '0x1' }, { clientId: ' 1 ' }, { clientId: real.clientId, archived: 'false' }, { clientId: real.clientId, archived: 0 }, {}]) {
    const r = await api.post('/api/sync').set(bryan).send({ deviceId: 'clients-test',
      events: [{ id: randomUUID(), type: 'client.archive', payload, occurredAt: new Date().toISOString() }] });
    expect(r.status === 200 && r.body.rejected?.length === 1, `${JSON.stringify(payload)}: ${r.text}`);
  }
  const row = await db.query(`SELECT archived_at FROM client WHERE id = $1`, [real.clientId]);
  expect(row.rows[0].archived_at === null, 'a malformed event archived the real client');
});

await step('import makes its own client even if the body carries client.id', async () => {
  const n0 = await clientCount();
  const r = await api.post('/api/jobs/import').set(bryan).send({
    client: { id: real.clientId, legalName: 'Clients Test Imported Limited' },
    site: { address: '4 Import Road' }, location: { name: 'Imported store' }, classKey: 'class_6_8', stage: 'site_inspection',
  });
  expect(r.status < 300, `${r.status} ${r.text}`);
  expect((await clientCount()) === n0 + 1, 'import reused a client');
});

await step('a new name with no id still makes a new client (no uniqueness on names)', async () => {
  const n0 = await clientCount();
  const r = await newJob('Clients Test Real Limited', 'Third store');
  expect(r.status === 201 && r.body.clientId !== real.clientId, `${r.status} ${r.text}`);
  expect((await clientCount()) === n0 + 1, 'no client added');
});

await db.close();
console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
