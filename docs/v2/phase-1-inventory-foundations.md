# v2 · Phase 1 — Inventory Data Model Foundations

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/requirements-v2.md` — **§1.1, 1.2, 1.3, 1.5, 1.7, 2.1** (the schema column it adds), plus the *Cross-Cutting Schema Impact Summary* table
3. `docs/v2/PLAN.md` and `docs/v2/questions-resolved.md`
4. The current code:
   - `backend/src/domain/items/` (especially `items.types.ts`, `tops.schemas.ts`, items service + repository, fabrics service)
   - `frontend/src/pages/items/AddTop.tsx`
   - `frontend/src/pages/inventory/Fabrics.tsx` (currently hosts the fabric-create dialog — confirm before editing)
   - `backend/src/db/migrations/008_create_rolls.ts` (existing `rolls` schema)
   - `backend/src/db/migrations/` — pick the next sequential number

Do not start writing code until all of the above is read.

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16, snake_case, Cairo TZ
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits
- Auth: `permissionsService.can()` — never inline role checks
- Audit log row on every sensitive write
- Migrations: numbered sequentially, both `up` and `down` implemented
- UI work MUST invoke the `ui-ux-pro-max` skill at the start and for each major UI section
- No new npm dependencies without justification in the commit body

> [!IMPORTANT]
> System is pre-production — old data can be wiped. No backwards-compat shims needed.

## Scope

Six deliverables in one phase because they all touch the same schema migration window:

### 1.1 · Fabric unit of measure (`kg` | `meter`)

- Add `unit varchar(8) NOT NULL DEFAULT 'kg'` to `fabrics` with CHECK `IN ('kg','meter')`.
- Add `unit` to `Fabric` in `backend/src/domain/items/items.types.ts` and to `CreateFabricInput` / `UpdateFabricInput`.
- Required selector in the fabric-create dialog and fabric update form. Arabic labels «كيلو» / «متر».
- Add `length_m numeric(10,3) NULL` to `rolls`. For meter-fabrics, `length_m` is the **primary quantity** for pricing/POS display. For kg-fabrics, `length_m` is irrelevant.
- Existing `default_price_per_kg` and `selling_price_egp` keep their names but become **price per unit**. Add a UI helper `priceUnitLabel(fabric)` returning `'كجم'` or `'م'`.
- Repository + service layer: any quantity-based math must branch on `fabric.unit`. Add unit tests covering both branches.
- No POS UI work in this phase — that's Phase 5.

### 1.2 · Optional supplier import code

- Add `supplier_code varchar(64) NULL` to `fabrics`. Not unique-constrained.
- Add to `Fabric` type and `CreateFabricInput` / `UpdateFabricInput`.
- Optional text field in fabric-create / update form, clearly distinct from the system's auto `code` (`M-000001`).

### 1.3 · Lots — auto-generated `L-000001`

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
CREATE INDEX lots_fabric_color_idx ON lots(fabric_id, color_id);
```

- `lot_no` is **auto-generated, read-only**. Use a Postgres sequence + helper function (mirror however `M-000001` is generated for fabrics — likely in `backend/src/domain/items/` — and apply the same pattern with prefix `L-`).
- Add `lot_id BIGINT NULL REFERENCES lots(id)` to `rolls`.
- New domain folder `backend/src/domain/lots/`:
  - `lots.types.ts`, `lots.schemas.ts` (zod — `notes_ar` only on create; `lot_no` is server-assigned), `lots.repository.ts`, `lots.service.ts`, `lots.routes.ts`
  - Endpoints: `GET /api/lots`, `GET /api/lots/:id`, `POST /api/lots` (body: `{ fabric_id, color_id, notes_ar? }` — server assigns `lot_no`), `PATCH /api/lots/:id` (notes only)
- Server-side validation: when creating/updating a roll with `lot_id`, the roll's `(fabric_id, color_id)` must match the lot's `(fabric_id, color_id)`. Reject with a clear Arabic error.
- The inventory list/grid SQL must accept an optional `lot_id` filter and return `lot_no` joined onto each roll row. UI surface for that filter lands in Phase 2.

### 1.5 · Remove `purchase_price_egp`

- Drop the input from `frontend/src/pages/items/AddTop.tsx`.
- Drop the field from `TopRollEntrySchema` in `backend/src/domain/items/tops.schemas.ts`.
- **Drop the column** `rolls.purchase_price_egp` (destructive — system is pre-production).

### 1.7 · Add Top → factory warehouse only

- Confirm the existing Add Top write path hardcodes `warehouse: 'factory'`. If a warehouse parameter is still being read from the request body, remove it and hardcode server-side.
- No UI warehouse picker.

### 2.1 column · Reference price per unit

- Add `reference_price_per_unit numeric(12,2) NULL` to `rolls` (no UI in this phase — populated by Phase 3).

## Migration

One numbered migration file with `up` + `down`:
- `up`:
  - `ALTER TABLE fabrics ADD COLUMN unit VARCHAR(8) NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg','meter'))`
  - `ALTER TABLE fabrics ADD COLUMN supplier_code VARCHAR(64) NULL`
  - `CREATE TABLE lots (...)` + index + the `L-000001` sequence helper
  - `ALTER TABLE rolls ADD COLUMN lot_id BIGINT NULL REFERENCES lots(id)`
  - `ALTER TABLE rolls ADD COLUMN length_m NUMERIC(10,3) NULL`
  - `ALTER TABLE rolls ADD COLUMN reference_price_per_unit NUMERIC(12,2) NULL`
  - `ALTER TABLE rolls DROP COLUMN purchase_price_egp`
- `down`: reverse each step
- Verify rollback by running `npm run db:migrate && npm run db:migrate:rollback && npm run db:migrate` cleanly

## Acceptance

- A fabric can be created with `unit = 'meter'` and `supplier_code = 'XYZ-123'` through the UI; the new fields persist and round-trip
- `POST /api/lots` returns a record with auto-generated `lot_no` like `L-000001`
- Rolls reject lot assignment when fabric/color don't match
- The Add Top form no longer shows `purchase_price_egp`
- `rolls.reference_price_per_unit` exists and is NULL on all rolls (Phase 3 populates it)
- All v1.1 smoke flows still pass
- `npm run typecheck && npm run build && npm run lint` is clean
- Migration rollback round-trip is clean

## Smoke checklist

- [ ] Create kg-fabric, then meter-fabric, verify the unit field round-trips
- [ ] Create a roll attached to a meter-fabric, set `length_m`, retrieve it via API — `length_m` returned
- [ ] Create a lot via API for `(fabric_X, color_Y)` — `lot_no` auto-assigned, format `L-000001`
- [ ] Create a second lot for `(fabric_X, color_Z)` — `lot_no` = `L-000002`
- [ ] Try assigning lot for `(fabric_X, color_Y)` to a roll of `(fabric_X, color_Z)` — rejected with a clear error
- [ ] Edit a fabric to set `supplier_code` — persists; clear it — persists as NULL
- [ ] Add Top wizard runs end to end without a `purchase_price_egp` field showing
- [ ] `npm run db:migrate:rollback` removes the new columns + table; re-running `migrate` restores them

## Commit

`feat(v2-phase-1): inventory data model — fabric unit, supplier code, lots, length_m, reference_price_per_unit, drop purchase_price`

Body: list the migration filename + the schema changes + the new `backend/src/domain/lots/` module + the `L-000001` sequence approach.

## Stop here

Do not start Phase 2. Print "Phase 1 done — ready for Phase 2" and exit.
