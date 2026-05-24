# v2 · Phase 7 — Payment Methods: Bank Transfer + Cheque

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (§6.5 POS, §6.7 Cash & Bank)
2. `docs/requirements-v2.md` — **§3.4**
3. `docs/v2/PLAN.md` and `docs/v2/questions-resolved.md`
4. The current code:
   - `backend/src/domain/sales/sales.types.ts` — current `PaymentMethod` type
   - `backend/src/domain/sales/` — payments schemas, payment creation
   - `backend/src/domain/finance/` — bank-accounts service, cash drawer
   - `frontend/src/pages/pos/POS.tsx` — payment method picker (also used by Phase 5's deposit-refund dialog and Phase 6's return drawer)
   - The `payments` table — current `method` enum, FK to `bank_accounts`, and whether `amount_egp` allows negatives (Phase 5 needed this)
   - The `bank_accounts` table

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: `permissionsService.can()` — never inline role checks
- Audit log on every payment row
- UI work MUST invoke the `ui-ux-pro-max` skill
- No new npm dependencies without justification in the commit body

## Scope

Extend `PaymentMethod` from `'cash' | 'instapay'` to `'cash' | 'instapay' | 'bank_transfer' | 'cheque'`. Both new methods are **payment-info only** — they don't trigger any clearing/reconciliation/bouncing workflow (out of scope for v2).

### 3.4a · `bank_transfer`

- Requires `bank_account_id` (FK → `bank_accounts.id`).
- Reuses the InstaPay routing rule: funds route to the chosen bank account, never the cash drawer.
- POS payment surface gets a bank-transfer tile that opens a small dialog: bank account picker + amount + optional reference number (free text, max 64 chars, persisted to `payments.reference` — add column if missing).
- The InstaPay routing guard generalises: any method that targets a bank account routes there, not cash.

### 3.4b · `cheque`

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

- A cheque payment writes one `payments` row (`method = 'cheque'`) + one `cheques` row.
- Validation: `due_date >= issue_date`. Past `due_date` is acceptable input (it's reference info, not a state machine).
- **Status management is OUT OF SCOPE** — the `status` column is captured (defaults to `'pending'`) but nothing in v2 mutates it.
- Cheque details appear **only in the admin panel** — never on the printed customer receipt.

### Migration

One numbered migration:
- `up`:
  - Extend `payments.method` CHECK/enum to include `'bank_transfer'` and `'cheque'`
  - Add `payments.reference VARCHAR(64) NULL` if missing
  - Create `cheques` table
- `down`: drop `cheques`, remove the two values, drop `reference` if it didn't exist before.
- Round-trip clean.

### Frontend

- Payment surface tiles, order: cash, instapay, bank_transfer, cheque. Arabic labels: «نقدي», «انستاباي», «تحويل بنكي», «شيك».
- Each tile opens its own input dialog with method-specific fields and zod validation.
- Split payment continues to work — any combination of the four methods is valid.
- The new tiles also appear in:
  - Phase 5's «استرجاع الدفعة» dialog (deposit refund method picker)
  - Phase 6's return drawer (return refund method picker)

### Backend validation per method

- `cash` — amount only
- `instapay` — amount + `bank_account_id` required
- `bank_transfer` — amount + `bank_account_id` required + reference optional
- `cheque` — amount + all cheque fields required; `due_date >= issue_date`

### Admin panel — cheques list

Small new page at `/admin/cheques` (or wherever the existing admin tooling lives):
- List all cheques with filter chips (status, due-date range, bank name)
- Detail drawer shows full cheque info + links to source payment + invoice
- No mutation actions (status stays `pending`)

## Acceptance

- Any sale (or refund) can be paid with cash, instapay, bank_transfer, or cheque
- Bank transfer routes funds to the chosen bank account, never the cash drawer
- Cheque sale produces both `payments` + `cheques` rows
- Printed receipt does NOT show cheque details
- Admin cheques list shows all cheques captured from sales/refunds
- Migration up/down round-trip is clean
- No regression in cash and InstaPay flows
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] Pay with cheque → `payments` + `cheques` rows both exist, `status = 'pending'`
- [ ] Pay with bank_transfer → bank account debited; cash drawer unchanged
- [ ] Split payment cash + cheque → both rows exist, totals match invoice
- [ ] Cheque with `due_date < issue_date` → server rejects with Arabic error
- [ ] Cheque with `due_date` in the past → accepted
- [ ] Bank transfer without bank account → server rejects
- [ ] Bank-account picker only shows active accounts
- [ ] Admin cheques list shows all captured cheques
- [ ] Cash and InstaPay sales still work identically
- [ ] Deposit-refund dialog (from Phase 5) now offers all 4 methods
- [ ] Return drawer (from Phase 6) now offers all 4 methods

## Commit

`feat(v2-phase-7): payments — bank_transfer + cheque methods (cheques captured, no status workflow)`

## Stop here

Print "Phase 7 done — ready for Phase 8" and exit.
