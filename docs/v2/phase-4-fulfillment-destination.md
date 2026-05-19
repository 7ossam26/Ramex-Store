# v2 · Phase 4 — Fulfillment Destination (Shop vs Factory Direct)

> **Gate:** This prompt is incomplete until the `## Resolved flow` block is filled in. The exact stock movement for `factory_direct` is left open in `docs/requirements-v2.md` line 254. Owner + Claude Code must agree in chat first, then paste the resolution into this file. **Do not run this prompt while `## Resolved flow` still says `<<TO BE FILLED IN AFTER OWNER DECISION>>`.**

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/requirements-v2.md` — section **2.2** + the warning callout at line 252
3. `docs/v2/PLAN.md` — phase index
4. The current code:
   - `backend/src/domain/sales/` — invoice creation, lifecycle, lines
   - `backend/src/domain/shipments/` — accept-shipment flow (Phase 3 just touched this)
   - `frontend/src/pages/shipments/ReviewShipment.tsx`
   - The `invoices` and `rolls` tables — current statuses + warehouse field

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only
- Auth: `permissionsService.can()`
- Audit log row on every state transition for an affected invoice or roll
- UI work MUST invoke the `ui-ux-pro-max` skill
- No new npm dependencies without justification in the commit body

## Pre-resolved facts (from requirements)

- New column on `invoices` (or related order entity): `fulfillment_destination varchar(32) NULL`. Values: `'shop' | 'factory_direct'`. Default `NULL` for legacy invoices.
- Set at the point Ziad accepts the shipment in `ReviewShipment` (this is the requirement's wording; if implementation reveals a better point — e.g., at invoice creation in POS — surface the choice).
- `'shop'`: accepted rolls move to `warehouse: 'shop'` (current default behaviour).
- `'factory_direct'`: customer collects from the factory — exact roll/invoice state machine **TBD** (see `## Resolved flow` below).

## Resolved flow

<<TO BE FILLED IN AFTER OWNER DECISION>>

Format expected when filled:
- **Roll lifecycle for `factory_direct`:** (e.g., "rolls skip `warehouse: 'shop'` and go directly to `status: 'sold'` on invoice payment" OR "rolls take a transient `warehouse: 'factory_direct'` value and only become `status: 'sold'` after factory confirms handover")
- **Invoice status:** does the invoice need a new state (e.g., `awaiting_factory_pickup`) between paid and delivered?
- **Who confirms handover** and through which UI?
- **What audit events fire** and with what payload?
- **Reports impact:** how do reports distinguish shop-fulfilled vs factory-direct sales? (e.g., daily sales report split, cash drawer attribution)

## Scope (only run once Resolved flow is filled in)

### Migration

- Add `fulfillment_destination varchar(32) NULL` to `invoices` with a CHECK constraint accepting `'shop' | 'factory_direct'` (or NULL for legacy rows).
- Any additional columns required by the resolved flow (e.g., `factory_picked_up_at timestamptz NULL`) come out of this migration too.
- `up` + `down` both implemented.

### Backend

- Extend the shipment-accept request body with `fulfillmentDestination`.
- Implement the state machine described in `## Resolved flow`.
- Backend rejects unknown values; falls back to `'shop'` for any callers that don't supply one (preserves v1.1 behaviour).
- Audit row on every transition.

### Frontend

- In `ReviewShipment.tsx`, add a clear selector (radio group, Arabic labels: «المحل» / «استلام مباشر من المصنع») above the per-fabric pricing section.
- A confirmation step before submitting `factory_direct` shipments (Arabic: «هل أنت متأكد؟ الرولات لن تمر بمخزن المحل»).
- Wherever invoices are listed (POS sidebar, owner reports), expose a filter by fulfillment destination.

## Acceptance

- All bullets in `## Resolved flow` are implemented and verifiable through the UI
- Existing shop-fulfilled flow is byte-for-byte identical for end users
- Factory-direct flow produces the agreed state transitions and audit trail
- `npm run typecheck && npm run build && npm run lint` is clean
- Migration rollback round-trip is clean

## Smoke checklist

- [ ] Accept a shipment with `fulfillment_destination = 'shop'` — behaves like before; rolls land in shop warehouse
- [ ] Accept a shipment with `fulfillment_destination = 'factory_direct'` — rolls follow the resolved lifecycle
- [ ] Owner reports show the split between shop-fulfilled and factory-direct sales
- [ ] Audit log entries match the resolved flow for both paths
- [ ] All v1.1 invoices (with `fulfillment_destination = NULL`) still display and process correctly

## Commit

`feat(v2-phase-4): fulfillment destination — shop vs factory direct pickup`

Body: link to the chat decision that resolved the open question.

## Stop here

Print "Phase 4 done — ready for Phase 5" and exit.
