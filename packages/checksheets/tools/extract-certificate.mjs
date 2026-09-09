#!/usr/bin/env node
/**
 * Extract the "Certificate" sheet into the canonical certificate model, and
 * validate it against the fields IPS 2019 cl. 8(1) makes mandatory.
 *
 * The sheet is a document layout, not a check sheet, so it needs its own
 * reader. Cells are located by their LABEL rather than by row number — the
 * layout is hand-maintained in Excel and will shift, and a hard-coded
 * "certifier name is B25" silently produces a wrong certificate the first time
 * someone inserts a row.
 *
 * Usage:
 *   node tools/extract-certificate.mjs <workbook.xlsx> --out <dir>
 */

import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const require2 = createRequire(new URL('../package.json', import.meta.url));
const ExcelJS = require2('exceljs');

const text = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return '';
  }
  return String(v);
};
const clean = (v) => text(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Find the first cell whose text starts with `label`; return its address. */
function findLabel(ws, label) {
  const want = label.toLowerCase();
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = clean(ws.getCell(r, c).value).toLowerCase();
      if (v.startsWith(want)) return { row: r, col: c };
    }
  }
  return null;
}

/** Value to the RIGHT of a label, skipping cells merged into the label itself. */
function valueRight(ws, label) {
  const at = findLabel(ws, label);
  if (!at) return null;
  const labelCell = ws.getCell(at.row, at.col);
  const labelMaster = labelCell.isMerged ? labelCell.master.address : labelCell.address;
  for (let c = at.col + 1; c <= ws.columnCount; c++) {
    const cell = ws.getCell(at.row, c);
    if (cell.isMerged && cell.master.address === labelMaster) continue;
    const v = clean(cell.value);
    if (v) return v;
  }
  return null;
}

/** Value in the row BELOW a label, same column (used for PCBU / Location Address). */
function valueBelow(ws, label) {
  const at = findLabel(ws, label);
  if (!at) return null;
  for (let r = at.row + 1; r <= Math.min(at.row + 3, ws.rowCount); r++) {
    const v = clean(ws.getCell(r, at.col).value);
    if (v) return v;
  }
  return null;
}

/** Text of the labelled cell itself, with the label stripped off the front. */
function valueInline(ws, label) {
  const at = findLabel(ws, label);
  if (!at) return null;
  const v = clean(ws.getCell(at.row, at.col).value);
  return v.slice(label.length).replace(/^[:\s]+/, '').trim() || null;
}

function extractSubstances(ws) {
  const at = findLabel(ws, 'Substance Name/Location');
  if (!at) return [];
  const classCol = findLabel(ws, 'Class(es)')?.col ?? at.col + 2;
  const qtyCol = findLabel(ws, 'Maximum Quantity')?.col ?? at.col + 3;

  const rows = [];
  for (let r = at.row + 1; r <= ws.rowCount; r++) {
    const name = clean(ws.getCell(r, at.col).value);
    const hazardClass = clean(ws.getCell(r, classCol).value);
    const maxQuantity = clean(ws.getCell(r, qtyCol).value);
    if (!name && !hazardClass && !maxQuantity) {
      if (rows.length) break; // table ended
      continue;               // spacer before the first row
    }
    if (!name) continue;
    rows.push({ name, hazardClass, maxQuantity });
  }
  return rows;
}

/** "Worksafe Authorised Compliance Certifier (TST100250)" → TST100250 */
function extractAuthorisationNumber(ws) {
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = clean(ws.getCell(r, c).value);
      const m = v.match(/compliance certifier\s*\(([^)]+)\)/i);
      if (m) return m[1].trim();
    }
  }
  return null;
}

function extractCertifierName(ws) {
  const authAt = findLabel(ws, 'Worksafe Authorised Compliance Certifier');
  if (!authAt) return { fullName: null, postNominals: null };
  // The certifier's name sits immediately above the authorisation line.
  for (let r = authAt.row - 1; r >= Math.max(1, authAt.row - 3); r--) {
    const v = clean(ws.getCell(r, authAt.col).value);
    if (!v || /^signature/i.test(v)) continue;
    const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    return m ? { fullName: m[1].trim(), postNominals: m[2].trim() } : { fullName: v, postNominals: null };
  }
  return { fullName: null, postNominals: null };
}

