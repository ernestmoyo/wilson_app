/**
 * The job bundle (contract C, scope item B10): one ZIP holding the checksheet
 * PDF, the certificate (print-ready HTML until Q6 settles the PDF), the
 * non-compliance report and the job's evidence, named by appendix as in the
 * workbooks.
 *
 * Delivery depends on where evidence lives:
 *  - disk (no Blob / Spaces env): the ZIP streams straight back;
 *  - Vercel Blob or DigitalOcean Spaces: it is stored under exports/ and the
 *    caller gets a presigned GET, because a serverless response body is
 *    capped (4.5 MB on Vercel) and a job's photographs are not.
 * The storage side sits behind `exportStore()`, which tests replace with
 * `setExportStore()`: nothing here is ever called against a live store in a test.
 */

import { zipSync } from 'fflate';
import { safeFileName } from './naming.mjs';

export const CHECKSHEET_NAME = '01 Checksheet.pdf';
export const CERTIFICATE_NAME = '02 Certificate.html';
export const NON_COMPLIANCE_NAME = '03 Non-compliance report.html';
const LINK_TTL_MS = 60 * 60 * 1000;

/**
 * Assemble the ZIP.
 * @param {object} p
 * @param {Buffer} p.checksheetPdf
 * @param {string|null} p.certificateHtml
 * @param {string|null} p.nonComplianceHtml
 * @param {{ name: string, buf: Buffer }[]} p.evidence
 * @param {string[]} [p.missing] evidence that could not be read, listed in a note
 * @returns {{ zip: Buffer, files: string[] }}
 */
export function buildBundleZip({ checksheetPdf, certificateHtml, nonComplianceHtml, evidence = [], missing = [] }) {
  const entries = {};
  const mtime = new Date();
  // Photos and PDFs are already compressed; deflating them again only costs time.
  entries[CHECKSHEET_NAME] = [new Uint8Array(checksheetPdf), { level: 0, mtime }];
  if (certificateHtml) entries[CERTIFICATE_NAME] = [Buffer.from(certificateHtml, 'utf8'), { level: 6, mtime }];
  if (nonComplianceHtml) entries[NON_COMPLIANCE_NAME] = [Buffer.from(nonComplianceHtml, 'utf8'), { level: 6, mtime }];
  for (const e of evidence) entries[e.name] = [new Uint8Array(e.buf), { level: 0, mtime }];
  if (missing.length) {
    entries['Missing evidence.txt'] = [Buffer.from(
      `These evidence records exist on the job but their files could not be read from storage when the bundle was made:\r\n\r\n${missing.join('\r\n')}\r\n`, 'utf8'), { level: 6, mtime }];
  }
  const zip = Buffer.from(zipSync(entries));
  return { zip, files: Object.keys(entries) };
}

/** "Assure Safety - Job 12 - Argenta Manufacturing Limited.zip" */
export function bundleFileName(jobId, clientName) {
  return `${safeFileName(`Assure Safety - Job ${jobId} - ${clientName ?? 'client'}`, 100)}.zip`;
}

/** Content-Disposition carrying a UTF-8 file name and an ASCII fallback. */
export function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// ── storage of the finished ZIP ────────────────────────────────────────────

let override;
/** Tests only: replace the store (null = disk mode, or an object with put()). Pass undefined to restore. */
export function setExportStore(store) { override = store; }

/**
 * The export store for this environment, or null on disk (stream back).
 * Same env switch as evidence: Spaces first, then Blob.
 * @returns {null | { backend: string, put(key: string, buf: Buffer): Promise<{ url: string, expiresAt: string }> }}
 */
export function exportStore(env = process.env) {
  if (override !== undefined) return override;
  if (env.SPACES_BUCKET) return spacesStore(env);
  if (env.BLOB_READ_WRITE_TOKEN) return blobStore();
  return null;
}

function spacesStore(env) {
  const region = env.SPACES_REGION ?? 'syd1';
  const cfg = {
    region, endpoint: env.SPACES_ENDPOINT ?? `https://${region}.digitaloceanspaces.com`, forcePathStyle: false,
    credentials: { accessKeyId: env.SPACES_KEY, secretAccessKey: env.SPACES_SECRET },
  };
  return {
    backend: 'spaces',
    async put(key, buf) {
      const { S3Client, PutObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const s3 = new S3Client(cfg);
      await s3.send(new PutObjectCommand({ Bucket: env.SPACES_BUCKET, Key: key, Body: buf, ContentType: 'application/zip', ACL: 'private' }));
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.SPACES_BUCKET, Key: key }), { expiresIn: LINK_TTL_MS / 1000 });
      return { url, expiresAt: new Date(Date.now() + LINK_TTL_MS).toISOString() };
    },
  };
}

function blobStore() {
  return {
    backend: 'vercel-blob',
    async put(key, buf) {
      const { put, issueSignedToken, presignUrl } = await import('@vercel/blob');
      await put(key, buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/zip' });
      const validUntil = Date.now() + LINK_TTL_MS;
      const token = await issueSignedToken({ pathname: key, operations: ['get'], validUntil });
      const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: key, validUntil, access: 'private' });
      return { url: presignedUrl, expiresAt: new Date(validUntil).toISOString() };
    },
  };
}

/** exports/<jobId>-<timestamp>.zip */
export function exportKey(jobId, at = new Date()) {
  return `exports/${jobId}-${at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.zip`;
}
