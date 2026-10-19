# End-to-end replay of past jobs (19–20 October 2026)

**Where:** local server only (`apps/server`, PGlite in-process, `AUTH_REQUIRED=1`, evidence on disk in a temp folder, no SMTP). Live site and Neon were not contacted and `.env.local` was not loaded. Nothing was committed, pushed or deployed.
**How:** `apps/server/scripts/e2e-replay.mjs`. It signs in as the certifier and sends every change through `POST /api/sync` or the REST routes the app uses. It downloads `checksheet.pdf`, `bundle.zip`, `certificate.html` and `non-compliance.html`, then pulls the PDF text twice: with `pdftotext -raw`, and by decoding pdfkit's content streams with their fill colours. Both are compared with the instance JSON and with the source workbook cells (Action, Records, Regulation, read by row with exceljs).
**Sources:** G2 Chiller workbook (class 6/8; the original xlsx sits outside this repo in `wilson_checksheet/class_6_n_8/`), its Certificate tab (`data/certificates/g2-chiller/certificate.json`) and its evidence images. Abecca class 2/3.1 workbook with Tatenda's feedback (`client-cases/abecca/`). `docs/20261019/Argenta Class 2 and 3 … .xlsx` holds a **class 3.2/4** sheet, which the app has no template for, so it was not replayed.

**Totals:** three runs of 103 calls each, **0 server errors (no 500s)**. Final run: 791 checks passed, 25 failed. Of the 25, 12 are deliberate template corrections, 3 come from the extraction tool (it drops the curly apostrophe), and 10 are real (decision wording, missing site-block rows, post-nominals). The colour checks and the rendered certificate and report turned up more defects, all listed below.

---

## Job 1: G2 Chiller, class 6/8, refused (the checksheet's Decision row)

**Steps run:**
1. `POST /api/jobs` with client, site, location and summary, the site manager as a contact, and 4 substances from the Certificate tab.
2. Enquiry → application → document review → RFI → document review → site inspection, with 4 communications.
3. `inspection.open` on both sheets.
4. 54 findings (36 + 18).
5. 5 evidence files: 4 workbook images, `provenance: migrated`, attached by anchor row, plus 1 PDF filed as Appendix 5.
6. Declaration and scope signed; interests declared.
7. Compliance evaluation → final validation.
8. Issue refused with the workbook's 2 reasons.
9. Download the exports; send the NC report and the certificate (no SMTP).

**Result: PASS on the flow, with 1 forced deviation.**
- Class 6/8 item **6/2** (row 36, class 8 cabinet) is **blank** in the workbook. The issuance dry-run and the refusal both returned **422 `reg 13.39: 1 check sheet item(s) … not yet assessed`**. A refusal cannot issue until every item is answered. The replay set 6/2 to N/A with a reason, after which the refusal issued: retention `refusal_plus_5y`, 2031-06-20.
- **PDF vs workbook:**
  - All 54 items are present.
  - Every Action and Records cell matches verbatim, and so does every Regulation cell except the three deliberate corrections (see "Wording differences").
  - All 4 non-compliances (general 4/4, 4/5, 6/10, 6/12) print in red.
  - The declaration matches verbatim (cites 13.38), including "Site Assessor confirmation (Digital signature) IPS Clause 21(5)".
  - The NB note, the Reference, Document Control (BW / Current / 1 / 2025-04-25 / less than 12 months), the scope text and its confirmation are all present.
  - Both decision lines are present.
- **ZIP:** 8 entries (checksheet PDF, certificate, NC report, 4 images, Appendix 5 PDF).

## Job 2: G2 Chiller, class 6/8, granted after corrective actions (the Certificate tab)

**Steps run:**
1. Same as job 1 up to the findings, with 6/2 entered as N/A.
2. 4 corrective actions raised (one per non-compliance).
3. Compliance evaluation → **gap closure** → each action resolved, then verified by the certifier → compliance evaluation → final validation.
4. Issuance check: `canGrant: true`.
5. Issue granted with the Certificate tab's numbers and dates.

**Result: PASS.**
- The workbook's certificate number **LC/26-250-004** on its own was refused: **422 `IPS 8(1)(c)(ii)`**, because it is not prefixed with TST100250. It was accepted once the WorkSafe register number CER-0250-166217 was supplied. The guard works; Bryan's own numbering does not carry the prefix (see question 5).
- Retention: 2034-07-04, which matches the workbook.
- The certificate HTML carries all 4 substances, the company number, the details text and the issuer statement. It is missing the post-nominals "CPENg NZ" (D8).

## Job 3: Abecca, class 2/3.1 (Type B store), conditional, with feedback

