#!/usr/bin/env node
/**
 * Build the launcher icon from the Assure Safety mark.
 *
 * The logo is a wide lockup ("A" mark + ASSURE SAFETY wordmark). A launcher
 * icon needs a square, so this isolates the "A" mark — the left portion of the
 * trimmed logo — and centres it on a 1024² white tile with a teal keyline, plus
 * an adaptive-icon foreground (transparent, inside the 66% safe zone).
 *
 *   node packages/checksheets/tools/make-icon.mjs
 *   cd apps/mobile && dart run flutter_launcher_icons
 */

import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const require2 = createRequire(import.meta.url);
const sharp = require2('sharp');

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, '..', 'brand');
const outDir = join(here, '..', '..', '..', 'apps', 'mobile', 'assets', 'brand');
mkdirSync(outDir, { recursive: true });

const TEAL = { r: 0, g: 102, b: 102, alpha: 1 };

// 1. Trim the logo to its ink (materialised — sharp ops are lazy and metadata()
//    on a pipeline reports the source size, not the trimmed size), then take the
//    left portion that holds the mark.
const trimmedBuf = await sharp(join(brand, 'logo-white.png')).trim().png().toBuffer();
const { width, height } = await sharp(trimmedBuf).metadata();
// The "S" of the wordmark overlaps the A's right leg horizontally, so a
// rectangle cannot separate them. The mark is pure black and the wordmark is
// teal: keep only black ink in the left half, drop everything else.
const markWidth = Math.round(width * 0.415); // just past the A's right leg; before the S
const region = await sharp(trimmedBuf)
  .extract({ left: 0, top: 0, width: markWidth, height })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const px = region.data;
for (let i = 0; i < px.length; i += 4) {
  const r = px[i], g = px[i + 1], b = px[i + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const chroma = max - min;            // teal ink is strongly chromatic; the mark is neutral
  if (chroma > 28) { px[i + 3] = 0; continue; }
  // Neutral pixel: alpha from darkness, so anti-aliased edges stay smooth.
  const lum = (r + g + b) / 3;
  px[i] = 0; px[i + 1] = 0; px[i + 2] = 0;
  px[i + 3] = Math.max(0, Math.min(255, Math.round((200 - lum) * 1.6)));
}
const mark = await sharp(px, { raw: { width: region.info.width, height: region.info.height, channels: 4 } })
  .trim()
  .png()
  .toBuffer();
const m = await sharp(mark).metadata();

// 2. Full icon: white tile, teal keyline, mark centred at ~62% of the tile.
const SIZE = 1024;
const inner = Math.round(SIZE * 0.62);
const scale = Math.min(inner / m.width, inner / m.height);
const markResized = await sharp(mark)
  .resize(Math.round(m.width * scale), Math.round(m.height * scale), { fit: 'inside' })
  .png()
  .toBuffer();

const keyline = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
     <rect x="24" y="24" width="${SIZE - 48}" height="${SIZE - 48}" rx="180" ry="180"
           fill="none" stroke="rgb(0,102,102)" stroke-width="28"/>
   </svg>`
);

await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: '#ffffff' } })
  .composite([{ input: keyline }, { input: markResized, gravity: 'centre' }])
  .png()
  .toFile(join(outDir, 'icon.png'));

// 3. Adaptive foreground: transparent, mark within the central 66% safe zone.
const safe = Math.round(SIZE * 0.55);
const fgScale = Math.min(safe / m.width, safe / m.height);
const fgMark = await sharp(mark)
  .resize(Math.round(m.width * fgScale), Math.round(m.height * fgScale), { fit: 'inside' })
  .png()
  .toBuffer();
await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: fgMark, gravity: 'centre' }])
  .png()
  .toFile(join(outDir, 'icon-foreground.png'));

// 4. A teal square variant for places that want a solid tile (web splash).
await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: TEAL } })
  .composite([{ input: await sharp(markResized).negate({ alpha: false }).png().toBuffer(), gravity: 'centre' }])
  .png()
  .toFile(join(outDir, 'icon-teal.png'));

console.log(`icon: mark ${m.width}x${m.height} from logo ${width}x${height} → ${outDir}`);
console.log('  icon.png (1024, white tile + teal keyline)');
console.log('  icon-foreground.png (1024, adaptive foreground)');
console.log('  icon-teal.png (1024, solid teal tile)');
