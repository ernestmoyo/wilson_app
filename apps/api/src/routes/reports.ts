import { Router, Request, Response } from 'express';
import db from '../db/database';
import { asyncHandler } from '../middleware/asyncHandler';
import { logAudit } from '../lib/auditLog';

const router = Router();

// POST /generate/gap-analysis/:assessment_id — auto-generate gap analysis (must be before /:id)
router.post('/generate/gap-analysis/:assessment_id', asyncHandler((req: Request, res: Response) => {
  const assessment = db.prepare(`
    SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
    FROM assessments a
    LEFT JOIN clients c ON c.id = a.client_id
    LEFT JOIN users u ON u.id = a.inspector_id
    WHERE a.id = ?
  `).get(req.params.assessment_id) as any;

  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const allItems = db.prepare(
    'SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC, item_number ASC'
  ).all(req.params.assessment_id) as any[];

  // Tally counts
  const summary = {
    total_items: allItems.length,
    compliant: allItems.filter(i => i.status === 'compliant').length,
    non_compliant: allItems.filter(i => i.status === 'non_compliant').length,
    inapplicable: allItems.filter(i => i.status === 'inapplicable').length,
    pending: allItems.filter(i => i.status === 'pending').length,
  };

  // Group non-compliant items by section
  const nonCompliantItems = allItems.filter(i => i.status === 'non_compliant');
  const sectionMap: Record<string, { item_number: string; description: string; comments: string | null }[]> = {};

  for (const item of nonCompliantItems) {
    if (!sectionMap[item.section]) sectionMap[item.section] = [];
    sectionMap[item.section].push({
      item_number: item.item_number,
      description: item.description,
      comments: item.comments || null,
    });
  }

  const sections = Object.entries(sectionMap).map(([section, items]) => ({ section, items }));

  const decision: 'compliant' | 'non_compliant' = summary.non_compliant > 0 ? 'non_compliant' : 'compliant';

  const content = { sections, summary, decision };

  // Persist the generated report
  const inspectorId = assessment.inspector_id;
  const title = `Gap Analysis — ${assessment.client_name} — ${new Date().toISOString().split('T')[0]}`;

  const result = db.prepare(`
    INSERT INTO reports (client_id, assessment_id, inspector_id, type, title, content)
    VALUES (?, ?, ?, 'gap_analysis', ?, ?)
  `).run(
    assessment.client_id,
    assessment.id,
    inspectorId,
    title,
    JSON.stringify(content)
  );

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid) as any;

  logAudit('report', result.lastInsertRowid, 'created', { type: 'gap_analysis', title, assessment_id: assessment.id }, inspectorId);

  // Parse the content JSON for the response
  res.status(201).json({
    data: {
      ...report,
      content,
    },
  });
}));

// GET / — list reports, support ?client_id= and ?type=
router.get('/', asyncHandler((req: Request, res: Response) => {
  const { client_id, type } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];

  if (client_id) { conditions.push('r.client_id = ?'); params.push(client_id); }
  if (type) { conditions.push('r.type = ?'); params.push(type); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const reports = db.prepare(`
    SELECT r.id, r.client_id, r.assessment_id, r.inspector_id, r.type, r.title, r.created_at,
           c.legal_name AS client_name, u.name AS inspector_name
    FROM reports r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN users u ON u.id = r.inspector_id
    ${where}
    ORDER BY r.created_at DESC
  `).all(...params);

  res.json({ data: reports });
}));

// GET /:id — get report with content
router.get('/:id', asyncHandler((req: Request, res: Response) => {
  const report = db.prepare(`
    SELECT r.*, c.legal_name AS client_name, u.name AS inspector_name
    FROM reports r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN users u ON u.id = r.inspector_id
    WHERE r.id = ?
  `).get(req.params.id) as any;

  if (!report) return res.status(404).json({ error: 'Report not found' });

  // Parse content from JSON string to object
  try {
    report.content = JSON.parse(report.content);
  } catch {
    // leave as-is if not parseable
  }

  res.json({ data: report });
}));

// POST / — create report
router.post('/', asyncHandler((req: Request, res: Response) => {
  const { client_id, assessment_id, inspector_id, type, title, content } = req.body;

  if (!client_id || !inspector_id || !type || !title) {
    return res.status(400).json({ error: 'client_id, inspector_id, type, and title are required' });
  }

  const validTypes = ['compliance_report', 'gap_analysis', 'non_compliance_notice', 'certificate_report'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
  }

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(400).json({ error: 'Client not found' });

  let contentStr: string;
  if (typeof content === 'object' && content !== null) {
    contentStr = JSON.stringify(content);
  } else if (typeof content === 'string') {
    contentStr = content;
  } else {
    contentStr = '{}';
  }

  const result = db.prepare(`
    INSERT INTO reports (client_id, assessment_id, inspector_id, type, title, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    client_id,
    assessment_id || null,
    inspector_id,
    type,
    title,
    contentStr
  );

  const report = db.prepare(`
    SELECT r.*, c.legal_name AS client_name, u.name AS inspector_name
    FROM reports r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN users u ON u.id = r.inspector_id
    WHERE r.id = ?
  `).get(result.lastInsertRowid) as any;

  try { report.content = JSON.parse(report.content); } catch { /* leave as-is */ }

  logAudit('report', result.lastInsertRowid, 'created', { type, title, client_id }, inspector_id);

  res.status(201).json({ data: report });
}));

// DELETE /:id — delete report
router.delete('/:id', asyncHandler((req: Request, res: Response) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id) as any;
  if (!report) return res.status(404).json({ error: 'Report not found' });

  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  logAudit('report', Number(req.params.id), 'deleted', { type: report.type, title: report.title });
  res.json({ data: { message: 'Report deleted successfully' } });
}));

export default router;
