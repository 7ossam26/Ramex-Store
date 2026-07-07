# v3 · Phase 4 — Customer accounts: opening balance, standalone receipt, statement

> Self-contained prompt. Paste into a fresh Claude Code session. Depends on Phase 3 (statement engine). Customer side is **EGP-only** and reuses the existing customer ledger.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (§6 Customers, §12 Reports)
2. `docs/v3/PLAN.md`, `docs/v3/phase-3-account-statement-engine.md`, and this file
3. The current code:
   - `backend/src/domain/customers/ledgerService.ts` — `appendEntry(customerId, actorUserId, entryType, amountEgp, referenceType?, referenceId?, notesAr?)` (does balance update + `balance_after_egp` + audit under a row lock)
   - `backend/src/domain/customers/customersService.ts`
   - `backend/src/db/migrations/016_create_customers.ts`, `017_create_customer_ledger_entries.ts`
   - `backend/src/domain/sales/invoices.service.ts` + `backend/src/db/migrations/018_create_invoices.ts`, `019_create_invoice_lines.ts`, `020_create_payments.ts` — sales invoices with line items (source of the detailed customer statement)
   - `backend/src/domain/reports/secondaryReports/customerLedger.ts` — **broken** (queries `cle.direction` / `cle.invoice_id` which do not exist); fix or retire
   - The Phase 3 statement engine (`buildStatement`, `statementToExport`) and the frontend statement page
   - `frontend/src/pages/customers/CustomersList.tsx`, `CustomerDetail.tsx`

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only
- Auth: `permissionsService.can()` — resource `customers`, action `read` for statements, `write` for opening balance / receipts
- Reuse the Phase 3 statement engine — do NOT build a second one
- Reuse `appendEntry` — do NOT build a parallel receipts table
- EGP-only on the customer side
- Never auto-print — preview first with a طباعة button
- UI work MUST invoke the `ui-ux-pro-max` skill

## Scope

Give customers the same account experience: a one-time **opening balance**, a way to **record a standalone receipt** (payment not tied to a POS sale), and a printable/exportable **statement** — all via the existing ledger and the Phase 3 engine.

### Backend

- **Opening balance:** `setCustomerOpeningBalance(customerId, signedAmount, asOfDate, actorUserId)` → a synthetic ledger row via `appendEntry(id, actor, 'adjustment', signedAmount, 'opening_balance', null, notesAr)` dated at `asOfDate`. If an opening entry already exists, update it (and re-audit). This appears as the first "brought forward" line.
- **Standalone receipt:** `recordStandaloneReceipt(customerId, amount, notesAr, actorUserId)` → `appendEntry(id, actor, 'payment', -amount, 'standalone', null, notesAr)`. `appendEntry` already updates `current_balance_egp`, writes `balance_after_egp`, and audits under a lock; a `'payment'` entry correctly does **not** inflate `lifetime_volume_egp`. Add a zod schema (amount positive) + route + api.
- **Customer adapter → Phase 3 engine:** map the customer's timeline into `StatementAccount` (currency `'EGP'`): sales invoices (with `invoice_lines`, `debit = total_egp`, dated by invoice `created_at`), payments/deposits and refunds, returns, standalone receipts, and the opening entry. Feed into `buildStatement` + `statementToExport`.
- **Route** `GET /customers/:id/statement?from=&to=&format=&variant=` (`read`) mirroring the supplier statement route.
- **Fix or retire `customerLedger.ts`:** either rewrite its query against the real `customer_ledger_entries` columns (signed `amount_egp`, `reference_type`/`reference_id` — no `direction`/`invoice_id`) or remove it and point the secondary-reports registry at the new statement. Do not leave a route that throws.
- Routes: `POST /customers/:id/opening-balance` (`write`), `POST /customers/:id/receipts` (`write`), plus the statement `GET`.

### Frontend

- On `CustomerDetail.tsx`: an **opening balance** editor (signed amount + as-of date) and a **"record receipt"** button (amount + notes) — both audited.
- `CustomerStatementPage` reusing the Phase 3 statement UI (from/to, summary/detailed toggle, preview, طباعة, PDF, Excel) — EGP-only (`ج.م`).
- Arabic strings for opening balance «رصيد افتتاحي», receipt «سند قبض / دفعة», and reuse the statement strings from Phase 3.

## Acceptance

- Set a customer opening balance (e.g. they already owe 1,000 ج.م) → shows as the first brought-forward line of the statement.
- Record a standalone receipt → `current_balance_egp` drops, `lifetime_volume_egp` unchanged, entry appears in the statement.
- Customer statement over a range shows sales (with items in the detailed variant), payments/receipts, running balance, closing balance; exports to PDF/Excel/print with preview first.
- The previously broken customer-ledger report no longer throws (fixed or retired).
- `npm run typecheck && npm run build && npm run lint` clean.

## Smoke checklist

- [ ] Opening balance set + edited → single opening entry, audited, correct brought forward.
- [ ] Standalone receipt → balance down, lifetime volume unchanged, audit present.
- [ ] Statement detailed variant shows purchased items per sales invoice; summary does not.
- [ ] PDF / Excel / print all render RTL, Western digits, ج.م; preview shows before print.
- [ ] Old `customerLedger` report endpoint returns data (or is cleanly removed) — no runtime error.

## Commit

`feat(v3-phase-4): customer accounts — opening balance, standalone receipt, statement`

## Stop here

Print "Phase 4 done — ready for Phase 5" and exit.
