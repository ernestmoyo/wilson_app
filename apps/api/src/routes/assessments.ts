import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// Standard NZ HSW checklist template for site_inspection assessments
const SITE_INSPECTION_TEMPLATE = [
  { section: 'A', item_number: 'A1', description: 'Notification to Enforcement Officer', sort_order: 1 },
  { section: 'B', item_number: 'B1', description: 'Security measures', sort_order: 2 },
  { section: 'C', item_number: 'C1', description: 'Training records and competency', sort_order: 3 },
  { section: 'C', item_number: 'C2', description: 'Observed experience', sort_order: 4 },
  { section: 'D', item_number: 'D1', description: 'Hazardous area established', sort_order: 5 },
  { section: 'D', item_number: 'D2', description: 'Complies with AS/NZS 60079.10.1', sort_order: 6 },
  { section: 'E', item_number: 'E1', description: 'Segregation of substances', sort_order: 7 },
  { section: 'F', item_number: 'F1', description: 'Appropriate signage at entrances', sort_order: 8 },
  { section: 'F', item_number: 'F2', description: 'Inscription', sort_order: 9 },
  { section: 'F', item_number: 'F3', description: 'Precautions', sort_order: 10 },
  { section: 'F', item_number: 'F4', description: 'Material of construction', sort_order: 11 },
  { section: 'F', item_number: 'F5', description: 'Emergency response', sort_order: 12 },
  { section: 'G', item_number: 'G1', description: 'Fire extinguishers', sort_order: 13 },
  { section: 'G', item_number: 'G2', description: 'Hydrant system', sort_order: 14 },
  { section: 'G', item_number: 'G3', description: 'Emergency response plan', sort_order: 15 },
  { section: 'G', item_number: 'G4', description: 'ERP reviewed by FENZ', sort_order: 16 },
  { section: 'G', item_number: 'G5', description: 'Test and revision', sort_order: 17 },
  { section: 'H', item_number: 'H1', description: 'Work room/storage type', sort_order: 18 },
  { section: 'H', item_number: 'H2', description: 'Electrical certificate', sort_order: 19 },
  { section: 'I', item_number: 'I1', description: 'Secondary containment', sort_order: 20 },
  { section: 'J', item_number: 'J1', description: 'Scaled site plan', sort_order: 21 },
];

// GET / — list assessments with optional filters, join client and inspector names
router.get('/', (req: Request, res: Response) => {
  try {
    const { client_id, status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (client_id) { conditions.push('a.client_id = ?'); params.push(client_id); }
    if (status) { conditions.push('a.status = ?'); params.push(status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const assessments = db.prepare(`
      SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM assessments a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN users u ON u.id = a.inspector_id
      ${where}
      ORDER BY a.created_at DESC
    `).all(...params);

    res.json({ data: assessments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get assessment with all its items
router.get('/:id', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare(`
      SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM assessments a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN users u ON u.id = a.inspector_id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const items = db.prepare(
      'SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC, item_number ASC'
    ).all(req.params.id);

    res.json({ data: { ...assessment as object, items } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create assessment
router.post('/', (req: Request, res: Response) => {
  try {
    const { client_id, inspector_id, type, inspection_date, substance_classes, notes } = req.body;

    if (!client_id || !type) return res.status(400).json({ error: 'client_id and type are required' });

    const validTypes = ['pre_inspection', 'site_inspection', 'validation'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(400).json({ error: 'Client not found' });

    const resolvedInspectorId = inspector_id || 1;
    const inspector = db.prepare('SELECT id FROM users WHERE id = ?').get(resolvedInspectorId);
    if (!inspector) return res.status(400).json({ error: 'Inspector not found' });

    const result = db.prepare(`
      INSERT INTO assessments (client_id, inspector_id, type, inspection_date, substance_classes, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      client_id,
      resolvedInspectorId,
      type,
      inspection_date || null,
      substance_classes || null,
      notes || null
    );

    const assessmentId = result.lastInsertRowid;

    // Auto-populate checklist for site_inspection
    if (type === 'site_inspection') {
      const insertItem = db.prepare(`
        INSERT INTO assessment_items (assessment_id, section, item_number, description, status, sort_order)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `);
      db.exec('BEGIN');
      try {
        for (const item of SITE_INSPECTION_TEMPLATE) {
          insertItem.run(assessmentId, item.section, item.item_number, item.description, item.sort_order);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }

    const assessment = db.prepare(`
      SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM assessments a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN users u ON u.id = a.inspector_id
      WHERE a.id = ?
    `).get(assessmentId);

    const items = db.prepare(
      'SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC'
    ).all(assessmentId);

    res.status(201).json({ data: { ...assessment as object, items } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update assessment fields
router.put('/:id', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id) as any;
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const { type, status, inspection_date, substance_classes, notes, inspector_id } = req.body;

    db.prepare(`
      UPDATE assessments SET
        type = ?, status = ?, inspection_date = ?, substance_classes = ?, notes = ?, inspector_id = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      type ?? assessment.type,
      status ?? assessment.status,
      inspection_date !== undefined ? inspection_date : assessment.inspection_date,
      substance_classes !== undefined ? substance_classes : assessment.substance_classes,
      notes !== undefined ? notes : assessment.notes,
      inspector_id ?? assessment.inspector_id,
      req.params.id
    );

    const updated = db.prepare(`
      SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM assessments a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN users u ON u.id = a.inspector_id
      WHERE a.id = ?
    `).get(req.params.id);

    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete assessment and cascade items
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    // assessment_items has ON DELETE CASCADE so items are removed automatically
    db.prepare('DELETE FROM assessments WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'Assessment deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/items — bulk replace all items for an assessment
router.post('/:id/items', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const items: Array<{
      section: string;
      item_number: string;
      description: string;
      status?: string;
      comments?: string;
      sort_order?: number;
    }> = req.body;

    if (!Array.isArray(items)) return res.status(400).json({ error: 'Body must be an array of items' });

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM assessment_items WHERE assessment_id = ?').run(req.params.id);
      const insertItem = db.prepare(`
        INSERT INTO assessment_items (assessment_id, section, item_number, description, status, comments, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(
          req.params.id,
          item.section,
          item.item_number,
          item.description,
          item.status || 'pending',
          item.comments || null,
          item.sort_order ?? 0
        );
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    const saved = db.prepare(
      'SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC, item_number ASC'
    ).all(req.params.id);

    res.json({ data: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/items — get all items for an assessment
router.get('/:id/items', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const items = db.prepare(
      'SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC, item_number ASC'
    ).all(req.params.id);

    res.json({ data: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
