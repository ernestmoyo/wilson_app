# @wilson/checksheets

Canonical, versioned WKS-17 location compliance check sheet templates.

**This package is the single source of truth.** TypeScript types (web + api), Dart models (Flutter), Postgres template seeds, and PDF/XLSX exports are all *generated* from `data/*.template.json`. None of those outputs is ever hand-edited — a Performance Standard revision is a data change plus a regenerate, not four parallel edits in four languages.

That constraint exists because the check sheet's own document control block reads **"Frequency of revision: less than 12 months"**, and the platform now spans two languages (TypeScript and Dart). Hand-maintaining both guarantees drift.

## Layout

```
schema/checksheet.schema.json     JSON Schema for a template
tools/extract-workbook.mjs        workbook → canonical JSON (migration + re-verification)
data/*.template.json              the templates — reviewed, versioned, immutable once current
data/*--*.instance.json           per-workbook findings, kept for migration and cross-checking
```

## Pipeline

```
  workbook.xlsx
       │  npm run extract          separate template / instance / presentation
       ▼
  data/*.template.json  ─┐
                         │  npm run reconcile    merge independent extractions of the
  data/*.template.json  ─┘                       same sheet; assert the text agrees
       │
       ▼
  data/wks17-general.template.json   ← canonical, reviewed, version-controlled
       │  npm run gen
       ├─► generated/checksheets.ts       TypeScript  (web + api)
       ├─► generated/checksheets.g.dart   Dart        (Flutter)
       └─► generated/seed-templates.sql   Postgres DDL + idempotent seed
       │  npm run verify
       ▼
  round-trip proof that all three match the JSON
```

```bash
npm run extract -- "<workbook>.xlsx" --code wks17 --out data
npm run reconcile -- --out data/wks17-general.template.json \
  --input <a>.template.json:class_6_8 --input <b>.template.json:class_2_3
npm run gen
npm run verify
```

`generated/` **is committed.** Flutter and SQL consumers must not need a Node toolchain to build, and having the diff visible in review is how a Performance Standard revision gets read by a human before it reaches an inspector's iPad.

### Verification status

| Output | Check | Result |
|---|---|---|
| `checksheets.ts` | `tsc --noEmit --strict` | compiles clean |
| `checksheets.g.dart` | `dart analyze` | *No issues found* |
| `checksheets.g.dart` | `dart run` — loads and resolves class overlays | 149 items, overlays correct |
| all three | round-trip vs canonical JSON | 195 strings, 149 items, all match |

The round-trip check exists because the PS text is full of apostrophes (`worker's`), curly quotes, em dashes and `$`. Mis-escaping those either fails to compile or — far worse — compiles into subtly wrong regulatory text that gets shown to an inspector. `npm run verify` re-escapes every string independently and asserts it appears in each output.

## What the extractor recovers that the workbook hides

The workbook conflates three layers in one grid — template, instance, and presentation. The extractor separates them, and in doing so recovers one field that exists **only as styling**:

> **Compliance status is encoded as font colour in the Comments column.**
> `FFFF0000` red = non-compliant · `FF00B050` green = resolved on re-verification · default = compliant/N-A.

There is no status column anywhere in the workbook. IPS cl. 21(1)(c) requires *"the result of any inquiry, inspection, assessment, or examination"* to be recorded — and a font colour is unqueryable, uncountable, unvalidatable, and silently destroyed by a copy-paste or a theme change. The extractor lifts it into an explicit `status` field once, on import; nothing downstream ever reads colour again.

Each finding records `statusSource` (`font:FFFF0000` vs `inferred:text`) so a human can review anything that was guessed rather than read.

## Verified findings

**The general sheet is stable Performance Standard content.** Extracted independently from two unrelated client workbooks (G2 Chiller / Argenta, class 6 & 8; Abecca, class 2 & 3.1):

- 8 sections, identical titles, identical order
- 36 items, **36/36 with byte-identical action and records text**
- only **2 of 36** differ, and only in regulation references

