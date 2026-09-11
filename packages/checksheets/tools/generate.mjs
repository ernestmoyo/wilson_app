#!/usr/bin/env node
/**
 * Generate every downstream representation of the check sheet templates from
 * the canonical JSON in data/.
 *
 *   data/*.template.json
 *        ├─► generated/checksheets.ts        TypeScript types + data  (web, api)
 *        ├─► generated/checksheets.g.dart    Dart models + data       (Flutter)
 *        └─► generated/seed-templates.sql    Postgres DDL + seed
 *
 * None of the outputs is ever hand-edited. A Performance Standard revision is
 * a change to data/ plus `npm run gen` — not four parallel edits in four
 * languages that silently drift apart.
 *
 * Usage:  node tools/generate.mjs
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const dataDir = join(pkgRoot, 'data');
const outDir = join(pkgRoot, 'generated');

const GENERATOR = 'packages/checksheets/tools/generate.mjs';

// ── load canonical templates ───────────────────────────────────────────────
const files = readdirSync(dataDir)
  .filter((f) => f.endsWith('.template.json'))
  // the per-workbook general extractions are superseded by the reconciled one
  .filter((f) => f !== 'wks17-locations-general.template.json')
  .sort();

const templates = files.map((f) => JSON.parse(readFileSync(join(dataDir, f), 'utf8')));
const sheetSets = JSON.parse(readFileSync(join(dataDir, 'sheet-sets.json'), 'utf8')).sets;
if (!templates.length) {
  console.error('no templates in data/ — run tools/extract-workbook.mjs first');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const banner = (comment) =>
  [
    `${comment} GENERATED FILE — DO NOT EDIT.`,
    `${comment} Source:    packages/checksheets/data/*.template.json`,
    `${comment} Generator: ${GENERATOR}`,
    `${comment} Regenerate with: npm run gen -w packages/checksheets`,
    '',
  ].join('\n');

// ── escapers ───────────────────────────────────────────────────────────────
/** Dart single-quoted string: backslash, quote, and $ (interpolation) are special. */
const dartStr = (s) =>
  s === null || s === undefined
    ? 'null'
    : "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$').replace(/\r/g, '').replace(/\n/g, '\\n') + "'";

/** Postgres literal: double the single quotes. */
const sqlStr = (s) =>
  s === null || s === undefined ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";

const sqlArr = (a) =>
  !a || !a.length ? "'{}'" : "ARRAY[" + a.map((x) => sqlStr(x)).join(', ') + "]::text[]";

const pascal = (s) => s.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());

/** Sheet-level nodes with every field present, so consumers never see undefined. */
const sheetOf = (t) => ({
  title: null, evidenceColumnLabel: null, banner: null, columnHeaders: [], note: null,
  declaration: null, documentControl: null, scopeOfAuthorisation: null, reference: null, footer: null,
  kind: 'location', subjectBlockTitle: null, subjectBlock: [], unitBlockTitle: null, unitBlock: null,
  authorisation: null, certificate: null,
  ...(t.sheet ?? {}),
});