function toIsoDate(v) {
  if (!v) return null;
  const s = clean(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const d = new Date(s);
  return isNaN(d) ? s : d.toISOString().slice(0, 10);
}

function addYears(isoDate, years) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00Z');
  if (isNaN(d)) return null;
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// ── validation against IPS cl. 8(1) ────────────────────────────────────────
function validate(cert) {
  const problems = [];
  const req = (path, value, clause) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length))
      problems.push({ severity: 'error', clause, message: `${path} is missing` });
  };

  req('certifier.fullName', cert.certifier.fullName, 'IPS 8(1)(a)');
  req('certifier.authorisationNumber', cert.certifier.authorisationNumber, 'IPS 8(1)(b)');
  req('documentTitle', cert.documentTitle, 'IPS 8(1)(d)');
  req('issueDate', cert.issueDate, 'IPS 8(1)(e)');
  req('issuedTo.name', cert.issuedTo.name, 'IPS 8(1)(f)');
  req('location.address', cert.location.address, 'IPS 8(1)(g)');
  req('inForceDate', cert.inForceDate, 'IPS 8(1)(h)');
  req('certifier.signatureImage', cert.certifier.signatureImage, 'IPS 8(2)(a)');

  // 8(1)(c): either a register number, or a self-assigned number PREFIXED with
  // the authorisation number, or both.
  const auth = cert.certifier.authorisationNumber;
  if (!cert.registerNumber && !cert.certificateNumber) {
    problems.push({ severity: 'error', clause: 'IPS 8(1)(c)', message: 'neither a register number nor a certificate number is present' });
  } else if (cert.certificateNumber && auth && !cert.certificateNumber.startsWith(auth)) {
    problems.push({
      severity: 'warning',
      clause: 'IPS 8(1)(c)(ii)',
      message:
        `certificateNumber "${cert.certificateNumber}" is not prefixed with the authorisation number "${auth}". ` +
        `This is compliant ONLY if it is the unique register number under 8(1)(c)(i) — confirm which it is.`,
    });
  }

  if (!cert.expiryDate) {
    problems.push({ severity: 'warning', clause: 'IPS 8(1)(i)', message: 'no expiry date ("if applicable" — confirm this is intended)' });
  } else if (cert.issueDate) {
    const maxExpiry = addYears(cert.issueDate, 3);
    if (cert.expiryDate > maxExpiry)
      problems.push({ severity: 'warning', clause: 'WorkSafe guidance', message: `expiry ${cert.expiryDate} exceeds 3 years from issue (${maxExpiry})` });
  }

  if (!/regulation 6\.8/.test(cert.issuerStatement || ''))
    problems.push({ severity: 'error', clause: 'IPS 8(4)', message: 'issuer statement does not cite regulation 6.8' });

  if (cert.decision === 'conditional' && !cert.conditions.length)
    problems.push({ severity: 'error', clause: 'reg 6.24', message: 'conditional certificate with no conditions recorded' });

  return problems;
}

// ── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.';
if (!file) {
  console.error('usage: extract-certificate.mjs <workbook.xlsx> --out <dir>');
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.getWorksheet('Certificate');
if (!ws) {
  console.error('no "Certificate" sheet in this workbook');
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });

// signature image
let signatureImage = null;
const images = ws.getImages();
if (images.length) {
  const img = images[0];
  const media = wb.model.media.find((m) => m.index === img.imageId);
  if (media?.buffer) {
    signatureImage = `signature.${media.extension}`;
    writeFileSync(join(outDir, signatureImage), media.buffer);
  }
}

const { fullName, postNominals } = extractCertifierName(ws);
const issueDate = toIsoDate(valueRight(ws, 'Date Issued'));
const expiryDate = toIsoDate(valueRight(ws, 'Expiry Date'));
const notMet = valueInline(ws, 'Location Requirements Not Met');

