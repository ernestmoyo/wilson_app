import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET / — list storage areas, support ?client_id=
router.get('/', (req: Request, res: Response) => {
  try {
    const { client_id } = req.query;
    let areas;
    if (client_id) {
      areas = db.prepare('SELECT * FROM storage_areas WHERE client_id = ? ORDER BY area_name ASC').all(client_id as string);
    } else {
      areas = db.prepare('SELECT * FROM storage_areas ORDER BY area_name ASC').all();
    }
    res.json({ data: areas });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get single storage area
router.get('/:id', (req: Request, res: Response) => {
  try {
    const area = db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(req.params.id);
    if (!area) return res.status(404).json({ error: 'Storage area not found' });
    res.json({ data: area });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create storage area
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      client_id, area_name, area_type, substance_classes,
      max_capacity, building_type, notes
    } = req.body;

    if (!area_name) {
      return res.status(400).json({ error: 'area_name is required' });
    }

    const result = db.prepare(`
      INSERT INTO storage_areas (client_id, area_name, area_type, substance_classes, max_capacity, building_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      client_id || null,
      area_name,
      area_type || null,
      substance_classes || null,
      max_capacity || null,
      building_type || null,
      notes || null
    );

    // Audit log
    try {
      db.prepare('INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES (?,?,?,?,?)')
        .run('storage_area', result.lastInsertRowid, 'created', null, JSON.stringify({ area_name, client_id }));
    } catch (_) {}

    const area = db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: area });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update storage area
router.put('/:id', (req: Request, res: Response) => {
  try {
    const area = db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(req.params.id) as any;
    if (!area) return res.status(404).json({ error: 'Storage area not found' });

    const {
      client_id, area_name, area_type, substance_classes,
      max_capacity, building_type, notes
    } = req.body;

    db.prepare(`
      UPDATE storage_areas SET
        client_id = ?, area_name = ?, area_type = ?, substance_classes = ?,
        max_capacity = ?, building_type = ?, notes = ?
      WHERE id = ?
    `).run(
      client_id !== undefined ? client_id : area.client_id,
      area_name !== undefined ? area_name : area.area_name,
      area_type !== undefined ? area_type : area.area_type,
      substance_classes !== undefined ? substance_classes : area.substance_classes,
      max_capacity !== undefined ? max_capacity : area.max_capacity,
      building_type !== undefined ? building_type : area.building_type,
      notes !== undefined ? notes : area.notes,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete storage area
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const area = db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(req.params.id);
    if (!area) return res.status(404).json({ error: 'Storage area not found' });

    // Audit log
    try {
      db.prepare('INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES (?,?,?,?,?)')
        .run('storage_area', req.params.id, 'deleted', null, JSON.stringify({ id: req.params.id }));
    } catch (_) {}

    db.prepare('DELETE FROM storage_areas WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'Storage area deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
