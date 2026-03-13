import { Router, Request, Response } from 'express';
import db from '../db/database';
import { asyncHandler } from '../middleware/asyncHandler';
import { logAudit } from '../lib/auditLog';

const router = Router();

// GET / — list enquiries with optional filters, join client and assigned user names
router.get('/', asyncHandler((req: Request, res: Response) => {
  const { status, client_id, assigned_to } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];

  if (status) { conditions.push('e.status = ?'); params.push(status); }
  if (client_id) { conditions.push('e.client_id = ?'); params.push(client_id); }
  if (assigned_to) { conditions.push('e.assigned_to = ?'); params.push(assigned_to); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const enquiries = db.prepare(`
    SELECT e.*, c.legal_name AS client_name, u.name AS assigned_to_name
    FROM enquiries e
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN users u ON u.id = e.assigned_to
    ${where}
    ORDER BY e.created_at DESC
  `).all(...params);

  res.json({ data: enquiries });
}));

// GET /:id — get single enquiry with details
router.get('/:id', asyncHandler((req: Request, res: Response) => {
  const enquiry = db.prepare(`
    SELECT e.*, c.legal_name AS client_name, u.name AS assigned_to_name
    FROM enquiries e
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN users u ON u.id = e.assigned_to
    WHERE e.id = ?
  `).get(req.params.id);

  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

  res.json({ data: enquiry });
}));

