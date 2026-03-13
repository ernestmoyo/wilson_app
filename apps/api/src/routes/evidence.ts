import { Router, Request, Response } from 'express';
import db from '../db/database';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/asyncHandler';
import { logAudit } from '../lib/auditLog';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage with 50 MB file size limit
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// GET / — list evidence with optional filters
router.get('/', asyncHandler((req: Request, res: Response) => {
  const { assessment_id, client_id, assessment_item_id, certificate_id } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];

  if (assessment_id) { conditions.push('e.assessment_id = ?'); params.push(assessment_id); }
  if (client_id) { conditions.push('e.client_id = ?'); params.push(client_id); }
  if (assessment_item_id) { conditions.push('e.assessment_item_id = ?'); params.push(assessment_item_id); }
  if (certificate_id) { conditions.push('e.certificate_id = ?'); params.push(certificate_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const evidence = db.prepare(`
    SELECT e.*
    FROM evidence e
    ${where}
    ORDER BY e.created_at DESC
  `).all(...params);

  res.json({ data: evidence });
}));

// GET /by-appendix/:client_id — evidence grouped by appendix category
router.get('/by-appendix/:client_id', asyncHandler((req: Request, res: Response) => {
  const evidence = db.prepare(`
    SELECT * FROM evidence WHERE client_id = ? ORDER BY appendix_number ASC, created_at DESC
  `).all(req.params.client_id);

  const grouped: Record<string, any[]> = {};
  for (const item of evidence as any[]) {
    const key = item.appendix_category || 'uncategorised';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  res.json({ data: grouped });
}));

// GET /:id — get single evidence record
router.get('/:id', asyncHandler((req: Request, res: Response) => {
  const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id);
  if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

  res.json({ data: evidence });
}));

// POST / — upload evidence file (multipart form data with 'file' field)
router.post('/', upload.single('file') as any, asyncHandler((req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'File is required' });

  const {
    assessment_id, assessment_item_id, client_id, certificate_id,
    description, evidence_type, gps_latitude, gps_longitude,
    captured_by, captured_at, device_info,
    appendix_category, appendix_number, location_area
  } = req.body;

  const validTypes = [
    'photo', 'document', 'calculation', 'engineer_cert', 'sds',
    'site_plan', 'erp', 'training_record', 'id_document', 'other'
  ];
  if (evidence_type && !validTypes.includes(evidence_type)) {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `evidence_type must be one of: ${validTypes.join(', ')}` });
  }

  // Compute SHA-256 hash of the uploaded file
  const fileBuffer = fs.readFileSync(req.file.path);
  const sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Wrap DB insert in try-catch for orphan file cleanup
  let result;
  try {
    result = db.prepare(`
      INSERT INTO evidence (
        assessment_id, assessment_item_id, client_id, certificate_id,
        file_name, file_path, file_type, file_size,
        description, evidence_type, gps_latitude, gps_longitude,
        captured_by, captured_at, device_info, sha256_hash,
        appendix_category, appendix_number, location_area
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assessment_id || null,
      assessment_item_id || null,
      client_id || null,
      certificate_id || null,
      req.file.originalname,
      req.file.path,
      req.file.mimetype,
      req.file.size,
      description || null,
      evidence_type || 'other',
      gps_latitude || null,
      gps_longitude || null,
      captured_by || null,
      captured_at || null,
      device_info || null,
      sha256Hash,
      appendix_category || null,
      appendix_number ?? null,
      location_area || null
    );
  } catch (err) {
    // Remove orphan file if DB insert fails
    fs.unlinkSync(req.file.path);
    throw err;
  }

  logAudit('evidence', result.lastInsertRowid, 'create', {
    file_name: req.file.originalname,
    evidence_type: evidence_type || 'other',
    assessment_id: assessment_id || null,
    client_id: client_id || null
  });

  const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ data: evidence });
}));

// DELETE /:id — delete evidence record and its file
router.delete('/:id', asyncHandler((req: Request, res: Response) => {
  const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id) as any;
  if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

  // Delete the physical file
  if (evidence.file_path && fs.existsSync(evidence.file_path)) {
    fs.unlinkSync(evidence.file_path);
  }

  db.prepare('DELETE FROM evidence WHERE id = ?').run(req.params.id);

  logAudit('evidence', Number(req.params.id), 'delete', {
    file_name: evidence.file_name,
    evidence_type: evidence.evidence_type
  });

  res.json({ data: { message: 'Evidence deleted successfully' } });
}));

// GET /:id/file — serve the actual file for viewing/download
router.get('/:id/file', asyncHandler((req: Request, res: Response) => {
  const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id) as any;
  if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

  if (!evidence.file_path || !fs.existsSync(evidence.file_path)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  // Path traversal guard
  const resolvedFile = path.resolve(evidence.file_path);
  const resolvedUploads = path.resolve(uploadsDir);
  if (!resolvedFile.startsWith(resolvedUploads)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(evidence.file_path)}"`);
  res.sendFile(resolvedFile);
}));

export default router;
