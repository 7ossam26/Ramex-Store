# v2 · Phase 1 — Inventory Data Model Foundations

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/requirements-v2.md` — sections **1.1, 1.2, 1.3, 1.5**, plus the *Cross-Cutting Schema Impact Summary* table
3. `docs/v2/PLAN.md` — phase index + universal constraints
4. The current code:
   - `backend/src/domain/items/` (especially `items.types.ts`, `tops.schemas.ts`, items service + repository, fabrics service)
   - `frontend/src/pages/items/AddTop.tsx`
   - `frontend/src/pages/inventory/Fabrics.tsx` (this file currently hosts the fabric-create dialog — confirm before editing)
   - `backend/src/db/migrations/` — pick the next sequential number

Do not start writing code until all of the above is read.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16, snake_case, Cairo TZ
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits, EGP 2-decimal precision
- Auth: `permissionsService.can()` — never inline role checks
- Audit log row on every sensitive write
- Branch isolation: every branch-scoped query filters by branch
- Migrations: numbered sequentially, both `up` and `down` implemented
- UI work MUST invoke the `ui-ux-pro-max` skill at the start and for each major UI section
- No new npm dependencies without justification in the commit body

## Scope

Four deliverables, all in one phase because they all touch the same schema migration window:

### 1.1 · Fabric unit of measure (`kg` | `meter`)

- Add `unit varchar(8) NOT NULL DEFAULT 'kg'` to the `fabrics` table. Allowed values: `'kg'`, `'meter'`. Enforce via CHECK constraint.
- Add the field to `Fabric` in `backend/src/domain/items/items.types.ts` and to `CreateFabricInput` / `UpdateFabricInput`.
- Surface as a **required selector** in the fabric-create dialog and the fabric update form (Arabic labels: «كيلو» / «متر»).
- Add `length_m numeric(10,3) NULL` to the `rolls` table. `weight_kg` stays — both may coexist on a roll. For `unit = 'meter'` fabrics, `length_m` becomes the **primary quantity** used for pricing and POS display.
- The existing `default_price_per_kg` (on `FabricColorPrice`) and `selling_price_egp` (on `rolls`) keep their column names but become **price per unit**. Add a derived helper `priceUnitLabel(fabric)` returning `'كجم'` or `'م'` so the UI can render the correct suffix without renaming the column.
- Repository + service layer: any quantity-based math must branch on `fabric.unit`. Add unit tests covering both branches.
- **No POS UI work in this phase** — POS unit-aware pricing lands in Phase 5.

### 1.2 · Optional supplier import code on fabric

- Add `supplier_code varchar(64) NULL` to `fabrics`.
- Add it to `Fabric` type and `CreateFabricInput` / `UpdateFabricInput` (optional).
- Surface as an optional field in the fabric-create dialog and the fabric update form, clearly labelled as the manufacturer/importer reference, not the auto-generated system `code` (`M-000001`).
- Do **not** unique-constrain it (different suppliers can reuse the same code).

### 1.3 · Lots (`lots` table + `rolls.lot_id`)

Create the lots table exactly as in requirements-v2.md §1.3:

```sql
CREATE TABLE lots (
  id          BIGSERIAL PRIMARY KEY,
  lot_no      VARCHAR(64) NOT NULL UNIQUE,
  fabric_id   BIGINT NOT NULL REFERENCES fabrics(id),
  color_id    BIGINT NOT NULL REFERENCES colors(id),
  notes_ar    TEXT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- Index on `(fabric_id, color_id)`.
- Add `lot_id BIGINT NULL REFERENCES lots(id)` to `rolls`.
- New domain folder `backend/src/domain/lots/` with: types, schemas (zod), repository, service, route. CRUD endpoints: list, get, create, update.
- **Constraint:** a lot is always scoped to one `(fabric_id, color_id)` pair. Server-side validation rejects roll inserts whose `(fabric_id, color_id)` does not match the linked lot's `(fabric_id, color_id)`.
- No UI in this phase beyond a minimal lookup endpoint — the lot picker in Add Top is wired in Phase 2.
- Inventory list/report SQL must accept an optional `lot_id` filter (touch only the queries that already group by fabric/color).

### 1.5 · Remove `purchase_price_egp` from Add Top

- Remove the input from `frontend/src/pages/items/AddTop.tsx`.
- Drop it from `TopRollEntrySchema` (`backend/src/domain/items/tops.schemas.ts`) or make it strictly nullable + ignored on create. Pricing now starts at shipment receipt (Phase 3).
- The column on `rolls` (if present) stays nullable for historical rows; do not migrate existing data.

## Migration

One numbered migration file with `up` + `down`:
- `up`: adds the 4 column changes (`fabrics.unit`, `fabrics.supplier_code`, `rolls.length_m`, `rolls.lot_id`) and creates `lots`
- `down`: drops them in reverse order
- Verify rollback by running `npm run db:migrate && npm run db:migrate:rollback && npm run db:migrate` cleanly

## Acceptance

- A fabric can be created with `unit = 'meter'` and `supplier_code = 'XYZ-123'` through the UI; the new fields persist and round-trip on edit
- A lot can be created via API; rolls reject lot assignment when fabric/color don't match
- The Add Top form no longer shows `purchase_price_egp`; existing rolls in the DB are unaffected
- All v1.1 smoke flows still pass (fabric list, roll list, basic Add Top, shipments list)
- `npm run typecheck && npm run build && npm run lint` is clean
- Migration rollback round-trip is clean

## Smoke checklist

- [ ] Create kg-fabric, then meter-fabric, verify the unit field round-trips
- [ ] Create a roll attached to a meter-fabric, set `length_m`, retrieve it via API — `length_m` is returned
- [ ] Create a lot via API for `(fabric_X, color_Y)`; create roll under same fabric/color with `lot_id` — accepted
- [ ] Try assigning that lot to a roll of a different color — rejected with a clear error
- [ ] Edit a fabric to set `supplier_code` — persists; clear it — persists as NULL
- [ ] Add Top wizard runs end to end without a `purchase_price_egp` field showing
- [ ] `npm run db:migrate:rollback` removes the new columns + table; re-running `migrate` restores them

## Commit

`feat(v2-phase-1): inventory data model — fabric unit, supplier code, lots, drop purchase price`

Body: list the migration filename + the schema changes + the new `backend/src/domain/lots/` module.

## Stop here

Do not start Phase 2 (Add Top UX redesign). Print a one-line "Phase 1 done — ready for Phase 2" and exit.
