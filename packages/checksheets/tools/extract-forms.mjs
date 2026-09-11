#!/usr/bin/env node
/**
 * Extract Bryan's form-shaped check sheets into canonical templates.
 *
 *   node tools/extract-forms.mjs <folder-with-xlsx> [--out data]
 *
 * Three shapes, three kinds:
 *   handler   Handler Assessment Checksheet (certified handler, class 6):
 *             applicant block, Performance Standard clause rows, declaration.
 *   cylinder  Cylinder Importation (FERN fire extinguishers) and UNRTDG
 *             cylinder importation: PCBU block, a per-cylinder-batch block,
 *             check rows, and a certificate.
 *
 * TEMPLATE ONLY. The workbooks Bryan sent are filled in with real people and
 * companies. This tool reads column A (labels), the requirement column and
 * the certificate wording, and discards every value column. No instance JSON
 * is written, nothing personal reaches the repository.
 *
 * Obvious spelling slips in labels are corrected and logged, as the location
 * extractor does; requirement wording is kept as written.
 */

import ExcelJS from 'exceljs';
import { mkdirSync, readdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { pathToFileURL } from 'url';

const EXTRACTOR_VERSION = 'forms-1';

const text = (cell) => {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if (v.result != null) return String(v.result).trim();
    if (v.text) return String(v.text).trim();
    return '';
  }
  return String(v).replace(/\s+/g, ' ').trim();
};
const cellA = (ws, r) => text(ws.getCell(`A${r}`));
const cellB = (ws, r) => text(ws.getCell(`B${r}`));

/** Spelling slips in labels: corrected, and every correction logged. */
const SPELLING = [
  [/Perfomance/g, 'Performance'],
  [/Detaills/g, 'Details'],
  [/thckness/g, 'thickness'],
  [/Celcius/g, 'Celsius'],
  [/Povisions/g, 'Provisions'],
  [/assement/g, 'assessment'],
  [/phyiscal/g, 'physical'],
];
function fix(corrections, where, s) {
  let out = s;
  for (const [re, to] of SPELLING) {
    if (re.test(out)) {
      const from = out;
      out = out.replace(re, to);
      corrections.push({ where, from, to: out, reason: 'spelling' });
    }
  }
  return out;
}

const stripColon = (s) => s.replace(/:\s*$/, '');

// ── handler assessment ─────────────────────────────────────────────────────

function extractHandler(ws, workbook) {
  const corrections = [];
  const title = cellA(ws, 1);
  const documentControl = {};
  for (let r = 3; r <= 5; r++) {
    const k = cellA(ws, r);
    if (k) documentControl[k] = cellB(ws, r);
  }
  // Applicant details: labels only, in order. Row 16 carries the application
  // type with its three options across C..E.
  const subjectBlock = [];
  for (let r = 8; r <= 16; r++) {
    const k = cellA(ws, r);
    if (!k) continue;
    if (/Application type/i.test(k)) {
      subjectBlock.push({ label: k, options: ['C', 'D', 'E'].map((c) => text(ws.getCell(`${c}${r}`))).filter(Boolean) });
    } else {
      subjectBlock.push({ label: k });
    }
  }
  subjectBlock.push({ label: cellA(ws, 18) }); // Scope of Certification
  for (let r = 20; r <= 23; r++) {
    const k = cellA(ws, r);
    if (k) subjectBlock.push({ label: k });
  }
  const columnHeaders = ['A', 'B', 'D'].map((c) => fix(corrections, `header ${c}25`, text(ws.getCell(`${c}25`))));

  // Rows 26..65: clause ref in A (may be blank for sub-points), requirement in B.
  // Sections follow the leading clause number of the Performance Standard.
  const sectionsByNo = new Map();
  let current = null;
  let ordinal = 0;
  for (let r = 26; r <= 66; r++) {
    const ref = cellA(ws, r);
    const req = fix(corrections, `B${r}`, cellB(ws, r));
    if (!req) continue;
    const lead = ref.match(/^(\d+)/)?.[1];
    if (lead) current = lead;
    if (!current) continue;
    if (!sectionsByNo.has(current)) {
      sectionsByNo.set(current, {
        ordinal: sectionsByNo.size + 1,
        number: current,
        title: `Performance Standard clause ${current}`,
        items: [],
      });
      corrections.push({ where: `section ${current}`, from: null, to: `Performance Standard clause ${current}`,
        reason: 'the workbook has no section rows; grouped by the leading clause number' });
    }
    const sec = sectionsByNo.get(current);
    sec.items.push({
      ordinal: ++ordinal,
      number: ref || null,
      regulationRefs: [],
      regulationRaw: ref || null,
      guidanceUrl: null,
      action: req,
      records: '',
      evidenceRequired: false,
    });
    ordinal = sec.items.length; // ordinals restart per section
  }
  const sections = [...sectionsByNo.values()];
  // Re-number item ordinals within each section.
  for (const s of sections) s.items.forEach((it, i) => (it.ordinal = i + 1));

  const declaration = cellA(ws, 68) || null;
  return {
    kind: 'handler',
    title,
    sheet: ws.name,
    meta: {
      kind: 'handler',
      title,
      columnHeaders,
      subjectBlockTitle: cellA(ws, 7),
      subjectBlock,
      unitBlock: null,
      declaration,
      documentControl,
      note: null,
      footer: null,
    },
    sections,
    corrections,
    workbook,
  };
}

