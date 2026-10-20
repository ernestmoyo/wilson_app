/**
 * The completed check sheet as a PDF (contract C, scope item C5 / B10).
 *
 * It follows Bryan's workbooks: letterhead, the site block (legal entity,
 * trading name, address, NZBN, manager, substance, location, summary, date),
 * then per template, per section, one row per item with the workbook columns
 * Item / Regulation / Action / Records / Comments / Evidence Portfolio. The
 * comment carries the workbook's font colours: green compliant, red
 * non-compliance (with its reason), blue general comment. Then the
 * declaration, the decision, document control, scope of authorisation and the
 * signature block (name, occupation, authorisation number, date signed).
 *
 * Text is wrapped here, line by line, rather than by pdfkit, so a row can
 * break across pages with the column header repeated: a long workbook action
 * never runs off the bottom of a page.
 *
 * Handler and cylinder (form-kind) jobs use the same rows, with their own
 * column headings, and the applicant / PCBU block and units instead of the
 * site block.
 */

import PDFDocument from 'pdfkit';
import { existsSync } from 'fs';
import { evidenceFileNames } from './naming.mjs';

// ── data ───────────────────────────────────────────────────────────────────

/**
 * Everything the PDF prints, from the database. Null for an unknown job.
 * @param {object} db
 * @param {number} jobId
 * @param {object} [o]
 * @param {(classKey) => string[]} [o.templateOrder] the sheet set's template codes, in workbook order
 * @param {(classKey) => string} [o.kindFor]
 */
/**
 * The general sheet is shared by every location class; its title, scope text
 * and some regulation references differ per class (meta.sheetByClass and
 * item.regulation_refs_by_class), exactly as the app shows them.
 */
function sheetForClass(meta, classKey) {
  const base = meta?.sheet ?? meta ?? {};
  const over = (classKey && meta?.sheetByClass?.[classKey]) || null;
  if (!over) return base;
  return { ...base, ...Object.fromEntries(Object.entries(over).filter(([, v]) => v != null)) };
}
export function regulationForClass(item, classKey) {
  const over = classKey ? item.regulation_refs_by_class?.[classKey] : null;
  return Array.isArray(over) && over.length ? over.join(' ') : item.regulation_raw;
}

