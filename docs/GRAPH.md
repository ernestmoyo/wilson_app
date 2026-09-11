# Domain Graph — Assure Safety Compliance Platform

**Status:** design, revision 1
**Derives from:** HSW (Hazardous Substances) Regulations 2017 · WKS-17 Location Compliance Certification PS (classes 2–6, 8) · Information & Process Requirements for Compliance Certifiers PS 2019 ("IPS") · Assure Safety Compliance Certification Process Flow

Every node and field below traces to a clause. Where a field exists only because a regulation demands it, the clause is named. Nothing here is decorative.

---

## 0. The three layers the spreadsheet conflates

The existing workbook mixes three different kinds of data in one grid. Separating them is the whole point of this model.

| Layer | What it is | Changes when | Lives in |
|---|---|---|---|
| **Template** | Item / Regulation / Action / Records — copied verbatim from the Performance Standard | WorkSafe revises the PS | `packages/checksheets`, versioned, immutable once published |
| **Instance** | Site details, findings, comments, evidence | Every job | Postgres |
| **Presentation** | Merged cells, red = non-compliant | Never (it's styling) | Discarded — replaced by an explicit field |

**The critical defect this fixes:** in the workbook, compliance status is encoded as *font colour* in column E (`FFFF0000` red = non-compliant, `FF00B050` green = resolved). IPS cl. 21(1)(c) requires the *result* of each inspection to be recorded. A font colour is unqueryable, uncountable, unvalidatable, and destroyed by a copy-paste. `Finding.status` replaces it.

---

## 1. Node types

### Template layer — versioned, client-independent

```
ChecksheetTemplate
  id, code                 e.g. "wks17-class-6-8"
  title                    verbatim sheet title
  ps_reference             the Performance Standard clause this derives from
  class_scope[]            ["6.1A","6.1B","6.1C","8.2A","8.2B"]
  revision, effective_from, superseded_by
  status                   draft | current | superseded

TemplateSection
  template_id, ordinal, number, title
                           e.g. 4 "Signage"

TemplateItem
  section_id, ordinal, number
  regulation_refs[]        ["2.6(3)"] — parsed, not free text, so it can be linked & audited
  action_text              verbatim "Action" column
  records_text             verbatim "Records" column
  guidance_url             WorkSafe operational policy link where the sheet carries one
```

Templates are **immutable once `status = current`.** A PS revision creates a new revision row; existing inspections keep pointing at the revision they were conducted under. This is non-negotiable — at year nine an auditor asks "which version of the standard did you assess against?", and the answer must be in the data.

**Measured, not assumed:** extracting the general sheet independently from two unrelated client workbooks (class 6 & 8, and class 2 & 3.1) produced 8 identical sections and **36/36 items with byte-identical action and records text**. Only two items differ, and only in their regulation references — item 1 and item 30, where the extra citations are the class-specific regulations.

So there is **one general template**, not one per class family, and `TemplateItem.regulationRefs` needs to be class-conditional for those two items:

```
TemplateItem.regulationRefs        base refs, applying to every class
TemplateItem.regulationRefsByClass { "class_6_8": [...], "class_2_3": [...] }  // sparse; only 2 of 36 items use it
```

Re-extracting any workbook and diffing against `packages/checksheets/data/` is the regression test for a PS revision.

**Three kinds of sheet, one template model (11 September 2026).** Bryan's
second batch of workbooks are not location check sheets. The certified
handler assessment (class 6) assesses a *person*; the cylinder importation
checklists (FERN fire extinguishers, UNRTDG cylinders) assess a *shipment*
of units. The template gains one discriminator and two label lists instead
of a second model:

```
Sheet.kind                 location | handler | cylinder
Sheet.subjectBlock[]       the labels above the items, in the workbook's words
                           handler: Name, Company, DOB, Application type
                             (New Applicant | Renewal | Change of scope), Scope …
                           cylinder: Company/Legal Entity, NZBN, Full Name of PCBU …
Sheet.unitBlock[]          cylinder only: the labels the workbook lays across
                           columns, one column per batch (Certificate Number,
                           FERN, Country of Manufacturer, Water Capacity …)
Sheet.certificate          the Certificate tab's wording: title, "certifies
                           that", field labels, scope text, date labels, signature
```

A location sheet has `kind = location` and no subject block (rows 2–14 are
the site block, already modelled). The extractor (`tools/extract-forms.mjs`)
reads only labels and template wording from those workbooks; the values in
them are real applicants and are never written anywhere. Sheet sets
(`data/sheet-sets.json`) carry the kind so a job knows what it is from its
class key: `class_6_8`, `class_2_3` (location), `handler_6` (handler),
`cylinder_fern`, `cylinder_un` (cylinder).

**Revisions are keyed by content hash.** The generated seed inserts a template only when no row with the same `meta.contentHash` exists; a changed template therefore becomes `revision + 1`, the previous revision is marked `superseded` (rows kept, so old findings still resolve), and re-running the seed is a no-op. Merging a changed template into an existing revision once turned 98 items into 116 on the deployed database; `packages/db/test/reseed.test.mjs` reproduces that case and asserts it cannot recur.

### Instance layer — per engagement

```
Client (PCBU)              legal_name, trading_name, nzbn,
                           companies_number        ← reg 6.26(2)(e)(ii)
                           postal_address, phone, website, industry

Contact                    client_id, name, role, phone, email, is_site_manager

Site                       client_id, address

HSLocation                 site_id, name, summary
                           ← "G2 Chiller". The unit of certification.
                             IPS 21(1)(a): "unique identification or description
                             of any item or location inquired into"

Person (app_user)          full_name, occupation, email, role, authorisation_number,
                           active, passcode_hash
                           ← Person → Role. certifier | reviewer | viewer | admin,
                             enforced per event and per route (roles.mjs). Managed
                             by a certifier on the People screen (/people):
                             GET/POST /api/users, PATCH /api/users/:id,
                             POST /api/users/:id/passcode (revokes tokens).
                             Occupation is on the person because IPS 21(4) prints
                             it with every photograph.

Substance                  hs_location_id, name, hazard_class, quantity, unit,
                           un_number, hsno_approval, lifecycles (migration 010)
                           ← entered on New job, one row per substance. Read by
                             site block row 13 (names) and by the certified
                             handler certificate's table Name | Classes |
                             Lifecycles. The hub lists them as a card.

Job                        client_id, hs_location_id, type, stage, opened_at
                           subject jsonb            ← label → value for a form sheet
                             (the applicant, the PCBU); merged, never replaced,
                             so two devices editing different fields both land
JobUnit                    job_id, ordinal, fields jsonb
                           ← one per cylinder batch; the workbook's columns.
                             migration 009; a remove closes the gap (units
                             after it move up one, as in the app's list);
                             events job.subject.set,
                             job.unit.upsert, job.unit.remove
                           ← one certification engagement; walks the 8-stage flow

Inspection                 job_id, hs_location_id, template_revision_ids[],
                           certifier_id,
                           conducted_by_id         ← IPS 21(1)(g)
                           supervised              ← IPS 21(1)(g)
                           inspected_at            ← IPS 21(1)(b)
                           equipment_used          ← IPS 21(1)(d) "iPad and tape measure"
                           status

Finding                    inspection_id, template_item_id
                           status                  ← IPS 21(1)(c). REPLACES FONT COLOUR.
                                                     compliant | non_compliant |
                                                     not_applicable | pending | conditional
                           comment                 ← verbatim column E
                           verification_method     ← IPS 21(1)(e) "the manner in which
                                                     each requirement has been verified"
                           failure_reason          ← IPS 21(1)(f)
                           decided_by, decided_at, signature   ← IPS 21(5)

Evidence                   finding_id?, inspection_id, kind (photo|video|document)
                           storage_key             content-addressed: sha256 → object key
                           sha256                  computed AT CAPTURE, not at upload
                           c2pa_manifest           signed provenance, travels with the file
                           captured_by_name        ← IPS 21(4)(a)
                           captured_by_occupation  ← IPS 21(4)(a) — currently missing everywhere
                           captured_at             ← IPS 21(4)(b)
                           captured_where          ← IPS 21(4)(c) human-readable place
                           gps_lat, gps_lon        supporting, not a substitute for the above
                           device_info, mime, bytes
                           appendix_category       Appendix 1–11 filing taxonomy
                           retain_until            ← IPS 21(6), enforced by object lock

Substance                  client_id, hs_location_id, name, un_number, hsno_approval,
                           hazard_class, quantity, unit, sds_expiry
                           threshold_triggered     computed vs Schedule 3/5/9

Certificate                job_id, decision (granted|conditional|refused)
                           certificate_number      ← IPS 8(1)(c)(ii): MUST be prefixed with
                                                     the certifier's authorisation number
                           register_number         ← IPS 8(1)(c)(i)
                           certifier_name          ← IPS 8(1)(a) as on the WorkSafe authorisation
                           authorisation_number    ← IPS 8(1)(b)
                           type, issued_to, applies_to        ← IPS 8(1)(d)(f)(g)
                           issue_date, in_force_date, expiry_date ← IPS 8(1)(e)(h)(i)
                           conditions[], requirements_not_met[]
                           signature               ← IPS 8(2)(a); 8(3) permits electronic
                           worksafe_register_due   ← reg 6.22(5), 15 working days

CorrectiveAction           finding_id, severity, description, due_date,
                           status, evidence_ids[], reverified_by, reverified_at

CommunicationRecord        job_id, direction, party, medium, occurred_at,
                           summary, attachment_ids[]
                           ← IPS 21(2)(a) "every communication with the applicant".
                             A statutory record, same retention as everything else.

InterestDeclaration        job_id, certifier_id, conflict_found, description, mitigation
                           ← IPS 23(1)-(3): a register of interests is MANDATORY

RetentionClock             job_id, certificate_id, trigger, retain_until
                           ← IPS 21(6): expiry + 5 years (or issue + 10 for cylinder /
                             tank-wagon types). Drives object-lock retention dates.

Event                      seq, actor_id, entity_type, entity_id, action, payload,
                           occurred_at, prev_hash, hash
                           ← append-only, hash-chained. The audit trail IS the database.
```

---

## 2. Edges

```
Client ─1:n─ Site ─1:n─ HSLocation ─1:n─ Job
Client ─1:n─ Contact
Client ─1:n─ Substance ─n:1─ HSLocation

Job ─1:n─ Inspection ─1:n─ Finding ─n:1─ TemplateItem ─n:1─ TemplateSection ─n:1─ ChecksheetTemplate
Job ─1:n─ CommunicationRecord
Job ─1:1─ InterestDeclaration
Job ─0:1─ Certificate ─1:1─ RetentionClock

Finding ─1:n─ Evidence
Finding ─0:1─ CorrectiveAction ─1:n─ Evidence

Inspection ─n:1─ User (certifier)
Inspection ─n:1─ User (conducted_by)          ← IPS 21(1)(g)

* ─1:n─ Event                                  every mutation, no exceptions
```

**Why `Finding` is the join and not a column on `TemplateItem`:** the template is shared across every client and must stay immutable. The finding is the per-inspection fact. One template item accumulates thousands of findings across the business — which is what makes "show me every site where signage failed 2.6(3)" a query rather than an archaeology project.

---

## 3. Job state machine

From `Assure Safety Compliance certification Process Flow.docx`, stages 1–8:

```
        ┌──────────── renewal (T-6 months, from RetentionClock) ────────────┐
        ▼                                                                    │
 1 enquiry ──triage──► 2 application ──accepted──► 3 document_review          │
     │  out of scope        │ declined                  │                     │
     ▼                      ▼                           │◄── rfi_loop ────┐   │
   referred              closed                         ▼                 │   │
                                              4 site_inspection ──────────┘   │
                                                        │                     │
                                                        ▼                     │
                                          5 compliance_evaluation             │
                                                        │                     │
                                              ┌─────────┴─────────┐           │
                                     gaps open│                   │no gaps    │
                                              ▼                   │           │
                                       gap_closure ───────────────┤           │
                                                                  ▼           │
                                                        6 final_validation     │
                                                                  │           │
                                    ┌──────────────┬──────────────┤           │
                                    ▼              ▼              ▼           │
                              7a granted    7b conditional   7c refused       │
                                    │              │              │           │
                                    │         conditions      reg 6.23(2)     │
                                    │         reg 6.24        notify applicant│
                                    │              │          + WorkSafe      │
                                    └──────┬───────┘              │           │
                                           ▼                      ▼           │
                                    8 monitoring ─────────────► closed        │
                                           └──────────────────────────────────┘
```

**Transition guards that are legal, not cosmetic:**

| Transition | Guard | Source |
|---|---|---|
| → `site_inspection` | document review complete or RFI answered | Process flow §3 |
| → `final_validation` | every `Finding.status = non_compliant` has a `CorrectiveAction` that is resolved or accepted as a condition | Process flow §5–6 |
| → `granted` | zero unresolved non-compliances; every `evidence_required` item has ≥1 Evidence | reg 13.39 |
| → `conditional` | conditions recorded with deadlines | reg 6.24 |
| → `refused` | applicant **and** WorkSafe notification tasks created | reg 6.23(2)(b)(c) |
| any → issued | `InterestDeclaration` exists for the job | IPS 23(1) |
| any → issued | certificate number is prefixed with the authorisation number | IPS 8(1)(c)(ii) |
| on issue | `RetentionClock` created: `expiry + 5 years` | IPS 21(6) |

The last four are the ones a spreadsheet cannot enforce and a database can. That is most of the value of this project.

---

### 3a. The screen graph: Client → Job → Stage → Task

```
 Sign in ──► Jobs board ──tap job──► Job hub ──"Now" button──► Check sheet (stage 4)
             (GET /api/jobs)         (GET /api/jobs/:id)         (SheetView / list)
             client · location ·     context bar on every       context bar, folded
             stage chip · next       job screen; Now card       site block, section
             action · progress ·     names the one next step    rows verbatim
             last activity           and opens it
```

Every screen answers "which client, where, what stage" in the same strip
(`JobContextBar`). The board and the hub are read models over the server;
nothing on them is decided locally. The one next step per stage is
`ProcessStage.nextAction`, computed from stage + counts, and the move
buttons use verbs (`ProcessStage.moveLabel`), not the document's headings.

**A job knows what it is.** The board icon and the "Now" wording follow
`kind`: a factory for a location, a person for a handler, a cylinder for an
importation. New job asks for the applicant's name or the shipment
reference instead of a hazardous substance location, and seeds the subject
block from it. On the sheet the site block gives way to the subject block
(`SubjectEditor`: the template's labels, a choice where the workbook has
one) and, for cylinders, the units grid (`UnitsEditor`: one column per
batch, add and remove). The column grid collapses the slots a sheet does
not have: handler sheets show Ref | Requirement | Comments | Evidence,
cylinder sheets keep Records. The certificate for a form job is rendered
from the template's Certificate tab wording (`render-form-certificate.mjs`)
with the subject's fields and one column per unit.

**Reading a 54-row sheet.** A chip row pinned above the sheet lists every
section with done/total (red when a non-compliance sits in it, green when
complete) and jumps to it; a section's band row folds its items and keeps
the count. Rows 2–14 fold behind a summary line. The wording in every cell
is still the workbook's.

**Evidence bytes.** `POST /api/evidence/upload` writes to a private Vercel
Blob store (`BLOB_READ_WRITE_TOKEN`), keyed by the SHA-256 the device
computed; `GET /api/evidence/:key` streams it back to a signed-in user.
The record (who, occupation, when, where, hash) stays in Postgres; the store
holds only bytes. Object lock is the DigitalOcean Spaces step.

**Two devices, one job.** The outbox is on disk (`PrefsOutboxStore`) so a
change queued in the chiller survives a refresh or a relaunch. The sheet
pulls the job every 30 s and on Sync now (`SyncService.pull`): server
findings are merged in except where this device holds an unsent change for
the same item (the local version is about to win on the server anyway), and
the screen says "N items updated from another device". Start on the phone,
finish on the laptop, or the reverse.

### 3a′. Loops 1–4 from the 10 September call

```
                       WorkSafe register (TST100250)          authorisation.json
                                  │ permits
                                  ▼
 Person ──role──► may do ──►  SheetSet  ──inspects with──► templates   sheet-sets.json
 (certifier /                     │
  reviewer /                      ▼
  viewer)      Client ─► Job ─► Inspection ─► Finding ─► CorrectiveAction
    │                    │                        │
    │ every event        │ stage                  │ non-compliant
    ▼                    ▼                        ▼
 Event log ◄──── who did what ◄────────── Non-compliance report ──► Communication ──► client
 (sync_event.user_id)                     Certificate ────────────►   (send, recorded)
    │
    ▼
 Dashboard = reminders (expiry −180 d, RFI > 7 d, action due ≤ 14 d, idle 14 d) + recent events
```

| Node / edge | Where | Guard |
|---|---|---|
| Person.role | `app_user.role` (migration 008); `Session.role` in the app | `roles.mjs`: sign, interests, verify, issue need certifier; viewer reads only; per-event, clause `Role` |
| Event → Person | `sync_event.user_id`; `GET /api/jobs/:id` → `events`; hub History | refusals stay on the record with their clause (IPS 22) |
| SheetSet → Authorisation | `GET /api/sheet-sets`, `GET /api/authorisation`; New job picker | a set with no authorisation entry cannot be chosen |
| Report → Communication → Client | `GET /api/jobs/:id/non-compliance.html`; `POST /api/jobs/:id/send` | certificate send needs certifier; every send recorded (IPS 21(2)(a)); SMTP_URL optional |
| Workbook → Job | `POST /api/jobs/import`; `tools/import-job.mjs` | certifier only; findings become events by that person |
| Dashboard | `GET /api/dashboard`; board strips | derived, never stored |
| Logo → home | `BrandBar` | pops to the first route |

### 3b. The process flow on screen

Stage 4 is the check sheet screen. Every other stage of the document is the
**Job screen** (`apps/mobile/lib/screens/job_screen.dart`), reached from the
Job button on the check sheet. It is a read model over `GET /api/jobs/:id`
plus the issuance dry-run; every button sends one sync event or one POST and
re-reads the job. The screen offers only `allowedNext`, which the server
computes from the same `job_stage_allowed()` the trigger enforces.

| Process flow | Screen element | Wire | Guard |
|---|---|---|---|
| 1–8 stage, loops (RFI, gap closure) | Process flow card, numbered as in the document | `GET /api/jobs/:id` → `stage`, `allowedNext` | `job_stage_allowed` |
| §1–2 enquiry, application pack, acceptance (email templates 1 and 2) | Communications card → Record communication, template prefills | `communication.record {jobId, direction, medium, party, summary, body}` | IPS 21(2)(a): direction/medium CHECKs, `occurred_at` required |
| §3 RFI with a clear list of gaps; answer returns to review | Request further information → gap list; Information received | `communication.record` + `job.transition rfi` in one batch; inbound + `job.transition document_review` | `document_review ⇄ rfi` only |
| Move between stages, with reason | Move to … buttons → reason dialog | `job.transition {jobId, toStage, reason}` | trigger + `job_stage_transition` (who, when, why) |
| §5 prioritise gaps critical / major / minor, actions list | Non-compliances card → Add action | `corrective_action.raise {findingId, severity, description, dueDate}` | severity CHECK |
| §5–6 client remediates, certifier re-verifies | Resolved / Verify buttons | `corrective_action.update {correctiveActionId, status}` | `verified_needs_verifier` (reg 6.24): verifier = authenticated user |
| IPS 23 conflict question | Register of interests card | `interest.declare {jobId, conflictFound, description}` | `conflict_needs_description` |
| §6 confirm all controls in place | Issuance check card (blockers with clause) | `GET /api/jobs/:id/issuance-check` | `assert_can_issue_certificate` dry-run |
| §7 prepare and issue, dates, conditions | Certificate card → Issue dialog | `POST /api/jobs/:id/certificate` | `has_a_number`, `dates_ordered`, conditional/refusal reasons, retention clock, WorkSafe register due |
| §7 send certificate | Open certificate | `GET /api/jobs/:id/certificate.html` | rendered from the job, never typed |
| §8 renewal | Move to Monitoring; renewal re-enters at Enquiry | `job.transition` | `monitoring → enquiry` allowed |
| Who is recording (IPS 21(4)(a), 21(5); reg 6.24) | Sign-in screen; name and authorisation number in the home bar; Sign out | `POST /api/auth/login {email, passcode, deviceId}` → bearer token; `Authorization: Bearer` on every call; `?token=` for the certificate tab | `AUTH_REQUIRED=1`: no token, no job route (401 with clause); the signed-in user outranks any userId in a body; passcode = scrypt hash from `ASSURE_PASSCODE`, rotated at boot; tokens stored as SHA-256 only (migration 007) |

Covered by `apps/server/test/process-flow.test.mjs` (the screen's contract
against PGlite, stages 5–8) and `apps/mobile/test/job_screen_test.dart`
(the screen against a fake server that answers as apps/server does).

---

## 4. Integrity model

```
capture (Flutter, on device)
   │  photo/video taken through a controlled camera
   ├─ sha256 computed AT CAPTURE
   ├─ C2PA manifest signed: who, occupation, when, where, device
   └─ queued locally (offline-safe; the chiller has no signal)
         │
         ▼  sync when connectivity returns
   API (DigitalOcean)
   ├─ verify sha256 and C2PA signature
   ├─ store content-addressed by hash → object storage
   ├─ set object-lock retain_until = certificate expiry + 5 years   ← IPS 21(6)
   └─ append Event{action:"evidence.captured", hash-chained}
```

**Why hash at capture, not at upload.** IPS 21(4) is a provenance attestation — Bryan personally signs that *he* took *this* photo, at *that* site, on *that* date. A hash computed when the file reaches the server proves only that it didn't corrupt in transit. It says nothing about where the photo came from, which is the thing being attested. Hashing and signing at the shutter is what makes the attestation technically true rather than merely asserted.

**Retention as a physical property.** Setting object-lock retention to the certificate's expiry + 5 years makes IPS 21(6) enforced by the storage layer rather than by anyone remembering. Note: DigitalOcean Spaces does **not** support Object Lock — it supports versioning only (and that only via the API). The evidence tier therefore needs an Object-Lock-capable store (Backblaze B2 or Wasabi) alongside DO, or the retention guarantee downgrades from enforced to promised.

---

## 4b. Sync contract — the app ⇄ server edge

The field app captures where there is no signal and syncs later. The contract that makes that safe is small, and it is verified end to end in `apps/server/test` and `apps/mobile/test/sync_test.dart`:

```
device                                  server
──────                                  ──────
mutation happens
  │  SyncEvent{ id: uuidV4(),  ← generated HERE, never regenerated on retry
  │             type, payload, occurredAt }
  ▼
Outbox (persisted)  ──── flush ────►  POST /api/sync
  │                                     │ for each event, in a savepoint:
  │                                     │   seen id?  → duplicate (+ original clause if rejected)
  │                                     │   handler   → applied | rejected{clause, reason}
  │                                     │ sync_event row written either way
  ◄────────────────────────────────────┘
settle: drop applied/duplicate, keep rejected with clause until corrected
```

Properties that hold, and why each matters:

| Property | Why |
|---|---|
| Idempotent by client id | a batch retried after a dropped connection applies nothing twice |
| Per-event savepoints | one bad finding does not sink the other 53 |
| Rejections name the clause | "IPS 21(1)(f)" tells the inspector what to type; "422" does not |
| Clause survives replay | a rejected event retried unchanged is still explained |
| Findings queue only after `inspection.open` succeeds | they reference its server id |
| Item identity is `(templateCode, section, item)` | stable across template revisions; meaningful offline; resolved to `item_id` server-side once |
| `issuance-check` is a rolled-back dry run of the real guard | the app's *Can grant* pill is server-authoritative |

## 5. Code generation — one source of truth

Flutter means the check sheet would otherwise be defined twice: once in TypeScript for the web app, once in Dart for mobile. Against a standard whose own document control block reads *"Frequency of revision: less than 12 months"*, that drift is a certainty, not a risk.

```
                  packages/checksheets/data/*.json          ← canonical, versioned, reviewed
                              │
              ┌───────────────┼───────────────┬────────────────────┐
              ▼               ▼               ▼                    ▼
      TypeScript types    Dart models    Postgres seed       PDF/A + XLSX
        (web + api)       (Flutter)       (templates)      (export, cl. 22(2))
```

The JSON is the artifact under version control and review. Every consumer is generated and never hand-edited. A PS revision is a data change plus a regenerate — not four parallel edits in four languages.

---

## 6. Modules the regulation requires that nothing currently implements

| Gap | Clause |
|---|---|
| Register of interests | IPS 23(2)–(3) |
| Communications log as a retained record | IPS 21(2)(a) |
| Retention/disposal clock keyed to certificate expiry | IPS 21(6) |
| Photographer **occupation** on every photo | IPS 21(4)(a) |
| Dual signature — certifier **and** the person who inspected | IPS 21(5) |
| Equipment used, recorded per inspection | IPS 21(1)(d) |
| Verification method recorded per item | IPS 21(1)(e) |
| Certificate number prefixed with authorisation number | IPS 8(1)(c)(ii) |
