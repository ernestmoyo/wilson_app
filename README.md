# Wilson Suite

**Hazardous Substances Location Compliance Management System**
Built for New Zealand Licensed Location Compliance Certifiers (LCCs) operating under the Health and Safety at Work (Hazardous Substances) Regulations 2017 (LI 2017/131), current version 20 October 2025.

---

## Overview

Wilson Suite is a full-stack web application that digitises the entire compliance certification workflow — from pre-inspection through to certificate issuance, conditional grants, refusal notifications, and ongoing inventory management. Designed specifically for the New Zealand regulatory environment, every feature maps to a specific provision of the HSW Regulations 2017.

---

## Modules

| Module | Description |
|---|---|
| **Compliance Assessment** | Create and manage pre-inspection, site inspection, and validation assessments. Auto-populates the complete 19-item NZ HSW checklist (Sections A–J, reg 10.34) with legal reference citations on every item. |
| **Compliance Certificates** | Issue, track, and monitor WC-series certificates. Supports full grant, conditional grant (reg 6.24), and refusal (reg 6.23) workflows. Tracks WorkSafe register entry deadline (reg 6.22(5)) and expiry. |
| **Inventory Manager** | Record and maintain client hazardous substance inventories. Automatically flags quantities approaching or exceeding HSL thresholds from Schedule 9 Table 4 (regs 10.26, 10.34). |
| **Site Planner** | HTML5 canvas-based site plan editor with legal minimum elements checklist (reg 10.26(4)(b)). Blocks save if mandatory elements (HSL, Hazardous Area) are absent. Undo/redo and label editing. |
| **Reports** | Generate compliance reports and gap analyses linked to assessments, grouped by section with legal titles. Print/PDF export. |
| **Clients** | Full client record management including legal entity details, NZBN, Companies Office number (reg 6.26(2)(e)), site address, and linked assessment history. |
| **Dashboard** | At-a-glance statistics: active clients, monthly assessments, certificates granted, expiring soon, and pending decisions. |

---

## Legislative Compliance

Every feature in Wilson Suite is grounded in a specific regulation:

| Feature | Regulation |
|---|---|
| 19-item site inspection checklist (Sections A–J) | reg 10.34(1)(a)–(k), 4.5, 4.6, 10.5, 10.6, 10.30, 10.26(4)(b), 2.5, 2.11, 5.3–5.12 |
| Conditional Certificate workflow | reg 6.24 |
| Refusal — mandatory applicant + WorkSafe notification | reg 6.23(2)(b)(c) |
| 15-working-day WorkSafe register entry deadline | reg 6.22(5) |
| Certificate register entry — all required fields | reg 6.26(2) |
| Inventory HSL threshold warnings | Schedule 9 Table 4, regs 10.26, 10.34 |
| Site Planner minimum legal elements checklist | reg 10.26(4)(b) |
| Checklist legal reference tooltips | reg 10.34 (all sub-clauses) |
| Certificate expiry term guidance | WorkSafe guidance (max 3 years) |
| Companies Number on client record | reg 6.26(2)(e)(ii) |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | Node.js 24 + Express 4 + TypeScript |
| Database | SQLite via `node:sqlite` (Node 24 built-in — no native compilation) |
| Monorepo | npm workspaces |
| Icons | Lucide React |
| Routing | React Router v6 |

---

## Project Structure

```
wilson_NewZealand/
├── apps/
│   ├── api/                  # Express REST API (port 8000)
│   │   ├── src/
│   │   │   ├── db/           # Database connection, schema, and auto-migrations
│   │   │   ├── routes/       # Route handlers (clients, assessments, certificates, etc.)
│   │   │   └── index.ts      # Express app entry point (serves web in production)
│   │   └── data/             # SQLite database (gitignored)
│   └── web/                  # React frontend (port 3000)
│       ├── src/
│       │   ├── components/   # Shared components (Layout, Modal, Toast, etc.)
│       │   ├── lib/          # API client wrapper, HSL thresholds
│       │   ├── pages/        # Page components per module
│       │   └── types/        # TypeScript interfaces
│       └── index.html
└── package.json              # Root workspace config
```

---

## Getting Started

### Prerequisites

- Node.js 24+
- npm 10+

### Installation

```bash
# Clone the repository
git clone https://github.com/ernestmoyo/wilson_app.git
cd wilson_app

# Install all dependencies (root + all workspaces)
npm install
```

### Development

```bash
# Start both API and web servers concurrently
npm run dev
```

- API: [http://localhost:8000](http://localhost:8000)
- Web: [http://localhost:3000](http://localhost:3000)

### Build for production

```bash
npm run build        # builds web then API
npm start            # starts the API which also serves the web app
```

In production the API serves the built React app as static files — a single process, single port, single URL.

---

## Database Migrations

Schema migrations run automatically on server startup. New columns are added safely (errors on duplicate columns are silently caught). Current auto-migrations cover:

- `certificates`: `is_conditional`, `condition_details`, `condition_deadline`, `applicant_notified`, `worksafe_notified`, `worksafe_registered`
- `clients`: `companies_number`
- `assessment_items`: `legal_ref`

No manual migration steps are required.

---

## API Reference

Base URL: `http://localhost:8000/api`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET/POST | `/clients` | List (with `assessment_count`, `certificate_count`) / create clients |
| GET/PUT/DELETE | `/clients/:id` | Get / update / delete client |
| GET/POST | `/assessments` | List / create assessments |
| GET/PUT/DELETE | `/assessments/:id` | Get / update / delete assessment |
| GET/POST | `/assessments/:id/items` | Get / bulk-replace checklist items |
| GET/POST | `/certificates` | List / create certificates |
| GET | `/certificates/expiring` | Certificates expiring within 90 days |
| GET/PUT/DELETE | `/certificates/:id` | Get / update / delete certificate |
| GET/POST | `/inventory` | List / create inventory items |
| PUT/DELETE | `/inventory/:id` | Update / delete inventory item |
| GET/POST | `/site-plans` | List / create site plans |
| PUT | `/site-plans/:id` | Update site plan |
| GET/POST | `/reports` | List / create reports |
| GET/POST | `/users` | List / create users |

---

## Deploying to Railway

This project is configured for single-service Railway deployment.

| Setting | Value |
|---|---|
| Build Command | `npm install && npm run build` |
| Start Command | `node apps/api/dist/index.js` |
| Environment Variables | `NODE_ENV=production`, `DATA_DIR=/data`, `NIXPACKS_NODE_VERSION=24` |
| Volume | Mount `/data` for persistent SQLite storage |

---

## Regulatory Context

Wilson Suite operates under:

- **Health and Safety at Work (Hazardous Substances) Regulations 2017 (LI 2017/131)**
  as administered by WorkSafe New Zealand (MBIE). Current version: 20 October 2025.
- **AS/NZS 60079.10.1** — Hazardous area classification
- **Fire and Emergency New Zealand (FENZ)** — Emergency response plan review requirements

Reference: [legislation.govt.nz](https://www.legislation.govt.nz)

---

## Security & Data Privacy

- All client data, database files (`.sqlite`), and private documents (`.pdf`, `.docx`) are excluded from version control via `.gitignore`
- The system is intended for single-certifier deployment with local data storage
- No data is transmitted to third-party services

---

## Developed By

**7Square Inc.**
Website: [www.7squareinc.com](https://www.7squareinc.com)
Email: [info@7squareinc.com](mailto:info@7squareinc.com)
Contact: Ernest Moyo

---

## License

Private — all rights reserved. This software is proprietary to Wilson Compliance and 7Square Inc.
