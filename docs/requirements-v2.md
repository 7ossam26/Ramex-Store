# Client Requirements — v2 (Resolved)

> [!NOTE]
> This is the **resolved** version of the v2 requirements after two rounds of clarification with the owner. Every ambiguity in the original draft has been pinned down here. The companion record of every Q&A pair lives in [docs/v2/questions-resolved.md](v2/questions-resolved.md). All terminology matches the Ramex-Store codebase exactly.

> [!IMPORTANT]
> System is **pre-production** (still in testing). Migrations may be destructive — old data can be wiped to land the new architecture cleanly. No backwards-compatibility shims required.

---

## Module 1 — Add Top Page & Fabric/Inventory Data Model

### 1.1 · Fabric unit of measure: `kg` or `meter`

Add a `unit` field (`'kg' | 'meter'`) to the **`fabrics`** table and the `Fabric` type ([items.types.ts](../backend/src/domain/items/items.types.ts)). Each fabric is exclusively kg OR meter — never both.

- Required selector in the fabric-create dialog and fabric update form (Arabic: «كيلو» / «متر»).
- **Impact on rolls:** when `unit = 'meter'`, the roll stores `length_m` (a new column on `rolls`). `weight_kg` may also exist on a meter-fabric roll, but **`length_m` is the primary quantity** for pricing and POS display. For `unit = 'kg'`, `weight_kg` is the primary quantity and `length_m` is irrelevant.
- **No GSM-derived length.** `length_m` is entered manually by Ahmed per roll.
- **Impact on pricing columns:** keep the existing column names — `default_price_per_kg` on `FabricColorPrice`, `selling_price_egp` on `rolls`. Treat them as **price per unit** and use a UI helper `priceUnitLabel(fabric)` returning `'كجم'` or `'م'` to suffix the value correctly.

### 1.2 · Optional supplier import code on fabric

Add `supplier_code varchar(64) NULL` to **`fabrics`** and to `CreateFabricInput` / `UpdateFabricInput`.

- Optional text field in the fabric-create / update form.
- Manufacturer/importer's own reference; **not** unique-constrained (different suppliers may reuse the same value).
- Separate from the system's auto-generated `code` (`M-000001`).

### 1.3 · Lots (`lots` table)

A **lot** is a production batch of fabric rolls sharing the same **fabric type + color**. One lot = one `(fabric_id, color_id)` pair.

**`lots` table:**
```sql
CREATE TABLE lots (
  id          BIGSERIAL PRIMARY KEY,
  lot_no      VARCHAR(64) NOT NULL UNIQUE,   -- AUTO-GENERATED, read-only, format L-000001
  fabric_id   BIGINT NOT NULL REFERENCES fabrics(id),
  color_id    BIGINT NOT NULL REFERENCES colors(id),
  notes_ar    TEXT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lots_fabric_color_idx ON lots(fabric_id, color_id);
```

- `lot_no` is **auto-generated** using a sequence + prefix (`L-000001`). Read-only in the UI. Same numbering scheme as fabric `M-000001`.
- Server-side validation: a roll's `(fabric_id, color_id)` must match its linked lot's `(fabric_id, color_id)`.

**On the `rolls` table:** add `lot_id BIGINT NULL REFERENCES lots(id)`.

**Workflow:**
- In the Add Top page, Ahmed picks a lot **per row** (not per session). The same `(fabric, color)` within one session can be split across multiple lots if Ahmed chooses.
- He can pick an existing lot for that `(fabric, color)` or create a new one inline.
- **No standalone Lots admin page.**
- **No factory picklist screen.** Lot is metadata captured on Add Top and surfaced in the inventory grid (lot column + filter).

### 1.4 · Per-roll width and weight — UX redesign of Add Top

- `width_cm` (per roll) and `weight_kg` are **first-class, required, visible cells** in each row of the Add Top form. Not in any optional accordion.
- Redesign the form as a **compact table** (sub-grouped by fabric, see 1.6) — not card-per-roll.
- `width_cm` defaults to the fabric's `width_cm` but is editable per row.
- `weight_kg` shows the previous row's value only as a **placeholder** — never auto-fills. Ahmed confirms each roll's weight by typing it.
- For `unit = 'meter'` fabrics, an additional required cell `length_m` appears in the row.

