-- 006: fold stray findings back onto the revision their inspection is pinned to.
--
-- Before the server resolved items within an inspection's pinned revision,
-- a re-seed that superseded a template sent new findings to the new
-- revision's item rows while the old ones stayed on the old rows. One
-- inspection then held two findings for the same logical item, counts
-- doubled, and the issuance dry-run over-reported unresolved
-- non-compliances. Section and item ordinals are stable across revisions
-- (they are the workbook's own numbering), so the equivalent pinned item
-- is always known.
--
-- For every finding whose item belongs to a revision the inspection is NOT
-- pinned to, but whose code the inspection IS pinned to:
--   * if the pinned item has no finding, move this one onto it;
--   * otherwise keep the pinned row, take the later decision's values, move
--     evidence and corrective actions across, and delete the stray.
-- Idempotent: once nothing is stray, nothing happens.

DO $$
DECLARE
  s      record;
  target bigint;
  keep   bigint;
BEGIN
  FOR s IN
    SELECT f.id, f.inspection_id, f.status, f.comment, f.verification_method,
           f.failure_reason, f.decided_by, f.decided_at,
           f.certifier_signed_at, f.inspector_signed_at,
           t.code, sec.ordinal AS section_ordinal, it.ordinal AS item_ordinal
    FROM finding f
    JOIN checksheet_item it      ON it.id = f.item_id
    JOIN checksheet_section sec  ON sec.id = it.section_id
    JOIN checksheet_template t   ON t.id = sec.template_id
    WHERE EXISTS (SELECT 1 FROM inspection_template p
                  JOIN checksheet_template pt ON pt.id = p.template_id
                  WHERE p.inspection_id = f.inspection_id AND pt.code = t.code)
      AND NOT EXISTS (SELECT 1 FROM inspection_template p
                      WHERE p.inspection_id = f.inspection_id AND p.template_id = t.id)
    ORDER BY f.id
  LOOP
    SELECT it.id INTO target
    FROM inspection_template p
    JOIN checksheet_template pt ON pt.id = p.template_id AND pt.code = s.code
    JOIN checksheet_section sec ON sec.template_id = pt.id AND sec.ordinal = s.section_ordinal
    JOIN checksheet_item it     ON it.section_id = sec.id AND it.ordinal = s.item_ordinal
    WHERE p.inspection_id = s.inspection_id
    ORDER BY pt.revision DESC
    LIMIT 1;

    IF target IS NULL THEN
      CONTINUE;  -- no equivalent item in the pinned revision; leave it alone
    END IF;

    SELECT id INTO keep FROM finding
    WHERE inspection_id = s.inspection_id AND item_id = target;

    IF keep IS NULL THEN
      UPDATE finding SET item_id = target, updated_at = now() WHERE id = s.id;
    ELSE
      UPDATE finding
      SET status              = s.status,
          comment             = s.comment,
          verification_method = s.verification_method,
          failure_reason      = s.failure_reason,
          decided_by          = s.decided_by,
          decided_at          = s.decided_at,
          certifier_signed_at = COALESCE(certifier_signed_at, s.certifier_signed_at),
          inspector_signed_at = COALESCE(inspector_signed_at, s.inspector_signed_at),
          updated_at          = now()
      WHERE id = keep
        AND COALESCE(s.decided_at, 'epoch'::timestamptz) > COALESCE(decided_at, 'epoch'::timestamptz);
      UPDATE evidence          SET finding_id = keep WHERE finding_id = s.id;
      UPDATE corrective_action SET finding_id = keep WHERE finding_id = s.id;
      DELETE FROM finding WHERE id = s.id;
    END IF;
  END LOOP;
END $$;
