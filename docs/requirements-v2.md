# Client Requirements — Translated & Organized (v2)

> [!NOTE]
> All terminology matches the Ramex-Store codebase exactly. Clarifications from the second round of client answers are **fully incorporated** in this version.
> This document is intended to be pasted directly into a new chat as the implementation brief.

---

## Module 1 — Add Top Page & Fabric/Inventory Data Model

### 1.1 · Fabric unit of measure: `kg` or `meter`

Add a `unit` field (`'kg' | 'meter'`) to the **`fabrics`** table and the `Fabric` type (`items.types.ts`).

- Shown as a required selector in `FabricCreateDialog` and the fabric update form.
- **Impact on rolls:** When a fabric's unit is `'meter'`, the roll stores `length_m` (a new column) instead of being purely weight-based. Both `weight_kg` and `length_m` may coexist on a roll (a meter-fabric roll can still have a weight), but `length_m` becomes the **primary quantity** for pricing and POS display.
- **Impact on pricing:** The price field is already named `default_price_per_kg` in `FabricColorPrice` (and `selling_price_egp` on `rolls`). These become **price per unit** — either per kg or per meter, depending on `fabric.unit`. Rename/alias where needed.
- **Impact on POS:** The POS must display and calculate price using the correct unit for that fabric's rolls.
- **Impact on `TopRollEntrySchema` / `AddTopPage`:** When adding rolls for a meter-fabric, the weight field is replaced by (or supplemented with) a length field.

### 1.2 · Optional supplier import code on fabric

Add an optional `supplier_code` field (max 64 chars) to the **`fabrics`** table and `CreateFabricInput` / `UpdateFabricInput`.

- Shown as an optional field in `FabricCreateDialog`.
- This is the manufacturer/importer's own reference number for the fabric, separate from the system's auto-generated `code` (`M-000001`).

### 1.3 · Introduce Lots (`lots` table)

A **Lot** is a production batch of fabric rolls sharing the same **fabric type + color**. This is the standard industry "lot" concept.

**New `lots` table:**
```
lots
  id              serial PK
  lot_no          varchar(64) NOT NULL UNIQUE   -- supplier's lot number
  fabric_id       int FK → fabrics(id)
  color_id        int FK → colors(id)
  notes_ar        text nullable
  created_at      timestamptz
  updated_at      timestamptz
```

**On the `rolls` table:** Add `lot_id int FK → lots(id) nullable`.

**Workflow integration:**
- On the `AddTopPage`, when adding rolls, Ziad can optionally assign a lot (pick existing or create new).
- A lot is always scoped to one fabric + color combination.
- Multiple Add Top batches can belong to the same lot.
- Inventory and reports should be able to filter/group by lot.

### 1.4 · Per-roll width and weight — UX redesign of Add Top batch form

**Current behavior:** All rolls in a batch share the fabric's `width_cm`; weight is duplicated from the previous row.

**Required change:**
- `width_cm` (per roll) and `weight_kg` must be **first-class, required, visible fields** on each roll row in the Add Top form — not buried in the "optional fields" accordion.
- Redesign the roll input from a card-per-roll layout to a **compact table-style row** (columns: Color, Width cm, Weight kg, optional fields collapsed) to make batch entry of many rolls faster.
- This is a pure UX improvement; the data model already supports it (`width_cm` and `weight_kg` exist on the `rolls` table and in `TopRollEntrySchema`).

### 1.5 · Remove `purchase_price_egp` from the Add Top wizard

Remove the `purchase_price_egp` input from `AddTopPage` and from `TopRollEntrySchema` (make it nullable/ignored on creation). Pricing starts at the **shipment receive step** (see Module 2), not at fabric addition.

---

## Module 2 — Shipments: Receiving & Pricing

### 2.1 · Price per kg/meter set at shipment receipt (fabric-level, not per-roll)

**Current behavior:** `ReviewShipment.tsx` already collects a `selling_price_egp` per line (roll), with a bulk-price field as a shortcut.

**Required change:** The price is set **per fabric** (one price covers all rolls of that fabric in the shipment). Change the `ReviewShipment` UX so that instead of per-roll price inputs, Ziad enters **one price per kg (or per meter)** for each distinct fabric in the shipment. The system then auto-calculates `selling_price_egp` for each roll of that fabric as:

```
selling_price_egp = price_per_unit × roll.weight_kg   (if fabric.unit = 'kg')
selling_price_egp = price_per_unit × roll.length_m    (if fabric.unit = 'meter')
```

This auto-calculated price is stored on each `roll.selling_price_egp` when the line is accepted.

### 2.2 · Order fulfillment destination: store vs. direct factory pickup

