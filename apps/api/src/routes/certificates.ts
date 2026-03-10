import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET /expiring — list certificates expiring within 90 days (must be before /:id)
router.get('/expiring', (_req: Request, res: Response) => {
  try {
    const certificates = db.prepare(`
      SELECT cert.*, c.legal_name AS client_name
      FROM certificates cert
      LEFT JOIN clients c ON c.id = cert.client_id
      WHERE cert.status = 'granted'
        AND cert.expiry_date IS NOT NULL
        AND cert.expiry_date <= date('now', '+90 days')
        AND cert.expiry_date >= date('now')
      ORDER BY cert.expiry_date ASC
    `).all();
    res.json({ data: certificates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET / — list certificates with optional filters
router.get('/', (req: Request, res: Response) => {
  try {
    const { status, client_id } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (status) { conditions.push('cert.status = ?'); params.push(status); }
    if (client_id) { conditions.push('cert.client_id = ?'); params.push(client_id); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const certificates = db.prepare(`
      SELECT cert.*, c.legal_name AS client_name
      FROM certificates cert
      LEFT JOIN clients c ON c.id = cert.client_id
      ${where}
      ORDER BY cert.created_at DESC
    `).all(...params);

    res.json({ data: certificates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get certificate details
router.get('/:id', (req: Request, res: Response) => {
  try {
    const certificate = db.prepare(`
      SELECT cert.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM certificates cert
      LEFT JOIN clients c ON c.id = cert.client_id
      LEFT JOIN users u ON u.id = cert.inspector_id
      WHERE cert.id = ?
    `).get(req.params.id);

    if (!certificate) return res.status(404).json({ error: 'Certificate not found' });
    res.json({ data: certificate });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create certificate with generated certificate_number
router.post('/', (req: Request, res: Response) => {
  try {
    const { client_id, assessment_id, inspector_id, substance_class, max_quantity } = req.body;

    if (!client_id || !inspector_id) {
      return res.status(400).json({ error: 'client_id and inspector_id are required' });
    }

    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(400).json({ error: 'Client not found' });

    // Insert with placeholder to get the id first, then update certificate_number
    const result = db.prepare(`
      INSERT INTO certificates (client_id, assessment_id, inspector_id, substance_class, max_quantity)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      client_id,
      assessment_id || null,
      inspector_id,
      substance_class || null,
      max_quantity || null
    );

    const newId = result.lastInsertRowid as number;
    const year = new Date().getFullYear();
    const certificateNumber = `WC-${year}-${String(newId).padStart(4, '0')}`;

    db.prepare('UPDATE certificates SET certificate_number = ? WHERE id = ?').run(certificateNumber, newId);

    const certificate = db.prepare(`
      SELECT cert.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM certificates cert
      LEFT JOIN clients c ON c.id = cert.client_id
      LEFT JOIN users u ON u.id = cert.inspector_id
      WHERE cert.id = ?
    `).get(newId);

    res.status(201).json({ data: certificate });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update certificate (grant, refuse, etc.)
router.put('/:id', (req: Request, res: Response) => {
  try {
    const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(req.params.id) as any;
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    const {
      status, issue_date, expiry_date, refusal_reasons, substance_class, max_quantity,
      is_conditional, condition_details, condition_deadline,
      applicant_notified, worksafe_notified, worksafe_registered,
    } = req.body;

    db.prepare(`
      UPDATE certificates SET
        status = ?, issue_date = ?, expiry_date = ?, refusal_reasons = ?,
        substance_class = ?, max_quantity = ?,
        is_conditional = ?, condition_details = ?, condition_deadline = ?,
        applicant_notified = ?, worksafe_notified = ?, worksafe_registered = ?
      WHERE id = ?
    `).run(
      status ?? cert.status,
      issue_date !== undefined ? issue_date : cert.issue_date,
      expiry_date !== undefined ? expiry_date : cert.expiry_date,
      refusal_reasons !== undefined ? refusal_reasons : cert.refusal_reasons,
      substance_class !== undefined ? substance_class : cert.substance_class,
      max_quantity !== undefined ? max_quantity : cert.max_quantity,
      is_conditional !== undefined ? is_conditional : cert.is_conditional,
      condition_details !== undefined ? condition_details : cert.condition_details,
      condition_deadline !== undefined ? condition_deadline : cert.condition_deadline,
      applicant_notified !== undefined ? applicant_notified : cert.applicant_notified,
      worksafe_notified !== undefined ? worksafe_notified : cert.worksafe_notified,
      worksafe_registered !== undefined ? worksafe_registered : cert.worksafe_registered,
      req.params.id
    );

    const updated = db.prepare(`
      SELECT cert.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM certificates cert
      LEFT JOIN clients c ON c.id = cert.client_id
      LEFT JOIN users u ON u.id = cert.inspector_id
      WHERE cert.id = ?
    `).get(req.params.id);

    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete certificate
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(req.params.id);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    db.prepare('DELETE FROM certificates WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'Certificate deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
