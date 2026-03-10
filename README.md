# Wilson Suite

**Hazardous Substances Location Compliance Management System**
Built for New Zealand Licensed Location Compliance Certifiers (LCCs) operating under the Health and Safety at Work (Hazardous Substances) Regulations 2017.

---

## Overview

Wilson Suite is a full-stack web application that digitises the entire compliance certification workflow — from pre-inspection through to certificate issuance and ongoing inventory management. Designed specifically for the New Zealand regulatory environment, it replaces paper-based checklists and manual certificate tracking with a modern, browser-based platform.

---

## Modules

| Module | Description |
|---|---|
| **Compliance Assessment** | Create and manage pre-inspection, site inspection, and validation assessments. Auto-populates the 21-item NZ HSW checklist (Sections A–J) for site inspections. |
| **Compliance Certificates** | Issue, track, and monitor WC-series certificates. Flags certificates expiring within 90 days and enforces grant/refuse/pending status workflows. |
| **Inventory Manager** | Record and maintain client hazardous substance inventories including hazard class, quantity, container details, SDS availability, and storage location. |
| **Site Planner** | HTML5 canvas-based site plan editor. Drag-and-drop placement of storage tanks, buildings, bunds, pipelines, and emergency features. Supports undo/redo and label editing. |
| **Reports** | Generate compliance reports and gap analyses linked to assessments. Supports print/PDF export. |
| **Clients** | Full client record management including legal entity details, site and postal addresses, NZBN, contact persons, and linked assessment history. |
| **Dashboard** | At-a-glance statistics: active clients, monthly assessments, certificates granted, expiring soon, and pending decisions. |

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
│   │   │   ├── db/           # Database connection and schema
│   │   │   ├── routes/       # Route handlers (clients, assessments, certificates, etc.)
│   │   │   └── index.ts      # Express app entry point
│   │   └── data/             # SQLite database (gitignored)
│   └── web/                  # React frontend (port 3000)
│       ├── src/
│       │   ├── components/   # Shared components (Layout, Modal, Toast, etc.)
│       │   ├── lib/          # API client wrapper
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

### Build

```bash
# Build API
npm run build -w apps/api

# Build web
npm run build -w apps/web
```

---

## API Reference

Base URL: `http://localhost:8000/api`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET/POST | `/clients` | List / create clients |
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

## Regulatory Context

Wilson Suite is designed to support compliance with:

- **Health and Safety at Work (Hazardous Substances) Regulations 2017**
- **AS/NZS 60079.10.1** (Hazardous area classification)
- **WorkSafe New Zealand** enforcement and notification requirements
- **Fire and Emergency New Zealand (FENZ)** emergency response plan review requirements

The 21-item site inspection checklist covers all mandatory inspection sections from A (Notification) through J (Site Plan), as required by the NZ HSW Regulations.

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
