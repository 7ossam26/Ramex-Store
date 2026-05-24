# v2 · Phase 10 — Validation: Confirm Every Resolved Q&A Lands

> Self-contained prompt. Paste into a fresh Claude Code session **after Phase 1–9 have all merged**. This is the gate before tagging v2.0.0.

This phase does NOT add features. It exists to **prove** that every decision recorded in [docs/v2/questions-resolved.md](questions-resolved.md) is actually reflected in code and behaves correctly. Output is a pass/fail validation report; any failure must be fixed before tagging.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/requirements-v2.md` — the resolved requirements
3. `docs/v2/questions-resolved.md` — frozen Q&A record (this is the ground truth)
4. `docs/v2/PLAN.md` — phase index
5. All 9 phase prompts (`docs/v2/phase-1-…md` through `phase-9-…md`) — to know what each phase was supposed to produce
6. The current code:
   - All migrations in `backend/src/db/migrations/`
   - `backend/src/domain/` — every module touched by v2
   - `frontend/src/pages/` — POS, AddTop, ReviewShipment, HR pages
   - Existing tests under `backend/tests/` and `frontend/tests/`

> [!IMPORTANT]
> System is pre-production — destructive test data setup is fine. Tests should use the standard test database created by the existing test harness (see `backend/tests/auth.test.ts` for the pattern).

## Stack invariants (restated)

- Backend tests: Vitest (`npm test` in `backend/`)
- Frontend tests: Vitest (`npm test` in `frontend/`)
- Use the existing test patterns — don't introduce new test frameworks
- No new npm dependencies without justification in the commit body

## Scope

Three deliverables:

1. **Schema verification** — automated checks that confirm every column / constraint / FK / enum value specified in the resolved requirements exists exactly as specified.
2. **Behavioral test suite** — one test file per v2 module covering the critical Q&A points (listed below).
3. **Validation report** — a markdown document at `docs/v2/v2-validation-report.md` that maps every numbered item in `questions-resolved.md` to (a) the test(s) that verify it and (b) the pass/fail result. The report is regenerated on each test run.

---

## 1. Schema verification

Create `backend/tests/v2/schema.test.ts`. For each schema change in `docs/requirements-v2.md` *Cross-Cutting Schema Impact Summary*, write a query and assert the result. Use raw SQL via the Knex client — the tests verify the live shape of the database after migrations apply.

Required checks:

### `fabrics`
- Column `unit` exists, type `varchar(8)`, NOT NULL, DEFAULT `'kg'`, CHECK accepts `kg` and `meter` but rejects `cm`
- Column `supplier_code` exists, type `varchar(64)`, NULL allowed

### `rolls`
- Column `lot_id BIGINT NULL` exists, FK → `lots.id`
- Column `length_m NUMERIC(10,3) NULL` exists
- Column `reference_price_per_unit NUMERIC(12,2) NULL` exists
- Column `purchase_price_egp` does **NOT** exist anymore
- Existing `warehouse` enum still has `'shop' | 'factory' | 'damaged_shop'`

### `lots`
- Table exists with all columns from §1.3
- `lot_no` is UNIQUE
- Inserting two lots without specifying `lot_no` produces `L-000001` and `L-000002` (or whatever the format implementation chose, but they must be unique, sequential, and prefixed)
- Index on `(fabric_id, color_id)` exists

### `invoices`
- Column `fulfillment_destination` exists, type `varchar(32)`, NOT NULL, DEFAULT `'shop'`, CHECK accepts `shop` and `factory_direct` only
- Status enum/check includes `'deposit_refunded'`

### `payments`
- `method` enum/check includes all four: `cash`, `instapay`, `bank_transfer`, `cheque`
- Column `reference VARCHAR(64) NULL` exists
- `amount_egp` accepts negative values (insert a `-50` row and assert success; clean up after)

### `cheques`
- Table exists with all columns from §3.4
- `status` CHECK accepts `pending`, `cleared`, `bounced`, `cancelled`
- Indexes on `due_date` and `status` exist

### `expenses` (or wherever `CreateExpenseSchema` writes)
- `paid_from` accepts `'instapay'` in addition to `cash` and `bank`

### `hr_employees`, `hr_salary_disbursements`, `hr_salary_adjustments`
- All three tables exist with all columns from §5.4
- `hr_salary_disbursements.paid_via` CHECK accepts `cash`, `instapay`, `bank_transfer`
- UNIQUE constraint on `hr_salary_disbursements(employee_id, month)`
- `hr_salary_adjustments.kind` CHECK accepts `advance`, `deduction`
- Index on `hr_salary_adjustments(employee_id, salary_month)`

### Verify schema items that were explicitly DROPPED
- No `business_day_id` column on any table (grep all migrations + describe each table — fail if found)

---

## 2. Behavioral tests

Create one test file per module under `backend/tests/v2/`. Each test maps to a numbered item in `questions-resolved.md` — annotate every test with a comment `// Q&A #N`.