**Business flow context:**
1. The customer comes to the shop → creates an invoice → pays.
2. Ahmed (at the factory) prepares the order.
3. The customer can either:
   - **Option A:** Wait for the order to arrive at the shop and pick it up there.
   - **Option B:** Go directly to the factory to pick up their order.

**Required change:** Add a `fulfillment_destination` field to the **invoice** (or a related order entity) at the point when Ziad accepts the shipment in `ReviewShipment`. Values: `'shop' | 'factory_direct'`.

- `'shop'`: The accepted rolls move to `warehouse: 'shop'` after the shipment is finalized.
- `'factory_direct'`: The customer collects from the factory. Rolls do not transit through the shop warehouse. The exact stock movement for this case needs to be decided in the implementation chat.

> [!IMPORTANT]
> The detailed edge cases and exact flow for Req 2.2 are marked for **further discussion in the new implementation chat**. The above is the high-level intent.

---

## Module 3 — POS (`POS.tsx` / `invoices.service.ts` / `openInvoices.service.ts`)

### 3.1 · Final price override at sale time (per kg or per meter)

When completing a sale in the POS, the cashier can set the **final selling price per unit** (per kg or per meter) for that transaction. This maps to the existing `sellingPriceOverride` in `SaleLineSchema`, but the UX should show "price per kg/meter" and auto-calculate the line total from the roll's quantity.

### 3.2 · Open invoice: deposit payment without selecting rolls yet

Allow creating an **open invoice** (`status: 'open'`) with a **deposit payment** but **without any invoice lines** (no rolls selected yet). The invoice should:
- Be visible in the POS invoice list.
- Show the deposit amount as `paid_egp` with `balance_egp` = `total_egp` - `paid_egp`.
- Allow the cashier to later open the same invoice, add rolls, and complete it — with the deposit automatically deducted from the remaining balance.

This extends the existing `payment_kind: 'deposit'` + open invoice flow.

### 3.3 · Scanning a sold roll triggers automatic return invoice

If a roll with `status: 'sold'` is scanned in the POS, the system should:
1. Recognize it as a **return**, not a new sale.
2. Automatically open a return invoice via `returnsService.ts`.
3. Flip the roll back to `status: 'in_stock'` (inventory increases).
4. Support **partial returns**: returning one roll from a multi-roll invoice is valid.

### 3.4 · New payment methods: bank transfer and cheque

Extend `PaymentMethod` from `'cash' | 'instapay'` to also include:
- **`'bank_transfer'`** — requires `bank_account_id` (links to `bank_accounts` table).
- **`'cheque'`** — requires full cheque details (see below).

**New `cheques` table** (for cheque payment tracking):
```
cheques
  id                  serial PK
  payment_id          int FK → payments(id)
  cheque_number       varchar(64) NOT NULL
  bank_name_ar        varchar(128)
  branch_ar           varchar(128) nullable
  issuer_name_ar      varchar(128) nullable    -- name on the cheque
  amount_egp          numeric(12,2) NOT NULL
  issue_date          date NOT NULL
  due_date            date NOT NULL            -- date cheque can be cashed
  status              varchar(32) DEFAULT 'pending'  -- pending | cleared | bounced | cancelled
  notes_ar            text nullable
  created_at          timestamptz
  updated_at          timestamptz
```

A cheque payment in the POS triggers a `payments` row with `method: 'cheque'` + a matching `cheques` row. Cheque status management (cleared/bounced) can be a follow-up feature.

---

## Module 4 — Finance & Cash

### 4.1 · Expenses: add InstaPay as a payment source

**Current behavior:** `CreateExpenseSchema` has `paid_from: z.enum(['cash', 'bank'])`.

**Required change:** Add `'instapay'` as a valid value: `paid_from: z.enum(['cash', 'bank', 'instapay'])`. When `'instapay'` is selected, `bank_account_id` is required (same pattern as existing bank expenses).

### 4.2 · Business day window: 10:30 AM → 12:00 AM (midnight)

The business day starts at **10:30 AM** and ends at **12:00 AM (midnight)** Cairo time.

Update all day-boundary logic to use this window:
- Cash drawer reconciliation (`CashReconcile.tsx` / `cashDrawerService.ts`).
- Stale invoice detection (`staleInvoices.job.ts`).
- Date grouping in reports.
- Any "today's" filter in queries.

---

## Module 5 — New Module: HR (Payroll, Advances & Deductions)

> [!IMPORTANT]
> This is a **new module** with no existing code. Requires new backend domain (`backend/src/domain/hr/`) and new frontend pages (`frontend/src/pages/hr/`).

### Features

