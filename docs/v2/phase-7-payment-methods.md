# v2 · Phase 7 — Payment Methods: Bank Transfer + Cheque

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (§6.5 POS, §6.7 Cash & Bank)
2. `docs/requirements-v2.md` — section **3.4**
3. `docs/v2/PLAN.md` — phase index + universal constraints
4. The current code:
   - `backend/src/domain/sales/sales.types.ts` — current `PaymentMethod` type
   - `backend/src/domain/sales/` — payments schemas, payment creation
   - `backend/src/domain/finance/` — bank-accounts service, cash drawer
   - `frontend/src/pages/pos/POS.tsx` — payment method picker
   - The `payments` table — current `method` enum and FK to `bank_accounts`
   - The `bank_accounts` table

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: `permissionsService.can()` — never inline role checks
- Audit log on every payment row
- UI work MUST invoke the `ui-ux-pro-max` skill
- No new npm dependencies without justification in the commit body

## Scope

Extend `PaymentMethod` from `'cash' | 'instapay'` to `'cash' | 'instapay' | 'bank_transfer' | 'cheque'`. Two new methods, with different complexity:

### 3.4a · `bank_transfer`

- Requires `bank_account_id` (FK → `bank_accounts.id`). Reuses the same FK column already used by InstaPay.
- POS payment surface offers a bank-transfer tile that opens a small dialog: pick bank account (searchable select), enter amount, optional reference number (free text, max 64 chars, persisted into `payments.reference` — add the column if it doesn't exist).
- Funds route to the chosen bank account (mirror InstaPay routing — never the cash drawer). The InstaPay routing guard added historically should generalise: **any payment method that targets a bank account routes there**, not cash.

### 3.4b · `cheque`

- New table `cheques` (per requirements §3.4):
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
- A cheque payment in POS triggers:
  1. A `payments` row with `method: 'cheque'`, amount = cheque amount.
  2. A matching `cheques` row with all fields above.
  3. One audit row tying both together.
- The POS payment dialog for cheque collects all required fields (cheque #, bank name in Arabic, due date, issuer name) with proper zod validation.
- **Status management** (cleared / bounced / cancelled) is **a follow-up feature** per requirements — out of scope for this phase. But model + table + the `status` column are added now so the data is captured from day one.

### Migration

One numbered migration:
- `up`: extends the `payments.method` CHECK or enum to include `'bank_transfer'` and `'cheque'`; adds `payments.reference varchar(64) NULL` if missing; creates `cheques` table.
- `down`: drops `cheques`, removes the two new values from the method constraint, drops `reference` if it didn't exist before.
- Round-trip clean.

### Frontend

- Payment surface gets two new tiles. Order: `cash`, `instapay`, `bank_transfer`, `cheque`. Icons are subtle, Arabic labels only («تحويل بنكي», «شيك»).
- Each tile opens its own input dialog with method-specific fields.
- Split payment continues to work — any combination of the four methods is valid.

### Backend

- Server-side validation per method:
  - `cash` — amount only
  - `instapay` — amount + bank_account_id required
  - `bank_transfer` — amount + bank_account_id required + reference optional
  - `cheque` — amount + all cheque fields required, due_date ≥ issue_date
- Generalise the InstaPay routing guard so it applies to any "non-cash" method.

## Acceptance

- Sale can be paid with any one of the four methods, or any split combination
- Cheque sale produces a `payments` row + a `cheques` row, both visible in admin lookups
- Bank transfer routes funds to the chosen bank account, not the cash drawer
- Migration up/down round-trip is clean
- No regression in cash and InstaPay flows
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] Pay with cheque — `payments` + `cheques` rows both exist, status = `pending`
- [ ] Pay with bank_transfer — funds land in the chosen bank account; cash drawer balance unchanged
- [ ] Split payment: cash + cheque — both rows exist, totals match the invoice
- [ ] Try cheque with `due_date < issue_date` — server rejects with Arabic error
- [ ] Try bank_transfer without a bank account — server rejects
- [ ] Bank-account picker only shows active bank accounts (mirror existing InstaPay constraint)
- [ ] Cash and InstaPay sales still work identically to v1.1

## Commit

`feat(v2-phase-7): payments — bank_transfer + cheque methods (cheques table for tracking)`

## Stop here

Do not start Phase 8. Print "Phase 7 done — ready for Phase 8" and exit.
