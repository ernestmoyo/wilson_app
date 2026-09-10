#!/usr/bin/env node
/**
 * Load a past inspection from its workbook into the server as a job.
 *
 *   node tools/import-job.mjs "<workbook.xlsx>" --api https://assure-safety-platform.vercel.app \
 *        --email compliancecertifier@assuresafety.co.nz --passcode ... [--class class_6_8] [--stage site_inspection]
 *
 * Reads the workbook with the same extractor the templates came from, maps
 * each sheet to its template code, turns the site block into client, site
 * and location, and posts everything to POST /api/jobs/import. The server
 * records the findings as sync events by the signed-in certifier.
 */

import ExcelJS from 'exceljs';
import { basename } from 'path';
import { extractSheet } from './extract-workbook.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
if (!file || !flag('api') || !flag('passcode')) {
  console.error('usage: import-job.mjs <workbook.xlsx> --api <url> --email <email> --passcode <passcode> [--class class_6_8] [--stage site_inspection]');
  process.exit(1);
}

const CODES = [
  [/general/i, 'wks17-general'],
  [/6\.1|8\.2|class 6|class 8/i, 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'],
  [/class 2|3\.1/i, 'wks17-class-2-and-3-1-substances'],
];
const codeFor = (sheetName) => CODES.find(([re]) => re.test(sheetName))?.[1] ?? null;

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const findings = [];
let siteBlock = null;
let inspectedAt = null;
for (const ws of wb.worksheets) {
  const ex = extractSheet(ws, basename(file));
  if (!ex) continue;
  const code = codeFor(ws.name);
  if (!code) { console.log(`  skip "${ws.name}": no template code for this sheet`); continue; }
  siteBlock ??= ex.siteBlock;
  for (const f of ex.findings) {
    findings.push({
      templateCode: code, sectionOrdinal: f.sectionOrdinal, itemOrdinal: f.itemOrdinal,
      status: f.status ?? 'pending', comment: f.comment ?? null, failureReason: f.failureReason ?? f.reason ?? null,
    });
  }
  const dateCell = ex.siteBlock?.['Date of Inspection/Site Visit'];
  if (dateCell && !inspectedAt) {
    const m = String(dateCell).match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    inspectedAt = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])).toISOString() : new Date(dateCell).toISOString();
  }
}
if (!siteBlock) { console.error('no check sheet found in this workbook'); process.exit(1); }

const sb = siteBlock;
const body = {
  client: {
    legalName: sb['Legal Entity Name'], tradingName: sb['Trading as Name'], nzbn: sb['NZBN'],
    postalAddress: sb['Postal Address'], phone: sb['Business Phone Number'], website: sb['Business Website'],
    industry: sb['Description of Business Type / Industry'],
  },
  site: { address: sb['Site / Location Address'] },
  location: { name: sb['Hazardous Substance Location'] ?? basename(file, '.xlsx'), summary: sb['Brief location summary'] },
  contacts: sb['Manager Name'] ? [{ name: sb['Manager Name'], role: 'Site manager', phone: sb['Direct Dial Number and/or Mobile Number'], isSiteManager: true }] : [],
  substances: String(sb['Hazardous substance name'] ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean).map((name) => ({ name, hazardClass: 'unknown' })),
  classKey: flag('class', 'class_6_8'),
  stage: flag('stage', 'site_inspection'),
  inspection: { inspectedAt, equipmentUsed: 'iPad, tape measure' },
  findings,
};

const api = flag('api').replace(/\/$/, '');
const login = await fetch(`${api}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: flag('email', 'compliancecertifier@assuresafety.co.nz'), passcode: flag('passcode'), deviceId: 'import-cli' }) });
if (!login.ok) { console.error('login failed:', await login.text()); process.exit(1); }
const { token } = await login.json();
const r = await fetch(`${api}/api/jobs/import`, { method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-device-id': 'import-cli' },
  body: JSON.stringify(body) });
const out = await r.json();
console.log(r.status, JSON.stringify(out, null, 2));
await fetch(`${api}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
if (!r.ok) process.exit(1);
