import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// ─── Comprehensive NZ HSW Location Inspection Checklist ───
// Clause-mapped to all 3 Performance Standards:
//   1. Information & Process Requirements for Compliance Certifiers 2019 (amended 2023)
//   2. Location Compliance Certification (Classes 2–6 & 8) Performance Standard 2021
//   3. Certified Handler Performance Standard 2019/2021
const SITE_INSPECTION_TEMPLATE = [
  // ── Section A — Administrative & Pre-Inspection ──
  { section: 'A', item_number: 'A1', description: 'PCBU legal name, NZBN, and contact details verified and recorded', legal_ref: 'Location PS 2021, Cl.8, Sch.1 Cl.1', risk_level: 'medium', evidence_required: 0, sort_order: 1 },
  { section: 'A', item_number: 'A2', description: 'Workplace street address confirmed and matches application', legal_ref: 'Location PS 2021, Cl.8, Sch.1 Cl.2', risk_level: 'medium', evidence_required: 0, sort_order: 2 },
  { section: 'A', item_number: 'A3', description: 'Certificate scope defined — substance classes and locations to be certified', legal_ref: 'Location PS 2021, Cl.8, Sch.1 Cl.2', risk_level: 'medium', evidence_required: 0, sort_order: 3 },
  { section: 'A', item_number: 'A4', description: 'Prior compliance certificates or EPA notifications checked for changes', legal_ref: 'Location PS 2021, Cl.17', risk_level: 'medium', evidence_required: 0, sort_order: 4 },
  { section: 'A', item_number: 'A5', description: 'Hazardous substances inventory obtained — substances listed by name, HSNO approval, class/subclass, maximum quantity', legal_ref: 'Location PS 2021, Sch.1 Cl.1, Tables 1.1–1.2', risk_level: 'high', evidence_required: 1, sort_order: 5 },
  { section: 'A', item_number: 'A6', description: 'Notification to WorkSafe completed and maximum quantities not exceeded (Sch.9 thresholds)', legal_ref: 'HSW Regs 2017, reg 10.26(2), 10.34(1)(a); Location PS 2021, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 6 },

  // ── Section B — Site Security & Access Control ──
  { section: 'B', item_number: 'B1', description: 'Hazardous substance location can be appropriately secured from unauthorised access', legal_ref: 'HSW Regs 2017, reg 10.34(1)(b); Location PS 2021, Sch.1 Cl.4', risk_level: 'high', evidence_required: 1, sort_order: 7 },
  { section: 'B', item_number: 'B2', description: 'Site plan is available showing physical position of all HSLs and hazardous areas', legal_ref: 'HSW Regs 2017, reg 10.26(4)(b); Location PS 2021, Sch.1 Cl.6', risk_level: 'high', evidence_required: 1, sort_order: 8 },
  { section: 'B', item_number: 'B3', description: 'Site plan shows boundaries, hazardous areas, separation distances, and controlled zones', legal_ref: 'Location PS 2021, Sch.1 Cl.6, Table 1.8', risk_level: 'high', evidence_required: 1, sort_order: 9 },

  // ── Section C — Worker Training & Supervision ──
  { section: 'C', item_number: 'C1', description: 'Training records demonstrate workers have received information, training and instruction on hazardous substances', legal_ref: 'HSW Regs 2017, reg 4.5, 10.34(1)(c); Info & Process PS 2019, Cl.19', risk_level: 'high', evidence_required: 1, sort_order: 10 },
  { section: 'C', item_number: 'C2', description: 'Supervision arrangements are adequate for all workers handling hazardous substances', legal_ref: 'HSW Regs 2017, reg 4.6; Info & Process PS 2019, Cl.19', risk_level: 'high', evidence_required: 0, sort_order: 11 },
  { section: 'C', item_number: 'C3', description: 'Training records available for inspection by WorkSafe inspector or compliance certifier', legal_ref: 'HSW Regs 2017, reg 4.5(3)', risk_level: 'medium', evidence_required: 1, sort_order: 12 },

  // ── Section D — Hazardous Area Delineation ──
  { section: 'D', item_number: 'D1', description: 'Hazardous area established (if required) and extent is documented', legal_ref: 'HSW Regs 2017, reg 10.6, 10.34(1)(d); Location PS 2021, Sch.2', risk_level: 'critical', evidence_required: 1, sort_order: 13 },
  { section: 'D', item_number: 'D2', description: 'Electrical installations in hazardous areas comply with AS/NZS 60079.10.1', legal_ref: 'HSW Regs 2017, reg 10.7; Location PS 2021, Sch.2', risk_level: 'critical', evidence_required: 1, sort_order: 14 },
  { section: 'D', item_number: 'D3', description: 'Electrical dossier available documenting hazardous area classification', legal_ref: 'Location PS 2021, Sch.2, Cl.10.4', risk_level: 'high', evidence_required: 1, sort_order: 15 },

  // ── Section E — Segregation & Separation ──
  { section: 'E', item_number: 'E1', description: 'Class 2/3/4 substances are not in contact with incompatible substances or materials', legal_ref: 'HSW Regs 2017, reg 10.5(1)(a), 10.34(1)(e); Location PS 2021, Sch.1 Cl.4', risk_level: 'critical', evidence_required: 1, sort_order: 16 },
  { section: 'E', item_number: 'E2', description: 'Containers of incompatible substances are stored separately per segregation tables', legal_ref: 'HSW Regs 2017, reg 10.5(1)(b)', risk_level: 'high', evidence_required: 1, sort_order: 17 },
  { section: 'E', item_number: 'E3', description: 'Separation distances from protected places measured and compliant', legal_ref: 'Location PS 2021, Sch.2–6; HSW Regs 2017, reg 10.22', risk_level: 'critical', evidence_required: 1, sort_order: 18 },

  // ── Section F — Signage ──
  { section: 'F', item_number: 'F1', description: 'Signage at all entry points — legible at 10m, durable and weather-resistant', legal_ref: 'HSW Regs 2017, reg 2.5, 10.34(1)(f); Location PS 2021, Sch.1 Cl.5', risk_level: 'high', evidence_required: 1, sort_order: 19 },
  { section: 'F', item_number: 'F2', description: 'Signage includes correct hazard classifications and emergency contact information', legal_ref: 'HSW Regs 2017, reg 2.5; Location PS 2021, Sch.1 Table 1.5', risk_level: 'high', evidence_required: 1, sort_order: 20 },

  // ── Section G — Emergency Management ──
  { section: 'G', item_number: 'G1', description: 'Fire extinguishers present in number and type required by Schedule 4', legal_ref: 'HSW Regs 2017, reg 5.3–5.5, 10.34(1)(g); Location PS 2021, Sch.1 Cl.7', risk_level: 'critical', evidence_required: 1, sort_order: 21 },
  { section: 'G', item_number: 'G2', description: 'Fire extinguishers serviced within required intervals — service tags current', legal_ref: 'HSW Regs 2017, reg 5.5(2)', risk_level: 'high', evidence_required: 1, sort_order: 22 },
  { section: 'G', item_number: 'G3', description: 'Emergency Response Plan (ERP) prepared, covering all foreseeable emergencies', legal_ref: 'HSW Regs 2017, reg 5.7, 10.34(1)(g); Location PS 2021, Sch.1 Cl.7', risk_level: 'critical', evidence_required: 1, sort_order: 23 },
  { section: 'G', item_number: 'G4', description: 'ERP has been tested and revised; test records and dates available', legal_ref: 'HSW Regs 2017, reg 5.12', risk_level: 'high', evidence_required: 1, sort_order: 24 },
  { section: 'G', item_number: 'G5', description: 'ERP and emergency equipment readily accessible to workers and emergency services', legal_ref: 'HSW Regs 2017, reg 5.9, 5.10', risk_level: 'high', evidence_required: 0, sort_order: 25 },
  { section: 'G', item_number: 'G6', description: 'Spill containment and cleanup equipment available and appropriate for substance classes', legal_ref: 'HSW Regs 2017, reg 5.8', risk_level: 'high', evidence_required: 1, sort_order: 26 },

  // ── Section H — Secondary Containment ──
  { section: 'H', item_number: 'H1', description: 'Secondary containment system in place where required (Class 3/4 pooling substances above Sch.9 threshold)', legal_ref: 'HSW Regs 2017, reg 10.30, 10.34(1)(h); Location PS 2021, Sch.2', risk_level: 'critical', evidence_required: 1, sort_order: 27 },
  { section: 'H', item_number: 'H2', description: 'Secondary containment is impervious to contained substance and fire-resistant (above-ground tanks)', legal_ref: 'HSW Regs 2017, reg 17.102', risk_level: 'critical', evidence_required: 1, sort_order: 28 },
  { section: 'H', item_number: 'H3', description: 'Secondary containment capacity verified (calculation sheet or engineer certification)', legal_ref: 'HSW Regs 2017, reg 10.30(2)', risk_level: 'critical', evidence_required: 1, sort_order: 29 },

  // ── Section I — Quantity Verification & Storage ──
  { section: 'I', item_number: 'I1', description: 'Maximum quantities on-site verified against declared inventory via physical inspection', legal_ref: 'Location PS 2021, Sch.1 Cl.1, Table 1.1', risk_level: 'high', evidence_required: 1, sort_order: 30 },
  { section: 'I', item_number: 'I2', description: 'Storage containers and vessels are in good condition and correctly labelled', legal_ref: 'HSW Regs 2017, reg 2.3, 2.4', risk_level: 'high', evidence_required: 1, sort_order: 31 },
  { section: 'I', item_number: 'I3', description: 'Gas cylinders properly secured, valves protected, and stored upright where required', legal_ref: 'HSW Regs 2017, reg 10.8', risk_level: 'high', evidence_required: 1, sort_order: 32 },

  // ── Section J — Documentation & Safety Data Sheets ──
  { section: 'J', item_number: 'J1', description: 'Current SDS obtained from manufacturer/supplier for each hazardous substance (within 5 years)', legal_ref: 'HSW Regs 2017, reg 2.11(1); Location PS 2021, Sch.1 Table 1.7', risk_level: 'high', evidence_required: 1, sort_order: 33 },
  { section: 'J', item_number: 'J2', description: 'SDS (or condensed product safety card) readily accessible to workers and emergency services at all times', legal_ref: 'HSW Regs 2017, reg 2.11(3)', risk_level: 'high', evidence_required: 0, sort_order: 34 },
  { section: 'J', item_number: 'J3', description: 'Register of hazardous substances maintained and current', legal_ref: 'HSW Regs 2017, reg 10.26(4)(a)', risk_level: 'medium', evidence_required: 0, sort_order: 35 },

  // ── Section K — Class-Specific: Flammables (Classes 2 & 3.1) ──
  { section: 'K', item_number: 'K1', description: 'Class 2/3.1 — Secure storage with ventilation meeting required air changes', legal_ref: 'Location PS 2021, Sch.2, Cl.10.4, 10.22', risk_level: 'critical', evidence_required: 1, sort_order: 36 },
  { section: 'K', item_number: 'K2', description: 'Class 2/3.1 — Separation distances to protected places measured and compliant', legal_ref: 'Location PS 2021, Sch.2, Tables', risk_level: 'critical', evidence_required: 1, sort_order: 37 },
  { section: 'K', item_number: 'K3', description: 'Class 2/3.1 — Ignition sources excluded from hazardous areas', legal_ref: 'Location PS 2021, Sch.2; HSW Regs 2017, reg 10.7', risk_level: 'critical', evidence_required: 1, sort_order: 38 },

  // ── Section L — Class-Specific: Oxidisers (Classes 5.1 & 5.2) ──
  { section: 'L', item_number: 'L1', description: 'Class 5.1/5.2 — Security measures and ignition controls verified', legal_ref: 'Location PS 2021, Sch.4, Cl.12.3', risk_level: 'critical', evidence_required: 1, sort_order: 39 },
  { section: 'L', item_number: 'L2', description: 'Class 5.1/5.2 — Package closing procedures and PPE/decontamination checks completed', legal_ref: 'Location PS 2021, Sch.4', risk_level: 'high', evidence_required: 1, sort_order: 40 },

  // ── Section M — Class-Specific: Toxic & Corrosive (Classes 6 & 8) ──
  { section: 'M', item_number: 'M1', description: 'Class 6/8 — Specialised equipment and PPE verified as available and in good condition', legal_ref: 'Location PS 2021, Sch.5–6, Cl.13.7, 13.40', risk_level: 'critical', evidence_required: 1, sort_order: 41 },
  { section: 'M', item_number: 'M2', description: 'Class 6/8 — Ventilation, containment and access control measures in place', legal_ref: 'Location PS 2021, Sch.5–6', risk_level: 'high', evidence_required: 1, sort_order: 42 },

  // ── Section N — Class-Specific: Temperature-Sensitive (Classes 3.2 & 4) ──
  { section: 'N', item_number: 'N1', description: 'Class 3.2/4 — Temperature control plan in place with monitoring logs', legal_ref: 'Location PS 2021, Sch.3', risk_level: 'critical', evidence_required: 1, sort_order: 43 },
  { section: 'N', item_number: 'N2', description: 'Class 3.2/4 — Temperature alarm processes and emergency cooling procedures verified', legal_ref: 'Location PS 2021, Sch.3', risk_level: 'critical', evidence_required: 1, sort_order: 44 },

  // ── Section O — Defective Equipment ──
  { section: 'O', item_number: 'O1', description: 'All equipment for hazardous substances inspected and confirmed serviceable', legal_ref: 'Location PS 2021, Cl.21(5), 22', risk_level: 'high', evidence_required: 1, sort_order: 45 },
  { section: 'O', item_number: 'O2', description: 'Defective equipment isolated, tagged "Do Not Use", and LOTO applied', legal_ref: 'Location PS 2021, Cl.22', risk_level: 'critical', evidence_required: 1, sort_order: 46 },
];

// ─── Certified Handler Assessment Checklist ───
const CERTIFIED_HANDLER_TEMPLATE = [
  { section: 'CH-A', item_number: 'CH-A1', description: 'Applicant full legal name, contact address, and date of birth recorded', legal_ref: 'Handler PS 2019, Cl.8; Handler PS 2021, Cl.8', risk_level: 'high', evidence_required: 1, sort_order: 1 },
  { section: 'CH-A', item_number: 'CH-A2', description: 'Identity document sighted — original or certified copy of birth certificate, passport, or NZ drivers licence', legal_ref: 'Handler PS 2019, Cl.10; Handler PS 2021, Cl.10', risk_level: 'critical', evidence_required: 1, sort_order: 2 },
  { section: 'CH-A', item_number: 'CH-A3', description: 'Identity document type, number, and expiry date recorded', legal_ref: 'Handler PS 2019, Cl.10', risk_level: 'high', evidence_required: 1, sort_order: 3 },

  { section: 'CH-B', item_number: 'CH-B1', description: 'Knowledge verified — hazard classification and properties of relevant substance classes', legal_ref: 'HSW Regs 2017, reg 4.3; Handler PS 2019, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 4 },
  { section: 'CH-B', item_number: 'CH-B2', description: 'Knowledge verified — safe handling, storage, transport, and disposal procedures', legal_ref: 'HSW Regs 2017, reg 4.3(a)–(c); Handler PS 2019, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 5 },
  { section: 'CH-B', item_number: 'CH-B3', description: 'Knowledge verified — emergency response procedures and first aid for relevant substances', legal_ref: 'HSW Regs 2017, reg 4.3(d); Handler PS 2019, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 6 },
  { section: 'CH-B', item_number: 'CH-B4', description: 'Knowledge verified — PPE selection, use, maintenance and limitations', legal_ref: 'HSW Regs 2017, reg 4.3(e); Handler PS 2019, Cl.11', risk_level: 'high', evidence_required: 1, sort_order: 7 },
  { section: 'CH-B', item_number: 'CH-B5', description: 'Practical assessment — applicant demonstrated competent handling of relevant substance class', legal_ref: 'Handler PS 2019, Cl.11; Handler PS 2021, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 8 },
  { section: 'CH-B', item_number: 'CH-B6', description: 'Relevant qualifications and training certificates verified and copied', legal_ref: 'Info & Process PS 2019, Cl.19; Handler PS 2019, Cl.11', risk_level: 'high', evidence_required: 1, sort_order: 9 },

  { section: 'CH-C', item_number: 'CH-C1', description: 'All competency elements confirmed — structured decision record completed', legal_ref: 'Handler PS 2019, Cl.12; Handler PS 2021, Cl.12', risk_level: 'critical', evidence_required: 0, sort_order: 10 },
  { section: 'CH-C', item_number: 'CH-C2', description: 'Assessor statement and rationale documented, signed, and dated', legal_ref: 'Handler PS 2019, Cl.12; Info & Process PS 2019, Cl.21', risk_level: 'critical', evidence_required: 0, sort_order: 11 },

  { section: 'CH-D', item_number: 'CH-D1', description: 'Certificate includes statement under Reg 4.1 and 6.23, unique register number, handler details', legal_ref: 'Handler PS 2019, Cl.14; HSW Regs 2017, reg 4.1, 6.23', risk_level: 'critical', evidence_required: 0, sort_order: 12 },
  { section: 'CH-D', item_number: 'CH-D2', description: 'Expiry date set at exactly 5 calendar years from issue date', legal_ref: 'Handler PS 2019, Cl.16; HSW Regs 2017, reg 6.23(2)', risk_level: 'critical', evidence_required: 0, sort_order: 13 },
];

function getTemplateForType(type: string) {
  if (type === 'certified_handler') return CERTIFIED_HANDLER_TEMPLATE;
  if (type === 'site_inspection') return SITE_INSPECTION_TEMPLATE;
  return null;
}

// GET / — list assessments with optional filters
router.get('/', (req: Request, res: Response) => {
  try {
    const { client_id, status, type } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (client_id) { conditions.push('a.client_id = ?'); params.push(client_id); }
    if (status) { conditions.push('a.status = ?'); params.push(status); }
    if (type) { conditions.push('a.type = ?'); params.push(type); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const assessments = db.prepare(`
      SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM assessments a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN users u ON u.id = a.inspector_id
      ${where}
      ORDER BY a.created_at DESC
    `).all(...params);

    res.json({ data: assessments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /templates/:type — return the checklist template
router.get('/templates/:type', (req: Request, res: Response) => {
  const template = getTemplateForType(req.params.type);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json({ data: template });
});

// GET /:id — get assessment with all its items
router.get('/:id', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare(`
      SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM assessments a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN users u ON u.id = a.inspector_id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const items = db.prepare(
      'SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC, item_number ASC'
    ).all(req.params.id);

    res.json({ data: { ...assessment as object, items } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create assessment (auto-populates checklist for site_inspection and certified_handler)
router.post('/', (req: Request, res: Response) => {
  try {
    const { client_id, inspector_id, type, inspection_date, substance_classes, notes } = req.body;

    if (!client_id || !type) return res.status(400).json({ error: 'client_id and type are required' });

    const validTypes = ['pre_inspection', 'site_inspection', 'validation', 'certified_handler'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(400).json({ error: 'Client not found' });

    const resolvedInspectorId = inspector_id || 1;
    const inspector = db.prepare('SELECT id FROM users WHERE id = ?').get(resolvedInspectorId);
    if (!inspector) return res.status(400).json({ error: 'Inspector not found' });

    const result = db.prepare(`
      INSERT INTO assessments (client_id, inspector_id, type, inspection_date, substance_classes, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(client_id, resolvedInspectorId, type, inspection_date || null, substance_classes || null, notes || null);

    const assessmentId = result.lastInsertRowid;

    // Auto-populate checklist based on assessment type
    const template = getTemplateForType(type);
    if (template) {
      const insertItem = db.prepare(`
        INSERT INTO assessment_items (assessment_id, section, item_number, description, status, legal_ref, sort_order, risk_level, evidence_required)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.exec('BEGIN');
      try {
        for (const item of template) {
          insertItem.run(assessmentId, item.section, item.item_number, item.description, 'pending', item.legal_ref, item.sort_order, item.risk_level, item.evidence_required);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }

    // Audit log
    try {
      db.prepare('INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES (?,?,?,?,?)')
        .run('assessment', assessmentId, 'created', resolvedInspectorId, JSON.stringify({ type, client_id }));
    } catch (_) { /* audit_log may not exist yet */ }

    const assessment = db.prepare(`
      SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM assessments a LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN users u ON u.id = a.inspector_id
      WHERE a.id = ?
    `).get(assessmentId);

    const items = db.prepare('SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC').all(assessmentId);

    res.status(201).json({ data: { ...assessment as object, items } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update assessment fields
router.put('/:id', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id) as any;
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const { type, status, inspection_date, substance_classes, notes, inspector_id } = req.body;

    db.prepare(`
      UPDATE assessments SET
        type = ?, status = ?, inspection_date = ?, substance_classes = ?, notes = ?, inspector_id = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      type ?? assessment.type, status ?? assessment.status,
      inspection_date !== undefined ? inspection_date : assessment.inspection_date,
      substance_classes !== undefined ? substance_classes : assessment.substance_classes,
      notes !== undefined ? notes : assessment.notes,
      inspector_id ?? assessment.inspector_id, req.params.id
    );

    const updated = db.prepare(`
      SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM assessments a LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN users u ON u.id = a.inspector_id
      WHERE a.id = ?
    `).get(req.params.id);

    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/items/:itemId — update a single checklist item (status, NC, corrective action)
router.put('/:id/items/:itemId', (req: Request, res: Response) => {
  try {
    const item = db.prepare('SELECT * FROM assessment_items WHERE id = ? AND assessment_id = ?').get(req.params.itemId, req.params.id) as any;
    if (!item) return res.status(404).json({ error: 'Assessment item not found' });

    const { status, comments, nc_code, nc_severity, corrective_action, corrective_action_due, corrective_action_status } = req.body;

    db.prepare(`
      UPDATE assessment_items SET
        status = ?, comments = ?, nc_code = ?, nc_severity = ?,
        corrective_action = ?, corrective_action_due = ?, corrective_action_status = ?
      WHERE id = ?
    `).run(
      status ?? item.status,
      comments !== undefined ? comments : item.comments,
      nc_code !== undefined ? nc_code : item.nc_code,
      nc_severity !== undefined ? nc_severity : item.nc_severity,
      corrective_action !== undefined ? corrective_action : item.corrective_action,
      corrective_action_due !== undefined ? corrective_action_due : item.corrective_action_due,
      corrective_action_status !== undefined ? corrective_action_status : item.corrective_action_status,
      req.params.itemId
    );

    const updated = db.prepare('SELECT * FROM assessment_items WHERE id = ?').get(req.params.itemId);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete assessment and cascade items
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    db.prepare('DELETE FROM assessments WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'Assessment deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/items — bulk replace all items for an assessment
router.post('/:id/items', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const items: Array<{
      section: string; item_number: string; description: string;
      status?: string; comments?: string; sort_order?: number;
      legal_ref?: string; risk_level?: string; evidence_required?: number;
    }> = req.body;

    if (!Array.isArray(items)) return res.status(400).json({ error: 'Body must be an array of items' });

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM assessment_items WHERE assessment_id = ?').run(req.params.id);
      const insertItem = db.prepare(`
        INSERT INTO assessment_items (assessment_id, section, item_number, description, status, comments, sort_order, legal_ref, risk_level, evidence_required)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(req.params.id, item.section, item.item_number, item.description, item.status || 'pending', item.comments || null, item.sort_order ?? 0, item.legal_ref || null, item.risk_level || 'medium', item.evidence_required ?? 0);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    const saved = db.prepare('SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC, item_number ASC').all(req.params.id);
    res.json({ data: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/items — get all items for an assessment
router.get('/:id/items', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const items = db.prepare('SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC, item_number ASC').all(req.params.id);
    res.json({ data: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