export async function loadChecksheetData(db, jobId, { templateOrder = () => [], kindFor = () => 'location' } = {}) {
  const j = await db.query(`
    SELECT j.id, j.stage, j.class_key, j.subject, j.opened_at,
           c.legal_name, c.trading_name, c.nzbn, c.postal_address, c.phone, c.website, c.industry,
           l.name AS location, l.summary AS location_summary, s.address
    FROM job j JOIN client c ON c.id = j.client_id
    LEFT JOIN hs_location l ON l.id = j.hs_location_id
    LEFT JOIN site s ON s.id = l.site_id
    WHERE j.id = $1`, [jobId]);
  if (!j.rows.length) return null;
  const job = j.rows[0];

  const [insps, contacts, substances, units, cert, evidence] = await Promise.all([
    db.query(`
      SELECT i.id, i.inspected_at, i.equipment_used, i.status,
             i.declaration_signed_at, i.scope_confirmed_at,
             cu.full_name AS certifier_name, cu.occupation AS certifier_occupation,
             cu.authorisation_number AS certifier_authorisation,
             du.full_name AS declaration_signed_by_name, su.full_name AS scope_confirmed_by_name,
             bu.full_name AS conducted_by_name, i.supervised
      FROM inspection i
      JOIN app_user cu ON cu.id = i.certifier_id
      LEFT JOIN app_user du ON du.id = i.declaration_signed_by
      LEFT JOIN app_user su ON su.id = i.scope_confirmed_by
      LEFT JOIN app_user bu ON bu.id = i.conducted_by_id
      WHERE i.job_id = $1 ORDER BY i.inspected_at, i.id`, [jobId]),
    db.query(`SELECT name, role, phone, email, is_site_manager FROM contact
              WHERE client_id = (SELECT client_id FROM job WHERE id = $1)
              ORDER BY is_site_manager DESC, id`, [jobId]),
    db.query(`SELECT s.name, s.hazard_class, s.quantity, s.unit FROM substance s
              JOIN job j ON j.hs_location_id = s.hs_location_id WHERE j.id = $1 ORDER BY s.name`, [jobId]),
    db.query(`SELECT ordinal, fields FROM job_unit WHERE job_id = $1 ORDER BY ordinal`, [jobId]),
    db.query(`SELECT decision, conditions, requirements_not_met, issue_date, certificate_number
              FROM certificate WHERE job_id = $1`, [jobId]),
    db.query(`
      SELECT e.id, e.finding_id, e.kind, e.mime, e.storage_key, e.sha256, e.bytes, e.original_name,
             e.appendix_category, e.created_at,
             COALESCE(cs.number, cs.ordinal::text) AS section_label_part,
             COALESCE(ci.number, ci.ordinal::text) AS item_label_part
      FROM evidence e
      LEFT JOIN finding f ON f.id = e.finding_id
      LEFT JOIN checksheet_item ci ON ci.id = f.item_id
      LEFT JOIN checksheet_section cs ON cs.id = ci.section_id
      WHERE e.job_id = $1 ORDER BY e.created_at, e.id`, [jobId]),
  ]);

  const evRows = evidence.rows.map((e) => ({
    ...e,
    item_label: e.item_label_part != null ? `${e.section_label_part}.${e.item_label_part}` : null,
  }));
  const fileNames = evidenceFileNames(evRows);

  const order = templateOrder(job.class_key) ?? [];
  const inspections = [];
  for (const ins of insps.rows) {
    const [tpls, sections, items, findings, excluded] = await Promise.all([
      db.query(`SELECT t.id, t.code, t.revision, t.title, t.meta FROM inspection_template it
                JOIN checksheet_template t ON t.id = it.template_id WHERE it.inspection_id = $1`, [ins.id]),
      db.query(`SELECT s.id, s.template_id, s.ordinal, s.number, s.title FROM checksheet_section s
                JOIN inspection_template it ON it.template_id = s.template_id AND it.inspection_id = $1
                ORDER BY s.ordinal`, [ins.id]),
      db.query(`SELECT i.id, i.section_id, i.ordinal, i.number, i.regulation_raw, i.regulation_refs_by_class, i.action, i.records
                FROM checksheet_item i JOIN checksheet_section s ON s.id = i.section_id
                JOIN inspection_template it ON it.template_id = s.template_id AND it.inspection_id = $1
                ORDER BY i.ordinal`, [ins.id]),
      db.query(`SELECT id, item_id, status, comment, verification_method, failure_reason,
                       general_comment, na_reason
                FROM finding WHERE inspection_id = $1`, [ins.id]),
      db.query(`SELECT section_id, reason FROM inspection_section_excluded WHERE inspection_id = $1`, [ins.id]),
    ]);
    const rank = (code) => { const k = order.indexOf(code); return k < 0 ? order.length : k; };
    const findingByItem = new Map(findings.rows.map((f) => [Number(f.item_id), f]));
    const excludedBy = new Map(excluded.rows.map((x) => [Number(x.section_id), x.reason]));
    const templates = tpls.rows
      .sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code))
      .map((t) => ({
        code: t.code, revision: t.revision, title: t.title, sheet: sheetForClass(t.meta, job.class_key),
        sections: sections.rows.filter((s) => Number(s.template_id) === Number(t.id)).map((s) => ({
          number: s.number, ordinal: s.ordinal, title: s.title,
          excluded: excludedBy.get(Number(s.id)) ?? null,
          items: items.rows.filter((i) => Number(i.section_id) === Number(s.id)).map((i) => {
            const f = findingByItem.get(Number(i.id)) ?? null;
            return {
              number: i.number ?? String(i.ordinal), regulation: regulationForClass(i, job.class_key), action: i.action, records: i.records,
              finding: f,
              evidence: f ? evRows.filter((e) => Number(e.finding_id) === Number(f.id)).map((e) => fileNames.get(e.id)) : [],
            };
          }),
        })),
      }));
    inspections.push({ ...ins, templates });
  }

  return {
    job: { ...job, kind: kindFor(job.class_key) },
    contacts: contacts.rows,
    substances: substances.rows,
    units: units.rows,
    certificate: cert.rows[0] ?? null,
    inspections,
    evidence: evRows.map((e) => ({ ...e, fileName: fileNames.get(e.id) })),
  };
}

