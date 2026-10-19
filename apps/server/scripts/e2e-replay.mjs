#!/usr/bin/env node
/**
 * End-to-end replay of past real jobs against a LOCAL server (PGlite), then a
 * comparison of the app's checksheet PDF with the source workbooks.
 *
 * Every mutation goes through POST /api/sync or the REST routes the app uses.
 * Never point this at the live site: it refuses any base URL that is not
 * localhost.
 *
 *   node scripts/e2e-replay.mjs --base http://localhost:8124 --passcode <local> --out <dir>
 *        [--g2-xlsx <path>] [--abecca-xlsx <path>]
 *
 * Writes <out>/<job>.pdf, .zip, .txt, certificate.html, results.json.
 */

import { randomUUID, createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { inflateSync } from 'zlib';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { pdfText } from '../src/export/checksheet-pdf.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const data = join(repo, 'packages', 'checksheets', 'data');
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:8124');
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error('refusing a non-local base URL'); process.exit(2); }
const PASS = arg('passcode');
const OUT = arg('out', join(here, '..', 'replay-out'));
mkdirSync(OUT, { recursive: true });
const G2_XLSX = arg('g2-xlsx');
const AB_XLSX = arg('abecca-xlsx');

const load = (f) => JSON.parse(readFileSync(join(data, f), 'utf8'));
const G2 = {
  general: load('g2-chiller-class-6-and-8-location-checksheets--wks17-locations-general.instance.json'),
  cls: load('g2-chiller-class-6-and-8-location-checksheets--wks17-class-6-1a-6-1b-6-1c-8-2a-8.instance.json'),
  cert: load('certificates/g2-chiller/certificate.json'),
  manifest: load('evidence/g2-chiller/evidence-manifest.json'),
};
const AB = {
  general: load('abecca-class-2-and-3-location-checksheets-with-feedback--wks17-locations-general.instance.json'),
  cls: load('abecca-class-2-and-3-location-checksheets-with-feedback--wks17-class-2-and-3-1-substances.instance.json'),
};

// ── HTTP ─────────────────────────────────────────────────────────────────
let TOKEN = null;
const DEVICE = 'replay-ipad';
const log = [];          // every call: method path status
const errors500 = [];
async function call(method, path, body, { raw = false, headers = {} } = {}) {
  const h = { 'x-device-id': DEVICE, ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}), ...headers };
  let payload;
  if (body !== undefined && !Buffer.isBuffer(body)) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  else payload = body;
  const r = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') ?? '';
  const out = { status: r.status, headers: Object.fromEntries(r.headers), buf,
    json: ct.includes('json') ? JSON.parse(buf.toString('utf8') || 'null') : null,
    text: ct.includes('json') || ct.includes('html') || ct.includes('text') ? buf.toString('utf8') : null };
  log.push({ method, path, status: r.status });
  if (r.status >= 500) errors500.push({ method, path, status: r.status, body: buf.toString('utf8').slice(0, 400) });
  return out;
}
const ev = (type, payload, occurredAt = new Date().toISOString()) => ({ id: randomUUID(), type, payload, occurredAt });
async function sync(events) {
  const r = await call('POST', '/api/sync', { deviceId: DEVICE, events });
  if (r.status !== 200) throw new Error(`sync ${r.status} ${r.text}`);
  return r.json;
}

