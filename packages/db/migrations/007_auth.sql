-- 007: who is holding the iPad.
--
-- IPS 21(4)(a) and 21(5) hang on the identity of the person recording and
-- signing. Until now the app declared it in a header. A passcode per user
-- and a bearer token per device make that identity something the server
-- established, not something the client asserted.
--
-- Passcode hashes are scrypt with a per-user salt. Tokens are random and
-- stored only as their SHA-256, so a copy of the table cannot be replayed.

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS passcode_hash text;

CREATE TABLE IF NOT EXISTS auth_token (
  token_hash    text PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES app_user(id),
  device_id     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_auth_token_user ON auth_token(user_id);
