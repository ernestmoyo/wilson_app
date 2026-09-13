// Copy every evidence object from Vercel Blob to DigitalOcean Spaces, keeping
// the same key (evidence/<sha256>.<ext>). Safe to re-run: an object already in
// Spaces with the same size is skipped. Nothing is deleted anywhere.
//
//   BLOB_READ_WRITE_TOKEN=... SPACES_KEY=... SPACES_SECRET=... \
//   SPACES_BUCKET=assure-evidence SPACES_REGION=syd1 node scripts/do/copy-evidence.mjs
//
// Run from apps/server so the SDKs resolve: cd apps/server && node scripts/do/copy-evidence.mjs
import { list, get } from '@vercel/blob';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const region = process.env.SPACES_REGION ?? 'syd1';
const s3 = new S3Client({
  region,
  endpoint: process.env.SPACES_ENDPOINT ?? `https://${region}.digitaloceanspaces.com`,
  credentials: { accessKeyId: process.env.SPACES_KEY, secretAccessKey: process.env.SPACES_SECRET },
});
const Bucket = process.env.SPACES_BUCKET;
if (!Bucket || !process.env.BLOB_READ_WRITE_TOKEN) throw new Error('SPACES_BUCKET and BLOB_READ_WRITE_TOKEN are required');

let cursor;
let copied = 0, skipped = 0;
do {
  const page = await list({ prefix: 'evidence/', cursor, limit: 200 });
  for (const b of page.blobs) {
    const Key = b.pathname;
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket, Key }));
      if (head.ContentLength === b.size) { skipped++; continue; }
    } catch (e) {
      if (e?.$metadata?.httpStatusCode !== 404 && e?.name !== 'NotFound') throw e;
    }
    const r = await get(b.pathname, { access: 'private' });
    if (!r || r.statusCode !== 200 || !r.stream) { console.log('cannot read', Key); continue; }
    const chunks = [];
    for await (const c of r.stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    const Body = Buffer.concat(chunks);
    await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType: r.blob?.contentType ?? 'application/octet-stream', ACL: 'private' }));
    copied++;
    console.log('copied', Key, Body.length, 'bytes');
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
console.log(`done: ${copied} copied, ${skipped} already present`);
