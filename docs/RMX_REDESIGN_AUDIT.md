# RMX Store — Redesign Audit (Phase 1 / Part A)

> Authoritative snapshot of the codebase at the start of the `rmx-new-ui` cycle. Every later phase references this document for IA, primitives, tokens, and risk surface. **The codebase is the source of truth — not screenshots.**

Branch: `phase-1/foundations`. Base of audit: `rmx-new-ui` HEAD (`4e78f68`, ahead of `main` only by docs/memory files).

---

## 1. Stack

### Frontend (workspace `frontend/`, npm workspace `@ramex/frontend`)

| Concern | Choice | Version |
|---|---|---|
| Framework | React | `^18.3.1` |
| Language | TypeScript | `^5.6.0` |
| Build tool | Vite | `^5.4.0` |
| Plugin | `@vitejs/plugin-react` | `^4.3.0` |
| Package manager | npm workspaces | root `package.json` declares `["backend", "frontend"]` |
| Node engine | `>=20` | root |
| CSS | Tailwind CSS | `^3.4.0` |
| Tailwind plugin | `tailwindcss-animate` | `^1.0.7` (only Tailwind plugin in use) |
| Component lib | shadcn/ui (Radix primitives + cva) | per `frontend/components.json` — style `new-york`, baseColor `neutral`, `cssVariables: true` |
| Forms | react-hook-form + `@hookform/resolvers` + zod | `^7.53.0` / `^3.9.0` / `^3.23.0` |
| Routing | react-router-dom | `^6.28.0` |
| Server state | `@tanstack/react-query` | `^5.59.0` |
| HTTP client | axios | `^1.7.7` |
| Client state | zustand (**declared but unused** — see §10) | `^5.0.0` |
| Icons | lucide-react | `^0.460.0` |
| Date | date-fns | `^4.1.0` |
| Barcode | jsbarcode, `@zxing/browser`, `@zxing/library` | scanner + Code128 render |
| Class helpers | clsx + tailwind-merge + class-variance-authority | wrapped in [`frontend/src/lib/utils.ts`](frontend/src/lib/utils.ts) as `cn()` |

### Backend (workspace `backend/`)

Express.js + TypeScript + Knex + PostgreSQL 16. Layout: `backend/src/{api, config, db, domain, lib, middleware}` + `server.ts`. **Out of scope for re-skin** but listed because the root build copies the React bundle into the backend's static dir, and the dev server runs on port 3000 (Vite proxies `/api` → 3000).

### Test / lint / format

| Tool | Where | Notes |
|---|---|---|
| Test runner | vitest `^2.1.0` + jsdom + `@testing-library/react` | `frontend/vitest.config.ts`, `frontend/tests/` |
| Linter | ESLint 9 (`@typescript-eslint/*` 8.x) | **No ESLint config file present in `frontend/`** — `npm run lint` will fail unless one is added before Phase 7's a11y/lint gates. Flagged in §15. |
| Formatter | None declared | No Prettier in deps |
| Typecheck | `tsc --noEmit -p tsconfig.json` | `npm run typecheck` works in both workspaces |

### Commands (run from repo root)

```bash
npm run dev          # backend + frontend in parallel via concurrently
npm run build        # frontend build → copy bundle to backend/public → backend tsc → copy PDF fonts
npm run typecheck    # both workspaces
npm run lint         # both workspaces (frontend will fail until ESLint config exists)
npm test             # both workspaces
npm run db:migrate / db:migrate:rollback / db:seed   # backend Knex
```

Per-workspace: same scripts via `npm run <script> -w frontend`.

---

## 2. Routing

Pattern: **react-router-dom v6 nested Routes**, declared in [`frontend/src/App.tsx`](frontend/src/App.tsx).

Top of the tree:

```
/login  → LoginPage (unauthenticated)
/*      → <ProtectedRoute><AppShell><inner Routes/></AppShell></ProtectedRoute>
```

Inside `AppShell` there is a single flat `<Routes>` block — no nested route files, no lazy chunks, no data-router/createBrowserRouter. Routing-relevant providers (`BrowserRouter`, `QueryClientProvider`, `OnlineStatusProvider`, `AuthProvider`) wrap `<App />` in [`frontend/src/main.tsx`](frontend/src/main.tsx).

`<ProtectedRoute>` is at [`frontend/src/components/ProtectedRoute.tsx`](frontend/src/components/ProtectedRoute.tsx).

---

## 3. AppShell / Layout

