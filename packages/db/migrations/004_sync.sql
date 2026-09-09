-- ═══════════════════════════════════════════════════════════════════════════
-- Offline sync — idempotent application of client events.
--
-- The field app captures in a chiller with no signal and syncs later. Networks
-- drop mid-request, so the same batch WILL be retried. Every client event
-- carries a client-generated UUID; the first application wins and every
-- replay is a no-op. That is the entire contract, and it lives here so the
-- guarantee holds no matter which server instance handles the retry.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE device (
  id           text PRIMARY KEY,           -- client-generated, stable per install
  user_id      bigint REFERENCES app_user(id),
  label        text,
  platform     text,
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_event (
  id            uuid PRIMARY KEY,          -- client-generated: the idempotency key
  device_id     text NOT NULL REFERENCES device(id),
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  occurred_at   timestamptz NOT NULL,      -- when it happened on the device
  received_at   timestamptz NOT NULL DEFAULT now(),
  outcome       text NOT NULL CHECK (outcome IN ('applied', 'rejected', 'duplicate')),
  -- On rejection: the regulatory clause and message, so the app can show the
  -- inspector WHY rather than a generic error.
  reject_clause text,
  reject_reason text
);

CREATE INDEX idx_sync_event_device ON sync_event(device_id, received_at);

COMMENT ON TABLE sync_event IS
  'Every client event ever received, applied or not. The primary key is the client UUID, which is what makes replay safe.';

COMMIT;
