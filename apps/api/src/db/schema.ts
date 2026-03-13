import db from './database';

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'certifier',
      certifier_number TEXT,
      phone TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legal_name TEXT NOT NULL,
      trading_name TEXT,
      site_address TEXT NOT NULL,
      postal_address TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      nzbn TEXT,
      industry TEXT,
      manager_name TEXT,
      manager_phone TEXT,
      manager_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      contact_name TEXT NOT NULL,
      contact_email TEXT,
      contact_phone TEXT,
      company_name TEXT,
      site_address TEXT,
      enquiry_type TEXT NOT NULL DEFAULT 'new_certification'
        CHECK(enquiry_type IN ('new_certification','renewal','variation','handler_certification','general_enquiry')),
      status TEXT NOT NULL DEFAULT 'received'
        CHECK(status IN ('received','reviewing','quoted','accepted','declined','converted')),
      substance_classes TEXT,
      estimated_quantities TEXT,
      description TEXT,
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
      source TEXT,
      assigned_to INTEGER REFERENCES users(id),
      quoted_amount REAL,
      quote_date TEXT,
      converted_assessment_id INTEGER REFERENCES assessments(id),
      follow_up_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      inspector_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('pre_inspection', 'site_inspection', 'validation', 'certified_handler')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'in_progress', 'completed', 'compliant', 'non_compliant')),
      inspection_date TEXT,
      substance_classes TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      section TEXT NOT NULL,
      item_number TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT CHECK(status IN ('compliant', 'non_compliant', 'inapplicable', 'pending', 'conditional')),
      comments TEXT,
      legal_ref TEXT,
      sort_order INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'medium' CHECK(risk_level IN ('low', 'medium', 'high', 'critical')),
      evidence_required INTEGER DEFAULT 0,
      nc_code TEXT,
      nc_severity TEXT CHECK(nc_severity IN ('critical', 'major', 'minor')),
      corrective_action TEXT,
      corrective_action_due TEXT,
      corrective_action_status TEXT DEFAULT 'open' CHECK(corrective_action_status IN ('open', 'in_progress', 'resolved', 'verified'))
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      assessment_id INTEGER REFERENCES assessments(id),
      inspector_id INTEGER NOT NULL REFERENCES users(id),
      certificate_number TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'granted', 'refused', 'expired', 'conditional')),
      certificate_type TEXT DEFAULT 'location' CHECK(certificate_type IN ('location', 'certified_handler')),
      substance_class TEXT,
      max_quantity TEXT,
      issue_date TEXT,
      in_force_date TEXT,
      expiry_date TEXT,
      refusal_reasons TEXT,
      refusal_date TEXT,
      refusal_regulations_not_met TEXT,
      refusal_form_generated INTEGER DEFAULT 0,
      worksafe_notification_due TEXT,
      worksafe_notification_sent TEXT,
      applicant_notification_sent TEXT,
      handler_name TEXT,
      handler_address TEXT,
      handler_dob TEXT,
      handler_id_type TEXT,
      handler_id_verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER REFERENCES assessments(id),
      assessment_item_id INTEGER REFERENCES assessment_items(id),
      client_id INTEGER REFERENCES clients(id),
      certificate_id INTEGER REFERENCES certificates(id),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      description TEXT,
      evidence_type TEXT DEFAULT 'photo'
        CHECK(evidence_type IN ('photo','document','calculation','engineer_cert','sds','site_plan','erp','training_record','id_document','other')),
      gps_latitude REAL,
      gps_longitude REAL,
      captured_by TEXT,
      captured_at TEXT,
      device_info TEXT,
      sha256_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      substance_name TEXT NOT NULL,
      hazard_class TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'litres',
      container_size REAL,
      container_count INTEGER,
      storage_location TEXT,
      sds_available INTEGER DEFAULT 0,
      sds_document TEXT,
      hsno_approval TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      plan_name TEXT NOT NULL DEFAULT 'Site Plan',
      plan_data TEXT NOT NULL DEFAULT '{}',
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      assessment_id INTEGER REFERENCES assessments(id),
      inspector_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('compliance_report', 'gap_analysis', 'non_compliance_notice', 'certificate_report', 'refusal_notification')),
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Run schema migrations (add columns introduced after initial release)
  const migrations = [
    // certificates v1.1
    "ALTER TABLE certificates ADD COLUMN is_conditional INTEGER DEFAULT 0",
    "ALTER TABLE certificates ADD COLUMN condition_details TEXT",
    "ALTER TABLE certificates ADD COLUMN condition_deadline TEXT",
    "ALTER TABLE certificates ADD COLUMN applicant_notified INTEGER DEFAULT 0",
    "ALTER TABLE certificates ADD COLUMN worksafe_notified INTEGER DEFAULT 0",
    "ALTER TABLE certificates ADD COLUMN worksafe_registered INTEGER DEFAULT 0",
    // clients
    "ALTER TABLE clients ADD COLUMN companies_number TEXT",
    // assessment_items
    "ALTER TABLE assessment_items ADD COLUMN legal_ref TEXT",
    // certificates v1.2 — refusal & handler fields
    "ALTER TABLE certificates ADD COLUMN certificate_type TEXT DEFAULT 'location'",
    "ALTER TABLE certificates ADD COLUMN refusal_date TEXT",
    "ALTER TABLE certificates ADD COLUMN refusal_regulations_not_met TEXT",
    "ALTER TABLE certificates ADD COLUMN refusal_form_generated INTEGER DEFAULT 0",
    "ALTER TABLE certificates ADD COLUMN worksafe_notification_due TEXT",
    "ALTER TABLE certificates ADD COLUMN worksafe_notification_sent TEXT",
    "ALTER TABLE certificates ADD COLUMN applicant_notification_sent TEXT",
    "ALTER TABLE certificates ADD COLUMN in_force_date TEXT",
    "ALTER TABLE certificates ADD COLUMN handler_name TEXT",
    "ALTER TABLE certificates ADD COLUMN handler_address TEXT",
    "ALTER TABLE certificates ADD COLUMN handler_dob TEXT",
    "ALTER TABLE certificates ADD COLUMN handler_id_type TEXT",
    "ALTER TABLE certificates ADD COLUMN handler_id_verified INTEGER DEFAULT 0",
    // assessment_items v1.2 — NC management & evidence gates
    "ALTER TABLE assessment_items ADD COLUMN risk_level TEXT DEFAULT 'medium'",
    "ALTER TABLE assessment_items ADD COLUMN evidence_required INTEGER DEFAULT 0",
    "ALTER TABLE assessment_items ADD COLUMN nc_code TEXT",
    "ALTER TABLE assessment_items ADD COLUMN nc_severity TEXT",
    "ALTER TABLE assessment_items ADD COLUMN corrective_action TEXT",
    "ALTER TABLE assessment_items ADD COLUMN corrective_action_due TEXT",
    "ALTER TABLE assessment_items ADD COLUMN corrective_action_status TEXT DEFAULT 'open'",
    // assessments v1.2 — certified_handler type
    "ALTER TABLE assessments ADD COLUMN type_new TEXT",
    // inventory
    "ALTER TABLE inventory ADD COLUMN hsno_approval TEXT",
    // reports v1.2
    "ALTER TABLE reports ADD COLUMN type_new TEXT",
    // v2.0 — Class-conditional checklists
    "ALTER TABLE assessment_items ADD COLUMN action TEXT",
    "ALTER TABLE assessment_items ADD COLUMN records TEXT",
    "ALTER TABLE assessment_items ADD COLUMN checklist_group TEXT DEFAULT 'general'",
    // v2.0 — Enriched inventory
    "ALTER TABLE inventory ADD COLUMN un_number TEXT",
    "ALTER TABLE inventory ADD COLUMN hazard_classifications TEXT",
    "ALTER TABLE inventory ADD COLUMN storage_requirements TEXT",
    "ALTER TABLE inventory ADD COLUMN incompatible_items TEXT",
    "ALTER TABLE inventory ADD COLUMN sds_expiry_date TEXT",
    "ALTER TABLE inventory ADD COLUMN sku TEXT",
    "ALTER TABLE inventory ADD COLUMN substance_state TEXT",
    "ALTER TABLE inventory ADD COLUMN max_quantity REAL",
    "ALTER TABLE inventory ADD COLUMN storage_area_id INTEGER",
    // v2.0 — Appendix-based evidence filing
    "ALTER TABLE evidence ADD COLUMN appendix_category TEXT",
    "ALTER TABLE evidence ADD COLUMN appendix_number INTEGER",
    "ALTER TABLE evidence ADD COLUMN location_area TEXT",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  }

  // v2.0 — Storage areas
  db.exec(`CREATE TABLE IF NOT EXISTS storage_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    area_name TEXT NOT NULL, area_type TEXT, substance_classes TEXT,
    max_capacity TEXT, building_type TEXT, notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // v2.0 — Training records
  db.exec(`CREATE TABLE IF NOT EXISTS training_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    worker_name TEXT NOT NULL, department TEXT, course_name TEXT NOT NULL,
    training_date TEXT, competent INTEGER DEFAULT 0, expiry_date TEXT,
    certificate_evidence_id INTEGER REFERENCES evidence(id),
    notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // v2.0 — Handler assessments
  db.exec(`CREATE TABLE IF NOT EXISTS handler_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL REFERENCES assessments(id),
    applicant_name TEXT, applicant_address TEXT, applicant_dob TEXT,
    employer_pcbu TEXT, employer_nzbn TEXT,
    substance_lifecycle_phases TEXT, qualifications TEXT,
    education_verified INTEGER DEFAULT 0,
    id_type TEXT, id_number TEXT, id_expiry TEXT, id_sighted INTEGER DEFAULT 0,
    knowledge_score REAL, written_score REAL,
    written_total REAL DEFAULT 60, written_pass_pct REAL DEFAULT 80,
    practical_passed INTEGER DEFAULT 0, overall_result TEXT,
    assessor_statement TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Seed default user (Bryan Wilson)
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('bryan.wilson@wilsoncompliance.co.nz');
  if (!existing) {
    db.prepare(`
      INSERT INTO users (name, email, role, certifier_number, phone)
      VALUES (?, ?, ?, ?, ?)
    `).run('Bryan Wilson', 'bryan.wilson@wilsoncompliance.co.nz', 'certifier', 'TST0907848', '022 612 1196');
  }

  console.log('Database schema initialised');
}
