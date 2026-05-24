# Ramex Store v2 — Change Plan (Resolved)

## Context

`v1.1` is live. The owner has signed off on a second batch of changes — fully resolved after two rounds of clarification — captured in:

- [docs/requirements-v2.md](../requirements-v2.md) — the resolved requirements doc (source of truth)
- [docs/v2/questions-resolved.md](questions-resolved.md) — frozen record of every Q&A pair that produced the resolution

Five business modules are affected: inventory data model, shipments, POS, finance/cash, and a new HR module.

> [!IMPORTANT]
> System is **pre-production**. Migrations may be destructive — no backwards-compatibility shims required.

This plan splits the work into **9 build phases + 1 validation phase**. Each has a standalone prompt file in this folder (`phase-N-*.md`) that gets pasted into a fresh Claude Code session to apply that phase end-to-end. The owner runs them one at a time. Phase 10 is the final gate — it runs after all 9 build phases land and verifies every resolved Q&A item before `v2.0.0` is tagged.

## Phase sequencing

| # | Phase | Covers | Depends on | Prompt |
|---|---|---|---|---|
| 1 | Inventory data model foundations | Req 1.1 fabric unit kg/meter, 1.2 supplier_code, 1.3 lots (auto `L-000001`), 1.5 drop `purchase_price_egp`, 1.7 Add Top → factory only, 2.1 `reference_price_per_unit` column | — | [phase-1-inventory-foundations.md](phase-1-inventory-foundations.md) |
| 2 | Add Top UX redesign | Req 1.4 compact table + per-row width/weight/length, 1.6 multi-fabric sub-grouped batches, lot picker per row | Phase 1 | [phase-2-add-top-ux.md](phase-2-add-top-ux.md) |
| 3 | Shipment receiving — per-fabric reference pricing | Req 2.1 one price per fabric → fanned to `reference_price_per_unit` on each roll (unit-aware) | Phase 1 | [phase-3-shipment-pricing.md](phase-3-shipment-pricing.md) |
| 4 | Fulfillment destination (shop vs factory direct) | Req 2.2 invoice-level destination, POS warehouse-aware roll picker | Phase 1 | [phase-4-fulfillment-destination.md](phase-4-fulfillment-destination.md) |
| 5 | POS — final price + open-invoice deposit (refundable) | Req 3.1 per-unit final price, 3.2 deposit without lines + refund flow + `deposit_refunded` status | Phase 1 (`length_m`), Phase 4 (destination filter) | [phase-5-pos-pricing-deposit.md](phase-5-pos-pricing-deposit.md) |
| 6 | POS — return on scan | Req 3.3 sold-roll scan → return panel, partial returns | Phase 5 | [phase-6-return-on-scan.md](phase-6-return-on-scan.md) |
| 7 | Payment methods — bank transfer + cheque | Req 3.4 extend `PaymentMethod`, new `cheques` table, allow negative `payments.amount_egp` for refunds | Phase 5 (negative payments used by deposit refund) | [phase-7-payment-methods.md](phase-7-payment-methods.md) |
| 8 | Finance — InstaPay expense + cash drawer label | Req 4.1 InstaPay as expense source, 4.2 UI label only — **business-day math dropped entirely** | — | [phase-8-finance-day-window.md](phase-8-finance-day-window.md) |
| 9 | HR module — payroll & adjustments (single table) | Req 5.x: employees (minimal fields), monthly disbursement, advances+deductions in one `hr_salary_adjustments` table | Phase 7 (uses `bank_transfer` for salary disbursement) | [phase-9-hr-module.md](phase-9-hr-module.md) |
| 10 | **Validation** — every resolved Q&A verified | Schema checks + behavioral tests + regression sweep; produces `v2-validation-report.md`; gate before tagging `v2.0.0` | Phases 1–9 all merged | [phase-10-validation.md](phase-10-validation.md) |

## Universal constraints (apply to every phase)

Restated in each phase prompt so they're standalone, but recorded here once for reference.

**Stack invariants:**
- Backend: Node.js + TypeScript, Express, Knex migrations only (no Prisma), Postgres 16, snake_case, Cairo TZ, timestamps stored UTC, rendered Cairo
- Frontend: React + TypeScript + Vite, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: existing JWT + permissions matrix in `Settings`; always use `permissionsService.can()`, never inline role checks
- Audit log row on every sensitive write
- Branch isolation: one branch only in v2, but the existing `branch_id` columns stay populated where they exist
- Migrations: numbered sequentially, both `up` and `down` implemented, Claude Code reads `backend/src/db/migrations/` and picks the next number
- No customer deletion, online-only, concurrent sessions blocked

**UI/UX skill constraint (hard rule):**
> Every UI- or UX-touching phase MUST invoke the `ui-ux-pro-max` skill at the start of work and re-invoke it for each major UI section.

Phases affected: **1 (fabric-create dialog edits), 2, 3 (ReviewShipment redesign), 4 (POS destination toggle), 5 (POS surface), 6 (return panel), 7 (payment-method picker), 8 (expense form), 9 (HR pages).**

**Process invariants:**
- Each phase is a single Claude Code session, revertable with `git revert`
- Commit message format: `feat(v2-phase-N): <summary>`
- Every phase ends with `npm run typecheck && npm run build && npm run lint` clean + the smoke checklist in that phase's prompt
- No new npm dependencies without justification stated in the commit body
- Existing v1.1 features must not regress

## Going live

After all 9 phases land:
- Tag `v2.0.0`
- Backup production DB (even though system is pre-production, take a backup before destructive migrations)
- Deploy via the existing pipeline
- Owner walkthrough: meter-fabrics through the full lifecycle, lot tracking in inventory, multi-fabric Add Top, shipment per-fabric reference pricing, fulfillment destination toggle with POS roll filtering, POS price override + refundable deposit + return on scan, bank-transfer/cheque payments, InstaPay expenses, HR payroll cycle

This document is the index. The implementation prompts are alongside it under [docs/v2/](.).
