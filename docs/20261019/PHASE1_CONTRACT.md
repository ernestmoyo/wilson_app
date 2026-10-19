# Phase 1 contract (19 October 2026)

How the phase 1 pieces fit together, so they can be built in parallel. It covers the
schema, the files each piece owns, and the interfaces between them. Background is in
`CHANGE_GRAPH.md` §4–§6.

## Schema (done: migration 013)

| Object | Change |
|---|---|
| `finding.general_comment` | Blue "General comment": an observation on an item that is otherwise decided |
| `finding.na_reason` | Optional; kept only when status = `not_applicable` |
| `job.scope_choices text[]` | The choice keys picked at job start. NULL means the whole set (every older job) |
| `inspection_section_excluded` | (inspection_id, section_id, reason `not_chosen` / `not_in_scope`) |
| `evidence.original_name` | The file name a document arrived with |
| view `inspection_item_in_scope` | The items an inspection must answer: pinned templates minus excluded sections |
| `assert_can_issue_certificate` | Also refuses while an in-scope item has no finding (F8) |

`finding.upsert` payload gains `generalComment` and `naReason` (done).

## A. Checksheets (owner: checksheets work package)

Owns `packages/checksheets/**`, including the generated outputs. It changes nothing in
`apps/`.

- **`data/authorisation.json`:** add the Appendix A location and SCS entries:

  | Key | Scope | Regulation |
  |---|---|---|
  | `location-2-1-1` | 2,000 kg | r10.34 |
  | `location-2-1-2` | 100,000 L water capacity | r10.34 |
  | `location-3-1` | 10,000 L; use 450 L | r10.34 |
  | `location-4-1-1` | 2,000 kg or L | r10.36 |
  | `location-5-1-1` | packages 30,000 kg/L; stationary 30,000 L | r12.17 |
  | `scs-existing-tanks` | 60,000 L per tank | 17.91(2), (2)(b)(iii) |
  | `scs-dispensers` | | 17.91(2)(m) |
  | `scs-process-containers` | | 17.91(2)(e) |

  Each entry gets a machine-readable `limits` object, for example `{ "maxKg": 2000 }`, `{ "maxWaterCapacityL": 100000 }`, `{ "maxL": 10000, "maxUseL": 450 }` or `{ "maxPerTankL": 60000 }`. The `exclusions` (C8) go in as text on the SCS entries.

- **`data/sheet-sets.json`:** a set may have `choices`:
  ```json
  "choices": [
    { "key": "3_1_cabinet", "label": "Class 3.1: packages in one or more cabinets",
      "authorisation": "location-3-1",
      "sections": [{ "template": "wks17-class-2-and-3-1-substances", "ordinals": [12] }] }
  ]
  ```
  - A section listed under any choice appears only when that choice is picked.
  - A section listed under no choice always appears.
  - `notInScope: [{ "template": "...", "ordinals": [..], "why": "..." }]` lists sections that are never assessed (C8 exclusions).
  - A set is authorised when its `authorisation` is non-null, or when every choice has one.
- **`class_2_3`:** gets choices for:
  - 2.1.1 gases
  - 2.1.2 aerosols
  - the 3.1 arrangements present in the template: cabinet; building types A–D / separate building or external area; store in a building; retail (11.32/11.33); workroom / paint mixing room; use. The two sheets still to come (3.1 in SCS, use ≤ 450 L) are added when they arrive.
- **New templates:**
  - The class 5.1.1/5.1.2 sheet, as set `class_5_1` with authorisation `location-5-1-1`.
  - The revised class 3.1 sheet (regulation corrections, F5), as revision n+1 of the existing codes, never an edit in place.
  - The 2.1.1 workbook class tab, which is the same template as `wks17-class-2-and-3-1-substances`. Diff the two; it becomes a new revision only if the text differs.
- **B5:** each template's scope-of-authorisation text names its own class and regulation, applied as a recorded `correction`.
- **Extractor:** per-run font colour (red = non-compliant / finding, green = compliant or correction, blue = general comment). Mixed-colour cells are kept as runs, and instance JSON carries `generalComment`. Existing instance outputs must not change unless they were wrong.
- **SAT 201** (stretch goal): extract it as a template with its tank identity block and Yes/No site-plan tab. The design, construction, fabricator and repair rows go into `notInScope`.
- **Generated outputs:** `npm run gen` and `npm run verify` stay green.
- **Generated Dart:** if it lists sets, the choices must appear there too, so the app can show them.

## B. Evidence: PDFs and large files (owner: evidence work package)

