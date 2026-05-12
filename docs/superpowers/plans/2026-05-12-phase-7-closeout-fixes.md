# Phase 7 Closeout Fixes Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the gaps identified in the consolidated code review of the 7-phase UI/UX rework so `rmx-new-ui` satisfies its own Phase 7 acceptance criteria.

**Architecture:** Localized, non-architectural fixes. Adopt already-extracted primitives where inline duplicates exist; add missing error/loading/empty/toast states; patch shell interaction bugs; finish the RTL logical-property sweep; correct closeout documentation. No new abstractions.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + framer-motion + react-query.

**Verification gate per task:** `npm run typecheck -w frontend` must pass after every commit. Visual confirmation in dev server where applicable.

**Constraint:** All work stays on `rmx-new-ui`. Do not merge to `main`. No data/route/API changes.

---

## Task 1: Adopt Skeleton primitive

Replace inline `animate-pulse bg-surface-hover` blocks with `<Skeleton>` to satisfy "single source of truth per component" (Phase 7 line 642).

**Files to modify:**
- `frontend/src/pages/Home.tsx:133-135`
- `frontend/src/pages/treasury/TreasuriesOverview.tsx:297-299`
- `frontend/src/pages/cash/CashDrawer.tsx:225-226`
- `frontend/src/pages/cash/Banks.tsx:240-242`
- `frontend/src/pages/reports/ReportShell.tsx:193, 204`
- `frontend/src/pages/settings/SettingsPage.tsx:926-928, 1459-1460`

- [ ] **Step 1.1** — Read each callsite to identify the existing inline shape (height/width/rounded variant).
- [ ] **Step 1.2** — Replace `<div className="h-N w-N rounded-md bg-surface-hover animate-pulse" />` with `<Skeleton className="h-N w-N rounded-md" />`. Import `Skeleton` from `@/components/Skeleton`. Don't touch nearby logic.
- [ ] **Step 1.3** — Typecheck. Commit: `refactor(states): adopt Skeleton primitive in 6 surfaces`.

---

## Task 2: Adopt Tooltip primitive in POS

POS hand-rolls a tooltip via `useState(showCompTip)` + mouse handlers (`POS.tsx:999-1015`). Swap to the shared `Tooltip` primitive.

**Files to modify:**
- `frontend/src/pages/pos/POS.tsx` — composition tooltip in `EnrichedCartLine`.

- [ ] **Step 2.1** — Inspect the current implementation.
- [ ] **Step 2.2** — Wrap the trigger element with `<Tooltip content={...} placement="top">`. Remove the `showCompTip` state, the mouse handlers, and the absolute-positioned tooltip JSX.
- [ ] **Step 2.3** — Typecheck. Commit: `refactor(pos): use Tooltip primitive for composition hint`.

---

## Task 3: Add error / loading / empty states to 5 surfaces (Critical C1)

**Files to modify:**
- `frontend/src/pages/notifications/NotificationsPage.tsx`
- `frontend/src/pages/approvals/ApprovalsPage.tsx`
- `frontend/src/pages/cash/Banks.tsx`
- `frontend/src/pages/inventory/Stocktake.tsx`
- `frontend/src/pages/invoices/InvoiceDetail.tsx`

Pattern per file:
1. If a `ResponsiveTable` is rendered: pass `isError={query.isError}`, `onRetry={() => query.refetch()}`, `isLoading={query.isLoading}`. Drop any inline "جاري التحميل..." string.
2. If the surface is not a table: surround the body with `if (query.isError) return <ErrorBanner ... onRetry={...} />`.
3. For pure CRUD mutations on Approvals — add a success toast (covered separately in Task 9).

- [ ] **Step 3.1** — `NotificationsPage`: Replace inline loading/empty divs with `TableSkeleton` / `EmptyState`. Add `ErrorBanner` for any failed query.
- [ ] **Step 3.2** — `ApprovalsPage`: pass `isError` + `onRetry` to both `pending` and `resolved` tables.
- [ ] **Step 3.3** — `Banks`: handle `banksQ.isError` (currently only `movementsQ` does).
- [ ] **Step 3.4** — `Stocktake`: wrap `detailsQ` consumption with loading/empty/error states using the shared primitives.
- [ ] **Step 3.5** — `InvoiceDetail`: separate `isLoading` from "missing data" — the latter should be an `ErrorBanner` with retry, not a loading sentence.
- [ ] **Step 3.6** — Typecheck. Commit: `feat(states): add error/loading/empty coverage to 5 remaining surfaces`.

