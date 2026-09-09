# Excel ↔ App alignment graph

Goal: the app mirrors `G2 Chiller Class 6 and 8 location checksheets.xlsx` **exactly** — every node the workbook has, the app renders in the same place with the same words. This is the gap graph: one row per workbook node, where it lives in the model, where the app shows it, and status.

Legend: ✅ aligned · 🔧 this pass · ⬜ open · ⚠️ source-workbook defect reproduced as-is and flagged

## Sheet 1 — "Locations General"

| Row | Workbook node | Model | App surface | Status |
|---|---|---|---|---|
| 1 | Title "Check sheet Location Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances" (class-conditional) | `template.sheet.title` / `sheetByClass` | sheet header | 🔧 |
| 1 | Column F "Evidence Portfolio" | — | table column header | 🔧 |
| 2 | Legal Entity Name | `client.legal_name` | site block | 🔧 |
| 3 | Trading as Name | `client.trading_name` | site block | 🔧 |
| 4 | Site / Location Address | `site.address` | site block | 🔧 |
| 5 | Postal Address | `client.postal_address` | site block | 🔧 |
| 6 | Business Phone Number | `client.phone` | site block | 🔧 |
| 7 | Business Website | `client.website` | site block | 🔧 |
| 8 | NZBN | `client.nzbn` | site block | 🔧 |
| 9 | Description of Business Type / Industry | `client.industry` | site block | 🔧 |
| 10 | Manager Name | `contact` (is_site_manager) | site block | 🔧 |
| 11 | Date of Inspection/Site Visit · Status of Inspection | `inspection.inspected_at` · `inspection.status` | site block | 🔧 |
| 12 | Direct Dial Number and/or Mobile Number | `contact.phone` | site block | 🔧 |
| 13 | Hazardous substance name · Hazardous Substance Location | `substance.name[]` · `hs_location.name` + `site.address` | site block | 🔧 |
| 14 | Brief location summary | `hs_location.summary` | site block | 🔧 |
| 15 | Banner "General location requirements specific to Class …" (class-conditional; absent for class 2&3) | `template.sheet.banner` / `sheetByClass` | banner row | 🔧 |
| 16 | Column headers Item · Regulation · Action · Records · Comments | `template.sheet.columnHeaders` | table header | 🔧 |
| 17–60 | 8 sections, 36 items (verbatim) | `checksheet_section` / `checksheet_item` | table rows | ✅ |
| 17–60 | Comments column, red = non-compliant | `finding.comment`, `finding.status` | editable Comments cell, red text | 🔧 inline editing |
| — | Evidence Portfolio per row | `evidence.finding_id` | Evidence column (count / thumbnails) | 🔧 |
| 29 | WorkSafe policy URL in the Regulation cell | `item.guidanceUrl` | link under refs | 🔧 |
| 61 | "NB: Non compliances are in red" | `template.sheet.note` | note row | 🔧 |
| 62 | Declaration (IPS 21(1)(d),(e), 21(4), 23(1)) + "Site Assessor confirmation (Digital signature) IPS Clause 21(5)" (class-conditional: cites 13.38 vs 17.91) | `template.sheet.declaration` · `inspection.declaration_signed_at/by` | declaration + sign control | 🔧 |
| 64 | "Section 1/1" | `template.sheet.footer` | footer | 🔧 ⚠️ source says 1/1 for sheet 1 of 2 |

## Sheet 2 — "Class 6.1A, 6.1B, 6.1C, 8.2A, 8.2B"

| Row | Workbook node | Model | App surface | Status |
|---|---|---|---|---|
| 1–14 | Same site block | as above | site block (shared) | 🔧 |
| 15 | Column headers | `sheet.columnHeaders` | table header | 🔧 |
| 16 | "Requirements specific to class 6.1A, …" — the **unnumbered heading of section 1** (item 1 follows it directly; the sheet numbers sections from 2) | `section[0].title`, `number = null` | section header row, no number | ✅ reproduced as-is |
| 17–42 | 9 sections, 18 items | template | table rows | ✅ (the Reference row was being counted as a 10th section; fixed) |
| 43 | NB | `sheet.note` | note row | 🔧 |
| 44 | Declaration + signature | `sheet.declaration` · `inspection.declaration_signed_at` | declaration + sign | 🔧 |
| 45 | **Decision:** "Compliance certificate refused … 1. … 2. …" | `certificate.decision` + `requirements_not_met` / issuance-check | decision row | 🔧 derived, not typed |
| 46–51 | Document Control: Owner BW · Revision 1 · Status Current · Date of last revision 2025-04-25 · Frequency "less than 12 months" | `sheet.documentControl` | document control block | 🔧 |
| 46–51 | Scope of Authorisation text + "I can confirm that I have checked … Site Assessor confirmation (Digital signature) IPS Clause 21(5)" | `sheet.scopeOfAuthorisation` · `inspection.scope_confirmed_at` | scope block + confirm control | 🔧 ⚠️ Abecca's class 2&3 sheet carries the class 6/8 scope text |
| 53–54 | Reference: PS title | `sheet.reference` (= `psReference`) | reference row | 🔧 |
| 56 | "Section 2/2" | `sheet.footer` | footer | 🔧 |

## Sheet 3 — "Certificate"

Reproduced as HTML from the certificate model (`packages/checksheets/lib/render-certificate.mjs`) and rendered from the job at `GET /api/jobs/:id/certificate.html`. ✅ Not yet linked from the app UI. ⬜

## Layout rule

- **Wide (≥ 900 px, "normal web" / iPad landscape):** render the sheet as a **table with the workbook's columns** — Item · Regulation · Action · Records · Comments · Evidence Portfolio — under the site block and banner, with the trailing blocks below. Comments editable in place; status set from a compact selector in the Item cell.
- **Narrow:** keep the card list, with the site block collapsible above and the trailing blocks below.

Both read the same `Inspection` model; layout never changes what is recorded.