| Component | Path | Role |
|---|---|---|
| `AppShell` | [`frontend/src/components/Layout/AppShell.tsx`](frontend/src/components/Layout/AppShell.tsx) | Root frame: `min-h-screen flex flex-col` → `<OfflineToast>` + `<TopHeader>` + flex-row `[<LeftRail> + <main>]`. Branches to bare container for POS; otherwise wraps children in `<SectionShell>`. |
| `TopHeader` | [`frontend/src/components/Layout/TopHeader.tsx`](frontend/src/components/Layout/TopHeader.tsx) | 56px sticky bar (`h-14`). Hosts mobile drawer trigger, R-tile logo, app name "رامكس ستور", active-category breadcrumb, `<NotificationBell>`, `<UserMenu>`. **No global search trigger yet** (⌘K planned in Phase 2). |
| `LeftRail` | [`frontend/src/components/Layout/LeftRail.tsx`](frontend/src/components/Layout/LeftRail.tsx) | Vertical rail. `hidden lg:flex` — desktop only. Width 56px collapsed / 224px expanded (`w-14`/`w-56`); collapsed state persisted to `localStorage` under `rail.collapsed`. Includes its own client-side search filter over rail items + sub-tabs. **Note:** the file is named `LeftRail` but with `dir="rtl"` on `<html>` and a `flex-row` parent, the rail renders **visually on the right** — matches the redesign plan's "RTL right-side icon rail" requirement. Border uses `border-e` (border-inline-end). |
| `SectionShell` | [`frontend/src/components/Layout/SectionShell.tsx`](frontend/src/components/Layout/SectionShell.tsx) | Page container. Sticky sub-tab nav at `top-14` for sections that have sub-tabs; renders `{children}` in a `p-3 md:p-6` div. **Bypassed for POS** (POS gets a plain `p-3 md:p-6` wrapper without sub-tabs). |
| `MobileNavDrawer` | [`frontend/src/components/Layout/MobileNavDrawer.tsx`](frontend/src/components/Layout/MobileNavDrawer.tsx) | `<` lg drawer triggered from `TopHeader`. Uses shadcn `<Sheet>` (`side="right"`). Renders `<details>` accordions for sections with sub-items. |
| `HubLanding` | [`frontend/src/components/Layout/HubLanding.tsx`](frontend/src/components/Layout/HubLanding.tsx) | Shared card grid for section landings (Items, Inventory, Treasury, Invoices/Returns, Reports). Single source of truth — every landing today renders through this. |
| `OfflineToast` | [`frontend/src/components/Layout/OfflineToast.tsx`](frontend/src/components/Layout/OfflineToast.tsx) | Full-width red banner when `online-status` provider reports offline. Hard-coded `bg-red-600` (token follow-up in Phase 7 cleanup). |
| `UserMenu` | [`frontend/src/components/Layout/UserMenu.tsx`](frontend/src/components/Layout/UserMenu.tsx) | Avatar + dropdown (shadcn dropdown-menu). |
| `nav-config` | [`frontend/src/components/Layout/nav-config.ts`](frontend/src/components/Layout/nav-config.ts) | Central navigation source. Exports `railItems`, `subTabsBySection`, `activeSectionForPath`, `visibleRailItems`, `visibleSubTabs`. Already typed (`SectionKey`, `RailItem`, `SubTab`). **Phase 2's new central `nav.config.ts` should extend / replace this file rather than start from scratch.** |

---

## 4. Existing tokens / theme / Tailwind config

### Token system: **HSL CSS variables wired into Tailwind colors via `hsl(var(--…) / <alpha-value>)`**.

[`frontend/src/index.css`](frontend/src/index.css) (full file):

```css
:root {
  --color-canvas: 36 25% 94%;
  --color-ink: 0 0% 10%;
  --color-primary: 240 35% 25%;
  --color-primary-foreground: 36 25% 96%;
  --color-accent: 33 47% 49%;
  --color-accent-foreground: 0 0% 10%;
  --color-muted: 36 15% 88%;
  --color-muted-foreground: 0 0% 30%;
  --color-border: 36 15% 80%;
  --color-ring: 240 35% 25%;
}
html { font-family: 'Cairo', system-ui, sans-serif; }
body { @apply bg-canvas text-ink antialiased; }
```

[`frontend/tailwind.config.ts`](frontend/tailwind.config.ts):

- Content: `./index.html`, `./src/**/*.{ts,tsx}`.
- `fontFamily.sans`: `['Cairo', 'system-ui', 'sans-serif']`.
- `colors`: `canvas`, `ink`, `primary{,-foreground}`, `accent{,-foreground}`, `muted{,-foreground}`, `border`, `ring` — all reading the CSS vars above.
- `borderRadius`: `DEFAULT: '8px'`, `tight: '4px'`. (No `sm`/`md`/`lg`/`xl`/`2xl`/`pill` scale yet.)
- No spacing scale extension. No shadow scale extension. No motion / duration / easing tokens. No breakpoint overrides. No z-index scale. No typography scale.
- Plugins: `tailwindcss-animate` only.

### What this means for Phase 1 Part C

- The HSL-vars-in-Tailwind pattern is **the right substrate** — keep it. Extend, don't replace.
- Add the missing scales (spacing, radius, shadow, motion, breakpoints, z-index, typography) per the Phase 1 prompt § "Translate MASTER.md".
- Rename / re-scope the color tokens to match the Re-Skin Standard vocabulary (`surface`, `chrome-surface`, `surface-elevated`, `surface-row-alt`, `text-default`, `text-muted`, `text-tertiary`, `border-subtle`, `border-default`, `accent`, `accent-hover`, `success`/`-subtle`, `warning`/`-subtle`, `danger`/`-subtle`, `info`/`-subtle`). The current `canvas/ink/primary/accent/muted/border/ring` set maps cleanly into a subset — see Open Questions §16 for naming strategy.

---

## 5. Fonts

