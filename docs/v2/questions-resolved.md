# v2 — Resolved Answers (frozen record)

This file freezes the decisions reached after two rounds of clarifications. It is the authoritative record of what was agreed; the implementation prompts and `docs/requirements-v2.md` are kept in sync with it.

---

## Phase 1 — Inventory foundations

1. **Lot uniqueness scope.** `lot_no` is **globally UNIQUE**, **auto-generated**, **read-only**. Format: `L-000001` (mirrors fabric `M-000001`).
2. **`purchase_price_egp`.** **Dropped entirely** — it's gone from Add Top, gone from `TopRollEntrySchema`, and the column is removed from `rolls`.
3. **Old data.** **Wiped.** System is pre-production; migrations are destructive where convenient.
4. **`length_m`.** Manual entry only. No GSM-derived calculation. Each fabric is `unit: 'kg'` XOR `unit: 'meter'` — exclusive, not both.
5. **Lot visibility.** Inventory grid shows lot column + filter by lot. **No standalone Lots admin page.** **No factory picklist screen.** Lot is just metadata captured on Add Top and visible/filterable in inventory.

## Phase 2 — Add Top UX

6. **Lot numbering.** Auto-generated as above. User picks lots **per row** — flexible. Within one Add Top session, the same `(fabric, color)` can be split across multiple lots if Ahmed chooses. He can also reuse an existing lot across sessions.
7. **Per-row defaults.** Width per roll: defaults to fabric's `width_cm`, editable per row. Weight: placeholder only (does NOT auto-fill); each row's weight must be confirmed manually.
8. **Multi-fabric batches.** **Yes.** UX: sub-grouped — pick fabric → add rows under it → click «+ fabric جديد» → add rows under the next fabric. One session can mix fabrics freely.
9. **Warehouse.** Add Top is **factory-warehouse only**. Ahmed is the only user. No warehouse picker in the form.

## Phase 3 — Shipment per-fabric pricing

10. **Reference price column.** New `rolls.reference_price_per_unit numeric(12,2) NULL`. Ziad enters one per-fabric price at shipment receipt → fanned out to every roll's `reference_price_per_unit` (unit-aware: × `weight_kg` for kg fabrics, × `length_m` for meter fabrics). Stays read-only afterwards.
11. **`selling_price_egp`.** Remains the **POS-entered final sale price**, written when the sale completes.
12. **No per-roll override at shipment receipt.** Strict per-fabric price. Final price is entered separately at POS time.
13. **Unit exclusivity.** kg-fabrics use `weight_kg` for pricing math; meter-fabrics use `length_m`. Never mixed.
14. **Reports differentiate** between `reference_price_per_unit` and `selling_price_egp` — explicitly two prices in any margin report.

## Phase 4 — Fulfillment destination

15. **Field location.** `invoices.fulfillment_destination varchar(32)`, values `'shop' | 'factory_direct'`. **Per invoice**, not per line. Mixed destinations on one invoice are **impossible**.
16. **When set.** At **invoice creation in POS**, not at shipment receipt.
17. **Stock movement.** No transit state. Upon invoice payment, every roll on the invoice flips `status: in_stock` → `sold`. The `warehouse` field **stays as it was** — a roll sold from `factory` stays `warehouse: 'factory'` after the sale, a roll sold from `shop` stays `'shop'`. Reports can therefore split "sold from factory" vs "sold from shop".
18. **No handover tracking.** No factory-side confirmation UI; customer just walks out with the invoice paper.
19. **POS roll visibility:**
    - `fulfillment_destination = 'factory_direct'` → POS shows **factory rolls only** (shop rolls hidden)
    - `fulfillment_destination = 'shop'` → POS shows **all rolls**, but factory rolls are visible-and-disabled with the Arabic label «في المصنع» and are not selectable
20. **Stock deduction.** Comes from the roll's actual `warehouse` field — factory rolls decrement factory inventory, shop rolls decrement shop inventory.

## Phase 5 — POS pricing + open-invoice deposit