---

## Task 4: Fix ResponsiveTable defects (Theme B)

**Files to modify:**
- `frontend/src/components/ResponsiveTable.tsx:64-75, 102-109`

Two bugs:
- Sticky `<thead>` never sticks because the wrapper has only `overflow-x-auto` (no y-scroll context).
- Row stagger replays on every `resetKey` flip — should fire only on initial mount.

- [ ] **Step 4.1** — Drop sticky `top-0` on `<thead>` and remove its `z-sticky bg-surface-elevated` (the table doesn't y-scroll; the page does). Keep header styling intact.
- [ ] **Step 4.2** — Split the mount effect: a `useRef(true)` `firstMountRef` plus a separate `mountTick` setter. On first mount → stagger via `delay: Math.min(i, 9) * 0.03`. On subsequent `resetKey` changes → 150ms opacity fade with `delay: 0`.
- [ ] **Step 4.3** — Typecheck. Commit: `fix(table): initial-only stagger, drop inert sticky header`.

---

## Task 5: AppShell interaction bugs (Theme A)

**Files to modify:**
- `frontend/src/components/AppShell/AppShell.tsx:25-35`
- `frontend/src/components/AppShell/Flyout.tsx:31, 34-61, 118-131`
- `frontend/src/components/AppShell/MobileDrawer.tsx:61`
- `frontend/src/components/AppShell/TopBar.tsx:43`

- [ ] **Step 5.1** — Guard the ⌘K listener: skip when the active element is `HTMLInputElement`, `HTMLTextAreaElement`, or `isContentEditable`. Allow Escape-to-close even from inputs.
- [ ] **Step 5.2** — Fix the Flyout route-change race: capture `pathnameOnOpen` only in an effect keyed on `section?.id`, not the position-update layout effect.
- [ ] **Step 5.3** — Symmetric Tab-forward focus return: on `Tab` from last row, call `onClose()` then `anchor?.focus()` to match Shift+Tab behavior.
- [ ] **Step 5.4** — Hide the mobile hamburger at `md:hidden` (not `lg:hidden`) so 768–1023px users don't see both rail and hamburger.
- [ ] **Step 5.5** — Typecheck. Commit: `fix(shell): ⌘K input-guard, flyout focus/route fixes, md hamburger gate`.

---

## Task 6: RTL physical-property sweep (Theme C)

Convert remaining physical directional classes to RTL logical equivalents. App is `dir="rtl"` so nothing visibly breaks today, but the redesign plan's RTL discipline claim should be honest.

**Mappings:**
- `text-left` → `text-start`
- `text-right` → `text-end` (only where the original intent was logical-end; `text-right` inside `dir="rtl"` is "visual right" which is logical-start, so these usually become `text-start`)
- `ml-N` → `ms-N`, `mr-N` → `me-N`
- `pl-N` → `ps-N`, `pr-N` → `pe-N`
- `left-N` → `start-N`, `right-N` → `end-N`
- `border-l` → `border-s`, `border-r` → `border-e`
- `border-l-N` → `border-s-N`, `border-r-N` → `border-e-N`

**Files to modify:**
- `frontend/src/pages/settings/SettingsPage.tsx` — many: lines 466-468, 628-631, 659, 683, 743-744, 982-983, 1073-1074, 1162-1163, 1259-1261
- `frontend/src/pages/cash/CashReconcile.tsx:92, 101, 118, 119`
- `frontend/src/components/ResponsiveTable.tsx:110, 116, 160, 169` (the `text-right` on `<thead>` and the `text-left` align-end branches)
- `frontend/src/pages/invoices/InvoicesList.tsx:253`
- `frontend/src/pages/inventory/Stocktake.tsx:135, 181, 245`
- `frontend/src/pages/inventory/CodesPage.tsx:272, 280`
- `frontend/src/pages/invoices/InvoiceDetail.tsx:194, 252, 786`
- `frontend/src/components/ui/dialog.tsx:45`

- [ ] **Step 6.1** — Settings sweep (largest delta).
- [ ] **Step 6.2** — CashReconcile sweep — fix the variance highlight to draw on the logical leading edge.
- [ ] **Step 6.3** — ResponsiveTable / dialog.tsx sweep.
- [ ] **Step 6.4** — Remaining pages (InvoicesList, Stocktake, CodesPage, InvoiceDetail).
- [ ] **Step 6.5** — Final grep to confirm: `git grep -nE "(text-(left|right)|\\bm[lr]-|\\bp[lr]-|\\bleft-|\\bright-|border-[lr]-?)" frontend/src/{pages,components} | grep -v "Code128\\|SecondaryReportChart\\|AppShell/Flyout.tsx:right-"` should return only documented exceptions.
- [ ] **Step 6.6** — Typecheck. Commit: `a11y: complete RTL logical-property sweep across remaining surfaces`.

---

## Task 7: focus → focus-visible sweep (Theme D #8)

21 `focus:ring-2 focus:ring-accent` occurrences mean mouse-click users get a thick ring on every click.

**Mapping:** `focus:ring-2` → `focus-visible:ring-2`; `focus:ring-accent` → `focus-visible:ring-ring`. Use the `ring-ring` token for consistency with shadcn/ui primitives.

**Files to modify (grep target):**
- `frontend/src/pages/inventory/{Stocktake,StockMovements,Damage,Adjustments,CodesPage}.tsx`
- `frontend/src/pages/shipments/{CreateShipment,ShipmentsList}.tsx`
- `frontend/src/pages/invoices/InvoiceDetail.tsx`

- [ ] **Step 7.1** — Grep all hits with line numbers.
- [ ] **Step 7.2** — Edit each occurrence.
- [ ] **Step 7.3** — Typecheck. Commit: `a11y: use focus-visible for keyboard-only focus rings`.

---

## Task 8: Apply `.rmx-print-code` (Theme E #10)

The utility is defined at `index.css:261` but has zero JSX call sites — orphan rule.

**Files to modify:**
- `frontend/src/pages/invoices/InvoiceDetail.tsx:208` — roll serials and internal barcodes.
- `frontend/src/pages/reports/DailyReport.tsx` — any identifier column showing codes.

- [ ] **Step 8.1** — Add `rmx-print-code` className to the `<span>` / `<td>` rendering `roll_sr_no` and `internal_barcode` in InvoiceDetail.
- [ ] **Step 8.2** — Spot-check DailyReport; apply where identifiers render.
- [ ] **Step 8.3** — Typecheck. Commit: `feat(print): apply rmx-print-code to invoice serials and report identifiers`.

---

## Task 9: Approvals success toast (Theme E #12)

**Files to modify:**
- `frontend/src/pages/approvals/ApprovalsPage.tsx:82-90` — `approveMut.onSuccess`, plus the reject mutation.

- [ ] **Step 9.1** — Add `onSuccess` toasts: `"تمت الموافقة"` for approve, `"تم الرفض"` for reject. Tone `success` / `danger` respectively, 3s auto-dismiss. Use the shared `Toast` primitive (already adopted in POS + Settings).
- [ ] **Step 9.2** — Typecheck. Commit: `feat(approvals): success toast on approve/reject`.

---

## Task 10: Correct closeout doc

**Files to modify:**
- `docs/RMX_REDESIGN_AUDIT.md:454-455` — token counts (`--rmx-*` should be 44, `--color-*` should be 12).
- `docs/RMX_REDESIGN_AUDIT.md:498` — legacy alias claim: amend to "still referenced by NotificationsPage; full sweep deferred".

- [ ] **Step 10.1** — Run `git grep -c "^  --rmx-" frontend/src/index.css` to get the actual `--rmx-*` count. Run `git grep -c "^  --color-" frontend/src/index.css` similarly.
- [ ] **Step 10.2** — Edit §18.3 and §18.5 with accurate numbers and language.
- [ ] **Step 10.3** — Commit: `docs: correct closeout token counts and legacy-alias claim`.

---

## Task 11: Final verification

- [ ] **Step 11.1** — `npm run typecheck -w frontend` — expect 0 errors.
- [ ] **Step 11.2** — `npm run build -w frontend` — confirm bundle still produces and chunk shape matches §18.4.
- [ ] **Step 11.3** — `git log --oneline 40e185e..HEAD` — review the closeout-fixes commits as a unit.

---

## Out of scope

These were called out in the review but explicitly deferred to a future cycle:

- **FormField universal adoption** — hand-rolled `<Label>+<Input>` patterns in CustomersList, InvoicesList, Fabrics, Settings (`FieldRow`). Risk too high for a closeout sweep; document `FormField` as "recommended, not mandatory" instead.
- **SettingsPage.tsx split** — 1583-line file is an organizational issue, not a defect.
- **Recharts runtime token resolution** — §18.5 item 3, still deferred.
- **Font preload manifest plugin** — §18.5 item 1, still deferred.
- **ESLint config** — §18.5 item 2, still deferred.
