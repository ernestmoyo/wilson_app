import { Router, Request, Response } from 'express';
import db from '../db/database';
import { asyncHandler } from '../middleware/asyncHandler';
import { logAudit } from '../lib/auditLog';

const router = Router();

// GET /expiring — list certificates expiring within 90 days (must be before /:id)
router.get('/expiring', asyncHandler((_req: Request, res: Response) => {
  const certificates = db.prepare(`
    SELECT cert.*, c.legal_name AS client_name
    FROM certificates cert
    LEFT JOIN clients c ON c.id = cert.client_id
    WHERE cert.status IN ('granted', 'conditional')
      AND cert.expiry_date IS NOT NULL
      AND cert.expiry_date <= date('now', '+90 days')
      AND cert.expiry_date >= date('now')
    ORDER BY cert.expiry_date ASC
  `).all();
  res.json({ data: certificates });
}));

// GET /overdue-notifications — certificates refused but WorkSafe not yet notified within deadline
router.get('/overdue-notifications', asyncHandler((_req: Request, res: Response) => {
  const overdue = db.prepare(`
    SELECT cert.*, c.legal_name AS client_name
    FROM certificates cert
    LEFT JOIN clients c ON c.id = cert.client_id
    WHERE cert.status = 'refused'
      AND cert.worksafe_notification_due IS NOT NULL
      AND cert.worksafe_notification_sent IS NULL
    ORDER BY cert.worksafe_notification_due ASC
  `).all();
  res.json({ data: overdue });
}));

// GET / — list certificates with optional filters
router.get('/', asyncHandler((req: Request, res: Response) => {
  const { status, client_id, certificate_type } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];

  if (status) { conditions.push('cert.status = ?'); params.push(status); }
  if (client_id) { conditions.push('cert.client_id = ?'); params.push(client_id); }
  if (certificate_type) { conditions.push('cert.certificate_type = ?'); params.push(certificate_type); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const certificates = db.prepare(`
    SELECT cert.*, c.legal_name AS client_name
    FROM certificates cert
    LEFT JOIN clients c ON c.id = cert.client_id
    ${where}
    ORDER BY cert.created_at DESC
  `).all(...params);

  res.json({ data: certificates });
}));

// GET /:id — get certificate details
router.get('/:id', asyncHandler((req: Request, res: Response) => {
  const certificate = db.prepare(`
    SELECT cert.*, c.legal_name AS client_name, c.nzbn, c.trading_name, c.companies_number,
           c.site_address, u.name AS inspector_name, u.certifier_number
    FROM certificates cert
    LEFT JOIN clients c ON c.id = cert.client_id
    LEFT JOIN users u ON u.id = cert.inspector_id
    WHERE cert.id = ?
  `).get(req.params.id);

  if (!certificate) return res.status(404).json({ error: 'Certificate not found' });
  res.json({ data: certificate });
}));