21. **Per-unit price override at POS.** Unit-aware («سعر الكيلو النهائي» or «سعر المتر النهائي»). Affects the current sale only — never updates `FabricColorPrice.default_price_per_kg`.
22. **Open invoice with deposit, no lines.** Allowed. Initial state: `total_egp = deposit`, `paid_egp = deposit`, `balance_egp = 0`, `lines = []`. As lines are added, `total_egp` **updates to `sum(lines)`** (the deposit-as-total starting point was wrong; only the sum-of-lines model is kept).
23. **Deposit is REFUNDABLE.** When items end up worth less than the deposit, customer either takes the remaining cash back **or** completes the invoice by adding more items.
24. **Refund mechanics:**
    - Cashier triggers it (no Owner approval threshold).
    - Recorded as a **negative-payment row** on the invoice (`payments.amount_egp < 0`, `method: 'cash'` or matching the original).
    - `total_egp` ends at the line total (e.g. 300 EGP); the negative-payment row carries the refund (e.g. 200 EGP); invoice balance closes to zero.
    - Invoice status becomes `'deposit_refunded'` (new enum value).
    - Cash drawer outflow for the refund amount, audited.
    - Partial refunds supported by definition (each refund is just another negative-payment row).

## Phase 6 — Return on scan

25. **Refund method.** Cashier picks at refund time (cash, instapay, bank_transfer, cheque) — depends on availability.
26. **One branch only.** Drop all cross-branch return concerns.
27. **Refund amount.** Original sold price (sticky from `sale_lines`), not the current `selling_price_egp` on the roll.
28. **No Owner-approval threshold for returns.** Cashier triggers freely; the audit row is the safety net.

## Phase 7 — Payment methods (bank transfer + cheque)

29. **Payment info only.** Bank transfer and cheque both behave like InstaPay — just metadata captured on the payment record. No reconciliation operations, no clearing/bouncing workflow.
30. **Cheque due-date validation.** Only enforce `due_date >= issue_date`. Past due_date is acceptable input (it's reference info, not a state machine).
31. **Receipt printing.** Cheque details **not on the printed receipt**. Visible only inside the admin panel.
32. **Bounced-cheque workflow.** Out of scope for v2.

## Phase 8 — Finance simplification

33. **InstaPay as expense source.** `paid_from` extends to `'cash' | 'bank' | 'instapay'`. When `'instapay'`, `bank_account_id` is required. Funds debit the bank account, not the cash drawer.
34. **Business day window — DROPPED.** No `business_day_id` column. No date-bucket math changes. Stale invoices use **plain 7 calendar days**. Reports use plain calendar days.
35. **Cash drawer UI label only.** Cash drawer screen shows "Opens 10:30 AM, manual close". The cashier closes the day manually whenever; no automatic boundary at midnight.

## Phase 9 — HR module

36. **One table for adjustments.** `hr_salary_adjustments` with `kind: 'advance' | 'deduction'`. No separate advances/deductions tables. No repay-an-advance mechanic.
37. **Net pay formula.** `net_egp = base_salary_egp − sum(adjustments_for_month)`.
38. **One disbursement per `(employee, month)`.** UNIQUE constraint. No bonuses, no 13th salary, no mid-month adjustments.
39. **Employee fields.** Minimal: `name_ar`, `phone`, `role_ar`, `base_salary_egp`, `is_active`. No national ID, hire date, termination date, or branch_id.
40. **Permissions.** `hr.view`, `hr.manage`, `hr.salary.disburse`, `hr.advance.create`, `hr.deduction.create` (or whatever the closest existing matrix shape allows).

## Cross-cutting

41. **Resolved requirements doc.** [docs/requirements-v2.md](../requirements-v2.md) is rewritten in place as the resolved version. This file (`questions-resolved.md`) is the record of how it got there.
42. **Phase cadence.** Each phase is run as its own Claude Code session. The owner runs them one at a time, with deploys between phases at their discretion.
