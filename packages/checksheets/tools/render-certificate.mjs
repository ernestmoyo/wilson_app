#!/usr/bin/env node
/**
 * CLI wrapper: render a certificate.json directory to certificate.html.
 * The rendering itself lives in lib/render-certificate.mjs so the server can
 * produce the identical document from findings.
 *
 * Usage:
 *   node tools/render-certificate.mjs <dir-with-certificate.json> [--out <file>]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { renderCertificateHtml } from '../lib/render-certificate.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('usage: render-certificate.mjs <dir-with-certificate.json> [--out <file>]');
  process.exit(1);
}
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(dir, 'certificate.html');

const cert = JSON.parse(readFileSync(join(dir, 'certificate.json'), 'utf8'));

let signatureDataUrl = null;
if (cert.certifier.signatureImage) {
  const p = join(dir, cert.certifier.signatureImage);
  if (existsSync(p)) {
    const ext = cert.certifier.signatureImage.split('.').pop().toLowerCase();
    const mime = ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : 'image/png';
    signatureDataUrl = `data:${mime};base64,${readFileSync(p).toString('base64')}`;
  }
}

writeFileSync(outFile, renderCertificateHtml(cert, { signatureDataUrl }));
console.log(`rendered → ${outFile}`);
console.log(`  ${cert.documentTitle} · ${cert.pcbu.legalName}`);
console.log(`  ${cert.substances.length} substances · expires ${cert.expiryDate}`);
console.log(`  signature: ${signatureDataUrl ? 'inlined' : 'MISSING'}`);