### 1.5 · Remove `purchase_price_egp` from Add Top

- Drop the input from [AddTop.tsx](../frontend/src/pages/items/AddTop.tsx).
- Drop the field from `TopRollEntrySchema` in [tops.schemas.ts](../backend/src/domain/items/tops.schemas.ts).
- **Drop the column** `rolls.purchase_price_egp` entirely (destructive migration is fine — system is pre-production).
- Pricing is captured in two new places: **reference price at shipment receipt** (Module 2) and **final sale price at POS** (Module 3).

### 1.6 · Multi-fabric Add Top batches (NEW)

A single Add Top session can mix rolls of **different fabrics**.

- UX: sub-grouped by fabric. Pick fabric → add rows of that fabric → click «+ fabric جديد» to start another sub-group → add rows of the next fabric.
- All rows within one sub-group share the picked fabric (and follow its kg/meter unit). Color, lot, width, weight (and length where applicable) are picked per row.

### 1.7 · Add Top is factory-warehouse only (NEW)

- Ahmed is the only user of the Add Top page.
- Add Top writes all rolls with `warehouse: 'factory'`. **No warehouse picker** in the form.
- Shop-warehouse rolls only appear via stock transfers (existing v1.1 mechanism, unchanged).

---

## Module 2 — Shipments: Receiving & Reference Pricing

### 2.1 · Reference price per kg/meter set at shipment receipt

The price entered at shipment receipt is a **reference price**, not the sale price. The cashier always enters the actual final sale price at POS time.

**Schema change — `rolls`:**
- Add `reference_price_per_unit numeric(12,2) NULL`.

**UX change — [ReviewShipment.tsx](../frontend/src/pages/shipments/ReviewShipment.tsx):**
- Group the shipment's rolls by `fabric_id`.
- One price input per fabric group, labelled «سعر الكيلو المرجعي» when `fabric.unit = 'kg'`, «سعر المتر المرجعي» when `fabric.unit = 'meter'`.
- The server fans this out to every roll in the group:
  ```
  reference_price_per_unit = price_per_unit                  (one value, stored as-is per roll)
  ```
  The column stores the **per-unit** price directly. Total reference cost per roll can be derived as `reference_price_per_unit × roll.weight_kg` (kg) or `× roll.length_m` (meter).
- **No per-roll override** at shipment receipt — strict one-price-per-fabric.
- `selling_price_egp` is **not written** at shipment receipt. It stays NULL on a roll until POS sells it.

**Reports must clearly differentiate** `reference_price_per_unit` (Ziad's preliminary) from `selling_price_egp` (the cashier's actual final price).

### 2.2 · Fulfillment destination — shop vs factory direct pickup (RESOLVED)

**Business flow:**
1. Customer comes to the shop → creates an invoice at POS → pays.
2. The invoice carries a `fulfillment_destination` chosen at invoice-creation time.
3. Customer either picks up the rolls at the shop, or walks to the factory with the invoice paper.
4. No further handover tracking on our side.

**Schema change — `invoices`:**
- Add `fulfillment_destination varchar(32) NOT NULL DEFAULT 'shop'` with CHECK `IN ('shop', 'factory_direct')`.

**Rules:**
- Set at **invoice creation in POS**, not at shipment receipt.
- **Per invoice**, not per line. Mixed destinations on one invoice are impossible.
- **No transit state** for rolls. Upon invoice payment, every roll on the invoice flips `status: in_stock` → `'sold'` immediately.
- The `warehouse` field on each roll **stays as it was** after sale (so reports can split "sold from factory" vs "sold from shop").
- Stock deduction follows the roll's `warehouse`: factory rolls decrement factory inventory, shop rolls decrement shop inventory.

