-- 011: two things the independent server review asked for.
--
-- 1. sync_event.result: what an applied event returned (e.g. the inspection
--    id from inspection.open). A device whose response was lost replays the
--    event, gets "duplicate", and can now still read the id it needs.
-- 2. int_or_null(text): a safe cast for ids read out of event payloads. One
--    malformed payload (jobId "abc") used to make every history query fail
--    with a bigint cast error, because the cast ran over all rows.

ALTER TABLE sync_event ADD COLUMN IF NOT EXISTS result jsonb;

CREATE OR REPLACE FUNCTION int_or_null(t text) RETURNS bigint
  IMMUTABLE STRICT LANGUAGE sql AS $$
    SELECT CASE WHEN t ~ '^[0-9]{1,18}$' THEN t::bigint END
  $$;