// ── 1. TypeScript ──────────────────────────────────────────────────────────
function emitTypeScript() {
  const out = [];
  out.push(banner('//'));
  out.push(`export interface ChecksheetItem {
  ordinal: number;
  number: string | null;
  regulationRefs: readonly string[];
  /** Sparse: present only where the applicable regulations are class-scoped. */
  regulationRefsByClass?: Readonly<Record<string, readonly string[]>>;
  regulationRaw: string | null;
  guidanceUrl: string | null;
  action: string;
  records: string;
  evidenceRequired: boolean;
}

export interface ChecksheetSection {
  ordinal: number;
  number: string | null;
  title: string;
  items: readonly ChecksheetItem[];
}

/** Everything on the sheet that is not an item; reproduced in place by the app. */
export interface ChecksheetSheet {
  title: string | null;
  evidenceColumnLabel: string | null;
  banner: string | null;
  columnHeaders: readonly string[];
  note: string | null;
  declaration: string | null;
  documentControl: Readonly<Record<string, string>> | null;
  scopeOfAuthorisation: { heading: string | null; text: string | null; confirmation: string | null } | null;
  reference: string | null;
  footer: string | null;
  /** location | handler | cylinder: what the sheet is about. */
  kind: 'location' | 'handler' | 'cylinder';
  subjectBlockTitle: string | null;
  /** The labels of the block above the items (site block, applicant, PCBU), verbatim. */
  subjectBlock: readonly { label: string; options?: readonly string[] }[];
  unitBlockTitle: string | null;
  /** Per-unit labels (a cylinder batch); null when the sheet has no units. */
  unitBlock: readonly { label: string }[] | null;
  authorisation: string | null;
  /** The certificate tab's wording for this kind; null for the location sheets (they share render-certificate). */
  certificate: Record<string, unknown> | null;
}

export interface ChecksheetTemplate {
  code: string;
  title: string;
  psReference: string | null;
  classScope: readonly string[];
  revision: number;
  status: 'draft' | 'current' | 'superseded';
  sheet: ChecksheetSheet;
  /** Sparse per-class overlay for sheet fields that differ by class family. */
  sheetByClass?: Readonly<Record<string, Partial<ChecksheetSheet>>>;
  sections: readonly ChecksheetSection[];
}

const EMPTY_SHEET: ChecksheetSheet = {
  title: null, evidenceColumnLabel: null, banner: null, columnHeaders: [], note: null,
  declaration: null, documentControl: null, scopeOfAuthorisation: null, reference: null, footer: null,
  kind: 'location', subjectBlockTitle: null, subjectBlock: [], unitBlockTitle: null, unitBlock: null,
  authorisation: null, certificate: null,
};

/** Sheet nodes for a class family: the overlay's non-null fields over the base. */
export function sheetFor(t: ChecksheetTemplate, classKey?: string): ChecksheetSheet {
  const base = { ...EMPTY_SHEET, ...t.sheet };
  const o = classKey ? t.sheetByClass?.[classKey] : undefined;
  if (!o) return base;
  const out: ChecksheetSheet = { ...base };
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) (out as any)[k] = v;
  return out;
}
`);

  const slim = templates.map((t) => ({
    code: t.code,
    title: t.title,
    psReference: t.psReference ?? null,
    classScope: t.classScope ?? [],
    revision: t.revision ?? 1,
    status: t.status ?? 'draft',
    sheet: sheetOf(t),
    ...(t.sheetByClass ? { sheetByClass: t.sheetByClass } : {}),
    sections: t.sections.map((s) => ({
      ordinal: s.ordinal,
      number: s.number ?? null,
      title: s.title,
      items: s.items.map((i) => ({
        ordinal: i.ordinal,
        number: i.number ?? null,
        regulationRefs: i.regulationRefs ?? [],
        ...(i.regulationRefsByClass ? { regulationRefsByClass: i.regulationRefsByClass } : {}),
        regulationRaw: i.regulationRaw ?? null,
        guidanceUrl: i.guidanceUrl ?? null,
        action: i.action,
        records: i.records,
        evidenceRequired: !!i.evidenceRequired,
      })),
    })),
  }));

  out.push(`export const CHECKSHEET_TEMPLATES: readonly ChecksheetTemplate[] = ${JSON.stringify(slim, null, 2)} as const;
`);
  out.push(`export const TEMPLATES_BY_CODE: Readonly<Record<string, ChecksheetTemplate>> =
  Object.fromEntries(CHECKSHEET_TEMPLATES.map((t) => [t.code, t]));

/**
 * Regulation references for an item, applying the class overlay when the
 * applicable regulations are class-scoped.
 */
export function regulationRefsFor(item: ChecksheetItem, classKey?: string): readonly string[] {
  if (classKey && item.regulationRefsByClass?.[classKey]) return item.regulationRefsByClass[classKey];
  return item.regulationRefs;
}
`);
  writeFileSync(join(outDir, 'checksheets.ts'), out.join('\n'));
  return 'checksheets.ts';
}

