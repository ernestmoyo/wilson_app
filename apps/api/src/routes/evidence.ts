import { Router, Request, Response } from 'express';
import db from '../db/database';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// GET / — list evidence with optional filters
router.get('/', (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get single evidence record
router.get('/:id', (req: Request, res: Response) => {
  try {
    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id);
    if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

    res.json({ data: evidence });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — upload evidence file (multipart form data with 'file' field)
router.post('/', upload.single('file') as any, (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });

    const {
      assessment_id, assessment_item_id, client_id, certificate_id,
      description, evidence_type, gps_latitude, gps_longitude,
      captured_by, captured_at, device_info
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

    const result = db.prepare(`
      INSERT INTO evidence (
        assessment_id, assessment_item_id, client_id, certificate_id,
        file_name, file_path, file_type, file_size,
        description, evidence_type, gps_latitude, gps_longitude,
        captured_by, captured_at, device_info, sha256_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      sha256Hash
    );

    // Log to audit_log
    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, details)
      VALUES ('evidence', ?, 'create', ?)
    `).run(result.lastInsertRowid, JSON.stringify({
      file_name: req.file.originalname,
      evidence_type: evidence_type || 'other',
      assessment_id: assessment_id || null,
      client_id: client_id || null
    }));

    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: evidence });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete evidence record and its file
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id) as any;
    if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

    // Delete the physical file
    if (evidence.file_path && fs.existsSync(evidence.file_path)) {
      fs.unlinkSync(evidence.file_path);
    }

    db.prepare('DELETE FROM evidence WHERE id = ?').run(req.params.id);

    // Log to audit_log
    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, details)
      VALUES ('evidence', ?, 'delete', ?)
    `).run(req.params.id, JSON.stringify({
      file_name: evidence.file_name,
      evidence_type: evidence.evidence_type
    }));

    res.json({ data: { message: 'Evidence deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/file — serve the actual file for viewing/download
router.get('/:id/file', (req: Request, res: Response) => {
  try {
    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id) as any;
    if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

    if (!evidence.file_path || !fs.existsSync(evidence.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.sendFile(evidence.file_path);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