- **Current**: Cairo, 400/500/600/700, loaded from Google Fonts CDN via `<link>` in [`frontend/index.html`](frontend/index.html). Preconnect hints present. `font-display: swap` (set by Google CSS).
- **Hard-coded everywhere**: `tailwind.config.ts` `fontFamily.sans` + `index.css` `html { font-family: 'Cairo', ... }`.
- **Not self-hosted.** No `frontend/public/` directory currently exists; `public/fonts/` will need to be created in Phase 1 Part C.
- **Target per redesign plan**: IBM Plex Sans Arabic (300/400/500/600/700) + IBM Plex Sans (400/500/600/700), self-hosted woff2 with `unicode-range`.
- PDF fonts (Cairo .ttf etc.) for invoice rendering live in the backend, copied by `scripts/copy-pdf-fonts.mjs` during build. **Separate from UI fonts — do not touch.**

---

## 6. UI primitives

All in [`frontend/src/components/ui/`](frontend/src/components/ui/), generated via shadcn/ui (new-york style, Radix-based). Pinned `@radix-ui/*` deps confirm the origin.

| Primitive | Path | Radix dep | Notes |
|---|---|---|---|
| Button | [`button.tsx`](frontend/src/components/ui/button.tsx) | `react-slot` | cva variants: `default`/`outline`/`ghost`/`accent`; sizes `default`/`sm`/`lg`. Focus ring uses `ring-ring` token. |
| Card | [`card.tsx`](frontend/src/components/ui/card.tsx) | — | Header/Title/Content sub-parts. |
| Dialog | [`dialog.tsx`](frontend/src/components/ui/dialog.tsx) | `react-dialog` | Standard shadcn dialog (overlay + content + portal). |
| DropdownMenu | [`dropdown-menu.tsx`](frontend/src/components/ui/dropdown-menu.tsx) | `react-dropdown-menu` | Used by UserMenu. |
| Input | [`input.tsx`](frontend/src/components/ui/input.tsx) | — | Plain styled `<input>`. |
| Label | [`label.tsx`](frontend/src/components/ui/label.tsx) | `react-label` | |
| Sheet | [`sheet.tsx`](frontend/src/components/ui/sheet.tsx) | `react-dialog` | Used by MobileNavDrawer (right-side drawer). |
| **Toast / Tooltip / Tabs / Table / Badge / Drawer / Popover / Skeleton / Select / Checkbox / Switch / RadioGroup** | — | — | **Not implemented as ui/ primitives yet.** Status badges, tabs, tables, toggles, etc. are inlined per page (see §13). `@radix-ui/react-toast` is in deps but never imported. |

App-level (non-ui) shared components in `frontend/src/components/`:

| Component | Path | Notes |
|---|---|---|
| `Code128` | [`Code128.tsx`](frontend/src/components/Code128.tsx) | jsbarcode wrapper. Only file with explicit hex (`#000000`/`#ffffff` — intentional, barcode rendering). |
| `MobileFilterSheet` | [`MobileFilterSheet.tsx`](frontend/src/components/MobileFilterSheet.tsx) | Filter UI wrapped in Sheet for mobile. |
| `NotificationBell` | [`NotificationBell.tsx`](frontend/src/components/NotificationBell.tsx) | Bell + popover with severity tints (hard-coded `bg-red-500`/-100, `bg-green-100`, etc.). |
| `ProtectedRoute` | [`ProtectedRoute.tsx`](frontend/src/components/ProtectedRoute.tsx) | Auth gate. |
| `ResponsiveDialog` | [`ResponsiveDialog.tsx`](frontend/src/components/ResponsiveDialog.tsx) | Dialog/Sheet split by breakpoint. |
| `ResponsiveTable` | [`ResponsiveTable.tsx`](frontend/src/components/ResponsiveTable.tsx) | Table → stacked-card pattern on mobile. **Pre-existing — Phase 4 should reuse, not re-invent.** |
| `ScannerInput` | [`ScannerInput.tsx`](frontend/src/components/ScannerInput.tsx) | Barcode scanner input (keyboard + ZXing fallback). |
| `customers/QuickCreateModal` | [`customers/QuickCreateModal.tsx`](frontend/src/components/customers/QuickCreateModal.tsx) | Mid-sale customer create. |

---

## 7. Motion library

**None beyond `tailwindcss-animate`** (which only provides the `accordion`/`fade` keyframes that Radix expects). No `framer-motion`, no Motion One, no React Spring. No custom keyframes in `index.css`.

The Phase 1 prompt does **not** install a motion library — that decision is deferred to Phase 2 per the plan. Phase 1 only lands the motion **tokens** (durations, easings) and the `[data-motion="reduced"]` scope. No transform animations currently exist in the codebase, so the reduced-motion override has nothing to suppress yet.

---

## 8. i18n + RTL pattern

- **i18n**: single monolithic Arabic string table at [`frontend/src/i18n/ar.ts`](frontend/src/i18n/ar.ts) exporting `ar` (nested object). No i18next, no react-intl, no pluralization library. Strings are imported as `ar.<section>.<key>`. Notifications strings live in a sibling file `frontend/src/i18n/notifications.ts`.
- **RTL setup**: hard-coded on `<html>` in [`frontend/index.html`](frontend/index.html) → `<html lang="ar" dir="rtl">`. No RTL-flipping plugin (e.g. `tailwindcss-rtl`) — components use **logical CSS properties** (`ps-`/`pe-`, `border-e`, `start-`/`end-`) supplied by Tailwind 3.4 natively.
- **Discipline**: most files use logical pairs correctly. Hot spots that use directional `left/right` literals (`right-1`, `top-1`, `mr-2`, `ml-1`) appear in `NotificationBell.tsx`, `ApprovalsPage.tsx`, settings sub-nav. These will need Phase 2/7 sweeps to convert.

