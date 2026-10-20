-- 015: evidence review and versions (phase 2 package A).
--
-- Tatenda Katai's answers of 20 Oct 2026:
--   Q3  the reviewer assesses and accepts the evidence that shows compliance;
--       replaced files are kept.
--   Q4  record the upload date (and keep previous versions); the version used
--       must be identified in the downloaded package.
--
-- Additive only. A replacement is a new row that points at the row it
-- replaces (supersedes_id); the old row is never deleted or overwritten.
-- Existing rows become version 1, submitted, with their upload date taken
-- from when the row was created (the new column only, filled once).

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS supersedes_id bigint REFERENCES evidence(id);
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS uploaded_by bigint REFERENCES app_user(id);

-- uploaded_at: added nullable, filled from created_at for the rows already
-- there (a file uploaded in September must not read as uploaded today), then
-- given its default and NOT NULL. Only runs when the column is new.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'evidence' AND column_name = 'uploaded_at') THEN
    ALTER TABLE evidence ADD COLUMN uploaded_at timestamptz;
    UPDATE evidence SET uploaded_at = created_at WHERE uploaded_at IS NULL;
    ALTER TABLE evidence ALTER COLUMN uploaded_at SET DEFAULT now();
    ALTER TABLE evidence ALTER COLUMN uploaded_at SET NOT NULL;
  END IF;
END $$;

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'submitted';
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_by bigint REFERENCES app_user(id);
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS review_note text;

DO $$ BEGIN
  ALTER TABLE evidence ADD CONSTRAINT evidence_review_state_check
    CHECK (review_state IN ('submitted', 'accepted', 'not_accepted'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- IPS 21(1)(e): evidence found not to show compliance says why.
DO $$ BEGIN
  ALTER TABLE evidence ADD CONSTRAINT evidence_not_accepted_needs_note
    CHECK (review_state <> 'not_accepted' OR (review_note IS NOT NULL AND btrim(review_note) <> ''));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A decision records when it was made.
DO $$ BEGIN
  ALTER TABLE evidence ADD CONSTRAINT evidence_review_dated
    CHECK (review_state = 'submitted' OR reviewed_at IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE evidence ADD CONSTRAINT evidence_version_positive CHECK (version >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A version is replaced at most once: the chain never forks.
CREATE UNIQUE INDEX IF NOT EXISTS evidence_one_successor ON evidence(supersedes_id) WHERE supersedes_id IS NOT NULL;

-- The evidence that stands today: every row no other row replaces.
CREATE OR REPLACE VIEW evidence_current AS
  SELECT e.* FROM evidence e
  WHERE NOT EXISTS (SELECT 1 FROM evidence n WHERE n.supersedes_id = e.id);
