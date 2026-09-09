-- ═══════════════════════════════════════════════════════════════════════════
-- Transition guards, retention, template immutability, and the append-only
-- event log.
--
-- These are the rules a spreadsheet cannot enforce. Each one exists because a
-- regulation says so, and each names its clause. They live in the database
-- rather than the application because there will eventually be more than one
-- writer (API, mobile sync, migration scripts) and a rule enforced in only
-- one of them is not enforced.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Job state machine ───────────────────────────────────────────────────
-- The 8 stages of the Assure Safety process flow, plus the two loops (RFI and
-- gap closure) and the two exits (referred, closed).

CREATE FUNCTION job_stage_allowed(from_stage job_stage, to_stage job_stage)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (from_stage, to_stage) IN (
    -- 1 enquiry → triage outcome
    ('enquiry','application'), ('enquiry','referred'), ('enquiry','closed'),
    -- 2 application → accepted / declined
    ('application','document_review'), ('application','closed'),
    -- 3 document review ⇄ RFI loop
    ('document_review','rfi'), ('rfi','document_review'),
    ('document_review','site_inspection'),
    -- 4 site inspection
    ('site_inspection','compliance_evaluation'),
    -- 5 evaluation ⇄ gap closure loop
    ('compliance_evaluation','gap_closure'), ('gap_closure','compliance_evaluation'),
    ('compliance_evaluation','final_validation'),
    -- 6 final validation — may send the job back if validation fails
    ('final_validation','certificate_issued'),
    ('final_validation','gap_closure'),
    ('final_validation','site_inspection'),
    -- 7 → 8
    ('certificate_issued','monitoring'),
    ('certificate_issued','closed'),
    -- 8 renewal re-enters the pipeline
    ('monitoring','enquiry'), ('monitoring','closed'),
    ('referred','closed')
  );
$$;

COMMENT ON FUNCTION job_stage_allowed IS
  'Assure Safety Compliance Certification Process Flow, stages 1-8. A transition absent from this table is a bug or a misunderstanding, never a shortcut.';

-- ── 2. Guards on issuing a certificate ─────────────────────────────────────