// ── drawing ────────────────────────────────────────────────────────────────

const C = {
  teal: '#006666', tealDark: '#004D4D', ink: '#111111', muted: '#666666', rule: '#BFBFBF',
  head: '#D9D9D9', section: '#E6F1F1', zebra: '#FAFAFA',
  green: '#00B050', red: '#FF0000', blue: '#0070C0', grey: '#7F7F7F', amber: '#C65911',
};
const F = { r: 'Helvetica', b: 'Helvetica-Bold', i: 'Helvetica-Oblique' };

// The standard PDF fonts speak WinAnsi only; anything else would print as
// junk, so map the few the workbooks use and drop the rest.
const SUBST = { '≤': '<=', '≥': '>=', '–': '-', '—': '-', '‑': '-', '−': '-', '→': '->', '✓': 'Yes', '✗': 'No', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '\t': ' ' };
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•˜™š›œžŸ');
export function pdfText(s) {
  return String(s ?? '').replace(/\r\n?/g, '\n').replace(/[^\n\x20-\x7e\xa1-\xff]/g, (ch) =>
    SUBST[ch] ?? (WINANSI_EXTRA.has(ch) ? ch : ''));
}

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-NZ', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Pacific/Auckland' }) : '');

/** Word-wrap one paragraph run into lines of at most `width` points. */
function wrap(doc, text, font, size, width) {
  doc.font(font).fontSize(size);
  const out = [];
  for (const para of pdfText(text).split('\n')) {
    let line = '';
    for (const word of para.split(/ +/)) {
      const cand = line ? `${line} ${word}` : word;
      if (doc.widthOfString(cand) <= width) { line = cand; continue; }
      if (line) out.push(line);
      // A single word wider than the cell (a URL) is broken by characters.
      let w = word;
      while (doc.widthOfString(w) > width && w.length > 1) {
        let k = w.length - 1;
        while (k > 1 && doc.widthOfString(w.slice(0, k)) > width) k--;
        out.push(w.slice(0, k));
        w = w.slice(k);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

/** A cell is a list of runs { text, color, font }; it becomes styled lines. */
function cellLines(doc, runs, size, width) {
  const lines = [];
  for (const r of runs) {
    if (r.text == null || String(r.text).trim() === '') continue;
    for (const t of wrap(doc, r.text, r.font ?? F.r, size, width)) lines.push({ t, color: r.color ?? C.ink, font: r.font ?? F.r });
  }
  return lines;
}

/** The comment cell: the result in its workbook colour. */
function commentRuns(f) {
  if (!f || f.status === 'pending') {
    return [{ text: 'Not assessed', color: C.amber, font: F.b }, ...(f?.comment ? [{ text: f.comment, color: C.grey }] : [])];
  }
  const runs = [];
  if (f.status === 'compliant') {
    runs.push({ text: f.comment || 'Compliant', color: C.green });
  } else if (f.status === 'non_compliant') {
    runs.push({ text: `Non-compliance: ${f.failure_reason ?? ''}`.trim(), color: C.red, font: F.b });
    if (f.comment && f.comment.trim() !== String(f.failure_reason ?? '').trim()) runs.push({ text: f.comment, color: C.red });
  } else if (f.status === 'conditional') {
    runs.push({ text: `Conditional${f.failure_reason ? `: ${f.failure_reason}` : ''}`, color: C.red, font: F.b });
    if (f.comment) runs.push({ text: f.comment, color: C.red });
  } else if (f.status === 'not_applicable') {
    runs.push({ text: f.na_reason ? `Not applicable: ${f.na_reason}` : 'Not applicable', color: C.grey, font: F.b });
    // "N/A" or "Not Applicable" as the comment only repeats the status.
    if (f.comment && !/^\s*(n\/?a|not applicable)\.?\s*$/i.test(f.comment)) runs.push({ text: f.comment, color: C.grey });
  }
  if (f.general_comment) runs.push({ text: `General comment: ${f.general_comment}`, color: C.blue });
  if (f.verification_method) runs.push({ text: `Verified by ${f.verification_method}`, color: C.muted, font: F.i });
  return runs;
}

/** Column models. Widths are fractions of the usable width. */
function columnsFor(kind, sheet) {
  const h = Array.isArray(sheet?.columnHeaders) ? sheet.columnHeaders : [];
  const ev = sheet?.evidenceColumnLabel ?? 'Evidence Portfolio';
  if (kind === 'handler') {
    return [
      { label: h[0] ?? 'Performance Standard Ref', w: 0.13, get: (it) => [{ text: it.regulation ?? it.number, font: F.b }] },
      { label: h[1] ?? 'Competence Requirement', w: 0.40, get: (it) => [{ text: it.action }] },
      { label: h[2] ?? 'Certifier Comments', w: 0.32, get: (it) => commentRuns(it.finding) },
      { label: 'Evidence', w: 0.15, get: (it) => it.evidence.map((n) => ({ text: n, color: C.tealDark })) },
    ];
  }
  if (kind === 'cylinder') {
    return [
      { label: h[0] ?? 'Item', w: 0.06, get: (it) => [{ text: it.number, font: F.b }] },
      { label: h[1] ?? 'Check', w: 0.30, get: (it) => [{ text: it.action }] },
      { label: h[2] ?? 'Records', w: 0.20, get: (it) => [{ text: it.records }] },
      { label: h[3] ?? 'Comments', w: 0.28, get: (it) => commentRuns(it.finding) },
      { label: h[4] ?? 'Evidence', w: 0.16, get: (it) => it.evidence.map((n) => ({ text: n, color: C.tealDark })) },
    ];
  }
  return [
    { label: h[0] ?? 'Item', w: 0.045, get: (it) => [{ text: it.number, font: F.b }] },
    { label: h[1] ?? 'Regulation', w: 0.095, get: (it) => [{ text: it.regulation }] },
    { label: h[2] ?? 'Action', w: 0.30, get: (it) => [{ text: it.action }] },
    { label: h[3] ?? 'Records', w: 0.20, get: (it) => [{ text: it.records }] },
    { label: h[4] ?? 'Comments', w: 0.24, get: (it) => commentRuns(it.finding) },
    { label: ev, w: 0.12, get: (it) => it.evidence.map((n) => ({ text: n, color: C.tealDark })) },
  ];
}

const DECISION_TEXT = {
  granted: 'Compliance certificate granted',
  conditional: 'Compliance certificate issued with conditions',
  refused: 'Compliance certificate refused',
};

/**
 * Render the loaded data to PDF bytes.
 * @param {object} data from loadChecksheetData
 * @param {object} [o]
 * @param {string|null} [o.logoPath] letterhead logo (PNG)
 * @param {object} [o.company] { address, email, website, phone }
 * @param {string|null} [o.signatureImagePath] printed only if the file exists
 * @param {boolean} [o.compress]
 * @returns {Promise<Buffer>}
 */
export function renderChecksheetPdf(data, { logoPath = null, company = null, signatureImagePath = null, compress = true, now = new Date() } = {}) {
  const { job } = data;
  const kind = job.kind ?? 'location';
  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape', margins: { top: 28, bottom: 34, left: 28, right: 28 },
    bufferPages: true, compress, autoFirstPage: true,
    info: {
      Title: pdfText(`Check sheet - ${job.legal_name} - job ${job.id}`),
      Author: 'Assure Safety', Subject: 'Compliance check sheet', Creator: 'Assure Safety portal',
    },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });

  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  let y = doc.page.margins.top;
  const newPage = () => { doc.addPage(); y = doc.page.margins.top; };
  const ensure = (h) => { if (y + h > bottom()) { newPage(); return true; } return false; };

  /** A free paragraph across the page. */
  const para = (text, { font = F.r, size = 9, color = C.ink, gap = 4, indent = 0 } = {}) => {
    const lines = wrap(doc, text, font, size, W - indent);
    const lh = size * 1.25;
    for (const t of lines) {
      ensure(lh);
      doc.font(font).fontSize(size).fillColor(color).text(t, L + indent, y, { lineBreak: false });
      y += lh;
    }
    y += gap;
  };
  const heading = (text, { size = 11, color = C.tealDark } = {}) => {
    ensure(size * 2.4);
    y += 4;
    doc.font(F.b).fontSize(size).fillColor(color).text(pdfText(text), L, y, { lineBreak: false });
    y += size * 1.4;
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.8).strokeColor(C.teal).stroke();
    y += 5;
  };

  // ── letterhead ──
  const logoH = 40;
  if (logoPath && existsSync(logoPath)) {
    try { doc.image(logoPath, L, y, { height: logoH }); } catch { /* a bad image never blocks the record */ }
  }
  if (company) {
    const lines = [company.address, `${company.email}  ·  ${company.phone}`, company.website].filter(Boolean);
    lines.forEach((t, k) => doc.font(F.r).fontSize(8.5).fillColor('#222222')
      .text(pdfText(t), L, y + 4 + k * 11, { width: W, align: 'right', lineBreak: false }));
  }
  y += logoH + 8;

  const title = kind === 'handler' ? 'Handler Assessment Check Sheet'
    : kind === 'cylinder' ? 'Cylinder Importation Check Sheet'
    : 'Location Compliance Check Sheet';
  doc.font(F.b).fontSize(15).fillColor(C.tealDark).text(title, L, y, { lineBreak: false });
  doc.font(F.r).fontSize(9).fillColor(C.muted)
    .text(pdfText(`Job ${job.id}  ·  printed ${fmtDate(now)}`), L, y + 4, { width: W, align: 'right', lineBreak: false });
  y += 22;

  // ── header block: a 4-column key/value grid ──
  const first = data.inspections[0] ?? null;
  const manager = data.contacts.find((c) => c.is_site_manager) ?? data.contacts[0] ?? null;
  const substanceText = data.substances
    .map((s) => `${s.name} (${s.hazard_class}${s.quantity != null ? `, ${s.quantity} ${s.unit ?? ''}`.trimEnd() : ''})`).join('; ');
  const inspectedText = data.inspections.map((i) => fmtDate(i.inspected_at)).join(', ');
  let pairs;
  if (kind === 'location') {
    pairs = [
      ['Legal Entity Name', job.legal_name], ['Trading as Name', job.trading_name],
      ['Site / Location Address', job.address], ['Postal Address', job.postal_address],
      ['NZBN', job.nzbn], ['Business Phone Number', job.phone],
      ['Manager Name', manager?.name], ['Direct Dial / Mobile', manager?.phone],
      ['Hazardous Substance Location', job.location], ['Date of Inspection', inspectedText],
      ['Hazardous substance(s)', substanceText], ['Compliance Certifier', first ? `${first.certifier_name}${first.certifier_authorisation ? ` (${first.certifier_authorisation})` : ''}` : ''],
      ['Brief location summary', job.location_summary], ['Equipment used', first?.equipment_used],
    ];
  } else {
    const subject = job.subject ?? {};
    const tplSheet = first?.templates[0]?.sheet ?? {};
    const labels = Array.isArray(tplSheet.subjectBlock) ? tplSheet.subjectBlock.map((x) => x.label) : [];
    const keys = [...labels, ...Object.keys(subject).filter((k) => !labels.includes(k))];
    pairs = keys.map((k) => [k, subject[k]]);
    if (!pairs.some(([, v]) => v)) pairs.unshift(['Company / Legal Entity', job.legal_name]);
    pairs.push(['Date of Assessment', inspectedText],
      ['Compliance Certifier', first ? `${first.certifier_name}${first.certifier_authorisation ? ` (${first.certifier_authorisation})` : ''}` : '']);
  }
  const kW = 0.14 * W, vW = 0.36 * W;
  for (let k = 0; k < pairs.length; k += 2) {
    const row = pairs.slice(k, k + 2);
    const cells = row.map(([key, v]) => ({ key: wrap(doc, key, F.b, 8, kW - 8), val: wrap(doc, v ?? '', F.r, 8.5, vW - 8) }));
    const h = Math.max(...cells.map((c) => Math.max(c.key.length, c.val.length))) * 10.5 + 6;
    ensure(h);
    cells.forEach((c, n) => {
      const x = L + n * (kW + vW);
      doc.rect(x, y, kW, h).fillAndStroke('#F2F4F4', C.rule);
      doc.rect(x + kW, y, vW, h).lineWidth(0.5).strokeColor(C.rule).stroke();
      c.key.forEach((t, m) => doc.font(F.b).fontSize(8).fillColor(C.ink).text(t, x + 4, y + 3.5 + m * 10.5, { lineBreak: false }));
      c.val.forEach((t, m) => doc.font(F.r).fontSize(8.5).fillColor(C.ink).text(t, x + kW + 4, y + 3 + m * 10.5, { lineBreak: false }));
    });
    y += h;
  }
  y += 6;

  // Cylinder batches / units, when the job has them.
  if (data.units.length) {
    heading(first?.templates[0]?.sheet?.unitBlockTitle ?? 'Units');
    for (const u of data.units) {
      const f = u.fields ?? {};
      para(`${u.ordinal}. ${Object.entries(f).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join('  ·  ')}`, { size: 8.5, gap: 2 });
    }
    y += 4;
  }

  // Legend: the workbook's font colours, said once.
  ensure(14);
  let lx = L;
  for (const [t, c] of [['Compliant', C.green], ['Non-compliance / finding', C.red], ['General comment', C.blue], ['Not applicable', C.grey], ['Not assessed', C.amber]]) {
    doc.rect(lx, y + 1.5, 7, 7).fill(c);
    doc.font(F.r).fontSize(8).fillColor(C.ink).text(t, lx + 10, y + 1, { lineBreak: false });
    lx += 10 + doc.widthOfString(t) + 16;
  }
  y += 16;

  if (!data.inspections.length) {
    para('No inspection has been opened for this job yet: there is nothing to print.', { color: C.amber, font: F.b });
  }

  // ── the check sheet rows ──
  const SIZE = 7.8, LH = SIZE * 1.22, PAD = 3;
  for (const ins of data.inspections) {
    if (data.inspections.length > 1) heading(`Inspection of ${fmtDate(ins.inspected_at)}`, { size: 10 });
    for (const t of ins.templates) {
      const cols = columnsFor(kind, t.sheet);
      let x = L; for (const c of cols) { c.x = x; c.px = c.w * W; x += c.px; }
      const drawHeader = () => {
        const h = 16;
        doc.rect(L, y, W, h).fill(C.head);
        for (const c of cols) {
          doc.rect(c.x, y, c.px, h).lineWidth(0.5).strokeColor(C.rule).stroke();
          doc.font(F.b).fontSize(8).fillColor(C.ink).text(pdfText(c.label), c.x + PAD, y + 4.5, { width: c.px - 2 * PAD, lineBreak: false, ellipsis: true });
        }
        y += h;
      };
      // Template band: title, revision, and the workbook's "NB" note.
      ensure(60);
      y += 4;
      doc.rect(L, y, W, 20).fill(C.teal);
      doc.font(F.b).fontSize(10).fillColor('#FFFFFF')
        .text(pdfText(t.sheet?.title ?? t.title), L + 6, y + 5.5, { width: W - 140, lineBreak: false, ellipsis: true });
      doc.font(F.r).fontSize(8).fillColor('#FFFFFF')
        .text(pdfText(`${t.code} rev ${t.revision}${t.sheet?.footer ? `  ·  ${t.sheet.footer}` : ''}`), L, y + 6.5, { width: W - 6, align: 'right', lineBreak: false });
      y += 20;
      if (t.sheet?.note) { doc.font(F.i).fontSize(7.5).fillColor(C.red).text(pdfText(t.sheet.note), L, y + 2, { lineBreak: false }); y += 11; }
      drawHeader();

      const sectionBand = (s, suffix = null, firstRowLines = 2, cont = false) => {
        const label = `${s.number ? `${s.number}  ` : ''}${s.title ?? ''}${cont ? ' (continued)' : ''}`;
        const lines = wrap(doc, label, F.b, 8.5, W - 120);
        const h = lines.length * 10.5 + 6;
        // Never leave a band alone at the foot of a page: it travels with its first row.
        const fresh = Math.floor((bottom() - doc.page.margins.top - 16 - h - 2 * PAD) / LH);
        if (y + h + Math.min(firstRowLines, fresh) * LH + 2 * PAD > bottom()) { newPage(); drawHeader(); }
        doc.rect(L, y, W, h).fillAndStroke(C.section, C.rule);
        lines.forEach((ln, m) => doc.font(F.b).fontSize(8.5).fillColor(C.tealDark).text(ln, L + PAD, y + 3.5 + m * 10.5, { lineBreak: false }));
        if (suffix) doc.font(F.b).fontSize(8.5).fillColor(C.grey).text(suffix, L, y + 3.5, { width: W - PAD, align: 'right', lineBreak: false });
        y += h;
      };

      for (const s of t.sections) {
        if (s.excluded === 'not_chosen') continue;           // outside the job's scope choice: omitted
        if (s.excluded === 'not_in_scope') { sectionBand(s, 'Not in scope'); continue; } // listed once
        const first = s.items[0];
        sectionBand(s, null, first ? Math.max(1, ...cols.map((c) => cellLines(doc, c.get(first), SIZE, c.px - 2 * PAD).length)) : 1);
        s.items.forEach((it, idx) => {
          const cells = cols.map((c) => cellLines(doc, c.get(it), SIZE, c.px - 2 * PAD));
          let offset = 0;
          const total = Math.max(1, ...cells.map((l) => l.length));
          // Draw the row, splitting it across pages line by line.
          while (offset < total) {
            let room = Math.floor((bottom() - y - 2 * PAD) / LH);
            // A row that fits on a fresh page moves there whole, as Excel prints;
            // only a row taller than a page is split, with the header repeated.
            const fresh = Math.floor((bottom() - doc.page.margins.top - 16 - 2 * PAD) / LH);
            if (room < total - offset && (total - offset <= fresh || room < 3)) {
              newPage(); drawHeader(); sectionBand(s, null, 0, true); room =Math.floor((bottom() - y - 2 * PAD) / LH);
            }
            const n = Math.min(room, total - offset);
            const h = n * LH + 2 * PAD;
            if (idx % 2 === 1) doc.rect(L, y, W, h).fill(C.zebra);
            cols.forEach((c, k) => {
              doc.rect(c.x, y, c.px, h).lineWidth(0.5).strokeColor(C.rule).stroke();
              cells[k].slice(offset, offset + n).forEach((ln, m) =>
                doc.font(ln.font).fontSize(SIZE).fillColor(ln.color).text(ln.t, c.x + PAD, y + PAD + m * LH, { lineBreak: false }));
            });
            y += h;
            offset += n;
          }
        });
      }
      y += 6;
    }
  }

  // ── declaration, decision, document control, scope, signature ──
  const sheets = data.inspections.flatMap((i) => i.templates.map((t) => t.sheet ?? {}));
  const declaration = sheets.map((s) => s.declaration).find(Boolean);
  const docControl = sheets.map((s) => s.documentControl).find((d) => d && Object.keys(d).length);
  const scope = sheets.map((s) => s.scopeOfAuthorisation).find(Boolean);
  const reference = sheets.map((s) => s.reference).find(Boolean);
  const signer = first ?? {};

  if (reference) para(reference, { size: 8, color: C.muted, font: F.i, gap: 6 });

  if (declaration) {
    heading('Declaration');
    para(declaration, { size: 8.5 });
    para(signer.declaration_signed_at
      ? `Signed by ${signer.declaration_signed_by_name} on ${fmtDate(signer.declaration_signed_at)}`
      : 'Declaration not yet signed', { font: F.b, size: 8.5, color: signer.declaration_signed_at ? C.ink : C.amber });
  }

  heading('Decision');
  const cert = data.certificate;
  if (cert) {
    const extra = [...(cert.conditions ?? []), ...(cert.requirements_not_met ?? [])];
    para(`Decision: ${DECISION_TEXT[cert.decision] ?? cert.decision}${cert.issue_date ? ` on ${fmtDate(cert.issue_date)}` : ''}${cert.certificate_number ? ` (certificate ${cert.certificate_number})` : ''}${extra.length ? ' with the following:' : ''}`, { font: F.b, size: 9 });
    extra.forEach((c, k) => para(`${k + 1}. ${c}`, { size: 8.5, indent: 12, gap: 1 }));
    y += 3;
  } else {
    para('Decision: not yet made. No certificate has been issued for this job.', { size: 9, color: C.muted });
  }

  if (docControl) {
    heading('Document Control');
    const entries = Object.entries(docControl);
    const cw = W / Math.max(entries.length, 1);
    ensure(30);
    entries.forEach(([k, v], n) => {
      doc.rect(L + n * cw, y, cw, 13).fillAndStroke(C.head, C.rule);
      doc.rect(L + n * cw, y + 13, cw, 14).lineWidth(0.5).strokeColor(C.rule).stroke();
      doc.font(F.b).fontSize(8).fillColor(C.ink).text(pdfText(k), L + n * cw + 4, y + 3, { width: cw - 8, lineBreak: false, ellipsis: true });
      doc.font(F.r).fontSize(8).fillColor(C.ink).text(pdfText(v), L + n * cw + 4, y + 16.5, { width: cw - 8, lineBreak: false, ellipsis: true });
    });
    y += 33;
  }

  // Keep the scope confirmation and the signature block on one page.
  const scopeLines = scope ? [scope.text, scope.confirmation].filter(Boolean)
    .reduce((n, t) => n + wrap(doc, t, F.r, 8.5, W).length, 0) : 0;
  ensure(Math.min(scopeLines * 10.7 + (scope ? 60 : 0) + 140, bottom() - doc.page.margins.top));

  if (scope) {
    heading(scope.heading ?? 'Scope of Authorisation');
    if (scope.text) para(scope.text, { size: 8.5 });
    if (scope.confirmation) para(scope.confirmation, { size: 8.5 });
    para(signer.scope_confirmed_at
      ? `Confirmed by ${signer.scope_confirmed_by_name} on ${fmtDate(signer.scope_confirmed_at)}`
      : 'Scope of authorisation not yet confirmed', { font: F.b, size: 8.5, color: signer.scope_confirmed_at ? C.ink : C.amber });
  }

  // Signature block: IPS 21(5) name, date; the authorisation number.
  heading('Compliance certifier');
  const sigOk = signatureImagePath && existsSync(signatureImagePath);
  ensure(sigOk ? 110 : 70);
  const sx = L;
  if (sigOk) {
    try { doc.image(signatureImagePath, sx, y, { fit: [160, 45] }); } catch { /* unreadable image: name block still prints */ }
    y += 48;
  } else {
    y += 28; // room above the line, as on the printed sheet
  }
  if (!sigOk) doc.font(F.r).fontSize(7.5).fillColor(C.muted).text('Signature (IPS 21(5))', sx, y - 10, { lineBreak: false });
  doc.moveTo(sx, y).lineTo(sx + 240, y).lineWidth(0.6).strokeColor(C.ink).stroke();
  y += 4;
  const signed = signer.declaration_signed_at ?? signer.scope_confirmed_at ?? null;
  for (const [k, v] of [
    ['Name', signer.certifier_name], ['Occupation', signer.certifier_occupation],
    ['Authorisation number', signer.certifier_authorisation], ['Date signed', signed ? fmtDate(signed) : 'not yet signed'],
    ...(signer.conducted_by_name && signer.conducted_by_name !== signer.certifier_name
      ? [['Inspected by', `${signer.conducted_by_name}${signer.supervised ? ' (supervised)' : ''}`]] : []),
  ]) {
    doc.font(F.b).fontSize(8.5).fillColor(C.ink).text(pdfText(k), sx, y, { lineBreak: false });
    doc.font(F.r).fontSize(8.5).fillColor(C.ink).text(pdfText(v ?? ''), sx + 110, y, { lineBreak: false });
    y += 12;
  }

  // ── footer on every page ──
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    const fy = doc.page.height - 24;
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing in the margin must not add a page
    doc.moveTo(L, fy - 4).lineTo(L + W, fy - 4).lineWidth(0.5).strokeColor(C.teal).stroke();
    doc.font(F.r).fontSize(7.5).fillColor(C.muted)
      .text(pdfText(`Assure Safety  ·  ${job.legal_name}${job.location ? `  ·  ${job.location}` : ''}  ·  Job ${job.id}`), L, fy, { width: W * 0.8, lineBreak: false, ellipsis: true });
    doc.text(`Page ${p - range.start + 1} of ${range.count}`, L, fy, { width: W, align: 'right', lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }

  doc.end();
  return done;
}

/** Load and render in one call. Null for an unknown job. */
export async function checksheetPdf(db, jobId, options = {}) {
  const data = await loadChecksheetData(db, jobId, options);
  if (!data) return null;
  return { pdf: await renderChecksheetPdf(data, options), data };
}
