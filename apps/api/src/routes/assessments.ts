import { Router, Request, Response } from 'express';
import db from '../db/database';
import { asyncHandler } from '../middleware/asyncHandler';
import { logAudit } from '../lib/auditLog';

const router = Router();

// ─── Class-Conditional NZ HSW Location Inspection Checklist ───
// Based on Brian Wilson's actual Excel checksheets (Abecca Class 2/3 + Location 2 Class 6/8)
// Two-part structure: GENERAL (always) + CLASS-SPECIFIC (conditional on substance classes)

interface TemplateItem {
  section: string; item_number: string; description: string;
  action: string; records: string; legal_ref: string;
  risk_level: string; evidence_required: number; sort_order: number;
  checklist_group: string;
}

// ── Part 1: GENERAL REQUIREMENTS (always included) ──
// Matches Brian's "Locations General" Excel sheet
const GENERAL_CHECKLIST: TemplateItem[] = [
  // Section A — Administrative & Notification
  { section: 'A', item_number: 'A1', description: 'PCBU legal name, NZBN, and contact details verified', action: 'Verify PCBU details against Companies Register', records: 'Application form, Companies Office extract', legal_ref: 'Location PS 2021, Cl.8, Sch.1 Cl.1', risk_level: 'medium', evidence_required: 0, sort_order: 1, checklist_group: 'general' },
  { section: 'A', item_number: 'A2', description: 'Workplace street address confirmed and matches application', action: 'Confirm physical address on site', records: 'Application form, site visit confirmation', legal_ref: 'Location PS 2021, Cl.8, Sch.1 Cl.2', risk_level: 'medium', evidence_required: 0, sort_order: 2, checklist_group: 'general' },
  { section: 'A', item_number: 'A3', description: 'Certificate scope — substance classes and locations to be certified', action: 'Define scope against inventory and site plan', records: 'Scope declaration, inventory summary', legal_ref: 'Location PS 2021, Cl.8, Sch.1 Cl.2', risk_level: 'medium', evidence_required: 0, sort_order: 3, checklist_group: 'general' },
  { section: 'A', item_number: 'A4', description: 'Determine which regulations apply based on substances present', action: 'Map inventory to Reg 10.34 requirements', records: 'Regulation applicability matrix', legal_ref: 'HSW Regs 2017, reg 10.34', risk_level: 'high', evidence_required: 0, sort_order: 4, checklist_group: 'general' },
  { section: 'A', item_number: 'A5', description: 'Hazardous substances inventory obtained and verified', action: 'Obtain full inventory: name, HSNO approval, class/subclass, max quantity', records: 'Inventory register (Appendix 3)', legal_ref: 'Location PS 2021, Sch.1 Cl.1, Tables 1.1-1.2', risk_level: 'high', evidence_required: 1, sort_order: 5, checklist_group: 'general' },
  { section: 'A', item_number: 'A6', description: 'Notification to WorkSafe completed (Sch.9 thresholds not exceeded)', action: 'Check WorkSafe notification receipt and quantities against Sch.9', records: 'WorkSafe notification email/receipt (Appendix 11)', legal_ref: 'HSW Regs 2017, reg 10.26(2), 13.34(4); Location PS 2021, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 6, checklist_group: 'general' },

  // Section B — Information, Instruction & Training
  { section: 'B', item_number: 'B1', description: 'Training records maintained with names, dates, signatures', action: 'Review training register for all workers handling HS', records: 'Training register (Appendix 10), individual certificates', legal_ref: 'HSW Regs 2017, reg 4.5, 10.34(1)(c); Info & Process PS 2019, Cl.19', risk_level: 'high', evidence_required: 1, sort_order: 7, checklist_group: 'general' },
  { section: 'B', item_number: 'B2', description: 'Workers have received information, training and instruction on HS', action: 'Interview workers on HS awareness and procedures', records: 'Training records, competency assessments', legal_ref: 'HSW Regs 2017, reg 4.5(3)', risk_level: 'high', evidence_required: 1, sort_order: 8, checklist_group: 'general' },
  { section: 'B', item_number: 'B3', description: 'Supervision arrangements are adequate', action: 'Verify supervision plans and responsible persons', records: 'Supervision plan, org chart', legal_ref: 'HSW Regs 2017, reg 4.6; Info & Process PS 2019, Cl.19', risk_level: 'high', evidence_required: 0, sort_order: 9, checklist_group: 'general' },

  // Section C — Signage
  { section: 'C', item_number: 'C1', description: 'Signage at all entry points — HAZCHEM format, legible at 10m', action: 'Inspect signage at all entry/exit points', records: 'Photos of signage (Appendix 8)', legal_ref: 'HSW Regs 2017, reg 2.5-2.6, 10.34(1)(f); Location PS 2021, Sch.1 Cl.5', risk_level: 'high', evidence_required: 1, sort_order: 10, checklist_group: 'general' },
  { section: 'C', item_number: 'C2', description: 'Signage includes correct hazard classifications and emergency contacts', action: 'Verify sign content against inventory classes', records: 'Photos, sign specification sheet', legal_ref: 'HSW Regs 2017, reg 2.5; Location PS 2021, Sch.1 Table 1.5', risk_level: 'high', evidence_required: 1, sort_order: 11, checklist_group: 'general' },

  // Section D — Fire Extinguishers
  { section: 'D', item_number: 'D1', description: 'Fire extinguishers present in number and type per Schedule 4', action: 'Count extinguishers and verify type against Sch.4 requirements', records: 'Photos (Appendix 2), extinguisher inventory', legal_ref: 'HSW Regs 2017, reg 5.3-5.5, 10.34(1)(g); Location PS 2021, Sch.1 Cl.7', risk_level: 'critical', evidence_required: 1, sort_order: 12, checklist_group: 'general' },
  { section: 'D', item_number: 'D2', description: 'Fire extinguishers serviced within required intervals', action: 'Check service tags and dates', records: 'Service tag photos, maintenance records', legal_ref: 'HSW Regs 2017, reg 5.5(2)', risk_level: 'high', evidence_required: 1, sort_order: 13, checklist_group: 'general' },

  // Section E — Emergency Response Plan
  { section: 'E', item_number: 'E1', description: 'Emergency Response Plan (ERP) prepared, covering foreseeable emergencies', action: 'Review ERP document for completeness', records: 'ERP document (Appendix 1)', legal_ref: 'HSW Regs 2017, reg 5.7, 10.34(1)(g); Location PS 2021, Sch.1 Cl.7', risk_level: 'critical', evidence_required: 1, sort_order: 14, checklist_group: 'general' },
  { section: 'E', item_number: 'E2', description: 'ERP identifies persons with responsibility for emergency response', action: 'Check named responsible persons in ERP', records: 'ERP section on roles and responsibilities', legal_ref: 'HSW Regs 2017, reg 5.7(3)(b)', risk_level: 'high', evidence_required: 0, sort_order: 15, checklist_group: 'general' },
  { section: 'E', item_number: 'E3', description: 'ERP reviewed by Fire and Emergency NZ', action: 'Verify FENZ review letter or acknowledgment', records: 'FENZ correspondence', legal_ref: 'HSW Regs 2017, reg 5.11', risk_level: 'high', evidence_required: 1, sort_order: 16, checklist_group: 'general' },
  { section: 'E', item_number: 'E4', description: 'ERP has been tested; test records and dates available', action: 'Review drill/exercise records and dates', records: 'Test/drill records, evacuation logs', legal_ref: 'HSW Regs 2017, reg 5.12', risk_level: 'high', evidence_required: 1, sort_order: 17, checklist_group: 'general' },
  { section: 'E', item_number: 'E5', description: 'Spill containment and cleanup equipment available and appropriate', action: 'Inspect spill kits and decontamination equipment', records: 'Photos, spill kit inventory', legal_ref: 'HSW Regs 2017, reg 5.8', risk_level: 'high', evidence_required: 1, sort_order: 18, checklist_group: 'general' },

  // Section F — Secondary Containment
  { section: 'F', item_number: 'F1', description: 'Secondary containment system in place where required', action: 'Inspect bunds, drip trays, containment systems', records: 'Photos, capacity calculations', legal_ref: 'HSW Regs 2017, reg 10.30, 10.34(1)(h); Location PS 2021, Sch.2', risk_level: 'critical', evidence_required: 1, sort_order: 19, checklist_group: 'general' },
  { section: 'F', item_number: 'F2', description: 'Secondary containment capacity verified (prescribed vs actual)', action: 'Calculate required capacity and measure actual', records: 'Calculation sheet or engineer certification', legal_ref: 'HSW Regs 2017, reg 10.30(2)', risk_level: 'critical', evidence_required: 1, sort_order: 20, checklist_group: 'general' },
  { section: 'F', item_number: 'F3', description: 'Containment impervious to substance and fire-resistant', action: 'Verify material compatibility with stored substances', records: 'Material specifications, engineer cert', legal_ref: 'HSW Regs 2017, reg 17.102', risk_level: 'critical', evidence_required: 1, sort_order: 21, checklist_group: 'general' },

  // Section G — Site Plan
  { section: 'G', item_number: 'G1', description: 'Site plan available showing all HSLs and hazardous areas', action: 'Review site plan for completeness', records: 'Site plan document (Appendix 9)', legal_ref: 'HSW Regs 2017, reg 10.26(4)(b), 13.34(5)(b); Location PS 2021, Sch.1 Cl.6', risk_level: 'high', evidence_required: 1, sort_order: 22, checklist_group: 'general' },
  { section: 'G', item_number: 'G2', description: 'Site plan shows boundaries, hazardous area delineation, separation distances', action: 'Verify hazardous areas and distances marked on plan', records: 'Annotated site plan, separation distance calcs', legal_ref: 'Location PS 2021, Sch.1 Cl.6, Table 1.8', risk_level: 'high', evidence_required: 1, sort_order: 23, checklist_group: 'general' },

  // Section H — Documentation & SDS
  { section: 'H', item_number: 'H1', description: 'Current SDS obtained for each substance (within 5 years)', action: 'Check SDS dates against 5-year validity', records: 'SDS documents (Appendix 6)', legal_ref: 'HSW Regs 2017, reg 2.11(1); Location PS 2021, Sch.1 Table 1.7', risk_level: 'high', evidence_required: 1, sort_order: 24, checklist_group: 'general' },
  { section: 'H', item_number: 'H2', description: 'SDS readily accessible to workers and emergency services', action: 'Verify SDS location and accessibility on site', records: 'Photos of SDS station', legal_ref: 'HSW Regs 2017, reg 2.11(3)', risk_level: 'high', evidence_required: 0, sort_order: 25, checklist_group: 'general' },
  { section: 'H', item_number: 'H3', description: 'Register of hazardous substances maintained and current', action: 'Compare register against physical inventory', records: 'HS register, inventory count', legal_ref: 'HSW Regs 2017, reg 10.26(4)(a)', risk_level: 'medium', evidence_required: 0, sort_order: 26, checklist_group: 'general' },

  // Section I — Quantity Verification & Storage
  { section: 'I', item_number: 'I1', description: 'Maximum quantities on-site verified via physical inspection', action: 'Physical count of all HS containers against inventory', records: 'Inventory verification sheet, photos', legal_ref: 'Location PS 2021, Sch.1 Cl.1, Table 1.1', risk_level: 'high', evidence_required: 1, sort_order: 27, checklist_group: 'general' },
  { section: 'I', item_number: 'I2', description: 'Containers in good condition and correctly labelled', action: 'Inspect container integrity, labelling, and closures', records: 'Photos of containers and labels', legal_ref: 'HSW Regs 2017, reg 2.3, 2.4', risk_level: 'high', evidence_required: 1, sort_order: 28, checklist_group: 'general' },

  // Section J — Defective Equipment
  { section: 'J', item_number: 'J1', description: 'All equipment for HS inspected and confirmed serviceable', action: 'Inspect all HS-related equipment for condition', records: 'Equipment inspection records', legal_ref: 'Location PS 2021, Cl.21(5), 22', risk_level: 'high', evidence_required: 1, sort_order: 29, checklist_group: 'general' },
  { section: 'J', item_number: 'J2', description: 'Defective equipment isolated, tagged "Do Not Use", LOTO applied', action: 'Check for any tagged-out or isolated equipment', records: 'Photos of tags, LOTO records', legal_ref: 'Location PS 2021, Cl.22', risk_level: 'critical', evidence_required: 1, sort_order: 30, checklist_group: 'general' },
];

// ── Part 2: CLASS-SPECIFIC CHECKLISTS ──
// Only included when matching substance classes are selected

const CLASS_2_3_CHECKLIST: TemplateItem[] = [
  // From Brian's "Class 2 and 3.1 substances" Excel sheet
  { section: 'K', item_number: 'K1', description: 'Class 2/3.1 substances appropriately secured (24/7 CCTV, locked container/site)', action: 'Verify security measures: locks, CCTV, access control', records: 'Photos (Appendix 7), security system details', legal_ref: 'HSW Regs 2017, reg 10.4; Location PS 2021, Sch.2', risk_level: 'high', evidence_required: 1, sort_order: 31, checklist_group: 'class_2_3' },
  { section: 'K', item_number: 'K2', description: 'Segregation from incompatible substances verified (Schedule 15)', action: 'Check segregation distances and barriers between incompatibles', records: 'Segregation assessment, site layout', legal_ref: 'HSW Regs 2017, reg 10.5; Location PS 2021, Sch.2', risk_level: 'critical', evidence_required: 1, sort_order: 32, checklist_group: 'class_2_3' },
  { section: 'K', item_number: 'K3', description: 'Hazardous area established and delineated for flammable liquids', action: 'Verify hazardous area extent is documented and marked', records: 'Hazardous area assessment, electrical dossier', legal_ref: 'HSW Regs 2017, reg 10.6-10.7; Location PS 2021, Sch.2', risk_level: 'critical', evidence_required: 1, sort_order: 33, checklist_group: 'class_2_3' },
  { section: 'K', item_number: 'K4', description: 'Electrical installations in hazardous areas comply with AS/NZS 60079', action: 'Review electrical dossier and certifications', records: 'Electrical dossier, CoC', legal_ref: 'HSW Regs 2017, reg 10.7; Location PS 2021, Sch.2, Cl.10.4', risk_level: 'critical', evidence_required: 1, sort_order: 34, checklist_group: 'class_2_3' },
  { section: 'K', item_number: 'K5', description: 'Storage building type determined and compliant (Type A/B/C/D)', action: 'Assess building construction against storage type requirements', records: 'Building assessment, construction details', legal_ref: 'Location PS 2021, Sch.2, Tables', risk_level: 'high', evidence_required: 1, sort_order: 35, checklist_group: 'class_2_3' },
  { section: 'K', item_number: 'K6', description: 'Separation distances from protected places measured and compliant', action: 'Measure distances from store to boundaries, buildings, drains', records: 'Separation distance calculations (Appendix 9)', legal_ref: 'HSW Regs 2017, reg 10.22; Location PS 2021, Sch.2, Tables', risk_level: 'critical', evidence_required: 1, sort_order: 36, checklist_group: 'class_2_3' },
  { section: 'K', item_number: 'K7', description: 'Ventilation meeting required air changes for storage area', action: 'Assess ventilation (natural or mechanical) in store', records: 'Ventilation assessment', legal_ref: 'Location PS 2021, Sch.2, Cl.10.22', risk_level: 'critical', evidence_required: 1, sort_order: 37, checklist_group: 'class_2_3' },
  { section: 'K', item_number: 'K8', description: 'Ignition sources excluded from hazardous areas', action: 'Verify no ignition sources within hazardous area extent', records: 'Inspection notes, photos', legal_ref: 'HSW Regs 2017, reg 10.7; Location PS 2021, Sch.2', risk_level: 'critical', evidence_required: 1, sort_order: 38, checklist_group: 'class_2_3' },
  { section: 'K', item_number: 'K9', description: 'Package containment — containers correctly sized and closed', action: 'Inspect container types, sizes, and closure mechanisms', records: 'Container inventory, photos', legal_ref: 'Location PS 2021, Sch.2', risk_level: 'high', evidence_required: 1, sort_order: 39, checklist_group: 'class_2_3' },
  { section: 'K', item_number: 'K10', description: 'Door self-closing mechanism fitted and functional (Type B)', action: 'Test door mechanism, verify kept closed except during loading', records: 'Photos of door mechanism', legal_ref: 'Location PS 2021, Sch.2', risk_level: 'high', evidence_required: 1, sort_order: 40, checklist_group: 'class_2_3' },
];

const CLASS_4_CHECKLIST: TemplateItem[] = [
  { section: 'L', item_number: 'L1', description: 'Class 4 — Temperature control plan in place with monitoring logs', action: 'Review temperature monitoring system and records', records: 'Temperature logs, control plan', legal_ref: 'Location PS 2021, Sch.3', risk_level: 'critical', evidence_required: 1, sort_order: 41, checklist_group: 'class_4' },
  { section: 'L', item_number: 'L2', description: 'Class 4 — Temperature alarm and emergency cooling procedures verified', action: 'Test alarm systems and review cooling procedures', records: 'Alarm test records, cooling SOP', legal_ref: 'Location PS 2021, Sch.3', risk_level: 'critical', evidence_required: 1, sort_order: 42, checklist_group: 'class_4' },
  { section: 'L', item_number: 'L3', description: 'Class 4 — Segregation from water sources and incompatible materials', action: 'Verify segregation from water and incompatibles', records: 'Segregation assessment', legal_ref: 'Location PS 2021, Sch.3; HSW Regs 2017, reg 10.5', risk_level: 'critical', evidence_required: 1, sort_order: 43, checklist_group: 'class_4' },
  { section: 'L', item_number: 'L4', description: 'Class 4 — Separation distances from protected places compliant', action: 'Measure and verify distances', records: 'Separation distance calculations', legal_ref: 'Location PS 2021, Sch.3, Tables', risk_level: 'critical', evidence_required: 1, sort_order: 44, checklist_group: 'class_4' },
];

const CLASS_5_CHECKLIST: TemplateItem[] = [
  { section: 'M', item_number: 'M1', description: 'Class 5.1/5.2 — Security measures and ignition controls verified', action: 'Verify security access and ignition source exclusion', records: 'Security assessment, photos', legal_ref: 'Location PS 2021, Sch.4, Cl.12.3', risk_level: 'critical', evidence_required: 1, sort_order: 45, checklist_group: 'class_5' },
  { section: 'M', item_number: 'M2', description: 'Class 5.1/5.2 — Segregation from combustible materials and other incompatibles', action: 'Check segregation from fuels, organics, and reducing agents', records: 'Segregation assessment', legal_ref: 'Location PS 2021, Sch.4; HSW Regs 2017, reg 10.5', risk_level: 'critical', evidence_required: 1, sort_order: 46, checklist_group: 'class_5' },
  { section: 'M', item_number: 'M3', description: 'Class 5.1/5.2 — Package closing procedures and PPE checks completed', action: 'Inspect container closures and available PPE', records: 'PPE register, container inspection', legal_ref: 'Location PS 2021, Sch.4', risk_level: 'high', evidence_required: 1, sort_order: 47, checklist_group: 'class_5' },
  { section: 'M', item_number: 'M4', description: 'Class 5.1/5.2 — Separation distances from protected places compliant', action: 'Measure and verify distances', records: 'Separation distance calculations', legal_ref: 'Location PS 2021, Sch.4, Tables', risk_level: 'critical', evidence_required: 1, sort_order: 48, checklist_group: 'class_5' },
];

const CLASS_6_8_CHECKLIST: TemplateItem[] = [
  // From Brian's "Class 6 and 8 location checksheets" and Location 2 Cool 2 documents
  { section: 'N', item_number: 'N1', description: 'Certified handler control — handler requirements verified (Reg 13.9)', action: 'Check certified handler certificates and coverage', records: 'Handler certificates, register', legal_ref: 'HSW Regs 2017, reg 13.9; Location PS 2021, Sch.5-6', risk_level: 'critical', evidence_required: 1, sort_order: 49, checklist_group: 'class_6_8' },
  { section: 'N', item_number: 'N2', description: 'Separation distances from protected and public places verified', action: 'Measure distances (Class 6.1A/B requires 5m)', records: 'Separation distance calculations', legal_ref: 'Location PS 2021, Sch.5-6, Tables', risk_level: 'critical', evidence_required: 1, sort_order: 50, checklist_group: 'class_6_8' },
  { section: 'N', item_number: 'N3', description: 'Segregation from incompatible substances (Schedule 15 compliance)', action: 'Review segregation against Schedule 15 tables', records: 'Segregation assessment, store layout', legal_ref: 'HSW Regs 2017, reg 10.5; Location PS 2021, Sch.5-6', risk_level: 'critical', evidence_required: 1, sort_order: 51, checklist_group: 'class_6_8' },
  { section: 'N', item_number: 'N4', description: 'Indoor storage cabinets comply with AS 3780 (corrosive) or AS/NZS 4452 (toxic)', action: 'Inspect cabinet design, capacity, and ventilation', records: 'Cabinet specifications, photos', legal_ref: 'HSW Regs 2017, reg 13.36-13.37; Location PS 2021, Sch.5-6', risk_level: 'high', evidence_required: 1, sort_order: 52, checklist_group: 'class_6_8' },
  { section: 'N', item_number: 'N5', description: 'Secondary containment — spill decks or bunds for liquid Class 6/8', action: 'Inspect containment: spill decks, bunds, drip trays', records: 'Photos, capacity calculations', legal_ref: 'HSW Regs 2017, reg 10.30; Location PS 2021, Sch.5-6', risk_level: 'critical', evidence_required: 1, sort_order: 53, checklist_group: 'class_6_8' },
  { section: 'N', item_number: 'N6', description: 'Fixed structures and equipment — material compatibility verified', action: 'Check materials of construction against substance compatibility', records: 'Material specs, compatibility assessment', legal_ref: 'HSW Regs 2017, reg 13.39(g); Location PS 2021, Sch.5-6', risk_level: 'high', evidence_required: 1, sort_order: 54, checklist_group: 'class_6_8' },
  { section: 'N', item_number: 'N7', description: 'PPE and specialised equipment verified and in good condition', action: 'Inspect PPE: gloves, goggles, face shields, respiratory protection', records: 'PPE register (Appendix 5), inspection records', legal_ref: 'Location PS 2021, Sch.5-6, Cl.13.7, 13.40', risk_level: 'critical', evidence_required: 1, sort_order: 55, checklist_group: 'class_6_8' },
  { section: 'N', item_number: 'N8', description: 'Emergency facilities — shower/eyewash within 30m, spill kits', action: 'Verify emergency shower/eyewash proximity and function', records: 'Photos, distance measurement', legal_ref: 'Location PS 2021, Sch.5-6', risk_level: 'critical', evidence_required: 1, sort_order: 56, checklist_group: 'class_6_8' },
  { section: 'N', item_number: 'N9', description: 'Ventilation adequate for toxic/corrosive substance storage', action: 'Assess ventilation in storage areas', records: 'Ventilation assessment', legal_ref: 'Location PS 2021, Sch.5-6', risk_level: 'high', evidence_required: 1, sort_order: 57, checklist_group: 'class_6_8' },
  { section: 'N', item_number: 'N10', description: 'Access control — controlled access for authorised handlers only', action: 'Verify access card/tag system and handler register', records: 'Access system details, handler list', legal_ref: 'HSW Regs 2017, reg 13.10; Location PS 2021, Sch.5-6', risk_level: 'high', evidence_required: 1, sort_order: 58, checklist_group: 'class_6_8' },
];

// ─── Certified Handler Assessment Checklist ───
const CERTIFIED_HANDLER_TEMPLATE: TemplateItem[] = [
  { section: 'CH-A', item_number: 'CH-A1', description: 'Applicant full legal name, contact address, and date of birth recorded', action: 'Verify personal details against ID document', records: 'Application form, ID copy', legal_ref: 'Handler PS 2019, Cl.8; Handler PS 2021, Cl.8', risk_level: 'high', evidence_required: 1, sort_order: 1, checklist_group: 'handler' },
  { section: 'CH-A', item_number: 'CH-A2', description: 'Identity document sighted — original or certified copy', action: 'Sight original passport, birth cert, or NZ drivers licence', records: 'ID copy (Appendix: 02 Identification)', legal_ref: 'Handler PS 2019, Cl.10; Handler PS 2021, Cl.10', risk_level: 'critical', evidence_required: 1, sort_order: 2, checklist_group: 'handler' },
  { section: 'CH-A', item_number: 'CH-A3', description: 'Identity document type, number, and expiry date recorded', action: 'Record ID details in assessment form', records: 'Assessment record', legal_ref: 'Handler PS 2019, Cl.10', risk_level: 'high', evidence_required: 1, sort_order: 3, checklist_group: 'handler' },
  { section: 'CH-B', item_number: 'CH-B1', description: 'Knowledge: hazard classification and properties of relevant substances', action: 'Assess via written test (Assessment 01 — 20%)', records: 'Written assessment paper', legal_ref: 'HSW Regs 2017, reg 4.3; Handler PS 2019, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 4, checklist_group: 'handler' },
  { section: 'CH-B', item_number: 'CH-B2', description: 'Knowledge: safe handling, storage, transport, and disposal', action: 'Assess via written test (Assessment 02 — 80%, 60 marks, 80% pass)', records: 'Written assessment paper, score sheet', legal_ref: 'HSW Regs 2017, reg 4.3(a)-(c); Handler PS 2019, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 5, checklist_group: 'handler' },
  { section: 'CH-B', item_number: 'CH-B3', description: 'Knowledge: emergency response and first aid for relevant substances', action: 'Assess emergency procedures in written and practical test', records: 'Assessment papers', legal_ref: 'HSW Regs 2017, reg 4.3(d); Handler PS 2019, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 6, checklist_group: 'handler' },
  { section: 'CH-B', item_number: 'CH-B4', description: 'Knowledge: PPE selection, use, maintenance and limitations', action: 'Assess PPE competency in practical assessment', records: 'Practical assessment checksheet', legal_ref: 'HSW Regs 2017, reg 4.3(e); Handler PS 2019, Cl.11', risk_level: 'high', evidence_required: 1, sort_order: 7, checklist_group: 'handler' },
  { section: 'CH-B', item_number: 'CH-B5', description: 'Practical: demonstrated competent handling of relevant substance class', action: 'Observe applicant handling substances under controlled conditions', records: 'Practical assessment checksheet (04 Assessment)', legal_ref: 'Handler PS 2019, Cl.11; Handler PS 2021, Cl.11', risk_level: 'critical', evidence_required: 1, sort_order: 8, checklist_group: 'handler' },
  { section: 'CH-B', item_number: 'CH-B6', description: 'Qualifications and training certificates verified', action: 'Sight and copy Unit 31291/31290 or equivalent certificates', records: 'Certificate copies (01 Education)', legal_ref: 'Info & Process PS 2019, Cl.19; Handler PS 2019, Cl.11', risk_level: 'high', evidence_required: 1, sort_order: 9, checklist_group: 'handler' },
  { section: 'CH-C', item_number: 'CH-C1', description: 'All competency elements confirmed — structured decision record', action: 'Complete assessor decision record with rationale', records: 'Decision record form', legal_ref: 'Handler PS 2019, Cl.12; Handler PS 2021, Cl.12', risk_level: 'critical', evidence_required: 0, sort_order: 10, checklist_group: 'handler' },
  { section: 'CH-C', item_number: 'CH-C2', description: 'Assessor statement and rationale documented, signed, dated', action: 'Sign and date final assessment statement', records: 'Signed assessment document', legal_ref: 'Handler PS 2019, Cl.12; Info & Process PS 2019, Cl.21', risk_level: 'critical', evidence_required: 0, sort_order: 11, checklist_group: 'handler' },
  { section: 'CH-D', item_number: 'CH-D1', description: 'Certificate includes Reg 4.1/6.23 statement, unique number, handler details', action: 'Verify certificate content against mandatory fields', records: 'Draft certificate', legal_ref: 'Handler PS 2019, Cl.14; HSW Regs 2017, reg 4.1, 6.23', risk_level: 'critical', evidence_required: 0, sort_order: 12, checklist_group: 'handler' },
  { section: 'CH-D', item_number: 'CH-D2', description: 'Expiry date set at exactly 5 calendar years from issue date', action: 'Calculate and set expiry = issue date + 5 years', records: 'Certificate', legal_ref: 'Handler PS 2019, Cl.16; HSW Regs 2017, reg 6.23(2)', risk_level: 'critical', evidence_required: 0, sort_order: 13, checklist_group: 'handler' },
];

// ─── Class-to-group mapping ───
function getClassGroups(substanceClasses: string): string[] {
  if (!substanceClasses) return [];
  const classes = substanceClasses.split(',').map(s => s.trim()).filter(Boolean);
  const groups = new Set<string>();
  for (const cls of classes) {
    if (cls.startsWith('2.') || cls.startsWith('3.1')) groups.add('class_2_3');
    if (cls.startsWith('4.')) groups.add('class_4');
    if (cls.startsWith('5.')) groups.add('class_5');
    if (cls.startsWith('6.') || cls.startsWith('8.')) groups.add('class_6_8');
  }
  return Array.from(groups);
}

const CLASS_CHECKLISTS: Record<string, TemplateItem[]> = {
  class_2_3: CLASS_2_3_CHECKLIST,
  class_4: CLASS_4_CHECKLIST,
  class_5: CLASS_5_CHECKLIST,
  class_6_8: CLASS_6_8_CHECKLIST,
};

const CLASS_GROUP_LABELS: Record<string, string> = {
  general: 'General Requirements',
  class_2_3: 'Class 2 & 3.1 — Flammable Gases & Liquids',
  class_4: 'Class 4 — Flammable Solids',
  class_5: 'Class 5.1/5.2 — Oxidisers & Organic Peroxides',
  class_6_8: 'Class 6 & 8 — Toxic & Corrosive Substances',
  handler: 'Certified Handler Assessment',
};

function buildTemplate(type: string, substanceClasses?: string): TemplateItem[] {
  if (type === 'certified_handler') return CERTIFIED_HANDLER_TEMPLATE;
  if (type !== 'site_inspection') return [];

  const template = [...GENERAL_CHECKLIST];
  const groups = getClassGroups(substanceClasses || '');
  let sortOffset = GENERAL_CHECKLIST.length;

  for (const group of groups) {
    const classItems = CLASS_CHECKLISTS[group];
    if (classItems) {
      for (const item of classItems) {
        template.push({ ...item, sort_order: sortOffset + item.sort_order });
      }
      sortOffset += classItems.length;
    }
  }

  return template;
}

// GET / — list assessments with optional filters
router.get('/', asyncHandler((req: Request, res: Response) => {
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
}));

// GET /templates/:type — return the checklist template (with optional substance_classes query)
router.get('/templates/:type', asyncHandler((req: Request, res: Response) => {
  const template = buildTemplate(req.params.type, req.query.substance_classes as string);
  if (template.length === 0 && req.params.type !== 'pre_inspection' && req.params.type !== 'validation') {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json({ data: template, class_group_labels: CLASS_GROUP_LABELS });
}));

// GET /class-groups — return available class groups for given substance classes
router.get('/class-groups', asyncHandler((req: Request, res: Response) => {
  const groups = getClassGroups(req.query.substance_classes as string || '');
  const result = groups.map(g => ({ key: g, label: CLASS_GROUP_LABELS[g] || g, item_count: (CLASS_CHECKLISTS[g] || []).length }));
  res.json({
    data: {
      general: { label: CLASS_GROUP_LABELS.general, item_count: GENERAL_CHECKLIST.length },
      class_specific: result,
      total_items: GENERAL_CHECKLIST.length + result.reduce((sum, g) => sum + g.item_count, 0),
    }
  });
}));

// GET /:id — get assessment with all its items
router.get('/:id', asyncHandler((req: Request, res: Response) => {
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

  res.json({ data: { ...assessment as object, items }, class_group_labels: CLASS_GROUP_LABELS });
}));

// POST / — create assessment (auto-populates class-conditional checklist)
router.post('/', asyncHandler((req: Request, res: Response) => {
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

  // Wrap assessment + items in a single transaction
  db.exec('BEGIN');
  try {
    const result = db.prepare(`
      INSERT INTO assessments (client_id, inspector_id, type, inspection_date, substance_classes, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(client_id, resolvedInspectorId, type, inspection_date || null, substance_classes || null, notes || null);

    const assessmentId = result.lastInsertRowid;

    // Build class-conditional template
    const template = buildTemplate(type, substance_classes);
    if (template.length > 0) {
      const insertItem = db.prepare(`
        INSERT INTO assessment_items (assessment_id, section, item_number, description, status, legal_ref, sort_order, risk_level, evidence_required, action, records, checklist_group)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of template) {
        insertItem.run(assessmentId, item.section, item.item_number, item.description, 'pending', item.legal_ref, item.sort_order, item.risk_level, item.evidence_required, item.action, item.records, item.checklist_group);
      }
    }

    db.exec('COMMIT');

    logAudit('assessment', assessmentId as number, 'created', { client_id, type, substance_classes });

    const assessment = db.prepare(`
      SELECT a.*, c.legal_name AS client_name, u.name AS inspector_name
      FROM assessments a LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN users u ON u.id = a.inspector_id
      WHERE a.id = ?
    `).get(assessmentId);

    const items = db.prepare('SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC').all(assessmentId);

    res.status(201).json({ data: { ...assessment as object, items }, class_group_labels: CLASS_GROUP_LABELS });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}));

// PUT /:id — update assessment fields
router.put('/:id', asyncHandler((req: Request, res: Response) => {
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
}));

// PUT /:id/items/:itemId — update a single checklist item (status, NC, corrective action)
router.put('/:id/items/:itemId', asyncHandler((req: Request, res: Response) => {
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
}));

// DELETE /:id — delete assessment and cascade items
router.delete('/:id', asyncHandler((req: Request, res: Response) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  db.prepare('DELETE FROM assessments WHERE id = ?').run(req.params.id);
  res.json({ data: { message: 'Assessment deleted successfully' } });
}));

// POST /:id/items — bulk save items for an assessment
router.post('/:id/items', asyncHandler((req: Request, res: Response) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const { items } = req.body;
  const itemsArray = Array.isArray(items) ? items : req.body;
  if (!Array.isArray(itemsArray)) return res.status(400).json({ error: 'Body must be an array of items or { items: [...] }' });

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM assessment_items WHERE assessment_id = ?').run(req.params.id);
    const insertItem = db.prepare(`
      INSERT INTO assessment_items (assessment_id, section, item_number, description, status, comments, sort_order, legal_ref, risk_level, evidence_required, action, records, checklist_group, nc_code, nc_severity, corrective_action, corrective_action_due, corrective_action_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of itemsArray) {
      insertItem.run(
        req.params.id, item.section, item.item_number, item.description,
        item.status || 'pending', item.comments || null, item.sort_order ?? 0,
        item.legal_ref || null, item.risk_level || 'medium', item.evidence_required ?? 0,
        item.action || null, item.records || null, item.checklist_group || 'general',
        item.nc_code || null, item.nc_severity || null, item.corrective_action || null,
        item.corrective_action_due || null, item.corrective_action_status || 'open'
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const saved = db.prepare('SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC, item_number ASC').all(req.params.id);
  res.json({ data: saved });
}));

// GET /:id/items — get all items for an assessment
router.get('/:id/items', asyncHandler((req: Request, res: Response) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const items = db.prepare('SELECT * FROM assessment_items WHERE assessment_id = ? ORDER BY sort_order ASC, item_number ASC').all(req.params.id);
  res.json({ data: items });
}));

export default router;
