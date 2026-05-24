# Ramex Store — CORE PLAN

> **This file is the single source of truth.** Every phase prompt instructs Claude Code to read this file end-to-end before doing anything. Do not deviate from it without explicit user approval.

---

## 1. Project Identity

- **Repo**: `ramex-store` (GitHub, private)
- **Vertical**: Fabric retail (sells fabric rolls; clothes branch is a separate repo built later)
- **Locale**: Arabic-only UI, RTL, Africa/Cairo timezone, EGP currency (2-decimal precision), Western digits (0-9)
- **Hosting**: Hostinger VPS

---

## 2. Tech Stack (locked)

### Backend
- Node.js 20 LTS, Express.js, TypeScript
- PostgreSQL 16.x
- Knex.js (migrations + query builder, raw SQL where needed)
- jsonwebtoken (JWT auth), bcrypt (password hashing)
- zod (validation)
- multer (file uploads — logo, damage photos)
- pino (structured logging)
- pdfmake (A4 invoice PDF generation, Arabic font: Cairo or Amiri)
- exceljs (Excel exports for reports)
- bwip-js (Code 128 barcode label generation)

### Frontend
- React 18 + TypeScript + Vite
- Tailwind CSS (RTL plugin enabled)
- shadcn/ui (component library — distinct from MUI)
- TanStack Query v5 (server state)
- React Router v6
- Zustand (light client state)
- react-hook-form + zod (forms + validation)
- date-fns (date utilities)
- Top-bar dropdown layout inspired by Verint Enterprise Scheduling

### Deployment
- Single Express server on Hostinger VPS, port 3000
- Express serves `/api/*` routes + falls back to React SPA `index.html`
- React built into `backend/public/` via Vite, served as static
- PM2 for process management
- PostgreSQL via Hostinger's bundled DB

> **Phase 0 amendment (2026-05-07)**: DB engine switched from MySQL 8.x to PostgreSQL 16.x at the user's request before any schema was written. All migrations are PG-native (`BIGSERIAL`, `BOOLEAN`, `JSONB`, native ENUM types). Knex client is `pg`.

### Repo Layout (monorepo)
```
ramex-store/
├── backend/          # Express + TypeScript
│   ├── src/
│   │   ├── api/        # Express routes
│   │   ├── domain/     # Business logic per module
│   │   ├── db/         # Knex client, migrations, seeds
│   │   ├── middleware/ # auth, audit, error handlers
│   │   ├── lib/        # PDF, Excel, barcode generation
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/         # React + Vite + TS
│   ├── src/
│   │   ├── pages/      # Route components per module
│   │   ├── components/ # Shared UI
│   │   ├── lib/        # api client, hooks
│   │   ├── i18n/       # Arabic strings
│   │   └── main.tsx
│   ├── package.json
│   └── tsconfig.json
├── .claude/          # Claude Code skills + agents (copied from ElGhonemy)
├── CORE_PLAN.md      # This file
├── README.md
└── package.json      # Root: scripts to build/run both
```

### Root package.json scripts
- `npm run dev` → backend + frontend in parallel (concurrently)
- `npm run build` → frontend build → copy to backend/public → backend tsc
- `npm run typecheck` → both packages
- `npm run db:migrate` / `db:migrate:rollback` / `db:seed`
- `npm run lint`
- `npm test` → smoke tests per phase

---

## 3. Architecture Context (full picture)

The owner has 3 systems planned:
- **ramex-store** (this repo) — Fabric branch
- **ramex-clothes** — Clothes branch (separate repo, separate DB, built later)
- **ramex-dashboard** — Owner cross-branch read-only dashboard (separate repo, built last)

This repo exposes **Owner read-only API endpoints** (Module 13) for the Dashboard to consume via JWT-on-behalf-of-Owner.

---

## 4. Roles

| Role | Purpose | Access |
|---|---|---|
| **Super Admin** | Platform bootstrap account | Everything Owner can do, PLUS user CRUD and role-permissions matrix |
| **Owner** | Business owner | Full admin for ops: see + edit settings, items, finance, inventory, reports — but NOT user management or permissions |
| **Shop Seller** (Ziad) | Daily POS operator | POS + customers + receive shipments + cash drawer |
| **Factory Sender** (Ahmed) | Factory side | Create outbound shipments only; sees Factory Warehouse stock |

