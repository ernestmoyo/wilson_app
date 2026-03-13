import { Router, Request, Response } from 'express';
import db from '../db/database';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

// GET / — list audit log entries with optional filters
router.get('/', asyncHandler((req: Request, res: Response) => {
  const entity_type = req.query.entity_type as string | undefined;
  const entity_id = req.query.entity_id as string | undefined;
  const user_id = req.query.user_id as string | undefined;
  const action = req.query.action as string | undefined;
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;

  const conditions: string[] = [];
  const params: any[] = [];

  if (entity_type) {
    conditions.push('al.entity_type = ?');
    params.push(entity_type);
  }
  if (entity_id) {
    conditions.push('al.entity_id = ?');
    params.push(entity_id);
  }
  if (user_id) {
    conditions.push('al.user_id = ?');
    params.push(user_id);
  }
  if (action) {
    conditions.push('al.action = ?');
    params.push(action);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const entries = db.prepare(`
    SELECT al.*, u.name AS user_name
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ${where}
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ data: entries });
}));

// GET /entity/:type/:id — get all log entries for a specific entity
router.get('/entity/:type/:id', asyncHandler((req: Request, res: Response) => {
  const entries = db.prepare(`
    SELECT al.*, u.name AS user_name
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.entity_type = ? AND al.entity_id = ?
    ORDER BY al.created_at DESC
  `).all(req.params.type, req.params.id);

  res.json({ data: entries });
}));

export default router;
