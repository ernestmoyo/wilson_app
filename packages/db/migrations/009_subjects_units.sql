-- 009: the subject of a job that is not a location, and its units.
--
-- The location sheets take their block above the items from client, site
-- and hazardous substance location. The handler assessment sheet is about
-- an applicant (name, DOB, addresses, application type, assessment dates)
-- and the cylinder importation sheets are about a PCBU with one or more
-- cylinder batches (FERN, country, design standard, pressures, ...). The
-- labels come from the template; the values live here, verbatim, keyed by
-- label, so a change to a sheet's labels never orphans a value.

ALTER TABLE job ADD COLUMN IF NOT EXISTS subject jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS job_unit (
  id         bigserial PRIMARY KEY,
  job_id     bigint NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  ordinal    integer NOT NULL,
  fields     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, ordinal)
);