function extractHandlerCertificate(ws) {
  const labels = [];
  for (let r = 3; r <= 10; r++) {
    for (const c of ['A', 'E']) {
      const k = text(ws.getCell(`${c}${r}`));
      if (k && /:$/.test(k)) labels.push(stripColon(k));
    }
  }
  return {
    documentTitle: text(ws.getCell('A1')),
    certifiesThat: text(ws.getCell('A2')),
    fields: labels,
    tables: [{ title: text(ws.getCell('A11')), columns: ['A', 'E', 'G'].map((c) => text(ws.getCell(`${c}12`))).filter(Boolean) }],
    scopeHeading: text(ws.getCell('A15')),
    scopeText: text(ws.getCell('A17')),
    dateLabels: ['A', 'E', 'H'].map((c) => stripColon(text(ws.getCell(`${c}30`)))).filter(Boolean),
    signature: [text(ws.getCell('A39')), text(ws.getCell('A40')), text(ws.getCell('A41'))].filter(Boolean),
    issuerStatement: text(ws.getCell('A42')),
  };
}

// ── cylinder importation (FERN) and UNRTDG ─────────────────────────────────

function extractCylinder(ws, workbook, { unitRows, itemRows, photoRow }) {
  const corrections = [];
  const title = [cellA(ws, 1), cellA(ws, 2)].filter(Boolean).join(' — ');
  const subjectBlockTitle = fix(corrections, 'A3', cellA(ws, 3));
  const subjectBlock = [];
  for (let r = 4; r <= 10; r++) {
    for (const c of ['A', 'E', 'F']) {
      const k = text(ws.getCell(`${c}${r}`));
      if (k && /:$|Number$/.test(k) && !subjectBlock.some((x) => x.label === stripColon(k))) subjectBlock.push({ label: stripColon(k) });
    }
  }
  const unitBlock = [];
  for (let r = unitRows[0]; r <= unitRows[1]; r++) {
    const k = fix(corrections, `A${r}`, cellA(ws, r));
    if (k) unitBlock.push({ label: stripColon(k) });
  }
  const items = [];
  const photo = cellA(ws, photoRow);
  if (photo) {
    items.push({ ordinal: 1, number: null, regulationRefs: [], regulationRaw: null, guidanceUrl: null,
      action: photo, records: 'Photographs', evidenceRequired: true });
  }
  for (let r = itemRows[0]; r <= itemRows[1]; r++) {
    const a = fix(corrections, `A${r}`, cellA(ws, r));
    if (!a) continue;
    const b = cellB(ws, r);
    // Column B on the "Manufacturing certificate" row is the record the
    // sheet asks for ("Issuing agency : Date of Issue:"); on other rows it is
    // a filled-in value and is discarded.
    const records = /Issuing agency/i.test(b) ? b : '';
    items.push({ ordinal: items.length + 1, number: null, regulationRefs: [], regulationRaw: null, guidanceUrl: null,
      action: a, records, evidenceRequired: /photo|visual/i.test(a) });
  }
  return {
    kind: 'cylinder',
    title,
    sheet: ws.name,
    meta: {
      kind: 'cylinder',
      title,
      columnHeaders: ['Item', 'Check', 'Records', 'Comments', 'Evidence'],
      subjectBlockTitle,
      subjectBlock,
      unitBlockTitle: 'Cylinder Details',
      unitBlock,
      declaration: null,
      documentControl: null,
      note: null,
      footer: null,
    },
    sections: [{ ordinal: 1, number: null, title: cellA(ws, 2) || 'Checklist', items }],
    corrections,
    workbook,
  };
}

