# v3 · Phase 0 — Supplier payments go off-treasury

> Self-contained prompt. Paste into a fresh Claude Code session. **This phase is tiny and behavior-only — no schema, ~1 file.** It is isolated first because it is the riskiest change (it alters treasury/report numbers) and is completely independent of everything else in the epic.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (§6.7 Cash & Bank, §7 Payments)
2. `docs/v3/PLAN.md` and this file
3. The current code:
   - `backend/src/domain/treasury/suppliers/suppliers.service.ts` — `recordPayment()` (lines ~53–99) currently debits cash/bank
   - `backend/src/domain/finance/cashDrawerService.ts` — `recordMovement`
   - `backend/src/domain/finance/bankService.ts` — `recordMovement`
   - `backend/src/domain/reports/dailyReportService.ts` and `backend/src/domain/shifts/shiftReportService.ts` — verify (read only) that they aggregate ALL cash/bank movements generically

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex, Postgres 16
- Auth: `permissionsService.can()` — routes already guarded by `requirePermission('suppliers', 'payments.write')`
- Audit log on every sensitive write
- No new npm dependencies

## Scope

Make recording a supplier payment **purely a supplier-account event** — it must no longer move money in the cash drawer or any bank account.

### Backend — `suppliers.service.ts` `recordPayment()`

- Remove the block that debits the treasury: the `cashRecordMovement(...)` call and the `else if (data.bank_account_id) bankRecordMovement(...)` call, plus the supplier-name lookup that only existed to label those movements.
- Remove the now-unused imports of `recordMovement as cashRecordMovement` and `recordMovement as bankRecordMovement`.
- **Keep** the `supplier_payments` insert, the `method` and `bank_account_id` columns (they become informational only), and the `auditFromService` call.
- The function still runs inside a transaction and still returns the created payment.

### Do NOT

- Do **not** reverse or delete any existing `cash_movements` / `bank_movements` rows with `reference_type='supplier_payment'`. They are immutable ledger facts; the drawer/account balances already reflect them. Only **future** payments change behavior.
- Do **not** change `dailyReportService.ts`, `shiftReportService.ts`, `TreasuriesOverview`, or reconciliation code. Their numbers will shift on their own (supplier payments stop appearing as `expense`/`other_out` outflows) — that is the intended effect.
- Do **not** touch schema, routes, or the frontend.

## Acceptance

- Recording a supplier payment creates **no** `cash_movements` or `bank_movements` row.
- The supplier's balance still updates (invoices − payments) and the payment still appears in the supplier ledger.
- The daily report's cash-out total no longer includes supplier payments made after this change.
- Audit row `supplier_payment_recorded` still written.
- `npm run typecheck && npm run build && npm run lint` clean.

## Smoke checklist

- [ ] Record a cash supplier payment → supplier ledger shows it; `/cash` movements list gets **no** new row; drawer balance unchanged.
- [ ] Record a bank-transfer supplier payment with a bank account → **no** new `bank_movements` row; bank balance unchanged.
- [ ] Daily report before vs after a supplier payment → cash-out total identical (payment not counted).
- [ ] Audit log has the `supplier_payment_recorded` entry.

## Commit

`feat(v3-phase-0): supplier payments recorded off-treasury (no cash/bank debit)`

## Stop here

Print "Phase 0 done — ready for Phase 1" and exit.
