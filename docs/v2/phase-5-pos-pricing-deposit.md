# v2 · Phase 5 — POS: Final Per-Unit Price + Refundable Open-Invoice Deposit

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (especially §6.5 POS)
2. `docs/requirements-v2.md` — **§3.1, 3.2** (resolved versions — refundable deposit, status `deposit_refunded`)
3. `docs/v2/PLAN.md` and `docs/v2/questions-resolved.md`
4. The current code:
   - `frontend/src/pages/pos/POS.tsx`
   - `backend/src/domain/sales/` — `invoices.service.ts`, `openInvoices.service.ts`, `sales.types.ts`, sale-line schemas
   - `backend/src/domain/items/items.types.ts` — `Fabric.unit` (Phase 1)
   - `rolls` table — `weight_kg`, `length_m`, `selling_price_egp`, `reference_price_per_unit`
   - `payments` table — confirm `amount_egp` is signed/can be negative (or add constraint allowing it)

If Phase 1 hasn't landed, **stop and surface that**.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: `permissionsService.can()` — never inline role checks
- Audit log row on every override, payment, and refund
- UI work MUST invoke the `ui-ux-pro-max` skill at the start and per major section
- No new npm dependencies without justification in the commit body

## Scope

### 3.1 · Final per-unit price at POS

Existing `sellingPriceOverride` in `SaleLineSchema` is the per-roll absolute price. Keep the underlying field; reshape the UX:

- For `kg`-fabrics: input «سعر الكيلو النهائي»; line total auto-computed `override_per_kg × roll.weight_kg`.
- For `meter`-fabrics: input «سعر المتر النهائي»; line total = `override_per_meter × roll.length_m`.
- Each cart row shows the **read-only reference price** (`roll.reference_price_per_unit`) next to the editable final-price input, so the cashier sees Ziad's preliminary value as a hint but is not constrained by it.
- Empty input is invalid for POS sale — cashier must type the final per-unit price (no fallback to reference).
- Server: when accepting the sale, persist the resolved absolute `selling_price_egp` for the line on `sale_lines` AND write the same value to `roll.selling_price_egp`.
- Also persist the per-unit final price on the sale line for reports — add `sale_lines.final_price_per_unit numeric(12,2) NULL` if it doesn't already exist.
- Audit per override-applied line: `{ rollId, referencePricePerUnit, finalPricePerUnit, lineTotal }`.
- The override is per-sale only — never updates `FabricColorPrice.default_price_per_kg`.

### 3.2 · Refundable open-invoice deposit (with or without lines)

Extend the existing deposit open-invoice flow:

#### Creating a no-lines deposit invoice
- Allow `lines.length === 0` only when `payment_kind === 'deposit'` AND `paid_egp > 0`.
- Initial state: `total_egp = deposit`, `paid_egp = deposit`, `balance_egp = 0`.
- POS open-invoice list flags it: «دفعة مقدمة - بدون رولات».

#### Reopening + adding lines
- When lines are added, `total_egp` updates to `sum(line_totals)`.
- `balance_egp = total_egp − paid_egp`.

#### Refundable deposit
- When `total_egp < paid_egp` (items ended up cheaper than deposit), cashier can refund the difference.
- Refund UI: a clear «استرجاع الدفعة» button on the invoice, enabled only when `total_egp < paid_egp`.
- On click → dialog asking for refund method (cash / instapay / bank_transfer / cheque — only `cash` and `instapay` are available right now; Phase 7 unlocks the other two).
- Server writes:
  - A `payments` row with `amount_egp < 0` (negative), matching method.
  - If `method = 'cash'`, a cash drawer outflow movement.
  - If `method = 'instapay'`, a bank-account debit.
  - Updates `paid_egp` (which becomes `paid_egp + (negative amount)`).
  - Sets `invoices.status = 'deposit_refunded'`.
  - Audit row `action: 'deposit_refund'`, payload `{ invoiceId, refundEgp, method }`.
- Partial refunds: each refund is just another negative-payment row. Multiple refunds may exist on the same invoice.
- No Owner approval threshold — cashier triggers directly.

#### Constraint
- A no-lines deposit invoice cannot be marked `delivered` until lines exist (existing rule, preserve).
- Once `status = 'deposit_refunded'`, further line edits or refunds are blocked.

### Migration

- Extend `invoices.status` to include `'deposit_refunded'` (CHECK/enum extension depending on how it's currently typed — match the existing pattern).
- Ensure `payments.amount_egp` allows negative values. If a CHECK constraint blocks negatives, drop or relax it.
- `up` + `down` clean.

### Backend touch points

- `openInvoices.service.ts`: allow zero-lines on create when deposit > 0.
- `invoices.service.ts`: refund endpoint `POST /api/invoices/:id/deposit-refund { amountEgp, method, bankAccountId? }` — server validates `amountEgp > 0` (positive number from the client; server writes the negative row).
- The reopen-and-add-lines path correctly recomputes `total_egp` from lines and recomputes `balance_egp` against existing `paid_egp`.

### Frontend touch points

- POS cart shows a «حفظ كدفعة مقدمة (بدون رولات)» action when cart is empty and customer is selected.
- Reopening a no-lines deposit invoice prefills the deposit amount in the payment summary and disables payment-method change for that prepaid portion.
- «استرجاع الدفعة» button on the invoice detail screen — visible only when `total_egp < paid_egp`.

## Acceptance

- POS cashier can scan a kg-roll, type final per-kg price, line total = `price × weight_kg`
- Same flow with a meter-roll uses `length_m`
- Reference price visible (read-only) per cart row
- No-lines deposit invoice creates, reopens, adds lines, deposit auto-applies
- When items end < deposit, cashier can refund the difference; invoice flips to `deposit_refunded`; cash drawer (or bank) decreases; negative payment row exists
- Partial refunds work (multiple negative payments allowed)
- `final_price_per_unit` lands in `sale_lines`
- No regression in existing POS flows (cash sale, split payment, discount-by-final-price calculator, customer-required-strict)
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] kg-fabric: scan roll, override per-kg price, cart shows correct line total + reference price as hint
- [ ] meter-fabric: scan roll, override per-meter price, cart uses `length_m`
- [ ] Create no-lines deposit (500 EGP, customer A) → appears in open list with the flag
- [ ] Reopen the deposit invoice, add lines totaling 300 EGP, complete → `total_egp = 300`, `paid_egp = 500`, `balance_egp = -200`
- [ ] Click «استرجاع الدفعة» for 200 EGP cash → negative `payments` row, cash drawer drops 200, invoice status = `deposit_refunded`
- [ ] Try to add lines to a `deposit_refunded` invoice → blocked
- [ ] Audit log entries match the override and refund actions

## Commit

`feat(v2-phase-5): pos — per-unit final price + open-invoice deposit (refundable, deposit_refunded status)`

## Stop here

Print "Phase 5 done — ready for Phase 6" and exit.