> **Amendment 2026-05-24**: A 4th role `super_admin` was introduced above Owner at the explicit request of the business owner. Owner remains the business-side full admin for day-to-day ops. User CRUD and the role-permissions matrix moved from Owner to Super Admin exclusively. The Settings → "المستخدمون والصلاحيات" sub-section is hidden from Owner entirely and only visible to Super Admin. Super Admin is seeded once at install (`username: superadmin`, default password `ChangeMe123!` — must be changed on first login).

- User CRUD: Super Admin only.
- Password reset: Super Admin only (no self-service "forgot password").
- Concurrent sessions: blocked (same user cannot be logged into 2 devices simultaneously).
- No auto-logout on inactivity.
- Online-only (no offline mode); notify user if connectivity lost.

---

## 5. Audit Log

- Captures **sensitive actions only** (not every read).
- Sensitive = create/edit/delete on: users, settings, prices, stock, invoices, customers, payments, damage/loss, shipments.
- Schema: `id, user_id, action, entity, entity_id, before, after, ip, user_agent, created_at`.
- **Retention**: forever (no auto-purge).
- Visible to Owner only.

---

## 6. Module Decisions (the 14 locked modules)

### Module 1 — Auth & Roles
- 3 roles per §4. JWT auth. Owner-managed users.

### Module 2 — Branches & Warehouses
- 1 branch (the fabric shop), 2 warehouses: **Shop Warehouse**, **Factory Warehouse**.
- No inter-branch transfers.
- Factory treated as external supplier on books, but Ahmed has a login and his actions deduct Factory Warehouse stock.

### Module 3 — Items & Catalog
- Hybrid SKU model: **Master Fabric** (composition, width, grade) + **Color Variant** + **Roll batch**.
- Per-roll tracking: every roll = unique record.
- Required fields per master fabric: Grade, Width (cm), Composition (% breakdown).
- Required fields per roll: Roll SR# (factory), Color, Color code, Order #, Weight (kg), Status.
- Roll status: `in_stock | reserved | sold | damaged | sample | returned | written_off`.
- Pricing: **set per روول at shipment receive time by the shop seller** (NOT by the factory user, NOT at AddTop time). Reports compare POS sale price vs receive-time price to track per-invoice discount/diff. `fabric_color_prices` table exists for a future "suggested defaults" feature but is not consulted in the v1 flow.
- Single price tier (no B2B/B2C distinction).
- Sample flag = boolean on roll record (toggle hide/show from POS).
- "Roll" = الطوب in Arabic. Rename "لفات" → "توب" everywhere.
- Purchase price: **optional** field on roll.

### Module 4 — Inventory
- Stocktake supports **both roll-level (scan each)** and **aggregate-level (counts by fabric+color)**.
- Adjustments by Shop Seller allowed; audit + Owner notification.
- Damage/loss reasons (8 codes, all editable in Settings):
  1. Damage – In Transit
  2. Damage – In Shop
  3. Damage – Quality Defect
  4. Loss – Theft
  5. Loss – Misplaced
  6. Inventory Discrepancy
  7. Cutting / Sample Loss
  8. Other (free-text required)
- Disposition for **damage** codes (Ziad picks per event):
  - (a) Move roll to **Damaged Stock** sub-warehouse (still potentially sellable)
  - (c) **Return to factory** (factory takes back)
- Disposition for **loss** codes (4, 5): **auto-write-off**, audit, Owner notified with `سرقة` tag. UI surfaces only theft/misplaced/note fields.
- Approval threshold (EGP value): configurable in Settings. Above threshold → Owner approval blocking.
- Evidence: photo + note both **optional**.
- Damage/loss financial valuation: **selling price** (not purchase price).
- Daily closeout = **snapshot only**, no hard lock. Day rollover time **configurable in Settings**.
- Ziad **can see** Factory Warehouse stock.

