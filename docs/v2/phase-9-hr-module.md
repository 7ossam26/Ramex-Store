# v2 · Phase 9 — HR Module: Employees, Monthly Disbursement, Advances + Deductions

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (domain layout, permissions, audit conventions)
2. `docs/requirements-v2.md` — **§5.1–5.5** (resolved — single `hr_salary_adjustments` table for advances + deductions, minimal employee fields)
3. `docs/v2/PLAN.md` and `docs/v2/questions-resolved.md`
4. The current code:
   - `backend/src/domain/` — domain folder layout convention (see `items`, `sales`, `finance` for shape)
   - `backend/src/domain/finance/expensesService.ts` — useful template for payment-method handling
   - `frontend/src/pages/` — page folder convention
   - The permissions matrix in `Settings`

If Phase 7 hasn't landed (no `bank_transfer` payment method), **stop and surface that** — salary disbursement uses `bank_transfer`.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16, snake_case, Cairo TZ
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: `permissionsService.can()` — define new permission keys (`hr.view`, `hr.manage`, `hr.salary.disburse`, `hr.advance.create`, `hr.deduction.create`)
- Audit log row on every sensitive write
- UI work MUST invoke the `ui-ux-pro-max` skill at the start and per major section
- No new npm dependencies without justification in the commit body

## Scope

A **new module** (no existing code). Three new DB tables, full backend domain, full frontend pages.

### Migration — 3 new tables

```sql
CREATE TABLE hr_employees (
  id              BIGSERIAL PRIMARY KEY,
  name_ar         VARCHAR(128) NOT NULL,
  phone           VARCHAR(16) NULL,         -- Egyptian format 01[0125]XXXXXXXX, validated app-side
  role_ar         VARCHAR(64) NULL,
  base_salary_egp NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hr_salary_disbursements (
  id              BIGSERIAL PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES hr_employees(id),
  month           DATE NOT NULL,                  -- first day of the salary month
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

CREATE TABLE hr_salary_adjustments (
  id             BIGSERIAL PRIMARY KEY,
  employee_id    BIGINT NOT NULL REFERENCES hr_employees(id),
  kind           VARCHAR(16) NOT NULL CHECK (kind IN ('advance','deduction')),
  amount_egp     NUMERIC(12,2) NOT NULL CHECK (amount_egp > 0),
  salary_month   DATE NOT NULL,                   -- which salary month this adjustment applies to
  reason_ar      TEXT NULL,
  actor_user_id  BIGINT NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hr_salary_adjustments_employee_month_idx ON hr_salary_adjustments(employee_id, salary_month);
```

Migration `up` + `down` round-trip clean.

### Backend — `backend/src/domain/hr/`

```
backend/src/domain/hr/
  hr.types.ts
  hr.schemas.ts
  employees.repository.ts
  employees.service.ts
  salaries.repository.ts
  salaries.service.ts
  adjustments.repository.ts
  adjustments.service.ts
  hr.routes.ts
```

#### Endpoints

- `GET    /api/hr/employees`              — list (filter by `is_active`, search by name/phone)
- `POST   /api/hr/employees`              — create
- `PATCH  /api/hr/employees/:id`          — update (name, phone, role, base_salary, is_active toggle)
- `GET    /api/hr/employees/:id`          — detail + summary (last 12 salary rows, open adjustments for current/next month)

- `GET    /api/hr/salaries`               — list (filter by employee + month range)
- `POST   /api/hr/salaries`               — disburse: server computes `gross = base_salary`, `adjustments_egp = sum(adjustments for employee + month)`, `net = gross − adjustments_egp`; if `paid_via != 'cash'`, `bank_account_id` is required; writes the ledger movement; audits
- `GET    /api/hr/salaries/:id`           — detail

- `GET    /api/hr/adjustments`            — list (filter by employee, kind, salary_month)
- `POST   /api/hr/adjustments`            — create (advance or deduction); audits

All write endpoints require the appropriate `hr.*` permission.

#### Money movement

- Salary `cash` disbursement: cash drawer outflow.
- Salary `instapay` or `bank_transfer`: bank account debit (uses the routing guard from Phase 7).
- Adjustments do NOT trigger immediate money movement — they just reduce the next disbursement's net. (Advances are tracked separately from any cash physically given today; if the owner wants cash-out-on-advance tracked, it goes through `expensesService.ts` separately. v2 keeps HR purely accounting.)

### Frontend — `frontend/src/pages/hr/`

Pages:
- `Employees.tsx` — list + create + edit; row click → detail drawer with summary
- `Salaries.tsx` — month picker → grid of employees showing computed salary preview (base − sum(adjustments for this month)); per-row «صرف الراتب» button opens a payment dialog (cash | instapay | bank_transfer)
- `Adjustments.tsx` — list of all adjustments with filter chips (all | advances | deductions | by employee | by month); create dialog (employee, kind, amount, reason, salary_month)

Side nav: HR section gated on `hr.view`:
- «الموظفون» / «الرواتب» / «التسويات» (advances + deductions combined under one label)

Reuse existing form/table/drawer components. Run `ui-ux-pro-max` for each page.

### Permissions

Add to permissions matrix in Settings:
- `hr.view` — see HR pages
- `hr.manage` — edit employees
- `hr.salary.disburse` — create salary disbursements
- `hr.advance.create` — create advance adjustments
- `hr.deduction.create` — create deduction adjustments

Default role assignments:
- Owner: all
- Manager: all five
- Cashier: none

## Acceptance

- Owner can create an employee with name + phone + role + base salary
- Owner can record an advance of 200 EGP for employee A for month 2026-06; the salary preview for 2026-06 shows base − 200
- Owner can record a deduction of 100 EGP for the same employee/month; preview now shows base − 300
- Owner disburses June salary for employee A via `bank_transfer` → `net_egp = base − 300`; bank account debited
- A second June disbursement for employee A is rejected (UNIQUE constraint)
- HR pages are hidden for users without `hr.view`
- `npm run typecheck && npm run build && npm run lint` is clean
- Migration rollback round-trip is clean

## Smoke checklist

- [ ] Create 2 employees with different base salaries
- [ ] Add a 200 EGP advance for employee A for month 2026-06
- [ ] Add a 100 EGP deduction for employee A for month 2026-06
- [ ] Salary preview for June shows `net = base − 300` for employee A
- [ ] Disburse June salary for employee A via `bank_transfer` → success; bank account debited by `net_egp`
- [ ] Try to disburse June again for employee A → rejected
- [ ] Disburse June salary for employee B via cash → cash drawer drops by `net_egp`
- [ ] User without `hr.view` → HR nav item absent
- [ ] Rollback the migration → tables drop cleanly; re-apply restores them

## Commit

`feat(v2-phase-9): hr module — employees, monthly disbursement, advances+deductions in one adjustments table`

## Stop here

Print "Phase 9 done — v2 complete. Tag v2.0.0 next." and exit.
