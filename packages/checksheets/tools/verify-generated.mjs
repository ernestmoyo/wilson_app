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

const dartEscape = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$').replace(/\r/g, '').replace(/\n/g, '\\n');
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

// ── Sheet sets: every reference resolves, and the app can see the choices ──
// A set's templates exist; a choice names sections that exist in a template of
// its set; no section is both chosen and not in scope; every authorisation
// key is a register entry; the generated Dart carries every choice.
const sheetSets = JSON.parse(readFileSync(join(dataDir, 'sheet-sets.json'), 'utf8'));
const authorisation = JSON.parse(readFileSync(join(dataDir, 'authorisation.json'), 'utf8'));
const authKeys = new Set(authorisation.authorisations.map((a) => a.key));
const byCode = Object.fromEntries(templates.map((t) => [t.code, t]));
let choiceCount = 0;
const setKeys = new Set();
for (const set of sheetSets.sets) {
  const where = `set ${set.key}`;
  if (setKeys.has(set.key)) failures.push(`${where}: duplicate key`);
  setKeys.add(set.key);
  for (const code of set.templates) if (!byCode[code]) failures.push(`${where}: template ${code} not in data/`);
  if (set.authorisation && !authKeys.has(set.authorisation)) failures.push(`${where}: authorisation ${set.authorisation} not in authorisation.json`);
  const seen = new Map();
  const refs = (list, label) => {
    for (const r of list ?? []) {
      if (!set.templates.includes(r.template)) failures.push(`${where} ${label}: template ${r.template} is not one of the set's`);
      const t = byCode[r.template];
      for (const o of r.ordinals ?? []) {
        if (t && !t.sections.some((s) => s.ordinal === o)) failures.push(`${where} ${label}: ${r.template} has no section ${o}`);
        const k = `${r.template}#${o}`;
        if (label === 'notInScope' && seen.has(k)) failures.push(`${where}: ${k} is both chosen (${seen.get(k)}) and not in scope`);
        if (label !== 'notInScope') seen.set(k, label);
      }
    }
  };
  const choiceKeys = new Set();
  for (const c of set.choices ?? []) {
    choiceCount++;
    if (choiceKeys.has(c.key)) failures.push(`${where}: duplicate choice ${c.key}`);
    choiceKeys.add(c.key);
    if (!c.label) failures.push(`${where} choice ${c.key}: no label`);
    if (c.authorisation && !authKeys.has(c.authorisation)) failures.push(`${where} choice ${c.key}: authorisation ${c.authorisation} not in authorisation.json`);
    if (!c.sections?.length) failures.push(`${where} choice ${c.key}: no sections`);
    refs(c.sections, `choice ${c.key}`);
    if (!dart.includes(`SheetSetChoice('${dartEscape(c.key)}'`)) failures.push(`DART  ${where}: choice ${c.key} missing from checksheets.g.dart`);
  }
  refs(set.notInScope, 'notInScope');
  const authorised = set.authorisation ? authKeys.has(set.authorisation)
    : (set.choices?.length ?? 0) > 0 && set.choices.every((c) => c.authorisation && authKeys.has(c.authorisation));
  console.log(`sheet set ${set.key.padEnd(14)}: ${set.templates.length} template(s), ${(set.choices ?? []).length} choice(s), ${authorised ? 'authorised' : 'NOT authorised'}`);
}
console.log('sheet set choices      :', choiceCount, 'checked');

console.log('');
if (failures.length) {
  console.error(`FAILED — ${failures.length} problem(s):`);
  failures.slice(0, 20).forEach((f) => console.error('  • ' + f));
  process.exit(1);
}
console.log('OK — all generated artifacts round-trip to the canonical JSON.');
