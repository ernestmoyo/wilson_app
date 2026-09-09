#!/usr/bin/env node
/**
 * Reconcile several independent extractions of the SAME check sheet into one
 * canonical template.
 *
 * The general sheet appears in every client workbook. Extracting it from two
 * unrelated workbooks (class 6&8, class 2&3.1) yields 36/36 items with
 * byte-identical action and records text, differing only in regulation
 * references on 2 items — because the applicable regulations are class-scoped.
 *
 * Taking "whichever workbook was extracted last" as canonical silently ships
 * the wrong citations for every other class. This tool instead:
 *
 *   - asserts the action/records text agrees across all inputs (fails loudly
 *     if the workbooks have genuinely drifted, which is a content review, not
 *     a merge)
 *   - splits regulation refs into a shared base (present in every input) plus
 *     a sparse per-class overlay for the items that differ
 *
 * Usage:
 *   node reconcile.mjs --out data/wks17-general.template.json \
 *     --input data/a.template.json:class_6_8 \
 *     --input data/b.template.json:class_2_3
 */

import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const outPath = args[args.indexOf('--out') + 1];
const inputs = args
  .map((a, i) => (a === '--input' ? args[i + 1] : null))
  .filter(Boolean)
  .map((spec) => {
    const idx = spec.lastIndexOf(':');
    return { path: spec.slice(0, idx), classKey: spec.slice(idx + 1) };
  });

if (!outPath || inputs.length < 2) {
  console.error('usage: reconcile.mjs --out <file> --input <file>:<classKey> --input <file>:<classKey> [...]');
  process.exit(1);
}

const loaded = inputs.map((i) => ({ ...i, doc: JSON.parse(readFileSync(i.path, 'utf8')) }));
const [base, ...rest] = loaded;

const flatten = (doc) =>
  doc.sections.flatMap((s, si) => s.items.map((it, ii) => ({ si, ii, s, it })));

const baseFlat = flatten(base.doc);
const errors = [];

// ── 1. Structure must agree ────────────────────────────────────────────────
for (const other of rest) {
  const f = flatten(other.doc);
  if (f.length !== baseFlat.length) {
    errors.push(`item count differs: ${base.classKey}=${baseFlat.length} vs ${other.classKey}=${f.length}`);
    continue;
  }
  if (other.doc.sections.length !== base.doc.sections.length) {
    errors.push(`section count differs: ${base.classKey}=${base.doc.sections.length} vs ${other.classKey}=${other.doc.sections.length}`);
  }
  base.doc.sections.forEach((s, i) => {
    const o = other.doc.sections[i];
    if (o && s.title !== o.title) errors.push(`section ${i + 1} title differs: "${s.title}" vs "${o.title}"`);
  });
}

// ── 2. Content must agree — this is an assertion, not a merge ──────────────
for (const other of rest) {
  const f = flatten(other.doc);
  baseFlat.forEach((b, i) => {
    const o = f[i];
    if (!o) return;
    if (b.it.action !== o.it.action)
      errors.push(`item ${i} ACTION differs between ${base.classKey} and ${other.classKey}:\n    A: ${b.it.action.slice(0, 120)}\n    B: ${o.it.action.slice(0, 120)}`);
    if (b.it.records !== o.it.records)
      errors.push(`item ${i} RECORDS differs between ${base.classKey} and ${other.classKey}:\n    A: ${b.it.records.slice(0, 120)}\n    B: ${o.it.records.slice(0, 120)}`);
  });
}

if (errors.length) {
  console.error(`\nRECONCILE FAILED — ${errors.length} disagreement(s).`);
  console.error('The source workbooks have genuinely drifted. This needs a content review, not a merge.\n');
  errors.slice(0, 15).forEach((e) => console.error('  • ' + e));
  if (errors.length > 15) console.error(`  … and ${errors.length - 15} more`);
  process.exit(2);
}

// ── 3. Split regulation refs into shared base + sparse per-class overlay ───
const canonical = structuredClone(base.doc);
let overlayCount = 0;

flatten(canonical).forEach((c, i) => {
  const perClass = {};
  for (const l of loaded) perClass[l.classKey] = flatten(l.doc)[i].it.regulationRefs || [];

  const sets = Object.values(perClass).map((r) => new Set(r));
  const shared = [...sets[0]].filter((ref) => sets.every((s) => s.has(ref)));
  const identical = Object.values(perClass).every(
    (r) => r.length === shared.length && r.every((x) => shared.includes(x))
  );

  c.it.regulationRefs = shared;
  if (identical) {
    delete c.it.regulationRefsByClass;
  } else {
    c.it.regulationRefsByClass = perClass;
    overlayCount++;
    console.log(`  class-conditional refs on section ${c.si + 1} item ${c.it.number ?? c.ii + 1}:`);
    for (const [k, v] of Object.entries(perClass)) console.log(`      ${k}: ${v.join(' ') || '(none)'}`);
  }
});

// ── 4. Sheet-level nodes: shared where identical, per-class overlay otherwise ─
// Title, banner and declaration genuinely differ by class family (the
// declaration cites reg 13.38 for class 6/8 and 17.91 for class 2/3); the
// note, column headers and footer do not.
{
  const sheets = loaded.map((l) => [l.classKey, l.doc.sheet ?? {}]);
  const keys = new Set(sheets.flatMap(([, s]) => Object.keys(s)));
  const base = {};
  const byClass = {};
  let overlayFields = 0;
  for (const k of keys) {
    const vals = sheets.map(([, s]) => JSON.stringify(s[k] ?? null));
    if (vals.every((v) => v === vals[0])) {
      base[k] = sheets[0][1][k] ?? null;
    } else {
      overlayFields++;
      for (const [classKey, s] of sheets) {
        (byClass[classKey] ??= {})[k] = s[k] ?? null;
      }
      console.log(`  class-conditional sheet field: ${k}`);
    }
  }
  canonical.sheet = base;
  if (overlayFields) canonical.sheetByClass = byClass;
  else delete canonical.sheetByClass;
}

canonical.code = 'wks17-general';
canonical.title = 'General location requirements';
canonical.classScope = [];
canonical.source = {
  reconciledFrom: loaded.map((l) => ({ path: l.path, classKey: l.classKey, sheet: l.doc.source?.sheet })),
  reconciledAt: new Date().toISOString(),
  // Every correction applied to any input, tagged with the class family it
  // came from, so the canonical template's provenance is complete.
  corrections: loaded.flatMap((l) =>
    (l.doc.source?.corrections ?? []).map((c) => ({ classKey: l.classKey, ...c }))),
};

writeFileSync(outPath, JSON.stringify(canonical, null, 2) + '\n');

const items = flatten(canonical).length;
console.log(`\nreconciled ${loaded.length} extractions → ${outPath}`);
console.log(`  ${canonical.sections.length} sections, ${items} items`);
console.log(`  ${items - overlayCount} items with class-independent regulation refs`);
console.log(`  ${overlayCount} items with a class-conditional overlay`);
