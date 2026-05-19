# Ramex Store v2 — Change Plan

## Context

`v1.1` is live. The owner has signed off on a second batch of changes captured in [docs/requirements-v2.md](../requirements-v2.md). Five business modules are affected — inventory data model, shipments, POS, finance/cash, and a brand-new HR module.

This plan splits that work into **9 sequential phases**. Each phase has a standalone prompt file in this folder (`phase-N-*.md`) that can be pasted into a fresh Claude Code session to apply that phase end-to-end. Phases are designed to land independently and ship a working main behind every commit.

## Phase sequencing

| # | Phase | Covers | Depends on | Prompt |
|---|---|---|---|---|
| 1 | Inventory data model foundations | Req 1.1 (fabric unit kg/meter), 1.2 (supplier_code), 1.3 (lots table + `lot_id` on rolls), 1.5 (drop `purchase_price_egp` from Add Top) | — | [phase-1-inventory-foundations.md](phase-1-inventory-foundations.md) |
| 2 | Add Top UX redesign | Req 1.4 (per-roll width/weight first-class, compact table-row layout, integrate lot picker) | Phase 1 | [phase-2-add-top-ux.md](phase-2-add-top-ux.md) |
| 3 | Shipment receiving — per-fabric pricing | Req 2.1 (one price per fabric → auto-distribute over rolls) | Phase 1 | [phase-3-shipment-pricing.md](phase-3-shipment-pricing.md) |
| 4 | Fulfillment destination (shop vs factory direct) | Req 2.2 — **gated**, exact stock-movement flow must be decided in chat before this prompt is finalised | Phase 3 | [phase-4-fulfillment-destination.md](phase-4-fulfillment-destination.md) |
| 5 | POS — final price override + open-invoice deposit | Req 3.1 (per-unit override at sale), 3.2 (deposit without lines) | Phase 1 | [phase-5-pos-pricing-deposit.md](phase-5-pos-pricing-deposit.md) |
| 6 | POS — return on scan | Req 3.3 (scan sold roll → auto return invoice, partial allowed) | Phase 5 | [phase-6-return-on-scan.md](phase-6-return-on-scan.md) |
| 7 | Payment methods — bank transfer + cheque | Req 3.4 (extend `PaymentMethod`, new `cheques` table) | — (can run anytime, but easier after 5/6 so POS payment surface only changes once) | [phase-7-payment-methods.md](phase-7-payment-methods.md) |
| 8 | Finance — InstaPay expense + business day window | Req 4.1 (`paid_from: 'instapay'`), 4.2 (10:30 AM → 12:00 AM Cairo) | — | [phase-8-finance-day-window.md](phase-8-finance-day-window.md) |
| 9 | HR module — payroll, advances, deductions | Req 5.1, 5.2, 5.3 (new domain) | Phase 7 (uses `bank_transfer` payment method for salary disbursement) | [phase-9-hr-module.md](phase-9-hr-module.md) |

### Phase 4 is gated

Req 2.2 leaves the exact stock movement for `factory_direct` open (`docs/requirements-v2.md` line 254). Before running phase-4, the owner and Claude Code must agree in chat on the answer to:

- Do rolls in a `factory_direct` invoice skip `warehouse: 'shop'` and go directly to `status: 'sold'`?
- Or do they get a transient `warehouse: 'factory_direct'` state while the customer is in transit?
- Does the invoice need its own status while the customer is travelling to the factory?

The phase-4 prompt contains a `## Resolved flow` block that must be filled in before it is run.

## Universal constraints (apply to every phase)

Restated in each phase prompt so they're standalone, but recorded here once for reference.

**Stack invariants:**
- Backend: Node.js + TypeScript, Express, Knex migrations only (no Prisma), Postgres 16, snake_case, Cairo TZ, timestamps stored UTC, rendered Cairo
- Frontend: React + TypeScript + Vite, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: existing JWT + permissions matrix in `Settings`; always use `permissionsService.can()`, never inline role checks
- Audit log row on every sensitive write (sale, void, override, refund, expense, salary, advance, deduction)
- Branch isolation: every branch-scoped query filters by branch
- Migrations: numbered sequentially, both `up` and `down` implemented, Claude Code reads `backend/src/db/migrations/` and picks the next number
- No customer deletion, online-only, concurrent sessions blocked

**UI/UX skill constraint (hard rule):**
> Every UI- or UX-touching phase MUST invoke the `ui-ux-pro-max` skill at the start of work and re-invoke it for each major UI section. No UI code is written without consulting the skill first.

Phases affected by this rule: **1 (FabricCreateDialog edits), 2, 3 (ReviewShipment redesign), 4, 5 (POS surface), 6 (return modal), 7 (payment-method picker), 8 (expense form), 9 (HR pages).**

**Process invariants:**
- Each phase is a single Claude Code session, revertable with `git revert`
- Commit message format: `feat(v2-phase-N): <summary>`
- Every phase ends with: `npm run typecheck && npm run build && npm run lint` clean + the smoke checklist in that phase's prompt
- No new npm dependencies without justification stated in the commit body
- Existing v1.1 features must not regress

## Going live

After all 9 phases land:
- Tag `v2.0.0`
- Backup production DB
- Deploy via the existing pipeline
- Run smoke against production
- Owner walkthrough: meter-fabrics through the full lifecycle, lot-based reports, shipment per-fabric pricing, fulfillment destination toggle, POS price override + deposit-only open invoice + return on scan, bank-transfer/cheque payments, instapay expenses, HR payroll cycle

This document is the index. The implementation prompts are alongside it under [docs/v2/](.).
