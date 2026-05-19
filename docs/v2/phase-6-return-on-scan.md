# v2 · Phase 6 — POS: Return on Scan (Sold Roll → Auto Return Invoice)

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (§6.5 POS, §6.x returns)
2. `docs/requirements-v2.md` — section **3.3**
3. `docs/v2/PLAN.md` — phase index + universal constraints
4. The current code:
   - `frontend/src/pages/pos/POS.tsx` — scanner input + cart
   - `backend/src/domain/sales/returnsService.ts` (existing returns logic)
   - `backend/src/domain/sales/invoices.service.ts`
   - `rolls` table — `status` enum (`in_stock`, `sold`, `damaged`, …)

If Phase 5 hasn't landed, **stop and surface that** — this builds on the POS surface that Phase 5 just reshaped.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits
- Auth: `permissionsService.can()` — returns may require Owner approval; check the existing returns policy and preserve it
- Audit log on every return (source invoice id, returning invoice id, roll id, refunded amount)
- UI work MUST invoke the `ui-ux-pro-max` skill
- No new npm dependencies without justification in the commit body

## Scope

When a roll with `status: 'sold'` is scanned at POS:

1. **Recognize it as a return**, not a sale. The POS must NOT add it as a normal cart line.
2. **Pre-populate a return invoice** via `returnsService.ts`:
   - Look up the original invoice line for that roll (the most recent `sold` sale).
   - Compute the refund amount from the original `sale_lines.line_total_egp` (not the current price).
   - Open a "Return" panel/modal in the POS UI showing: original invoice #, customer name, original sale date, the roll's original line total, and a confirm button.
3. **Confirm refund:** on confirm,
   - Create a return invoice (existing schema — do not invent a new one).
   - Flip `rolls.status` from `'sold'` to `'in_stock'`.
   - Audit: `action: 'return_on_scan'`, payload `{ originalInvoiceId, returnInvoiceId, rollId, refundEgp }`.
4. **Support partial returns:** if the source invoice had 3 rolls and only 1 is being returned, the return invoice has exactly that one line. The original invoice remains in its `delivered` state with the other 2 rolls untouched.
5. **Refund payment method:** mirror what the existing return flow does (cash refund, or credit-on-account if that's the convention). Do not introduce a new payment policy in this phase.

### Edge cases the prompt must handle

- The roll is `sold` but the original sale is from a different branch — surface a clear Arabic error and block the return (branch isolation).
- The roll is `sold` and the customer brings it to the shop but the original sale was `factory_direct` (Phase 4): the return is still allowed; record the path in audit.
- Cashier scans the same sold-roll twice in a row → the second scan no-ops with a quiet toast.
- A roll already in `in_stock` is scanned during a return panel that's open for another roll → behaves as a normal POS scan, ignoring the return panel.
- Permissions: if the existing returns flow requires Owner approval over a threshold, preserve that flow — the return panel triggers the same approval ceremony.

### Frontend

- The return panel is a side drawer, not a full-page route. Cashier can dismiss without confirming.
- Arabic strings only. Header: «إرجاع».
- Show the original sale meta clearly so the cashier verifies the right roll.

### Backend

- Reuse `returnsService.ts`. Add a `createReturnFromRollScan({ rollId })` entry point if one doesn't exist; otherwise extend the existing return entry to accept a `rollId` start point.
- All existing post-return invariants (inventory, audit, customer ledger) must continue to fire.

## Acceptance

- Scanning a sold roll opens the return panel, not a cart line
- Confirming the return creates one return invoice, flips the roll to `in_stock`, and writes an audit row
- Partial returns work: returning 1 of 3 rolls from an invoice leaves the other 2 sold
- Cross-branch return is blocked with a clear Arabic error
- All existing return flows (e.g., return started from the invoices list) still work
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] Sell 1 roll, scan that roll in POS → return panel opens with the right meta
- [ ] Confirm return → roll is `in_stock`, return invoice exists, audit row exists
- [ ] Sell 3 rolls in one invoice, return only the middle one → other 2 stay `sold`
- [ ] Scan an `in_stock` roll → normal POS cart line, return panel does not appear
- [ ] Scan a sold roll from another branch → blocked with Arabic error
- [ ] Re-scan an already-returned roll → adds as normal cart line (it's `in_stock` now)
- [ ] Owner-approval gate (if exists in v1.1 returns) still fires for high-value returns

## Commit

`feat(v2-phase-6): pos — scanning a sold roll auto-opens return invoice (partial returns supported)`

## Stop here

Do not start Phase 7. Print "Phase 6 done — ready for Phase 7" and exit.