// ── 2. Dart ────────────────────────────────────────────────────────────────
function emitDart() {
  const out = [];
  out.push(banner('//'));
  out.push(`// ignore_for_file: prefer_single_quotes, lines_longer_than_80_chars

class ChecksheetItem {
  final int ordinal;
  final String? number;
  final List<String> regulationRefs;

  /// Sparse: present only where the applicable regulations are class-scoped.
  final Map<String, List<String>>? regulationRefsByClass;
  final String? regulationRaw;
  final String? guidanceUrl;
  final String action;
  final String records;
  final bool evidenceRequired;

  const ChecksheetItem({
    required this.ordinal,
    this.number,
    required this.regulationRefs,
    this.regulationRefsByClass,
    this.regulationRaw,
    this.guidanceUrl,
    required this.action,
    required this.records,
    required this.evidenceRequired,
  });

  /// Regulation references for this item, applying the class overlay where the
  /// applicable regulations are class-scoped.
  List<String> regulationRefsFor(String? classKey) {
    if (classKey != null && regulationRefsByClass != null) {
      final overlay = regulationRefsByClass![classKey];
      if (overlay != null) return overlay;
    }
    return regulationRefs;
  }
}

class ChecksheetSection {
  final int ordinal;
  final String? number;
  final String title;
  final List<ChecksheetItem> items;

  const ChecksheetSection({
    required this.ordinal,
    this.number,
    required this.title,
    required this.items,
  });
}

/// One label of a subject or unit block, with the options a choice row offers.
class SubjectLabel {
  final String label;
  final List<String> options;
  const SubjectLabel(this.label, {this.options = const []});
}

class ScopeOfAuthorisation {
  final String? heading;
  final String? text;
  final String? confirmation;
  const ScopeOfAuthorisation({this.heading, this.text, this.confirmation});
}

/// Everything on the sheet that is not an item — title, banner, column
/// headers, the NB note, the declaration, document control, scope of
/// authorisation, reference and footer. The app reproduces each in place.
class SheetMeta {
  final String? title;
  final String? evidenceColumnLabel;
  final String? banner;
  final List<String> columnHeaders;
  final String? note;
  final String? declaration;
  final Map<String, String>? documentControl;
  final ScopeOfAuthorisation? scopeOfAuthorisation;
  final String? reference;
  final String? footer;

  /// location | handler | cylinder: what the sheet is about.
  final String kind;
  final String? subjectBlockTitle;

  /// Labels of the block above the items, verbatim; options for a choice row.
  final List<SubjectLabel> subjectBlock;
  final String? unitBlockTitle;

  /// Per-unit labels (a cylinder batch); null when the sheet has no units.
  final List<SubjectLabel>? unitBlock;
  final String? authorisation;

  /// The certificate tab's wording, as extracted; null for location sheets.
  final Map<String, dynamic>? certificate;

  const SheetMeta({
    this.title,
    this.evidenceColumnLabel,
    this.banner,
    this.columnHeaders = const [],
    this.note,
    this.declaration,
    this.documentControl,
    this.scopeOfAuthorisation,
    this.reference,
    this.footer,
    this.kind = 'location',
    this.subjectBlockTitle,
    this.subjectBlock = const [],
    this.unitBlockTitle,
    this.unitBlock,
    this.authorisation,
    this.certificate,
  });

  bool get isLocation => kind == 'location';
  bool get hasUnits => unitBlock != null && unitBlock!.isNotEmpty;

  /// Overlay: non-null fields of [o] win over this.
  SheetMeta merge(SheetMeta? o) => o == null
      ? this
      : SheetMeta(
          title: o.title ?? title,
          evidenceColumnLabel: o.evidenceColumnLabel ?? evidenceColumnLabel,
          banner: o.banner ?? banner,
          columnHeaders: o.columnHeaders.isNotEmpty ? o.columnHeaders : columnHeaders,
          note: o.note ?? note,
          declaration: o.declaration ?? declaration,
          documentControl: o.documentControl ?? documentControl,
          scopeOfAuthorisation: o.scopeOfAuthorisation ?? scopeOfAuthorisation,
          reference: o.reference ?? reference,
          footer: o.footer ?? footer,
          kind: kind,
          subjectBlockTitle: o.subjectBlockTitle ?? subjectBlockTitle,
          subjectBlock: o.subjectBlock.isNotEmpty ? o.subjectBlock : subjectBlock,
          unitBlockTitle: o.unitBlockTitle ?? unitBlockTitle,
          unitBlock: o.unitBlock ?? unitBlock,
          authorisation: o.authorisation ?? authorisation,
          certificate: o.certificate ?? certificate,
        );
}

class ChecksheetTemplate {
  final String code;
  final String title;
  final String? psReference;
  final List<String> classScope;
  final int revision;
  final String status;
  final SheetMeta sheet;

  /// Sparse per-class overlay for sheet fields that differ by class family.
  final Map<String, SheetMeta>? sheetByClass;
  final List<ChecksheetSection> sections;

  const ChecksheetTemplate({
    required this.code,
    required this.title,
    this.psReference,
    required this.classScope,
    required this.revision,
    required this.status,
    this.sheet = const SheetMeta(),
    this.sheetByClass,
    required this.sections,
  });

  int get itemCount =>
      sections.fold(0, (n, s) => n + s.items.length);

  /// Sheet nodes for a class family: the overlay's non-null fields over base.
  SheetMeta sheetFor(String? classKey) =>
      sheet.merge(classKey == null ? null : sheetByClass?[classKey]);
}
`);

  const dartList = (a) => '[' + (a ?? []).map(dartStr).join(', ') + ']';
  const dartMap = (m) =>
    m
      ? '{' + Object.entries(m).map(([k, v]) => `${dartStr(k)}: ${dartList(v)}`).join(', ') + '}'
      : 'null';
  const dartStrMap = (m) =>
    m
      ? '{' + Object.entries(m).map(([k, v]) => `${dartStr(k)}: ${dartStr(v)}`).join(', ') + '}'
      : 'null';
  const dartLabels = (xs) =>
    !xs || !xs.length
      ? '[]'
      : '[' + xs.map((x) => `SubjectLabel(${dartStr(x.label)}${x.options?.length ? `, options: ${dartList(x.options)}` : ''})`).join(', ') + ']';
  // Nested JSON as a Dart literal: strings, numbers, booleans, lists, maps.
  const dartJson = (v) =>
    v === null || v === undefined ? 'null'
    : typeof v === 'string' ? dartStr(v)
    : typeof v === 'number' || typeof v === 'boolean' ? String(v)
    : Array.isArray(v) ? '[' + v.map(dartJson).join(', ') + ']'
    : '{' + Object.entries(v).map(([k, x]) => `${dartStr(k)}: ${dartJson(x)}`).join(', ') + '}';
  const dartScope = (s) =>
    s
      ? `ScopeOfAuthorisation(heading: ${dartStr(s.heading)}, text: ${dartStr(s.text)}, confirmation: ${dartStr(s.confirmation)})`
      : 'null';
  const dartSheet = (s, indent = '    ') =>
    !s
      ? 'SheetMeta()'
      : `SheetMeta(
${indent}  title: ${dartStr(s.title)},
${indent}  evidenceColumnLabel: ${dartStr(s.evidenceColumnLabel)},
${indent}  banner: ${dartStr(s.banner)},
${indent}  columnHeaders: ${dartList(s.columnHeaders)},
${indent}  note: ${dartStr(s.note)},
${indent}  declaration: ${dartStr(s.declaration)},
${indent}  documentControl: ${dartStrMap(s.documentControl)},
${indent}  scopeOfAuthorisation: ${dartScope(s.scopeOfAuthorisation)},
${indent}  reference: ${dartStr(s.reference)},
${indent}  footer: ${dartStr(s.footer)},
${indent}  kind: ${dartStr(s.kind ?? 'location')},
${indent}  subjectBlockTitle: ${dartStr(s.subjectBlockTitle)},
${indent}  subjectBlock: ${dartLabels(s.subjectBlock)},
${indent}  unitBlockTitle: ${dartStr(s.unitBlockTitle)},
${indent}  unitBlock: ${s.unitBlock ? dartLabels(s.unitBlock) : 'null'},
${indent}  authorisation: ${dartStr(s.authorisation)},
${indent}  certificate: ${s.certificate ? dartJson(s.certificate) : 'null'},
${indent})`;
  const dartSheetByClass = (m) =>
    m
      ? '{' + Object.entries(m).map(([k, v]) => `${dartStr(k)}: ${dartSheet(v, '      ')}`).join(', ') + '}'
      : 'null';

  const tmplSrc = templates
    .map((t) => {
      const sections = t.sections
        .map((s) => {
          const items = s.items
            .map(
              (i) => `        ChecksheetItem(
          ordinal: ${i.ordinal},
          number: ${dartStr(i.number)},
          regulationRefs: ${dartList(i.regulationRefs)},
          regulationRefsByClass: ${dartMap(i.regulationRefsByClass)},
          regulationRaw: ${dartStr(i.regulationRaw)},
          guidanceUrl: ${dartStr(i.guidanceUrl)},
          action: ${dartStr(i.action)},
          records: ${dartStr(i.records)},
          evidenceRequired: ${!!i.evidenceRequired},
        ),`
            )
            .join('\n');
          return `    ChecksheetSection(
      ordinal: ${s.ordinal},
      number: ${dartStr(s.number)},
      title: ${dartStr(s.title)},
      items: [
${items}
      ],
    ),`;
        })
        .join('\n');

      return `const ChecksheetTemplate k${pascal(t.code)} = ChecksheetTemplate(
  code: ${dartStr(t.code)},
  title: ${dartStr(t.title)},
  psReference: ${dartStr(t.psReference)},
  classScope: ${dartList(t.classScope)},
  revision: ${t.revision ?? 1},
  status: ${dartStr(t.status ?? 'draft')},
  sheet: ${dartSheet(t.sheet, '  ')},
  sheetByClass: ${dartSheetByClass(t.sheetByClass)},
  sections: [
${sections}
  ],
);`;
    })
    .join('\n\n');

  out.push(tmplSrc);
  out.push('');
  out.push(`const List<ChecksheetTemplate> kChecksheetTemplates = [
${templates.map((t) => `  k${pascal(t.code)},`).join('\n')}
];

final Map<String, ChecksheetTemplate> kTemplatesByCode = {
  for (final t in kChecksheetTemplates) t.code: t,
};

/// A sheet set: what a job inspects against, named by what it is. From
/// data/sheet-sets.json; the server publishes the same list with the
/// authorisation resolved.
class SheetSetDef {
  final String key;
  final String kind;
  final String name;
  final List<String> templates;
  final String? authorisation;
  const SheetSetDef(this.key, this.kind, this.name, this.templates, this.authorisation);
}

const List<SheetSetDef> kSheetSets = [
${sheetSets.map((x) => `  SheetSetDef(${dartStr(x.key)}, ${dartStr(x.kind ?? 'location')}, ${dartStr(x.name)}, ${dartList(x.templates)}, ${dartStr(x.authorisation)}),`).join('\n')}
];

final Map<String, SheetSetDef> kSheetSetsByKey = {
  for (final s in kSheetSets) s.key: s,
};
`);

  const src = out.join('\n');
  writeFileSync(join(outDir, 'checksheets.g.dart'), src);

  // Flutter cannot import from outside its own lib/, so the generated Dart is
  // mirrored into the app. Same bytes, same generator, still never hand-edited.
  const flutterDir = join(pkgRoot, '..', '..', 'apps', 'mobile', 'lib', 'generated');
  try {
    mkdirSync(flutterDir, { recursive: true });
    writeFileSync(join(flutterDir, 'checksheets.g.dart'), src);
  } catch (e) {
    console.warn(`  (could not mirror into apps/mobile: ${e.message})`);
  }
  return 'checksheets.g.dart';
}

