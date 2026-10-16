-- 012: archive a client (16 October 2026).
--
-- The board lists clients; test and demo clients must leave it without their
-- records being destroyed. Archive hides a client from the board and from the
-- reminders; its jobs, certificates and reports stay readable by URL. Who
-- archived it is also in the event log (client.archive), by person.
-- Additive and reversible: unarchive sets both columns back to NULL.

ALTER TABLE client ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE client ADD COLUMN IF NOT EXISTS archived_by bigint REFERENCES app_user(id);

CREATE INDEX IF NOT EXISTS idx_client_active ON client(id) WHERE archived_at IS NULL;
