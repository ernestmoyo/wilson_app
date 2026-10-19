-- 013: Assure Safety scope of work of 19 October 2026, phase 1 foundation.
-- docs/20261019/CHANGE_GRAPH.md. Additive: new nullable columns, one new
-- table, and the issuance guard tightened (B12).
--
-- 1. finding.general_comment: the workbooks' blue "General comment", an
--    observation on an item that is otherwise decided (B1). Printed separately.
-- 2. finding.na_reason: why an item is not applicable. Optional (A2).
-- 3. job.scope_choices: the scope choices picked at job start, e.g. which of
--    the seven class 3.1 arrangements this location is (A3, B3). NULL means
--    the whole sheet set, which is every job created before this migration.
-- 4. inspection_section_excluded: sections of a pinned template that this
--    inspection does not assess, either because the scope choice was not
--    picked or because the work is outside the authorisation (B4). They are
--    not shown, not counted as unanswered, and never support a certificate.
-- 5. evidence.original_name: the file name a PDF arrived with, so the ZIP
--    and the evidence list can show "ERP rev 2.pdf", not a hash.
-- 6. assert_can_issue_certificate: also refuses while an item in scope has
--    no finding at all (F8). Before, only findings explicitly 'pending'
--    blocked; an item never touched passed.

ALTER TABLE finding ADD COLUMN IF NOT EXISTS general_comment text;
ALTER TABLE finding ADD COLUMN IF NOT EXISTS na_reason text;

ALTER TABLE job ADD COLUMN IF NOT EXISTS scope_choices text[];

CREATE TABLE IF NOT EXISTS inspection_section_excluded (
  inspection_id bigint NOT NULL REFERENCES inspection(id) ON DELETE CASCADE,
  section_id    bigint NOT NULL REFERENCES checksheet_section(id),
  reason        text   NOT NULL CHECK (reason IN ('not_chosen', 'not_in_scope')),
  PRIMARY KEY (inspection_id, section_id)
);

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS original_name text;

-- Items an inspection must answer: every item of every pinned template,
-- less the excluded sections.
CREATE OR REPLACE VIEW inspection_item_in_scope AS
SELECT p.inspection_id, it.id AS item_id, s.id AS section_id, t.code AS template_code,
       s.ordinal AS section_ordinal, it.ordinal AS item_ordinal
FROM inspection_template p
JOIN checksheet_template t ON t.id = p.template_id
JOIN checksheet_section s ON s.template_id = t.id
JOIN checksheet_item it ON it.section_id = s.id
WHERE NOT EXISTS (
  SELECT 1 FROM inspection_section_excluded x
  WHERE x.inspection_id = p.inspection_id AND x.section_id = s.id
);

CREATE OR REPLACE FUNCTION assert_can_issue_certificate(p_job_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_open_nc     integer;
  v_pending     integer;
  v_unanswered  integer;
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

  -- IPS 21(1)(f): every non-compliance must state why it failed.
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
  -- certificate says: an item marked pending, or an item in scope with no
  -- finding at all.
  SELECT count(*) INTO v_pending
  FROM finding f
  JOIN inspection i ON i.id = f.inspection_id
  WHERE i.job_id = p_job_id AND f.status = 'pending';

  SELECT count(*) INTO v_unanswered
  FROM inspection_item_in_scope s
  JOIN inspection i ON i.id = s.inspection_id
  LEFT JOIN finding f ON f.inspection_id = s.inspection_id AND f.item_id = s.item_id
  WHERE i.job_id = p_job_id AND f.id IS NULL;

  IF v_pending + v_unanswered > 0 THEN
    RAISE EXCEPTION
      'reg 13.39: % check sheet item(s) on job % are not yet assessed',
      v_pending + v_unanswered, p_job_id
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