// ── 3. Postgres ────────────────────────────────────────────────────────────
function emitSql() {
  const out = [];
  out.push(banner('--'));
  out.push(`-- Template layer only. Templates are immutable once status = 'current';
-- a Performance Standard revision inserts a NEW revision rather than updating
-- an existing row, so an inspection can always name the exact revision it was
-- conducted under (IPS cl. 21, and the question every auditor asks at year 9).

CREATE TABLE IF NOT EXISTS checksheet_template (
  id              bigserial PRIMARY KEY,
  code            text        NOT NULL,
  revision        integer     NOT NULL DEFAULT 1,
  title           text        NOT NULL,
  ps_reference    text,
  class_scope     text[]      NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','current','superseded')),
  effective_from  date,
  superseded_by   bigint      REFERENCES checksheet_template(id),
  -- Sheet-level nodes (title, banner, note, declaration, document control,
  -- scope of authorisation, reference, footer) and their per-class overlay.
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, revision)
);
-- Databases created before meta existed get the column added in place.
ALTER TABLE checksheet_template ADD COLUMN IF NOT EXISTS meta jsonb;

CREATE TABLE IF NOT EXISTS checksheet_section (
  id           bigserial PRIMARY KEY,
  template_id  bigint  NOT NULL REFERENCES checksheet_template(id) ON DELETE CASCADE,
  ordinal      integer NOT NULL,
  number       text,
  title        text    NOT NULL,
  UNIQUE (template_id, ordinal)
);

CREATE TABLE IF NOT EXISTS checksheet_item (
  id                        bigserial PRIMARY KEY,
  section_id                bigint  NOT NULL REFERENCES checksheet_section(id) ON DELETE CASCADE,
  ordinal                   integer NOT NULL,
  number                    text,
  regulation_refs           text[]  NOT NULL DEFAULT '{}',
  -- sparse; only the items whose applicable regulations are class-scoped
  regulation_refs_by_class  jsonb,
  regulation_raw            text,
  guidance_url              text,
  action                    text    NOT NULL,
  records                   text    NOT NULL,
  evidence_required         boolean NOT NULL DEFAULT false,
  UNIQUE (section_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_checksheet_item_refs
  ON checksheet_item USING gin (regulation_refs);
`);

  out.push('\n-- ── seed ──────────────────────────────────────────────────────────────\n');
  out.push('BEGIN;\n');

  // Revisioning by content hash.
  //
  // A template's sections and items are immutable once published: findings
  // reference item ids, and an inspection must always be able to name the
  // exact wording it was assessed against. So a changed template is NEVER
  // merged into an existing revision — it becomes a new revision, the old one
  // is marked superseded, and old findings keep pointing at old rows.
  // Re-running the same seed is a no-op. (Merging under one revision once
  // turned 98 items into 116 on the deployed database.)
  for (const t of templates) {
    const body = JSON.stringify({ sheet: sheetOf(t), sheetByClass: t.sheetByClass ?? null, sections: t.sections });
    const hash = createHash('sha256').update(body).digest('hex');
    const meta = JSON.stringify({ contentHash: hash, sheet: sheetOf(t), sheetByClass: t.sheetByClass ?? null });
    const items = t.sections.reduce((n, s) => n + s.items.length, 0);
    const code = sqlStr(t.code);
    const H = sqlStr(hash);

    out.push(`-- ${t.code} — ${t.sections.length} sections, ${items} items — content ${hash.slice(0, 12)}`);
    out.push(`INSERT INTO checksheet_template (code, revision, title, ps_reference, class_scope, status, meta)
SELECT ${code},
       COALESCE((SELECT max(revision) FROM checksheet_template WHERE code = ${code}), 0) + 1,
       ${sqlStr(t.title)}, ${sqlStr(t.psReference)}, ${sqlArr(t.classScope)}, 'current', ${sqlStr(meta)}::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM checksheet_template WHERE code = ${code} AND meta->>'contentHash' = ${H}
);`);
    out.push(`UPDATE checksheet_template
   SET status = 'superseded',
       superseded_by = (SELECT id FROM checksheet_template WHERE code = ${code} AND meta->>'contentHash' = ${H})
 WHERE code = ${code} AND (meta->>'contentHash') IS DISTINCT FROM ${H} AND status <> 'superseded';\n`);

    for (const s of t.sections) {
      out.push(`INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, ${s.ordinal}, ${sqlStr(s.number)}, ${sqlStr(s.title)}
FROM checksheet_template WHERE code = ${code} AND meta->>'contentHash' = ${H}
ON CONFLICT (template_id, ordinal) DO NOTHING;`);

      for (const i of s.items) {
        const byClass = i.regulationRefsByClass
          ? `${sqlStr(JSON.stringify(i.regulationRefsByClass))}::jsonb`
          : 'NULL';
        out.push(`INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, ${i.ordinal}, ${sqlStr(i.number)}, ${sqlArr(i.regulationRefs)}, ${byClass}, ${sqlStr(i.regulationRaw)}, ${sqlStr(i.guidanceUrl)}, ${sqlStr(i.action)}, ${sqlStr(i.records)}, ${!!i.evidenceRequired}
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = ${code} AND t.meta->>'contentHash' = ${H} AND sec.ordinal = ${s.ordinal}
ON CONFLICT (section_id, ordinal) DO NOTHING;`);
      }
      out.push('');
    }
  }

  out.push('COMMIT;');
  writeFileSync(join(outDir, 'seed-templates.sql'), out.join('\n'));
  return 'seed-templates.sql';
}

// ── run ────────────────────────────────────────────────────────────────────
const totals = templates.map((t) => ({
  code: t.code,
  sections: t.sections.length,
  items: t.sections.reduce((n, s) => n + s.items.length, 0),
}));

console.log(`generating from ${templates.length} template(s):`);
for (const t of totals) console.log(`  ${t.code.padEnd(38)} ${t.sections} sections, ${t.items} items`);
console.log('');
for (const f of [emitTypeScript(), emitDart(), emitSql()]) console.log(`  wrote generated/${f}`);