**Steps run:**
1. `POST /api/jobs` with no scope choice: **400** (correct).
2. `POST /api/jobs` with scope `3_1_separate_building` + `3_1_workroom`. These are the arrangements whose sections the workbook actually filled (13, 14, 19, 20).
3. Same walk to inspection; inspection date 2026-01-15.
4. 79 workbook rows sent.
5. 2 evidence files (PDF to general 6/2, PNG to class 13/1).
6. Signed and declared.
7. **17 corrective actions** raised and left open.
8. Final validation; issued **conditional** with the workbook's 2 conditions.

**Result: PASS on the flow, with scope mismatches.**
- **29 of 43 class-sheet rows were rejected.** These are sections 4–9, 12, 15, 16, 22 and 23 (2.1.1, aerosols, cabinet, stores in buildings, retail, LPG). In the workbook they are all "Not Applicable" rows. The app does not assess them and leaves those sections out of the PDF entirely, while the workbook prints all 23 sections. The rejection reason is clear, but **its clause is null** (D9).
- In scope: 36 general items + 14 class items = **50**. All are present, with Action and Records verbatim.
- Mixed colour runs were split as follows: blue → general comment, red → failure reason, black, green and purple → comment.
  - Blue prints in blue (general 3/1, 6/6).
  - All 17 non-compliances print in red.
- The declaration prints **Regulation 10.34**, where the Abecca workbook says **17.91**. This is deliberate (r10.34 template, revision 2).
- The scope text now says "classes 2 or 3.1 … Regulation 10.34". The workbook carried the class 6/8 text by mistake.
- Section 10 (transfer points) and section 11 (no items) always print; that is still an open question for Bryan.
- **ZIP:** 5 entries.

---

## Defects, ranked

| # | Severity | What | Where |
|---|---|---|---|
| D1 | **Critical** | A **refused** job renders `certificate.html` as "COMPLIANCE CERTIFICATE Location … This certificate certifies that the requirements prescribed in regulation 13.39 … **have been met**", followed by "Requirements Not Met: …" and an in-force date. `POST /api/jobs/:id/send {document:'certificate'}` sends it, and the ZIP includes it as `02 Certificate.html`. A refusal (reg 6.23(2)) should be a refusal notice, not a certificate. The conditional certificate also says "have been met". | `packages/checksheets/lib/render-certificate.mjs:224-229` (fixed wording, decision ignored); `apps/server/src/app.mjs:894` (`...CERTIFICATE_DEFAULTS`); send at `app.mjs:1232` |
| D2 | **High** | Every location certificate uses the class 6/8 wording. The **class 2/3.1** certificate says "regulation 13.38" and "regulation 13.39". | same `CERTIFICATE_DEFAULTS`, `app.mjs:894` (not chosen per `class_key`) |
| D3 | Medium | The jobs board counts items in sections outside the job's scope. The finished Abecca job shows **50/79**, never reaches 100 %, and `nextAction` reports 29 pending. The job screen uses `itemsInScope` (50) correctly. | `apps/server/src/app.mjs:492-496` (`items` lateral ignores `inspection_section_excluded`); shown at `apps/mobile/lib/screens/jobs_board.dart:772`, `models/job.dart:93-103` |
| D4 | Medium | The PDF's Decision wording differs from the workbook. "Compliance certificate refused" vs "Compliance certificate refused to be issued with the following conditions:", and "Compliance certificate issued with conditions" vs "Conditional compliance certificate to be issued with the following conditions:". | `apps/server/src/export/checksheet-pdf.mjs:278-282` (`DECISION_TEXT`), `:510` |
| D5 | Medium | The PDF site block leaves out workbook rows **Business Website**, **Description of Business Type / Industry** and **Status of Inspection**. It prints the Hazardous Substance Location as the location name only, without the address. The app stores website and industry; status has no field (see C5). | `checksheet-pdf.mjs:353-361` |
| D6 | Medium | Every compliant comment prints **green**. The workbook writes compliant comments in black and keeps green for "resolved after feedback" (G2 general 6/11). 28/28 G2 and 23/23 Abecca compliant comments differ in colour, and the PDF cannot show which items were resolved. | `checksheet-pdf.mjs:217-218` |
| D7 | Low–Med | The NC report's "Site visit" date is formatted in the server's time zone. A 15/01/2026 NZ morning inspection shows **14/01/2026** (on Vercel, which runs in UTC, too). The checksheet PDF is correct (it uses Pacific/Auckland). | `packages/checksheets/lib/render-report.mjs:12` (no `timeZone`) |
| D8 | Low | The certificate leaves out the certifier's post-nominals ("CPENg NZ" on the workbook certificate). | `app.mjs:897` (`postNominals: null`) |
| D9 | Low | A finding on an out-of-scope section is rejected with **clause null**, against the convention that rejections carry a clause. | `apps/server/src/sync/apply.mjs:139` |
| D10 | Low | ZIP and PDF evidence names are ambiguous across sheets: general 4/2 and class 6/8 4/2 become "Item 4.2 - 1.png" and "Item 4.2 - 2.png", with nothing to say which sheet each belongs to. | `apps/server/src/export/naming.mjs:55` |
| D11 | Low | No date sanity checks. Certificates dated 2026-06-20 and 2026-07-04 were accepted against inspections opened 2026-10-20, and the date in `inspection.sign` comes from the device (`signedAt`). | `app.mjs:819-870`; `apply.mjs:270` |
| D12 | Low | The NC report prints the reason twice when the comment equals the failure reason (the PDF removes the duplicate; the report does not). | `render-report.mjs:34` |
| D13 | Low | The WorkSafe policy URL in the class 6/8 item 4/1 Regulation cell (`guidanceUrl`) is not printed in the PDF. | `checksheet-pdf.mjs` regulation column |
| D14 | Info | The PDF prints "rev 1" on a fresh database for content the repo marks as revision 2. The revision label depends on the database's seed history, not on the template. | seed by content hash |