// POST / — create enquiry
router.post('/', asyncHandler((req: Request, res: Response) => {
  const {
    client_id, contact_name, contact_email, contact_phone, company_name, site_address,
    enquiry_type, substance_classes, estimated_quantities, description, priority,
    source, assigned_to, quoted_amount, quote_date, follow_up_date, notes
  } = req.body;

  if (!contact_name) return res.status(400).json({ error: 'contact_name is required' });

  const validTypes = ['new_certification', 'renewal', 'variation', 'handler_certification', 'general_enquiry'];
  if (enquiry_type && !validTypes.includes(enquiry_type)) {
    return res.status(400).json({ error: `enquiry_type must be one of: ${validTypes.join(', ')}` });
  }

  const validPriorities = ['low', 'normal', 'high', 'urgent'];
  if (priority && !validPriorities.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${validPriorities.join(', ')}` });
  }

  const result = db.prepare(`
    INSERT INTO enquiries (
      client_id, contact_name, contact_email, contact_phone, company_name, site_address,
      enquiry_type, substance_classes, estimated_quantities, description, priority,
      source, assigned_to, quoted_amount, quote_date, follow_up_date, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    client_id || null,
    contact_name,
    contact_email || null,
    contact_phone || null,
    company_name || null,
    site_address || null,
    enquiry_type || null,
    substance_classes || null,
    estimated_quantities || null,
    description || null,
    priority || 'normal',
    source || null,
    assigned_to || null,
    quoted_amount || null,
    quote_date || null,
    follow_up_date || null,
    notes || null
  );

  const enquiryId = result.lastInsertRowid;

  logAudit('enquiry', enquiryId, 'created', { contact_name, enquiry_type });

  const enquiry = db.prepare(`
    SELECT e.*, c.legal_name AS client_name, u.name AS assigned_to_name
    FROM enquiries e
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN users u ON u.id = e.assigned_to
    WHERE e.id = ?
  `).get(enquiryId);

  res.status(201).json({ data: enquiry });
}));

// PUT /:id — update enquiry fields
router.put('/:id', asyncHandler((req: Request, res: Response) => {
  const enquiry = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(req.params.id) as any;
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

  const {
    client_id, contact_name, contact_email, contact_phone, company_name, site_address,
    enquiry_type, status, substance_classes, estimated_quantities, description, priority,
    source, assigned_to, quoted_amount, quote_date, follow_up_date, notes
  } = req.body;

  db.prepare(`
    UPDATE enquiries SET
      client_id = ?, contact_name = ?, contact_email = ?, contact_phone = ?,
      company_name = ?, site_address = ?, enquiry_type = ?, status = ?,
      substance_classes = ?, estimated_quantities = ?, description = ?, priority = ?,
      source = ?, assigned_to = ?, quoted_amount = ?, quote_date = ?,
      follow_up_date = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    client_id !== undefined ? client_id : enquiry.client_id,
    contact_name ?? enquiry.contact_name,
    contact_email !== undefined ? contact_email : enquiry.contact_email,
    contact_phone !== undefined ? contact_phone : enquiry.contact_phone,
    company_name !== undefined ? company_name : enquiry.company_name,
    site_address !== undefined ? site_address : enquiry.site_address,
    enquiry_type ?? enquiry.enquiry_type,
    status ?? enquiry.status,
    substance_classes !== undefined ? substance_classes : enquiry.substance_classes,
    estimated_quantities !== undefined ? estimated_quantities : enquiry.estimated_quantities,
    description !== undefined ? description : enquiry.description,
    priority ?? enquiry.priority,
    source !== undefined ? source : enquiry.source,
    assigned_to !== undefined ? assigned_to : enquiry.assigned_to,
    quoted_amount !== undefined ? quoted_amount : enquiry.quoted_amount,
    quote_date !== undefined ? quote_date : enquiry.quote_date,
    follow_up_date !== undefined ? follow_up_date : enquiry.follow_up_date,
    notes !== undefined ? notes : enquiry.notes,
    req.params.id
  );

  logAudit('enquiry', Number(req.params.id), 'updated', req.body);

  const updated = db.prepare(`
    SELECT e.*, c.legal_name AS client_name, u.name AS assigned_to_name
    FROM enquiries e
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN users u ON u.id = e.assigned_to
    WHERE e.id = ?
  `).get(req.params.id);

  res.json({ data: updated });
}));

// PUT /:id/convert — convert enquiry to assessment
router.put('/:id/convert', asyncHandler((req: Request, res: Response) => {
  const enquiry = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(req.params.id) as any;
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

  if (enquiry.status === 'converted') {
    return res.status(400).json({ error: 'Enquiry has already been converted' });
  }

  const { type, inspector_id, inspection_date, notes } = req.body;
  const assessmentType = type || 'site_inspection';

  db.exec('BEGIN');
  try {
    // Create new assessment from enquiry data
    const result = db.prepare(`
      INSERT INTO assessments (client_id, inspector_id, type, inspection_date, substance_classes, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      enquiry.client_id || null,
      inspector_id || 1,
      assessmentType,
      inspection_date || null,
      enquiry.substance_classes || null,
      notes || enquiry.notes || null
    );

    const assessmentId = result.lastInsertRowid;

    // Update enquiry status to converted
    db.prepare(`
      UPDATE enquiries SET
        status = 'converted',
        converted_assessment_id = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(assessmentId, req.params.id);

    logAudit('enquiry', Number(req.params.id), 'converted', { converted_assessment_id: Number(assessmentId) });

    db.exec('COMMIT');

    const updated = db.prepare(`
      SELECT e.*, c.legal_name AS client_name, u.name AS assigned_to_name
      FROM enquiries e
      LEFT JOIN clients c ON c.id = e.client_id
      LEFT JOIN users u ON u.id = e.assigned_to
      WHERE e.id = ?
    `).get(req.params.id);

    res.json({ data: { ...updated as object, converted_assessment_id: assessmentId } });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}));

// DELETE /:id — delete enquiry
router.delete('/:id', asyncHandler((req: Request, res: Response) => {
  const enquiry = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(req.params.id) as any;
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

  logAudit('enquiry', Number(req.params.id), 'deleted', { contact_name: enquiry.contact_name, enquiry_type: enquiry.enquiry_type });

  db.prepare('DELETE FROM enquiries WHERE id = ?').run(req.params.id);
  res.json({ data: { message: 'Enquiry deleted successfully' } });
}));

export default router;
