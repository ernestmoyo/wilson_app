# Phase 2 contract (20 October 2026)

From Tatenda Katai's answers of 20 Oct 2026 (CHANGE_GRAPH.md §10). Three packages, built in parallel, each in its own worktree, merged by the lead. Every rule in CLAUDE.md applies: migrations additive, every mutation a sync event recorded with the person, rejections carry a clause and are 4xx, tests growth-safe, no live systems, no push or deploy.

## Package E — class 3.2 / 4 sheet (Q2)

- Extract the "Class 3.2 and 4" tab of `docs/20261019/Argenta Class 2 and 3 location checksheets with feedback.xlsx` through the existing pipeline (`packages/checksheets/tools`, extractor 1.1.0 with per-run colour) into `data/wks17-class-3-2-and-4.template.json` (code `wks17-class-3-2-and-4`), revision 1, verbatim wording, regulation refs as in the workbook. The general sheet's class view: add `class_3_2_4` to `sheetByClass` / `regulationRefsByClass` only where the workbook's general tab for this class differs (if it has none, the general sheet's base applies).
- Sheet set `class_3_2_4` in `sheet-sets.json`: name "Location: classes 3.2 and 4", kind location, templates [general, class 3.2/4], regulation `10.36` (LCC certificate wording: `CLASS_REGULATION.class_3_2_4 = '10.36'` in `packages/checksheets/lib/render-certificate.mjs`).
- Authorisation: Appendix A lists **4.1.1 only (≤ 2,000)**. Add an authorisation entry `location-4-1-1` for the set with that limit and a note that 3.2 and 4.1.2A–F are not on the register (open question to the owner). The set is offered (authorised via the 4.1.1 entry); the New job form shows a one-line note under the set: "Authorised for 4.1.1 only (Appendix A). 3.2 and 4.1.2 substances: not yet authorised."
- Regenerate (TS, Dart, SQL seed), `verify` round-trips. Tests: generated templates load; the set appears in `/api/sheet-sets` as authorised; a job opens on it.
- Files: `packages/checksheets/**`, `apps/mobile/lib/generated/**`, `apps/mobile/lib/screens/jobs_board.dart` (the one-line note only), tests for these.

## Package A — evidence review and versions (Q3, Q4)

Migration **`015_evidence_review.sql`** (additive):
- `evidence.supersedes_id bigint REFERENCES evidence(id)` (the version this one replaces), `evidence.version int NOT NULL DEFAULT 1`, `evidence.uploaded_by bigint REFERENCES app_user(id)`, `evidence.uploaded_at timestamptz NOT NULL DEFAULT now()`.
- `evidence.review_state text NOT NULL DEFAULT 'submitted' CHECK (review_state IN ('submitted','accepted','not_accepted'))`, `reviewed_by bigint REFERENCES app_user(id)`, `reviewed_at timestamptz`, `review_note text`.
- View `evidence_current`: evidence rows not superseded by another row.
- A superseded row is never deleted or overwritten (retention as today).

Events (`apps/server/src/sync/apply.mjs`):
- `evidence.attach` gains optional `supersedesId` (same job and same finding required; version = old + 1; the old row stays). `uploaded_by` = the signed-in person.
- `evidence.review` `{evidenceId, state: 'accepted'|'not_accepted', note?}` — reviewer, admin or certifier (not viewer, not peer_reviewer); a `not_accepted` needs a note (clause `IPS 21(1)(e)`). Reviewing a superseded version is refused.

Reads and exports:
- Job payload evidence rows carry `version, supersedes_id, uploaded_by_name, uploaded_at, review_state, reviewed_by_name, reviewed_at, review_note, current` (boolean).
- Checksheet PDF: the evidence column / appendix list names the current version: "v2 · uploaded 20/10/2026 by <name> · accepted by <name>".
- ZIP: current versions where they are today; superseded versions under `Previous versions/` with the same naming plus ` (v1)`.
- Issuance check (`/api/jobs/:id/issuance-check`): a warning (not a blocker) listing current evidence still `submitted` or `not_accepted`.

App:
- Evidence on an item (`evidence_capture.dart`, the sheet's evidence column): each file shows "v2 · 20 Oct 2026 · <name>" and a `StatusBadge` (Submitted / Accepted / Not accepted). Reviewer actions Accept / Not accepted (note) with keys `ev-accept-<id>`, `ev-reject-<id>`. "Replace" (key `ev-replace-<id>`) uploads a new file as the next version. Older versions under a "Previous versions" expander.
- Files: migration 015, `apply.mjs` (evidence events only), `app.mjs` (evidence payload, issuance warning, export naming), `apps/server/src/export/**`, `apps/mobile/lib/screens/evidence_capture.dart`, `sheet_view.dart` evidence column only, `item_screen.dart` evidence list only, `apps/mobile/lib/sync/api_client.dart` (additive), `models/` evidence model, tests. Not `job_screen.dart`.

## Package B — roles, peer review, conditions outstanding (Q5, Q6, Q7)

Migration **`016_roles_review_conditions.sql`** (additive):
- Roles: add `peer_reviewer` to `app_user_role_check`. `app_user.can_administer boolean NOT NULL DEFAULT false` (manage people; for the reviewer with admin and oversight). `app_user.is_certificate_holder boolean NOT NULL DEFAULT false`; set true for the user whose `authorisation_number = 'TST100250'` if exactly one exists (idempotent).
- `certificate.issued_by bigint REFERENCES app_user(id)` — who pressed Issue. `certificate.certifier_id` becomes the certificate holder (Bryan, TST100250), so every certificate is in Bryan's name; the event log and `issued_by` record who actually issued it.
- `job.peer_review_required boolean NOT NULL DEFAULT false` — existing stationary container system on a reg 17.91 report.
- `peer_review` (id, job_id, reviewer_id, decision `approved|changes_requested`, comment, snapshot_hash char(64), decided_at). `peer_review_comment` (id, job_id, author_id, finding_id nullable, body, created_at).
- `certificate_condition` (id, certificate_id, ordinal, text, regulation, due_date, verified_by, verified_at, verification_note). Rows created on a conditional issue from `conditions[]` (or, if none, from `requirements_not_met`), due date = `conditions_due`.

Rules:
- Roles (`roles.mjs`): certifier (2 people may hold it; both issue), reviewer, viewer, admin, **peer_reviewer**. A peer reviewer can only read jobs with `peer_review_required`, read their sheets, evidence and PDF, and send `peer_review.comment` and `peer_review.decide`; every other event and the board's other jobs are refused/hidden (clause `Role`). People management needs `canDecide` or `can_administer`.
- Second issuer: the issue route sets `certifier_id` = the certificate holder and `issued_by` = the signed-in certifier. The certificate renders the holder's name and authorisation number.
- Peer review gate: when `job.peer_review_required`, issuing is refused (422, clause `reg 17.91 peer review`) unless the latest `peer_review` is `approved` and its `snapshot_hash` equals the job's current snapshot hash (sha256 over findings: item, status, comment, general comment, reasons; and current evidence: sha256, review_state). An edit after approval lapses it (hash differs); the issuance check lists "Peer review: not approved / lapsed".
- Conditions outstanding (Q7): after a conditional issue, `job.transition` to `monitoring` or `closed` is refused (clause `reg 6.24`) while any `certificate_condition` is unverified. `condition.verify {conditionId, note}` is certifier-only. Dashboard reminders: conditions due within 14 days, overdue.
- New job: checkbox "Existing stationary container system — 17.91 report (needs peer review)" (key `nj-peer-review`), sends `peerReviewRequired`. A certifier can change it with event `job.peer_review_required {jobId, required}`.

App:
- Job screen: a "Peer review" card (Overview tab) for flagged jobs: state (Not requested / Approved by X on date / Changes requested / Lapsed), the comment thread, and for a peer reviewer the Approve / Request changes buttons (keys `pr-approve`, `pr-changes`, `pr-comment`). A "Conditions" card after a conditional issue: each condition with due date, Overdue badge, Verify (key `cond-verify-<id>`) for a certifier.
- Peer reviewer's board: only flagged jobs; sheet read-only (AnswerControl disabled as for viewer) with a comment action per item.
- People screen: role list gains Peer reviewer; a "Can manage people" switch; "Certificate holder" shown as a badge.
- Files: migration 016, `roles.mjs`, `apply.mjs` (new events only), `app.mjs` (issue route, job list filter, job payload fields `peerReviewRequired, peerReviews, peerReviewComments, peerReviewState, conditions`, dashboard reminders, people routes), `job_screen.dart`, `people_screen.dart`, `jobs_board.dart` (New job checkbox only), `models/job.dart`, `auth/session.dart` (role), `api_client.dart` (additive), tests.

## Shared files

`apply.mjs`, `app.mjs`, `api_client.dart`, `fake_server.dart`, `jobs_board.dart` are touched by more than one package: add new functions and blocks, do not reorder or reformat existing code, so the lead's merge stays clean. Migration numbers are fixed above.
