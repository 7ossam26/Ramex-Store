# v2 · Phase 6 — POS: Return on Scan (Sold Roll → Auto Return Invoice)

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (§6.5 POS, §6.x returns)
2. `docs/requirements-v2.md` — **§3.3**
3. `docs/v2/PLAN.md` and `docs/v2/questions-resolved.md`
4. The current code:
   - `frontend/src/pages/pos/POS.tsx` — scanner input + cart (now with Phase 5's surface)
   - `backend/src/domain/sales/returnsService.ts`
   - `backend/src/domain/sales/invoices.service.ts`
   - `rolls` table — `status` enum (`in_stock`, `sold`, `damaged`, …)
   - `sale_lines` — `line_total_egp` carries the original sold price

If Phase 5 hasn't landed, **stop and surface that**.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits
- Auth: `permissionsService.can()` — no Owner threshold needed for v2 returns (per requirements §3.3)
- Audit log on every return: `originalInvoiceId`, `returnInvoiceId`, `rollId`, `refundEgp`, `method`
- UI work MUST invoke the `ui-ux-pro-max` skill
- No new npm dependencies without justification in the commit body

## Scope

When a roll with `status: 'sold'` is scanned at POS:

1. **Recognize as a return**, not a new cart line. The POS does NOT add the roll to the active cart.
2. **Open a return panel** (side drawer, not a full route) with the original sale's meta:
   - Original invoice #
   - Customer name + phone
   - Original sale date
   - Roll's original `sale_lines.line_total_egp` (the sticky refund amount)
3. **Confirm refund:**
   - Cashier picks the refund payment method from a method picker: cash, instapay, bank_transfer, cheque (the latter two come online in Phase 7; until then, hide them or show them disabled).
   - On confirm:
     - Create a return invoice via `returnsService.ts`.
     - Refund amount = original `sale_lines.line_total_egp` (sticky — never the current `roll.selling_price_egp`).
     - Flip `rolls.status` from `'sold'` to `'in_stock'`. The `warehouse` field stays as it was.
     - Cash drawer outflow (if cash) OR bank-account debit (if instapay/bank_transfer/cheque), audited.
     - Audit row `action: 'return_on_scan'`, payload `{ originalInvoiceId, returnInvoiceId, rollId, refundEgp, method }`.

### Partial returns

- A return invoice for one roll out of a 3-roll sale leaves the other 2 sold.
- The original invoice's `status` does NOT change (it stays `delivered` or whatever it was) — only the specific roll flips.
- A second scan of the same roll later (now `in_stock`) is a normal cart line, not a return.

### Edge cases

- **Roll already in `in_stock`**: normal POS scan behaviour (add cart line if destination/warehouse rules pass — Phase 4 rules apply).
- **Roll in `damaged_shop`**: surface an Arabic error «الرول معطوب — لا يمكن استرجاعه».
- **Scanner re-fires the same roll twice while the return panel is open**: silent no-op with a quiet toast.
- **A different roll is scanned while a return panel is open for another roll**: behave as a normal POS scan — the return panel does NOT pre-empt the new scan. The two never collide because the panel can be dismissed.
- **The original sale was a `factory_direct` invoice**: the return is still allowed and behaves identically. The roll returns to `status: 'in_stock'` with `warehouse: 'factory'`. Record the origin in audit.

### Backend

- Reuse `returnsService.ts`. Add a `createReturnFromRollScan({ rollId, refundMethod, bankAccountId? })` entry point if missing; otherwise extend the existing return entry to accept these inputs.
- The refund payment is recorded as a separate `payments` row on the **return invoice**, NOT as a negative payment on the original invoice (returns and deposit refunds have different mechanics).
- All existing post-return invariants (inventory, audit, customer ledger if it exists) continue to fire.

### Frontend

- Return drawer: full-height side drawer on the left (RTL → opens from the right edge visually), header «إرجاع».
- Sticky footer with method picker + «تأكيد الإرجاع» + «إلغاء».
- Show the refund amount prominently (large font).

## Acceptance

- Scanning a sold roll opens the return drawer, never a cart line
- Confirming the return: creates one return invoice, flips the roll to `in_stock`, writes audit
- Refund amount = original sold price from `sale_lines`, regardless of current `selling_price_egp`
- Partial returns: returning 1 of 3 rolls leaves the other 2 sold
- Method picker offers cash + instapay now; Phase 7 unlocks bank_transfer + cheque (this prompt should NOT block on them being available)
- Existing return entry points (e.g., return from invoice list) keep working
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] Sell 1 roll (Phase 5 flow), scan that roll in POS → return drawer opens with correct meta
- [ ] Confirm refund as cash → roll is `in_stock`, return invoice exists, cash drawer drops, audit row exists
- [ ] Confirm refund as instapay → bank account debited instead of cash drawer
- [ ] Sell 3 rolls in one invoice, return only the middle one → other 2 stay `sold`
- [ ] Scan an `in_stock` roll → normal POS cart line, return drawer does NOT appear
- [ ] Scan a `damaged_shop` roll → blocked with Arabic error
- [ ] Re-scan an already-returned roll → adds as normal cart line (status is `in_stock` now)

## Commit

`feat(v2-phase-6): pos — scanning a sold roll opens return drawer, partial returns supported`

## Stop here

Print "Phase 6 done — ready for Phase 7" and exit.
