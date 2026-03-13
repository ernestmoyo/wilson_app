# Wilson Suite — Project Changelog & Architecture Document

## Overview

Wilson Suite is a NZ hazardous substances compliance certification platform built for Brian Wilson (LCC TST100250). It digitises his real-world workflow — Excel checksheets, folder-based filing taxonomies, and VBA calculators — into a modern web application.

**Stack:** React + Vite + TailwindCSS (frontend) | Express + node:sqlite DatabaseSync (API) | Monorepo under `apps/web` and `apps/api`

**Live:** Deployed on Railway (single service, Dockerfile build)

---

## Database Schema (14 Tables)

| Table | Purpose |
|-------|---------|
| `users` | Certifiers, inspectors |
| `clients` | PCBU entities (legal name, NZBN, site address, industry) |
| `enquiries` | Inbound certification requests with workflow status |
| `assessments` | Location & handler assessments linked to clients |
| `assessment_items` | Individual checklist items with compliance status |
| `certificates` | Location & Certified Handler certificates |
| `evidence` | Uploaded files with SHA-256 hashing and appendix categorisation |
| `inventory` | Hazardous substances register with HSL threshold tracking |
| `site_plans` | JSON-based site plan data |
| `reports` | Compliance reports, gap analyses, refusal notices |
| `audit_log` | Immutable audit trail for all entity changes |
| `storage_areas` | Distinct storage zones within a client site |
| `training_records` | Worker training & competency tracking |
| `handler_assessments` | Certified Handler assessment stages & scoring |

---

## API Routes (13 Endpoints)

| Route | File |
|-------|------|
| `/api/users` | `apps/api/src/routes/users.ts` |
| `/api/clients` | `apps/api/src/routes/clients.ts` |
| `/api/enquiries` | `apps/api/src/routes/enquiries.ts` |
| `/api/assessments` | `apps/api/src/routes/assessments.ts` |
| `/api/certificates` | `apps/api/src/routes/certificates.ts` |
| `/api/inventory` | `apps/api/src/routes/inventory.ts` |
| `/api/evidence` | `apps/api/src/routes/evidence.ts` |
| `/api/site-plans` | `apps/api/src/routes/site-plans.ts` |
| `/api/reports` | `apps/api/src/routes/reports.ts` |
| `/api/audit-log` | `apps/api/src/routes/audit-log.ts` |
| `/api/storage-areas` | `apps/api/src/routes/storage-areas.ts` |
| `/api/training` | `apps/api/src/routes/training.ts` |
| `/api/handler-assessments` | `apps/api/src/routes/handler-assessments.ts` |

---

## Frontend Pages (15 Pages)

| Page | Route | File |
|------|-------|------|
| Dashboard | `/` | `pages/Dashboard.tsx` |
| Enquiries | `/enquiries` | `pages/enquiries/EnquiriesPage.tsx` |
| Clients | `/clients` | `pages/clients/ClientsPage.tsx` |
| Client Detail | `/clients/:id` | `pages/clients/ClientDetail.tsx` |
| Assessments | `/assessment` | `pages/assessment/AssessmentList.tsx` |
| New Assessment | `/assessment/new` | `pages/assessment/NewAssessment.tsx` |
| Assessment Detail | `/assessment/:id` | `pages/assessment/AssessmentDetail.tsx` |
| Certificates | `/certificates` | `pages/certificates/CertificatesPage.tsx` |
| Certificate Detail | `/certificates/:id` | `pages/certificates/CertificateDetail.tsx` |
| Inventory | `/inventory` | `pages/inventory/InventoryPage.tsx` |
| Evidence | `/evidence` | `pages/evidence/EvidencePage.tsx` |
| Training Records | `/training` | `pages/training/TrainingPage.tsx` |
| Site Planner | `/site-planner` | `pages/site-planner/SitePlannerPage.tsx` |
| Reports | `/reports` | `pages/reports/ReportsPage.tsx` |
| Audit Log | `/audit-log` | `pages/audit-log/AuditLogPage.tsx` |

---

## User-Implemented UI Improvements (Ernest's Changes)

These improvements were implemented by the user before the system-level enhancements below:

### 1. Enquiries Page
- Source dropdown with 7 options: Phone, Email, Website, Referral, Repeat Client, Walk-in, Other
- Substance classes multi-select with full NZ HSNO classification codes
- Priority badges with colour coding
- Follow-up date field

### 2. Clients Page
- Industry dropdown with 20 NZ-specific options (Agriculture, Chemical Manufacturing, Construction, Education, Food & Beverage, Forestry, Healthcare, Horticulture, Industrial Manufacturing, Laboratories, Mining, Oil & Gas, Paint & Coatings, Pest Control, Retail, Transport, Veterinary, Waste Management, Water Treatment, Other)

