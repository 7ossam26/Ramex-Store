# v3 · Phase 5 — Validation & polish

> Self-contained prompt. Paste into a fresh Claude Code session. This is the final phase — it does not add features; it verifies the whole epic end-to-end, hardens edge cases, and confirms no regressions. Model on `docs/v2/phase-10-validation.md`.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/v3/PLAN.md` and all of `docs/v3/phase-0..4-*.md`
3. The current code touched by phases 0–4:
   - `backend/src/domain/treasury/suppliers/*`
   - `backend/src/lib/statements/*` (or wherever Phase 3 placed the engine) + `backend/src/lib/reports/*`
   - `backend/src/domain/customers/*` (ledger, statement adapter)
   - `backend/src/domain/reports/dailyReportService.ts`, `backend/src/domain/shifts/shiftReportService.ts`, `frontend/src/pages/treasury/TreasuriesOverview.tsx`
   - `backend/scripts/audit-routes.ts` — the CI route-guard gate

## Stack invariants (restated)

- No new features in this phase — fixes only.
- Every new route must be permission-guarded (`audit-routes.ts` reports **0** unguarded routes).
- Arabic-only RTL, Western digits, Africa/Cairo, `decimal(14,2)`.

## Scope — verify, then fix anything that fails

### Off-treasury correctness (Phase 0)
- Confirm supplier payments create no cash/bank movement and daily/shift reports + treasuries overview reflect the intended (higher balance / lower outflow) numbers.
- Confirm historical `cash_movements`/`bank_movements` with `reference_type='supplier_payment'` were left untouched.

### Currency (Phases 1–3)
- Supplier list never sums EGP + RMB into one total (per-currency subtotals or per-row currency).
- Currency is rejected on change once transactions exist; invoice/payment currency always equals supplier currency.
- `¥` renders on the correct side in RTL (`<Num dir="ltr">`).

### Opening balance & statement math (Phases 1, 3, 4)
- Brought forward = opening + net **strictly before** `from` (Cairo-local `<`), including the opening entry when its date precedes `from`.
- Signed/negative opening balances (supplier or customer credit) render and sum correctly.
- Editing/deleting an invoice or payment **before** the window changes only brought-forward; **inside** the window changes the body + all downstream running balances + closing.
- Rounding is consistent: `line_total = round(qty*price,2)`; totals sum stored (rounded) values; no cent drift in the running balance.

### Date boundaries (Phases 3–4)
- Statement filtering uses `AT TIME ZONE 'Africa/Cairo'`, not naive UTC. Spot-check a transaction near local midnight lands in the right day.

### Corrections & deletion (Phases 1–2)
- Suppliers/customers with history can only be **deactivated**, never hard-deleted (FK RESTRICT).
- Deleting an invoice cascades its lines; deleting a payment moves no treasury money; both audited.

### Detailed statement rendering (Phase 3–4)
- An invoice with many lines paginates cleanly (`page-break-inside: avoid`); no overflow off the A4 page.

### Large values & bounds
- An RMB invoice near `decimal(14,2)` max stores and renders without overflow.

### Permissions & regression
- `backend/scripts/audit-routes.ts` → 0 unguarded routes.
- The old `customerLedger` report works or is cleanly retired (no runtime throw).
- Full regression: POS sale, return, cash drawer, bank, expense, vault transfer flows still pass their existing smoke paths.

## Acceptance

- Every checklist item above verified; any failure fixed in this phase.
- `npm run typecheck && npm run build && npm run lint` clean.
- `npm run db:migrate` then `npm run db:migrate:rollback` succeed for the full v3 migration set.
- `backend/scripts/audit-routes.ts` reports 0 unguarded routes.

## Smoke checklist

- [ ] End-to-end: create RMB supplier → book multi-line invoice → record payment → generate detailed statement over a range → export PDF/Excel/print. Numbers tie out in ¥.
- [ ] End-to-end: customer opening balance → sale → standalone receipt → statement over a range → export. Numbers tie out in ج.م.
- [ ] Daily report no longer counts supplier payments as cash-out.
- [ ] Suppliers list shows per-currency subtotals.
- [ ] Cairo near-midnight transaction lands in the correct statement day.
- [ ] Migrations roll back cleanly end-to-end.
- [ ] `audit-routes.ts` green.

## Commit

`chore(v3-phase-5): validation, edge-case hardening, and regression sweep`

## Stop here

Print "v3 Accounting & Supplier Payables epic complete." and exit.
