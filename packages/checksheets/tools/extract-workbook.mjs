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
import { pathToFileURL } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import { basename, join } from 'path';

const require2 = createRequire(new URL('../package.json', import.meta.url));
const ExcelJS = require2('exceljs');

const EXTRACTOR_VERSION = '1.1.0';

// Font colours the workbook uses to encode a finding's result.
const STATUS_BY_COLOUR = {
  FFFF0000: 'non_compliant', // red   — "NB: Non compliances are in red"
  FF00B050: 'compliant',     // green — resolved on re-verification, or a reviewer's correction
};

/**
 * What a run's colour means. Red and green carry a result; blue is how the
 * reviewer writes, and is ALSO the default comment colour of several sheets
 * (theme accent 1 for whole cells), so blue alone never makes a general
 * comment: the "General comment" label does. Blue is kept on the run so a
 * reviewer can see it.
 */
const ROLE_BY_COLOUR = {
  FFFF0000: 'finding',
  FF00B050: 'compliant',
  FF0070C0: 'blue',
  FF305496: 'blue',
  theme4: 'blue',
};
const roleOf = (colour) => ROLE_BY_COLOUR[colour] ?? 'text';

const NA_PATTERN = /^\s*(n\/?a\b|not applicable)/i;
const GENERAL_COMMENT = /\(?\s*general comment\s*[:\-–]?\s*/i;

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

function colourOf(font) {
  const c = font?.color;
  if (!c) return null;
  return c.argb || (c.theme !== undefined ? `theme${c.theme}` : null);
}

function fontColour(cell) {
  return colourOf(cell?.font);
}

/**
 * The cell as coloured runs. A rich-text cell carries one colour per run
 * (a red finding beside green or blue text in the same cell); a run with no
 * colour of its own takes the cell's. A plain cell is one run.
 */
function runsOf(cell) {
  const v = cell?.value;
  const cellColour = fontColour(cell);
  if (v && typeof v === 'object' && Array.isArray(v.richText)) {
    return v.richText.map((r) => ({ text: r.text ?? '', colour: colourOf(r.font) ?? cellColour }));
  }
  return [{ text: text(v), colour: cellColour }];
}

/**
 * The finding recorded in a Comments cell, read run by run.
 *
 *   - a run labelled "General comment" is the general comment (advisory),
 *     whatever its colour;
 *   - any red run left is a finding: non-compliant;
 *   - otherwise, all coloured text green: compliant (font colour);
 *   - otherwise the text decides, exactly as for a single-colour cell.
 *
 * A plain (single-run) cell gives the same result as extractor 1.0.0.
 * Mixed cells keep their runs so a reviewer can see what was read.
 */
function readFinding(cell) {
  const runs = runsOf(cell).map((r) => ({ ...r, text: r.text.replace(/ /g, ' ') }));
  const solid = runs.filter((r) => r.text.trim() !== '');
  const general = [];
  const rest = [];
  for (const r of solid) {
    if (GENERAL_COMMENT.test(r.text)) {
      general.push(r.text.replace(GENERAL_COMMENT, '').replace(/\)\s*$/, ''));
    } else {
      rest.push(r);
    }
  }
  // Whitespace-only runs carry no colour that matters but do carry the line
  // break between two runs, so the comment text keeps them.
  const comment = clean(runs.filter((r) => !GENERAL_COMMENT.test(r.text)).map((r) => r.text).join('')) || null;
  const generalComment = clean(general.join(' ')) || null;

  let status = null;
  let statusSource = 'inferred:text';
  const plain = runs.length === 1;
  if (plain) {
    const colour = runs[0].colour;
    if (STATUS_BY_COLOUR[colour]) { status = STATUS_BY_COLOUR[colour]; statusSource = `font:${colour}`; }
  } else {
    const colours = [...new Set(rest.map((r) => r.colour ?? 'none'))];
    if (rest.some((r) => roleOf(r.colour) === 'finding')) {
      status = 'non_compliant'; statusSource = `runs:${colours.join('+')}`;
    } else if (rest.length && rest.every((r) => roleOf(r.colour) === 'compliant')) {
      status = 'compliant'; statusSource = `runs:${colours.join('+')}`;
    }
  }
  if (!status) status = NA_PATTERN.test(comment ?? '') ? 'not_applicable' : comment || generalComment ? 'compliant' : 'pending';

  const mixed = new Set(solid.map((r) => roleOf(r.colour))).size > 1 || general.length > 0;
  return {
    status,
    statusSource,
    comment,
    ...(generalComment ? { generalComment } : {}),
    ...(mixed ? { runs: solid.map((r) => ({ text: clean(r.text), colour: r.colour ?? null, role: GENERAL_COMMENT.test(r.text) ? 'general_comment' : roleOf(r.colour) })) } : {}),
  };
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

  // Sheet-level nodes: everything on the sheet that is not an item. They say
  // the same thing on every client's copy, so they are template content, and
  // the app must reproduce each one in place.
  const meta = {
    title: clean(ws.getCell('A1').value) || ws.name,
    evidenceColumnLabel: clean(ws.getCell('F1').value) || null,
    banner: null,
    columnHeaders: ['A', 'B', 'C', 'D', 'E']
      .map((col) => clean(ws.getCell(`${col}${headerRow}`).value))
      .filter(Boolean),
    note: null,
    declaration: null,
    documentControl: null,
    scopeOfAuthorisation: null,
    reference: null,
    footer: null,
  };

  // A banner ABOVE the header row: a full-width merged row (A = B = C) between
  // the site block and the column headers.
  for (let r = headerRow - 1; r >= 1; r--) {
    const a = clean(ws.getCell(`A${r}`).value);
    const b = clean(ws.getCell(`B${r}`).value);
    const c = clean(ws.getCell(`C${r}`).value);
    if (a && a === b && b === c) { meta.banner = a; break; }
    if (a) break;
  }

  let section = null;
  let sectionOrdinal = 0;
  let itemOrdinal = 0;
  let skipRow = -1;
  let inDocControl = false;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    if (r === skipRow) continue;
    const a = clean(ws.getCell(`A${r}`).value);
    const b = clean(ws.getCell(`B${r}`).value);
    const c = clean(ws.getCell(`C${r}`).value);
    const d = clean(ws.getCell(`D${r}`).value);
    const e = clean(ws.getCell(`E${r}`).value);

    if (!a && !b && !c) {
      // Document control's last row can hold only the scope confirmation (E).
      if (inDocControl && meta.scopeOfAuthorisation && /^I can confirm/i.test(e)) {
        meta.scopeOfAuthorisation.confirmation = e;
        continue;
      }
      inDocControl = false;
      continue;
    }

    // Trailing blocks close the table.
    if (/^NB:/i.test(a)) { meta.note = a; trailing.note = a; continue; }
    // The declaration, with or without its "Declaration:" label (the class 5
    // sheet drops it). A merged row repeats it; keep the first.
    if (/^(Declaration:\s*)?I verify that I have examined/i.test(a)) {
      if (!meta.declaration) { meta.declaration = a; trailing.declaration = a; }
      continue;
    }
    if (/^Decision:/i.test(a)) { trailing.decision = a; continue; }
    if (/^Reference:/i.test(a)) {
      const ref = clean(ws.getCell(`A${r + 1}`).value) || null;
      meta.reference = ref;
      trailing.reference = ref;
      skipRow = r + 1; // the reference text is a full-width row; not a section
      continue;
    }
    if (/^Section\s+\d+\s*\/\s*\d+$/i.test(a)) { meta.footer = a; continue; }

    // Document Control (label/value pairs in A/B) sits beside the Scope of
    // Authorisation (text in D, confirmation in E) on the same rows.
    if (/^Document Control$/i.test(a)) {
      inDocControl = true;
      meta.documentControl = {};
      if (/^Scope( of Authorisation)?$/i.test(d)) {
        meta.scopeOfAuthorisation = { heading: d, text: null, confirmation: null };
      }
      continue;
    }
    if (inDocControl) {
      if (a && b && !c) meta.documentControl[a] = b.replace(/T00:00:00\.000Z$/, '');
      if (meta.scopeOfAuthorisation) {
        if (d && !meta.scopeOfAuthorisation.text) meta.scopeOfAuthorisation.text = d;
        if (/^I can confirm/i.test(e)) meta.scopeOfAuthorisation.confirmation = e;
      }
      continue;
    }

    if (isSectionRow(b, c)) {
      // A full-width row BELOW the header with no section before it, followed
      // immediately by another full-width row, is the sheet's banner
      // ("Requirements specific to class …"), not a section.
      if (!section && !meta.banner) {
        let nextIsSection = false;
        for (let rr = r + 1; rr <= Math.min(r + 3, ws.rowCount); rr++) {
          const nb = clean(ws.getCell(`B${rr}`).value);
          const nc = clean(ws.getCell(`C${rr}`).value);
          if (!nb && !nc) continue;
          nextIsSection = isSectionRow(nb, nc);
          break;
        }
        if (nextIsSection) { meta.banner = b; continue; }
      }
      sectionOrdinal += 1;
      // Two layouts: the general sheet keeps the number in A and the title in
      // B..E; the class sheets merge A..E and fold the number into the text
      // ("2 Separation of ..."). Never let a merged title leak into `number`.
      const folded = a === b ? b.match(/^(\d+)\s+/) : null;
      section = {
        ordinal: sectionOrdinal,
        number: folded ? folded[1] : a === b ? null : a || null,
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

    // Instance layer: the finding recorded against this item in this workbook,
    // read run by run (a cell can hold a red finding beside green text).
    const f = readFinding(ws.getCell(`E${r}`));
    findings.push({
      sectionOrdinal: section.ordinal,
      itemOrdinal,
      itemNumber: a || null,
      status: f.status,
      statusSource: f.statusSource,
      comment: f.comment,
      ...(f.generalComment ? { generalComment: f.generalComment } : {}),
      ...(f.runs ? { runs: f.runs } : {}),
      row: r,
    });
  }

  // ── Obvious source defects, corrected and logged ─────────────────────────
  // The workbook is hand-maintained. A handful of things in it are plainly
  // mechanical errors rather than content. Each is corrected here, once, at
  // extraction, and every correction is recorded in the template's provenance
  // so a reviewer can see exactly what was changed and why.
  const corrections = [];
  const fix = (where, from, to, reason) => {
    if (from !== to) corrections.push({ where, from, to, reason });
    return to;
  };

  meta.evidenceColumnLabel = meta.evidenceColumnLabel
    ? fix('F1', meta.evidenceColumnLabel,
          meta.evidenceColumnLabel.replace(/Portifolio/i, 'Portfolio'), 'spelling')
    : null;

  meta.title = fix('A1', meta.title,
    meta.title.replace(/\b(\w+)\s+\1\b/i, '$1'), 'duplicated word');

  if (meta.declaration) {
    if (!/^Declaration:/i.test(meta.declaration)) {
      meta.declaration = fix('Declaration', meta.declaration, `Declaration: ${meta.declaration}`,
        'the "Declaration:" label every other sheet carries was missing');
    }
    // "Regulation 112.17": the Regulations have no part 112; the leading digit is doubled.
    meta.declaration = fix('Declaration', meta.declaration,
      meta.declaration.replace(/Regulation\s+(\d)(\1\d)\.(\d+)/i, (m, _d, part, n) => `Regulation ${part}.${n}`),
      'regulation number with a doubled leading digit (no such part of the Regulations)');
    trailing.declaration = meta.declaration;
  }
  if (meta.scopeOfAuthorisation && /^Scope$/i.test(meta.scopeOfAuthorisation.heading ?? '')) {
    meta.scopeOfAuthorisation.heading = fix('Scope of Authorisation heading', meta.scopeOfAuthorisation.heading,
      'Scope of Authorisation', 'heading shortened in this sheet; named as on every other sheet');
  }

  // B5: every location sheet's scope text was copied from the class 6/8 sheet
  // ("classes 6 or 8 … Regulation 13.38"). It names this sheet's own classes,
  // and the regulation this sheet's own declaration cites.
  const declReg = meta.declaration?.match(/Regulation\s+([\d.]+)/i)?.[1] ?? null;
  const classPhrase = /class\s+2\s+and\s+3\.1/i.test(meta.title) ? 'classes 2 or 3.1'
    : /class\s+5\.1\.1/i.test(meta.title) ? 'classes 5.1.1 or 5.1.2'
    : /6\.1A|class(es)?\s+6/i.test(meta.title) ? 'classes 6 or 8' : null;
  if (meta.scopeOfAuthorisation?.text && classPhrase && declReg) {
    const t = meta.scopeOfAuthorisation.text;
    const fixed = t
      .replace(/classes\s+6\s+or\s+8/i, classPhrase)
      .replace(/Regulation\s+[\d.]+/i, `Regulation ${declReg}`);
    meta.scopeOfAuthorisation.text = fix('Scope of Authorisation', t, fixed,
      'scope text copied from the class 6/8 sheet; class and regulation aligned to this sheet’s own declaration');
  }

  // A full-width row holding nothing but a number, after the last item, is a
  // stray cell (the class 5 general sheet has "8" under the NB note).
  for (let k = sections.length - 1; k >= 0; k--) {
    const s = sections[k];
    if (s.items.length || !/^\d+$/.test(s.title)) break;
    corrections.push({ where: `section ${s.ordinal}`, from: s.title, to: null,
      reason: 'a lone number in a full-width row after the last item; not a section' });
    sections.splice(k, 1);
  }

  // One requirement split across two rows that carry the same number, the
  // first ending mid-sentence ("… present and"). Merged into one item; the
  // second row's line breaks become sentence breaks.
  for (const s of sections) {
    for (let k = 0; k + 1 < s.items.length; k++) {
      const i = s.items[k];
      const nxt = s.items[k + 1];
      if (!(i.number && i.number === nxt.number && /\band$/i.test(i.action))) continue;
      // The second row is a list of instructions, one per line, without full
      // stops: a stop goes before each instruction verb that starts a new one.
      const tail = (nxt.action.charAt(0).toLowerCase() + nxt.action.slice(1))
        .replace(/([^.;:])\s+(?=(?:Determine|Confirm|Verify|Establish|Ascertain|Review|Check)\b)/g, '$1. ');
      const merged = `${i.action} ${tail}`;
      corrections.push({ where: `${s.title}, items ${i.number} and ${nxt.number}`,
        from: `${i.action} | ${nxt.action}`, to: merged,
        reason: 'one requirement split across two rows in the workbook, both numbered ' + i.number + '; merged, references combined' });
      i.action = merged;
      i.regulationRefs = [...new Set([...i.regulationRefs, ...parseRegulations(nxt.regulationRaw).refs])];
      i._mergedRefs = i.regulationRefs;
      i.records = i.records === nxt.records ? i.records : clean(`${i.records} ${nxt.records}`);
      i.evidenceRequired = i.evidenceRequired || nxt.evidenceRequired;
      s.items.splice(k + 1, 1);
      // The instance follows: the second row's comment joins the first's.
      const fi = findings.findIndex((f) => f.sectionOrdinal === s.ordinal && f.itemOrdinal === k + 1);
      const fn = findings[fi + 1];
      if (fi >= 0 && fn) {
        const f = findings[fi];
        f.comment = [...new Set([f.comment, fn.comment].filter(Boolean))].join(' ') || null;
        if (fn.status === 'non_compliant' || f.status === 'pending') { f.status = fn.status; f.statusSource = fn.statusSource; }
        findings.splice(fi + 1, 1);
        for (const g of findings) if (g.sectionOrdinal === s.ordinal && g.itemOrdinal > k + 1) g.itemOrdinal -= 1;
      }
      s.items.forEach((it, x) => { it.ordinal = x + 1; });
      k -= 1;
    }
  }

  for (const s of sections) {
    const isErp = /emergency response/i.test(s.title);
    for (const i of s.items) {
      if (i.regulationRaw?.includes('©')) {
        i.regulationRaw = fix(`section ${s.ordinal} item ${i.ordinal} regulation`, i.regulationRaw,
          i.regulationRaw.replace(/\s*©/g, '(c)'), 'copyright symbol autocorrected from "(c)"');
      }
      for (const field of ['action', 'records']) {
        if (/—\(/.test(i[field])) {
          i[field] = fix(`section ${s.ordinal} item ${i.ordinal} ${field}`, i[field],
            i[field].replace(/—\(/g, '— ('), 'missing space after a dash before a list marker, as written everywhere else in the Performance Standard text');
        }
      }
      if (i.regulationRaw?.includes('€')) {
        i.regulationRaw = fix(`section ${s.ordinal} item ${i.ordinal} regulation`, i.regulationRaw,
          i.regulationRaw.replace(/\s*€/g, '(e)'), 'euro sign autocorrected from "(e)"');
      }
      if (i.regulationRaw && /\)\)/.test(i.regulationRaw)) {
        i.regulationRaw = fix(`section ${s.ordinal} item ${i.ordinal} regulation`, i.regulationRaw,
          i.regulationRaw.replace(/\)\)+/g, ')'), 'unbalanced closing parenthesis');
      }
      if (isErp && i.regulationRaw === '5.1') {
        i.regulationRaw = fix(`section ${s.ordinal} item ${i.ordinal} regulation`, '5.1', '5.10',
          'sits between 5.9 and 5.11; Excel dropped the trailing zero');
      }
      const { refs, url } = parseRegulations(i.regulationRaw);
      i.regulationRefs = i._mergedRefs ? [...new Set([...refs, ...i._mergedRefs])] : refs;
      delete i._mergedRefs;
      i.guidanceUrl = url;
      if (i.number === null) {
        i.number = fix(`section ${s.ordinal} item ${i.ordinal} number`, null, String(i.ordinal),
          'item carried no number in the source; numbered by position');
      }
    }
  }

  return {
    sheet: ws.name,
    title: meta.title,
    meta,
    corrections,
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
      // Every deviation from the source workbook, with its reason. Empty means
      // the template is verbatim.
      corrections: extract.corrections ?? [],
    },
    // Everything on the sheet that is not an item, reproduced in place by the app.
    sheet: extract.meta,
    sections: extract.sections,
  };
}