const certificate = {
  documentTitle: 'COMPLIANCE CERTIFICATE Location',
  issuedUnder: clean(ws.getCell('B2').value).replace(/^COMPLIANCE CERTIFICATE Location\s*/i, ''),
  certifiesThat: clean(ws.getCell('B3').value),

  certificateNumber: valueRight(ws, 'CC Certificate Number') || null,
  registerNumber: valueRight(ws, 'Certificate Number') || null,

  certifier: {
    fullName,
    postNominals,
    authorisationNumber: extractAuthorisationNumber(ws),
    email: (() => {
      for (let r = 1; r <= ws.rowCount; r++) {
        const v = clean(ws.getCell(r, 2).value);
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
      }
      return null;
    })(),
    signatureImage,
  },

  issuedTo: (() => {
    const raw = valueRight(ws, 'Issued to') || '';
    const email = raw.match(/[^\s]+@[^\s]+/)?.[0] ?? null;
    const phone = raw.match(/\+?\d[\d\s()-]{6,}\d/)?.[0]?.trim() ?? null;
    let name = raw;
    if (email) name = name.replace(email, '');
    if (phone) name = name.replace(phone, '');
    return { name: name.trim() || raw, phone, email };
  })(),

  pcbu: (() => {
    // The cell packs three facts into one string:
    //   "<legal name> <postal address> NZBN: <nzbn>"
    // Split them apart so the renderer doesn't print the legal name twice.
    const raw = valueBelow(ws, 'PCBU') || '';
    const nzbn = raw.match(/NZBN:\s*([0-9]+)/i)?.[1] ?? null;
    const withoutNzbn = raw.replace(/\s*NZBN:\s*[0-9]+\s*/i, ' ').trim();
    const legalName = withoutNzbn.split(/\s(?=PO Box|P\.O\.\s*Box|Level\b|Unit\b|\d+\s)/i)[0]?.trim() || withoutNzbn;
    const postalAddress = withoutNzbn.slice(legalName.length).trim().replace(/^[,\s]+/, '') || null;
    return { legalName, postalAddress, nzbn };
  })(),

  location: (() => {
    const raw = valueBelow(ws, 'Location Address') || '';
    const companyNumber = raw.match(/Company number:\s*([0-9]+)/i)?.[1] ?? null;
    return {
      address: raw.replace(/Company number:\s*[0-9]+/i, '').replace(/[\s,]+$/, '').trim(),
      companyNumber,
      siteDetails: valueRight(ws, 'Site Details'),
    };
  })(),

  substances: extractSubstances(ws),

  detailsOfCertification: valueInline(ws, 'Details of Certification'),
  requirementsNotMet: !notMet || /^none$/i.test(notMet) ? [] : [notMet],
  conditions: [],
  decision: 'granted',

  issueDate,
  inForceDate: toIsoDate(valueRight(ws, 'Date comes into force')) || issueDate,
  expiryDate,

  issuerStatement: clean(ws.getCell(`B${ws.rowCount}`).value),
  retainUntil: addYears(expiryDate, 5), // IPS 21(6)
};

writeFileSync(join(outDir, 'certificate.json'), JSON.stringify(certificate, null, 2) + '\n');

// ── report ────────────────────────────────────────────────────────────────
console.log(`extracted certificate → ${join(outDir, 'certificate.json')}`);
console.log(`  certifier    : ${certificate.certifier.fullName} (${certificate.certifier.authorisationNumber})`);
console.log(`  numbers      : register=${certificate.registerNumber}  certificate=${certificate.certificateNumber}`);
console.log(`  PCBU         : ${certificate.pcbu.legalName}  NZBN ${certificate.pcbu.nzbn}`);
console.log(`  location     : ${certificate.location.address}`);
console.log(`  substances   : ${certificate.substances.length}`);
for (const s of certificate.substances) console.log(`                 ${s.name} — ${s.hazardClass} — ${s.maxQuantity}`);
console.log(`  dates        : issued ${certificate.issueDate} · in force ${certificate.inForceDate} · expires ${certificate.expiryDate}`);
console.log(`  retain until : ${certificate.retainUntil}   (IPS 21(6): expiry + 5 years)`);
console.log(`  signature    : ${signatureImage ?? '(none found)'}`);

const problems = validate(certificate);
console.log('');
if (!problems.length) {
  console.log('IPS cl. 8 validation: OK — every mandatory field present.');
} else {
  const errors = problems.filter((p) => p.severity === 'error');
  console.log(`IPS cl. 8 validation: ${errors.length} error(s), ${problems.length - errors.length} warning(s)`);
  for (const p of problems) console.log(`  [${p.severity.toUpperCase()}] ${p.clause}: ${p.message}`);
  if (errors.length) process.exitCode = 3;
}
