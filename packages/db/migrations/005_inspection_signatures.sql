-- ═══════════════════════════════════════════════════════════════════════════
-- The two signatures the check sheet carries, IPS cl. 21(5).
--
-- Row 62 / 44: "Declaration: I verify that I have examined the evidence …
--               Site Assessor confirmation (Digital signature) IPS Clause 21(5)"
-- Row 51:      "I can confirm that I have checked that the certification process
--               has been carried within my scope of authorisation.
--               Site Assessor confirmation (Digital signature) IPS Clause 21(5)"
--
-- 21(5): a record other than a photograph must be signed and dated by the
-- certifier and, if applicable, the person who undertook the inspection. A
-- signature is therefore a (who, when) pair on the inspection, not a checkbox.
-- IPS 8(3) permits the signature to be electronic.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE inspection
  ADD COLUMN IF NOT EXISTS declaration_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS declaration_signed_by bigint REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS scope_confirmed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS scope_confirmed_by    bigint REFERENCES app_user(id);

-- A signature without a signer, or a signer without a time, is not a signature.
ALTER TABLE inspection
  ADD CONSTRAINT declaration_signature_complete
    CHECK ((declaration_signed_at IS NULL) = (declaration_signed_by IS NULL)),
  ADD CONSTRAINT scope_confirmation_complete
    CHECK ((scope_confirmed_at IS NULL) = (scope_confirmed_by IS NULL));

COMMENT ON COLUMN inspection.declaration_signed_at IS
  'IPS 21(5): the check sheet declaration, signed and dated by the site assessor.';
COMMENT ON COLUMN inspection.scope_confirmed_at IS
  'IPS 21(5): confirmation that certification was carried out within the certifier''s scope of authorisation.';

COMMIT;
