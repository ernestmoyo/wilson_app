#!/usr/bin/env node
/**
 * Copy the monorepo assets the server needs at runtime into ./vendor.
 *
 * On Vercel the function bundle can only see files under the project root
 * (apps/server). The migrations, the generated template seed, the certificate
 * renderer and the demo signature all live in packages/. This runs as the
 * Vercel build command with the full repo checked out, so ../../packages is
 * reachable; db.mjs and the routes prefer ./vendor when it exists and fall
 * back to the monorepo paths locally.
 */

import { cpSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, '..');
const repo = join(server, '..', '..');
const vendor = join(server, 'vendor');

if (existsSync(vendor)) rmSync(vendor, { recursive: true, force: true });
mkdirSync(join(vendor, 'lib'), { recursive: true });

const copies = [
  ['packages/db/migrations', 'migrations'],
  ['packages/checksheets/generated/seed-templates.sql', 'seed-templates.sql'],
  ['packages/checksheets/lib/render-certificate.mjs', 'lib/render-certificate.mjs'],
  ['packages/checksheets/data/certificates/g2-chiller/signature.png', 'signature.png'],
];

for (const [from, to] of copies) {
  const src = join(repo, from);
  if (!existsSync(src)) {
    console.error(`vendor: missing ${from}`);
    process.exit(1);
  }
  cpSync(src, join(vendor, to), { recursive: true });
  console.log(`vendor: ${from} → vendor/${to}`);
}
