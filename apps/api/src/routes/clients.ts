import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET / — list all clients, support ?search=
router.get('/', (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    let clients;
    if (search) {
      const like = `%${search}%`;
      clients = db.prepare(`
        SELECT c.*, (SELECT COUNT(*) FROM assessments a WHERE a.client_id = c.id) AS assessment_count
        FROM clients c
        WHERE c.legal_name LIKE ? OR c.trading_name LIKE ? OR c.site_address LIKE ?
        ORDER BY c.legal_name ASC
      `).all(like, like, like);
    } else {
      clients = db.prepare(`
        SELECT c.*, (SELECT COUNT(*) FROM assessments a WHERE a.client_id = c.id) AS assessment_count
        FROM clients c
        ORDER BY c.legal_name ASC
      `).all();
    }
    res.json({ data: clients });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get single client with assessment count and certificate count
router.get('/:id', (req: Request, res: Response) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const assessmentCount = (db.prepare(
      'SELECT COUNT(*) as cnt FROM assessments WHERE client_id = ?'
    ).get(req.params.id) as any).cnt;

    const certificateCount = (db.prepare(
      'SELECT COUNT(*) as cnt FROM certificates WHERE client_id = ?'
    ).get(req.params.id) as any).cnt;

    res.json({ data: { ...client as object, assessment_count: assessmentCount, certificate_count: certificateCount } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create client
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      legal_name, trading_name, site_address, postal_address,
      phone, email, website, nzbn, industry,
      manager_name, manager_phone, manager_email
    } = req.body;

    if (!legal_name || !site_address) {
      return res.status(400).json({ error: 'legal_name and site_address are required' });
    }

    const result = db.prepare(`
      INSERT INTO clients (legal_name, trading_name, site_address, postal_address, phone, email, website, nzbn, industry, manager_name, manager_phone, manager_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      legal_name, trading_name || null, site_address, postal_address || null,
      phone || null, email || null, website || null, nzbn || null, industry || null,
      manager_name || null, manager_phone || null, manager_email || null
    );

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: client });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update client
router.put('/:id', (req: Request, res: Response) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as any;
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const {
      legal_name, trading_name, site_address, postal_address,
      phone, email, website, nzbn, industry,
      manager_name, manager_phone, manager_email
    } = req.body;

    db.prepare(`
      UPDATE clients SET
        legal_name = ?, trading_name = ?, site_address = ?, postal_address = ?,
        phone = ?, email = ?, website = ?, nzbn = ?, industry = ?,
        manager_name = ?, manager_phone = ?, manager_email = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      legal_name ?? client.legal_name,
      trading_name !== undefined ? trading_name : client.trading_name,
      site_address ?? client.site_address,
      postal_address !== undefined ? postal_address : client.postal_address,
      phone !== undefined ? phone : client.phone,
      email !== undefined ? email : client.email,
      website !== undefined ? website : client.website,
      nzbn !== undefined ? nzbn : client.nzbn,
      industry !== undefined ? industry : client.industry,
      manager_name !== undefined ? manager_name : client.manager_name,
      manager_phone !== undefined ? manager_phone : client.manager_phone,
      manager_email !== undefined ? manager_email : client.manager_email,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete client (check no active certificates)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const activeCerts = (db.prepare(
      "SELECT COUNT(*) as cnt FROM certificates WHERE client_id = ? AND status IN ('pending', 'granted')"
    ).get(req.params.id) as any).cnt;

    if (activeCerts > 0) {
      return res.status(400).json({ error: 'Cannot delete client with active certificates' });
    }

    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'Client deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