**POS visibility:**
- `fulfillment_destination = 'factory_direct'` → POS shows **factory-warehouse rolls only** (shop rolls hidden).
- `fulfillment_destination = 'shop'` → POS shows **all rolls**, but factory rolls are visible-and-disabled with the Arabic label «في المصنع»; they cannot be added to a shop-destination cart.

---

## Module 3 — POS

### 3.1 · Final sale price per unit, entered at POS

Existing `sellingPriceOverride` in `SaleLineSchema` is the per-roll absolute price after applying any override. Keep the field; reshape the UX:

- For `kg` fabrics: input «سعر الكيلو النهائي». Line total = `final_price_per_kg × roll.weight_kg`.
- For `meter` fabrics: input «سعر المتر النهائي». Line total = `final_price_per_meter × roll.length_m`.
- Cart row shows the read-only **reference price** (Ziad's preliminary value from §2.1) alongside the cashier's input box. Cashier sees both.
- The override is **per-sale only** — it never updates `FabricColorPrice.default_price_per_kg`.
- On sale completion, `roll.selling_price_egp` is written with the resolved per-roll total.

### 3.2 · Open invoice with deposit, no rolls yet — REFUNDABLE

Allow creating an open invoice (`status: 'open'`) with `payment_kind: 'deposit'` and zero lines.

**Math:**
- Initial: `total_egp = deposit`, `paid_egp = deposit`, `balance_egp = 0`, `lines = []`.
- As lines are added, `total_egp` **updates to `sum(line_totals)`**. The deposit stays as the paid amount; `balance_egp = total_egp − paid_egp`.

**Refund mechanics:**
- The deposit is **refundable**.
- When `total_egp < paid_egp` (items came out lower than the deposit), the cashier can refund the difference.
- Recorded as a **negative-payment row** (`payments.amount_egp < 0`) on the invoice. Partial refunds supported by construction.
- The invoice status flips to `'deposit_refunded'` (new enum value) once a refund row exists.
- Cash drawer outflow for the refund amount, audited.
- Cashier triggers the refund directly — no Owner approval threshold.

**List view:**
- POS open-invoice list flags no-line deposits as «دفعة مقدمة - بدون رولات».

### 3.3 · Scanning a sold roll triggers an automatic return invoice

When a roll with `status: 'sold'` is scanned in POS:

1. The POS recognises it as a return, not a sale. The scanner input does NOT add a normal cart line.
2. A return panel opens (side drawer) with the original sale's metadata: original invoice #, customer, sale date, the roll's original `sale_lines.line_total_egp`.
3. Confirming the return:
   - Creates a return invoice via [returnsService.ts](../backend/src/domain/sales/returnsService.ts).
   - Flips `rolls.status` back to `'in_stock'`. The roll's `warehouse` stays whatever it was at sale time.
   - Audits the action: `{ originalInvoiceId, returnInvoiceId, rollId, refundEgp }`.
4. **Refund amount = original sold price** from `sale_lines` (sticky), not the current `selling_price_egp` on the roll.
5. **Refund payment method** is picked by the cashier at refund time (cash, instapay, bank_transfer, or cheque) — depends on availability.
6. **Partial returns supported**: returning 1 roll from a 3-roll invoice leaves the other 2 sold.
7. **One branch only** — drop all cross-branch return concerns.
8. **No Owner-approval threshold.** Cashier triggers freely; audit row is the safety net.

### 3.4 · New payment methods: bank transfer + cheque

Extend `PaymentMethod` from `'cash' | 'instapay'` to `'cash' | 'instapay' | 'bank_transfer' | 'cheque'`.

**`bank_transfer`:**
- Requires `bank_account_id` (FK → `bank_accounts.id`). Reuses the same routing as InstaPay (funds go to the chosen bank account, never the cash drawer).
- Optional `payments.reference` column for an external reference (add the column if not present).

**`cheque`:**
- New table:
```sql
CREATE TABLE cheques (
  id              BIGSERIAL PRIMARY KEY,
  payment_id      BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  cheque_number   VARCHAR(64) NOT NULL,
  bank_name_ar    VARCHAR(128) NOT NULL,
  branch_ar       VARCHAR(128) NULL,
  issuer_name_ar  VARCHAR(128) NULL,
  amount_egp      NUMERIC(12,2) NOT NULL,
  issue_date      DATE NOT NULL,
  due_date        DATE NOT NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','cleared','bounced','cancelled')),
  notes_ar        TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cheques_due_date_idx ON cheques(due_date);
CREATE INDEX cheques_status_idx ON cheques(status);
```
- Validation: `due_date >= issue_date`. A past `due_date` is **acceptable** input (it's reference info, not a state machine).
- A cheque payment writes one `payments` row + one `cheques` row.
- Cheque details appear **only in the admin panel**, never on the printed customer receipt.
- **Bounced-cheque / cleared status management is OUT OF SCOPE** for v2. The `status` column is captured for future use; nothing in v2 mutates it.

---

## Module 4 — Finance (simplified)

### 4.1 · Expenses: add InstaPay as a payment source

- `CreateExpenseSchema.paid_from` extends from `z.enum(['cash', 'bank'])` to `z.enum(['cash', 'bank', 'instapay'])`.
- When `'instapay'`, `bank_account_id` is **required** (same pattern as existing `'bank'`).
- The expense debits the bank account, not the cash drawer.

### 4.2 · Cash drawer window — UI label only

The "business day" concept from the original v2 draft is **dropped**.

- No `business_day_id` column anywhere.
- Stale invoice detection: plain **7 calendar days**.
- Reports: plain calendar days.
- Cash drawer UI label: «اليوم يبدأ من 10:30 ص — إغلاق يدوي». The cashier closes the drawer manually whenever; no automatic midnight boundary.

---

## Module 5 — HR (Payroll & Adjustments)

> [!IMPORTANT]
> New module. New backend domain at `backend/src/domain/hr/` and new frontend pages under `frontend/src/pages/hr/`.

### 5.1 · Employees

- Minimal fields: `name_ar`, `phone`, `role_ar`, `base_salary_egp`, `is_active`.
- No national ID, hire date, termination date, or branch_id.

### 5.2 · Monthly salary disbursement

- Record one row **per `(employee, month)`** — UNIQUE constraint.
- Fields: gross (= `base_salary`), sum of adjustments, net, payment method (cash / instapay / bank_transfer), `bank_account_id` (required when not cash), notes, actor.
- No bonuses, no 13th salary, no mid-month adjustments. (Future work.)

### 5.3 · Adjustments (advances + deductions in one table)

A single table covers both. The system just records each adjustment with its `kind`; net salary is `base − sum(adjustments_for_month)`.

```sql
CREATE TABLE hr_salary_adjustments (
  id             BIGSERIAL PRIMARY KEY,
  employee_id    BIGINT NOT NULL REFERENCES hr_employees(id),
  kind           VARCHAR(16) NOT NULL CHECK (kind IN ('advance','deduction')),
  amount_egp     NUMERIC(12,2) NOT NULL,
  salary_month   DATE NOT NULL,            -- which salary month this adjustment applies to
  reason_ar      TEXT NULL,
  actor_user_id  BIGINT NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hr_salary_adjustments_employee_month_idx ON hr_salary_adjustments(employee_id, salary_month);
```

- **No repay-an-advance mechanic.** An advance is just an amount that reduces a specific month's salary, same as a deduction.
- UI may render advances and deductions as separate filter chips/pages but they share the table.

### 5.4 · Tables (full set)

```sql
CREATE TABLE hr_employees (
  id              BIGSERIAL PRIMARY KEY,
  name_ar         VARCHAR(128) NOT NULL,
  phone           VARCHAR(16) NULL,        -- Egyptian format 01[0125]XXXXXXXX
  role_ar         VARCHAR(64) NULL,
  base_salary_egp NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hr_salary_disbursements (
  id              BIGSERIAL PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES hr_employees(id),
  month           DATE NOT NULL,                 -- first day of the salary month
  gross_egp       NUMERIC(12,2) NOT NULL,
  adjustments_egp NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_egp         NUMERIC(12,2) NOT NULL,
  paid_via        VARCHAR(32) NOT NULL CHECK (paid_via IN ('cash','instapay','bank_transfer')),
  bank_account_id BIGINT NULL REFERENCES bank_accounts(id),
  notes_ar        TEXT NULL,
  actor_user_id   BIGINT NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month)
);

-- hr_salary_adjustments defined above (5.3)
```

### 5.5 · Permissions

- `hr.view`, `hr.manage`, `hr.salary.disburse`, `hr.advance.create`, `hr.deduction.create`.
- Default roles: Owner = all; Manager = all; Cashier = none.

---

## Cross-Cutting Schema Impact Summary

| Table | Change | Req |
|---|---|---|
| `fabrics` | Add `unit varchar(8) NOT NULL DEFAULT 'kg'` (CHECK kg/meter), `supplier_code varchar(64) NULL` | 1.1, 1.2 |
| `rolls` | Add `lot_id BIGINT NULL FK → lots`, `length_m NUMERIC(10,3) NULL`, `reference_price_per_unit NUMERIC(12,2) NULL`; **drop** `purchase_price_egp` | 1.1, 1.3, 1.5, 2.1 |
| `lots` | **New table** with auto-generated `lot_no` (format `L-000001`) | 1.3 |
| `invoices` | Add `fulfillment_destination varchar(32) NOT NULL DEFAULT 'shop'` (CHECK shop/factory_direct); extend status enum with `'deposit_refunded'` | 2.2, 3.2 |
| `payments` | Extend `method` to include `'bank_transfer'`, `'cheque'`; add `reference varchar(64) NULL`; **allow negative `amount_egp`** for refunds | 3.2, 3.4 |
| `cheques` | **New table** | 3.4 |
| `expenses` (`CreateExpenseSchema`) | Extend `paid_from` to include `'instapay'` | 4.1 |
| `hr_employees`, `hr_salary_disbursements`, `hr_salary_adjustments` | **New tables** | 5.x |
| `PaymentMethod` (types) | `'cash' \| 'instapay' \| 'bank_transfer' \| 'cheque'` | 3.4 |

---

## Full Requirements Summary Table

| # | Requirement | Module / File | Type |
|---|---|---|---|
| 1.1 | Fabric unit: kg or meter (exclusive) | `fabrics`, `rolls`, `AddTop`, POS | Schema + logic |
| 1.2 | Optional supplier code on fabric | `fabrics`, fabric-create dialog | New field |
| 1.3 | Lot concept — auto-generated, picked per row | `lots`, `rolls`, `AddTop` | New feature |
| 1.4 | Per-roll width & weight first-class — UX redesign | `AddTop` | UX |
| 1.5 | Drop `purchase_price_egp` | `AddTop`, `tops.schemas.ts`, `rolls` | Removal |
| 1.6 | Multi-fabric Add Top batches | `AddTop` | UX + logic |
| 1.7 | Add Top locked to factory warehouse | `AddTop` | Confirmation / guard |
| 2.1 | Reference price per fabric at shipment receipt | `ReviewShipment`, `rolls` | New column + UX |
| 2.2 | Fulfillment destination shop vs factory direct | `invoices`, POS roll picker | New feature |
| 3.1 | Final sale price per unit at POS | POS, `sale_lines` | Enhancement |
| 3.2 | Open invoice deposit without lines — refundable | POS, `openInvoices.service.ts`, `invoices` status | Enhancement |
| 3.3 | Scan sold roll → auto return invoice (partial OK) | POS, `returnsService.ts` | New feature |
| 3.4 | Bank transfer + cheque payment methods | `PaymentMethod`, `payments`, `cheques` | New feature |
| 4.1 | Expenses: InstaPay as source | `CreateExpenseSchema` | Extension |
| 4.2 | Cash drawer 10:30 AM label + manual close (no business-day math) | Cash drawer UI | UI-only change |
| 5.1 | HR: employees (minimal fields) | New `hr` module | New module |
| 5.2 | HR: monthly salary disbursement | New `hr` module | New module |
| 5.3 | HR: advances + deductions in one table | New `hr` module | New module |