### 3. Client Detail
- Industry edit dropdown matching the 20 options above
- Editable fields for all client details with save/cancel workflow

### 4. Assessments
- Substance classes multi-select matching HSNO codes
- Assessment type selector (pre-inspection, site inspection, validation, certified handler)

### 5. Certificates
- Substance class dropdown with full HSNO codes
- Certificate type field (location vs certified handler)
- Refusal workflow fields (reasons, regulations not met, date, form generation)
- Conditional certificate fields (condition details, deadline)
- WorkSafe notification tracking (due date, sent date, registered status)

### 6. Inventory
- Hazard class expanded to 23 HSNO classifications (2.1.1, 2.1.2, 3.1A-D, 4.1.1, 4.2A, 4.3A, 5.1.1, 5.2, 6.1A-C, 6.3A, 6.4A-B, 6.5A, 8.1A, 8.2A, 8.3A, 9.1A, 9.3C)
- Colour-coded hazard class badges by class family

### 7. HSL Thresholds
- Implemented Hazardous Substance Location (HSL) threshold checking per NZ HSW Regulations 2017, reg 10.26
- Green/amber/red status badges showing compliance, approaching threshold, or threshold exceeded
- Thresholds defined for 7 substance classes with regulatory references

---

## System-Level Enhancements (Phases 1-6)

### Phase 1: Class-Conditional Two-Part Checklists

**Problem:** Brian's Excel has two sheets per location — "Locations General" (always applies) and a class-specific sheet (e.g. "Class 2 and 3.1") that changes based on substances present. The old system used a flat 46-item template.

**Solution:** 71 checklist items split into 6 groups:

| Group | Items | Sections | When Applied |
|-------|-------|----------|-------------|
| General | 30 | A-J (Admin, Training, Signage, Fire, ERP, Containment, Site Plan) | Always |
| Class 2 & 3.1 | 10 | Flammable security, segregation, hazardous areas, building storage | Substances 2.1.x, 3.1x |
| Class 4 | 4 | Flammable solids, spontaneous combustion, water-reactive | Substances 4.x |
| Class 5 | 4 | Oxidisers, organic peroxides | Substances 5.x |
| Class 6 & 8 | 10 | Toxic/corrosive control, PPE, emergency facilities, cabinets | Substances 6.x, 8.x |
| Handler | 13 | Application, education, ID, competence, assessment, records | Certified Handler assessments |

**Key files:**
- `apps/api/src/routes/assessments.ts` — Template definitions, `getClassGroups()` mapper, `buildTemplate()` assembler
- `apps/web/src/pages/assessment/NewAssessment.tsx` — Class-conditional preview showing which sections will generate
- `apps/web/src/pages/assessment/AssessmentDetail.tsx` — Two-part rendering with group headers

**New endpoint:** `GET /api/assessments/class-groups?substance_classes=3.1A,6.1A` — previews what will generate

Each checklist item includes:
- `description` — What to check
- `action` — What the certifier should do
- `records` — What evidence to collect
- `legal_ref` — NZ regulation reference (HSW Regs 2017, Location PS 2021, etc.)
- `risk_level` — low/medium/high/critical
- `evidence_required` — Boolean flag

### Phase 2: Enriched Inventory Schema

**New fields on `inventory` table:**
- `un_number` — UN number (e.g. UN1203)
- `hazard_classifications` — Pipe-delimited multi-class (e.g. "6.3A|6.4A|6.9B")
- `storage_requirements` — Specific storage instructions
- `incompatible_items` — Segregation requirements
- `sds_expiry_date` — SDS expiry with colour warnings (red=expired, amber=<6 months)
- `sku` — Product SKU/code
- `substance_state` — solid/liquid/gas/aerosol
- `max_quantity` — Maximum permitted quantity
- `storage_area_id` — FK to storage_areas table
- `hsno_approval` — HSNO approval number (e.g. HSR001375)

### Phase 3: Appendix-Based Evidence Filing

**Problem:** Brian organises evidence into 11 numbered appendices per location. The old flat evidence list didn't match his mental model.

**Solution:** Evidence now has `appendix_category`, `appendix_number`, and `location_area` fields.

**11 Appendix Categories:**
1. Emergency Response Plan
2. Fire Extinguishers
3. Inventory Register
4. Pictures
5. PPE Register
6. Safety Data Sheets
7. Security
8. Signage
9. Site Plan
10. Training & Supervision
11. WorkSafe Notification

**Frontend:** EvidencePage redesigned with two views:
- **Appendix View** — 11 accordion cards showing file counts, expandable file lists
- **All Evidence** — Flat table view with all filters

