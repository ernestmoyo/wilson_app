import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET /assessment/:assessment_id — get handler assessment by assessment_id
router.get('/assessment/:assessment_id', (req: Request, res: Response) => {
  try {
    const assessment = db.prepare('SELECT * FROM handler_assessments WHERE assessment_id = ?').get(req.params.assessment_id);
    if (!assessment) return res.status(404).json({ error: 'Handler assessment not found' });
    res.json({ data: assessment });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create handler assessment
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      assessment_id, applicant_name, applicant_address, applicant_dob,
      employer_pcbu, employer_nzbn, substance_lifecycle_phases,
      qualifications, education_verified, id_type, id_number, id_expiry, id_sighted,
      knowledge_score, written_score, written_total, written_pass_pct,
      practical_passed, overall_result, assessor_statement
    } = req.body;

    if (!assessment_id) {
      return res.status(400).json({ error: 'assessment_id is required' });
    }

    const result = db.prepare(`
      INSERT INTO handler_assessments (
        assessment_id, applicant_name, applicant_address, applicant_dob,
        employer_pcbu, employer_nzbn, substance_lifecycle_phases,
        qualifications, education_verified, id_type, id_number, id_expiry, id_sighted,
        knowledge_score, written_score, written_total, written_pass_pct,
        practical_passed, overall_result, assessor_statement
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assessment_id,
      applicant_name || null,
      applicant_address || null,
      applicant_dob || null,
      employer_pcbu || null,
      employer_nzbn || null,
      substance_lifecycle_phases || null,
      qualifications || null,
      education_verified ? 1 : 0,
      id_type || null,
      id_number || null,
      id_expiry || null,
      id_sighted ? 1 : 0,
      knowledge_score ?? null,
      written_score ?? null,
      written_total ?? null,
      written_pass_pct ?? null,
      practical_passed ? 1 : 0,
      overall_result || null,
      assessor_statement || null
    );

    const record = db.prepare('SELECT * FROM handler_assessments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: record });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update handler assessment
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM handler_assessments WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Handler assessment not found' });

    const {
      assessment_id, applicant_name, applicant_address, applicant_dob,
      employer_pcbu, employer_nzbn, substance_lifecycle_phases,
      qualifications, education_verified, id_type, id_number, id_expiry, id_sighted,
      knowledge_score, written_score, written_total, written_pass_pct,
      practical_passed, overall_result, assessor_statement
    } = req.body;

    db.prepare(`
      UPDATE handler_assessments SET
        assessment_id = ?, applicant_name = ?, applicant_address = ?, applicant_dob = ?,
        employer_pcbu = ?, employer_nzbn = ?, substance_lifecycle_phases = ?,
        qualifications = ?, education_verified = ?, id_type = ?, id_number = ?, id_expiry = ?, id_sighted = ?,
        knowledge_score = ?, written_score = ?, written_total = ?, written_pass_pct = ?,
        practical_passed = ?, overall_result = ?, assessor_statement = ?
      WHERE id = ?
    `).run(
      assessment_id !== undefined ? assessment_id : existing.assessment_id,
      applicant_name !== undefined ? applicant_name : existing.applicant_name,
      applicant_address !== undefined ? applicant_address : existing.applicant_address,
      applicant_dob !== undefined ? applicant_dob : existing.applicant_dob,
      employer_pcbu !== undefined ? employer_pcbu : existing.employer_pcbu,
      employer_nzbn !== undefined ? employer_nzbn : existing.employer_nzbn,
      substance_lifecycle_phases !== undefined ? substance_lifecycle_phases : existing.substance_lifecycle_phases,
      qualifications !== undefined ? qualifications : existing.qualifications,
      education_verified !== undefined ? (education_verified ? 1 : 0) : existing.education_verified,
      id_type !== undefined ? id_type : existing.id_type,
      id_number !== undefined ? id_number : existing.id_number,
      id_expiry !== undefined ? id_expiry : existing.id_expiry,
      id_sighted !== undefined ? (id_sighted ? 1 : 0) : existing.id_sighted,
      knowledge_score !== undefined ? knowledge_score : existing.knowledge_score,
      written_score !== undefined ? written_score : existing.written_score,
      written_total !== undefined ? written_total : existing.written_total,
      written_pass_pct !== undefined ? written_pass_pct : existing.written_pass_pct,
      practical_passed !== undefined ? (practical_passed ? 1 : 0) : existing.practical_passed,
      overall_result !== undefined ? overall_result : existing.overall_result,
      assessor_statement !== undefined ? assessor_statement : existing.assessor_statement,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM handler_assessments WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete handler assessment
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const record = db.prepare('SELECT * FROM handler_assessments WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Handler assessment not found' });

    db.prepare('DELETE FROM handler_assessments WHERE id = ?').run(req.params.id);
    res.json({ data: { message: 'Handler assessment deleted successfully' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
