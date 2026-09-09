#!/usr/bin/env node
/**
 * Extract a WKS-17 location compliance check sheet workbook into canonical JSON.
 *
 * The workbook conflates three layers in one grid:
 *   template    (Item / Regulation / Action / Records)  — same for every client
 *   instance    (site block, Comments column)           — per job
 *   presentation(merged cells, red = non-compliant)     — styling
 *
 * This tool separates them. Crucially, it recovers compliance status from the
 * FONT COLOUR of the Comments column, which is the only place the workbook
 * records it (red FFFF0000 = non-compliant, green FF00B050 = resolved).
 * IPS cl. 21(1)(c) requires the result of each inspection to be recorded; a
 * font colour is not a durable way to record a statutory result, so we lift it
 * into an explicit field here, once, on import — and never rely on colour again.
 *
 * Usage:
 *   node extract-workbook.mjs <workbook.xlsx> --code <template-code> --out <dir>
 *   node extract-workbook.mjs <workbook.xlsx> --instance   # emit findings too
 */

import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { basename, join } from 'path';

const require2 = createRequire(new URL('../package.json', import.meta.url));
const ExcelJS = require2('exceljs');

const EXTRACTOR_VERSION = '1.0.0';

// Font colours the workbook uses to encode a finding's result.
const STATUS_BY_COLOUR = {
  FFFF0000: 'non_compliant', // red   — "NB: Non compliances are in red"
  FF00B050: 'compliant',     // green — resolved on re-verification
};

const NA_PATTERN = /^\s*(n\/?a\b|not applicable)/i;

/** Flatten every shape ExcelJS can hand back into plain text. */
function text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (value.error) return '';
    return '';
  }
  return String(value);
}

/**
 * Canonical text normalisation.
 *
 * Excel cells carry hard line breaks from manual wrapping, and the same
 * Performance Standard sentence is wrapped differently in different workbooks.
 * Those newlines are presentation, not content — the "(a) ... (b) ..." markers
 * carry the structure. Collapsing ALL whitespace to single spaces is what makes
 * the same clause extract identically from every workbook, which is the property
 * that lets us detect genuine drift rather than drowning in wrapping noise.
 */
const clean = (v) => text(v).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

function fontColour(cell) {
  const c = cell?.font?.color;
  if (!c) return null;
  return c.argb || (c.theme !== undefined ? `theme${c.theme}` : null);
}

/**
 * Pull regulation references out of the Regulation cell.
 * The cell is free text holding anything from "10.34 10.36 12.17" to
 * "13.35(1) https://worksafe.govt.nz/..." to a section heading.
 * The parse is deliberately lossy, so regulationRaw is always retained.
 */
function parseRegulations(raw) {
  if (!raw) return { refs: [], url: null };
  const urlMatch = raw.match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0] : null;
  const withoutUrl = raw.replace(/https?:\/\/\S+/g, ' ');
  const refs = [...withoutUrl.matchAll(/\b\d{1,2}\.\d{1,3}(?:\([0-9a-z]+\))*(?:\([0-9a-z]+\))*/gi)]
    .map((m) => m[0].trim());
  return { refs: [...new Set(refs)], url };
}

/** The Records column tells us whether physical evidence must be collected. */
function inferEvidenceRequired(records) {
  return /photograph|photo|a copy of|copies|sample|marked[- ]up plan|plate|drawing/i.test(records || '');
}

/** Locate the row carrying the column headers Item / Regulation / Action / Records. */
function findHeaderRow(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
    const a = clean(ws.getCell(`A${r}`).value).toLowerCase();
    const b = clean(ws.getCell(`B${r}`).value).toLowerCase();
    const c = clean(ws.getCell(`C${r}`).value).toLowerCase();
    if (a === 'item' && b === 'regulation' && c === 'action') return r;
  }
  return null;
}

/** The site/header block above the table: label in column A, value in C. */
function extractSiteBlock(ws, headerRow) {
  const block = {};
  for (let r = 1; r < headerRow; r++) {
    const label = clean(ws.getCell(`A${r}`).value);
    const value = clean(ws.getCell(`C${r}`).value);
    if (!label) continue;
    // Column D sometimes carries a second label with its value in E.
    const label2 = clean(ws.getCell(`D${r}`).value);
    const value2 = clean(ws.getCell(`E${r}`).value);
    if (label && value && label !== value) block[label] = value;
    if (label2 && value2 && label2 !== value2 && label2 !== label) block[label2] = value2;
  }
  return block;
}

/**
 * A section heading row is merged across B..E, so columns B and C hold the
 * identical string. An item row has a regulation in B and an action in C.
 * That difference is the discriminator.
 */
function isSectionRow(b, c) {
  return b !== '' && b === c;
}

