# v2 · Phase 9 — HR Module: Payroll, Advances, Deductions

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (especially the architecture/domain layout, permissions, audit conventions)
2. `docs/requirements-v2.md` — section **5** (Module 5: HR)
3. `docs/v2/PLAN.md` — phase index + universal constraints
4. The current code:
   - `backend/src/domain/` — domain folder layout convention (look at `items`, `sales`, `finance` for the shape new domains should follow)
   - `backend/src/domain/finance/expensesService.ts` — payment-method handling is a useful template
   - `frontend/src/pages/` — page folder convention
   - `frontend/src/components/` — any list/table/form components reused across pages
   - The permissions matrix in `Settings`

If Phase 7 hasn't landed (no `bank_transfer` payment method), **stop and surface that** — salary disbursement uses `bank_transfer` and assumes the routing guard from Phase 7.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16, snake_case, Cairo TZ
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: `permissionsService.can()` — define new permission keys for HR (`hr.view`, `hr.manage`, `hr.salary.disburse`, `hr.advance.create`, `hr.deduction.create`)
- Audit log row on every sensitive write
- UI work MUST invoke the `ui-ux-pro-max` skill at the start and per major section
- No new npm dependencies without justification in the commit body

## Scope

A **new module** (no existing code). All four DB tables, full backend domain, full frontend pages.

### Migration — 4 new tables

Per requirements §5 (Suggested DB tables), with PG-correct types:

```sql
CREATE TABLE hr_employees (
  id              BIGSERIAL PRIMARY KEY,
  name_ar         VARCHAR(128) NOT NULL,
  role_ar         VARCHAR(64) NULL,
  base_salary_egp NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hr_salary_disbursements (
  id               BIGSERIAL PRIMARY KEY,
  employee_id      BIGINT NOT NULL REFERENCES hr_employees(id),
  month            DATE NOT NULL,                       -- first day of the salary month
  gross_egp        NUMERIC(12,2) NOT NULL,
  deductions_egp   NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_egp          NUMERIC(12,2) NOT NULL,
  paid_via         VARCHAR(32) NOT NULL
                   CHECK (paid_via IN ('cash','instapay','bank_transfer')),
  bank_account_id  BIGINT NULL REFERENCES bank_accounts(id),
  notes_ar         TEXT NULL,
  actor_user_id    BIGINT NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month)
);

CREATE TABLE hr_advances (
  id             BIGSERIAL PRIMARY KEY,
  employee_id    BIGINT NOT NULL REFERENCES hr_employees(id),
  amount_egp     NUMERIC(12,2) NOT NULL,
  given_at       DATE NOT NULL,
  reason_ar      TEXT NULL,
  repaid_egp     NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_settled     BOOLEAN NOT NULL DEFAULT FALSE,
  actor_user_id  BIGINT NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hr_deductions (
  id             BIGSERIAL PRIMARY KEY,
  employee_id    BIGINT NOT NULL REFERENCES hr_employees(id),
  amount_egp     NUMERIC(12,2) NOT NULL,
  reason_ar      TEXT NULL,
  salary_month   DATE NOT NULL,                          -- which salary month this deduction applies to
  actor_user_id  BIGINT NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hr_salary_disbursements_month_idx ON hr_salary_disbursements(month);
CREATE INDEX hr_advances_employee_settled_idx ON hr_advances(employee_id, is_settled);
CREATE INDEX hr_deductions_employee_month_idx ON hr_deductions(employee_id, salary_month);
```

Migration `up` + `down` both implemented and round-trip clean.

### Backend — `backend/src/domain/hr/`

Standard domain layout (match existing convention):

```
backend/src/domain/hr/
  hr.types.ts
  hr.schemas.ts          # zod for create/update inputs
  employees.repository.ts
  employees.service.ts
  salaries.repository.ts
  salaries.service.ts
  advances.repository.ts
  advances.service.ts
  deductions.repository.ts
  deductions.service.ts
  hr.routes.ts
```

#### Endpoints

