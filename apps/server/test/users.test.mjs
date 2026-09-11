/**
 * People and roles: a certifier adds a person with a role and a passcode,
 * the person signs in and is held to that role by the server, a reviewer
 * cannot manage people, a passcode reset signs the person out, and a
 * deactivated person cannot sign in. Test data only.
 */
import request from 'supertest';

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
const app = buildApp(db, { requireAuth: true });
const api = request(app);
const loginAs = async (email, passcode) => {
  const r = await api.post('/api/auth/login').send({ email, passcode, deviceId: 'test' });
  return r.status === 200 ? { authorization: `Bearer ${r.body.token}`, user: r.body.user } : null;
};

const bryan = await loginAs('compliancecertifier@assuresafety.co.nz', 'cert-pass');
let tendai;

await step('the certifier lists the people, each with a role', async () => {
  const r = await api.get('/api/users').set(bryan);
  expect(r.status === 200 && r.body.some((u) => u.role === 'certifier'), `${r.status} ${JSON.stringify(r.body)}`);
  return `${r.body.length} people`;
});

await step('a person is added with name, occupation, email, role and passcode', async () => {
  const bad = await api.post('/api/users').set(bryan).send({ fullName: 'Nobody', email: 'x@y', role: 'reviewer', passcode: 'abcdef' });
  expect(bad.status === 400, `occupation required: ${bad.status}`);
  const short = await api.post('/api/users').set(bryan).send({ fullName: 'Nobody', occupation: 'Tester', email: 'x@y', role: 'reviewer', passcode: 'abc' });
  expect(short.status === 400, `short passcode: ${short.status}`);
  const r = await api.post('/api/users').set(bryan).send({ fullName: 'Test Reviewer', occupation: 'Field assessor', email: 'Reviewer.Test@example.com', role: 'reviewer', passcode: 'review-pass' });
  expect(r.status === 201 && r.body.email === 'reviewer.test@example.com' && r.body.role === 'reviewer' && r.body.hasPasscode, `${r.status} ${r.text}`);
  tendai = r.body;
  const dup = await api.post('/api/users').set(bryan).send({ fullName: 'Again', occupation: 'Tester', email: 'reviewer.test@example.com', role: 'viewer', passcode: 'abcdef' });
  expect(dup.status === 409, `duplicate email: ${dup.status}`);
  return `id ${tendai.id}`;
});

let reviewer;
await step('the new person signs in and the server holds them to their role', async () => {
  reviewer = await loginAs('reviewer.test@example.com', 'review-pass');
  expect(reviewer, 'sign-in failed');
  expect(reviewer.user.fullName === 'Test Reviewer' && reviewer.user.role === 'reviewer', JSON.stringify(reviewer.user));
  const people = await api.get('/api/users').set(reviewer);
  expect(people.status === 403, `a reviewer must not manage people: ${people.status}`);
  const add = await api.post('/api/users').set(reviewer).send({ fullName: 'X', occupation: 'Y', email: 'z@z.z', role: 'admin', passcode: 'abcdef' });
  expect(add.status === 403, `a reviewer must not add people: ${add.status}`);
});

await step('a change of role and occupation lands; a certifier cannot deactivate themselves', async () => {
  const r = await api.patch(`/api/users/${tendai.id}`).set(bryan).send({ occupation: 'Senior field assessor', role: 'viewer' });
  expect(r.status === 200 && r.body.occupation === 'Senior field assessor' && r.body.role === 'viewer', `${r.status} ${r.text}`);
  const self = await api.patch('/api/users/1').set(bryan).send({ active: false });
  expect(self.status === 400, `self-deactivation: ${self.status}`);
  const back = await api.patch(`/api/users/${tendai.id}`).set(bryan).send({ role: 'reviewer' });
  expect(back.status === 200 && back.body.role === 'reviewer', 'role back');
});

await step('a passcode reset signs the person out everywhere; the new passcode works', async () => {
  const r = await api.post(`/api/users/${tendai.id}/passcode`).set(bryan).send({ passcode: 'new-pass-1' });
  expect(r.status === 200, `${r.status} ${r.text}`);
  const old = await api.get('/api/jobs').set(reviewer);
  expect(old.status === 401, `old token must be revoked: ${old.status}`);
  const again = await loginAs('reviewer.test@example.com', 'new-pass-1');
  expect(again, 'new passcode sign-in failed');
  reviewer = again;
});

await step('a deactivated person cannot sign in or keep using a token', async () => {
  const r = await api.patch(`/api/users/${tendai.id}`).set(bryan).send({ active: false });
  expect(r.status === 200 && r.body.active === false, `${r.status}`);
  const gone = await api.get('/api/jobs').set(reviewer);
  expect(gone.status === 401, `token after deactivation: ${gone.status}`);
  const no = await loginAs('reviewer.test@example.com', 'new-pass-1');
  expect(!no, 'a deactivated person signed in');
  const list = await api.get('/api/users').set(bryan);
  expect(list.body.find((u) => u.id === tendai.id)?.active === false, 'listed as inactive');
});

await db.close();
console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
