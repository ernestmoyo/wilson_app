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
mkdirSync(join(vendor, 'data'), { recursive: true });

// [source, destination, required]
const copies = [
  ['packages/db/migrations', 'migrations', true],
  ['packages/checksheets/generated/seed-templates.sql', 'seed-templates.sql', true],
  ['packages/checksheets/lib/render-certificate.mjs', 'lib/render-certificate.mjs', true],
  // The certifier's signature is deliberately kept out of git and out of the
  // deploy upload (.gitignore / .vercelignore). When absent the certificate
  // renders without it and the signature comes from the user record later.
  ['packages/checksheets/data/certificates/g2-chiller/signature.png', 'signature.png', false],
  // Assure Safety letterhead for the rendered certificate.
  ['packages/checksheets/brand', 'brand', false],
  // Loops 1 to 4: the non-compliance report and the two catalogues.
  ['packages/checksheets/lib/render-report.mjs', 'lib/render-report.mjs', true],
  ['packages/checksheets/lib/render-form-certificate.mjs', 'lib/render-form-certificate.mjs', true],
  ['packages/checksheets/data/sheet-sets.json', 'data/sheet-sets.json', true],
  ['packages/checksheets/data/authorisation.json', 'data/authorisation.json', true],
];

for (const [from, to, required] of copies) {
  const src = join(repo, from);
  if (!existsSync(src)) {
    if (required) {
      console.error(`vendor: missing required ${from}`);
      process.exit(1);
    }
    console.log(`vendor: (optional) ${from} not present — skipped`);
    continue;
  }
  cpSync(src, join(vendor, to), { recursive: true });
  console.log(`vendor: ${from} → vendor/${to}`);
}