---

## 9. Asset pipeline

- Default Vite static-asset pipeline. No `frontend/public/` directory present.
- No SVG inlining plugin, no SVGR, no asset-versioning helper.
- Backend bundles PDF fonts via [`scripts/copy-pdf-fonts.mjs`](scripts/copy-pdf-fonts.mjs) into `backend/dist/fonts/` during build. That serves invoice PDFs (Cairo TTF) — unrelated to UI fonts.
- Root build pipeline (`scripts/copy-frontend-to-backend.mjs`) moves the Vite build into the backend's static directory so a single Express process serves the SPA.

Phase 1 Part C will need to create `frontend/public/fonts/` (for self-hosted IBM Plex woff2) and `frontend/public/brand/` (for RMX logos). Both will be served by Vite at root and copied alongside the bundle into the backend's static dir at build.

---

## 10. State management

- **Server state**: TanStack Query v5. Single `QueryClient` instantiated in [`frontend/src/lib/query-client.ts`](frontend/src/lib/query-client.ts), provided at the root in [`frontend/src/main.tsx`](frontend/src/main.tsx). Query keys are ad-hoc per page (`['settings-all']`, `['owner-summary-today']`, `['codes-grades-all']`, etc.).
- **Auth state**: React context via `AuthProvider` in [`frontend/src/lib/auth.tsx`](frontend/src/lib/auth.tsx). Token stored in `localStorage` (`ramex_token`).
- **Online status**: React context via `OnlineStatusProvider` in [`frontend/src/lib/online-status.tsx`](frontend/src/lib/online-status.tsx).
- **Local UI state**: React `useState`/`useReducer` per component. No central client store.
- **Zustand**: declared in `package.json` but **not imported anywhere** (`grep` finds zero usage). Either remove in Phase 7 cleanup or claim for a future use case — flag in §16.
- **Persisted preferences** in `localStorage`:
  - `ramex_token` — JWT
  - `rail.collapsed` — `'0' | '1'` rail toggle

---

## 11. API layer (PATTERN — do not touch)

| Concern | Detail |
|---|---|
| HTTP client | Single axios instance: [`frontend/src/lib/api.ts`](frontend/src/lib/api.ts), `baseURL: '/api'`. |
| Auth | Request interceptor injects `Authorization: Bearer ${localStorage.ramex_token}`. Response interceptor on 401 → clear token + redirect to `/login`. |
| Dev proxy | Vite dev server: `/api` → `http://localhost:3000` (see [`frontend/vite.config.ts`](frontend/vite.config.ts)). |
| Domain modules | One file per domain in `frontend/src/lib/`: `approvals-api.ts`, `codes-api.ts`, `customers-api.ts`, `finance-api.ts`, `inventory-api.ts`, `items-api.ts`, `notifications-api.ts`, `owner-api.ts`, `reports-api.ts`, `returns-api.ts`, `sales-api.ts`, `settings-api.ts`. Each exports an `xxxApi` object of functions. |
| Types | Co-located in `lib/<domain>-types.ts` for several domains. |
| Mutation pattern | `useMutation` + `qc.invalidateQueries({ queryKey: [...] })` on success. |

**Re-skin constraint:** No `*-api.ts`, no `*-types.ts`, no `query-client.ts`, no `axios` interceptors, no provider chain may be edited in Phases 3–6. Components consume these unchanged.

---

## 12. Information Architecture — full route crawl

Source of truth: [`frontend/src/App.tsx`](frontend/src/App.tsx) (routes), [`frontend/src/components/Layout/nav-config.ts`](frontend/src/components/Layout/nav-config.ts) (rail + sub-tabs), individual hub pages (Level-3 children).

### Top-level (rail order, RTL — Home appears top of rail)

| # | Arabic label | `SectionKey` | Landing route | Permission | Page file |
|---|---|---|---|---|---|
| 1 | الرئيسية | `home` | `/` | all | [`pages/Home.tsx`](frontend/src/pages/Home.tsx) |
| 2 | نقطة البيع | `pos` | `/pos` | `owner`, `shop_seller` | [`pages/pos/POS.tsx`](frontend/src/pages/pos/POS.tsx) |
| 3 | الأصناف | `items` | `/items` | all | [`pages/items/ItemsHub.tsx`](frontend/src/pages/items/ItemsHub.tsx) |
| 4 | المخزون | `inventory` | `/inventory` | all | [`pages/inventory/InventoryHub.tsx`](frontend/src/pages/inventory/InventoryHub.tsx) |
| 5 | الطلبيات | `shipments` | `/shipments` | `owner`, `shop_seller`, `factory_sender` | [`pages/shipments/ShipmentsList.tsx`](frontend/src/pages/shipments/ShipmentsList.tsx) |
| 6 | العملاء | `customers` | `/customers` | all | [`pages/customers/CustomersList.tsx`](frontend/src/pages/customers/CustomersList.tsx) |
| 7 | الفواتير والمرتجعات | `invoicesReturns` | `/invoices-returns` | all | [`pages/invoicesReturns/InvoicesReturnsHub.tsx`](frontend/src/pages/invoicesReturns/InvoicesReturnsHub.tsx) |
| 8 | الخزينة | `treasury` | `/treasury` | all | [`pages/treasury/TreasuryHub.tsx`](frontend/src/pages/treasury/TreasuryHub.tsx) |
| 9 | التقارير | `reports` | `/reports` | all | [`pages/reports/ReportsHub.tsx`](frontend/src/pages/reports/ReportsHub.tsx) |
| 10 | الموافقات | `approvals` | `/approvals` | `owner`, `shop_seller` | [`pages/approvals/ApprovalsPage.tsx`](frontend/src/pages/approvals/ApprovalsPage.tsx) |
| 11 | الإعدادات | `settings` | `/settings` | `owner` | [`pages/settings/SettingsPage.tsx`](frontend/src/pages/settings/SettingsPage.tsx) |

