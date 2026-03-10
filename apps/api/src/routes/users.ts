import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET / — list all users
router.get('/', (_req: Request, res: Response) => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    res.json({ data: users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get user by id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create user
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, email, role, certifier_number, phone } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

    const stmt = db.prepare(`
      INSERT INTO users (name, email, role, certifier_number, phone)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, email, role || 'certifier', certifier_number || null, phone || null);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: user });
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update user
router.put('/:id', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, email, role, certifier_number, phone } = req.body;
    db.prepare(`
      UPDATE users SET name = ?, email = ?, role = ?, certifier_number = ?, phone = ?
      WHERE id = ?
    `).run(
      name ?? (user as any).name,
      email ?? (user as any).email,
      role ?? (user as any).role,
      certifier_number !== undefined ? certifier_number : (user as any).certifier_number,
      phone !== undefined ? phone : (user as any).phone,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete user (prevent deleting last user)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any).cnt;
    if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last user' });

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'User deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
