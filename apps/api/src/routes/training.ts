import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET /summary/:client_id — training summary for a client (must be before /:id)
router.get('/summary/:client_id', (req: Request, res: Response) => {
  try {
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const records = db.prepare(`
      SELECT * FROM training_records
      WHERE client_id = ?
      ORDER BY worker_name ASC, training_date DESC
    `).all(req.params.client_id) as any[];

    const workers = new Set(records.map(r => r.worker_name));
    const competent_count = records.filter(r => r.competent).length;
    const expired_count = records.filter(r => r.expiry_date && r.expiry_date < new Date().toISOString().split('T')[0]).length;

    // Group records by worker
    const by_worker: Record<string, any[]> = {};
    for (const r of records) {
      if (!by_worker[r.worker_name]) by_worker[r.worker_name] = [];
      by_worker[r.worker_name].push(r);
    }

    res.json({
      data: {
        total_workers: workers.size,
        total_records: records.length,
        competent_count,
        expired_count,
        by_worker,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET / — list training records, support ?client_id= and ?worker_name=
router.get('/', (req: Request, res: Response) => {
  try {
    const { client_id, worker_name } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (client_id) { conditions.push('client_id = ?'); params.push(client_id); }
    if (worker_name) { conditions.push('worker_name = ?'); params.push(worker_name); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const records = db.prepare(`
      SELECT * FROM training_records ${where} ORDER BY training_date DESC
    `).all(...params);

    res.json({ data: records });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get single training record
router.get('/:id', (req: Request, res: Response) => {
  try {
    const record = db.prepare('SELECT * FROM training_records WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Training record not found' });
    res.json({ data: record });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create training record
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      client_id, worker_name, department, course_name, training_date,
      competent, expiry_date, certificate_evidence_id, notes
    } = req.body;

    if (!worker_name || !course_name) {
      return res.status(400).json({ error: 'worker_name and course_name are required' });
    }

    const result = db.prepare(`
      INSERT INTO training_records (client_id, worker_name, department, course_name, training_date, competent, expiry_date, certificate_evidence_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client_id || null,
      worker_name,
      department || null,
      course_name,
      training_date || null,
      competent ? 1 : 0,
      expiry_date || null,
      certificate_evidence_id || null,
      notes || null
    );

    // Audit log
    try {
      db.prepare('INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES (?,?,?,?,?)')
        .run('training_record', result.lastInsertRowid, 'created', null, JSON.stringify({ worker_name, course_name, client_id }));
    } catch (_) {}

    const record = db.prepare('SELECT * FROM training_records WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: record });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update training record
router.put('/:id', (req: Request, res: Response) => {
  try {
    const record = db.prepare('SELECT * FROM training_records WHERE id = ?').get(req.params.id) as any;
    if (!record) return res.status(404).json({ error: 'Training record not found' });

    const {
      client_id, worker_name, department, course_name, training_date,
      competent, expiry_date, certificate_evidence_id, notes
    } = req.body;

    db.prepare(`
      UPDATE training_records SET
        client_id = ?, worker_name = ?, department = ?, course_name = ?, training_date = ?,
        competent = ?, expiry_date = ?, certificate_evidence_id = ?, notes = ?
      WHERE id = ?
    `).run(
      client_id !== undefined ? client_id : record.client_id,
      worker_name !== undefined ? worker_name : record.worker_name,
      department !== undefined ? department : record.department,
      course_name !== undefined ? course_name : record.course_name,
      training_date !== undefined ? training_date : record.training_date,
      competent !== undefined ? (competent ? 1 : 0) : record.competent,
      expiry_date !== undefined ? expiry_date : record.expiry_date,
      certificate_evidence_id !== undefined ? certificate_evidence_id : record.certificate_evidence_id,
      notes !== undefined ? notes : record.notes,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM training_records WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete training record
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const record = db.prepare('SELECT * FROM training_records WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Training record not found' });

    // Audit log
    try {
      db.prepare('INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES (?,?,?,?,?)')
        .run('training_record', req.params.id, 'deleted', null, JSON.stringify({ id: req.params.id }));
    } catch (_) {}

    db.prepare('DELETE FROM training_records WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'Training record deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