**New endpoint:** `GET /api/evidence/by-appendix/:client_id` — returns evidence grouped by appendix category

### Phase 4: Storage Areas

**Problem:** Location 2 Cool 2 has 7 distinct storage areas (Coolroom 1/2/3, G2 Bunker, Corrosive Cabinets, Room004). Each has different substance classes and different checklist requirements.

**New table:** `storage_areas` (id, client_id, area_name, area_type, substance_classes, max_capacity, building_type, notes)

**Area types:** room, cabinet, bunker, outdoor, coolroom, tank_farm, other

**Frontend:** Storage Areas tab added to Client Detail page with full CRUD, linked to inventory items via `storage_area_id`

### Phase 5: Training Records

**Problem:** Brian's training template tracks Name, Course, Department, Date, Competent Y/N plus individual certificates. Training is a frequent audit finding — Abecca's records were flagged as non-compliant.

**New table:** `training_records` (id, client_id, worker_name, department, course_name, training_date, competent, expiry_date, certificate_evidence_id, notes)

**Frontend:** Full TrainingPage with:
- Client selector
- Training records table with expiry warnings
- Summary stats (total workers, competent count, expired/expiring count)
- Add/Edit modal with certificate linking

**New endpoint:** `GET /api/training/summary/:client_id` — returns training statistics

### Phase 6: Certified Handler Workflow

**Problem:** Zhendi Yang's case file shows 6 distinct stages that the old 13-item template couldn't capture: Application, Education, ID, Competence Evidence, Assessment with scoring, Photos.

**New table:** `handler_assessments` with fields for:
- Applicant details (name, address, DOB)
- Employer/PCBU info (NZBN)
- Substance lifecycle phases (JSON array: storage, use, disposal)
- Education & qualifications verification
- ID sighting (type, number, expiry)
- Written assessment scoring (score, total, pass percentage — default 48/60 = 80%)
- Practical assessment pass/fail
- Overall result and assessor statement

**API:** Full CRUD at `/api/handler-assessments` with lookup by `assessment_id`

---

## Schema Migrations

All migrations are safe ALTER TABLE statements that run on startup. New columns have defaults or allow NULL, so they don't break existing data.

```sql
-- v2.0 Migrations (assessment_items)
ALTER TABLE assessment_items ADD COLUMN action TEXT;
ALTER TABLE assessment_items ADD COLUMN records TEXT;
ALTER TABLE assessment_items ADD COLUMN checklist_group TEXT DEFAULT 'general';

-- v2.0 Migrations (inventory)
ALTER TABLE inventory ADD COLUMN un_number TEXT;
ALTER TABLE inventory ADD COLUMN hazard_classifications TEXT;
ALTER TABLE inventory ADD COLUMN storage_requirements TEXT;
ALTER TABLE inventory ADD COLUMN incompatible_items TEXT;
ALTER TABLE inventory ADD COLUMN sds_expiry_date TEXT;
ALTER TABLE inventory ADD COLUMN sku TEXT;
ALTER TABLE inventory ADD COLUMN substance_state TEXT;
ALTER TABLE inventory ADD COLUMN max_quantity REAL;
ALTER TABLE inventory ADD COLUMN storage_area_id INTEGER;

-- v2.0 Migrations (evidence)
ALTER TABLE evidence ADD COLUMN appendix_category TEXT;
ALTER TABLE evidence ADD COLUMN appendix_number INTEGER;
ALTER TABLE evidence ADD COLUMN location_area TEXT;

-- New tables: storage_areas, training_records, handler_assessments
```

---

## Design System

- **Primary colour:** `--nz-navy` (NZ government navy blue)
- **Accent colour:** `--nz-red` (NZ red, used for alerts/errors)
- **Background:** `--nz-bg` (light grey)
- **Cards:** 16px border-radius, subtle shadow, 1px border
- **Typography:** System font stack, 11px uppercase tracking for labels
- **Status badges:** Colour-coded by status (green=compliant, red=non-compliant, amber=pending)
- **Hazard badges:** Colour-coded by class family (orange=flammable, blue=gas, purple=solids, red=toxic)

---

## Deployment

- **Platform:** Railway (single service)
- **Build:** Dockerfile (Node 22 Alpine, builds both web and API)
- **Database:** SQLite file (`wilson.db`) with DatabaseSync API
- **Static assets:** API serves built React app in production
- **Health check:** `GET /api/health` returns `{ status: 'ok' }`

---

## Regulatory References

- HSW (Hazardous Substances) Regulations 2017
- Location Performance Standard 2021
- Information & Process Performance Standard 2019
- Certified Handler Performance Standard 2021
- NZ EPA HSNO classifications
- WorkSafe NZ notification requirements (reg 10.26, 13.34)
