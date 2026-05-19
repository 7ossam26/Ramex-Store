# v2 · Phase 3 — Shipment Receiving: Per-Fabric Reference Pricing

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/requirements-v2.md` — **§2.1** (and the unit context from §1.1)
3. `docs/v2/PLAN.md` and `docs/v2/questions-resolved.md`
4. The current code:
   - `frontend/src/pages/shipments/ReviewShipment.tsx`
   - `backend/src/domain/shipments/` — services, schemas, repository
   - `backend/src/domain/items/items.types.ts` — `Fabric.unit` (Phase 1)
   - The `rolls` table — `reference_price_per_unit` (Phase 1), `selling_price_egp`, `weight_kg`, `length_m`

If Phase 1 hasn't landed (no `fabrics.unit`, no `rolls.length_m`, no `rolls.reference_price_per_unit`), **stop and surface that**.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: `permissionsService.can()` — never inline role checks
- Audit log on every accept of a shipment line
- UI work MUST invoke the `ui-ux-pro-max` skill
- No new npm dependencies without justification in the commit body

## Scope

Replace per-roll price entry with **per-fabric reference price entry**. The price entered here is a **reference**, not the final sale price. POS will write `selling_price_egp` later.

### UX — `ReviewShipment.tsx`

1. Group the shipment's rolls by `fabric_id`.
2. Each section header has **one price input**, labelled «سعر الكيلو المرجعي» when `fabric.unit = 'kg'`, «سعر المتر المرجعي» when `fabric.unit = 'meter'`.
3. As Ziad types the price, every roll in that fabric group gets `reference_price_per_unit = <typed value>` stored as-is. The table can show a preview total per roll (`price × weight_kg` or `price × length_m`) for context, but only the per-unit value is persisted.
4. **No per-roll override.** Strict one-price-per-fabric.
5. Confirming the shipment writes `reference_price_per_unit` to each `roll`. `selling_price_egp` stays NULL.

### Backend

- Request shape: `acceptShipment({ shipmentId, fabricReferencePrices: [{ fabricId, pricePerUnit }] })`.
- Server resolves each roll: `roll.reference_price_per_unit = pricePerUnit`. Validate non-negative.
- Reject the request if a meter-fabric has any roll with `length_m IS NULL`, with a clear Arabic error pointing to the roll(s).
- Reject if any fabric in the shipment is missing from the request (no skip-pricing).
- Audit: one row per fabric group, `action: 'shipment_reference_priced'`, payload `{ fabricId, pricePerUnit, rollCount }`.
- Remove any legacy per-roll-price acceptance path if it exists (grep first; system is pre-production, so a clean cut is fine).

### Migration

No schema change — `rolls.reference_price_per_unit` already exists from Phase 1.

## Acceptance

- Receiving a 30-roll shipment with 3 fabrics takes 3 price inputs (not 30)
- Each roll lands with the correct `reference_price_per_unit`
- `selling_price_egp` stays NULL until POS sells the roll
- A meter-fabric shipment cannot be accepted while any roll has `length_m IS NULL`
- Audit log shows one row per fabric group
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] Receive a 2-fabric shipment (one kg, one meter) — both price inputs use the correct unit label
- [ ] Confirm — each roll's `reference_price_per_unit` matches; `selling_price_egp` is NULL
- [ ] Attempt to accept a meter-fabric shipment with `length_m = NULL` on one roll → rejected with Arabic error
- [ ] Inventory list after acceptance shows the reference price per roll (read-only)
- [ ] Audit log: one row per fabric group, payload contains `pricePerUnit` and `rollCount`

## Commit

`feat(v2-phase-3): shipment receiving — per-fabric reference price (unit-aware kg/meter)`

## Stop here

Print "Phase 3 done — ready for Phase 4" and exit.
