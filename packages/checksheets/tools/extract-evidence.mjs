#!/usr/bin/env node
/**
 * Extract every image from a check sheet workbook, resolve what it is anchored
 * to, and record what IPS cl. 21(4) requires to be known about it.
 *
 * A workbook stores images by THREE different mechanisms, and a tool that
 * knows about only one silently loses evidence:
 *
 *   1. DrawingML  (xl/drawings/drawingN.xml)
 *      Floating images anchored to a cell. This is what most libraries return.
 *
 *   2. Rich values / "Place in Cell"  (xl/richData/ + the cell's vm= attribute)
 *      Images stored INSIDE a cell. They surface through a normal reader as a
 *      #VALUE! error and are otherwise invisible. In the G2 Chiller workbook
 *      this is where the Evidence Portfolio photos live — 3.3 MB of the total,
 *      the majority of the real evidence by volume.
 *
 *   3. Legacy VML  (xl/drawings/vmlDrawingN.vml)
 *      Older-style images. Here they carry the Assure Safety letterhead, not
 *      evidence, so they are classified as branding rather than records.
 *
 * IPS cl. 21(4) requires, for every photograph used as a record: the name AND
 * OCCUPATION of the photographer, the date, and the place. None of it travels
 * with an embedded image. Each entry therefore states explicitly what is
 * unknown, so the gap is visible rather than assumed away.
 *
 * Usage:
 *   node tools/extract-evidence.mjs <workbook.xlsx> --out <dir>
 */

import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join, basename } from 'path';

const require2 = createRequire(new URL('../package.json', import.meta.url));
const JSZip = require2('jszip');
const { readFile } = await import('fs/promises');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.';
if (!file) {
  console.error('usage: extract-evidence.mjs <workbook.xlsx> --out <dir>');
  process.exit(1);
}

const zip = await JSZip.loadAsync(await readFile(file));
const textOf = async (p) => (zip.file(p) ? zip.file(p).async('string') : null);