### Module 5 — POS / Sales
- Cart entry: **scan or search** (both work).
- Discount: Ziad enters **target final price**; system back-calculates discount % auto.
- POS price override: yes (with audit; rare cases).
- Customer on sale: **strict required** (no walk-in fallback). Mid-sale customer creation allowed.
- Customer can pay against **credit balance** (rare).
- Sample roll visibility at POS: per-item **toggle button** in Items module (any roll can be hidden).
- Split payment: Cash, Instapay, OR both with Ziad manually entering each amount.
- Void: yes; configurable time limit in Settings; **Owner approval required**.
- **No discount cap** — Ziad can give any discount %, no Owner approval threshold for discounts.
- Open invoice with deposit: full reservation logic (rolls held, can't be sold to others).

### Module 6 — Customers
- Required: **Name, Phone**. Optional: Sec phone, Address, Tax #, Notes.
- Phone **unique** (enforced, no duplicates).
- Balance direction: cash typical, debt allowed (rare cases).
- Ledger displays: **all sales history**, **open invoices with age**, **lifetime EGP volume** (↑ on purchase, ↓ on refund).
- Mid-sale create: yes.
- No customer-specific pricing, no merge, no archive.

### Module 7 — Payments / Cash & Bank
- Payment methods v1: **Cash + Instapay only**.
- **Cash Drawer** = cumulative model: initial opening balance set **once** at system setup, sales **add** to it, outflows **subtract**, no daily reset.
- **Bank Vault** = receives Instapay; manual daily reconciliation against actual bank statement.
- Multiple bank accounts supported; "active" account configurable.
- Cash outflow types: **Refund / Expenses / Cash-to-Bank deposit / Owner withdrawal** (no "Other").
- End-of-day cash count: physical entered, system shows expected, **discrepancy → log + flag + Owner notification, no block**.
- Refund payment method: **Ziad's choice** (cash or Instapay) regardless of original sale method.
- Expenses: reason codes (rent, utilities, supplies, salary, repair, other — editable in Settings); photo optional; threshold-based approval.

### Module 8 — Invoices
- 4 statuses: `Open` (deposit paid) → `Closed-Pending Pickup` (paid, not delivered) → `Completed` (delivered) | `Cancelled`.
- Number format: **`INV-YYYY-NNNNNN`**, sequence resets every January 1st.
- Min deposit % to open: configurable in Settings.
- **No multiple deposits**: one deposit at open, one final payment to close.
- Reserved rolls: **visible as "Reserved"** in inventory.
- **No swap** of reserved rolls — customer changes mind = cancel + create new.
- Stale invoice: **notify only, never auto-cancel**. Trigger days configurable in Settings.
- Edits: `Open`=editable+audit / `Closed-Pending`=locked / `Completed`=locked (void only).
- Reprint: any invoice anytime, watermark `نسخة طبق الأصل`.
- Pickup event: **Mark Delivered button + audit** (no barcode scan, no signature).
- Cancellation with deposit: Ziad picks **full refund / partial refund / kept as customer credit**.

### Module 9 — Receipt (Customer-facing print)
- Format: **A4 PDF only**.
- Language: Arabic only, dd/mm/yyyy.
- Header: Logo + Address + Phone + Tax ID + Invoice # + Cashier name (no shop-name text — logo carries identity).
- Customer block: Name + Phone + Customer code + Address.
- Items table columns: Description (fabric + color) | Roll SR# | Weight (kg) | Price/kg | Total/roll | Discount | Final.
- Hide tax column when tax disabled in Settings.
- Footer: Subtotal | Cart discount | Tax (conditional) | Rounding | Total | Payment breakdown (Cash X / Instapay Y) | Deposit + Balance for open invoices.
- Warning text: **editable in Settings**. Default: `الطوب بعد القص غير مرتجع. يوجد استبدال خلال ١٤ يوم من تاريخ الشراء.`
- Variants: Open (`فاتورة مفتوحة` watermark), Reprint (`نسخة طبق الأصل` watermark), Refund slip (separate).

### Module 10 — Barcode System
- **Hybrid**: store factory's barcode (external_id) AND system's own barcode (primary). Either scans the same roll.
- Format: **Code 128** for both.
- In-shop label printing: yes (thermal label printer; sticker per roll).
- Hardware: USB handheld Code 128 scanner (acts as keyboard). Phone camera fallback supported.
- Scan workflows: POS cart, stocktake, factory shipment receive, return identification.
- **No scan at pickup** (button-only).
- Unrecognized barcode at POS: error `Roll not found`. No on-the-fly registration.
- Lost/damaged label: search by fabric+color+Roll SR# → reprint with audit.

### Module 11 — Notifications
- Channel v1: **In-app bell icon only** (no email/SMS/WhatsApp/push).
- Auto-archive: 7 days.
- No mute/snooze (always on).
- Approval-blocking: yes — Ziad's action is held until Owner approves.
- Event catalog:
  | Event | Recipient | Severity |
  |---|---|---|
  | Stale open invoice | Owner | Medium |
  | Stock adjustment by Ziad | Owner | Low |
  | Sale void / invoice cancellation | Owner | Medium |
  | Cash discrepancy at close | Owner | High |
  | Damage/loss logged | Owner | Low |
  | Theft/Misplaced (`سرقة` tag) | Owner | Critical |
  | Factory shipment arrived | Ziad | Medium |
  | Shipment partially rejected | Owner | Medium |
  | Approval needed (over threshold) | Owner | High (blocking) |
  | Return/Exchange processed | Owner | Low |

### Module 12 — Reports
- Daily/Shift Report (one shift per day) sections: sales summary, total discounts, refunds/voids, cash drawer movements, bank vault movements, sales by fabric+color+roll, open invoices opened/closed today, stock movements.
- Build all 10 secondary reports: Sales by fabric/color · Customer ledger · Outstanding open invoices · Stocktake/Inventory · Cash flow · Bank reconciliation · Expenses · Damage/loss · Sales by payment method · Audit log.
- Export: **PDF + Excel + Direct A4 print**.
- Date presets: Today / Yesterday / This Week / This Month / Custom.
- No auto-email of reports (on-demand only).
- Per-role visibility: configurable from Owner Dashboard / Settings (permissions matrix).

### Module 13 — Owner Role & API Surface
- Owner role inside this app: **full admin** (see + edit everything).
- API endpoints (read-only) for future Owner Dashboard:
  - `GET /api/owner/summary/today`
  - `GET /api/owner/cash-position`
  - `GET /api/owner/open-invoices`
  - `GET /api/owner/stock-summary`
  - `GET /api/owner/top-fabrics`
  - `GET /api/owner/notifications`
  - `GET /api/owner/audit-log`
  - `GET /api/owner/expenses-summary`
  - `GET /api/owner/damage-loss`
- Auth: JWT on behalf of Owner user (every API call audited as Owner).
- Approvals page: lives in this app; dashboard mirrors via API.
- Cross-branch aggs to expose: daily totals, hourly sales curve, inventory turnover ratio.

### Module 14 — Settings
| Section | Items |
|---|---|
| General | Logo upload, Address, Phone, Tax ID, Receipt warning text |
| Tax | Enable/disable toggle, single rate (%), label |
| POS | Min deposit %, void time limit, approval threshold (EGP), stale invoice days, return/exchange window (days) |
| Cash Drawer | Initial opening balance (set once) |
| Bank Accounts | CRUD + active flag |
| Receipt | Logo, header field toggles, warning text, A4 layout |
| Users & Roles | User CRUD, role permissions matrix **(super admin only — hidden from Owner)** |
| Reason Codes | Damage/loss codes (editable), expense categories (editable), cancellation reasons (editable) |
| Day Rollover | Time of day for daily report cutoff |
| System | Audit retention=forever (read-only display) |

---

## 7. Returns & Exchanges (cross-cutting)

- Window **configurable in Settings** (default 14 days).
- **Partial returns** supported (sold 3 rolls, return 1).
- Returned roll: status flips back to `in_stock`, sellable again, audit entry retained.
- Refund payment method: **Ziad picks** (cash from drawer or Instapay).
- Triggers `Return/Exchange processed` notification to Owner.

---

## 8. Factory Shipment Flow (cross-cutting) — THE ONLY entry path for رولات

0. Ahmed (Factory Sender) first **adds رولات via the AddTop wizard** — رولات land in Factory Warehouse with `status='in_stock'`, no selling price. Barcodes printed at this step.
1. Ahmed creates a shipment and **picks from existing factory رولات** (scan or table picker). No inline roll creation from CreateShipment.
2. Whole shipment = single transaction unit.
3. On submit → shipment marked `Pending Approval` (رولات remain in Factory Warehouse, locked into the shipment line).
4. Ziad receives notification.
5. Ziad reviews; for each accepted روول he **enters the selling price (ج.م/كجم)** before accepting. Can **partial-approve** (subset of rolls accepted) or full-reject.
6. Finalize: accepted رولات → Shop Warehouse with `selling_price_egp` set, `received_at` stamped, `status` stays `in_stock`. Audit event `set_selling_price_at_receive` per accepted line.
7. Rejected رولات → stay in Factory Warehouse + audit + Owner notification.
8. **Ziad books the purchase invoice manually** after approval (separate transaction).
9. Purchase price field = **optional** on the روول (can be entered at AddTop time as factory cost reference); Ziad sets/edits final value at booking.

---

## 9. Initial System Seeding (Day 1)

- **Manual entry only** (no bulk Excel import in v1).
- Owner creates: users, fabric masters, colors, initial bank accounts, opening cash drawer balance, settings.
- Initial roll inventory: **goes through the same factory shipment flow** as everything else — Ahmed (or Owner acting as factory) adds رولات in AddTop (lands in Factory Warehouse), creates a shipment, Ziad receives and prices. There is no longer a "system seeding" backdoor that places رولات directly into the Shop Warehouse.

---

## 10. Hard Constraints (non-negotiable)

1. **Arabic-only UI** with full RTL.
2. **EGP currency**, 2-decimal precision.
3. **Western digits** in numeric displays (0–9), not Arabic-Indic.
4. **Africa/Cairo timezone** for all timestamps.
5. **Egyptian phone validation**: format `01[0125]XXXXXXXX` (11 digits starting with 010/011/012/015).
6. **Audit log on every sensitive action**.
7. **Online-only**: detect offline → toast notification, block writes.
8. **Concurrent sessions blocked** per user.
9. **No customer data deletion** (no merge, no archive, no hard delete on customers).
10. **Roll IDs immutable** once created.

---

## 11. Glossary (Arabic ↔ Internal)

| Arabic | Internal | Meaning |
|---|---|---|
| توب | roll | One fabric roll (variable weight) |
| طوب | roll | Same as above (alt spelling in some notes) |
| لفة | (legacy) | Old word for roll; renamed to توب in UI |
| خامة | fabric | Fabric type (master record) |
| مخزن المحل | shop_warehouse | Shop's warehouse |
| مخزن المصنع | factory_warehouse | Factory's warehouse |
| طلبية | shipment | Factory → shop shipment |
| فاتورة مفتوحة | open_invoice | Invoice with deposit paid, balance due |
| نسخة طبق الأصل | reprint_watermark | Reprint marker text |
| سرقة | theft_tag | Theft/misplaced notification tag |
| وردية | shift | Daily shift (one per day) |
| جرد | stocktake | Inventory count |
| خصم | discount | Discount on sale |
| عربون | deposit | Open-invoice deposit |
| استبدال | exchange | Exchange within return window |
| مصروفات | expenses | Cash drawer outflows for ops |
| خزنة | drawer/vault | Cash drawer or bank vault |

---

## 12. Phase Map

| # | Phase | Model | Mode |
|---|---|---|---|
| 0 | Foundation | Opus 4.7 | Plan |
| 1 | Items & Catalog | Sonnet 4.6 | Execute |
| 2 | Inventory + Factory Shipments | Opus 4.7 | Execute |
| 3 | Customers | Sonnet 4.6 | Execute |
| 4 | POS Core | Opus 4.7 | Execute |
| 5 | Open Invoices & Deposits | Opus 4.7 | Execute |
| 6 | Cash & Bank | Sonnet 4.6 | Execute |
| 7 | Returns & Exchanges | Sonnet 4.6 | Execute |
| 8 | Barcode System | Sonnet 4.6 | Execute |
| 9 | Notifications | Sonnet 4.6 | Execute |
| 10 | Reports | Sonnet 4.6 | Execute |
| 11 | Owner APIs + Settings Polish | Sonnet 4.6 | Execute |

Each phase commits directly to `main`. Pre-flight: read this file. Post-flight: build passes, migrations apply + rollback, push to GitHub.
