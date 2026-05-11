# Phase 3 — Open Invoices Diagnostic

**Date:** 2026-05-11
**Branch:** `v1.1/phase-3-open-invoices-fix` (from `v1.1/phase-1-ui-foundation`)
**Method:** Code read only — no live environment, Playwright MCP not connected, no DB available. Where a finding genuinely requires runtime behavior (cron firing, DB row state after action), it is marked `NEEDS RUNTIME VERIFICATION`.

## Headline

The v1.0.0 open-invoice subsystem is **substantially complete in code**. Backend services, transactions, audit log, status history, cron job, list/detail UI, action toolbar, all three modals, and i18n strings are all present and wired. The Phase 3 prompt's working assumption ("UI controls are missing in production, so the deposit-and-pickup flow is not driveable") does **not** match the code state on this branch — it may match production if the v1.1/phase-1-ui-foundation branch has never been deployed, but everything required is already implemented here.

The remaining gaps are small, specific, and listed below. The largest items in the prompt (the deposit-only POS control, final-payment modal, mark-delivered button, cancel-with-refund modal, stale cron, list tabs, age column) are all **WORKING** at the code level.

## Alignment deviations from the prompt's section 6

- Role taxonomy in this repo is `owner / shop_seller / factory_sender` ([037_create_role_permissions.ts:6](../../backend/src/db/migrations/037_create_role_permissions.ts#L6)), not `Owner / BranchManager / Cashier / Accountant / WarehouseKeeper` as section 6 assumes. Mapping used: BranchManager + Cashier → `shop_seller`; Accountant + WarehouseKeeper → no equivalent, dropped.
- Permission shape is `(role, resource, action)` with `action ∈ {read, write, approve}` — not per-verb keys like `invoices:final_payment`. The existing `shop_seller / invoices / write` row grants all four open-invoice actions transitively. No migration is needed for sections 6's first three rows; only `invoices:cancel` and `admin:trigger_stale_check` would need new permission entries if we want owner-only gating beyond what `requireRole` already enforces in the routes.

## Scenarios

### A.1 — Create an open invoice via POS (deposit-only checkout)

**Status:** WORKING

**Observed:**
- POS payment card has a "حفظ كفاتورة مفتوحة" checkbox at [POS.tsx:509-517](../../frontend/src/pages/pos/POS.tsx#L509-L517).
- When checked, the validator at [POS.tsx:207-210](../../frontend/src/pages/pos/POS.tsx#L207-L210) allows `paymentSum < total` (`if (saveAsOpen) { if (paymentSum >= total - 0.001) return null; return null; }`).
- Backend `createSale` at [invoices.service.ts:163-372](../../backend/src/domain/sales/invoices.service.ts#L163-L372) computes `isFullyPaid = paidTotal >= totals.total - 0.001` and writes `status: 'open'` when not fully paid. Rolls are flipped to `reserved` and a `reserve` stock movement is emitted ([invoices.service.ts:250-266](../../backend/src/domain/sales/invoices.service.ts#L250-L266)). `min_deposit_pct` is enforced server-side ([invoices.service.ts:195-199](../../backend/src/domain/sales/invoices.service.ts#L195-L199)).

**Expected:** Cashier toggles "deposit only", system creates an `open` invoice with reserved rolls. Matches.

**Evidence:** Files above. Helper text "الباقي للاستلام" that the prompt mentions does not exist verbatim, but the preview row at [POS.tsx:543-546](../../frontend/src/pages/pos/POS.tsx#L543-L546) shows `الباقي = max(0, total − paymentSum)` which is functionally identical.

**Fix in section:** none. Optional small polish: add a one-line helper under the checkbox restating the balance, and surface a "عرض الفاتورة" CTA on the success screen — already present at [POS.tsx:647-649](../../frontend/src/pages/pos/POS.tsx#L647-L649).

### A.2 — "Add Final Payment" action

**Status:** WORKING

**Observed:**
- Conditional button at [InvoiceDetail.tsx:145-149](../../frontend/src/pages/invoices/InvoiceDetail.tsx#L145-L149) renders when `inv.status === 'open'`.
- `FinalPaymentDialog` ([InvoiceDetail.tsx:401-535](../../frontend/src/pages/invoices/InvoiceDetail.tsx#L401-L535)) pre-fills amount with `balance`, supports cash / instapay / both, includes bank account picker for instapay.
- Backend `addFinalPayment` ([openInvoices.service.ts:65-183](../../backend/src/domain/sales/openInvoices.service.ts#L65-L183)) runs in a single transaction, inserts payment rows, calls `settlePayment` (cash drawer or bank movement), inserts customer ledger entries, updates customer balance, flips rolls reserved→sold + emits `sale_out` movement when balance hits zero, transitions status to `closed_pending_pickup`, appends status history, writes audit log.
- Route wired: [sales.routes.ts:22-26](../../backend/src/domain/sales/sales.routes.ts#L22-L26).

**Expected:** Transition `open → closed_pending_pickup` on full final payment, stay `open` on partial. Code matches; the impl is stricter than the prompt — it rejects `paidNow < balance` with `FINAL_PAYMENT_BELOW_BALANCE` ([openInvoices.service.ts:79](../../backend/src/domain/sales/openInvoices.service.ts#L79)), so "partial final" is **not** supported. The prompt's spec 3a says "Editable (in case of partial-final)" — but it also says "If `amount == remaining_balance` → closed_pending_pickup; if `amount < remaining_balance`, stay open and increment deposit_paid". The current code enforces full balance only.

**Fix in section:** Optional — relax `addFinalPayment` to accept partial-final (`paidNow < balance` keeps invoice `open`, only closes if full). Per CORE_PLAN §6 Module 8: **"No multiple deposits: one deposit at open, one final payment to close."** So the current strict behavior matches the contract; the prompt's "partial-final" deviates from CORE_PLAN. Recommend **keeping the strict behavior** unless the owner specifically asks for multiple deposits.

### A.3 — "Mark Delivered" action

**Status:** WORKING (with a documented design difference from the prompt's letter)

**Observed:**
- Button at [InvoiceDetail.tsx:150-162](../../frontend/src/pages/invoices/InvoiceDetail.tsx#L150-L162) when `status === 'closed_pending_pickup'`, uses `window.confirm(ar.invoices.markDeliveredConfirm)`.
- Also surfaced as a row action on the "بانتظار الاستلام" tab at [InvoicesList.tsx:319-330](../../frontend/src/pages/invoices/InvoicesList.tsx#L319-L330).
- Backend `markDelivered` ([openInvoices.service.ts:189-227](../../backend/src/domain/sales/openInvoices.service.ts#L189-L227)) sets `status='completed'`, stamps `delivered_at`, `delivered_by_user_id`, `pickup_at`, appends status history, writes audit log.

**Expected vs observed difference:** The prompt's spec 3b says mark-delivered should "for each reserved roll on this invoice: write `unreserve` stock movement, then write the `sold` / `partial_cut` movement". The current architecture moves rolls reserved→sold at the moment the **balance hits zero** (in `addFinalPayment`, not in `markDelivered`). By the time `markDelivered` fires, rolls are already `sold` — mark-delivered only records the physical handover.

This is a defensible design (inventory leaves the books when paid, not when picked up), and rerouting it to fire at pickup time would be invasive. **Recommend keeping the current design.**

**Fix in section:** none.

### A.4 — Cancel open invoice with refund handling

**Status:** WORKING — one small UI gap

**Observed:**
- Button at [InvoiceDetail.tsx:163-167](../../frontend/src/pages/invoices/InvoiceDetail.tsx#L163-L167) when status is `open` or `closed_pending_pickup`.
- `CancelOpenDialog` ([InvoiceDetail.tsx:537-646](../../frontend/src/pages/invoices/InvoiceDetail.tsx#L537-L646)) supports three deposit-handling modes (`full_refund / partial_refund / keep_as_credit`) crossed with refund method (`cash / instapay`). This matches CORE_PLAN §6 Module 8's "full refund / partial refund / kept as credit" exactly.
- Backend `cancelOpenInvoice` ([openInvoices.service.ts:245-431](../../backend/src/domain/sales/openInvoices.service.ts#L245-L431)) inserts refund payment + settlement (correctly routes cash to drawer, instapay to bank), inserts customer ledger entry (refund or credit-adjustment), flips rolls to `in_stock` + emits `unreserve` movements, reverses `lifetime_volume`, sets `status='cancelled'`, appends status history, writes audit log, fires Owner notification.

**Gap:** When the user picks **instapay** for the refund, the dialog at [InvoiceDetail.tsx:616-628](../../frontend/src/pages/invoices/InvoiceDetail.tsx#L616-L628) does **not** show a bank-account picker. The backend silently picks the default-active bank account at [openInvoices.service.ts:277-284](../../backend/src/domain/sales/openInvoices.service.ts#L277-L284). Compare to `FinalPaymentDialog` which does show the picker. The prompt's spec 3c explicitly calls for a bank account picker.

**Severity:** Low. The backend behavior is correct; the UI just doesn't expose multi-account selection on the refund path.

**Fix in section:** 3 (small frontend addition).

### A.5 — Stale invoice cron

**Status:** WORKING (code) — `NEEDS RUNTIME VERIFICATION` (no live env in this session)

**Observed:**
- Cron registered at [server.ts:40](../../backend/src/server.ts#L40) via `startStaleInvoiceCron()`.
- Schedule at [staleInvoices.job.ts:70](../../backend/src/domain/sales/staleInvoices.job.ts#L70): `0 * * * *` (hourly, **not** daily at 02:00 as the prompt suggested). The 24h cooldown filter ([staleInvoices.job.ts:7,26-30](../../backend/src/domain/sales/staleInvoices.job.ts#L7-L30)) prevents duplicate notifications, so hourly is harmless.
- Query at [staleInvoices.job.ts:22-37](../../backend/src/domain/sales/staleInvoices.job.ts#L22-L37) correctly: `status='open' AND created_at < NOW() - INTERVAL '<days> days' AND (last_stale_notified_at IS NULL OR < NOW() - 24 hours)`. The `<days>` value comes from setting `stale_invoice_days` (default 7).
- Per-invoice notification dispatch + `last_stale_notified_at` UPDATE at [staleInvoices.job.ts:39-60](../../backend/src/domain/sales/staleInvoices.job.ts#L39-L60). Recipient role is lowercase `'owner'` matching the enum — no Owner/owner mismatch.
- Idempotent: cooldown is the gate; re-triggering immediately is a no-op.

**Gap 1:** No admin endpoint to manually trigger the check. `runStaleInvoiceCheck()` is exported but not bound to a route. The prompt explicitly asks for `POST /api/admin/trigger-stale-check` (Owner-only) to make it testable without messing with cron schedules.

**Gap 2:** Schedule difference (hourly vs daily 02:00). Recommend keeping hourly — strictly better for owner UX, and the cooldown logic makes it safe.

**Evidence:** Files above. Live verification (backdate an invoice, trigger the job, check `notifications` and `invoices.last_stale_notified_at` rows) requires a running DB.

**Fix in section:** 4 (add the admin trigger endpoint).

### A.6 — Invoices list page tabs + age column

**Status:** WORKING — one small consistency gap

**Observed:**
- All 5 tabs present at [InvoicesList.tsx:70-83](../../frontend/src/pages/invoices/InvoicesList.tsx#L70-L83): `الكل / مفتوحة / بانتظار الاستلام / مكتملة / ملغية`. i18n at [ar.ts](../../frontend/src/i18n/ar.ts).
- Open tab uses dedicated `listOpenInvoices` endpoint (server computes `age_days` per CORE_PLAN constraint of Cairo TZ — actually computed in JS from `created_at`, [openInvoices.service.ts:450-463](../../backend/src/domain/sales/openInvoices.service.ts#L450-L463)).
- Age column rendered at [InvoicesList.tsx:240-256](../../frontend/src/pages/invoices/InvoicesList.tsx#L240-L256).
- Stale visual: yellow tinted row (`rowClassName` at [InvoicesList.tsx:277](../../frontend/src/pages/invoices/InvoicesList.tsx#L277)) + "متأخرة" badge inline in the age cell.
- Sort: server-side `ORDER BY i.created_at ASC` at [openInvoices.service.ts:457](../../backend/src/domain/sales/openInvoices.service.ts#L457) — oldest first, which is effectively "age desc" since older = staler. ✓ Matches spec.

**Gap:** `STALE_DAYS_DEFAULT = 7` is hardcoded client-side at [InvoicesList.tsx:20](../../frontend/src/pages/invoices/InvoicesList.tsx#L20). The backend setting `stale_invoice_days` (managed in `SettingsPage`, used by the cron) is the source of truth — if the owner changes it to 10, the cron updates but the UI flag still triggers at 7. They could drift.

**Fix in section:** 5 (fetch `stale_invoice_days` from the settings API and use it as the threshold).

## Other findings (not in A.1–A.6 but worth flagging)

### F.1 — Cron schedule constant is not externalized

[staleInvoices.job.ts:70](../../backend/src/domain/sales/staleInvoices.job.ts#L70) hardcodes `'0 * * * *'`. The prompt asks for it to be settings-overridable via `stale_invoice_check_cron`. Low priority — the value is sensible and rarely changes. **Recommend skip** unless ops needs to throttle.

### F.2 — Playwright e2e spec (section 7 of the prompt)

`tests/` directory does not exist. `playwright` is not in `package.json`. The prompt's section 7 spec is **net-new test infrastructure**, not just a `.spec.ts` file. Setting it up — config, browsers, fixtures for Owner / Cashier auth, test DB seed, CI wiring — is a separate phase of work.

**Recommend:** drop section 7 from this phase. The code is verifiable via:
- a one-off script `scripts/trigger-stale-check.ts` (small, OK to add) for backdating + asserting notifications,
- manual smoke once the branch is deployed to a Hostinger preview env.

If you want full Playwright coverage, that should be its own phase between Phase 4 (treasury) and tag `v1.1.0` so it covers everything at once.

## Recommended fix list (ordered)

The diagnostic supports a **much smaller** Phase 3 than the prompt drafted. Concretely:

1. **Section 3c gap — instapay refund bank picker** (≈15 LOC frontend, [InvoiceDetail.tsx CancelOpenDialog](../../frontend/src/pages/invoices/InvoiceDetail.tsx#L537)). Add the bank-accounts query + picker mirroring `FinalPaymentDialog`, send `bank_account_id` in the `CancelOpenInvoiceBody`, accept it server-side at [openInvoices.service.ts:245](../../backend/src/domain/sales/openInvoices.service.ts#L245).
2. **Section 4 gap — admin trigger endpoint** (≈25 LOC backend). Add `POST /api/admin/trigger-stale-check` guarded by `requireRole('owner')`, calling `runStaleInvoiceCheck()` and returning `{ notified }`. Mount under a small `adminRouter` since `domain/sales` isn't a great home for it.
3. **Section 5 gap — UI stale threshold from settings** (≈10 LOC frontend). Add a tiny `useStaleDays()` hook that fetches `pos.stale_invoice_days`, replace the `STALE_DAYS_DEFAULT` constant in `InvoicesList.tsx` and the age cell.
4. **One-off test script** `scripts/trigger-stale-check.ts` (≈20 LOC) for runtime verification post-deploy.
5. **No migration needed.** No schema changes; no new permission keys (existing `(invoices, write)` + `(invoices, approve)` covers cancel intent if we ever want to gate it; today both `owner` and `shop_seller` can cancel, which matches CORE_PLAN §6 Module 8).

## Out of scope

- Playwright e2e (F.2 above).
- Refactoring `markDelivered` to write `unreserve`/`sold` movements at pickup time (A.3 design difference — current design is sound).
- Externalizing cron schedule to settings (F.1 — low priority).
- Touching the permissions matrix (existing shape covers what's needed; introducing per-verb keys would be a backwards-incompatible migration).
- Section 6's `BranchManager / Cashier / Accountant / WarehouseKeeper` taxonomy — these roles do not exist in this repo's `role_permissions` enum and CORE_PLAN §4 explicitly defines only `owner / shop_seller / factory_sender`.