const all = (re, s) => (s ? [...s.matchAll(re)] : []);
const colLetter = (n) => {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// ── sheet name → sheetN.xml ────────────────────────────────────────────────
const wbXml = await textOf('xl/workbook.xml');
const wbRels = await textOf('xl/_rels/workbook.xml.rels');
const relTarget = {};
for (const m of all(/Id="([^"]+)"[^>]*Target="([^"]+)"/g, wbRels)) relTarget[m[1]] = m[2];
const sheets = all(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g, wbXml).map((m) => ({
  name: m[1],
  path: 'xl/' + relTarget[m[2]].replace(/^\/?xl\//, ''),
}));

// ── rich value chain: vm= → valueMetadata → rvb → richValueRel → media ─────
async function buildRichValueMap() {
  const meta = await textOf('xl/metadata.xml');
  const relXml = await textOf('xl/richData/richValueRel.xml');
  const relRels = await textOf('xl/richData/_rels/richValueRel.xml.rels');
  if (!meta || !relXml || !relRels) return [];

  // futureMetadata bk[] in order → rich value index
  const futureIdx = all(/<xlrd:rvb\s+i="(\d+)"/g, meta).map((m) => Number(m[1]));
  // valueMetadata bk[] in order → index into futureMetadata
  const valueMeta = all(/<rc\s+t="\d+"\s+v="(\d+)"\s*\/>/g, meta).map((m) => Number(m[1]));
  // richValueRel rel[] in order → rId
  const relIds = all(/<rel\s+r:id="([^"]+)"/g, relXml).map((m) => m[1]);
  const relMap = {};
  for (const m of all(/Id="([^"]+)"[^>]*Target="([^"]+)"/g, relRels)) relMap[m[1]] = m[2];

  // vm is 1-based into valueMetadata
  return valueMeta.map((fIdx, i) => {
    const rvIdx = futureIdx[fIdx];
    const rId = relIds[rvIdx];
    const target = relMap[rId];
    return {
      vm: i + 1,
      media: target ? 'xl/' + target.replace(/^\.\.\//, '') : null,
    };
  });
}

const richValues = await buildRichValueMap();

// ── DrawingML + VML anchors per sheet ──────────────────────────────────────
async function drawingsFor(sheetPath) {
  const relsPath = sheetPath.replace(/worksheets\/(.+)$/, 'worksheets/_rels/$1.rels');
  const rels = await textOf(relsPath);
  const out = { drawing: null, vml: null };
  for (const m of all(/Target="([^"]*(?:drawing|vmlDrawing)[^"]*)"/g, rels)) {
    const t = 'xl/' + m[1].replace(/^\.\.\//, '');
    if (/vmlDrawing/.test(t)) out.vml = t;
    else out.drawing = t;
  }
  return out;
}

async function relMapFor(xmlPath) {
  const p = xmlPath.replace(/\/([^/]+)$/, '/_rels/$1.rels');
  const rels = await textOf(p);
  const map = {};
  for (const m of all(/Id="([^"]+)"[^>]*Target="([^"]+)"/g, rels))
    map[m[1]] = 'xl/' + m[2].replace(/^\.\.\//, '');
  return map;
}

// ── collect ────────────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });
const manifest = [];
const seenHash = new Map();
let seq = 0;

function add(entry) {
  seq += 1;
  manifest.push({ id: `ev-${String(seq).padStart(3, '0')}`, ...entry });
}

const MIME_BY_EXT = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  emf: 'image/emf',
  wmf: 'image/wmf',
};

async function emitMedia(mediaPath) {
  const f = zip.file(mediaPath);
  if (!f) return null;
  const buf = await f.async('nodebuffer');
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const ext = mediaPath.split('.').pop().toLowerCase();
  // Content-addressed: the file name IS the hash, so the same photo referenced
  // from three places is one stored object.
  const file = `${sha256.slice(0, 16)}.${ext}`;
  if (!seenHash.has(sha256)) {
    writeFileSync(join(outDir, file), buf);
    seenHash.set(sha256, file);
  }
  return {
    file,
    sha256,
    bytes: buf.length,
    ext,
    mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
  };
}

for (const sheet of sheets) {
  const sheetXml = await textOf(sheet.path);
  const { drawing, vml } = await drawingsFor(sheet.path);

  // 1 ── DrawingML floating images
  if (drawing) {
    const dXml = await textOf(drawing);
    const dRels = await relMapFor(drawing);
    // Each anchor block carries a from/row/col and an embed rId.
    for (const m of all(
      /<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<\/xdr:from>[\s\S]*?r:embed="([^"]+)"/g,
      dXml
    )) {
      const mediaPath = dRels[m[3]];
      const info = await emitMedia(mediaPath);
      if (!info) continue;
      const cell = `${colLetter(Number(m[1]))}${Number(m[2]) + 1}`;
      add({
        ...info,
        kind: 'floating',
        mechanism: 'drawingml',
        classification: 'evidence',
        source: { workbook: basename(file), sheet: sheet.name, anchorCell: cell },
        ...ips214Unknown(),
      });
    }
  }

  // 2 ── Rich values: images placed INSIDE cells
  for (const m of all(/<c r="([A-Z]+\d+)"[^>]*\bvm="(\d+)"/g, sheetXml)) {
    const rv = richValues.find((r) => r.vm === Number(m[2]));
    if (!rv?.media) continue;
    const info = await emitMedia(rv.media);
    if (!info) continue;
    add({
      ...info,
      kind: 'in-cell',
      mechanism: 'richvalue',
      classification: 'evidence',
      source: { workbook: basename(file), sheet: sheet.name, anchorCell: m[1] },
      ...ips214Unknown(),
      note:
        'Stored as an in-cell rich value. Invisible to readers that only walk ' +
        'DrawingML anchors, and surfaces as #VALUE! in most tools.',
    });
  }

  // 3 ── Legacy VML: letterhead / branding, not records
  if (vml) {
    const vXml = await textOf(vml);
    const vRels = await relMapFor(vml);
    for (const m of all(/o:relid="([^"]+)"[^>]*o:title="([^"]*)"/g, vXml)) {
      const info = await emitMedia(vRels[m[1]]);
      if (!info) continue;
      add({
        ...info,
        kind: 'branding',
        mechanism: 'vml',
        classification: 'branding',
        title: m[2],
        source: { workbook: basename(file), sheet: sheet.name, anchorCell: null },
      });
    }
  }
}

function ips214Unknown() {
  return {
    // IPS 21(4) — null means genuinely unknown, never "not applicable".
    capturedByName: null,
    capturedByOccupation: null,
    capturedAt: null,
    capturedWhere: null,
    provenance: 'none',
    migrationNote:
      'Recovered from an embedded workbook image. No IPS 21(4) provenance ' +
      'travelled with the file; the certifier must back-fill photographer ' +
      'name, occupation, date and place before this is relied on as a record.',
  };
}

writeFileSync(join(outDir, 'evidence-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ── report ─────────────────────────────────────────────────────────────────
const evidence = manifest.filter((m) => m.classification === 'evidence');
const branding = manifest.filter((m) => m.classification === 'branding');
const uniqueBytes = [...new Set(manifest.map((m) => m.sha256))].reduce(
  (n, h) => n + manifest.find((m) => m.sha256 === h).bytes,
  0
);

console.log(`extracted ${manifest.length} image references → ${outDir}`);
console.log(`  ${seenHash.size} unique objects, ${(uniqueBytes / 1024 / 1024).toFixed(2)} MB (content-addressed by SHA-256)\n`);

for (const group of [
  ['EVIDENCE', evidence],
  ['BRANDING', branding],
]) {
  if (!group[1].length) continue;
  console.log(`${group[0]}`);
  for (const m of group[1]) {
    console.log(
      `  ${m.id}  ${(m.bytes / 1024).toFixed(0).padStart(5)} KB  ${m.mechanism.padEnd(10)} ` +
        `${m.source.sheet.slice(0, 22).padEnd(22)} @ ${m.source.anchorCell ?? '—'}` +
        (m.title ? `  "${m.title}"` : '')
    );
  }
  console.log('');
}

const dupes = manifest.length - seenHash.size;
if (dupes > 0) console.log(`${dupes} duplicate reference(s) collapsed by content addressing.`);
console.log(
  `IPS 21(4) provenance: ${evidence.filter((m) => !m.capturedByName).length}/${evidence.length} ` +
    `evidence images have NO photographer, occupation, date or place recorded.`
);
