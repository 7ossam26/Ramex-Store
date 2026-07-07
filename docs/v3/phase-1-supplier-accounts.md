# v3 · Phase 1 — Supplier accounts: currency, opening balance, CRUD, PINV sequence

> Self-contained prompt. Paste into a fresh Claude Code session. This is the **largest** phase — it silently contains "build supplier create/edit from scratch" because **no supplier CRUD endpoint exists today**.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/v3/PLAN.md` and this file
3. The current code:
   - `backend/src/domain/treasury/suppliers/` — `suppliers.service.ts`, `suppliers.repository.ts`, `suppliers.types.ts`, `suppliers.routes.ts`, `suppliers.schemas.ts`
   - `backend/src/db/migrations/068_supplier_payables.ts`, `039_create_codes_and_suppliers.ts`, `069_supplier_phone.ts`
   - `backend/src/domain/sales/invoiceNumber.service.ts` + `backend/src/db/migrations/021_create_invoice_sequence.ts` — the **exact pattern to clone** for `PINV`
   - `frontend/src/pages/treasury/SuppliersPage.tsx`, `SuppliersListPage.tsx`, `SupplierLedgerPage.tsx`
   - `frontend/src/lib/suppliers-api.ts` (or the api module used by those pages)
   - `frontend/src/i18n/ar.ts` — the existing `supplierPayables` section
   - `frontend/src/components/dashboard/format.ts` — `fmtMoney`, `EGP`

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui
- Auth: `permissionsService.can()` — resource `suppliers`, actions `view` / `write` / `payments.write`
- Audit log on every sensitive write
- UI work MUST invoke the `ui-ux-pro-max` skill
- Egyptian phone validation `^01[0125][0-9]{8}$` for supplier phone
- No new npm dependencies without justification

## Scope

Give suppliers a real account: a **currency** (EGP or RMB, fixed after creation), an **opening balance**, full **CRUD**, an internal **purchase-invoice number sequence**, and **edit/delete** for payments — all recorded and displayed in the supplier's own currency.

### Migration (next number after the latest, e.g. `088_...`)

- `suppliers`: add `currency varchar(3) NOT NULL DEFAULT 'EGP'` with `CHECK (currency IN ('EGP','RMB'))`; backfill existing rows to `'EGP'`. Add `opening_balance decimal(14,2) NOT NULL DEFAULT 0` (**signed** — no positivity check) and `opening_balance_date date NULL`.
- `supplier_invoices`: add `currency varchar(3) NOT NULL DEFAULT 'EGP'` (denormalized); **widen** `amount_egp` to `decimal(14,2)`.
- `supplier_payments`: add `currency varchar(3) NOT NULL DEFAULT 'EGP'` (denormalized); **widen** `amount_egp` to `decimal(14,2)`.
- New `supplier_invoice_sequence(year int PRIMARY KEY, next_no int NOT NULL DEFAULT 1)` — mirror `invoice_sequence`.
- `down()` reverses every step (drop columns, drop table, narrow back to (12,2)).
- Note: the money columns are named `amount_egp` for continuity; they hold the supplier's own currency. Do **not** rename (avoids churn); currency is disambiguated by the `currency` column.

### Backend

- **Sequence:** clone `invoiceNumber.service.ts` → `nextPurchaseInvoiceNo(trx, year): Promise<string>` returning `PINV-${year}-${padStart(6,'0')}`. (It is used in Phase 2; add it here so the plumbing lands with the schema.)
- **Supplier CRUD** in `suppliers.service.ts` + `suppliers.repository.ts` + `suppliers.schemas.ts`:
  - `createSupplier({ arabic_name, english_name?, phone?, currency, opening_balance?, opening_balance_date? }, actorUserId)` — validate phone format if present; audit `supplier_created`.
  - `updateSupplier(id, patch, actorUserId)` — **reject any `currency` change** (return a clear Arabic error) — and additionally reject if the supplier already has any invoice or payment (currency is immutable once transactions exist). Audit before/after.
  - `deactivateSupplier(id, actorUserId)` — set `is_active=false` (no hard delete; FKs RESTRICT). Audit.
- **`getSupplierBalance`**: include `opening_balance` in the computed balance (`opening_balance + Σ invoices − Σ payments`); return the supplier's `currency`.
- **`listSuppliersWithBalance`**: include `currency` and `opening_balance` per supplier.
- **Payment edit/delete** (decision 7): `updatePayment(id, patch, actorUserId)` and `deletePayment(id, actorUserId)` — audited before/after; **off-treasury**, so no reversing cash/bank movement. Validate the payment's `currency` still matches the supplier.
- **Invoice/payment currency invariant:** when inserting an invoice or payment, set `currency` from the supplier and assert it matches; never allow an EGP payment against an RMB supplier.
- **Routes** (`suppliers.routes.ts`): `POST /` (create, `write`), `PATCH /:id` (update, `write`), `POST /:id/deactivate` (`write`), `PATCH /payments/:id` (`payments.write`), `DELETE /payments/:id` (`payments.write`). Keep existing routes.
- **api:** add the matching functions to the frontend suppliers api module.

### Frontend

- Wire the existing **add/edit supplier dialog** (currently backend-less) to the new endpoints. Add: currency selector (`ج.م` / `¥`), opening-balance amount, opening-balance date. Currency is a plain select on create; **disabled on edit** once transactions exist.
- **Currency-aware money:** add `fmtCurrency(amount, currency: 'EGP'|'RMB')` to `format.ts` (`¥` for RMB, `ج.م` for EGP) and use it wherever supplier amounts render.
- **Fix `SuppliersListPage.tsx`:** it currently hardcodes `(ج.م)` in column headers and sums `balance_egp` across all suppliers into one `totalBalance` — that mixes EGP and RMB into a meaningless number. Show the currency per row (via `fmtCurrency`) and either drop the grand total or show **per-currency subtotals** (one EGP subtotal, one RMB subtotal).
- Payment rows get edit/delete affordances (audited).
- Add any new Arabic strings under the `supplierPayables` section in `ar.ts`.

### Permissions & Audit

- Reuse resource `suppliers`; no new permission keys. Accountant + Owner have full access; shop_seller/factory_sender remain denied (already seeded).
- Audit: `supplier_created`, `supplier_updated`, `supplier_deactivated`, `supplier_payment_updated`, `supplier_payment_deleted` (severity medium/high as appropriate).

## Acceptance

- Create an RMB supplier with an opening balance + as-of date → balance and all amounts render in `¥`.
- Attempting to change a supplier's currency after a transaction exists is rejected with an Arabic error.
- Deactivating a supplier hides it from the active list but preserves its invoices/payments for statements.
- `getSupplierBalance` = `opening_balance + Σ invoices − Σ payments`, per currency.
- Suppliers list never sums EGP + RMB into one total.
- Editing/deleting a payment writes an audit row and moves no treasury money.
- `nextPurchaseInvoiceNo` returns `PINV-2026-000001`, `PINV-2026-000002`, … resetting per year.
- `npm run typecheck && npm run build && npm run lint` clean; migration applies + rolls back.

## Smoke checklist

- [ ] Create EGP supplier and RMB supplier; both appear with correct currency symbol.
- [ ] RMB supplier opening balance −500 (credit) shows a negative brought-forward correctly.
- [ ] Edit supplier name → audited; try to change currency after adding an invoice → rejected.
- [ ] Deactivate supplier → gone from active list; its ledger still reachable.
- [ ] Create two purchase invoices in the same year → PINV numbers increment; new year → resets to 000001.
- [ ] Edit then delete a payment → both audited; no cash/bank movement created.
- [ ] Suppliers list shows per-currency subtotals, never a mixed grand total.

## Commit

`feat(v3-phase-1): supplier accounts — currency, opening balance, CRUD, PINV sequence`

## Stop here

Print "Phase 1 done — ready for Phase 2" and exit.
