import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET / — list site plans, support ?client_id=
router.get('/', (req: Request, res: Response) => {
  try {
    const { client_id } = req.query;
    let plans;
    if (client_id) {
      plans = db.prepare(
        'SELECT * FROM site_plans WHERE client_id = ? ORDER BY updated_at DESC'
      ).all(client_id as string);
    } else {
      plans = db.prepare('SELECT * FROM site_plans ORDER BY updated_at DESC').all();
    }
    res.json({ data: plans });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get single site plan
router.get('/:id', (req: Request, res: Response) => {
  try {
    const plan = db.prepare('SELECT * FROM site_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Site plan not found' });
    res.json({ data: plan });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create site plan
router.post('/', (req: Request, res: Response) => {
  try {
    const { client_id, plan_name, plan_data } = req.body;

    if (!client_id) return res.status(400).json({ error: 'client_id is required' });

    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(400).json({ error: 'Client not found' });

    // Accept plan_data as object or JSON string
    let planDataStr: string;
    if (typeof plan_data === 'object' && plan_data !== null) {
      planDataStr = JSON.stringify(plan_data);
    } else if (typeof plan_data === 'string') {
      // Validate it's valid JSON
      try { JSON.parse(plan_data); } catch { return res.status(400).json({ error: 'plan_data must be valid JSON' }); }
      planDataStr = plan_data;
    } else {
      planDataStr = '{}';
    }

    const result = db.prepare(`
      INSERT INTO site_plans (client_id, plan_name, plan_data, version)
      VALUES (?, ?, ?, 1)
    `).run(client_id, plan_name || 'Site Plan', planDataStr);

    const plan = db.prepare('SELECT * FROM site_plans WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: plan });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update site plan (increment version)
router.put('/:id', (req: Request, res: Response) => {
  try {
    const plan = db.prepare('SELECT * FROM site_plans WHERE id = ?').get(req.params.id) as any;
    if (!plan) return res.status(404).json({ error: 'Site plan not found' });

    const { plan_name, plan_data } = req.body;

    let planDataStr: string = plan.plan_data;
    if (plan_data !== undefined) {
      if (typeof plan_data === 'object' && plan_data !== null) {
        planDataStr = JSON.stringify(plan_data);
      } else if (typeof plan_data === 'string') {
        try { JSON.parse(plan_data); } catch { return res.status(400).json({ error: 'plan_data must be valid JSON' }); }
        planDataStr = plan_data;
      }
    }

    db.prepare(`
      UPDATE site_plans SET
        plan_name = ?, plan_data = ?, version = version + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      plan_name ?? plan.plan_name,
      planDataStr,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM site_plans WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete site plan
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const plan = db.prepare('SELECT * FROM site_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Site plan not found' });

    db.prepare('DELETE FROM site_plans WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'Site plan deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
