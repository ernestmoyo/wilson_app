#!/usr/bin/env node
/**
 * Adopt an extracted class template into data/, as a revision.
 *
 *   node tools/adopt.mjs <extracted>.template.json [--code <code>] [--note "<what changed>"]
 *
 * Extract to a scratch folder first (npm run extract -- <workbook> --out <tmp>),
 * read the corrections it logged, then adopt the sheet you mean to publish.
 * An unchanged template is left exactly as it is; a changed one becomes
 * revision n+1 recording what it supersedes (tools/revision.mjs). Never edit
 * a published template in data/ by hand.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { withRevision } from './revision.mjs';

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
if (!file) {
  console.error('usage: adopt.mjs <extracted>.template.json [--code <code>] [--note "<what changed>"]');
  process.exit(1);
}

const next = JSON.parse(readFileSync(file, 'utf8'));
if (flag('code')) next.code = flag('code');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', `${next.code}.template.json`);
const written = withRevision(out, next, { note: flag('note') });
writeFileSync(out, JSON.stringify(written, null, 2) + '\n');
const items = written.sections.reduce((n, s) => n + s.items.length, 0);
console.log(`  ${written.code} revision ${written.revision}${written.source?.supersedes ? ` (supersedes ${written.source.supersedes.revision})` : ''}: ${written.sections.length} sections, ${items} items`);
