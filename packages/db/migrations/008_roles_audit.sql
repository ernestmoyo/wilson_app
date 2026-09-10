-- 008: who did what, and who may do what.
--
-- From the 10 September call: Bryan is the only compliance certifier and the
-- only one who decides and issues; others review documents and registers,
-- upload, and mark items with comments but cannot decide. Every event now
-- carries the signed-in user, so the audit trail names a person, not a
-- device (IPS 21(5), 22).

ALTER TABLE sync_event ADD COLUMN IF NOT EXISTS user_id bigint REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_sync_event_user ON sync_event(user_id, received_at);

-- reviewer: upload, review, mark, comment, raise corrective actions; no
-- signature, no decision, no certificate. viewer: read only.
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check
  CHECK (role IN ('certifier', 'reviewer', 'viewer', 'assistant', 'admin'));

-- Placeholder people for the two other roles, on role addresses as agreed;
-- they cannot sign in until a passcode is set (ASSURE_PASSCODE_REVIEWER /
-- ASSURE_PASSCODE_VIEWER). Names change when Bryan names the people.
INSERT INTO app_user (id, full_name, occupation, email, role)
VALUES
  (2, 'Document reviewer', 'Compliance reviewer', 'reviewer@assuresafety.co.nz', 'reviewer'),
  (3, 'Viewer', 'Viewer', 'viewer@assuresafety.co.nz', 'viewer')
ON CONFLICT (id) DO NOTHING;
SELECT setval('app_user_id_seq', GREATEST((SELECT max(id) FROM app_user), 1));