CREATE FUNCTION assert_can_issue_certificate(p_job_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_open_nc     integer;
  v_pending     integer;
  v_declared    integer;
  v_incomplete  integer;
BEGIN
  -- IPS 23(1): the conflict-of-interest question must have been asked and
  -- answered for this job before a certificate can issue.
  SELECT count(*) INTO v_declared
  FROM interest_declaration WHERE job_id = p_job_id;

  IF v_declared = 0 THEN
    RAISE EXCEPTION
      'IPS 23(1): no interest declaration recorded for job % — a certificate cannot issue without one',
      p_job_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- IPS 21(1)(f): every non-compliance must state why it failed. The column
  -- constraint already enforces this on write; re-checked here because a
  -- certificate decision is the point where it actually matters.
  SELECT count(*) INTO v_incomplete
  FROM finding f
  JOIN inspection i ON i.id = f.inspection_id
  WHERE i.job_id = p_job_id
    AND f.status = 'non_compliant'
    AND (f.failure_reason IS NULL OR length(trim(f.failure_reason)) = 0);

  IF v_incomplete > 0 THEN
    RAISE EXCEPTION
      'IPS 21(1)(f): % non-compliant finding(s) on job % have no stated reason',
      v_incomplete, p_job_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Unassessed items mean the inspection is not finished, whatever the
  -- certificate says.
  SELECT count(*) INTO v_pending
  FROM finding f
  JOIN inspection i ON i.id = f.inspection_id
  WHERE i.job_id = p_job_id AND f.status = 'pending';

  IF v_pending > 0 THEN
    RAISE EXCEPTION
      'reg 13.39: % check sheet item(s) on job % are still pending assessment',
      v_pending, p_job_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_open_nc
  FROM finding f
  JOIN inspection i ON i.id = f.inspection_id
  LEFT JOIN corrective_action ca ON ca.finding_id = f.id
  WHERE i.job_id = p_job_id
    AND f.status = 'non_compliant'
    AND (ca.id IS NULL OR ca.status <> 'verified');

  -- A full grant requires no unresolved non-compliances. A conditional
  -- certificate is the mechanism for carrying them (reg 6.24), so the caller
  -- decides which; this function reports.
  IF v_open_nc > 0 THEN
    RAISE NOTICE
      'reg 6.24: job % has % unresolved non-compliance(s) — only a conditional certificate or a refusal is available',
      p_job_id, v_open_nc;
  END IF;
END;
$$;

-- ── 3. Enforce the state machine on every stage change ─────────────────────

CREATE FUNCTION job_stage_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage = OLD.stage THEN
    RETURN NEW;
  END IF;

  IF NOT job_stage_allowed(OLD.stage, NEW.stage) THEN
    RAISE EXCEPTION 'illegal job stage transition: % → %', OLD.stage, NEW.stage
      USING ERRCODE = 'check_violation',
            HINT = 'See job_stage_allowed() and the process flow in docs/GRAPH.md';
  END IF;

  IF NEW.stage = 'certificate_issued' THEN
    PERFORM assert_can_issue_certificate(NEW.id);
  END IF;

  -- Every stage change is recorded, never just overwritten.
  INSERT INTO job_stage_transition (job_id, from_stage, to_stage)
  VALUES (NEW.id, OLD.stage, NEW.stage);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_stage_guard
  BEFORE UPDATE OF stage ON job
  FOR EACH ROW EXECUTE FUNCTION job_stage_guard();

-- ── 4. Certificate: number rule, retention clock, WorkSafe deadline ────────

CREATE FUNCTION certificate_on_insert() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_auth text;
BEGIN
  SELECT authorisation_number INTO v_auth FROM app_user WHERE id = NEW.certifier_id;

  -- IPS 8(1)(c)(ii): a certifier-assigned number must carry the authorisation
  -- number as a prefix. A register number (8(1)(c)(i)) has no such rule, so
  -- this only bites when there is no register number to fall back on.
  IF NEW.certificate_number IS NOT NULL
     AND NEW.register_number IS NULL
     AND v_auth IS NOT NULL
     AND position(v_auth in NEW.certificate_number) <> 1 THEN
    RAISE EXCEPTION
      'IPS 8(1)(c)(ii): certificate number % must be prefixed with the authorisation number %',
      NEW.certificate_number, v_auth
      USING ERRCODE = 'check_violation',
            HINT = 'Either prefix the number, or record the WorkSafe register number in register_number.';
  END IF;

  -- reg 6.22(5): 15 working days to enter it in the register. Approximated as
  -- 21 calendar days; a working-day calendar can refine this later.
  IF NEW.worksafe_register_due IS NULL THEN
    NEW.worksafe_register_due := NEW.issue_date + INTERVAL '21 days';
  END IF;

  -- The retention clock is created by the AFTER trigger. In a BEFORE INSERT
  -- the certificate row does not exist yet, so retention_clock.certificate_id
  -- has nothing to reference.
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_certificate_on_insert
  BEFORE INSERT ON certificate
  FOR EACH ROW EXECUTE FUNCTION certificate_on_insert();

-- retention_clock is inserted by the trigger above; the AFTER hook fixes up
-- the certificate_id once the row has one.
CREATE FUNCTION certificate_after_insert() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_trigger text;
  v_retain  date;
BEGIN
  -- IPS 21(6): retain until 5 years after expiry, or 5 years after a refusal.
  -- Computed here, once, from the certificate's own dates — never typed in and
  -- never remembered by a person.
  IF NEW.decision = 'refused' THEN
    v_trigger := 'refusal_plus_5y';
    v_retain  := NEW.issue_date + INTERVAL '5 years';
  ELSE
    v_trigger := 'expiry_plus_5y';
    v_retain  := COALESCE(NEW.expiry_date, NEW.issue_date + INTERVAL '3 years')
                 + INTERVAL '5 years';
  END IF;

  INSERT INTO retention_clock (job_id, certificate_id, trigger, retain_until)
  VALUES (NEW.job_id, NEW.id, v_trigger, v_retain)
  ON CONFLICT (job_id) DO UPDATE
    SET certificate_id = EXCLUDED.certificate_id,
        trigger        = EXCLUDED.trigger,
        retain_until   = EXCLUDED.retain_until;

  -- Evidence inherits the job's retention date. This is the value an object
  -- lock's retain-until is set from, so IPS 21(6) becomes a property enforced
  -- by storage rather than a policy someone has to follow.
  UPDATE evidence SET retain_until = v_retain WHERE job_id = NEW.job_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_certificate_after_insert
  AFTER INSERT ON certificate
  FOR EACH ROW EXECUTE FUNCTION certificate_after_insert();

-- ── 5. Template immutability ───────────────────────────────────────────────
-- A published template must never change under an inspection that cites it.
-- A Performance Standard revision inserts a new revision instead.

CREATE FUNCTION template_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'checksheet_template % rev % is % and cannot be deleted',
        OLD.code, OLD.revision, OLD.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- Only the lifecycle field may move on a published template.
  IF OLD.status <> 'draft' AND (
       NEW.code <> OLD.code OR NEW.revision <> OLD.revision
       OR NEW.title <> OLD.title OR NEW.ps_reference IS DISTINCT FROM OLD.ps_reference
     ) THEN
    RAISE EXCEPTION
      'checksheet_template % rev % is published and immutable — publish a new revision instead',
      OLD.code, OLD.revision
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_template_immutable
  BEFORE UPDATE OR DELETE ON checksheet_template
  FOR EACH ROW EXECUTE FUNCTION template_immutable();

-- ── 6. Append-only, hash-chained event log ─────────────────────────────────
-- The audit trail IS the database. Chaining each row to its predecessor makes
-- a silent edit detectable: altering any row breaks every hash after it.

CREATE TABLE event (
  seq         bigserial PRIMARY KEY,
  actor_id    bigint REFERENCES app_user(id),
  entity_type text NOT NULL,
  entity_id   bigint NOT NULL,
  action      text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  prev_hash   char(64),
  hash        char(64) NOT NULL
);

CREATE INDEX idx_event_entity ON event(entity_type, entity_id, seq);

CREATE FUNCTION event_chain() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev char(64);
BEGIN
  SELECT hash INTO v_prev FROM event ORDER BY seq DESC LIMIT 1;
  NEW.prev_hash := v_prev;
  -- sha256() is built into Postgres 11+, so the audit chain needs no extension.
  NEW.hash := encode(
    sha256(convert_to(
      coalesce(v_prev, '') || '|' ||
      coalesce(NEW.actor_id::text, '') || '|' ||
      NEW.entity_type || '|' || NEW.entity_id::text || '|' ||
      NEW.action || '|' || NEW.payload::text || '|' ||
      NEW.occurred_at::text,
      'UTF8')),
    'hex');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_chain
  BEFORE INSERT ON event
  FOR EACH ROW EXECUTE FUNCTION event_chain();

CREATE FUNCTION event_append_only() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'event log is append-only — % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trg_event_append_only
  BEFORE UPDATE OR DELETE ON event
  FOR EACH ROW EXECUTE FUNCTION event_append_only();

-- Verify the chain. Returns the first seq where the hash does not recompute,
-- or NULL if the log is intact.
CREATE FUNCTION verify_event_chain()
RETURNS TABLE (broken_at bigint, expected char(64), found char(64))
LANGUAGE plpgsql
AS $$
DECLARE
  r         record;
  v_prev    char(64) := NULL;
  v_expect  char(64);
BEGIN
  FOR r IN SELECT * FROM event ORDER BY seq LOOP
    v_expect := encode(
      sha256(convert_to(
        coalesce(v_prev, '') || '|' ||
        coalesce(r.actor_id::text, '') || '|' ||
        r.entity_type || '|' || r.entity_id::text || '|' ||
        r.action || '|' || r.payload::text || '|' ||
        r.occurred_at::text,
        'UTF8')),
      'hex');
    IF v_expect <> r.hash THEN
      broken_at := r.seq; expected := v_expect; found := r.hash;
      RETURN NEXT;
      RETURN;
    END IF;
    v_prev := r.hash;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION verify_event_chain IS
  'Returns no rows when the audit log is intact. Run it before producing records for a WorkSafe audit.';

COMMIT;
