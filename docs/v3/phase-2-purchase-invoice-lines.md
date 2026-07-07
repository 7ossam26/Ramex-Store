# v3 · Phase 2 — Line-item purchase invoices

> Self-contained prompt. Paste into a fresh Claude Code session. Depends on Phase 1 (currency, PINV sequence).

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/v3/PLAN.md`, `docs/v3/phase-1-supplier-accounts.md`, and this file
3. The current code:
   - `backend/src/domain/treasury/suppliers/` — service, repository, schemas, routes, types (as extended by Phase 1)
   - `backend/src/db/migrations/019_create_invoice_lines.ts` — structural precedent for line-item tables
   - `backend/src/domain/sales/invoiceNumber.service.ts` and the new `nextPurchaseInvoiceNo` from Phase 1
   - `frontend/src/pages/treasury/SuppliersPage.tsx`, `SupplierLedgerPage.tsx`
   - `frontend/src/components/ResponsiveTable.tsx` — table pattern
   - `frontend/src/i18n/ar.ts` — `supplierPayables` section

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui
- Auth: `permissionsService.can()` — resource `suppliers`, action `write` for invoice CRUD
- Audit log on every sensitive write; **invoices & lines editable/deletable freely, always audited** (decision 7)
- UI work MUST invoke the `ui-ux-pro-max` skill
- No new npm dependencies

## Scope

Turn the flat-amount purchase invoice into a **detailed document** with free-text line items, an extra-charges line, and a due date — all in the supplier's currency, booked as outstanding credit.

### Migration (next number, e.g. `089_...`)

- New table `supplier_invoice_lines`:
  - `id bigserial PK`
  - `supplier_invoice_id bigint NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE`
  - `description text NOT NULL`
  - `quantity decimal(14,3) NOT NULL CHECK (quantity > 0)`
  - `unit varchar(8) NOT NULL CHECK (unit IN ('kg','meter','roll','piece'))`
  - `unit_price decimal(14,2) NOT NULL CHECK (unit_price >= 0)`
  - `line_total decimal(14,2) NOT NULL`
  - index on `supplier_invoice_id`
- `supplier_invoices`: add `extra_charges decimal(14,2) NOT NULL DEFAULT 0 CHECK (extra_charges >= 0)`, `due_date date NULL`, `subtotal decimal(14,2) NOT NULL DEFAULT 0`, `total decimal(14,2) NOT NULL DEFAULT 0`. Keep `amount_egp` for back-compat but set it equal to `total` on write (or migrate reads to `total`; document which). `down()` reverses all.

### Backend

- Extend `createInvoice` to accept `lines[]` + `extra_charges` + `due_date` + `invoice_no?` (supplier's own number) and, in one transaction:
  - assign the internal number via `nextPurchaseInvoiceNo(trx, year)` → store on the invoice (add an `internal_no varchar` column in the migration if not already present).
  - set `currency` from the supplier (invariant check).
  - compute each `line_total = round(quantity * unit_price, 2)`; `subtotal = Σ line_total`; `total = subtotal + extra_charges`; store all.
  - insert invoice + lines; audit `supplier_invoice_created` with `after` = the invoice + line summary.
- `updateInvoice(id, patch, actorUserId)` — replace lines/charges/due date, recompute totals, audit **before/after**. `deleteInvoice(id, actorUserId)` — cascade lines, audit.
- `getInvoice(id)` returns the invoice + its lines (for the detail view and, later, the detailed statement).
- Reject `quantity <= 0`, `unit_price < 0`, `extra_charges < 0`, and any line whose currency wouldn't match the supplier.
- Routes: `POST /invoices` (create — extend existing), `GET /invoices/:id` (`view`), `PATCH /invoices/:id` (`write`), `DELETE /invoices/:id` (`write`). Add api functions.

### Frontend

- **Purchase-invoice form** (create + edit): supplier picker (locks currency), supplier invoice-no, invoice date, **due date**, dynamic **line rows** (description, quantity, unit dropdown `كجم / متر / توب / قطعة`, unit price, auto-computed line total), an **extra-charges** field, and a live **subtotal / total** footer — all shown with the supplier's currency symbol via `fmtCurrency`.
- **Invoice list** (per supplier and/or global) using `ResponsiveTable`: internal no, supplier no, date, due date, total (currency-aware), status.
- **Invoice detail**: header + lines table + totals + edit/delete actions.
- New Arabic strings under `supplierPayables` (units, extra charges «مصاريف إضافية», due date «تاريخ الاستحقاق», subtotal «الإجمالي الفرعي», total «الإجمالي»).

## Acceptance

- Book a multi-line RMB invoice → shows as outstanding credit in `¥`; internal `PINV-YYYY-NNNNNN` assigned; `subtotal`/`total` correct including extra charges.
- Edit a line's quantity → line total, subtotal, total, and the supplier balance all recompute; audit row written with before/after.
- Delete an invoice → its lines cascade; supplier balance drops; audit row written.
- Line with qty 0 or negative price is rejected.
- `npm run typecheck && npm run build && npm run lint` clean; migration applies + rolls back.

## Smoke checklist

- [ ] Create a 3-line invoice with extra charges → total = Σ lines + extra charges; ¥/ج.م per supplier.
- [ ] Edit → change a line and extra charges → totals + balance recompute; audit before/after present.
- [ ] Delete an invoice → lines gone (cascade), balance updated, audit present.
- [ ] Invalid line (qty 0) → server rejects with Arabic error.
- [ ] Due date persists and shows on the detail view.

## Commit

`feat(v3-phase-2): line-item purchase invoices with extra charges and due date`

## Stop here

Print "Phase 2 done — ready for Phase 3" and exit.
