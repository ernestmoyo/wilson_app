/**
 * Certificates for the form-shaped sheets (certified handler, cylinder
 * importation), rendered from the wording the template carries and the
 * job's subject and units. The location certificate keeps its own renderer;
 * this one is the workbook's Certificate tab as a grid: title, certifies
 * line, register/certificate numbers, the subject's fields, a table with
 * one column per unit (as the workbook lays cylinders across columns), the
 * scope text, dates, and the certifier's block.
 */

import { COMPANY, contactBlock, nzDate } from './render-certificate.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nl = (s) => esc(s).replace(/\n/g, '<br>');
// Dates print as dd/mm/yyyy like the location certificate; a date column
// arrives as text (see db.mjs), so no timezone can shift it.
const d = (v) => nzDate(v);

// The Certificate tab words its unit labels more tersely than the checklist
// ("Water Capacity" for "Water Capacity (L)", "Charging Pressure" for
// "Charging Pressure at 15 degrees Celsius (Permanent Gas)", "Model" for
// "Model Number", "Manufacturer" for "Name of Manufacturer"), and the UN
// workbook's tab says "FERN" where its checklist says "Batch/Serial Number".
// Match exactly first, then by alias, then by the normalised label being
// contained in a checklist label.
const UNIT_ALIASES = { 'FERN': ['Batch/Serial Number'], 'Batch/Serial Number': ['FERN'], 'Manufacturer': ['Name of Manufacturer'], 'Model': ['Model Number'] };
const norm = (x) => String(x).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
function unitValue(fields, label) {
  if (fields[label] != null && fields[label] !== '') return fields[label];
  for (const alt of UNIT_ALIASES[label] ?? []) if (fields[alt]) return fields[alt];
  const want = norm(label);
  if (!want) return '';
  const keys = Object.keys(fields);
  const exact = keys.find((k) => norm(k) === want);
  if (exact) return fields[exact];
  const within = keys.find((k) => norm(k).startsWith(want));
  return within ? fields[within] : '';
}

/**
 * @param {object} p
 * @param {object} p.certificateTemplate  template.sheet.certificate (documentTitle, certifiesThat, fields, unitTitle, unitFields, tables, scopeHeading, scopeText, dateLabels, signature, issuerStatement)
 * @param {object} p.subject              label → value, as recorded on the sheet
 * @param {object[]} p.units              [{ ordinal, fields: label → value }]
 * @param {object[]} p.substances         the job's substance rows (name, hazard_class), for a Substances table
 * @param {object} p.cert                 the certificate row (register_number, certificate_number, decision, issue_date, in_force_date, expiry_date, conditions, requirements_not_met)
 * @param {object} p.certifier            { fullName, authorisationNumber, email }
 * @param {object} [p.letterhead]
 */
