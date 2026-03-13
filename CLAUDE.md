# Wilson Suite — Development Guide

## What This Is
NZ hazardous substances compliance certification platform for Brian Wilson (LCC TST100250). Digitises his Excel checksheets, folder-based filing, and VBA calculators.

## Stack
- **Frontend:** React + Vite + TailwindCSS (`apps/web/`)
- **API:** Express + node:sqlite DatabaseSync (`apps/api/`)
- **Database:** SQLite file (`wilson.sqlite`) with WAL mode
- **Deploy:** Railway (Dockerfile, single service serves both API and static frontend)

## Commands
```bash
npm run dev          # Start both API (:8000) and frontend (:3000)
npm run dev:api      # API only
npm run dev:web      # Frontend only
npm run build        # Production build (web then api)
npm start            # Production server
npx tsc --noEmit -p apps/web/tsconfig.json   # Type-check frontend
```

## Architecture
- `apps/api/src/index.ts` — Express server, middleware, route registration
- `apps/api/src/db/schema.ts` — All table definitions and migrations
- `apps/api/src/db/database.ts` — SQLite connection (DatabaseSync)
- `apps/api/src/middleware/auth.ts` — Cookie-based session auth
- `apps/api/src/middleware/asyncHandler.ts` — Sync route handler wrapper with error sanitization
- `apps/api/src/lib/auditLog.ts` — Shared audit logging helper
- `apps/api/src/routes/*.ts` — 13 route files (CRUD for each entity)
- `apps/web/src/App.tsx` — Routes + auth guard
- `apps/web/src/lib/api.ts` — Fetch wrapper with auth handling
- `apps/web/src/types/index.ts` — All TypeScript interfaces
- `apps/web/src/pages/` — 15 page components

## Conventions
- All route handlers use `asyncHandler()` wrapper — no manual try/catch
- All mutations (POST/PUT/DELETE) call `logAudit()` for audit trail
- Error responses never leak internal details — always "Internal server error"
- API responses wrap data in `{ data: ... }`
- Frontend uses `api.get/post/put/delete` from `lib/api.ts` — auto-handles auth 401
- Migrations are ALTER TABLE ADD COLUMN in `schema.ts` — only swallow "duplicate column" errors
- Database indexes on all frequently-queried foreign keys

## Auth
- Single password via `AUTH_PASSWORD` env var (default: `wilson-compliance-2025`)
- HTTP-only cookie session, 7-day expiry
- All `/api/*` routes require auth except `/api/health` and `/api/login`
- Set `ALLOWED_ORIGIN` env var in production for CORS

## Railway Deploy
- `railway.toml` locks Dockerfile builder + start command
- Set env vars: `AUTH_PASSWORD`, `ALLOWED_ORIGIN`, `DATA_DIR`
- Mount volume at `/app/apps/api/data` for SQLite persistence
- Mount volume at `/app/apps/api/uploads` for evidence files
- Healthcheck: `GET /api/health`

## Regulatory Context
- HSW (Hazardous Substances) Regulations 2017
- Location Performance Standard 2021
- Certified Handler Performance Standard 2021
- NZ EPA HSNO classifications
- 23 HSNO hazard classes, 11 appendix categories, 7 HSL thresholds
