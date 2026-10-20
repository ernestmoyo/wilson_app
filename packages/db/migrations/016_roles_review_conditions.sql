-- 016: roles, peer review, conditions outstanding (phase 2, package B).
--
-- From Tatenda Katai's answers of 20 Oct 2026 (docs/20261019/CHANGE_GRAPH.md
-- §10, Q5 to Q7; contract docs/20261019/PHASE2_CONTRACT.md):
--
-- Q6  Six people: two may issue, but every certificate is in Bryan Wilson's
--     name (TST100250); three reviewers, one with admin and oversight; one
--     peer reviewer with their own login.
--     * role peer_reviewer
--     * app_user.can_administer: manages people without deciding
--     * app_user.is_certificate_holder: the person every certificate names
--     * certificate.issued_by: who pressed Issue (certifier_id is the holder)
-- Q5  Peer review only for an existing stationary container system on a
--     reg 17.91 report: the peer reviewer sees the final check sheets and
--     evidence, comments, and formally approves.
--     * job.peer_review_required, peer_review, peer_review_comment
-- Q7  A conditional certificate's assessment stays open until every
--     condition is met and approved by the certifier.
--     * certificate_condition, and a guard: no move to monitoring or closed
--       while a condition is unverified (reg 6.24)
--
-- Additive: new columns with defaults, new tables, a widened role check, a
-- new trigger. Safe to run twice.

-- ── roles ────────────────────────────────────────────────────────────────
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check
  CHECK (role IN ('certifier', 'reviewer', 'viewer', 'assistant', 'admin', 'peer_reviewer'));

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS can_administer boolean NOT NULL DEFAULT false;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS is_certificate_holder boolean NOT NULL DEFAULT false;

-- One certificate holder at most.
CREATE UNIQUE INDEX IF NOT EXISTS app_user_one_certificate_holder
  ON app_user ((true)) WHERE is_certificate_holder;

-- The holder is the TST100250 person, when exactly one exists and no one
-- holds the flag yet.
UPDATE app_user SET is_certificate_holder = true
WHERE authorisation_number = 'TST100250'
  AND NOT is_certificate_holder
  AND (SELECT count(*) FROM app_user WHERE authorisation_number = 'TST100250') = 1
  AND NOT EXISTS (SELECT 1 FROM app_user WHERE is_certificate_holder);

-- ── who pressed Issue ────────────────────────────────────────────────────
ALTER TABLE certificate ADD COLUMN IF NOT EXISTS issued_by bigint REFERENCES app_user(id);

-- ── peer review (reg 17.91 report on an existing stationary container system)
ALTER TABLE job ADD COLUMN IF NOT EXISTS peer_review_required boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS peer_review (
  id            bigserial PRIMARY KEY,
  job_id        bigint NOT NULL REFERENCES job(id),
  reviewer_id   bigint NOT NULL REFERENCES app_user(id),
  decision      text   NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  comment       text,
  -- sha256 over the findings and the current evidence at the moment of the
  -- decision; an edit afterwards changes the job's hash and lapses it.
  snapshot_hash char(64) NOT NULL,
  decided_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_peer_review_job ON peer_review(job_id, id);

CREATE TABLE IF NOT EXISTS peer_review_comment (
  id          bigserial PRIMARY KEY,
  job_id      bigint NOT NULL REFERENCES job(id),
  author_id   bigint NOT NULL REFERENCES app_user(id),
  finding_id  bigint REFERENCES finding(id),
  body        text   NOT NULL CHECK (length(trim(body)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_peer_review_comment_job ON peer_review_comment(job_id, id);

-- ── conditions outstanding (reg 6.24) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificate_condition (
  id                 bigserial PRIMARY KEY,
  certificate_id     bigint NOT NULL REFERENCES certificate(id),
  ordinal            int    NOT NULL,
  text               text   NOT NULL,
  regulation         text,
  due_date           date,
  verified_by        bigint REFERENCES app_user(id),
  verified_at        timestamptz,
  verification_note  text,
  UNIQUE (certificate_id, ordinal),
  CONSTRAINT condition_verification_complete CHECK ((verified_by IS NULL) = (verified_at IS NULL))
);

-- The assessment stays open while a condition is unverified: no move to
-- monitoring or closed (Tatenda, 20 Oct 2026, Q7).
CREATE OR REPLACE FUNCTION assert_conditions_verified() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_open integer;
BEGIN
  IF NEW.stage IN ('monitoring', 'closed') AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    SELECT count(*) INTO v_open
    FROM certificate_condition cc JOIN certificate c ON c.id = cc.certificate_id
    WHERE c.job_id = NEW.id AND cc.verified_at IS NULL;
    IF v_open > 0 THEN
      RAISE EXCEPTION
        'reg 6.24: % condition(s) of the conditional certificate on job % are not yet verified by a certifier; the assessment stays open until every condition is met',
        v_open, NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_conditions_outstanding ON job;
CREATE TRIGGER trg_job_conditions_outstanding
  BEFORE UPDATE OF stage ON job
  FOR EACH ROW EXECUTE FUNCTION assert_conditions_verified();

-- Backstop for the peer review gate: a flagged job reaches certificate_issued
-- only after an approval. The issue route also checks the approval is for
-- the job as it stands (snapshot hash).
CREATE OR REPLACE FUNCTION assert_peer_review_approved() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_decision text;
BEGIN
  IF NEW.stage = 'certificate_issued' AND NEW.stage IS DISTINCT FROM OLD.stage AND NEW.peer_review_required THEN
    SELECT decision INTO v_decision FROM peer_review WHERE job_id = NEW.id ORDER BY id DESC LIMIT 1;
    IF v_decision IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION
        'reg 17.91: job % needs the peer reviewer''s approval before a certificate can issue',
        NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_peer_review_approved ON job;
CREATE TRIGGER trg_job_peer_review_approved
  BEFORE UPDATE OF stage ON job
  FOR EACH ROW EXECUTE FUNCTION assert_peer_review_approved();
