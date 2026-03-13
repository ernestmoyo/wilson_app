import { Router, Request, Response } from 'express';
import db from '../db/database';
import { asyncHandler } from '../middleware/asyncHandler';
import { logAudit } from '../lib/auditLog';

const router = Router();

// GET / — list all users
router.get('/', asyncHandler((_req: Request, res: Response) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  res.json({ data: users });
}));

// GET /:id — get user by id
router.get('/:id', asyncHandler((req: Request, res: Response) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ data: user });
}));

// POST / — create user
router.post('/', asyncHandler((req: Request, res: Response) => {
  const { name, email, role, certifier_number, phone } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

  const stmt = db.prepare(`
    INSERT INTO users (name, email, role, certifier_number, phone)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, email, role || 'certifier', certifier_number || null, phone || null);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  logAudit('user', result.lastInsertRowid, 'created', { name, email, role: role || 'certifier' });
  res.status(201).json({ data: user });
}));

// PUT /:id — update user
router.put('/:id', asyncHandler((req: Request, res: Response) => {
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

  logAudit('user', Number(req.params.id), 'updated', { name: name ?? (user as any).name, email: email ?? (user as any).email });

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json({ data: updated });
}));

// DELETE /:id — delete user (prevent deleting last user)
router.delete('/:id', asyncHandler((req: Request, res: Response) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const count = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any).cnt;
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last user' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logAudit('user', Number(req.params.id), 'deleted', { name: user.name, email: user.email });
  res.json({ data: { message: 'User deleted successfully' } });
}));

export default router;
