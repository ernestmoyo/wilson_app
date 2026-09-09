/**
 * Render a certificate object (schema/certificate.schema.json) to HTML.
 *
 * Importable module — used by the CLI (tools/render-certificate.mjs) and by
 * the server (GET /api/jobs/:id/certificate.html) so the certificate is the
 * same document whether it came from the legacy workbook or from findings.
 *
 * Geometry mirrors the source workbook: Calibri, the sheet's column widths
 * (B 44.57 · C 25.71 · D 37.14 · E 38.29 char units) and its row heights.
 * Output is print-CSS for A4 with selectable text, not a raster — IPS 22(2)
 * requires records to stay "legible and retrievable", which a flattened image
 * is not.
 */

const COLS = { B: 44.5703125, C: 25.7109375, D: 37.140625, E: 38.28515625 };
const totalW = Object.values(COLS).reduce((a, b) => a + b, 0);
const pct = (w) => ((w / totalW) * 100).toFixed(4) + '%';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const nzDate = (iso) => {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
};

/**
 * @param cert  certificate object per the schema
 * @param opts  { signatureDataUrl?: string,
 *                letterhead?: { logo?: string, details?: string, ribbon?: string } }  data URLs
 * @returns HTML string
 */
export function renderCertificateHtml(cert, { signatureDataUrl = null, letterhead = null } = {}) {
  // The workbook's Certificate sheet carries the Assure Safety letterhead as
  // three images: the logo and the company-details band at the top, the
  // ribbon at the bottom. Rendered here the same way when supplied.
  const head = letterhead && (letterhead.logo || letterhead.details)
    ? `<div class="letterhead">
      ${letterhead.logo ? `<img class="lh-logo" src="${letterhead.logo}" alt="Assure Safety">` : '<span></span>'}
      ${letterhead.details ? `<img class="lh-details" src="${letterhead.details}" alt="Assure Safety contact details">` : ''}
    </div>`
    : '';
  const foot = letterhead?.ribbon
    ? `<img class="lh-ribbon" src="${letterhead.ribbon}" alt="">`
    : '';
  const substanceRows = (cert.substances ?? [])
    .map(
      (s) => `
      <div class="cell col-b bl">${esc(s.name)}</div>
      <div class="cell col-c"></div>
      <div class="cell col-d">${esc(s.hazardClass)}</div>
      <div class="cell col-e br">${esc(s.maxQuantity)}</div>`
    )
    .join('');

  const notMet = cert.requirementsNotMet?.length ? cert.requirementsNotMet.join('; ') : 'None';
  const conditionsBlock = cert.conditions?.length
    ? `<div class="cell span-4 bl br bt bb bold">Conditions: ${cert.conditions.map(esc).join('; ')}</div>`
    : '';
  const issuerStatement = (cert.issuerStatement || '').replace('{certifier}', cert.certifier.fullName || '');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(cert.documentTitle)} — ${esc(cert.pcbu.legalName)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  :root { --teal:#006666; --band:#DDDDDD; --ink:#000; --rule:#000; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#f4f4f4;
    font-family: Calibri, "Segoe UI", "Trebuchet MS", system-ui, sans-serif; color: var(--ink); }
  .page { width:186mm; margin:8mm auto; background:#fff; }
  .sheet { display:grid;
    grid-template-columns: ${pct(COLS.B)} ${pct(COLS.C)} ${pct(COLS.D)} ${pct(COLS.E)};
    font-size:11pt; line-height:1.25; }
  .cell { padding:3px 6px; overflow-wrap:anywhere; }
  .nowrap { overflow-wrap:normal; white-space:nowrap; overflow:visible; }
  .bl{border-left:1px solid var(--rule)} .br{border-right:1px solid var(--rule)}
  .bt{border-top:1px solid var(--rule)}  .bb{border-bottom:1px solid var(--rule)}
  .span-2{grid-column:span 2} .span-3{grid-column:span 3} .span-4{grid-column:span 4}
  .bold{font-weight:700} .teal{color:var(--teal)} .center{text-align:center}
  .middle{display:flex;flex-direction:column;justify-content:center}
  .title-band{background:var(--band);min-height:44mm;text-align:center;justify-content:center;font-size:12pt}
  .title-band .doc-title{font-size:20pt;font-weight:700;letter-spacing:.5px;display:block;margin-bottom:6px}
  .certifies{min-height:15mm;text-align:center;font-size:12pt}
  .spacer{min-height:3mm} .tall-2{min-height:28mm} .tall-3{min-height:26mm}
  .details{min-height:33mm} .notmet{min-height:24mm}
  .sig-block{min-height:30mm;position:relative}
  .sig-block img{max-width:52mm;height:auto;display:block;margin:2mm 0 0 2mm}
  .footer{font-size:10pt;text-align:center;min-height:22mm;justify-content:center}
  /* Letterhead, as carried on the workbook's Certificate sheet. */
  .letterhead{display:flex;align-items:center;justify-content:space-between;gap:8mm;padding:2mm 0 4mm}
  .lh-logo{height:22mm;width:auto}
  .lh-details{height:18mm;width:auto;max-width:62%}
  .lh-ribbon{display:block;width:100%;height:auto;margin-top:5mm}
  @media print { html,body{background:#fff} .page{width:auto;margin:0} }
</style>
</head>
<body>
<div class="page">
  ${head}
  <div class="sheet">
    <div class="cell span-4 bl br bt bb middle title-band">
      <span class="doc-title">${esc(cert.documentTitle)}</span>
      ${esc(cert.issuedUnder)}
    </div>
    <div class="cell span-4 bl br bb middle certifies">${esc(cert.certifiesThat)}</div>

    <div class="cell col-b bl">Certificate Number:</div>
    <div class="cell col-c">${esc(cert.registerNumber)}</div>
    <div class="cell col-d">CC Certificate Number:</div>
    <div class="cell col-e br">${esc(cert.certificateNumber)}</div>

    <div class="cell span-4 bl br spacer"></div>

    <div class="cell col-b bl bt bb middle">Issued to:</div>
    <div class="cell col-c bt bb"></div>
    <div class="cell span-2 bt bb br">${esc(
      [cert.issuedTo.name, cert.issuedTo.phone, cert.issuedTo.email].filter(Boolean).join('  ')
    )}</div>

    <div class="cell col-b bl bt bold teal">PCBU:</div>
    <div class="cell col-c bt"></div>
    <div class="cell span-2 bt br bold teal">Location Address:</div>

    <div class="cell col-b bl bb tall-2">${esc(
      [cert.pcbu.legalName, cert.pcbu.postalAddress, cert.pcbu.nzbn && 'NZBN: ' + cert.pcbu.nzbn]
        .filter(Boolean).join('\n')
    ).replace(/\n/g, '<br>')}</div>
    <div class="cell col-c bb"></div>
    <div class="cell span-2 bb br tall-2">${esc(cert.location.address)}${
      cert.location.companyNumber ? '<br>Company number: ' + esc(cert.location.companyNumber) : ''
    }</div>

    <div class="cell col-b bl bt middle tall-3">Site Details:</div>
    <div class="cell span-3 bt br tall-3">${esc(cert.location.siteDetails)}</div>

    <div class="cell col-b bl">Substance Name/Location:</div>
    <div class="cell col-c"></div>
    <div class="cell col-d">Class(es):</div>
    <div class="cell col-e br">Maximum Quantity:</div>
${substanceRows}

    <div class="cell span-4 bl br spacer"></div>
    <div class="cell span-4 bl br bt bb bold details">${esc(cert.detailsOfCertification)}</div>
    <div class="cell span-4 bl br bb bold notmet">Location Requirements Not Met: ${esc(notMet)}</div>
${conditionsBlock}

    <div class="cell col-b bl sig-block">
      ${signatureDataUrl ? `<img src="${signatureDataUrl}" alt="Signature of ${esc(cert.certifier.fullName)}">` : ''}
    </div>
    <div class="cell col-c"></div>
    <div class="cell col-d">
      <div>Date Issued:</div>
      <div>Date comes into force:</div>
      <div>Expiry Date:</div>
    </div>
    <div class="cell col-e br center">
      <div>${nzDate(cert.issueDate)}</div>
      <div>${nzDate(cert.inForceDate)}</div>
      <div>${nzDate(cert.expiryDate)}</div>
    </div>

    <div class="cell col-b bl">Signature:</div>
    <div class="cell span-3 br"></div>

    <div class="cell span-2 bl bold teal nowrap">${esc(cert.certifier.fullName)}${
      cert.certifier.postNominals ? ' (' + esc(cert.certifier.postNominals) + ')' : ''
    }</div>
    <div class="cell span-2 br"></div>

    <div class="cell span-2 bl nowrap">Worksafe Authorised Compliance Certifier (${esc(
      cert.certifier.authorisationNumber
    )})</div>
    <div class="cell span-2 br"></div>

    <div class="cell span-2 bl bb teal nowrap">${esc(cert.certifier.email)}</div>
    <div class="cell span-2 bb br"></div>

    <div class="cell span-4 bl br bb middle footer">${esc(issuerStatement)}</div>
  </div>
  ${foot}
</div>
</body>
</html>
`;
}

/** Defaults for the fixed wording, so a certificate built from findings needs only the facts. */
export const CERTIFICATE_DEFAULTS = {
  documentTitle: 'COMPLIANCE CERTIFICATE Location',
  issuedUnder:
    'Issued in accordance with regulations 6.23 and regulation 13.38 of the Health and Safety at Work (Hazardous Substances) Regulations 2017',
  certifiesThat:
    'This certificate certifies that the requirements prescribed in regulation 13.39 for a location compliance certificate have been met',
  issuerStatement:
    'This certificate is issued by {certifier}, being an individual compliance certifier authorised by WorkSafe New Zealand under regulation 6.8 of the Health and Safety at Work (Hazardous Substances) Regulations 2017, in accordance with regulation 6.8(2)(a) to (d) of those regulations.',
};
