# v2 · Phase 5 — POS: Per-Unit Price Override + Open-Invoice Deposit (No Lines)

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (especially §6.5 POS)
2. `docs/requirements-v2.md` — sections **3.1** and **3.2**
3. `docs/v2/PLAN.md` — phase index + universal constraints
4. The current code:
   - `frontend/src/pages/pos/POS.tsx` (and any POS sub-components)
   - `backend/src/domain/sales/` — `invoices.service.ts`, `openInvoices.service.ts`, `sales.types.ts`, sale-line schemas
   - `backend/src/domain/items/items.types.ts` — `Fabric.unit` (Phase 1)
   - `rolls` table — `weight_kg`, `length_m`, `selling_price_egp`

If Phase 1 hasn't landed, **stop and surface that**.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: `permissionsService.can()` — never inline role checks
- Audit log row on every override and every payment
- UI work MUST invoke the `ui-ux-pro-max` skill at the start and per major section
- No new npm dependencies without justification in the commit body

## Scope

### 3.1 · Final price override per unit at POS

`SaleLineSchema` already has `sellingPriceOverride` (per-roll absolute amount). Keep the underlying field, but **the UX is unit-aware**:

- For `kg`-fabrics: input labelled «سعر الكيلو النهائي»; the line total is auto-computed `override × roll.weight_kg`.
- For `meter`-fabrics: input labelled «سعر المتر النهائي»; line total `override × roll.length_m`.
- The cart row shows the per-unit override input inline (compact), plus the computed line total to its right. Empty override = use `roll.selling_price_egp` as-is.
- Server: when accepting the sale, the server stores the resolved absolute `selling_price_egp` for that line. The override per-unit value is also persisted (extend `sale_lines` if not already done — `final_price_per_unit numeric(10,2) NULL`) so reports can show "sold at X per kg".
- Audit row whenever an override is applied, payload `{ rollId, originalPricePerUnit, finalPricePerUnit, lineTotal }`.

### 3.2 · Open invoice with deposit but no rolls

Today, open invoices already exist via `payment_kind: 'deposit'` (see `openInvoices.service.ts`). Extend that flow so the cashier can:

1. **Create an open invoice with a customer, a deposit payment, and zero invoice lines.**
   - Validation: `lines.length === 0` is allowed only when `payment_kind === 'deposit'` and `paid_egp > 0`.
   - `total_egp` is initially the deposit amount (or 0 — pick whichever existing convention the codebase already follows for line-less open invoices and document it in the commit body).
   - `balance_egp = total_egp - paid_egp` — surface this clearly so a no-lines deposit shows a "credit on account" balance once lines are added later.
2. **List view:** Open invoices with zero lines are flagged in the POS open-invoice list (Arabic: «دفعة مقدمة - بدون رولات»).
3. **Reopen + complete:** When the same invoice is reopened later, the cashier adds rolls via the standard POS flow. On completion:
   - `total_egp` recalculates from the lines.
   - The existing deposit is automatically applied (no manual entry).
   - Remaining balance is collected via the normal payment surface.
4. **Constraint:** an open deposit invoice cannot be marked `delivered` until lines exist.

### Backend touch points

- `openInvoices.service.ts`: allow zero-lines on create when deposit > 0.
- `invoices.service.ts`: ensure the reopen-and-add-lines path correctly carries the existing `paid_egp` into the balance calculation.
- New endpoint **not required** — the existing open-invoice endpoints should accept the wider shape.
- Audit: log creation of a no-lines deposit invoice with a distinct action (`open_invoice_deposit_no_lines`).

### Frontend touch points

- POS cart shows a "Save as deposit (no rolls)" action when the cart is empty and the customer is selected.
- Reopening a no-lines deposit invoice prefills the deposit amount in the payment summary and disables payment-method change for that prepaid portion.

## Acceptance

- A POS cashier can scan a kg-roll, type a final per-kg price, and the line total updates instantly to `price × weight_kg`
- Same flow with a meter-roll uses `length_m`
- A no-lines deposit invoice can be created and reopened; lines added later show the deposit as automatically deducted
- `final_price_per_unit` lands in `sale_lines` and is queryable for reports
- Audit log shows distinct actions for override and for no-lines deposit creation
- No regression in existing v1.1 POS flows (cash sale, split payment, walk-in blocked, discount-by-final-price calculator)
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] kg-fabric: scan roll, override per-kg price, cart shows correct line total
- [ ] meter-fabric: scan roll, override per-meter price, cart uses `length_m` not `weight_kg`
- [ ] Reset the override (clear the field) — line falls back to `roll.selling_price_egp`
- [ ] Create open invoice with customer + 200 EGP deposit, no rolls — appears in open list with the deposit flag
- [ ] Reopen the deposit invoice, add 3 rolls, complete the sale — final balance = total − 200
- [ ] Try to mark a no-lines deposit invoice as delivered — blocked with a clear Arabic error
- [ ] Audit log entries match the actions above

## Commit

`feat(v2-phase-5): pos — per-unit price override (kg/meter) + open invoice deposit without lines`

## Stop here

Do not start Phase 6. Print "Phase 5 done — ready for Phase 6" and exit.
