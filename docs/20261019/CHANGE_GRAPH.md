# Change graph: Assure Safety portal upgrade (scope of work, 19 October 2026)

Source: Tatenda Katai (Assure Safety), email of 19 Oct 2026, "Assure Safety Portal
Scope of Work", with `Scope of Work_Assure Safety Online Work Platform.docx` and five
completed workbooks (this folder). Commercials are between Bryan and Ernest and are not
covered here. Method: graph approach. Status: **steps 1–5 drafted; questions sent;
nothing built.**

Programme in the scope: 14 calendar days from the agreed start date (week 1 configure and
develop, week 2 test, correct and accept). Demonstration, user instructions and written
acceptance by Assure Safety's project lead. Changes to scope, cost or date need written
agreement.

## 1. The asks

| # | Ask (scope wording, short) |
|---|---|
| C1 | Add the checksheets Assure Safety supplies, within the limits of Appendix A |
| C2 | Accept **PDFs and photos** as evidence, **showing the version assessed** |
| C3 | Require **authorised peer sign-off** where applicable. For existing SCS, a 17.91 report may be issued only after an authorised certifier peer-reviews it; **link the approval to the report version reviewed** |
| C4 | Restrict certificate **approval** and **sending** to approved roles, and **record both actions** |
| C5 | **Download** signed checksheets and accepted evidence **as a ZIP** |
| C6 | **Completion checks** (named in the deliverable title; detail not given) |
| C7 | Demonstrate the three deliverables, give user instructions, fix defects before written acceptance |
| C8 | Respect the exclusions: ship-to-tank lines, vapourisers, installations burning 3.1, burners, tank repair/alteration, design certification, fabricator certification, 17.91(2)(b)(i)/(ii) |
| C9 | Certified handlers: class 6 excluding agrichemicals, the listed fumigants and VTAs, life cycles storage/use/transport/disposal; supplied assessment documents on each person's record |
| C10 | Cylinder importation: separate pathways under 15.16 and UNRTDG 15.3(3); add any missing sheets |

**Authorisation (Appendix A):** TST100250, active 9 May 2022 to 9 May 2027.
- **Location limits:**
  - 2.1.1 packages/cylinders ≤ 2,000 kg
  - 2.1.2 aerosols ≤ 100,000 L **water capacity**
  - 3.1 (seven choices; limit 10,000 L, use 450 L)
  - 4.1.1 packaged ≤ 2,000 kg/L (r10.36)
  - 5.1.1 packages ≤ 30,000 kg/L, stationary ≤ 30,000 L (r12.17)
  - 6/8 packages ≤ 5,000 kg/L (r13.38)
- **SCS:** existing above- and below-ground tanks ≤ 60,000 L per tank, dispensers, process containers.

**Owner's answers already given (Ernest, 19 Oct):**
- **A1.** Results follow the workbooks; the portal aligns with what Assure Safety wants.
- **A2.** An N/A reason is offered but optional.
- **A3.** Class 3.1: the certifier picks the choice(s) at the start and only those sections show. There are sheets for 3.1 in SCS and for use up to 450 L (to be supplied).

**Waits on Tatenda** (questions sent, `QUESTIONS_FOR_TATENDA.md`):
- **Q1.** The missing sheets.
- **Q2.** Is the Argenta file the 4.1.1 sheet?
- **Q3.** Who accepts evidence, and is a replaced file kept?
- **Q4.** What "version assessed" means.
- **Q5.** Peer-review rules and how the reviewer takes part.
- **Q6.** Logins, roles and the sender address.
- **Q7.** Extra completion checks.

## 2. Today (what the system does, with evidence)

| Ask | Today | Where |
|---|---|---|
| C1 sheets | One pipeline: workbook → extract → reconcile → JSON → TS/Dart/SQL seed. A changed template becomes revision n+1, and a published template is immutable | `packages/checksheets/README.md`, `tools/extract-workbook.mjs`, `migrations/003…:243-271` |
| C1 sets | `class_6_8` (authorised), `class_2_3` (**authorisation null, cannot open a job**), `handler_6`, `cylinder_fern`, `cylinder_un`. Fumigant and VTA handlers are planned only | `packages/checksheets/data/sheet-sets.json:4-47` |
| C1 choice | One fixed set per `job.class_key`; no per-job scope choices; `POST /api/jobs` refuses unauthorised sets | `apps/server/src/app.mjs:358-362`; `sync/apply.mjs:66-90` |
| C1 answers | `finding`: pending / compliant / non_compliant / not_applicable / conditional, plus one comment. A non-compliance needs a reason. Overwritten in place (history only in `sync_event`) | `migrations/002…:233-258`; `apply.mjs:94-131` |
| C2 upload | Raw POST, **4 MB**, any MIME type, stored by SHA-256 (DO Spaces / Vercel Blob / disk) | `app.mjs:988` |
| C2 app | **Photos only** (`image_picker`, 2048 px). No document picker, although `evidence_kind` has `document` | `apps/mobile/lib/screens/evidence_capture.dart:69`; `002:41` |
| C2 version | Evidence → finding → item → pinned template revision. No document version and no accepted/rejected state | `apply.mjs:134-173`; `revision-pin.test.mjs` |
| C3 | **No peer review** of any kind: no role, table, stage or sign-off. `inspection.sign` records the declaration/scope signatures, which are tied to no version | `roles.mjs:16-25`; `apply.mjs:209-230` |
| C4 approve | `POST /api/jobs/:id/certificate` is certifier-only and refuses `granted` with open non-compliances. It is **REST, not a sync event**: not in `sync_event`, and the stage transition `actor_id` is NULL. `certificate.job_id` UNIQUE (no re-issue) | `app.mjs:584-621`; `002:344` |
| C4 send | `POST /api/jobs/:id/send`: email via SMTP with an **.html** attachment. Logged in `communication`, not in `sync_event`; no record of which version was sent | `app.mjs:917-945`; `mail.mjs` |
| C5 | Only `certificate.html` and `non-compliance.html` (print CSS). **No PDF, full checksheet report or ZIP** | `app.mjs:709, 910` |
| C6 | `issuance-check` covers the interest declaration, a reason on each non-compliance, no `pending` findings, and open non-compliances. It **misses items with no finding row at all** and checks no signatures, required evidence or review | `app.mjs:555-581`; `003:53-123` |
| Platform | A Vercel function request body is limited to **4.5 MB**, so large PDFs cannot pass through the server | Vercel limits |