### `backend/tests/v2/lots.test.ts`

- `Q&A #1` Creating a lot via `POST /api/lots` returns a `lot_no` matching `/^L-\d{6}$/`
- `Q&A #1` Two lots created back-to-back have sequential `lot_no`
- `Q&A #1` Creating a roll with `lot_id` whose `(fabric, color)` doesn't match the lot's → server rejects with HTTP 400 + Arabic error
- `Q&A #6` Within one Add Top batch, same `(fabric, color)` rolls can carry different `lot_id` values (server accepts)

### `backend/tests/v2/fabric.test.ts`

- `Q&A #4` Creating a meter-fabric and a kg-fabric persists `unit` correctly; cannot be set to any other value (CHECK rejects)
- `Q&A #2/#3` Attempting to write `purchase_price_egp` on a roll fails (column doesn't exist)
- A fabric can carry `supplier_code = 'XYZ'`; another fabric can carry the same `supplier_code` (not unique)

### `backend/tests/v2/add-top.test.ts`

- `Q&A #7` Add Top server endpoint accepts a multi-fabric submission (rolls of fabric A + rolls of fabric B in one request)
- `Q&A #9` Every roll created via Add Top has `warehouse = 'factory'` (regardless of any client-side warehouse hint)
- For a meter-fabric submission, `length_m IS NULL` rejected; for kg-fabric, `weight_kg IS NULL` rejected

### `backend/tests/v2/shipment-pricing.test.ts`

- `Q&A #10` After accepting a shipment, every roll has `reference_price_per_unit` populated (not NULL); `selling_price_egp` is still NULL
- `Q&A #12` Per-roll override at shipment receipt is NOT supported (request body shape rejects it)
- A meter-fabric shipment with any roll where `length_m IS NULL` is rejected at acceptance time

### `backend/tests/v2/fulfillment.test.ts`

- `Q&A #15/#16` Creating an invoice with `fulfillment_destination = 'factory_direct'` and a shop-warehouse roll line → server rejects
- `Q&A #15/#16` Creating an invoice with `fulfillment_destination = 'shop'` and a factory-warehouse roll line → server rejects
- `Q&A #17` After invoice payment, the roll's `warehouse` is unchanged; only `status` flips to `'sold'`
- `Q&A #14` Two lines on the same invoice with different warehouses → impossible (per-invoice destination forces homogeneity)

### `backend/tests/v2/pos-pricing-deposit.test.ts`

- `Q&A #21` Completing a sale with a per-kg override of 100 EGP on a 5 kg roll writes `sale_lines.line_total = 500`, `sale_lines.final_price_per_unit = 100`, `roll.selling_price_egp = 500`
- `Q&A #21` Same flow for meter-fabric uses `length_m` correctly
- `Q&A #21` `FabricColorPrice.default_price_per_kg` is unchanged after a POS override (no side effects)
- `Q&A #22` Creating an open invoice with `payment_kind: 'deposit'`, `paid_egp = 500`, empty lines → succeeds; `total_egp = 500`, `balance_egp = 0`
- `Q&A #22` Adding a 300 EGP line to that invoice → `total_egp = 300`, `paid_egp = 500`, `balance_egp = -200`
- `Q&A #23/#24` Calling the deposit-refund endpoint for 200 EGP cash → a `payments` row with `amount_egp = -200, method = 'cash'` is created; `invoices.status = 'deposit_refunded'`; cash drawer outflow recorded
- `Q&A #24` After `deposit_refunded`, attempting to add a new line → rejected

### `backend/tests/v2/return-on-scan.test.ts`

- `Q&A #25/#27` After a sale at override price 100/kg for a 5 kg roll (line total 500), scanning that roll and confirming the return refunds **500** (sticky from `sale_lines.line_total_egp`), not the current `roll.selling_price_egp`
- `Q&A #25` Refund method is selectable; submitting with `method: 'instapay'` debits the chosen bank account, not the cash drawer
- `Q&A #26` Partial return: sell 3 rolls in one invoice, return 1 → the other 2 stay `status: 'sold'`
- Scanning a `damaged_shop` roll → blocked with Arabic error
- Scanning a roll whose status is `'in_stock'` → does NOT open the return panel (handled as normal cart line by the higher-level POS handler)

### `backend/tests/v2/payment-methods.test.ts`

- `Q&A #29` All four methods (`cash`, `instapay`, `bank_transfer`, `cheque`) accepted on `POST /api/payments`
- `Q&A #29` `bank_transfer` without `bank_account_id` → rejected
- `Q&A #29` `cheque` with `due_date < issue_date` → rejected
- `Q&A #30` `cheque` with `due_date` in the past → accepted (it's reference info)
- `Q&A #29` Cheque payment creates one `payments` row + one `cheques` row in the same transaction
- `Q&A #29` A `payments` row with `method = 'cheque'` deleted → cascade deletes the linked `cheques` row (FK ON DELETE CASCADE)
- `Q&A #31` The receipt-printing service (PDF generation) does NOT include cheque-detail fields — assert by inspecting the generated PDF text or the renderer's input shape

### `backend/tests/v2/finance.test.ts`

- `Q&A #33` `POST /api/expenses` with `paid_from: 'instapay'` requires `bank_account_id`; without it, rejected
- `Q&A #33` `POST /api/expenses` with `paid_from: 'instapay'` debits the chosen bank account, not the cash drawer
- `Q&A #34` Stale-invoice job continues to flag invoices older than **7 calendar days** (insert an invoice with `created_at = now() - 8 days` and assert the job picks it up)
- `Q&A #34` Grep migrations: no `business_day_id` column added (fail loudly if found anywhere)

### `backend/tests/v2/hr.test.ts`

- `Q&A #36` Creating an employee with `name_ar = "أحمد"`, `phone = "01012345678"`, `base_salary_egp = 5000` → succeeds
- `Q&A #36` Adding a 200 EGP advance for employee in month 2026-06 → `hr_salary_adjustments` row with `kind = 'advance'`
- `Q&A #37` Disbursement for that employee in 2026-06 with `paid_via = 'cash'` writes `net_egp = 5000 − 200 = 4800`
- `Q&A #38` Second disbursement for the same `(employee, month)` → rejected (UNIQUE)
- `Q&A #29 (Phase 7)` Disbursement with `paid_via = 'bank_transfer'` requires `bank_account_id`; without it, rejected
- `Q&A #39` Employee phone validates against Egyptian format `01[0125]\d{8}` (the existing project-wide phone validator should fire)

---

## 3. Frontend behavioral tests

Add focused component tests under `frontend/tests/v2/`. These can be lighter — focus on the UI guarantees that the requirements made explicit. Use the existing `Login.test.tsx` as a template for setup.

### `frontend/tests/v2/add-top.test.tsx`

- `Q&A #7` Weight cell shows the previous row's value as **placeholder** but the input's actual value is empty (user must type)
- `Q&A #8` Clicking "+ fabric جديد" adds a new sub-group; the existing sub-group's rows are preserved

### `frontend/tests/v2/pos-destination.test.tsx`

- `Q&A #19` When destination is `'shop'`, factory-warehouse rolls render with `disabled` attribute + the «في المصنع» label
- `Q&A #19` When destination is `'factory_direct'`, shop-warehouse rolls are not rendered at all
- Switching destination with rolls in the cart triggers an Arabic confirmation dialog

---

## 4. Regression sweep — v1.1 must not break

Run the existing test suite (`npm test` in both packages). All existing tests must pass. If any v1.1 test fails because v2 changed behavior intentionally, surface the failure with an Arabic-labelled "expected drift" note in the validation report — do NOT silently update the old test. The owner decides whether the drift is acceptable.

---

## 5. Validation report

Create `docs/v2/v2-validation-report.md`. The report has one row per numbered item in `questions-resolved.md`:

```markdown
# v2 Validation Report — generated {{ISO timestamp}}

| Q&A # | Decision | Verified by | Result |
|---|---|---|---|
| 1 | lot_no UNIQUE, auto-generated `L-000001`, read-only | `backend/tests/v2/lots.test.ts` | ✅ |
| 2 | `purchase_price_egp` dropped entirely | `backend/tests/v2/schema.test.ts` + `fabric.test.ts` | ✅ |
| ... | ... | ... | ... |
| 42 | Each phase runs in its own Claude session | Manual | ✅ |
```

- Every item from `questions-resolved.md` (currently 42) appears as a row.
- Items verified by tests: link to the file + test name.
- Items that are organizational (e.g., "phase cadence" #42) are marked "Manual" and assumed pass — flag in the report.
- A summary at the top: `Passed: X / 42` and `Open issues: Y`.

If anything fails, the report's row gets ❌ + a short reason + the test output snippet. **Do not bury failures** — `Open issues` count must be visible at the top.

## Acceptance

- `cd backend && npm test` runs all existing tests + the new v2 tests — every test green
- `cd frontend && npm test` runs all existing tests + the new v2 tests — every test green
- `cd backend && npm run typecheck && npm run lint` clean
- `cd frontend && npm run typecheck && npm run lint` clean
- `npm run build` (root) clean
- `docs/v2/v2-validation-report.md` exists, lists all 42 items, summary shows `Open issues: 0`
- Schema verification confirms every column and constraint from `requirements-v2.md` §Cross-Cutting Schema Impact Summary
- No `business_day_id` column anywhere
- No `purchase_price_egp` column anywhere

## Smoke checklist (manual, post-test)

After all automated tests pass, run these manually to catch UX-level issues tests can miss:

- [ ] Open `/items/add-top`, add a kg-fabric sub-group with 3 rolls and a meter-fabric sub-group with 2 rolls (with `length_m`), submit — all 5 rolls land in `warehouse: 'factory'`, lots auto-assigned
- [ ] Open `/shipments` and receive a shipment with 2 fabrics — enter one reference price per fabric, accept; rolls each carry the correct `reference_price_per_unit`
- [ ] Open POS, toggle destination to factory_direct, scan a factory roll, set per-unit final price, complete sale with cash — invoice persists with the right destination + the roll's reference price is visible in the line history
- [ ] In POS, create a 500 EGP deposit with no rolls, then reopen, add lines totalling 300, refund 200 in cash → invoice status `deposit_refunded`, cash drawer drops 200
- [ ] In POS, scan a sold roll → return drawer opens → confirm refund 500 instapay → bank debited, original invoice not modified, the specific roll back to `in_stock`
- [ ] Pay any sale with cheque — printed receipt shows generic «شيك» but NOT the cheque number / bank / due date
- [ ] Create an InstaPay expense → bank account debited
- [ ] Verify cash drawer header shows «اليوم يبدأ من 10:30 ص — إغلاق يدوي»
- [ ] HR: create employee, add advance + deduction for 2026-06, disburse June salary via bank_transfer → net is correct
- [ ] Stale invoice cron flags an 8-day-old invoice (test in dev with date manipulation if needed)

## Commit

`feat(v2-phase-10): validation suite + v2-validation-report.md (42 Q&A items verified)`

## On failure

If any test fails or any schema check is off, DO NOT mask the failure. Update `docs/v2/v2-validation-report.md` with the ❌ + the test output, and **stop**. Print "Phase 10 found N issues — see docs/v2/v2-validation-report.md" and exit. The owner decides whether to fix in the affected phase or amend this validation.

## On success

Print "Phase 10 passed — v2 ready to tag as v2.0.0" and exit.