Owns:
- the evidence section of `apps/server/src/app.mjs` (storage helpers and the `/api/evidence/*` routes)
- `apps/mobile/lib/screens/evidence_capture.dart`
- the evidence parts of `apps/mobile/lib/sync/api_client.dart`
- a new `apps/server/test/evidence.test.mjs`
- Flutter tests for the picker flow

**Routes:**

| Route | Request | Response / behaviour |
|---|---|---|
| `POST /api/evidence/upload-url` | `{ sha256, mime, bytes, name }` | Blob or Spaces: `{ mode: 'direct', method: 'PUT', url, headers, storageKey }`. Disk: `{ mode: 'server', url: '/api/evidence/upload' }` |
| `POST /api/evidence/confirm` | `{ sha256, storageKey, mime, bytes }` | Reads the stored object back and checks its SHA-256. On a mismatch it deletes the object and returns 409 (IPS 21(4)). On success, 201 with the same shape as `/upload` |
| `GET /api/evidence/:key/link` | | `{ url, expiresAt }`: a presigned GET (Blob `presignUrl`, Spaces `getSignedUrl`), or `/api/evidence/:key` on disk |
| `/api/evidence/upload` (existing) | | Unchanged for small files. Limit 4 MB on Vercel, 50 MB elsewhere |

- **Allowed MIME types:** `image/jpeg`, `image/png`, `application/pdf`. Anything else gets 415.
- **Maximum size:** 50 MB, refused with 413.
- **Roles:** a viewer may read but never upload.
- **`evidence.attach`:** PDFs use `kind: 'document'` and `originalName` (stored in `evidence.original_name`). Documents are exempt from the photo provenance check. The schema already allows this.
- **App:**
  - "Attach PDF" sits beside the camera and gallery, using `file_picker` on web and iPad.
  - The app hashes the file, asks for an upload URL, PUTs the file directly or POSTs it, then confirms and attaches.
  - The evidence list shows the file name.
  - A document opens through `/link`.
- **Waiting on Q3/Q4:** "accepted" and "version". Store nothing for them yet; every upload is kept and nothing is overwritten.

## C. Exports: checksheet PDF and ZIP (owner: export work package)

Owns:
- the new `apps/server/src/export/**`
- the export routes added to `app.mjs`, in their own block after the non-compliance report
- the download buttons in `apps/mobile/lib/screens/job_screen.dart`
- a new `apps/server/test/export.test.mjs`

**`GET /api/jobs/:id/checksheet.pdf`** is a server-side PDF (pdfkit) of the completed checksheet. It follows the workbooks:
- letterhead and title
- header block: client, site, location, substance, date, certifier
- per template, per section, a row per item: item / regulation / action / records / comment / evidence. Results are coloured:
  - compliant comment in green
  - non-compliance in red, with its reason
  - general comment in blue
  - N/A shown with its reason, if one was given
- excluded sections omitted (`not_in_scope` listed once as "Not in scope")
- declaration, decision, document control, scope of authorisation
- signature block: name, occupation, authorisation number TST100250, and the date signed (`inspection.sign`). A signature image is printed only if one is configured (`SIGNATURE_IMAGE_PATH`, or a stored evidence key). **No signature image is committed to the repo.**

**`POST /api/jobs/:id/bundle`** builds a ZIP containing:
- `01 Checksheet.pdf`
- the certificate as print-ready HTML (if issued)
- the non-compliance report HTML
- the job's evidence, named `Appendix <n> - <original name>` when `appendix_category` is set, otherwise `Item <section>.<item> - <n>.<ext>`

How the ZIP is delivered:
- With Blob or Spaces, it is stored under `exports/` and the route returns `{ url, bytes, files }`, where `url` is a presigned GET.
- On disk, the ZIP streams straight back.
- Any signed-in role may download.
- Certificate as PDF waits on Q6 (sending). The ZIP holds the HTML until then.

## D. Mine (main thread)

**Scope choices:**
- `POST /api/jobs` takes `scopeChoices`, validated against the set and stored in `job.scope_choices`.
- `inspection.open` writes `inspection_section_excluded`.
- `GET /api/jobs/:id` exposes `scopeChoices` and `excludedSections`.
- In the app, the New job form shows the choices, and the checksheet hides excluded sections.

**Finding fields:** general comment and N/A reason, in the API and the item editor.

**F9:** certificate issue and send are recorded as audited server events (`sync_event`, by person); the stage transition actor is filled; the activity strip shows them.

**Integration:** merging the three packages, the full suites, a web build, a browser walk.