## Steps that were awkward or blocked

- **A blank item blocks a refusal** (G2 class 6/8 item 6/2). It is reasonable for a grant (reg 13.39). For a refusal, Bryan should decide whether every item must be answered.
- **Certificate number format:** Bryan's "LC/26-250-004" works only alongside a WorkSafe register number (IPS 8(1)(c)(ii) guard). Correct, but he should know.
- **Conditions are free text**, not linked to findings or corrective actions. The Abecca conditional issued with 17 open non-compliances against 2 conditions. One condition still cites 13.34(5)(b), while the r10.34 sheet now cites 10.26(4)(b).
- **Out-of-scope N/A rows** cannot be recorded, so the PDF is shorter than the workbook (Abecca: 29 rows and 11 sections left out).
- **The G2 workbook has no inspection date**; the app stamps the time the inspection was opened.

## What the app cannot represent

| ID | Workbook | App |
|---|---|---|
| C1 | **Mixed colours inside one comment**: Abecca general 6/12 (red / black / red), 7/2 (purple / black / red / black), 3/1 and 6/6 (blue + red); class 14/1 (green + red) | The comment is split into failure reason (red, printed **first** with a "Non-compliance:" prefix), comment (red for a non-compliance, so black text turns red) and general comment (blue, printed **last**). The original order is lost, and purple is lost. |
| C2 | Green = resolved | Only "compliant" (see D6) |
| C3 | Red "Not Applicable" (Abecca class 20/1, 20/2) | Entered as N/A with a reason; grey in the PDF |
| C4 | G2 general 4/2: **black** text that describes a **non-compliant** sign | Recorded as compliant, printed green. A data question for Bryan. |
| C5 | Status of Inspection "Mock" | `inspection.status` is only `in_progress` / `complete`, and no event sets it |
| C6 | Images anchored outside item rows: the signature at A62/A44 and an image at E47 in the document-control area | Only job-level evidence; the signature image comes only from `SIGNATURE_IMAGE_PATH` |
| C7 | Workbook items on sections outside the chosen scope | Rejected; the sections are left out of the PDF |

## Wording differences that are deliberate (template corrections, not defects)

- General 6/5 `5.7(3)©` → `5.7(3)(c)`.
- General 7/6 `17.102(6))` → `17.102(6)`.
- Class 6/8 4/1: the URL moved out of the Regulation cell into `guidanceUrl`.
- Class 2/3.1 view, r10.34 workbook:
  - general 2/1 `13.34(4)` → `10.34(1)(a)`;
  - general 7/3 and 7/4 `10.30 12.13 12.38 13.30` → `10.34(1)(h)` / `10.30`;
  - class 3/1 `10.6(1)(a))` → `10.6(1)(a)`;
  - declaration 17.91 → 10.34.

## Questions for Bryan from this replay

1. G2 general 4/2 reads "non-compliant sign", but it is not in red. Is it compliant or not?
2. G2 class 6/8 item 6/2 is blank. Should it be N/A?
3. Abecca class 20/1 and 20/2: red "Not Applicable". Are they N/A?
4. Should a refusal be allowed with unanswered items?
5. Will certificates be numbered with the TST100250 prefix, or always carry the WorkSafe register number?
6. Should out-of-scope sections still print as "not applicable", as the workbook does?
