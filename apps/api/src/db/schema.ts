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

    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      inspector_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('pre_inspection', 'site_inspection', 'validation')),
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
      status TEXT CHECK(status IN ('compliant', 'non_compliant', 'inapplicable', 'pending')),
      comments TEXT,
      legal_ref TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      assessment_id INTEGER REFERENCES assessments(id),
      inspector_id INTEGER NOT NULL REFERENCES users(id),
      certificate_number TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'granted', 'refused', 'expired')),
      substance_class TEXT,
      max_quantity TEXT,
      issue_date TEXT,
      expiry_date TEXT,
      refusal_reasons TEXT,
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
      type TEXT NOT NULL CHECK(type IN ('compliance_report', 'gap_analysis', 'non_compliance_notice', 'certificate_report')),
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Run schema migrations (add columns introduced in v1.1)
  const migrations = [
    "ALTER TABLE certificates ADD COLUMN is_conditional INTEGER DEFAULT 0",
    "ALTER TABLE certificates ADD COLUMN condition_details TEXT",
    "ALTER TABLE certificates ADD COLUMN condition_deadline TEXT",
    "ALTER TABLE certificates ADD COLUMN applicant_notified INTEGER DEFAULT 0",
    "ALTER TABLE certificates ADD COLUMN worksafe_notified INTEGER DEFAULT 0",
    "ALTER TABLE certificates ADD COLUMN worksafe_registered INTEGER DEFAULT 0",
    "ALTER TABLE clients ADD COLUMN companies_number TEXT",
    "ALTER TABLE assessment_items ADD COLUMN legal_ref TEXT",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  }

  // Seed default user (Bryan Wilson)
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('bryan.wilson@wilsoncompliance.co.nz');
  if (!existing) {
    db.prepare(`
      INSERT INTO users (name, email, role, certifier_number, phone)
      VALUES (?, ?, ?, ?, ?)
    `).run('Bryan Wilson', 'bryan.wilson@wilsoncompliance.co.nz', 'certifier', 'TST0907848', '022 612 1196');
  }

  console.log('✓ Database schema initialised');
}