**Cross-check vs redesign-plan expected list:** الرئيسية / نقطة البيع / الأصناف / المخزون / الطلبيات / العملاء / الفواتير والمرتجعات / الخزينة / التقارير / الموافقات / الإعدادات. ✅ **All 11 present, naming matches.** No mismatches.

### Level-2 (sub-pages reachable via hub cards or sub-tabs)

| Section | Sub-page | Route | Page file | Reached via |
|---|---|---|---|---|
| الأصناف | إضافة توب | `/items/tops/add` | [`AddTop.tsx`](frontend/src/pages/items/AddTop.tsx) | hub card + sub-tab |
| الأصناف | التوبات | `/items/rolls` | [`Rolls.tsx`](frontend/src/pages/items/Rolls.tsx) | hub card + sub-tab |
| الأصناف | الملصقات | `/items/labels` | [`Labels.tsx`](frontend/src/pages/items/Labels.tsx) | hub card + sub-tab |
| المخزون | الخامات | `/inventory/fabrics` | [`Fabrics.tsx`](frontend/src/pages/inventory/Fabrics.tsx) | hub card + sub-tab |
| المخزون | حركات المخزون | `/inventory/stock-movements` | [`StockMovements.tsx`](frontend/src/pages/inventory/StockMovements.tsx) | hub card + sub-tab |
| المخزون | الجرد | `/inventory/stocktake` | [`Stocktake.tsx`](frontend/src/pages/inventory/Stocktake.tsx) | hub card + sub-tab |
| المخزون | التسويات | `/inventory/adjustments` | [`Adjustments.tsx`](frontend/src/pages/inventory/Adjustments.tsx) | hub card + sub-tab |
| المخزون | أحداث التلف والفقد | `/inventory/damage` | [`Damage.tsx`](frontend/src/pages/inventory/Damage.tsx) | hub card + sub-tab |
| المخزون | التكويدات | `/inventory/codes` | [`CodesPage.tsx`](frontend/src/pages/inventory/CodesPage.tsx) | hub card (no sub-tab entry — added Phase 6) |
| الطلبيات | إنشاء طلبية | `/shipments/create` | [`CreateShipment.tsx`](frontend/src/pages/shipments/CreateShipment.tsx) | sub-tab (factory_sender/owner) |
| الطلبيات | بانتظار المراجعة | `/shipments/pending` | `ShipmentsList` (filtered) | sub-tab (shop_seller/owner) |
| الطلبيات | كل الطلبيات | `/shipments` | [`ShipmentsList.tsx`](frontend/src/pages/shipments/ShipmentsList.tsx) | sub-tab |
| الطلبيات | مراجعة | `/shipments/:id` | [`ReviewShipment.tsx`](frontend/src/pages/shipments/ReviewShipment.tsx) | detail (via list) |
| العملاء | تفاصيل عميل | `/customers/:id` | [`CustomerDetail.tsx`](frontend/src/pages/customers/CustomerDetail.tsx) | row drilldown |
| الفواتير والمرتجعات | الفواتير | `/invoices` | [`InvoicesList.tsx`](frontend/src/pages/invoices/InvoicesList.tsx) | hub card + sub-tab |
| الفواتير والمرتجعات | تفاصيل فاتورة | `/invoices/:id` | [`InvoiceDetail.tsx`](frontend/src/pages/invoices/InvoiceDetail.tsx) | row drilldown |
| الفواتير والمرتجعات | المرتجعات | `/returns` | [`ReturnsList.tsx`](frontend/src/pages/returns/ReturnsList.tsx) | hub card + sub-tab |
| الفواتير والمرتجعات | تفاصيل مرتجع | `/returns/:id` | [`ReturnDetail.tsx`](frontend/src/pages/returns/ReturnDetail.tsx) | row drilldown |
| الخزينة | نظرة عامة | `/treasury/overview` | [`TreasuriesOverview.tsx`](frontend/src/pages/treasury/TreasuriesOverview.tsx) | hub card + sub-tab (owner only) |
| الخزينة | الخزنة الكاش | `/cash` | [`CashDrawer.tsx`](frontend/src/pages/cash/CashDrawer.tsx) | hub card + sub-tab |
| الخزينة | البنوك | `/banks` | [`Banks.tsx`](frontend/src/pages/cash/Banks.tsx) | hub card + sub-tab |
| الخزينة | المصروفات | `/expenses` | [`Expenses.tsx`](frontend/src/pages/cash/Expenses.tsx) | hub card + sub-tab |
| الخزينة | التسوية اليومية | `/reconcile` | [`CashReconcile.tsx`](frontend/src/pages/cash/CashReconcile.tsx) | hub card + sub-tab |
| التقارير | التقرير اليومي | `/reports/daily` | [`DailyReport.tsx`](frontend/src/pages/reports/DailyReport.tsx) | featured hub card |
| التقارير | تقرير فرعي | `/reports/secondary/:reportKey` | [`SecondaryReport.tsx`](frontend/src/pages/reports/SecondaryReport.tsx) | 10 cards in "تقارير فرعية" section |
| Misc | الإشعارات | `/notifications` | [`NotificationsPage.tsx`](frontend/src/pages/notifications/NotificationsPage.tsx) | bell in TopHeader (not on rail) |
| Misc | تسجيل الدخول | `/login` | [`Login.tsx`](frontend/src/pages/Login.tsx) | unauthenticated |