| Item | Class 6 & 8 | Class 2 & 3.1 |
|---|---|---|
| 1 — determining which regulations apply | `10.34 10.36 12.17 12.42 13.38` | `10.34` |
| 30 — secondary containment | `10.31 10.32 10.33 12.14 12.15 12.16 12.39 12.40 12.41 13.31 13.32 13.33 17.100 17.101` | `10.31 10.32 10.33` |

So the model is **one general template with two class-conditional regulation fields**, not a separate general template per class family. Re-running the extraction on any new workbook and diffing against `data/` is the regression test for a PS revision.

**Text normalisation matters.** The same PS sentence is hard-wrapped differently in each workbook (`"the maximum quantities\nof the hazardous\nsubstances"` vs `"the maximum quantities of the hazardous substances"`). Those newlines are Excel's manual wrapping, not content — the `(a)`/`(b)` markers carry the structure. All whitespace is collapsed to single spaces, which is what makes the same clause extract identically everywhere and lets genuine drift stand out.

## Known gaps in the source workbooks

- **Items in the ERP section carry no item number** (column A is empty for rows 39–50 of the general sheet). Extracted faithfully as `number: null`; needs numbering before these become the system of record.
- The `Certificate` sheet has no Item/Regulation/Action header and is skipped by the extractor. It is a document layout, not a check sheet, and is modelled separately as `Certificate` in `docs/GRAPH.md`.
- `regulationRefs` is a **lossy** parse of free text. `regulationRaw` always retains the cell verbatim; treat the parse as an index, never as the authority.

## Certificate and evidence

The `Certificate` sheet is a document layout, not a check sheet, so it has its own reader and model (`schema/certificate.schema.json`).

```bash
npm run extract:cert -- "<workbook>.xlsx" --out data/certificates/<job>
npm run render:cert  -- data/certificates/<job>
```

The extractor locates fields by **label**, never by row number — the layout is hand-maintained in Excel, and "the certifier's name is B25" produces a wrong certificate the first time someone inserts a row. It then validates against every field IPS cl. 8(1) makes mandatory and reports what is missing.

For the G2 Chiller certificate that validation returns **0 errors and 1 warning**:

> `IPS 8(1)(c)(ii)`: certificate number `LC/26-250-004` is not prefixed with the authorisation number `TST100250`. Compliant **only** if it is the unique register number under 8(1)(c)(i) — confirm which it is.

Retention is computed, not remembered: expiry `2029-07-04` + 5 years = **retain until 2034-07-04** (IPS 21(6)). That date is what drives object-lock retention on every piece of evidence for the job.

### Evidence — three storage mechanisms, not one

```bash
npm run extract:evidence -- "<workbook>.xlsx" --out data/evidence/<job>
```

A workbook stores images three different ways, and a tool that knows only the common one **silently loses evidence**:

| Mechanism | Where | In G2 Chiller |
|---|---|---|
| DrawingML anchors | `xl/drawings/drawingN.xml` | 6 refs — what most libraries return |
| **Rich values ("Place in Cell")** | `xl/richData/` + the cell's `vm=` attribute | **2 images, 3.3 MB — the majority of the real evidence** |
| Legacy VML | `xl/drawings/vmlDrawingN.vml` | 3 images — Assure Safety letterhead, not records |

The rich-value images sit in cells `F29`/`F30` of the class 6 & 8 sheet — the Evidence Portfolio column, against the reg 13.35(1) store items. They surface through an ordinary reader as `#VALUE!` and are otherwise invisible. Resolving them takes the full chain: `vm=` → `metadata.xml` valueMetadata → `rvb i=` → `richValueRel.xml` → media.

All 9 unique objects, 4.75 MB, are recovered — matching the workbook exactly.

Images are **content-addressed** (stored under their own SHA-256), which collapsed 2 duplicate references automatically: Bryan's signature appears on both declarations and the certificate, and is one stored object with three references.

### The provenance gap

**8 of 8 evidence images carry no photographer, occupation, date or place.**

IPS cl. 21(4) requires all four for any photograph used as a record. None of it travels with an embedded workbook image, so the manifest states `null` — genuinely unknown, never "not applicable" — and each entry carries a migration note. These cannot be relied on as records until the certifier back-fills them. Going forward those fields are captured at the shutter and signed into a C2PA manifest, which is why capture has to happen in the app rather than in the camera roll.