**5.1 · Salary disbursement**
- Record monthly salary payments per employee.
- Fields: employee name/id, month, base salary, net paid, payment method (cash/instapay/bank_transfer), notes.

**5.2 · Advances (سلف)**
- Log cash advances given to employees.
- Fields: employee, amount, date, reason, repayment status.

**5.3 · Deductions**
- Record deductions from employee salaries.
- Fields: employee, amount, reason, linked to which salary month.

### Suggested DB tables
```
hr_employees
  id, name_ar, role_ar, base_salary_egp, is_active, created_at

hr_salary_disbursements
  id, employee_id FK, month (date), gross_egp, deductions_egp, net_egp,
  paid_via (cash|instapay|bank_transfer), bank_account_id nullable,
  notes_ar, created_at, actor_user_id

hr_advances
  id, employee_id FK, amount_egp, given_at, reason_ar,
  repaid_egp DEFAULT 0, is_settled bool DEFAULT false,
  created_at, actor_user_id

hr_deductions
  id, employee_id FK, amount_egp, reason_ar, salary_month (date),
  created_at, actor_user_id
```

---

## Cross-Cutting Schema Impact Summary

| Table | Change | Trigger |
|---|---|---|
| `fabrics` | Add `unit varchar(8) DEFAULT 'kg'`, `supplier_code varchar(64) nullable` | Req 1.1, 1.2 |
| `rolls` | Add `lot_id int nullable FK → lots`, `length_m numeric(10,3) nullable` | Req 1.1, 1.3 |
| `lots` | **New table** | Req 1.3 |
| `invoices` | Add `fulfillment_destination varchar(32) nullable` | Req 2.2 |
| `payments` | Extend `method` enum to include `'bank_transfer'`, `'cheque'` | Req 3.4 |
| `cheques` | **New table** | Req 3.4 |
| `finance.schemas.ts` `CreateExpenseSchema` | Extend `paid_from` to include `'instapay'` | Req 4.1 |
| `hr_employees`, `hr_salary_disbursements`, `hr_advances`, `hr_deductions` | **New tables** | Req 5.x |
| `sales.types.ts` `PaymentMethod` | Extend to `'cash' \| 'instapay' \| 'bank_transfer' \| 'cheque'` | Req 3.4 |

---

## Full Requirements Summary Table

| # | Requirement | Module / File | Type |
|---|---|---|---|
| 1.1 | Fabric unit: kg or meter (full system impact) | `fabrics`, `rolls`, `AddTopPage`, POS | Schema + logic |
| 1.2 | Optional supplier code on fabric | `fabrics`, `FabricCreateDialog` | New field |
| 1.3 | Lot concept — new `lots` table, `lot_id` on rolls | New table + `AddTopPage` | New feature |
| 1.4 | Per-roll width & weight — UX redesign of batch form | `AddTopPage` | UX improvement |
| 1.5 | Remove purchase price from Add Top wizard | `AddTopPage`, `tops.schemas.ts` | Removal |
| 2.1 | Price per kg/meter set per fabric at shipment receipt | `ReviewShipment.tsx`, shipments domain | UX + logic change |
| 2.2 | Fulfillment destination: shop vs. factory direct pickup | `invoices`, `ReviewShipment` | New feature (TBD details) |
| 3.1 | Final price per unit override at POS sale time | `POS.tsx`, `SaleLineSchema` | Enhancement |
| 3.2 | Open invoice: deposit without selecting rolls | `POS.tsx`, `openInvoices.service.ts` | Enhancement |
| 3.3 | Scan sold roll → automatic return invoice | `POS.tsx`, `returnsService.ts` | New feature |
| 3.4 | Payment methods: bank transfer + cheque (with details) | `PaymentMethod`, `payments`, new `cheques` table | New feature |
| 4.1 | Expenses: add InstaPay as a payment source | `CreateExpenseSchema`, `expensesService.ts` | Extension |
| 4.2 | Business day: 10:30 AM – 12:00 AM Cairo time | `cashDrawerService`, `staleInvoices.job`, reports | Config/logic fix |
| 5.1 | HR: salary disbursement | New `hr` module | New module |
| 5.2 | HR: employee advances (سلف) | New `hr` module | New module |
| 5.3 | HR: deductions | New `hr` module | New module |

---

> [!WARNING]
> **Remaining open question (to resolve in implementation chat):**
> - **Req 2.2 (fulfillment destination):** When a customer goes to the factory directly, what is the exact stock movement? Do rolls skip `warehouse: 'shop'` entirely and go straight to `status: 'sold'`? Or do they get a temporary `warehouse: 'factory_direct'` state? Does this require the invoice to be in a special status while the customer is in transit?
