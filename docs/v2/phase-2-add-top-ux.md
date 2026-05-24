# v2 · Phase 2 — Add Top UX Redesign

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/requirements-v2.md` — **§1.4, 1.6**, plus the lot picker note in §1.3 and the meter-fabric note in §1.1
3. `docs/v2/PLAN.md` and `docs/v2/questions-resolved.md`
4. The current code:
   - `frontend/src/pages/items/AddTop.tsx`
   - `backend/src/domain/items/tops.schemas.ts` (`TopRollEntrySchema`)
   - `backend/src/domain/lots/` (created in Phase 1)
   - `backend/src/domain/items/items.types.ts` (`Fabric.unit` after Phase 1)
5. Phase 1 commits — confirm schema is fresh

If Phase 1 hasn't landed (no `fabrics.unit`, no `rolls.length_m`, no `lots` table, no `rolls.lot_id`), **stop and surface that**.

## Stack invariants (restated)

- Frontend: React + TypeScript + Vite, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits
- Forms: `react-hook-form` + zod
- Auth: `permissionsService.can()` — never inline role checks
- Audit log row on every roll insert (existing — do not duplicate)
- **UI work MUST invoke the `ui-ux-pro-max` skill at the start and for each major UI section**
- No new npm dependencies without justification in the commit body

## Scope

Pure UX redesign — the data model already supports it after Phase 1.

### 1.6 · Multi-fabric, sub-grouped layout

A single Add Top session can contain rolls of **multiple fabrics**. UX:

- Top of the page: invoice-level meta (date, source, notes).
- Below: a stack of **fabric sub-groups**. Each sub-group has:
  - A small header row: fabric picker (searchable select) + an icon button to remove the entire sub-group
  - A table of roll rows under that fabric (see 1.4 below)
- A footer button «+ fabric جديد» adds a new empty sub-group below the current one.

All rows within one sub-group share the picked fabric (and follow its kg/meter unit). Color, lot, width, weight, length are picked per row.

### 1.4 · Compact table-row per roll

Required columns inside each sub-group's table, in this logical order (RTL render reverses visually):

1. **Color** — searchable select, default = the color from the previous row in this sub-group
2. **Width cm** — number input, default = the fabric's `width_cm`, editable per row, **required**
3. **Weight kg** — number input, **required**. Shows previous row's value as **placeholder only** — never auto-fills. Ahmed types each one.
4. **Length m** — number input, **shown only when `fabric.unit = 'meter'`**, **required** in that case
5. **Lot** — searchable select scoped to the current `(fabric, color)`. Has a «+ جديد» affordance that creates a new lot inline via `POST /api/lots` (no modal — quick action; `lot_no` is server-generated). The picker shows existing lots for the chosen color and updates as the color changes.
6. **More** — chevron expanding a per-row drawer for remaining optional fields (grade, brand, composition, sample flag, etc.)

Both width and weight are first-class visible cells — NOT in an accordion.

### Bulk affordances (per sub-group)

- "Add 5 rows" / "Add 10 rows" buttons
- Duplicate-row button per row (clones color + width; weight starts empty since each weight must be confirmed)
- Multi-select rows → bulk-set color in one click

### Footer

- Live totals: number of rolls, total weight (sum), total length (only shown when at least one sub-group is a meter-fabric)
- Submit button disabled until every required cell on every row passes zod
- Inline validation per cell — not a single top-of-page toast

### Backend touch points

- `TopRollEntrySchema`: keep `width_cm` and `weight_kg` required; add `length_m` as required when the parent fabric is `unit = 'meter'`; add `lot_id` optional.
- Multi-fabric submission shape — confirm the existing endpoint accepts a request body that lists rolls with `fabric_id` per row, OR rework to accept a sub-grouped shape `[{ fabric_id, rolls: [...] }, ...]`. Pick whichever requires the smaller diff; document the choice in the commit body.
- Lot create endpoint already exists from Phase 1 — no new endpoints needed.

## Visual reference

- Consult `ui-ux-pro-max` before writing JSX.
- Density: **dense** — table rows, not cards. Inspiration: shadcn `<Table>` with inline-editable cells.
- Keep existing brand colors and typography. No theme changes.

## Acceptance

- Adding 20 rolls across 2 fabrics in one session takes <2 minutes of clicking for a familiar user
- Width and weight visible per row by default
- For a meter-fabric sub-group, a `length_m` column appears and is required
- Lot picker shows existing lots for the row's `(fabric, color)`, and «+ جديد» creates one inline (server assigns `lot_no`)
- Picking a lot whose `(fabric, color)` doesn't match the row → server rejects (UI guard makes this unreachable)
- Submitting writes all rolls with `warehouse: 'factory'` (Phase 1 invariant) and the chosen `lot_id` / `length_m` / `width_cm` / `weight_kg`
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] Create kg-fabric, add 5 rolls in one sub-group → all persist with correct fields
- [ ] Add a second sub-group with a meter-fabric, 3 rolls with `length_m` → all persist
- [ ] Try submitting a row with empty `width_cm` → inline error, submit disabled
- [ ] Create a new lot inline from a row → appears in the lot dropdown without page refresh
- [ ] In the same session, give two rows of the same `(fabric, color)` different lots — both persist with their respective `lot_id`
- [ ] Footer totals update live as rows are added/edited

## Commit

`feat(v2-phase-2): add-top ux — compact table, per-roll width/weight/length, multi-fabric sub-groups, lot picker`

## Stop here

Print "Phase 2 done — ready for Phase 3" and exit.
