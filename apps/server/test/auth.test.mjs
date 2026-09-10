#!/usr/bin/env node
/**
 * Sign-in: a passcode from the environment, a bearer token per device, and
 * the rule that the signed-in user outranks anything the body claims.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';

import { connect, migrate, seedDefaults } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';

let pass = 0;
const problems = [];
async function step(name, fn) {
  try { const msg = await fn(); pass++; console.log(`  ok    ${name}${msg ? `\n        ${msg}` : ''}`); }
  catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

process.env.ASSURE_PASSCODE = 'chiller-2026';
const db = await connect({ url: null });
await migrate(db);
await seedDefaults(db);
const app = buildApp(db, { requireAuth: true });
const api = request(app);
const EMAIL = 'compliancecertifier@assuresafety.co.nz';
let token;

await step('without a token every job route is 401; health and templates stay open', async () => {
  expect((await api.get('/api/jobs')).status === 401, 'jobs should need sign-in');
  expect((await api.get('/api/jobs').set('x-user-id', '1')).status === 401, 'a header is not a sign-in');
  expect((await api.get('/api/health')).status === 200, 'health should be open');
  expect((await api.get('/api/templates')).status === 200, 'templates should be open');
});

await step('a wrong passcode or unknown email is refused the same way', async () => {
  const a = await api.post('/api/auth/login').send({ email: EMAIL, passcode: 'nope', deviceId: 'ipad-1' });
  const b = await api.post('/api/auth/login').send({ email: 'nobody@example.com', passcode: 'chiller-2026' });
  expect(a.status === 401 && b.status === 401, `${a.status} ${b.status}`);
  expect(a.body.error === b.body.error, 'the two refusals should not differ');
});

await step('the passcode from ASSURE_PASSCODE signs Bryan in and returns a token', async () => {
  const r = await api.post('/api/auth/login').send({ email: EMAIL, passcode: 'chiller-2026', deviceId: 'ipad-1' });
  expect(r.status === 200, `${r.status} ${r.text}`);
  token = r.body.token;
  expect(typeof token === 'string' && token.length === 64, 'token shape');
  expect(r.body.user.id === 1 && r.body.user.authorisationNumber === 'TST100250', JSON.stringify(r.body.user));
  const me = await api.get('/api/auth/me').set('authorization', `Bearer ${token}`);
  expect(me.status === 200 && me.body.fullName === 'Bryan Wilson' && me.body.authenticated === true, me.text);
  return `token for ${r.body.user.fullName}, expires ${r.body.expiresAt.slice(0, 10)}`;
});

await step('rotating ASSURE_PASSCODE at boot changes the passcode; the old one stops working', async () => {
  process.env.ASSURE_PASSCODE = 'chiller-2027';
  await seedDefaults(db);
  const old = await api.post('/api/auth/login').send({ email: EMAIL, passcode: 'chiller-2026' });
  const fresh = await api.post('/api/auth/login').send({ email: EMAIL, passcode: 'chiller-2027' });
  expect(old.status === 401 && fresh.status === 200, `${old.status} ${fresh.status}`);
});

let jobId, hsLocationId, inspectionId;
await step('with the token the job routes work, and the signed-in user outranks the body', async () => {
  const H = { authorization: `Bearer ${token}`, 'x-device-id': 'ipad-1' };
  const r = await api.post('/api/jobs').set(H).send({
    client: { legalName: 'Argenta Manufacturing Limited' }, site: { address: '2 Sterling Avenue' },
    location: { name: 'G2 Chiller' }, classKey: 'class_6_8',
  });
  expect(r.status === 201, `${r.status} ${r.text}`);
  jobId = r.body.jobId; hsLocationId = r.body.hsLocationId;
  const ev = (type, payload) => ({ id: randomUUID(), type, payload, occurredAt: new Date().toISOString() });
  const s = await api.post('/api/sync').set(H).send({
    deviceId: 'ipad-1', userId: 999, // a lie the body tells
    events: [
      ev('job.transition', { jobId, toStage: 'application' }),
      ev('job.transition', { jobId, toStage: 'document_review' }),
      ev('job.transition', { jobId, toStage: 'site_inspection' }),
      ev('inspection.open', { jobId, hsLocationId, equipmentUsed: 'iPad', templateCodes: ['wks17-general'] }),
    ],
  });
  expect(s.status === 200 && s.body.rejected.length === 0, `${s.status} ${JSON.stringify(s.body.rejected)}`);
  inspectionId = s.body.applied[3].result.inspectionId;
  const sign = await api.post('/api/sync').set(H).send({
    deviceId: 'ipad-1', userId: 999,
    events: [ev('inspection.sign', { inspectionId, which: 'declaration' })],
  });
  expect(sign.body.applied[0].result.signedBy === 1, `signed by ${JSON.stringify(sign.body.applied[0])}`);
  const j = await api.get(`/api/jobs/${jobId}`).set(H);
  expect(j.body.transitions.every((t) => t.actor_id === 1), 'actor should be the signed-in user');
});

await step('the certificate page accepts ?token= because a browser tab carries no header', async () => {
  const noTok = await api.get(`/api/jobs/${jobId}/certificate.html`);
  const withTok = await api.get(`/api/jobs/${jobId}/certificate.html?token=${token}`);
  expect(noTok.status === 401, `no token → ${noTok.status}`);
  expect(withTok.status === 404 && withTok.body.error.includes('no certificate'), `with token → ${withTok.status} ${withTok.text}`);
});

await step('logout revokes the token', async () => {
  const out = await api.post('/api/auth/logout').set('authorization', `Bearer ${token}`);
  expect(out.status === 200, `${out.status}`);
  const after = await api.get('/api/jobs').set('authorization', `Bearer ${token}`);
  expect(after.status === 401, `revoked token still works: ${after.status}`);
});

await step('a token stored only as its hash: the table holds no usable secret', async () => {
  const r = await db.query(`SELECT token_hash FROM auth_token`);
  expect(r.rows.length >= 1 && r.rows.every((x) => x.token_hash !== token && x.token_hash.length === 64), 'plaintext token in table');
});

console.log(`\n${pass} passed, ${problems.length} failed`);
if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