- `GET    /api/hr/employees`             — list (filter by `is_active`, search by name)
- `POST   /api/hr/employees`             — create
- `PATCH  /api/hr/employees/:id`         — update (name, role, base_salary, is_active toggle)
- `GET    /api/hr/employees/:id`         — detail + summary (current open advances, last 12 salary rows)

- `GET    /api/hr/salaries`              — list (filter by employee + month range)
- `POST   /api/hr/salaries`              — disburse: server computes `net_egp = gross_egp - deductions_egp`; if `paid_via != 'cash'`, `bank_account_id` is required; debits cash drawer or bank account accordingly; writes audit row
- `GET    /api/hr/salaries/:id`          — detail

- `GET    /api/hr/advances`              — list (filter by employee + `is_settled`)
- `POST   /api/hr/advances`              — record a new advance; debits cash drawer (or bank if a future req allows); audit row
- `PATCH  /api/hr/advances/:id/repay`    — partial repayment update (`repaid_egp` += amount; flips `is_settled` when `repaid_egp >= amount_egp`)

- `GET    /api/hr/deductions`            — list (filter by employee + salary_month)
- `POST   /api/hr/deductions`            — record a deduction tied to a salary month; audit row

All write endpoints require `hr.manage` permission (or finer-grained as listed above).

#### Money movement

- Salary `cash` disbursement: cash drawer movement (debit).
- Salary `instapay` or `bank_transfer`: bank account movement (debit, mirroring the InstaPay routing guard from Phase 7).
- Advances: same routing rules.
- Each movement carries `business_day_id` (Phase 8) so reports bucket correctly.

### Frontend — `frontend/src/pages/hr/`

Pages:
- `Employees.tsx` — list + create + edit; row click → detail drawer with summary
- `Salaries.tsx` — month picker → grid of employees showing computed salary preview (base − deductions, − open advances if you want to surface them); "Disburse" button per row opens a payment dialog (cash | instapay | bank_transfer)
- `Advances.tsx` — list of advances with filter chips (open / settled / by employee); create dialog; per-row "تسجيل سداد" action
- `Deductions.tsx` — list + create dialog (select employee, amount, reason, salary month)

Add an HR section to the side nav, gated on `hr.view`. Arabic labels only:
- «الموظفون» / «الرواتب» / «السلف» / «الخصومات»

Reuse existing form / table / drawer components (look at `frontend/src/components/`). Run `ui-ux-pro-max` skill for each page.

### Permissions

Add new permission keys to the permissions matrix in Settings:
- `hr.view` — see all HR pages
- `hr.manage` — edit employees
- `hr.salary.disburse` — create salary disbursements
- `hr.advance.create` — record advances
- `hr.deduction.create` — record deductions

Default role assignments:
- Owner: all
- Manager: `hr.view`, `hr.manage`, `hr.salary.disburse`, `hr.advance.create`, `hr.deduction.create`
- Cashier: none

## Acceptance

- Owner can create an employee with base salary
- Owner can disburse a salary for a given month via cash, instapay, or bank_transfer; the money lands in the right ledger
- A second disbursement for the same `(employee, month)` is rejected (UNIQUE constraint)
- Owner can record an advance and later mark it (partially or fully) repaid
- Owner can record a deduction tied to a salary month; the salary preview for that month reflects it
- All HR writes write audit rows
- HR pages are hidden for users without `hr.view`
- `npm run typecheck && npm run build && npm run lint` is clean
- Migration rollback round-trip is clean

## Smoke checklist

- [ ] Create 2 employees with different base salaries
- [ ] Add a 500 EGP deduction for employee A for month 2026-06
- [ ] Disburse June salary for employee A via `bank_transfer` — net = base − 500; bank account debited
- [ ] Try to disburse June again for employee A — rejected
- [ ] Record a 1000 EGP advance for employee B; mark 600 repaid → row shows `repaid_egp = 600`, `is_settled = false`; mark remaining 400 repaid → `is_settled = true`
- [ ] Login as a user without `hr.view` — HR nav item is absent
- [ ] Rollback the migration → tables drop cleanly; re-applying restores them

## Commit

`feat(v2-phase-9): hr module — employees, salaries, advances, deductions`

## Stop here

Print "Phase 9 done — v2 complete. Tag v2.0.0 next." and exit.
