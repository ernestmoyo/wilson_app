# Wilson Suite — Deferred Work

## P2 — Should Do

### Automated Database Backups
Scheduled SQLite backup to S3/R2 (daily). Currently only manual download via `GET /api/backup`.
**Why:** Manual download relies on Brian remembering. Automated protects against "Brian forgets."
**Effort:** S

### Streaming SHA-256 Hash
Switch `fs.readFileSync` in evidence upload to streaming hash to reduce memory pressure on large files.
**Why:** Current approach reads entire file into memory. With 50MB limit this is acceptable but not ideal.
**Effort:** S

## P3 — Nice to Have

### Pagination on List Endpoints
Add `?page=&limit=` to all GET list endpoints (inventory, evidence, audit_log, training).
**Why:** Tables will grow over months. Single user with <1000 rows per table won't hit issues yet.
**Effort:** M

### Component Splitting for Large Pages
Extract modals and forms from 500+ LOC page components (InventoryPage, EnquiriesPage, ClientDetail).
**Why:** Easier to modify individual features without reading 800 lines.
**Effort:** M

### Separation Distance Calculator (Phase 7)
Encode NZ regulatory lookup tables (Location PS 2021 Schedules 2-6) for automated separation distance calculations.
**Why:** Brian currently uses a VBA Excel tool. Would remove a manual step.
**Effort:** M
