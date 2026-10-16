# Assure Safety Field — Development Guide

## What This Is
NZ hazardous substances compliance certification platform for Brian (Bryan) Wilson (LCC TST100250, Assure Safety). Digitises his Excel check sheets, the certification process flow and the certificate. Domain model: `docs/GRAPH.md`. Plan from the 10 Sept 2026 call: `docs/PLAN-2026-09-10-bryan-call.md`.

## Stack (the running system)
- **App:** Flutter (`apps/mobile/`) — web build served by the server; same code for iPad/Android.
- **Server:** Express + Postgres (`apps/server/`). `DATABASE_URL` (or `POSTGRES_URL`) set → real Postgres; unset → PGlite in-process (tests, local dev).
- **Schema:** `packages/db/migrations/NNN_*.sql`, applied in order by `migrate()` (`apps/server/src/db.mjs`), recorded in `schema_migration`. Additive only.
- **Check sheet templates:** `packages/checksheets` (extracted from Bryan's workbooks, generated seed + Dart).
- **Live:** https://assure-safety-platform.vercel.app — Vercel project `assure-safety-platform`, Neon Postgres, Vercel Blob for evidence. DigitalOcean is prepared but not live (`docs/DIGITALOCEAN.md`, `.do/app.yaml`).
- **Retired:** `apps/api` (SQLite) and `apps/web` (React) are the old suite; do not build on them.

## Commands
```bash
npm test -w apps/server                       # server suites on PGlite (each file is its own DB)
cd apps/mobile && flutter analyze && flutter test
# local server (never with .env.local loaded — that points at live Neon):
cd apps/server && env -u DATABASE_URL -u POSTGRES_URL PORT=8123 ASSURE_PASSCODE=<local> node src/index.mjs
# web build into the server's static folder (absolute -o path; relative fails on shaders):
cd apps/mobile && flutter build web --release --no-wasm-dry-run -o "<repo>/apps/server/public"
npx vercel deploy --prod                      # from repo root, only on the owner's word
```

## Architecture
- `apps/server/src/app.mjs` — every REST route (jobs board, job, issuance check, certificate, dashboard, people, evidence).
- `apps/server/src/sync/apply.mjs` — every mutation from the app is a sync event (`POST /api/sync`), idempotent by client UUID, recorded in `sync_event` with the person: that is the audit trail.
- `apps/server/src/roles.mjs` — certifier / reviewer / viewer; certifier-only events listed in `CERTIFIER_ONLY`.
- `apps/mobile/lib/app.dart` — route graph (`/login`, `/` Clients, `/jobs/:id`, `/jobs/:id/sheet`, `/people`).
- `apps/mobile/lib/screens/jobs_board.dart` — the landing: active clients, jobs grouped by `client_id`, archive.
- `apps/mobile/test/fake_server.dart` — fake API for widget tests.

## Conventions
- A new mutation is a sync event type in `apply.mjs` (+ a role rule if certifier-only), not a new REST write.
- Rejections carry a clause and are client errors, never 500s.
- Tests are growth-safe: own subjects, own PGlite, no assumptions about row 0.
- Hide, don't delete: clients are archived (`client.archived_at`), never removed.

## Live-data rules
- `.env.local` holds live Neon credentials. Never run the server or a script against it without the owner's explicit yes per operation.
- Live data changes go through the app or its API, never raw SQL.

## Regulatory Context
- HSW (Hazardous Substances) Regulations 2017
- Location Compliance Certification PS (WKS-17), Certified Handler PS 2021
- Information & Process Requirements for Compliance Certifiers PS 2019 (IPS)
- NZ EPA HSNO classifications