// ── per-job record ───────────────────────────────────────────────────────
function newRecord(name) { return { name, steps: [], rejections: [], awkward: [], cannot: [], mismatches: [], checks: { pass: 0, fail: 0 } }; }
let R;
const step = (what, ok, detail = '') => { R.steps.push({ what, ok, detail }); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` - ${detail}` : ''}`); };
const syncStep = async (what, events, { expectRejected = 0 } = {}) => {
  const s = await sync(events);
  for (const x of s.rejected) R.rejections.push({ during: what, ...x });
  step(what, s.rejected.length === expectRejected, `${s.applied.length} applied, ${s.rejected.length} rejected${s.rejected.length ? `: ${s.rejected.slice(0, 3).map((x) => `${x.clause ?? ''} ${x.reason}`).join(' | ')}` : ''}`);
  return s;
};

// ── workbook → finding payload ───────────────────────────────────────────
/**
 * The workbook encodes meaning in font colour: red = the finding, blue = a
 * general comment (Tatenda's feedback), green = resolved, black = text.
 * The app has comment + failureReason (NC) + generalComment (blue) + naReason.
 */
function toFinding(f, { overrideStatus } = {}) {
  const status = overrideStatus ?? f.status;
  const p = { status, comment: f.comment ?? null };
  if (f.runs) {
    const by = (role) => f.runs.filter((r) => r.role === role).map((r) => r.text.trim()).join(' ');
    const blue = by('blue');
    const red = by('finding');
    const rest = f.runs.filter((r) => r.role !== 'blue' && r.role !== 'finding').map((r) => r.text.trim()).join(' ');
    if (blue) p.generalComment = blue;
    if (status === 'non_compliant') { p.failureReason = red || f.comment; p.comment = rest || null; }
    else p.comment = [rest, red].filter(Boolean).join(' ') || null;
  } else if (status === 'non_compliant') {
    p.failureReason = f.comment || 'Non-compliant (no reason written in the workbook)';
  }
  if (status === 'not_applicable') {
    // "N/A" / "Not Applicable" is the workbook's whole comment: the app's status says it.
    if (f.comment && /^\s*(n\/?a|not applicable)\.?\s*$/i.test(f.comment)) p.comment = f.comment;
  }
  return p;
}

// ── evidence ─────────────────────────────────────────────────────────────
async function upload(buf, mime, name) {
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const u = await call('POST', '/api/evidence/upload-url', { sha256, mime, bytes: buf.length, name });
  if (u.status !== 200) throw new Error(`upload-url ${u.status} ${u.text}`);
  if (u.json.mode === 'server') {
    const up = await call('POST', '/api/evidence/upload', buf, { headers: { 'content-type': mime, 'x-sha256': sha256 } });
    if (up.status !== 201) throw new Error(`upload ${up.status} ${up.text}`);
    return { sha256, storageKey: up.json.storageKey, bytes: buf.length, mime };
  }
  if (u.json.mode === 'exists') return { sha256, storageKey: u.json.storageKey, bytes: buf.length, mime };
  throw new Error(`unexpected upload mode ${u.json.mode}`);
}
function makePdf(title, lines) {
  return new Promise((res) => {
    const d = new PDFDocument({ size: 'A4' }); const c = [];
    d.on('data', (x) => c.push(x)); d.on('end', () => res(Buffer.concat(c)));
    d.fontSize(16).text(title); d.moveDown(); for (const l of lines) d.fontSize(10).text(l);
    d.end();
  });
}

// ── PDF reading ──────────────────────────────────────────────────────────
const CP1252 = new TextDecoder('windows-1252');
const norm = (s) => pdfText(String(s ?? '')).replace(/\s+/g, ' ').trim();
/** Text lines with their fill colour, from pdfkit's content streams. */
function pdfColouredLines(buf) {
  const s = buf.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g; let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) break;
    let body;
    try { body = inflateSync(Buffer.from(s.slice(start, end), 'latin1')).toString('latin1'); } catch { continue; }
    let colour = '#000000';
    const ops = /([\d.]+) ([\d.]+) ([\d.]+) (?:rg|scn)\b|\[((?:[^\]\\]|\\.)*)\] TJ|<([0-9a-fA-F]*)> Tj/g; let o;
    while ((o = ops.exec(body))) {
      if (o[1] != null) {
        colour = '#' + [o[1], o[2], o[3]].map((v) => Math.round(Number(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
      } else {
        const hexes = o[4] != null ? [...o[4].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1]) : [o[5]];
        const text = hexes.map((h) => CP1252.decode(Buffer.from(h, 'hex'))).join('');
        out.push({ colour, text });
      }
    }
    re.lastIndex = end;
  }
  return out;
}
const COLOUR_NAME = { '#FF0000': 'red', '#00B050': 'green', '#0070C0': 'blue', '#7F7F7F': 'grey', '#C65911': 'amber', '#111111': 'black', '#666666': 'muted', '#000000': 'black' };
function colourStreams(lines) {
  const by = {};
  for (const l of lines) { const k = COLOUR_NAME[l.colour] ?? l.colour; (by[k] ??= []).push(l.text); }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.join(' ').replace(/\s+/g, ' ')]));
}

// ── workbook cells (source of truth for wording) ─────────────────────────
async function readWorkbook(path) {
  if (!path || !existsSync(path)) return null;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path);
  const cellText = (v) => {
    if (v == null) return '';
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map((r) => r.text).join('');
      if (v.text != null) return typeof v.text === 'object' ? cellText(v.text) : String(v.text);
      if (v.result != null) return String(v.result);
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (v.hyperlink) return String(v.hyperlink);
    }
    return String(v);
  };
  return wb.worksheets.map((ws) => ({
    name: ws.name,
    row: (r) => { const row = ws.getRow(r); return ['A', 'B', 'C', 'D', 'E', 'F'].map((c, k) => cellText(row.getCell(k + 1).value)); },
    all: () => { const t = []; ws.eachRow((row) => row.eachCell((c) => { const x = cellText(c.value); if (x) t.push(x); })); return t; },
  }));
}

// ── comparison ───────────────────────────────────────────────────────────
function compare({ pdfBuf, txt, job, sheets, wb, expectations }) {
  const flat = norm(txt);
  const streams = colourStreams(pdfColouredLines(pdfBuf));
  const allText = norm(Object.values(streams).join(' '));
  const has = (s) => { const n = norm(s); return !n || flat.includes(n) || allText.includes(n); };
  const inColour = (s, c) => { const n = norm(s); return !n || norm(streams[c] ?? '').includes(n); };
  const mm = (kind, where, detail) => { R.mismatches.push({ kind, where, detail }); R.checks.fail++; };
  const ok = () => R.checks.pass++;
  const excluded = new Set((job.excludedSections ?? []).map((x) => `${x.template_code}:${x.section_ordinal}`));
  const counts = {};
  for (const sh of sheets) {
    const ws = wb?.[sh.wbSheet];
    for (const f of sh.inst.findings) {
      const id = `${sh.label} ${f.sectionOrdinal}/${f.itemOrdinal} (row ${f.row})`;
      const out = excluded.has(`${sh.code}:${f.sectionOrdinal}`);
      counts[out ? 'excluded' : 'inScope'] = (counts[out ? 'excluded' : 'inScope'] ?? 0) + 1;
      if (ws) {
        const [A, B, C, D] = ws.row(f.row);
        for (const [col, val] of [['Action', C], ['Records', D], ['Regulation', B]]) {
          if (!val) continue;
          const present = has(val);
          if (out) { if (present && col === 'Action' && norm(val).length > 40) mm('scope', id, `section outside scope but its action text is printed`); continue; }
          if (present) ok(); else mm('wording', id, `${col} not found verbatim in PDF. Workbook: "${val.slice(0, 160)}${val.length > 160 ? '…' : ''}"`);
        }
      }
      if (out) continue;
      const app = job.findings.find((x) => x.template_code === sh.code && x.section_ordinal === f.sectionOrdinal && x.item_ordinal === f.itemOrdinal);
      const sent = sh.sent.get(`${f.sectionOrdinal}/${f.itemOrdinal}`);
      if (!app) { mm('finding', id, 'no finding stored'); continue; }
      if (sent && app.status !== sent.status) mm('status', id, `sent ${sent.status}, stored ${app.status}`); else ok();
      if (f.status !== app.status) R.mismatches.push({ kind: 'status-vs-workbook', where: id, detail: `workbook ${f.status} (${f.statusSource}), app ${app.status}` });
      // Comment text and colour.
      const wantColour = app.status === 'non_compliant' ? 'red' : app.status === 'compliant' ? 'green' : app.status === 'not_applicable' ? 'grey' : 'amber';
      const wbColour = (f.statusSource || '').includes('FFFF0000') ? 'red' : (f.statusSource || '').includes('FF00B050') ? 'green' : 'black';
      if (sent?.failureReason && !inColour(sent.failureReason, 'red')) mm('colour', id, `failure reason not printed in red: "${sent.failureReason.slice(0, 80)}"`);
      else if (sent?.failureReason) ok();
      if (sent?.generalComment) { if (inColour(sent.generalComment, 'blue')) ok(); else mm('colour', id, `general comment not printed in blue`); }
      if (sent?.comment && !/^\s*(n\/?a|not applicable)\.?\s*$/i.test(sent.comment)) {
        if (inColour(sent.comment, wantColour)) ok();
        else if (has(sent.comment)) mm('colour', id, `comment printed but not in ${wantColour}`);
        else mm('wording', id, `comment not found in PDF: "${sent.comment.slice(0, 100)}"`);
      }
      if (wbColour !== wantColour && !(wbColour === 'black' && app.status === 'not_applicable'))
        R.mismatches.push({ kind: 'colour-vs-workbook', where: id, detail: `workbook ${wbColour}${f.runs ? ' (mixed runs: ' + f.runs.map((r) => r.colour).join('+') + ')' : ''}, PDF ${wantColour}` });
    }
  }
  for (const [what, val] of expectations) { if (has(val)) ok(); else mm('trailing', what, `"${String(val).slice(0, 200)}" not in PDF`); }
  return { counts, streams: Object.fromEntries(Object.entries(streams).map(([k, v]) => [k, v.length])) };
}

// ── the replay ───────────────────────────────────────────────────────────
async function createJob(spec) {
  const r = await call('POST', '/api/jobs', spec);
  step(`POST /api/jobs (${spec.classKey}${spec.scopeChoices ? ' ' + spec.scopeChoices.join(',') : ''})`, r.status === 201, r.status === 201 ? `job ${r.json.jobId}` : `${r.status} ${r.text}`);
  if (r.status !== 201) throw new Error('job create failed');
  return r.json;
}

async function walkToInspection(jobId, hsLocationId, party, templateCodes, inspectedAt) {
  await syncStep('stage 1-3: enquiry, application, document review, RFI loop', [
    ev('communication.record', { jobId, direction: 'inbound', medium: 'email', party, summary: 'Enquiry: location compliance certificate' }),
    ev('job.transition', { jobId, toStage: 'application' }),
    ev('communication.record', { jobId, direction: 'outbound', medium: 'email', party, summary: 'Application pack sent' }),
    ev('job.transition', { jobId, toStage: 'document_review' }),
    ev('communication.record', { jobId, direction: 'outbound', medium: 'email', party, summary: 'Request for further information', body: 'Inventory register\nEmergency response plan\nSite plan' }),
    ev('job.transition', { jobId, toStage: 'rfi', reason: 'RFI issued' }),
    ev('communication.record', { jobId, direction: 'inbound', medium: 'email', party, summary: 'RFI answered' }),
    ev('job.transition', { jobId, toStage: 'document_review', reason: 'RFI answered' }),
    ev('job.transition', { jobId, toStage: 'site_inspection' }),
  ]);
  const s = await syncStep('stage 4: open inspection', [ev('inspection.open', { jobId, hsLocationId, inspectedAt, equipmentUsed: 'iPad and tape measure', templateCodes })]);
  return s.applied[0]?.result?.inspectionId;
}

async function enterFindings(inspectionId, sheets, overrides = {}) {
  for (const sh of sheets) {
    sh.sent = new Map();
    const events = sh.inst.findings.map((f) => {
      const key = `${f.sectionOrdinal}/${f.itemOrdinal}`;
      const o = overrides[`${sh.code}:${key}`];
      const p = { ...toFinding(f, { overrideStatus: o?.status }), ...(o?.extra ?? {}) };
      sh.sent.set(key, p);
      return ev('finding.upsert', { inspectionId, templateCode: sh.code, sectionOrdinal: f.sectionOrdinal, itemOrdinal: f.itemOrdinal, verificationMethod: null, ...p });
    });
    const s = await sync(events);
    for (const x of s.rejected) {
      const e = events.find((y) => y.id === x.id);
      R.rejections.push({ during: `findings ${sh.label}`, item: `${e.payload.sectionOrdinal}/${e.payload.itemOrdinal}`, status: e.payload.status, ...x });
    }
    step(`findings ${sh.label}: ${events.length} workbook rows`, true, `${s.applied.length} applied, ${s.rejected.length} rejected`);
  }
}

async function attachEvidence(jobId, inspectionId, items) {
  const events = [];
  for (const it of items) {
    const st = await upload(it.buf, it.mime, it.name);
    events.push(ev('evidence.attach', {
      jobId, inspectionId, templateCode: it.templateCode, sectionOrdinal: it.sectionOrdinal, itemOrdinal: it.itemOrdinal,
      kind: it.kind ?? (it.mime === 'application/pdf' ? 'document' : 'photo'), sha256: st.sha256, storageKey: st.storageKey,
      mime: it.mime, bytes: st.bytes, provenance: it.provenance ?? 'app', originalName: it.name, appendixCategory: it.appendix ?? null,
      capturedByName: 'Bryan Wilson', capturedByOccupation: 'Compliance certifier', capturedAt: it.capturedAt ?? new Date().toISOString(), capturedWhere: it.where ?? 'site',
    }));
  }
  return syncStep(`evidence: ${items.length} files uploaded and attached`, events);
}

async function finish(jobId, inspectionId, { decision, cert, cas = [], gapLoop = false, tryBefore = [] }) {
  await syncStep('sign declaration and scope of authorisation; declare interests (IPS 21(5), 23)', [
    ev('inspection.sign', { inspectionId, which: 'declaration' }),
    ev('inspection.sign', { inspectionId, which: 'scope' }),
    ev('interest.declare', { jobId, conflictFound: false }),
  ]);
  await syncStep('stage 5: compliance evaluation', [ev('job.transition', { jobId, toStage: 'compliance_evaluation' })]);
  for (const ca of cas) {
    const s = await syncStep(`corrective action raised: ${ca.key}`, [ev('corrective_action.raise', ca.raise)]);
    ca.id = s.applied[0]?.result?.correctiveActionId;
  }
  if (gapLoop) {
    await syncStep('gap closure loop', [ev('job.transition', { jobId, toStage: 'gap_closure', reason: 'corrective actions issued' })]);
    for (const ca of cas.filter((c) => c.verify && c.id)) {
      await syncStep(`corrective action ${ca.key}: resolved then verified`, [
        ev('corrective_action.update', { correctiveActionId: ca.id, status: 'resolved' }),
        ev('corrective_action.update', { correctiveActionId: ca.id, status: 'verified' }),
      ]);
    }
    await syncStep('back to compliance evaluation', [ev('job.transition', { jobId, toStage: 'compliance_evaluation', reason: 'gaps closed' })]);
  }
  await syncStep('stage 6: final validation', [ev('job.transition', { jobId, toStage: 'final_validation' })]);
  const chk = await call('GET', `/api/jobs/${jobId}/issuance-check`);
  step('issuance dry-run', chk.status === 200, JSON.stringify(chk.json));
  for (const t of tryBefore) {
    const r = await call('POST', `/api/jobs/${jobId}/certificate`, t.body);
    step(`expected refusal: ${t.what}`, r.status === t.expect, `${r.status} ${r.text?.slice(0, 220)}`);
    if (t.after) await t.after();
  }
  const r = await call('POST', `/api/jobs/${jobId}/certificate`, { inspectionId, decision, ...cert });
  step(`stage 7: issue ${decision} certificate`, r.status === 201, `${r.status} ${r.text?.slice(0, 300)}`);
  return r;
}

async function exportsFor(slug, jobId) {
  const files = {};
  const pdf = await call('GET', `/api/jobs/${jobId}/checksheet.pdf`);
  step('GET checksheet.pdf', pdf.status === 200 && pdf.buf.slice(0, 4).toString() === '%PDF', `${pdf.status}, ${pdf.buf.length} bytes`);
  writeFileSync(files.pdf = join(OUT, `${slug}.pdf`), pdf.buf);
  const zip = await call('GET', `/api/jobs/${jobId}/bundle.zip`);
  step('GET bundle.zip', zip.status === 200 && zip.buf.slice(0, 2).toString() === 'PK', `${zip.status}, ${zip.buf.length} bytes, ${zip.headers['x-bundle-files'] ?? '?'} files`);
  writeFileSync(files.zip = join(OUT, `${slug}.zip`), zip.buf);
  const bpost = await call('POST', `/api/jobs/${jobId}/bundle`);
  step('POST bundle (app route)', bpost.status === 200, `${bpost.status} ${bpost.headers['content-type']}`);
  const cert = await call('GET', `/api/jobs/${jobId}/certificate.html`);
  step('GET certificate.html', cert.status === 200, `${cert.status}`);
  if (cert.text) writeFileSync(files.cert = join(OUT, `${slug}-certificate.html`), cert.text);
  const nc = await call('GET', `/api/jobs/${jobId}/non-compliance.html`);
  step('GET non-compliance.html', nc.status === 200, `${nc.status}`);
  if (nc.text) writeFileSync(files.nc = join(OUT, `${slug}-non-compliance.html`), nc.text);
  for (const document of ['non_compliance', 'certificate']) {
    const s = await call('POST', `/api/jobs/${jobId}/send`, { document, to: 'replay@example.invalid' });
    step(`send ${document} (no SMTP)`, s.status === 200, `${s.status} ${s.json?.summary ?? s.text}`);
  }
  execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', files.pdf, files.txt = join(OUT, `${slug}.txt`)]);
  // ZIP entry names from the central directory.
  const z = zip.buf; const names = [];
  for (let i = 0; i < z.length - 4; i++) if (z.readUInt32LE(i) === 0x02014b50) { const n = z.readUInt16LE(i + 28); names.push(z.slice(i + 46, i + 46 + n).toString('utf8')); }
  files.zipEntries = names;
  return { files, pdfBuf: pdf.buf, txt: readFileSync(files.txt, 'utf8'), certHtml: cert.text, ncHtml: nc.text };
}

// ══════════════════════════════════════════════════════════════════════════
const results = [];
const login = await call('POST', '/api/auth/login', { email: 'compliancecertifier@assuresafety.co.nz', passcode: PASS, deviceId: DEVICE });
if (login.status !== 200) { console.error('login failed', login.status, login.text); process.exit(1); }
TOKEN = login.json.token;
console.log(`signed in as ${login.json.user.fullName} (${login.json.user.role})`);
const wbG2 = await readWorkbook(G2_XLSX);
const wbAB = await readWorkbook(AB_XLSX);

const sb = (inst, k) => inst.siteBlock[k] ?? null;
const GEN = 'wks17-general', C68 = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8', C23 = 'wks17-class-2-and-3-1-substances';

function g2Spec() {
  const s = G2.general;
  return {
    classKey: 'class_6_8',
    client: { legalName: sb(s, 'Legal Entity Name'), tradingName: sb(s, 'Trading as Name'), nzbn: sb(s, 'NZBN'),
      companiesNumber: G2.cert.location.companyNumber, postalAddress: sb(s, 'Postal Address'), phone: sb(s, 'Business Phone Number'),
      website: sb(s, 'Business Website'), industry: sb(s, 'Description of Business Type / Industry') },
    site: { address: sb(s, 'Site / Location Address') },
    location: { name: 'G2 Chiller', summary: sb(s, 'Brief location summary') },
    contacts: [{ name: sb(s, 'Manager Name'), phone: sb(s, 'Direct Dial Number and/or Mobile Number'), role: 'Site manager', isSiteManager: true }],
    substances: G2.cert.substances.map((x) => ({ name: x.name, hazardClass: x.hazardClass, quantity: Number.parseFloat(x.maxQuantity), unit: x.maxQuantity.replace(/^[\d.,\s]+/, '') })),
  };
}
async function g2Evidence(jobId, inspectionId) {
  const dir = join(data, 'evidence', 'g2-chiller');
  const rowMap = (sheet, row) => {
    const inst = sheet.startsWith('Locations') ? G2.general : G2.cls;
    const f = inst.findings.find((x) => x.row === row);
    return f ? { templateCode: sheet.startsWith('Locations') ? GEN : C68, sectionOrdinal: f.sectionOrdinal, itemOrdinal: f.itemOrdinal } : null;
  };
  const items = []; const unplaced = [];
  for (const e of G2.manifest.filter((m) => m.classification === 'evidence' && m.source.sheet !== 'Certificate')) {
    const row = Number(String(e.source.anchorCell).replace(/^[A-Z]+/, ''));
    const at = rowMap(e.source.sheet, row);
    if (!at) { unplaced.push(`${e.id} ${e.source.sheet}!${e.source.anchorCell}`); continue; }
    items.push({ ...at, buf: readFileSync(join(dir, e.file)), mime: e.mime, name: `${e.id} ${e.source.anchorCell}.${e.ext}`, provenance: 'migrated' });
  }
  items.push({ templateCode: GEN, sectionOrdinal: 6, itemOrdinal: 1, mime: 'application/pdf', kind: 'document', appendix: 'Appendix 5', name: 'Draft ERP G2 Chiller.pdf',
    buf: await makePdf('Emergency Response Plan (replay test document)', ['Draft ERP - replay fixture', 'Not a real document'] ) });
  if (unplaced.length) R.cannot.push(`G2 workbook images anchored outside any item row (signature / document-control area) have no item to attach to: ${unplaced.join('; ')}`);
  return attachEvidence(jobId, inspectionId, items);
}

// ── JOB 1: G2 Chiller, the checksheet decision as written (refused) ────────
{
  R = newRecord('G2 Chiller, class 6/8: refusal as the checksheet decision row says');
  console.log(`\n== ${R.name}`);
  const spec = g2Spec();
  const j = await createJob(spec);
  const inspectionId = await walkToInspection(j.jobId, j.hsLocationId, 'Site manager', [GEN, C68], null);
  const sheets = [
    { label: 'Locations General', code: GEN, inst: G2.general, wbSheet: 0 },
    { label: 'Class 6/8', code: C68, inst: G2.cls, wbSheet: 1 },
  ];
  await enterFindings(inspectionId, sheets);
  await g2Evidence(j.jobId, inspectionId);
  const decisionLines = ['Important compliance documents are still in draft form (SOPs and ERP)', 'Signage to meet requirements of regulation 2.6 (5)(ii)'];
  const cr = await finish(j.jobId, inspectionId, {
    decision: 'refused',
    cert: { certificateNumber: 'TST100250-26-REF-G2', issuedTo: 'Site manager', appliesTo: spec.site.address, issueDate: '2026-06-20', requirementsNotMet: decisionLines },
    tryBefore: [{
      what: 'refusal while item 6/2 of the class sheet is blank in the workbook', expect: 422,
      body: { inspectionId, decision: 'refused', certificateNumber: 'TST100250-26-REF-G2', issuedTo: 'Site manager', appliesTo: spec.site.address, issueDate: '2026-06-20', requirementsNotMet: decisionLines },
      after: async () => {
        R.awkward.push('Class 6/8 item 6/2 (indoor cabinet for class 8) is blank in the workbook; the app blocks every decision, refusal included, until it is answered (reg 13.39). Replay marked it N/A with a reason.');
        const s = await sync([ev('finding.upsert', { inspectionId, templateCode: C68, sectionOrdinal: 6, itemOrdinal: 2, status: 'not_applicable', naReason: 'No class 8 substances held (blank in workbook)' })]);
        sheets[1].sent.set('6/2', { status: 'not_applicable' });
        step('item 6/2 answered N/A to unblock', s.rejected.length === 0);
      },
    }],
  });
  const x = await exportsFor('job1-g2-refused', j.jobId);
  const job = (await call('GET', `/api/jobs/${j.jobId}`)).json;
  const cmp = compare({ pdfBuf: x.pdfBuf, txt: x.txt, job, sheets, wb: wbG2, expectations: [
    ['declaration (class 6/8 cites 13.38)', G2.general.trailing.declaration.replace(/ Site Assessor confirmation.*$/, '')],
    ['note', G2.general.trailing.note], ['reference', G2.cls.trailing.reference],
    ...decisionLines.map((l, k) => [`decision line ${k + 1}`, l]),
    ['decision wording (workbook)', 'Compliance certificate refused to be issued with the following conditions'],
    ...['Legal Entity Name', 'Trading as Name', 'Site / Location Address', 'Postal Address', 'Business Phone Number', 'Business Website', 'NZBN', 'Description of Business Type / Industry', 'Manager Name', 'Direct Dial Number and/or Mobile Number', 'Brief location summary']
      .map((k) => [`site block: ${k}`, sb(G2.general, k)]),
  ] });
  results.push({ ...R, jobId: j.jobId, certificate: cr.json, job: summarise(job), compare: cmp, files: x.files });
}

// ── JOB 2: G2 Chiller, corrective actions closed, granted (Certificate tab) ──
{
  R = newRecord('G2 Chiller, class 6/8: corrective actions closed, granted as on the Certificate tab');
  console.log(`\n== ${R.name}`);
  const spec = g2Spec();
  const j = await createJob(spec);
  const inspectionId = await walkToInspection(j.jobId, j.hsLocationId, 'Site manager', [GEN, C68], null);
  const sheets = [
    { label: 'Locations General', code: GEN, inst: G2.general, wbSheet: 0 },
    { label: 'Class 6/8', code: C68, inst: G2.cls, wbSheet: 1 },
  ];
  await enterFindings(inspectionId, sheets, { [`${C68}:6/2`]: { status: 'not_applicable', extra: { naReason: 'No class 8 substances held (blank in workbook)' } } });
  const ncs = G2.general.findings.filter((f) => f.status === 'non_compliant');
  const cas = ncs.map((f) => ({ key: `general ${f.sectionOrdinal}/${f.itemOrdinal}`, verify: true,
    raise: { inspectionId, templateCode: GEN, sectionOrdinal: f.sectionOrdinal, itemOrdinal: f.itemOrdinal, severity: 'major', description: `Close: ${f.comment.slice(0, 120)}`, dueDate: '2026-07-01' } }));
  const c = G2.cert;
  const certBody = { certificateNumber: c.certificateNumber, issuedTo: 'Site manager', appliesTo: c.location.address, issueDate: c.issueDate, inForceDate: c.inForceDate, expiryDate: c.expiryDate, details: c.detailsOfCertification };
  const cr = await finish(j.jobId, inspectionId, {
    decision: 'granted', cas, gapLoop: true, cert: { ...certBody, registerNumber: c.registerNumber },
    tryBefore: [{ what: `workbook number ${c.certificateNumber} with no register number (IPS 8(1)(c)(ii) prefix rule)`, expect: 422, body: { inspectionId, decision: 'granted', ...certBody } }],
  });
  const x = await exportsFor('job2-g2-granted', j.jobId);
  const job = (await call('GET', `/api/jobs/${j.jobId}`)).json;
  const cmp = compare({ pdfBuf: x.pdfBuf, txt: x.txt, job, sheets, wb: wbG2, expectations: [
    ['certificate number', c.certificateNumber],
  ] });
  // Certificate HTML vs certificate.json
  for (const [k, v] of [['documentTitle', 'COMPLIANCE CERTIFICATE'], ['certificateNumber', c.certificateNumber], ['registerNumber', c.registerNumber], ['issuedUnder', c.issuedUnder], ['certifiesThat', c.certifiesThat], ['details', c.detailsOfCertification.slice(0, 80)], ['issuerStatement', c.issuerStatement.slice(0, 80)], ['postNominals', c.certifier.postNominals], ['companyNumber', c.location.companyNumber], ...c.substances.map((s) => [`substance ${s.name}`, s.name]), ['expiry', '2029']]) {
    const html = (x.certHtml ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
    if (html.includes(String(v).replace(/\s+/g, ' ').trim()) || html.includes(String(v).replace(/’/g, "'"))) R.checks.pass++;
    else { R.mismatches.push({ kind: 'certificate', where: k, detail: `"${String(v).slice(0, 120)}" not in certificate.html` }); R.checks.fail++; }
  }
  results.push({ ...R, jobId: j.jobId, certificate: cr.json, job: summarise(job), compare: cmp, files: x.files });
}

// ── JOB 3: Abecca, class 2/3.1, conditional with Tatenda's feedback ─────────
{
  R = newRecord('Abecca, class 2/3.1 (Type B store): conditional, with feedback');
  console.log(`\n== ${R.name}`);
  const s = AB.general;
  const spec = {
    classKey: 'class_2_3', scopeChoices: ['3_1_separate_building', '3_1_workroom'],
    client: { legalName: sb(s, 'Legal Entity Name'), tradingName: sb(s, 'Trading as Name'), nzbn: sb(s, 'NZBN'), postalAddress: sb(s, 'Postal Address'),
      phone: sb(s, 'Business Phone Number'), website: sb(s, 'Business Website'), industry: sb(s, 'Description of Business Type / Industry') },
    site: { address: sb(s, 'Site / Location Address') },
    location: { name: 'Type B store', summary: sb(s, 'Brief location summary') },
    contacts: [{ name: sb(s, 'Manager Name'), phone: sb(s, 'Direct Dial Number and/or Mobile Number'), role: 'Site manager', isSiteManager: true }],
    substances: [{ name: sb(s, 'Hazardous substance name'), hazardClass: '3.1B', quantity: 3350, unit: 'L' }],
  };
  // The app refuses a class 2/3.1 job with no scope choice: prove it.
  const noScope = await call('POST', '/api/jobs', { ...spec, scopeChoices: undefined });
  step('POST /api/jobs class_2_3 without scope choices is refused', noScope.status === 400, `${noScope.status} ${noScope.json?.error?.slice(0, 120)}`);
  const j = await createJob(spec);
  const inspectionId = await walkToInspection(j.jobId, j.hsLocationId, 'Site manager', [GEN, C23], '2026-01-15T09:00:00+13:00');
  const sheets = [
    { label: 'Locations General', code: GEN, inst: AB.general, wbSheet: 0 },
    { label: 'Class 2 and 3.1', code: C23, inst: AB.cls, wbSheet: 1 },
  ];
  // Red "Not Applicable" on items 20/1, 20/2: the workbook colours them as findings; entered as N/A.
  await enterFindings(inspectionId, sheets, {
    [`${C23}:20/1`]: { status: 'not_applicable', extra: { naReason: 'Workbook: "Not Applicable" in red' } },
    [`${C23}:20/2`]: { status: 'not_applicable', extra: { naReason: 'Workbook: "Not Applicable" in red' } },
  });
  R.awkward.push('Class 2/3.1 items 20/1 and 20/2 say "Not Applicable" in red (red = non-compliance): ambiguous; entered as N/A.');
  await attachEvidence(j.jobId, inspectionId, [
    { templateCode: GEN, sectionOrdinal: 6, itemOrdinal: 2, mime: 'application/pdf', kind: 'document', appendix: 'Appendix 5', name: 'ERP incomplete.pdf', buf: await makePdf('ERP (replay fixture)', ['incomplete']) },
    { templateCode: C23, sectionOrdinal: 13, itemOrdinal: 1, mime: 'image/png', name: 'type B store.png', buf: readFileSync(join(data, 'evidence', 'g2-chiller', '7e3f200b3f4e8986.png')) },
  ]);
  const conditions = ['Site plan to be updated to meet requirements of regulation 13.34(5)(b)', 'Signage to meet requirements of regulation 2.6 (5)(ii)'];
  const job0 = (await call('GET', `/api/jobs/${j.jobId}`)).json;
  const cas = job0.findings.filter((f) => f.status === 'non_compliant').map((f) => ({ key: `${f.template_code} ${f.section_ordinal}/${f.item_ordinal}`,
    raise: { findingId: f.id, severity: 'minor', description: `Close ${f.template_code} ${f.section_ordinal}/${f.item_ordinal}`, dueDate: '2026-03-15' } }));
  const cr = await finish(j.jobId, inspectionId, {
    decision: 'conditional', cas,
    cert: { certificateNumber: 'TST100250-26-ABC-01', issuedTo: 'Site manager', appliesTo: spec.site.address, issueDate: '2026-01-30', expiryDate: '2027-01-30', conditions },
  });
  const x = await exportsFor('job3-abecca-conditional', j.jobId);
  const job = (await call('GET', `/api/jobs/${j.jobId}`)).json;
  const cmp = compare({ pdfBuf: x.pdfBuf, txt: x.txt, job, sheets, wb: wbAB, expectations: [
    ['declaration as in the Abecca workbook (cites 17.91)', AB.cls.trailing.declaration.replace(/ Site Assessor confirmation.*$/, '')],
    ['declaration (opening, any regulation)', 'Declaration: I verify that I have examined the evidence and conducted the compliance audit as per Regulation'],
    ['note', AB.general.trailing.note], ['reference', AB.cls.trailing.reference],
    ...conditions.map((l, k) => [`condition ${k + 1}`, l]),
    ['decision wording (workbook)', 'Conditional compliance certificate to be issued with the following conditions'],
    ['status of inspection (site block)', 'Mock'],
    ...['Legal Entity Name', 'Trading as Name', 'Site / Location Address', 'Postal Address', 'Business Phone Number', 'Business Website', 'NZBN', 'Description of Business Type / Industry', 'Manager Name', 'Direct Dial Number and/or Mobile Number', 'Hazardous substance name', 'Hazardous Substance Location', 'Brief location summary']
      .map((k) => [`site block: ${k}`, sb(AB.general, k)]),
  ] });
  results.push({ ...R, jobId: j.jobId, certificate: cr.json, job: summarise(job), compare: cmp, files: x.files });
}

function summarise(job) {
  return { stage: job.stage, findingCounts: job.findingCounts, itemsInScope: job.itemsInScope, findings: job.findings.length,
    excludedSections: job.excludedSections.map((x) => `${x.template_code}#${x.section_ordinal}:${x.reason}`),
    evidence: job.evidence.length, correctiveActions: job.correctiveActions.map((c) => c.status),
    certificate: job.certificate && { decision: job.certificate.decision, number: job.certificate.certificate_number, register: job.certificate.register_number },
    retention: job.retention, transitions: job.transitions.map((t) => t.to_stage).join(' > '),
    communications: job.communications.length, events: job.events.length };
}

writeFileSync(join(OUT, 'results.json'), JSON.stringify({ results, errors500, calls: log.length }, null, 2));
console.log(`\n${log.length} calls, ${errors500.length} server errors. Results in ${join(OUT, 'results.json')}`);
for (const r of results) console.log(`${r.name}: ${r.checks.pass} checks ok, ${r.checks.fail} failed, ${r.mismatches.length} mismatches, ${r.rejections.length} rejections`);
