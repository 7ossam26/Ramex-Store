# v2 · Phase 8 — Finance: InstaPay Expense + Cash Drawer UI Label

> Self-contained prompt. Paste into a fresh Claude Code session. **The business-day window math from the original v2 draft was dropped — this phase is now small.**

## Read first (in order)

1. `CORE_PLAN.md` — end to end (§6.7 Cash & Bank)
2. `docs/requirements-v2.md` — **§4.1, 4.2** (resolved — `business_day_id` is dropped, stale invoices stay 7 calendar days)
3. `docs/v2/PLAN.md` and `docs/v2/questions-resolved.md`
4. The current code:
   - `backend/src/domain/finance/finance.schemas.ts` — `CreateExpenseSchema`
   - `backend/src/domain/finance/expensesService.ts` (or equivalent)
   - `backend/src/domain/finance/cashDrawerService.ts`
   - `frontend/src/pages/finance/` — expense form, cash drawer screen
   - `backend/src/domain/sales/staleInvoices.job.ts` — verify it stays on 7 calendar days

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only
- Auth: `permissionsService.can()`
- Audit log on every expense
- UI work MUST invoke the `ui-ux-pro-max` skill (expense form + cash drawer header label)
- No new npm dependencies without justification in the commit body

## Scope

### 4.1 · Expenses: InstaPay as a payment source

- `CreateExpenseSchema.paid_from`: extend from `z.enum(['cash', 'bank'])` to `z.enum(['cash', 'bank', 'instapay'])`.
- When `paid_from = 'instapay'`, `bank_account_id` is **required** (same pattern as `'bank'`).
- Expense form UI adds an InstaPay tile/radio; selecting it surfaces the bank-account picker.
- Funds debit the selected bank account, NOT the cash drawer.
- Audit log row reflects the new method.
- No schema migration needed if `bank_account_id` already exists on the expenses table — verify first.

### 4.2 · Cash drawer — UI label only

**No business-day math.** No `business_day_id` column. Stale invoices keep 7 calendar days.

Only two UI changes:

1. **Cash drawer screen header** — add an Arabic label «اليوم يبدأ من 10:30 ص — إغلاق يدوي» so the cashier sees the intended opening time.
2. **Manual close button** — the cashier closes the drawer manually whenever. If this already exists in v1.1, just confirm it's wired and visible. If not, add the affordance (button + confirmation + audit row when pressed).

There is NO automatic midnight close. There is NO business-day window math.

### What this phase does NOT do (explicit non-goals)

- Does NOT add `business_day_id` to any table.
- Does NOT change how reports group by day.
- Does NOT change `staleInvoices.job.ts` logic — verify it still uses 7 calendar days and leave it.
- Does NOT change the time math anywhere.

## Acceptance

- An expense paid via InstaPay debits the selected bank account, not the cash drawer
- Trying to create an InstaPay expense without `bank_account_id` is rejected
- Cash drawer screen header shows «اليوم يبدأ من 10:30 ص — إغلاق يدوي»
- Manual close button exists, audited, works
- Stale invoices still flag at 7 calendar days
- No regression in any other finance flow
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] Create expense `paid_from = 'instapay'` with a bank account → debits bank, not cash drawer
- [ ] Create expense `paid_from = 'instapay'` without a bank account → server rejects
- [ ] Cash drawer header shows the new Arabic label
- [ ] Manual close button → confirms → drawer state recorded as closed; audit row exists
- [ ] Stale invoice cron continues to flag invoices older than 7 calendar days
- [ ] No new columns appear in any table that I didn't intend

## Commit

`feat(v2-phase-8): finance — instapay expense source + cash drawer ui label`

## Stop here

Print "Phase 8 done — ready for Phase 9" and exit.
