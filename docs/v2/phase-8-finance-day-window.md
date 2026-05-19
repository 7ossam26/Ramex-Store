# v2 · Phase 8 — Finance: InstaPay Expense + Business Day Window

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (§6.7 Cash & Bank, §6.x reports)
2. `docs/requirements-v2.md` — sections **4.1** and **4.2**
3. `docs/v2/PLAN.md` — phase index + universal constraints
4. The current code:
   - `backend/src/domain/finance/finance.schemas.ts` — `CreateExpenseSchema`
   - `backend/src/domain/finance/expensesService.ts` (or equivalent) — expense creation
   - `backend/src/domain/finance/cashDrawerService.ts` — daily reconciliation
   - `backend/src/domain/sales/staleInvoices.job.ts` — stale-invoice detection
   - Any reporting service that groups by "today" / day-of-week
   - Anywhere `startOfDay` / `endOfDay` / Cairo-day helpers exist (grep first)

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only
- Auth: `permissionsService.can()` — never inline role checks
- Audit log on every expense
- UI work MUST invoke the `ui-ux-pro-max` skill (only the expense form is touched here)
- No new npm dependencies without justification in the commit body

## Scope

### 4.1 · Expenses: InstaPay as a payment source

- `CreateExpenseSchema.paid_from` extends from `z.enum(['cash', 'bank'])` to `z.enum(['cash', 'bank', 'instapay'])`.
- When `paid_from = 'instapay'`, `bank_account_id` is **required** (same pattern as existing `paid_from = 'bank'`).
- Expense form UI adds an InstaPay tile/radio; selecting it surfaces the bank-account picker.
- Funds debit the selected bank account, NOT the cash drawer (mirror the InstaPay routing guard from sales).
- Audit log row reflects the new method.
- No schema migration needed if `bank_account_id` already exists on the expenses table — verify before assuming. If not, add it with a separate migration.

### 4.2 · Business day window: 10:30 AM → 12:00 AM (midnight) Cairo time

Today's app likely treats a day as `[00:00, 24:00)` Cairo. Change it to `[10:30 same day, 24:00 same day)` for *all* day-boundary logic. A "day" `D` is now:

```
start = D 10:30 Cairo
end   = D + 1 day, 00:00 Cairo (exclusive)
```

Times falling between 00:00 and 10:30 belong to the **previous day**.

- Define a single helper, e.g. `cairoBusinessDay.ts`:
  - `getBusinessDayStart(date: Date): Date`
  - `getBusinessDayEnd(date: Date): Date`
  - `getBusinessDayForInstant(date: Date): { dayId: 'YYYY-MM-DD'; start: Date; end: Date }`
- Replace all current "start of day" / "end of day" usages in:
  - `cashDrawerService.ts` (daily reconciliation)
  - `staleInvoices.job.ts` (stale invoice cutoff)
  - Reports that group by day (sales report, expenses report, payments report)
  - Any "today's …" filter in API queries (grep for `startOfDay`, `Cairo`, `today`)
- Stale invoice detection: a 7-day stale window is now 7 business days as defined above. Verify the cron schedule itself runs at a sensible time (probably right after the 00:00 boundary).
- Cash drawer reconciliation: a reconciliation entry for "day D" represents activity in `[D 10:30, D+1 00:00)`. Update the UI labels so the date a cashier sees matches that window. Show the window explicitly in the Cash Reconcile screen header (Arabic: «اليوم: D — 10:30 ص حتى 12:00 ص»).

### Backward-compatible reads

- Historical reconciliations and reports computed on the old window must continue to render. Do not retroactively re-bucket old rows.
- Add a column `business_day_id DATE NULL` to the relevant ledger tables (cash drawer movements, payments, expenses) and backfill it for new rows from now on. Old rows stay NULL; readers fall back to the legacy logic when `business_day_id` is NULL.

### Migration

- Add `business_day_id DATE NULL` to the ledger tables identified above. Index it.
- Backfill on insert (trigger or service-layer); no migration backfill of historical rows.
- `up` + `down` clean.

## Acceptance

- An expense paid via InstaPay debits the selected bank account, not the cash drawer
- A sale completed at 02:00 Cairo on 2026-06-05 is attributed to business day 2026-06-04 in the cash drawer screen and reports
- A sale completed at 11:00 Cairo on 2026-06-05 is attributed to 2026-06-05
- The Cash Reconcile screen shows the active window in its header
- The stale-invoice cron still produces correct notifications
- Old historical rows still render in reports
- `npm run typecheck && npm run build && npm run lint` is clean
- Migration rollback is clean

## Smoke checklist

- [ ] Create expense `paid_from = 'instapay'` with a bank account — debits bank, not cash drawer
- [ ] Create expense `paid_from = 'instapay'` without a bank account — server rejects
- [ ] Insert a `payments` row at 23:30 Cairo today — `business_day_id` = today
- [ ] Insert a `payments` row at 01:00 Cairo tomorrow — `business_day_id` = today (yesterday calendar-wise)
- [ ] Insert a `payments` row at 11:00 Cairo tomorrow — `business_day_id` = tomorrow
- [ ] Cash Reconcile for today shows the 10:30→00:00 window in its header and includes only rows within it
- [ ] Reports' "today" filter matches the same window
- [ ] Stale invoices job continues to flag invoices older than 7 business days

## Commit

`feat(v2-phase-8): finance — instapay expense source + business-day window 10:30→00:00 Cairo`

## Stop here

Do not start Phase 9. Print "Phase 8 done — ready for Phase 9" and exit.
