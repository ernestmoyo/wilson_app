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

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..');
const repoRoot = join(serverRoot, '..', '..');
const vendorDir = join(serverRoot, 'vendor');

/** Resolve an asset from ./vendor (deployed) or the monorepo (local). */
export function assetPath(vendorRel, repoRel) {
  const v = join(vendorDir, vendorRel);
  if (existsSync(v)) return v;
  return join(repoRoot, repoRel);
}

const migrationsDir = () => assetPath('migrations', 'packages/db/migrations');
const templateSeed = () =>
  assetPath('seed-templates.sql', 'packages/checksheets/generated/seed-templates.sql');

export async function connect({ url = process.env.DATABASE_URL } = {}) {
  if (url) {
    const { default: pg } = await import('pg');
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

/** Apply the template seed and every migration, in order, once. */
export async function migrate(db) {
  const r = await db
    .query(`SELECT to_regclass('public.sync_event') AS t`)
    .catch(() => ({ rows: [{ t: null }] }));
  if (r.rows[0]?.t) return { skipped: true };

  await db.exec(readFileSync(templateSeed(), 'utf8'));
  for (const f of readdirSync(migrationsDir()).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir(), f), 'utf8'));
  }
  return { skipped: false };
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
}
