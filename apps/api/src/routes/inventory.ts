import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET /summary/:client_id — group inventory by hazard_class (must be before /:id)
router.get('/summary/:client_id', (req: Request, res: Response) => {
  try {
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const summary = db.prepare(`
      SELECT hazard_class, unit, SUM(quantity) AS total_quantity, COUNT(*) AS item_count
      FROM inventory
      WHERE client_id = ?
      GROUP BY hazard_class, unit
      ORDER BY hazard_class ASC
    `).all(req.params.client_id);

    res.json({ data: summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET / — list inventory, support ?client_id=
router.get('/', (req: Request, res: Response) => {
  try {
    const { client_id } = req.query;
    let items;
    if (client_id) {
      items = db.prepare('SELECT * FROM inventory WHERE client_id = ? ORDER BY substance_name ASC').all(client_id as string);
    } else {
      items = db.prepare('SELECT * FROM inventory ORDER BY substance_name ASC').all();
    }
    res.json({ data: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get single item
router.get('/:id', (req: Request, res: Response) => {
  try {
    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });
    res.json({ data: item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create inventory item
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      client_id, substance_name, hazard_class, quantity, unit,
      container_size, container_count, storage_location,
      sds_available, sds_document, notes
    } = req.body;

    if (!client_id || !substance_name || !hazard_class || quantity === undefined) {
      return res.status(400).json({ error: 'client_id, substance_name, hazard_class, and quantity are required' });
    }

    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(400).json({ error: 'Client not found' });

    const result = db.prepare(`
      INSERT INTO inventory (client_id, substance_name, hazard_class, quantity, unit, container_size, container_count, storage_location, sds_available, sds_document, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client_id,
      substance_name,
      hazard_class,
      quantity,
      unit || 'litres',
      container_size ?? null,
      container_count ?? null,
      storage_location || null,
      sds_available ? 1 : 0,
      sds_document || null,
      notes || null
    );

    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update item
router.put('/:id', (req: Request, res: Response) => {
  try {
    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id) as any;
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    const {
      substance_name, hazard_class, quantity, unit,
      container_size, container_count, storage_location,
      sds_available, sds_document, notes
    } = req.body;

    db.prepare(`
      UPDATE inventory SET
        substance_name = ?, hazard_class = ?, quantity = ?, unit = ?,
        container_size = ?, container_count = ?, storage_location = ?,
        sds_available = ?, sds_document = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      substance_name ?? item.substance_name,
      hazard_class ?? item.hazard_class,
      quantity ?? item.quantity,
      unit ?? item.unit,
      container_size !== undefined ? container_size : item.container_size,
      container_count !== undefined ? container_count : item.container_count,
      storage_location !== undefined ? storage_location : item.storage_location,
      sds_available !== undefined ? (sds_available ? 1 : 0) : item.sds_available,
      sds_document !== undefined ? sds_document : item.sds_document,
      notes !== undefined ? notes : item.notes,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete item
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'Inventory item deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
