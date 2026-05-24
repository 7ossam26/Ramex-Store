# v2 · Phase 4 — Fulfillment Destination (Shop vs Factory Direct)

> Self-contained prompt. Paste into a fresh Claude Code session. The earlier "gate" is gone — the flow is fully resolved.

## Read first (in order)

1. `CORE_PLAN.md` — end to end
2. `docs/requirements-v2.md` — **§2.2** (resolved version — every rule below comes from it)
3. `docs/v2/PLAN.md` and `docs/v2/questions-resolved.md`
4. The current code:
   - `backend/src/domain/sales/` — invoice creation, lifecycle, lines
   - `frontend/src/pages/pos/POS.tsx` — roll picker / scanner / cart
   - `backend/src/db/migrations/008_create_rolls.ts` — confirms `rolls.warehouse` enum is `'shop' | 'factory' | 'damaged_shop'`
   - The `invoices` table — current statuses

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations only, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only
- Auth: `permissionsService.can()`
- Audit log row on every state transition
- UI work MUST invoke the `ui-ux-pro-max` skill
- No new npm dependencies without justification in the commit body

## Resolved flow (from requirements-v2.md §2.2)

- `fulfillment_destination` lives on `invoices`, set at **invoice creation in POS**.
- Values: `'shop' | 'factory_direct'`. **Per invoice**, not per line. Mixed destinations on one invoice are impossible.
- **No transit state** for rolls. Upon invoice payment, every roll on the invoice flips `status: in_stock` → `'sold'` immediately.
- Roll `warehouse` field **stays as it was** after sale (so reports can split "sold from factory" vs "sold from shop").
- Stock deduction follows the roll's `warehouse`.
- **No handover tracking** — customer just walks out with the invoice paper.

## Scope

### Migration

- `ALTER TABLE invoices ADD COLUMN fulfillment_destination VARCHAR(32) NOT NULL DEFAULT 'shop' CHECK (fulfillment_destination IN ('shop','factory_direct'))`
- No other columns needed (no transit state, no handover timestamps).
- `up` + `down` both implemented and round-trip clean.

### Backend

- Extend the invoice-create request body in `backend/src/domain/sales/` with `fulfillmentDestination`.
- On invoice create:
  - Validate value ∈ `{shop, factory_direct}`. Default to `'shop'` if missing (backwards compat).
  - If `'factory_direct'`: server rejects any cart line whose roll is NOT `warehouse: 'factory'`.
  - If `'shop'`: server rejects any cart line whose roll is `warehouse: 'factory'` (those need a stock transfer first).
- No state machine. The roll lifecycle on payment is unchanged from v1.1 (in_stock → sold). The destination field is recorded for filtering/reports.
- Audit: include `fulfillment_destination` in the existing invoice-create audit payload.

### Frontend — POS

Add a clear destination toggle to the POS surface (radio group at the top of the cart panel):
- «المحل» (shop) — default
- «استلام مباشر من المصنع» (factory_direct)

**Roll picker behaviour** changes based on the toggle:

- `destination = 'factory_direct'`:
  - Search results / scanner only return rolls with `warehouse: 'factory'`.
  - Shop rolls are hidden entirely.
- `destination = 'shop'`:
  - Search results return both shop and factory rolls.
  - Factory rolls are visible but **disabled** (grayed out, label «في المصنع» on the row, not selectable).
  - Scanning a factory roll's barcode while destination is `'shop'` → toast «هذا الرول في المصنع. غيّر الوجهة أولاً» and the scan is rejected.

**Switching destination after adding lines:**
- If switching from `'shop'` → `'factory_direct'` while shop rolls are in the cart: confirm, then strip those lines.
- If switching from `'factory_direct'` → `'shop'` while factory rolls are in the cart: confirm, then strip those lines.
- Show an Arabic confirmation dialog before stripping.

**Reports:**
- Wherever invoices are listed (owner reports, sales history), add a filter chip for fulfillment destination.

## Acceptance

- POS surface has a destination toggle at the top of the cart
- Toggling to factory_direct hides shop rolls in the picker
- Toggling to shop shows factory rolls as disabled with «في المصنع»
- Submitting a factory_direct invoice with a shop roll in cart is impossible (UI prevents; server also rejects)
- After payment, every roll's `warehouse` is unchanged; every roll's `status` is `'sold'`
- Reports/lists can filter by destination
- `npm run typecheck && npm run build && npm run lint` is clean
- Migration rollback round-trip is clean

## Smoke checklist

- [ ] Default destination on a fresh POS load = `'shop'`
- [ ] Switch to factory_direct, scan a factory roll → added to cart
- [ ] Switch back to shop with a factory roll in cart → confirm dialog → cart cleared of factory lines
- [ ] Scan a shop roll while in shop mode → added normally
- [ ] Scan a factory roll while in shop mode → toast rejects
- [ ] Complete a factory_direct sale → invoice has `fulfillment_destination = 'factory_direct'`; rolls are `status: 'sold'` with `warehouse` unchanged
- [ ] Reports filter for fulfillment_destination returns the right set

## Commit

`feat(v2-phase-4): fulfillment destination — invoice-level shop vs factory direct, POS roll filtering`

## Stop here

Print "Phase 4 done — ready for Phase 5" and exit.
