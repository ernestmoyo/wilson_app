import { Router, Request, Response } from 'express';
import db from '../db/database';
import { asyncHandler } from '../middleware/asyncHandler';
import { logAudit } from '../lib/auditLog';

const router = Router();

// GET /summary/:client_id — group inventory by hazard_class (must be before /:id)
router.get('/summary/:client_id', asyncHandler((req: Request, res: Response) => {
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
}));

// GET / — list inventory, support ?client_id=
router.get('/', asyncHandler((req: Request, res: Response) => {
  const { client_id } = req.query;
  let items;
  if (client_id) {
    items = db.prepare('SELECT * FROM inventory WHERE client_id = ? ORDER BY substance_name ASC').all(client_id as string);
  } else {
    items = db.prepare('SELECT * FROM inventory ORDER BY substance_name ASC').all();
  }
  res.json({ data: items });
}));

// GET /:id — get single item
router.get('/:id', asyncHandler((req: Request, res: Response) => {
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Inventory item not found' });
  res.json({ data: item });
}));

// POST / — create inventory item
router.post('/', asyncHandler((req: Request, res: Response) => {
  const {
    client_id, substance_name, hazard_class, quantity, unit,
    container_size, container_count, storage_location,
    sds_available, sds_document, notes,
    un_number, hazard_classifications, storage_requirements,
    incompatible_items, sds_expiry_date, sku, substance_state,
    max_quantity, storage_area_id, hsno_approval
  } = req.body;

  if (!client_id || !substance_name || !hazard_class || quantity === undefined) {
    return res.status(400).json({ error: 'client_id, substance_name, hazard_class, and quantity are required' });
  }

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(400).json({ error: 'Client not found' });

  const result = db.prepare(`
    INSERT INTO inventory (client_id, substance_name, hazard_class, quantity, unit, container_size, container_count, storage_location, sds_available, sds_document, notes, un_number, hazard_classifications, storage_requirements, incompatible_items, sds_expiry_date, sku, substance_state, max_quantity, storage_area_id, hsno_approval)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    client_id, substance_name, hazard_class, quantity,
    unit || 'litres', container_size ?? null, container_count ?? null,
    storage_location || null, sds_available ? 1 : 0, sds_document || null,
    notes || null, un_number || null, hazard_classifications || null,
    storage_requirements || null, incompatible_items || null,
    sds_expiry_date || null, sku || null, substance_state || null,
    max_quantity ?? null, storage_area_id ?? null, hsno_approval || null
  );

  logAudit('inventory', result.lastInsertRowid, 'created', { substance_name, hazard_class, client_id });

  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ data: item });
}));

// PUT /:id — update item
router.put('/:id', asyncHandler((req: Request, res: Response) => {
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id) as any;
  if (!item) return res.status(404).json({ error: 'Inventory item not found' });

  const {
    substance_name, hazard_class, quantity, unit,
    container_size, container_count, storage_location,
    sds_available, sds_document, notes,
    un_number, hazard_classifications, storage_requirements,
    incompatible_items, sds_expiry_date, sku, substance_state,
    max_quantity, storage_area_id, hsno_approval
  } = req.body;

  db.prepare(`
    UPDATE inventory SET
      substance_name = ?, hazard_class = ?, quantity = ?, unit = ?,
      container_size = ?, container_count = ?, storage_location = ?,
      sds_available = ?, sds_document = ?, notes = ?,
      un_number = ?, hazard_classifications = ?, storage_requirements = ?,
      incompatible_items = ?, sds_expiry_date = ?, sku = ?,
      substance_state = ?, max_quantity = ?, storage_area_id = ?,
      hsno_approval = ?, updated_at = datetime('now')
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
    un_number !== undefined ? un_number : item.un_number,
    hazard_classifications !== undefined ? hazard_classifications : item.hazard_classifications,
    storage_requirements !== undefined ? storage_requirements : item.storage_requirements,
    incompatible_items !== undefined ? incompatible_items : item.incompatible_items,
    sds_expiry_date !== undefined ? sds_expiry_date : item.sds_expiry_date,
    sku !== undefined ? sku : item.sku,
    substance_state !== undefined ? substance_state : item.substance_state,
    max_quantity !== undefined ? max_quantity : item.max_quantity,
    storage_area_id !== undefined ? storage_area_id : item.storage_area_id,
    hsno_approval !== undefined ? hsno_approval : item.hsno_approval,
    req.params.id
  );

  logAudit('inventory', Number(req.params.id), 'updated', {
    substance_name: substance_name ?? item.substance_name,
    hazard_class: hazard_class ?? item.hazard_class,
    client_id: item.client_id
  });

  const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  res.json({ data: updated });
}));

// DELETE /:id — delete item
router.delete('/:id', asyncHandler((req: Request, res: Response) => {
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id) as any;
  if (!item) return res.status(404).json({ error: 'Inventory item not found' });

  logAudit('inventory', Number(req.params.id), 'deleted', {
    substance_name: item.substance_name,
    hazard_class: item.hazard_class,
    client_id: item.client_id
  });

  db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
  res.json({ data: { message: 'Inventory item deleted successfully' } });
}));

export default router;
