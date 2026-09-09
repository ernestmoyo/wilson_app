# @wilson/server

Postgres-backed API for the Assure Safety compliance platform. Supersedes `apps/api` (SQLite, the current Railway deploy), which is left untouched until cutover.

```bash
npm start -w apps/server                 # PGlite in-process if DATABASE_URL is unset
DATABASE_URL=postgres://… npm start      # real Postgres (DigitalOcean)
npm test  -w apps/server                 # the real G2 Chiller job, end to end, through HTTP
```

The same code runs against PGlite and real Postgres — both expose `query(sql, params) → {rows}`. Nothing in the server is test-only, and the migrations it applies are the ones `packages/db` ships.

## Design

The regulations are enforced **in the schema** (`packages/db`). The server's job is narrower than it looks:

1. translate the field app's keys into the database's — a check sheet item is `(templateCode, sectionOrdinal, itemOrdinal)` to the app and `item_id` to Postgres, resolved once in `src/sync/apply.mjs`
2. apply client events **idempotently**
3. turn every rejection into a **regulatory clause** the inspector can act on (`src/sync/errors.mjs`)

A rejection that reaches the app without a clause is a bug in `errors.mjs`, not in the app.

## The sync contract — `POST /api/sync`

The field app captures in places with no signal and syncs later. Networks drop mid-request, so the same batch **will** be retried. The contract makes that safe:

```jsonc
// request
{
  "deviceId": "ipad-bryan-001",
  "userId": 1,
  "events": [
    { "id": "<client-generated uuid v4>",   // the idempotency key
      "type": "finding.upsert",
      "occurredAt": "2026-07-04T02:13:00Z",  // on the device
      "payload": { "inspectionId": 1, "templateCode": "wks17-general",
                   "sectionOrdinal": 4, "itemOrdinal": 4,
                   "status": "non_compliant", "comment": "…", "failureReason": "…" } }
  ]
}

// response
{
  "applied":   [ { "id": "…", "type": "finding.upsert", "result": { "findingId": 11 } } ],
  "rejected":  [ { "id": "…", "type": "finding.upsert",
                   "clause": "IPS 21(1)(f)",
                   "reason": "A non-compliant finding must state the reason the requirement is not met." } ],
  "duplicate": [ { "id": "…", "previousOutcome": "applied" },
                 { "id": "…", "previousOutcome": "rejected", "clause": "IPS 21(1)(f)", "reason": "…" } ],
  "serverTime": "…"
}
```

Guarantees, all verified by `npm test`:

- **once per id.** The client UUID is `sync_event`'s primary key. A replayed batch reports every event as `duplicate` and changes nothing — 54 findings resent = 54 duplicates, still 54 rows.
- **one event's failure does not sink the batch.** Each handler runs in a savepoint; the rest still apply.
- **rejections carry the clause**, and the clause **survives replay** — a retried rejected event comes back as `duplicate` with the original `clause` and `reason`, so the inspector still sees what to fix.
- **client errors (`23xxx`, `P0001`) are rejections; anything else is a 500.** A schema bug is not the inspector's problem and must not be dressed up as one.

### Event types

| Type | Clause it serves |
|---|---|
| `inspection.open` | IPS 21(1)(b),(d),(g) — date, equipment, who/supervised; pins template revisions |
| `finding.upsert` | IPS 21(1)(c),(e),(f) — result, verification method, failure reason |
| `evidence.attach` | IPS 21(4) — photographer, occupation, date, place; provenance |
| `job.transition` | Process Flow §1–8 — the DB trigger enforces legality |
| `interest.declare` | IPS 23 — required before any certificate issues |
| `communication.record` | IPS 21(2)(a) — every communication with the applicant |

## Other endpoints

| | |
|---|---|
| `GET /api/health` | db kind + template item count |
| `GET /api/templates`, `/api/templates/:code` | the canonical check sheets from the database — the app confirms its compiled bundle matches before inspecting |
| `GET /api/jobs`, `POST /api/jobs` | list; create client + site + location + job in one transaction |
| `GET /api/jobs/:id` | the whole job graph in one round trip: inspections, findings with counts, evidence, certificate, retention, transitions, interest declarations |
| `GET /api/jobs/:id/issuance-check` | **dry-run of the issuance guards, mutating nothing.** Runs `assert_can_issue_certificate()` inside a rolled-back transaction. This is what makes the app's *Can grant / Cannot grant* pill server-authoritative rather than a local guess |
| `POST /api/jobs/:id/certificate` | stage transition + certificate insert in **one transaction** — a refused issuance leaks no stage change; returns computed `retainUntil` and `worksafeRegisterDue` |

## Identity

Until real auth lands, `x-device-id` and `x-user-id` headers carry identity. `app.mjs` reads them in exactly one middleware; that is the one place to replace.