## 3. Found while reading (nobody asked)

- **F1. The workbooks carry results in font colour, mixed inside one cell.** There are no comments, dropdowns or formulas. Red marks a finding; green marks compliant or a correction; blue marks a "General comment". The extractor reads one colour per cell, so it is unsafe for these files.
- **F2. Every location sheet's scope text says "classes 6 or 8 … r13.38"** whatever class is assessed. This is copy-paste in the template.
- **F3. The Argenta "Class 2 and 3" file assesses a 4.1.1 substance** on a tab named "Class 3.2 and 4", while its title says "3.4 and 4" (Q2).
- **F4. SAT 201 covers design, construction, fabricator and repair**, which C8 excludes. Its layout (Reg / Requirement / SWI / Comments; tank identity block; Yes/No site-plan tab) is new to the extractor.
- **F5. The Class 3.1 workbook is the Abecca workbook already extracted, revised.** It has regulation corrections (13.34(4)→10.34(1)(a), 13.3→10.34(1)(h), 13.34(5)(b)→10.26(4)(b), 17.91→10.34), so the existing template becomes revision n+1.
- **F6. The 2.1.1 class tab is the same template as `wks17-class-2-and-3-1-substances`**, but `class_2_3` has no authorisation. Appendix A now supplies the authorisation.
- **F7. The Class 5 sample has a certificate tab numbered TST100040-…** (not TST100250) with conflicting dates. These look like mock leftovers, not fields to model.
- **F8. The issuance check passes a job with unanswered items** that have no finding row (§2 C6). This is a real defect regardless of the scope.
- **F9. Certificate issue and send are not in the audit trail** (`sync_event`), and the stage transition has no actor. C4's "record both actions" is not met today.
- **F10. The hash-chained `event` table exists but nothing writes to it.**

## 4. The graph

| Ask | Change | Size | Waits on |
|---|---|---|---|
| C1 | Extract 2.1.1, 3.1 (rev), 5.1.1/5.1.2 with per-run colour parsing. Add authorisation entries from Appendix A (`class_2_3` split into 2.1.1 / 3.1; new 5.1, 4.1.1, SCS sets). Record capacity/quantity per job against the limits | M | Q1, Q2 for 4.1.1 / 2.1.2 / SCS sheets |
| C1 / A3 | **Scope choices per job**: the 3.1 choices (and SCS: existing AG/BG tank, dispenser, process container) chosen at job start; only the chosen sections are pinned and shown | M | sheets for 3.1-SCS and use ≤ 450 L |
| C1 / A1 | Result + comment + **general comment** (blue) per item. Printed output coloured as in the workbooks. Optional N/A reason (A2) | S | — |
| C2 | Document picker (PDF) and photos. **Direct-to-storage upload** for large files (Blob client upload / Spaces presigned), the server records the hash. Evidence keeps uploader, time and file hash; replacement adds a new row | M | Q3, Q4 for "accepted" and "version" |
| C3 | `review` record: reviewer, decision, comment, **report snapshot hash** reviewed. Edits after approval lapse it. Issue is blocked where review is required and missing | M | Q5 |
| C4 | Certificate approve and send become sync events (in `sync_event`, with the person). Stage transition actor filled. Send attaches a **PDF**. Role rules from Q6 | S–M | Q6 |
| C5 | Server-side PDF of the completed checksheet (signed: name, date, authorisation number, signature image) plus certificate, NC report and accepted evidence → **ZIP**, files named by appendix | M | — (contents fixed by the scope) |
| C6 | Issuance check also counts unanswered items (F8), required evidence, and review where applicable; more from Q7 | S | Q7 |
| C9 / C10 | Handler fumigants/VTA sets and the life cycles; cylinder sheets already exist, so add only what is missing | S | supplied documents |