// POST / — create certificate with generated certificate_number
router.post('/', asyncHandler((req: Request, res: Response) => {
  const { client_id, assessment_id, inspector_id, substance_class, max_quantity, certificate_type } = req.body;

  if (!client_id || !inspector_id) {
    return res.status(400).json({ error: 'client_id and inspector_id are required' });
  }

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(400).json({ error: 'Client not found' });

  const result = db.prepare(`
    INSERT INTO certificates (client_id, assessment_id, inspector_id, substance_class, max_quantity, certificate_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    client_id, assessment_id || null, inspector_id,
    substance_class || null, max_quantity || null, certificate_type || 'location'
  );

  const newId = result.lastInsertRowid as number;
  const year = new Date().getFullYear();
  const prefix = (certificate_type === 'certified_handler') ? 'WH' : 'WC';
  const certificateNumber = `${prefix}-${year}-${String(newId).padStart(4, '0')}`;

  db.prepare('UPDATE certificates SET certificate_number = ? WHERE id = ?').run(certificateNumber, newId);

  logAudit('certificate', newId, 'created', { certificate_type, client_id }, inspector_id);

  const certificate = db.prepare(`
    SELECT cert.*, c.legal_name AS client_name, u.name AS inspector_name
    FROM certificates cert
    LEFT JOIN clients c ON c.id = cert.client_id
    LEFT JOIN users u ON u.id = cert.inspector_id
    WHERE cert.id = ?
  `).get(newId);

  res.status(201).json({ data: certificate });
}));

// PUT /:id — update certificate (grant, refuse, conditional, etc.)
router.put('/:id', asyncHandler((req: Request, res: Response) => {
  const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(req.params.id) as any;
  if (!cert) return res.status(404).json({ error: 'Certificate not found' });

  const {
    status, issue_date, in_force_date, expiry_date, refusal_reasons, substance_class, max_quantity,
    is_conditional, condition_details, condition_deadline,
    applicant_notified, worksafe_notified, worksafe_registered,
    certificate_type, refusal_date, refusal_regulations_not_met, refusal_form_generated,
    worksafe_notification_due, worksafe_notification_sent, applicant_notification_sent,
    handler_name, handler_address, handler_dob, handler_id_type, handler_id_verified,
  } = req.body;

  // If refusing, auto-calculate 15-working-day deadline for WorkSafe notification
  let notificationDue = worksafe_notification_due;
  if (status === 'refused' && !cert.worksafe_notification_due && !worksafe_notification_due) {
    const today = new Date();
    let workingDays = 0;
    const deadline = new Date(today);
    while (workingDays < 15) {
      deadline.setDate(deadline.getDate() + 1);
      const day = deadline.getDay();
      if (day !== 0 && day !== 6) workingDays++;
    }
    notificationDue = deadline.toISOString().split('T')[0];
  }

  db.prepare(`
    UPDATE certificates SET
      status = ?, issue_date = ?, in_force_date = ?, expiry_date = ?, refusal_reasons = ?,
      substance_class = ?, max_quantity = ?,
      is_conditional = ?, condition_details = ?, condition_deadline = ?,
      applicant_notified = ?, worksafe_notified = ?, worksafe_registered = ?,
      certificate_type = ?, refusal_date = ?, refusal_regulations_not_met = ?,
      refusal_form_generated = ?, worksafe_notification_due = ?,
      worksafe_notification_sent = ?, applicant_notification_sent = ?,
      handler_name = ?, handler_address = ?, handler_dob = ?,
      handler_id_type = ?, handler_id_verified = ?
    WHERE id = ?
  `).run(
    status ?? cert.status,
    issue_date !== undefined ? issue_date : cert.issue_date,
    in_force_date !== undefined ? in_force_date : cert.in_force_date,
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
    certificate_type !== undefined ? certificate_type : cert.certificate_type,
    refusal_date !== undefined ? refusal_date : (status === 'refused' && !cert.refusal_date ? new Date().toISOString().split('T')[0] : cert.refusal_date),
    refusal_regulations_not_met !== undefined ? refusal_regulations_not_met : cert.refusal_regulations_not_met,
    refusal_form_generated !== undefined ? refusal_form_generated : cert.refusal_form_generated,
    notificationDue !== undefined ? notificationDue : cert.worksafe_notification_due,
    worksafe_notification_sent !== undefined ? worksafe_notification_sent : cert.worksafe_notification_sent,
    applicant_notification_sent !== undefined ? applicant_notification_sent : cert.applicant_notification_sent,
    handler_name !== undefined ? handler_name : cert.handler_name,
    handler_address !== undefined ? handler_address : cert.handler_address,
    handler_dob !== undefined ? handler_dob : cert.handler_dob,
    handler_id_type !== undefined ? handler_id_type : cert.handler_id_type,
    handler_id_verified !== undefined ? handler_id_verified : cert.handler_id_verified,
    req.params.id
  );

  logAudit('certificate', Number(req.params.id), status === 'refused' ? 'refused' : 'updated', { status, prev_status: cert.status }, cert.inspector_id);

  const updated = db.prepare(`
    SELECT cert.*, c.legal_name AS client_name, u.name AS inspector_name
    FROM certificates cert
    LEFT JOIN clients c ON c.id = cert.client_id
    LEFT JOIN users u ON u.id = cert.inspector_id
    WHERE cert.id = ?
  `).get(req.params.id);

  res.json({ data: updated });
}));

// GET /:id/refusal-form — generate WSNZ_4456_FEB 23 refusal notification data
router.get('/:id/refusal-form', asyncHandler((req: Request, res: Response) => {
  const cert = db.prepare(`
    SELECT cert.*, c.legal_name, c.nzbn, c.site_address, c.trading_name, c.companies_number,
           c.phone AS client_phone, c.email AS client_email,
           u.name AS certifier_name, u.certifier_number, u.email AS certifier_email
    FROM certificates cert
    LEFT JOIN clients c ON c.id = cert.client_id
    LEFT JOIN users u ON u.id = cert.inspector_id
    WHERE cert.id = ?
  `).get(req.params.id) as any;

  if (!cert) return res.status(404).json({ error: 'Certificate not found' });
  if (cert.status !== 'refused') return res.status(400).json({ error: 'Certificate is not refused' });

  const form = {
    form_id: 'WSNZ_4456_FEB 23',
    title: 'Notification of refusal to issue a compliance certificate',
    generated_at: new Date().toISOString(),
    applicant: {
      legal_name: cert.legal_name,
      trading_name: cert.trading_name,
      nzbn: cert.nzbn,
      companies_number: cert.companies_number,
      site_address: cert.site_address,
      phone: cert.client_phone,
      email: cert.client_email,
    },
    certificate: {
      certificate_number: cert.certificate_number,
      certificate_type: cert.certificate_type || 'location',
      substance_classes: cert.substance_class,
      max_quantity: cert.max_quantity,
    },
    refusal: {
      date: cert.refusal_date,
      reasons: cert.refusal_reasons,
      regulations_not_met: cert.refusal_regulations_not_met,
      worksafe_notification_due: cert.worksafe_notification_due,
    },
    certifier: {
      name: cert.certifier_name,
      certifier_number: cert.certifier_number,
      email: cert.certifier_email,
    },
  };

  db.prepare('UPDATE certificates SET refusal_form_generated = 1 WHERE id = ?').run(req.params.id);

  res.json({ data: form });
}));

// DELETE /:id — delete certificate
router.delete('/:id', asyncHandler((req: Request, res: Response) => {
  const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(req.params.id) as any;
  if (!cert) return res.status(404).json({ error: 'Certificate not found' });

  db.prepare('DELETE FROM certificates WHERE id = ?').run(req.params.id);
  logAudit('certificate', Number(req.params.id), 'deleted', { certificate_number: cert.certificate_number, client_id: cert.client_id });
  res.json({ data: { message: 'Certificate deleted successfully' } });
}));

export default router;
