/**
 * The non-compliance report: what Bryan asked to print and send to the
 * client after a site visit (process flow stage 5, "provide a
 * requirements/actions list"). One page per job: every non-compliant item
 * in the check sheet's own words, why it failed, and the corrective action
 * raised against it.
 */

import { COMPANY, contactBlock } from './render-certificate.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const d = (v) => (v ? new Date(v).toLocaleDateString('en-NZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

/**
 * @param {object} r
 * @param {object} r.job        { id, client, location, address, inspectedAt, certifier, stage }
 * @param {object[]} r.items    [{ sheet, number, action, regulation, reason, comment, actions: [{severity, description, dueDate, status}] }]
 * @param {object} [r.letterhead] { logo?: dataUrl, ribbon?: dataUrl }
 */
export function renderNonComplianceReport({ job, items, letterhead = null, preparedBy = null, preparedAt = new Date() }) {
  const head = letterhead
    ? `<div class="letterhead">
      ${letterhead.logo ? `<img class="lh-logo" src="${letterhead.logo}" alt="Assure Safety">` : '<span></span>'}
      ${contactBlock()}
    </div>`
    : '';
  const foot = letterhead?.ribbon ? `<img class="lh-ribbon" src="${letterhead.ribbon}" alt="">` : '';

  const rows = items.map((it, i) => `
    <tr>
      <td class="n">${i + 1}</td>
      <td>${esc(it.sheet)}<br><span class="muted">item ${esc(it.number)}</span></td>
      <td>${esc(it.action)}${it.regulation ? `<br><span class="muted">reg ${esc(it.regulation)}</span>` : ''}</td>
      <td class="reason">${esc(it.reason)}${it.comment ? `<br><span class="muted">${esc(it.comment)}</span>` : ''}</td>
      <td>${(it.actions ?? []).length
        ? it.actions.map((a) => `<div class="ca"><b>${esc(a.severity)}</b> ${esc(a.description)}${a.dueDate ? `<br><span class="muted">due ${d(a.dueDate)} · ${esc(a.status.replace('_', ' '))}</span>` : `<br><span class="muted">${esc(a.status.replace('_', ' '))}</span>`}</div>`).join('')
        : '<span class="muted">to be agreed</span>'}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Non-compliance report — ${esc(job.client)} — ${esc(job.location)}</title>
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
  h1{font-size:16pt;margin:4mm 0 1mm;color:#004d4d}
  .sub{font-size:10.5pt;color:#333;margin-bottom:4mm}
  .grid{display:grid;grid-template-columns:38mm 1fr 32mm 1fr;font-size:10.5pt;border:1px solid #bbb;margin-bottom:5mm}
  .grid div{padding:1.6mm 2mm;border-bottom:1px solid #ddd}
  .grid .k{background:#f2f4f4;font-weight:700}
  p.intro{font-size:10.5pt;line-height:1.35;margin:0 0 4mm}
  table{width:100%;border-collapse:collapse;font-size:9.5pt}
  th{background:#ddd;text-align:left;padding:1.6mm 2mm;border:1px solid #bbb}
  td{padding:1.6mm 2mm;border:1px solid #ccc;vertical-align:top;line-height:1.3}
  td.n{width:6mm;text-align:center;font-weight:700}
  td.reason{color:#c00000}
  .muted{color:#666;font-size:8.5pt}
  .ca{margin:0 0 1.5mm}
  .sign{margin-top:8mm;font-size:10.5pt}
  .empty{font-size:11pt;color:#00b050;font-weight:700;padding:6mm 0}
  @media print { html,body{background:#fff} .page{width:auto;margin:0;min-height:0} }
</style>
</head>
<body>
<div class="page">
  ${head}
  <h1>Non-compliance report</h1>
  <div class="sub">WKS-17 location compliance check sheets · job ${esc(job.id)}</div>
  <div class="grid">
    <div class="k">Client</div><div>${esc(job.client)}</div>
    <div class="k">Location</div><div>${esc(job.location)}</div>
    <div class="k">Address</div><div>${esc(job.address)}</div>
    <div class="k">Site visit</div><div>${d(job.inspectedAt)}</div>
    <div class="k">Compliance certifier</div><div>${esc(job.certifier)}</div>
    <div class="k">Stage</div><div>${esc(job.stage)}</div>
  </div>
  ${items.length
    ? `<p class="intro">The following requirements were found not to be met at the site visit. Each is shown in the check sheet's own words, with the reason recorded and the corrective action raised. A compliance certificate cannot issue until every item is resolved or carried as a condition (regulations 6.24 and 13.39).</p>
  <table>
    <thead><tr><th>#</th><th>Sheet / item</th><th>Requirement</th><th>Reason not met</th><th>Corrective action</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
    : '<div class="empty">No non-compliances recorded for this job.</div>'}
  <div class="sign">Prepared by ${esc(preparedBy ?? job.certifier)}, ${d(preparedAt)} · ${esc(COMPANY.email)} · ${esc(COMPANY.phone)}</div>
  ${foot}
</div>
</body>
</html>`;
}
