/**
 * Vercel serverless entrypoint. Every /api/* request is rewritten here
 * (see vercel.json) and handed to the same Express app the tests exercise.
 *
 * The connection and migrations are created once per warm instance. With
 * DATABASE_URL set (Neon via the Marketplace) the schema persists; without it
 * PGlite runs in-process and the data lives only as long as the instance —
 * fine for a smoke test, wrong for a demo, so index.mjs logs which it is.
 */

import { connect, migrate, seedDefaults } from '../src/db.mjs';
import { buildApp } from '../src/app.mjs';

let ready;

async function boot() {
  const db = await connect();
  const m = await migrate(db);
  await seedDefaults(db);
  console.log(`[boot] db=${db.kind} ${m.skipped ? 'schema present' : 'migrated'}`);
  return buildApp(db, { allowedOrigin: process.env.ALLOWED_ORIGIN });
}

export default async function handler(req, res) {
  ready ??= boot();
  const app = await ready;
  return app(req, res);
}
