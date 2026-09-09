#!/usr/bin/env node
/**
 * Verify the generated artifacts round-trip back to the canonical JSON.
 *
 * Codegen is only trustworthy if the output can be read back and compared to
 * its source. The Performance Standard text is full of apostrophes ("worker's"),
 * em dashes, curly quotes and parenthesised sub-clauses, all of which are easy
 * to mis-escape into something that either fails to compile or — far worse —
 * compiles into subtly wrong regulatory text that gets shown to an inspector.
 *
 * Usage:  node tools/verify-generated.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(pkgRoot, 'data');
const genDir = join(pkgRoot, 'generated');

const templates = readdirSync(dataDir)
  .filter((f) => f.endsWith('.template.json') && f !== 'wks17-locations-general.template.json')
  .map((f) => JSON.parse(readFileSync(join(dataDir, f), 'utf8')));

const allItems = templates.flatMap((t) =>
  t.sections.flatMap((s) => s.items.map((i) => ({ tpl: t.code, sec: s.ordinal, ...i })))
);

const dart = readFileSync(join(genDir, 'checksheets.g.dart'), 'utf8');
const ts = readFileSync(join(genDir, 'checksheets.ts'), 'utf8');
const sql = readFileSync(join(genDir, 'seed-templates.sql'), 'utf8');

const dartEscape = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$');
const sqlEscape = (s) => s.replace(/'/g, "''");

let checked = 0;
const failures = [];

for (const it of allItems) {
  for (const [field, value] of [['action', it.action], ['records', it.records]]) {
    if (!value) continue;
    checked++;
    if (!dart.includes(dartEscape(value)))
      failures.push(`DART  ${it.tpl} s${it.sec} i${it.ordinal} ${field}: escaped text not found`);
    if (!sql.includes(sqlEscape(value)))
      failures.push(`SQL   ${it.tpl} s${it.sec} i${it.ordinal} ${field}: escaped text not found`);
    if (!ts.includes(JSON.stringify(value).slice(1, -1)))
      failures.push(`TS    ${it.tpl} s${it.sec} i${it.ordinal} ${field}: escaped text not found`);
  }
}

// Structural: counts must match across all three outputs.
const expectItems = allItems.length;
const dartItems = (dart.match(/ChecksheetItem\(/g) || []).length - 1; // minus the class declaration
const sqlItems = (sql.match(/INSERT INTO checksheet_item/g) || []).length;
const tsData = JSON.parse(ts.slice(ts.indexOf('= [', ts.indexOf('CHECKSHEET_TEMPLATES')) + 2, ts.lastIndexOf('] as const;') + 1));
const tsItems = tsData.reduce((n, t) => n + t.sections.reduce((m, s) => m + s.items.length, 0), 0);

console.log('round-trip text checks :', checked, 'strings across', allItems.length, 'items');
console.log('item counts            : json=' + expectItems, 'dart=' + dartItems, 'sql=' + sqlItems, 'ts=' + tsItems);

if (dartItems !== expectItems) failures.push(`DART item count ${dartItems} != ${expectItems}`);
if (sqlItems !== expectItems) failures.push(`SQL item count ${sqlItems} != ${expectItems}`);
if (tsItems !== expectItems) failures.push(`TS item count ${tsItems} != ${expectItems}`);

// Dart literals must be balanced — a mis-escaped quote breaks every literal after it.
const dartLiterals = [...dart.matchAll(/'(?:[^'\\]|\\.)*'/g)].length;
console.log('dart string literals   :', dartLiterals, '(well-formed)');
if (dartLiterals < expectItems * 2) failures.push(`DART only ${dartLiterals} well-formed literals — escaping is broken`);

console.log('');
if (failures.length) {
  console.error(`FAILED — ${failures.length} problem(s):`);
  failures.slice(0, 20).forEach((f) => console.error('  • ' + f));
  process.exit(1);
}
console.log('OK — all generated artifacts round-trip to the canonical JSON.');