```mermaid
graph LR
  WB[Supplied workbooks] --> EX[extractor: per-run colour, SCS layout]
  EX --> TPL[checksheet_template rev n+1 / new sets]
  AUTH[Appendix A authorisation] --> SETS[sheet-sets.json: 2.1.1, 3.1, 4.1.1, 5.1, SCS]
  SETS --> JOB[New job: class + scope choices + capacity]
  JOB --> PIN[inspection_template: only chosen sections]
  PIN --> FIND[finding: result, comment, general comment, N/A reason]
  EV[evidence: photo + PDF, direct upload, hash, uploader] --> FIND
  FIND --> SNAP[report snapshot hash]
  SNAP --> REV[peer review: reviewer, decision, hash]
  REV -.Q5.-> ISS
  FIND --> ISS[issuance check: all items answered, evidence, review]
  ISS --> CERT[certificate approve: sync event, role]
  CERT --> SEND[send PDF: sync event, role]
  CERT --> ZIP[ZIP: signed checksheet PDF, certificate, NC report, evidence]
  EV --> ZIP
  Q3((Q3/Q4 accepted, version)) -.-> EV
  Q6((Q6 roles, sender)) -.-> CERT
```

Readers to keep in step when `finding` / `evidence` / sets change:
- Server: `/api/jobs`, `/api/jobs/:id`, dashboard reminders, issuance check, `certificate.html`, `non-compliance.html`, `/send`, `/api/jobs/import`.
- App: the job hub, the checksheet screen, the evidence capture screen.
- Tests: `fake_server.dart`, the revision-pin tests.

## 5. Decisions (each reversible)

- **B1. Results follow the workbooks (A1).** Each item stores a result (compliant / non-compliant / N/A) and a comment, plus a separate general comment. The printed checksheet uses the workbook colours (green compliant, red finding, blue general comment).
  - **Why:** the owner's instruction. An explicit result is what the issuance check needs.
  - **Reverse:** drop the general-comment column; the colours live only in the renderer.
- **B2. The N/A reason is optional (A2):** a field, never a blocker.
- **B3. Class 3.1 (and SCS) choices are picked at job start (A3).** Only those sections are pinned. Sections not chosen do not appear and do not count as unanswered.
  - **Reverse:** pin the whole set again.
- **B4. Excluded work (C8) shows as "not in scope"** where a supplied sheet contains it (SAT 201 design/construction/fabricator/repair). It never counts toward a certificate and cannot be chosen.
- **B5. The scope text prints the regulation of the class assessed** (10.34, 10.36, 12.17, 13.38, 17.91), not "6 or 8 / 13.38" (F2).
- **B6. Aerosol water capacity is a job detail** (beside quantity), checked against the 100,000 L limit.
- **B7. Large files upload straight to storage.** The server records the hash and metadata, not the bytes, so PDFs are not limited to 4.5 MB.
- **B8. Peer approval is tied to a hash of the report as reviewed.** Any later change to findings or evidence lapses it (scope: "link that approval to the report version reviewed").
- **B9. Certificate approve and send become audited sync events** (F9), each recording the person and the certificate version sent.
- **B10. The ZIP holds** the signed checksheet PDF, certificate, NC report and accepted evidence, named by appendix as in the workbooks. "Signed" means name, date, authorisation number and the signature image.
- **B11. The WorkSafe notification stays manual** (not in scope).
- **B12. F8 (unanswered items pass the issuance check) is fixed in phase 1** as a defect.
- **B13. Mock leftovers are not modelled** (F7, "XX/XX/202X", "xxxxxxx", copy-pasted phone numbers).

## 6. Phases

- **Phase 1: safe now, no answers needed.**
  - PDF evidence and direct upload (B7). Evidence history kept; the acceptance state waits on Q3.
  - Per-run colour extractor (F1).
  - Extract 2.1.1, 3.1 rev, 5.1.1/5.1.2.
  - Sets and authorisation from Appendix A.
  - General comment and optional N/A reason.
  - 3.1 scope choices for the sheets in hand.
  - Issuance check fix (F8).
  - Approve/send as audited events (F9).
  - Checksheet PDF and ZIP.
  - Scope text per class (B5).
- **Phase 2: on Tatenda's answers.**
  - 4.1.1 (Q2), 2.1.2, SCS existing tanks / dispensers / process containers, 3.1-SCS and use ≤ 450 L (Q1).
  - Evidence acceptance and version (Q3, Q4).
  - Peer review (Q5).
  - Roles and sender (Q6).
  - Extra completion checks (Q7).
- **Phase 3:** demonstration, user instructions, defect fixes, written acceptance.

The 14 days start on the agreed date. Phase 2 depends on the sheets arriving in week 1. If they don't, the date moves by written agreement (as the scope says).

## 7. Built

Nothing yet.

## 8. Proof

Not started. Tests first, per phase; the full server and Flutter suites run before any deploy.

## 9. Open

- Q1–Q7 (sent to Tatenda on 19 Oct).
- Earlier open items for Bryan:
  - archive the demo clients on live
  - Argenta job 20 vs job 1
  - legal vs trading name
  - archive blocking writes (B8 of 16 Oct)