### Level-3 groupings

#### التقارير → تقارير فرعية (10 items, single grouped flyout in Phase 2)

Defined in [`ReportsHub.tsx`](frontend/src/pages/reports/ReportsHub.tsx) → `secondary` array. Each routes to `/reports/secondary/:reportKey` and shares [`SecondaryReport.tsx`](frontend/src/pages/reports/SecondaryReport.tsx) as the shell.

| # | Arabic label | `reportKey` |
|---|---|---|
| 1 | مبيعات حسب الخامة واللون | `salesByFabricColor` |
| 2 | كشف حساب العميل | `customerLedger` |
| 3 | الفواتير المفتوحة المتأخرة | `outstandingOpenInvoices` |
| 4 | جرد المخزون | `stocktakeInventory` |
| 5 | التدفق النقدي | `cashFlow` |
| 6 | التسوية البنكية | `bankReconciliation` |
| 7 | المصروفات | `expenses` |
| 8 | التلف والفقد | `damageLoss` |
| 9 | المبيعات حسب طريقة الدفع | `salesByPaymentMethod` |
| 10 | سجل المراجعة | `auditLog` |

#### الإعدادات → 10 sub-sections (already an internal 3-column layout)

Defined in [`SettingsPage.tsx`](frontend/src/pages/settings/SettingsPage.tsx) → `SECTIONS` array. Today the page renders its own desktop layout: 192px sub-nav column (`w-48`) + content card. **Phase 6 keeps this 3-column island layout (rail + sub-nav + form), per the redesign-plan decision.**

| # | Key | Arabic label | Notes |
|---|---|---|---|
| 1 | `general` | المعلومات العامة | logo path / address / phone / tax id / receipt warning |
| 2 | `tax` | الضرائب | enabled / rate / label |
| 3 | `pos` | نقطة البيع | min deposit % / void window / approval threshold / stale invoice days / return window |
| 4 | `cashDrawer` | خزنة الكاش | opening balance (read-only display) |
| 5 | `banks` | البنوك | CRUD + active toggle |
| 6 | `usersPermissions` | المستخدمون والصلاحيات | user CRUD + permission matrix (sticky col) |
| 7 | `reasonCodes` | أكواد الأسباب | damage / expense / cancellation lists |
| 8 | `dayRollover` | وقت تحديد اليوم | HH:MM input |
| 9 | `system` | النظام | audit retention display |
| 10 | `fabricCodes` | كودات الملصقات | tabbed CRUD: grades / compositions / brands / suppliers |

**Mismatch with redesign plan:** the plan's Settings sub-page list mentions "كودات الملصقات" — matches `fabricCodes`. All 10 keys map cleanly.

---

## 13. Hardcoded color / font / inline-style sites

Counts run with Grep against `frontend/src/`. See §16 for what to do about these (mostly: leave for Phase 7 sweep, but Phase 3–6 must not *add* more).

| Pattern | Count | Files | Notable hot spots |
|---|---|---|---|
| Hex literals `#RRGGBB` / `#RGB` | **2** | 1 | `components/Code128.tsx:32-33` — barcode foreground/background passed to jsbarcode. **Intentional**; barcode rendering ignores tokens. |
| Inline `style={{ … }}` | **99** | 19 | Mix of dynamic positioning and one-offs. Hot spots: `inventory/CodesPage.tsx` (24), `treasury/TreasuriesOverview.tsx` (8), `items/Rolls.tsx` (9), `items/Labels.tsx` (8), `pos/POS.tsx` (4), `notifications/NotificationsPage.tsx` (9). Most are sizing (`maxHeight`, `width`) not color — color cases need per-file inspection in Phase 7. |
| Tailwind palette `text-{color}-N` | **145** | 28 | Hot spots: `inventory/CodesPage.tsx` (16), `treasury/TreasuriesOverview.tsx` (16), `settings/SettingsPage.tsx` (12), `notifications/NotificationsPage.tsx` (10), `items/Rolls.tsx` (9), `invoices/InvoiceDetail.tsx` (9), `pos/POS.tsx` (8), `approvals/ApprovalsPage.tsx` (7), `cash/Expenses.tsx` (6), `cash/CashDrawer.tsx` (5). |
| Tailwind palette `bg-{color}-N` | **99** | 19 | Hot spots: `inventory/CodesPage.tsx` (24), `notifications/NotificationsPage.tsx` (9), `items/Rolls.tsx` (9), `approvals/ApprovalsPage.tsx` (8), `items/Labels.tsx` (8), `treasury/TreasuriesOverview.tsx` (8), `invoices/InvoicesList.tsx` (6), `NotificationBell.tsx` (5). |

