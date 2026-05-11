# Generator Prompt — Phases 3 & 4

> **Use this prompt only after Phase 2 has produced a complete investigation report at `docs/investigations/<date>-open-invoices-instapay.md`.** The generator reads that report and produces two standalone implementation prompts:
> - `docs/v1.1/phase-3-open-invoices.md`
> - `docs/v1.1/phase-4-treasury-instapay.md`
>
> The implementation prompts are then run as their own Claude Code sessions, in order.

---

## How to invoke

Open a fresh Claude Code session and paste this prompt verbatim. Claude Code will:
1. Read `docs/v1.1/CHANGE_PLAN.md` end-to-end.
2. Read `docs/investigations/<latest>.md` (the Phase 2 report).
3. Read `CORE_PLAN.md` and any phase prompts referenced by the report (e.g., the original Phase 5 + Phase 9 + Phase 7 from v1.0.0 if they still exist in the repo).
4. Produce the two implementation prompt files.

---

## The prompt

You are generating two implementation prompts for RMX Store v1.1, phases 3 and 4. Read the following inputs first and **do not start writing prompts until you have read all of them**:

- `docs/v1.1/CHANGE_PLAN.md` — context, sequencing, universal constraints
- `docs/investigations/` — read the most recent Phase 2 report (filename pattern `YYYY-MM-DD-open-invoices-instapay.md`)
- `CORE_PLAN.md` — locked module decisions (sections 6.5 Open Invoices, 6.7 Cash & Bank are the relevant ones)
- The current code under `backend/src/` and `frontend/src/` for Open Invoices and Cash/Bank — verify each defect the report claims, do not trust it blindly

For each phase produce one file under `docs/v1.1/`:

### `docs/v1.1/phase-3-open-invoices.md`

Scope: make the Open Invoices workflow driveable end-to-end through the UI. The Phase 2 report enumerates the missing UI controls and any backend gaps. The prompt must:
- Restate stack invariants from CHANGE_PLAN.md (Knex only, RTL only, Arabic only, `permissionsService.can`, branch isolation, audit on every sensitive write)
- List each defect from the report with: file path, current behavior, expected behavior, fix
- Specify the deposit→balance→pickup state machine and which UI affordance drives each transition
- Re-confirm the 7-day stale → Owner notification path is wired (Phase 9 of v1.0.0 implemented the backend; verify the cron and the `notifications` row land)
- Require the `frontend-design` skill for any UI changes (see CHANGE_PLAN.md)
- Define acceptance: Owner can open an invoice with deposit, see it in the open list, take final payment, mark delivered, all from the UI; stale invoice produces a notification within the configured window
- End with build/typecheck/lint gate + smoke checklist

### `docs/v1.1/phase-4-treasury-instapay.md`

Scope: make the cash-vs-bank split visible and verify InstaPay routing lands in bank, not cash. The Phase 2 report enumerates current vs expected. The prompt must:
- Restate stack invariants
- Confirm current schema separates cash drawer from bank vault (it should — see CORE_PLAN.md §6.7); if the report shows commingling, define the migration to separate them (with `up`/`down`)
- Define the InstaPay routing rule: any payment with method `instapay` posts to the active bank account, never the cash drawer. Add a backend guard + an audit row tagged `instapay_routing`
- UI: cash drawer screen and bank vault screen must each show their own balance, recent movements, and the running daily reconciliation; do not merge them
- Require the `frontend-design` skill
- Define acceptance: Owner can see today's cash balance and today's bank balance independently; a sale with split payment (cash + InstaPay) creates one cash drawer movement and one bank movement; reports reflect the split correctly
- End with build/typecheck/lint gate + smoke checklist

### Output expectations

- Each generated prompt is **standalone** — a new Claude Code session can run it without reading any other file beyond what the prompt itself instructs it to read
- Each generated prompt commits with `feat(v1.1-phase-3): ...` / `feat(v1.1-phase-4): ...`
- After producing both files, print a one-line summary of what each phase will change and stop. Do not start implementing.
