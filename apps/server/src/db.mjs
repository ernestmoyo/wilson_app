/**
 * Database connection.
 *
 * DATABASE_URL set   → real Postgres via `pg` (Neon on Vercel, DigitalOcean later)
 * DATABASE_URL unset → PGlite, in-process (tests, local dev)
 *
 * Both expose query(sql, params) → { rows }, so every route and every sync
 * handler is written once and runs unchanged against either. The migrations
 * are the same files packages/db ships; nothing here is test-only.
 *
 * Asset paths: on Vercel only apps/server is bundled, so scripts/vendor.mjs
 * copies what we need into ./vendor at build time. Locally the monorepo paths
 * are used directly. `assetPath()` picks whichever exists.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensurePasscodesFromEnv } from './auth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..');
const repoRoot = join(serverRoot, '..', '..');
const vendorDir = join(serverRoot, 'vendor');

/**
 * Resolve an asset from the monorepo when it is present (local dev, tests),
 * falling back to ./vendor (the Vercel bundle, where packages/ does not exist).
 * The monorepo wins so a stale vendor/ from an earlier build can never shadow
 * a fresh migration or template — which is exactly what happened once.
 */
export function assetPath(vendorRel, repoRel) {
  const r = join(repoRoot, repoRel);
  if (existsSync(r)) return r;
  return join(vendorDir, vendorRel);
}

const migrationsDir = () => assetPath('migrations', 'packages/db/migrations');
const templateSeed = () =>
  assetPath('seed-templates.sql', 'packages/checksheets/generated/seed-templates.sql');

// DATABASE_URL is ours; POSTGRES_URL is what the Neon Marketplace integration
// injects. Accept either so a fresh provision works without a config edit.
export async function connect({
  url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
} = {}) {
  if (url) {
    const { default: pg } = await import('pg');
    // node-postgres returns int8 (bigserial ids, bigint counts) as strings to
    // avoid precision loss. Our ids never approach 2^53, and PGlite returns
    // numbers, so parse them: the API must look the same on both backends.
    // (Found by the live test against Neon — every `(id as num)` in the app
    // threw on strings.)
    pg.types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));
    // DATE (1082) as the 'yyyy-mm-dd' text it is: a JS Date at local midnight
    // would print the previous day on a server west of UTC.
    pg.types.setTypeParser(1082, (v) => v);
    const pool = new pg.Pool({
      connectionString: url,
      max: 4,
      // Neon and DigitalOcean both require TLS; PGlite/local never see this branch.
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    return {
      kind: 'pg',
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      async withTx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn({ query: (s, p) => client.query(s, p) });
          await client.query('COMMIT');
          return out;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite();
  return {
    kind: 'pglite',
    query: (sql, params) => lite.query(sql, params),
    exec: (sql) => lite.exec(sql),
    withTx: (fn) => lite.transaction((tx) => fn({ query: (s, p) => tx.query(s, p) })),
    close: () => lite.close(),
  };
}

/**
 * Apply the template seed and every migration, in order.
 *
 * The template seed is idempotent (ON CONFLICT … DO UPDATE SET meta) and its
 * DDL is ADD COLUMN IF NOT EXISTS, so it runs on EVERY boot: a regenerated
 * template or a new sheet-level field reaches an existing database without a
 * hand migration. Instance migrations are numbered and tracked in
 * schema_migration so each applies exactly once.
 */
export async function migrate(db) {
  await db.exec(readFileSync(templateSeed(), 'utf8'));

  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

  // Databases created before schema_migration existed already hold 002–004.
  const legacy = await db.query(`SELECT to_regclass('public.sync_event') AS t`);
  if (legacy.rows[0]?.t) {
    await db.query(
      `INSERT INTO schema_migration (name) VALUES
         ('002_instance_layer.sql'), ('003_guards_and_events.sql'), ('004_sync.sql')
       ON CONFLICT DO NOTHING`
    );
  }

  const done = new Set((await db.query(`SELECT name FROM schema_migration`)).rows.map((r) => r.name));
  const applied = [];
  for (const f of readdirSync(migrationsDir()).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    await db.exec(readFileSync(join(migrationsDir(), f), 'utf8'));
    await db.query(`INSERT INTO schema_migration (name) VALUES ($1) ON CONFLICT DO NOTHING`, [f]);
    applied.push(f);
  }
  return { skipped: applied.length === 0, applied };
}

/**
 * The certifier the app identifies as (x-user-id: 1) until real auth lands.
 * Idempotent; safe on every boot.
 */
export async function seedDefaults(db) {
  await db.query(
    `INSERT INTO app_user (id, full_name, occupation, email, role, authorisation_number)
     VALUES (1, 'Bryan Wilson', 'Compliance certifier',
             'compliancecertifier@assuresafety.co.nz', 'certifier', 'TST100250')
     ON CONFLICT (id) DO NOTHING`
  );
  await db.query(`SELECT setval('app_user_id_seq', GREATEST((SELECT max(id) FROM app_user), 1))`);
  await ensurePasscodesFromEnv(db);
}