Representative offenders (status colors that should become tokens):

- `approvals/ApprovalsPage.tsx:12-14` — severity map `bg-blue-100 text-blue-700` / `bg-orange-100 text-orange-700` / `bg-red-100 text-red-700`.
- `cash/Expenses.tsx:152-153` — `text-amber-600` pending, `text-green-600` approved.
- `inventory/Fabrics.tsx:224` — active/inactive badge.
- `Layout/OfflineToast.tsx:8` — `bg-red-600 text-white` banner.
- `NotificationBell.tsx:54-70, 129, 210` — severity tints + unread badge.

No `font-family:` literals in components (font is global via Tailwind `sans` + CSS `html { font-family }`). No raw color in CSS files beyond `index.css`.

---

## 14. Bundle / asset notes

- No code-splitting today — single `index.html` + one entry chunk. Vite default behavior.
- No `loadable`, no `React.lazy` import found in app code.
- No analyzer plugin (rollup-plugin-visualizer or similar) wired up.

---

## 15. Risks & entanglements

| # | Risk | Where | Mitigation |
|---|---|---|---|
| 1 | **`AppShell` is named `LeftRail` but renders on the right under RTL.** Phase 2 will likely rename to `Rail` for clarity, but anyone landing in the file expecting LTR will be confused. | `components/Layout/LeftRail.tsx` | Rename to `Rail` + update imports in Phase 2 commit. Don't rename in Phase 1. |
| 2 | **POS bypasses `SectionShell`** in [`AppShell.tsx:21-25`](frontend/src/components/Layout/AppShell.tsx). The motion-reduced scope in Phase 3 must hook into POS's own wrapper (`p-3 md:p-6`), not the standard shell path. | `AppShell.tsx` | Phase 3 already calls this out; Part C of Phase 1 just lands the `[data-motion="reduced"]` CSS scope — no wrapper change needed yet. |
| 3 | **`Settings` already owns a 3-column layout** with its own breakpoint + back-button logic. Phase 6 must preserve this; do not let the new global Rail/Flyout sweep stomp `<aside>` containers inside `SettingsPage`. | `pages/settings/SettingsPage.tsx:1097-1125` | Phase 6 prompt already covers this; flagged here so Phase 2 doesn't accidentally fight it. |
| 4 | **Rail collapsed state persists in `localStorage`** at `rail.collapsed`. New rail in Phase 2 will replace this component entirely — either honor or migrate the key. | `LeftRail.tsx:15-37` | Note in Phase 2 PR body whether the key is reused or retired. |
| 5 | **No ESLint config file** exists in `frontend/` despite `eslint` + `@typescript-eslint/*` being in `devDependencies`. `npm run lint` currently fails. | `frontend/` root | Don't block Phase 1 on this. Phase 7's "lint + typecheck pass" gate must add a config — flag in §16. |
| 6 | **Zustand is a declared dep with zero imports.** Either reserved for future or accidentally retained. | `frontend/package.json:36` | Phase 7 dead-code sweep: remove it OR adopt it for the command-palette recents store. Either way, decide once. |
| 7 | **`@radix-ui/react-toast` is in deps but no Toast primitive exists** in `components/ui/`. Approvals/Expenses use inline ad-hoc messaging today. Phase 4+ will need a Toast primitive — generate via shadcn before any phase that depends on toast feedback. | `components/ui/` | Phase 2 ships the Command-Palette skeleton; Phase 3 depends on toast for POS error-shake / success-flash → add `<Toaster>` primitive then. |
| 8 | **PDF font assets (Cairo TTF)** live in the backend and are copied via `scripts/copy-pdf-fonts.mjs`. **Do not delete** when removing the Google-Fonts `<link>` for the UI font swap. Invoice rendering depends on them. | `scripts/copy-pdf-fonts.mjs` | Phase 1 Part C: only touch the UI font wiring (`index.html` link + Tailwind family + `@font-face` in CSS). Leave the backend `fonts/` pipeline alone. |
| 9 | **Hard-coded `directional` properties** (`right-1`, `top-1`, `ml-1`, `mr-2`) in NotificationBell, ApprovalsPage, OfflineToast. Under RTL these are still *visually* "right" because they're not RTL-aware. | various | Phase 7 a11y / RTL sweep. Don't fight it in Phase 1. |
| 10 | **Vite dev server proxies `/api` → `:3000`.** Backend must be running for any data-bound page. Empty/loading states must render correctly with no backend — verify during Phase 1 Part C smoke (only tokens land, but the dev shell still has to boot). | `frontend/vite.config.ts:10` | Smoke `npm run dev -w frontend` standalone — if `index.html` loads with Cairo replaced by IBM Plex, tokens are wired. |
| 11 | **Root `package.json` build script chains `frontend build → copy → backend build`.** Adding `public/fonts/` and `public/brand/` to the frontend means they'll auto-flow into `backend/public/` at deploy. Confirm `copy-frontend-to-backend.mjs` does a full directory mirror, not a narrow file list. | `scripts/copy-frontend-to-backend.mjs` | Spot-check before Phase 1 commit — out of scope for the audit, in scope for Part C validation. |

