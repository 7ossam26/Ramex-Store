# Navigation Audit — pre v1.1 Phase 1

Baseline of every reachable route in `v1.0.0` (12 phases shipped, last commit `72bc722 feat(phase-12): forms pass`). This is the **regression baseline** for the v1.1 Phase 1 navigation rebuild: every URL listed below must continue to render after the Verint-style shell ships, either at the same path or behind a permanent redirect from the same path.

Source of truth: `frontend/src/App.tsx` at commit `72bc722` and `frontend/src/components/Layout/TopBar.tsx` (the pre-redesign top bar — since deleted on `v1.1/phase-1-ui-foundation`).

## Top-level destinations (pre-redesign)

These were the categories the old `TopBar` + `ModuleDropdown` exposed. Order matches the visual order at the time of the audit.

| # | Category | Landing path | Permission |
|---|---|---|---|
| 1 | الرئيسية | `/` | all roles |
| 2 | نقطة البيع | `/pos` | `owner`, `shop_seller` |
| 3 | اللفات والملصقات | `/items/rolls` | all roles |
| 4 | المخزون | (dropdown, no landing) | all roles |
| 5 | الشحنات | `/shipments` | `owner`, `shop_seller`, `factory_sender` |
| 6 | العملاء | `/customers` | all roles |
| 7 | الفواتير والمرتجعات | (dropdown, no landing) | all roles |
| 8 | الخزينة | (dropdown, no landing) | all roles |
| 9 | التقارير | `/reports/daily` | all roles |
| 10 | الموافقات | `/approvals` | `owner`, `shop_seller` |
| 11 | الإعدادات | `/settings` | `owner` |

## Every reachable URL

Grouped by category. Every entry must remain reachable after Phase 1.

### Login / Home
- `GET /login` — login page (unauthenticated)
- `GET /` — home / dashboard

### POS
- `GET /pos` — register

### Items / Rolls / Labels
- `GET /items/rolls` — rolls list
- `GET /items/labels` — labels print queue

### Inventory
- `GET /inventory/stock-movements`
- `GET /inventory/stocktake`
- `GET /inventory/adjustments`
- `GET /inventory/damage`

### Shipments
- `GET /shipments` — list (all statuses)
- `GET /shipments/create` — create shipment
- `GET /shipments/pending` — list filtered to `pending_approval`
- `GET /shipments/:id` — review shipment

### Customers
- `GET /customers` — list
- `GET /customers/:id` — detail

### Invoices & Returns
- `GET /invoices` — list
- `GET /invoices/:id` — detail
- `GET /returns` — list
- `GET /returns/:id` — detail

### Treasury (cash / banks / expenses)
- `GET /cash` — cash drawer
- `GET /banks` — banks
- `GET /expenses` — expenses
- `GET /reconcile` — reconciliation

### Notifications
- `GET /notifications` — list / archive

### Reports
- `GET /reports/daily` — daily report
- `GET /reports/secondary/:reportKey` — one of 10 secondary reports

### Settings & Approvals
- `GET /settings` — settings + permissions matrix (owner only)
- `GET /approvals` — pending approvals

## URL stability commitment

Every URL above stays at the same path under the new shell. No redirects required for pre-v1.1 URLs.

## New routes added in v1.1 Phase 1

For completeness — these are net-new hub landings introduced by the redesign and are not part of the regression baseline:

- `GET /items` — items hub (rolls / labels / add top)
- `GET /items/tops/add` — add top form (new)
- `GET /inventory` — inventory hub
- `GET /inventory/fabrics` — fabrics (new)
- `GET /invoices-returns` — invoices & returns hub
- `GET /treasury` — treasury hub
- `GET /reports` — reports hub

## How to verify regression

Manual: log in as `owner`, visit every URL in the "Every reachable URL" section, assert a recognisable page heading renders.

Automated (deferred to Phase 2): the Phase 1 prompt asks for `tests/e2e/navigation-smoke.spec.ts` via Playwright. Playwright is not configured in this repo (no `tests/` dir, only Vitest under `frontend/src`). Phase 2 is the "Investigation Sweep" phase and stands up Playwright MCP — the smoke test is folded into that work to avoid duplicating tooling setup. The deferral is captured in the Phase 1 commit body.
