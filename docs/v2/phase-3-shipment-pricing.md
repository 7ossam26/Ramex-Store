# v2 · Phase 3 — Shipment Receiving: Per-Fabric Pricing

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/requirements-v2.md` — section **2.1** (and the unit context from §1.1)
3. `docs/v2/PLAN.md` — phase index + universal constraints
4. The current code:
   - `frontend/src/pages/shipments/ReviewShipment.tsx` (the page being changed)
   - `backend/src/domain/shipments/` — services, schemas, repository
   - `backend/src/domain/items/items.types.ts` — `Fabric.unit` (Phase 1)
   - The `rolls` table — `selling_price_egp`, `weight_kg`, `length_m`

If Phase 1 hasn't landed (no `fabrics.unit`, no `rolls.length_m`), **stop and surface that**.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: `permissionsService.can()` — never inline role checks
- Audit log on every accept of a shipment line
- UI work MUST invoke the `ui-ux-pro-max` skill
- No new npm dependencies without justification in the commit body

## Scope

Replace per-roll price entry with **per-fabric price entry** at shipment receipt. The price is unit-aware: per kg for `kg`-fabrics, per meter for `meter`-fabrics.

### UX

Current `ReviewShipment.tsx` collects `selling_price_egp` per line (per roll), with a bulk-price shortcut. Change it to:

1. Group the shipment's rolls by `fabric_id` in the review pane (a section header per fabric).
2. Each section header has **one price input**, labelled «سعر الكيلو» when `fabric.unit = 'kg'`, «سعر المتر» when `fabric.unit = 'meter'`.
3. As Ziad types the price, the table below auto-fills `selling_price_egp` for every roll in that fabric group:
   ```
   selling_price_egp = price_per_unit × roll.weight_kg          (kg fabric)
   selling_price_egp = price_per_unit × roll.length_m           (meter fabric)
   ```
4. Per-roll override remains possible (click into a roll's computed price → editable). Overrides are sticky: subsequent edits to the fabric price do not clobber a manually overridden roll's price (show a small indicator on overridden rows).
5. Confirming the shipment writes the resolved `selling_price_egp` to each `roll`.

### Backend

- Add a request shape `acceptShipment({ shipmentId, fabricPrices: [{ fabricId, pricePerUnit }], rollOverrides?: [{ rollId, sellingPriceEgp }] })`.
- Server resolves each roll's final `selling_price_egp` using the formula above (or the override if present), validates non-negative, writes to `rolls.selling_price_egp`, and logs one audit row per fabric group (`action: 'shipment_priced'`, `payload: { fabricId, pricePerUnit, rollCount, total }`).
- If a meter-fabric has a roll with `length_m = NULL`, reject the request with a clear Arabic error pointing to the roll number.
- Backwards compatibility: the old per-roll endpoint can stay temporarily but is no longer called by the UI. If you remove it, make sure no other caller exists (grep before deleting).

### Migration

No schema change required — `selling_price_egp` already exists on `rolls`. Only behavior changes.

## Acceptance

- Receiving a 30-roll shipment with 3 fabrics takes 3 price inputs (not 30)
- Each roll lands with the correctly computed `selling_price_egp`
- A meter-fabric shipment uses `length_m` in the multiplication; kg-fabric uses `weight_kg`
- Per-roll override still works and survives subsequent fabric-price edits
- Trying to accept a meter-fabric shipment with a roll missing `length_m` fails with a precise Arabic error
- Audit log shows one row per fabric group
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] Receive a 2-fabric shipment (one kg, one meter) — both price inputs use the correct unit label
- [ ] Auto-computed prices match the formula to 2 decimals
- [ ] Manually override one roll's price — change the fabric price after — overridden row is untouched
- [ ] Attempt to accept a meter-fabric shipment with `length_m = NULL` on one roll → rejected
- [ ] Inventory list after acceptance shows the new `selling_price_egp` values

## Commit

`feat(v2-phase-3): shipment receiving — per-fabric pricing, unit-aware (kg/meter)`

## Stop here

Do not start Phase 4. Phase 4 is **gated** on a chat decision — see `docs/v2/phase-4-fulfillment-destination.md`. Print "Phase 3 done — Phase 4 requires owner decision before running" and exit.