---

## 16. Open questions (for the user, before Part C)

1. **Color token vocabulary.** The Re-Skin Standard uses names like `surface`, `chrome-surface`, `surface-elevated`, `surface-row-alt`, `text-default`, `text-muted`, `text-tertiary`, `border-subtle`, `border-default`, `accent`, `accent-hover`, plus `success/warning/danger/info` with `-subtle` variants. The existing tokens are `canvas/ink/primary/primary-foreground/accent/accent-foreground/muted/muted-foreground/border/ring`. **Two options:**
   - (a) **Keep both vocabularies**: add new tokens alongside, leave existing aliases for legacy classes, sweep in Phase 7. Lower risk, doubles the token count short-term.
   - (b) **Rename in place**: e.g. `canvas` → `surface`, `ink` → `text-default`, `primary` → `chrome-surface`, `accent` stays, add the rest. Cleaner, but touches `bg-canvas`/`text-ink`/`text-primary-foreground` usages across many files immediately.

   Default recommendation: **(a)** — Phase 1 lands new tokens, Phase 7 retires old ones once components are re-skinned. Flag this in the Part B → C handoff.

2. **`primary` semantics.** Current `--color-primary` is deep navy `hsl(240 35% 25%)` and is used as both the rail/header chrome surface AND the primary action color (active links, sub-tab active state, save buttons). The Re-Skin Standard separates `chrome-surface` (dark navigation surface) from `accent` (primary action). Will the chosen palette merge these or split them? Current `--color-accent` is muted ochre, used only as a `Button variant="accent"`. **Most likely outcome:** chrome stays a chrome color, accent becomes the primary action — but confirm during palette pick.

3. **Logo source file.** The plan says "supplied black wordmark, unchanged" — where is the source SVG? Not in this repo (no `public/`, no `assets/`, no `branding/`). Need either:
   - a path to the supplied artwork (provide before Part C), or
   - permission to use a clean text-only "RMX" lockup placeholder until artwork arrives.

4. **Zustand decision.** Remove the unused dep, or adopt it for the Phase 2 Command-Palette `cmdk:recent` localStorage store? Either answer is fine — just don't ship dead deps to v1.

5. **ESLint config.** Generate a stock `eslint.config.js` (flat config, ESLint 9 style) as part of Phase 1, or defer to Phase 7? Generating now (zero rules beyond `@typescript-eslint/recommended`) makes `npm run lint` pass and unblocks Phase 7's gate. Recommendation: generate a stub in Phase 1 Part C alongside tokens.

6. **Toast primitive timing.** Phase 3 (POS error-shake / success-flash / dashboard toasts) needs Toast. Generate the shadcn `<Toaster>` primitive in Phase 2 (alongside the new shell) rather than wait until Phase 3.

7. **`backend/public/` build mirror.** Confirm `scripts/copy-frontend-to-backend.mjs` mirrors the whole `dist/` tree (so new `public/fonts/` and `public/brand/` ship to prod). If it's a curated allowlist, update it in Phase 1.

---

## 17. Summary for downstream phases

- **Phase 1 / Part C — what to land:** new token set (extend HSL-vars-in-Tailwind pattern), spacing/radius/shadow/motion/breakpoint/z-index/typography scales, self-hosted IBM Plex Sans Arabic + Latin under `frontend/public/fonts/`, RMX logos under `frontend/public/brand/`, `[data-motion="reduced"]` + `@media (prefers-reduced-motion)` global overrides. **No component file may be edited.** A stub ESLint config is in scope (open question §16.5).

- **Phase 2 — Global Shell:** replace `AppShell`/`TopHeader`/`LeftRail`/`MobileNavDrawer` with the Verint pattern. Reuse `nav-config.ts` shape (extend, don't replace). Pick the motion library here (React → framer-motion). Generate `<Toaster>` primitive.

- **Phase 3 — Dashboard + POS:** re-skin `pages/Home.tsx` (Owner dashboard already exists, just needs token + motion treatment) and `pages/pos/POS.tsx` (motion-reduced scope from Phase 1 tokens). Preserve all scanner / cart / focus / keyboard logic.

- **Phase 4 — Catalog, Inventory, Sales:** five top-level sections + their sub-pages. Reuse `HubLanding` for landings; reuse `ResponsiveTable` for table → stacked-card on mobile.

- **Phase 5 — Treasury, Reports, Approvals:** finance tabular-nums + first chart introduction (no chart lib today — pick Recharts in Phase 5 per the prompt).

- **Phase 6 — Settings:** preserve internal 3-column layout. Sub-nav config sourceable from existing `SECTIONS` array.

- **Phase 7 — Polish:** dead-code (unused Zustand, deprecated old sidebar if any), ESLint config completion, hex-literal grep proof, print views, contrast verification.

---

*End of audit. Generated by `phase-1/foundations` branch ahead of palette selection.*