function extractSheet(ws, workbookName) {
  const headerRow = findHeaderRow(ws);
  if (!headerRow) return null;

  const siteBlock = extractSiteBlock(ws, headerRow);
  const sections = [];
  const findings = [];
  const trailing = { declaration: null, decision: null, note: null, reference: null };

  let section = null;
  let sectionOrdinal = 0;
  let itemOrdinal = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const a = clean(ws.getCell(`A${r}`).value);
    const b = clean(ws.getCell(`B${r}`).value);
    const c = clean(ws.getCell(`C${r}`).value);
    const d = clean(ws.getCell(`D${r}`).value);
    const e = clean(ws.getCell(`E${r}`).value);

    if (!a && !b && !c) continue;

    // Trailing blocks close the table.
    if (/^NB:/i.test(a)) { trailing.note = a; continue; }
    if (/^Declaration:/i.test(a)) { trailing.declaration = a; continue; }
    if (/^Decision:/i.test(a)) { trailing.decision = a; continue; }
    if (/^Reference:/i.test(a)) { trailing.reference = clean(ws.getCell(`A${r + 1}`).value); continue; }
    if (/^Document Control$/i.test(a) || /^Section \d+\/\d+$/i.test(a)) continue;

    if (isSectionRow(b, c)) {
      sectionOrdinal += 1;
      section = {
        ordinal: sectionOrdinal,
        number: a || null,
        // Some class sheets fold the number into the title ("2 Separation of ...").
        title: b.replace(/^\d+\s+/, '').trim() || b,
        items: [],
      };
      sections.push(section);
      itemOrdinal = 0;
      continue;
    }

    // An item needs an action; rows without one are layout artefacts.
    if (!c) continue;

    if (!section) {
      sectionOrdinal += 1;
      section = { ordinal: sectionOrdinal, number: null, title: 'General', items: [] };
      sections.push(section);
      itemOrdinal = 0;
    }

    itemOrdinal += 1;
    const { refs, url } = parseRegulations(b);
    section.items.push({
      ordinal: itemOrdinal,
      number: a || null,
      regulationRefs: refs,
      regulationRaw: b || null,
      guidanceUrl: url,
      action: c,
      records: d,
      evidenceRequired: inferEvidenceRequired(d),
    });

    // Instance layer: the finding recorded against this item in this workbook.
    const colour = fontColour(ws.getCell(`E${r}`));
    let status = STATUS_BY_COLOUR[colour];
    if (!status) status = NA_PATTERN.test(e) ? 'not_applicable' : e ? 'compliant' : 'pending';
    findings.push({
      sectionOrdinal: section.ordinal,
      itemOrdinal,
      itemNumber: a || null,
      status,
      statusSource: STATUS_BY_COLOUR[colour] ? `font:${colour}` : 'inferred:text',
      comment: e || null,
      row: r,
    });
  }

  return {
    sheet: ws.name,
    title: clean(ws.getCell('A1').value) || ws.name,
    siteBlock,
    sections,
    findings,
    trailing,
    workbook: workbookName,
  };
}

function buildTemplate(extract, code, opts = {}) {
  return {
    code,
    title: extract.title,
    psReference:
      'Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard',
    classScope: opts.classScope || [],
    revision: 1,
    effectiveFrom: opts.effectiveFrom || null,
    supersededBy: null,
    status: 'draft',
    source: {
      workbook: extract.workbook,
      sheet: extract.sheet,
      extractedAt: new Date().toISOString(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    sections: extract.sections,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const getFlag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

if (!file) {
  console.error('usage: extract-workbook.mjs <workbook.xlsx> [--code <c>] [--out <dir>]');
  process.exit(1);
}

const outDir = getFlag('out') || '.';
const codeBase = getFlag('code');

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

mkdirSync(outDir, { recursive: true });
const results = [];

for (const ws of wb.worksheets) {
  const extract = extractSheet(ws, basename(file));
  if (!extract) {
    console.log(`  skip  "${ws.name}" (no Item/Regulation/Action header row)`);
    continue;
  }
  const slug = (codeBase ? `${codeBase}-` : '') +
    ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const template = buildTemplate(extract, slug);
  const items = extract.sections.reduce((n, s) => n + s.items.length, 0);
  const nc = extract.findings.filter((f) => f.status === 'non_compliant').length;
  const fromColour = extract.findings.filter((f) => f.statusSource.startsWith('font')).length;

  writeFileSync(join(outDir, `${slug}.template.json`), JSON.stringify(template, null, 2));
  const wbSlug = basename(file, '.xlsx').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  writeFileSync(
    join(outDir, `${wbSlug}--${slug}.instance.json`),
    JSON.stringify({ siteBlock: extract.siteBlock, findings: extract.findings, trailing: extract.trailing }, null, 2)
  );

  console.log(
    `  ok    "${ws.name}" → ${slug}\n` +
    `        ${extract.sections.length} sections, ${items} items, ${extract.findings.length} findings ` +
    `(${nc} non-compliant, ${fromColour} recovered from font colour)`
  );
  results.push({ slug, sections: extract.sections.length, items });
}

if (!results.length) {
  console.error('no check sheet found in workbook');
  process.exit(2);
}