export { extractSheet, buildTemplate, extractSiteBlock };

// ── CLI ────────────────────────────────────────────────────────────────────
// Runs only when invoked directly; import-job.mjs imports the functions.
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
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

// Two passes: extract every check sheet first, so the footer ("Section n/N")
// can be computed from how many check sheets the workbook actually holds.
// The source says "Section 1/1" on sheet 1 of 2 — an obvious slip, corrected
// and logged like every other one.
const extracts = [];
for (const ws of wb.worksheets) {
  const extract = extractSheet(ws, basename(file));
  if (!extract) {
    console.log(`  skip  "${ws.name}" (no Item/Regulation/Action header row)`);
    continue;
  }
  extracts.push({ ws, extract });
}
extracts.forEach(({ extract }, idx) => {
  const want = `Section ${idx + 1}/${extracts.length}`;
  if (extract.meta.footer !== want) {
    extract.corrections.push({ where: 'footer', from: extract.meta.footer, to: want,
      reason: `sheet ${idx + 1} of ${extracts.length} in this workbook` });
    extract.meta.footer = want;
  }
});

for (const { ws, extract } of extracts) {
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
  for (const c of extract.corrections) {
    console.log(`        corrected ${c.where}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)} — ${c.reason}`);
  }
  results.push({ slug, sections: extract.sections.length, items });
}

if (!results.length) {
  console.error('no check sheet found in workbook');
  process.exit(2);
}
}
