# v2 · Phase 2 — Add Top UX Redesign

> Self-contained prompt. Paste into a fresh Claude Code session.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/requirements-v2.md` — section **1.4** + the lot picker note in **1.3** + the meter-fabric note in **1.1**
3. `docs/v2/PLAN.md` — phase index + universal constraints
4. The current code:
   - `frontend/src/pages/items/AddTop.tsx` (the page being redesigned)
   - `backend/src/domain/items/tops.schemas.ts` (`TopRollEntrySchema`)
   - `backend/src/domain/lots/` (created in Phase 1 — used for the lot picker)
   - `backend/src/domain/items/items.types.ts` (`Fabric.unit` lives here after Phase 1)
5. The git log for Phase 1 commits so the schema is fresh in your head

If Phase 1 hasn't landed (no `fabrics.unit`, no `rolls.length_m`, no `lots` table), **stop and surface that** — this phase depends on it.

## Stack invariants (restated)

- Frontend: React + TypeScript + Vite, RTL only, Arabic labels only, Tailwind + shadcn/ui, Western digits
- Forms: `react-hook-form` + zod, never raw `useState` chains for multi-field forms
- Auth: `permissionsService.can()` — never inline role checks
- Audit log row on every roll insert (already exists; do not duplicate)
- **UI work MUST invoke the `ui-ux-pro-max` skill at the start and for each major UI section** — this phase is almost entirely UI
- No new npm dependencies without justification in the commit body

## Scope

This is a **pure UX redesign** of the Add Top batch form. The data model already supports it after Phase 1.

### Layout — compact table-row per roll

Replace the current card-per-roll layout with a **compact table-style row** so a user can rip through 20–40 rolls without scrolling each card. Required columns, left-to-right (RTL: right-to-left visually but think of these as the logical order):

1. **Color** — searchable select, default = the color from the previous row
2. **Width cm** — number input, default = the fabric's `width_cm`, **editable per roll**
3. **Weight kg** — number input, required for `unit = 'kg'` fabrics, required for `unit = 'meter'` fabrics that still carry weight; placeholder = previous row's value but **do not auto-fill**, the user must confirm each row's weight
4. **Length m** — number input, **shown only when `fabric.unit = 'meter'`**, required in that case
5. **Lot** — searchable select scoped to the current `(fabric_id, color_id)`; has a "+ جديد" affordance to create a new lot inline (modal with `lot_no` + `notes_ar`)
6. **More** — chevron that expands a per-row drawer for the remaining optional fields (grade, brand, composition, sample-flag, etc.) — these stay collapsed by default

Both `width_cm` and `weight_kg` are now **first-class, required, visible columns** — not buried in the "optional fields" accordion (requirements §1.4).

### Bulk affordances

- "Add 5 rows" / "Add 10 rows" quick buttons
- A row-level duplicate button (clone previous row except `lot_no` if user is using auto-generated lot numbers)
- Bulk-set color: select multiple rows → set color in one click

### Footer

- Live total: number of rolls, sum of `weight_kg`, sum of `length_m` (only when meter-fabric)
- Submit button disabled until every required field on every row passes zod
- Inline validation errors per cell (not a single toast at the top)

### Backend touch points

- `TopRollEntrySchema` already has `width_cm` and `weight_kg`. Confirm they're `required`, not `optional`. Make `length_m` required when the parent fabric is `unit = 'meter'`.
- No new endpoints. Lot create + lookup already exists from Phase 1.
- Confirm `purchase_price_egp` is fully out of the schema (Phase 1 §1.5).

## Visual reference

- The `ui-ux-pro-max` skill must be consulted before writing JSX.
- Density target: **dense** — table rows, not cards. Inspiration: shadcn `<Table>` + inline editable cells.
- Maintain existing brand colors and typography. **No theme changes.**

## Acceptance

- Adding 20 rolls in one batch takes <2 minutes of clicking for a familiar user
- Both `width_cm` and `weight_kg` are visible by default — no accordion expansion needed
- For a meter-fabric, a `length_m` column appears and is required
- Lot picker offers existing lots for the current `(fabric, color)`, and inline-creates a new lot without leaving the page
- Submitting the form succeeds with all rolls landing in `rolls` with correct `lot_id`, `length_m`, `width_cm`, `weight_kg`
- No regression in the underlying API (existing v1.1 endpoints unchanged)
- `npm run typecheck && npm run build && npm run lint` is clean

## Smoke checklist

- [ ] Create kg-fabric, add 5 rolls in one batch via the new table layout — all persist
- [ ] Create meter-fabric, add 3 rolls with `length_m` — all persist with `length_m` populated
- [ ] Try to submit a row with missing `width_cm` — inline error appears, submit stays disabled
- [ ] Create a new lot inline from the row — appears in the lot dropdown without page refresh
- [ ] Pick an existing lot for a row whose color does NOT match the lot's color — UI prevents selection (lot list is scoped)
- [ ] Footer totals update live as rows are added/edited

## Commit

`feat(v2-phase-2): add-top ux — compact table, per-roll width/weight/length, lot picker`

## Stop here

Do not start Phase 3. Print a one-line "Phase 2 done — ready for Phase 3" and exit.