function extractCylinderCertificate(ws, { unitRows, dateRow, signRows }) {
  const fields = [];
  for (let r = 3; r <= 10; r++) {
    for (const c of ['A', 'E']) {
      const k = text(ws.getCell(`${c}${r}`));
      if (k && /:$|Number$/.test(k)) fields.push(stripColon(k));
    }
  }
  const unitFields = [];
  for (let r = unitRows[0]; r <= unitRows[1]; r++) {
    const k = cellA(ws, r);
    if (k) unitFields.push(stripColon(k));
  }
  return {
    documentTitle: text(ws.getCell('A1')),
    certifiesThat: text(ws.getCell('A2')),
    fields,
    unitTitle: stripColon(cellA(ws, unitRows[0] - 1)),
    unitFields,
    dateLabels: ['A', 'E'].map((c) => stripColon(text(ws.getCell(`${c}${dateRow}`)))).filter(Boolean),
    signature: signRows.map((r) => cellA(ws, r)).filter(Boolean),
  };
}

// ── template ───────────────────────────────────────────────────────────────

function buildTemplate(extract, code, { authorisation, psReference, certificate }) {
  return {
    code,
    title: extract.title,
    psReference,
    classScope: [],
    revision: 1,
    effectiveFrom: null,
    supersededBy: null,
    status: 'draft',
    source: {
      workbook: extract.workbook,
      sheet: extract.sheet,
      extractedAt: new Date().toISOString(),
      extractorVersion: EXTRACTOR_VERSION,
      corrections: extract.corrections,
      note: 'Template only: the workbook values (people, companies, cylinders) were not extracted.',
    },
    sheet: { ...extract.meta, authorisation, certificate },
    sections: extract.sections,
  };
}

export { extractHandler, extractCylinder, extractHandlerCertificate, extractCylinderCertificate, buildTemplate };

// ── CLI ────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const outDir = args[args.indexOf('--out') + 1] || 'data';
  if (!dir) { console.error('usage: extract-forms.mjs <folder> [--out data]'); process.exit(1); }
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(dir).filter((f) => /\.xlsx$/i.test(f));
  const find = (re) => files.find((f) => re.test(f));
  const load = async (f) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(join(dir, f)); return wb; };
  const write = (t) => {
    writeFileSync(join(outDir, `${t.code}.template.json`), JSON.stringify(t, null, 2));
    const items = t.sections.reduce((n, s) => n + s.items.length, 0);
    console.log(`  ${t.code}: ${t.sections.length} section(s), ${items} items, ${t.sheet.subjectBlock.length} subject labels` +
      (t.sheet.unitBlock ? `, ${t.sheet.unitBlock.length} unit labels` : '') + `, ${t.source.corrections.length} corrections`);
  };

  const hf = find(/Assessment Checksheet/i);
  if (hf) {
    const wb = await load(hf);
    const ex = extractHandler(wb.getWorksheet('Checksheet'), basename(hf));
    const cert = extractHandlerCertificate(wb.getWorksheet('Certificate'));
    write(buildTemplate(ex, 'ch-class-6-handler-assessment', {
      authorisation: 'handler-class-6',
      psReference: 'Health and Safety at Work (Hazardous Substances—Certified Handler Compliance Certification) Performance Standard',
      certificate: cert,
    }));
  }
  const ff = find(/FERN/i);
  if (ff) {
    const wb = await load(ff);
    const ex = extractCylinder(wb.getWorksheet('Checklist'), basename(ff), { unitRows: [23, 38], itemRows: [39, 43], photoRow: 12 });
    const cert = extractCylinderCertificate(wb.getWorksheet('Compliance Certificate'), { unitRows: [13, 22], dateRow: 24, signRows: [33, 34, 35] });
    write(buildTemplate(ex, 'ci-cylinder-importation-fern', {
      authorisation: 'cylinder-importation',
      psReference: 'Health and Safety at Work (Hazardous Substances) Regulations 2017, regulation 15.16',
      certificate: cert,
    }));
  }
  const uf = find(/UNRTDG/i);
  if (uf) {
    const wb = await load(uf);
    const ex = extractCylinder(wb.getWorksheet('Checklist'), basename(uf), { unitRows: [23, 33], itemRows: [35, 39], photoRow: 12 });
    const cert = extractCylinderCertificate(wb.getWorksheet('Compliance Certificate'), { unitRows: [13, 23], dateRow: 25, signRows: [34, 35, 36] });
    write(buildTemplate(ex, 'ci-unrtdg-cylinder-importation', {
      authorisation: 'cylinder-importation-un',
      psReference: 'Health and Safety at Work (Hazardous Substances) Regulations 2017, regulation 15.3(3)',
      certificate: cert,
    }));
  }
}
