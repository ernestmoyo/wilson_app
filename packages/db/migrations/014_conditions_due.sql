-- 014: the date a conditional certificate's conditions must be met by.
--
-- Reg 6.24(2): a conditional certificate specifies the requirement not met and
-- a date, no more than 3 months after issue, by which it must be met.
-- Scope of work answers (Tatenda Katai, 20 Oct 2026): "it must clearly state
-- the deadline for meeting the outstanding conditions".
--
-- Additive: one nullable column and a check that holds for every existing row
-- (all NULL). The issue route requires it for a conditional decision.

ALTER TABLE certificate ADD COLUMN IF NOT EXISTS conditions_due date;

DO $$ BEGIN
  ALTER TABLE certificate ADD CONSTRAINT conditions_due_within_three_months
    CHECK (conditions_due IS NULL
           OR (conditions_due >= issue_date AND conditions_due <= issue_date + interval '3 months'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