export function renderFormCertificate({ certificateTemplate: t, subject = {}, units = [], substances = [], cert, certifier, letterhead = null }) {
  const head = letterhead
    ? `<div class="letterhead">
      ${letterhead.logo ? `<img class="lh-logo" src="${letterhead.logo}" alt="Assure Safety">` : '<span></span>'}
      ${contactBlock()}
    </div>`
    : '';
  const foot = letterhead?.ribbon ? `<img class="lh-ribbon" src="${letterhead.ribbon}" alt="">` : '';

  // The numbers come from the certificate row; everything else from the subject.
  // The certificate tab words some labels differently from the check sheet
  // ('Full Name' for 'Name', 'Date of Birth' for 'DOB'); read the sheet's value.
  const ALIASES = { 'Full Name': ['Name', 'Full Name of PCBU'], 'Company/Legal Entity': ['Company'], 'Date of Birth': ['DOB'], 'Postal Address': ['Address'] };
  const valueFor = (label) => {
    if (/register number/i.test(label)) return cert.register_number ?? '';
    if (/certificate number/i.test(label)) return cert.certificate_number ?? '';
    if (subject[label] != null && subject[label] !== '') return subject[label];
    for (const alt of ALIASES[label] ?? []) if (subject[alt]) return subject[alt];
    if (/^(Full )?Name$/i.test(label)) return cert.issued_to ?? '';
    return '';
  };
  const fieldRows = (t.fields ?? []).map((f) => `<div class="k">${esc(f)}</div><div>${nl(valueFor(f))}</div>`).join('');

  let unitTable = '';
  if (t.unitFields?.length) {
    const cols = units.length ? units : [{ ordinal: 1, fields: {} }];
    unitTable = `<div class="block">${esc(t.unitTitle ?? 'Details')}</div>
    <table class="units"><tbody>
      ${t.unitFields.map((f) => `<tr><th>${esc(f)}</th>${cols.map((u) => `<td>${nl(unitValue(u.fields ?? {}, f))}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
  }
  let tables = '';
  for (const tb of t.tables ?? []) {
    // e.g. the handler certificate's substances table: Name | Classes | Lifecycles.
    // Rows come from the subject when the sheet recorded them by the table's
    // title, else from the job's substances (Name | Classes | Lifecycles).
    let rows = (subject[tb.title] && Array.isArray(subject[tb.title])) ? subject[tb.title] : [];
    if (!rows.length && /substance/i.test(tb.title) && substances.length) {
      rows = substances.map((x) => ({ Name: x.name ?? '', Classes: x.hazard_class ?? '', Lifecycles: x.lifecycles ?? '' }));
    }
    tables += `<div class="block">${esc(tb.title)}</div>
    <table class="units"><thead><tr>${tb.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr>${tb.columns.map((c) => `<td>${esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('') : `<tr>${tb.columns.map(() => '<td>&nbsp;</td>').join('')}</tr>`}</tbody></table>`;
  }
  const scope = t.scopeText
    ? `<div class="block">${esc(t.scopeHeading ?? 'Scope of Certification')}</div>${subject['Scope of Certification'] ? `<p class="scope"><b>${nl(subject['Scope of Certification'])}</b></p>` : ''}<p class="scope">${nl(t.scopeText)}</p>`
    : '';
  const conditions = cert.conditions?.length ? `<p class="scope"><b>Conditions:</b> ${cert.conditions.map(esc).join('; ')}</p>` : '';
  const dateVals = { 'Issued Date': d(cert.issue_date), 'Effective From': d(cert.in_force_date ?? cert.issue_date), 'Expiry date': d(cert.expiry_date), 'Expiry Date': d(cert.expiry_date) };
  const dates = (t.dateLabels ?? []).map((l) => `<div class="k">${esc(l)}</div><div>${esc(dateVals[l] ?? '')}</div>`).join('');
  const signature = (t.signature ?? []).map((l, i) => `<div class="${i === 0 ? 'signame' : 'sigline'}">${esc(l)}</div>`).join('');
  const issuer = t.issuerStatement ? `<p class="issuer">${esc(t.issuerStatement)}</p>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc((t.documentTitle ?? 'Compliance certificate').split('\n')[0])} — ${esc(subject['Company/Legal Entity'] ?? subject['Company'] ?? subject['Name'] ?? '')}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  html,body{margin:0;background:#eee;font-family:Calibri,Arial,sans-serif;color:#111}
  .page{width:210mm;min-height:297mm;margin:8mm auto;background:#fff;padding:12mm;box-sizing:border-box}
  .letterhead{display:flex;align-items:center;justify-content:space-between;gap:8mm;padding:2mm 0 4mm}
  .lh-logo{height:22mm;width:auto}
  .lh-details{display:flex;flex-direction:column;align-items:flex-end;gap:1.2mm;font-size:10.5pt;color:#222}
  .lh-line{display:inline-flex;align-items:center;gap:1.8mm;white-space:nowrap}
  .lh-line svg{width:4.2mm;height:4.2mm;fill:#006666;flex:none}
  .lh-row{display:inline-flex;gap:5mm}
  .lh-ribbon{display:block;width:100%;height:auto;margin-top:6mm}
  h1{font-size:15pt;text-align:center;margin:4mm 0 2mm;color:#004d4d;white-space:pre-line}
  p.certifies{text-align:center;font-size:10.5pt;margin:0 0 5mm}
  .grid{display:grid;grid-template-columns:42mm 1fr;font-size:10.5pt;border:1px solid #bbb;margin-bottom:4mm}
  .grid div{padding:1.6mm 2mm;border-bottom:1px solid #ddd}
  .grid .k{background:#f2f4f4;font-weight:700}
  .block{background:#ddd;font-weight:700;font-size:10.5pt;padding:1.6mm 2mm;margin-top:3mm}
  table.units{width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:4mm}
  table.units th,table.units td{border:1px solid #ccc;padding:1.4mm 2mm;text-align:left;vertical-align:top}
  table.units th{background:#f2f4f4;width:42mm}
  table.units thead th{width:auto}
  p.scope{font-size:10.5pt;line-height:1.35;margin:2mm 0 4mm}
  .dates{display:grid;grid-template-columns:32mm 1fr 32mm 1fr 32mm 1fr;font-size:10.5pt;border:1px solid #bbb;margin:4mm 0 10mm}
  .dates div{padding:1.6mm 2mm}
  .dates .k{background:#f2f4f4;font-weight:700}
  .signame{font-weight:700;color:#006666;font-size:12pt;margin-top:14mm}
  .sigline{font-size:10pt;color:#333}
  p.issuer{font-size:9pt;color:#444;margin-top:5mm;line-height:1.35}
  @media print { html,body{background:#fff} .page{width:auto;margin:0;min-height:0} }
</style>
</head>
<body>
<div class="page">
  ${head}
  <h1>${nl(t.documentTitle ?? 'COMPLIANCE CERTIFICATE')}</h1>
  <p class="certifies">${esc(t.certifiesThat ?? '')}</p>
  <div class="grid">${fieldRows}</div>
  ${unitTable}
  ${tables}
  ${scope}
  ${conditions}
  <div class="dates">${dates}</div>
  ${signature}
  ${issuer}
  ${foot}
</div>
</body>
</html>`;
}
