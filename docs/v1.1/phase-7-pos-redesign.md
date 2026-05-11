# Phase 7 — POS Redesign + Enriched Scan Display

> **Gate:** This prompt is incomplete until the design-direction block below is filled in. Three design directions are presented in chat first, the owner picks one, then the picked direction (description + key visual decisions + reference screenshots/Figma links) is pasted into the `## Picked design direction` section. **Do not run this prompt while that section still says `<<TO BE FILLED IN AFTER OWNER PICK>>`.**

---

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex migrations, Postgres 16, Cairo TZ
- Frontend: React + TypeScript, RTL only, Arabic labels only, Tailwind + shadcn/ui
- Auth: `permissionsService.can()` — never inline role checks
- Audit log on every sensitive write (sale, void, override, refund)
- No new npm dependencies without justification in the commit body
- UI work MUST invoke the `frontend-design` skill (see `docs/v1.1/CHANGE_PLAN.md`) at the start and for each major section

## Dependencies

- Phase 5 must have landed (label fields exist on `rolls` table; barcode scan returns the enriched payload)
- Phase 6 must have landed (codes tables populated; color/grade/composition/brand/category lookups available)

If either is missing, stop and surface that.

## Scope

Two distinct deliverables, in this order:

### 1. Enriched scan display

When a roll is scanned at POS (or matched by search), the cart row and the side detail panel must show every field captured on the supplier label (Phase 5). At minimum:
- Roll SR# (factory) + system roll ID
- Fabric (Arabic name) + composition breakdown
- Color (Arabic name) + color code
- Grade
- Width (cm) + Weight (kg)
- Brand, Category (if present)
- Price/kg + line total
- Sample-flag and any pickup/reservation status

This is informational — none of the existing sale logic changes. The cart row stays compact; full detail opens in a side panel or expandable drawer (per the picked design direction).

### 2. POS surface redesign

Reskin the entire `/pos` route per the picked design direction. Constraints regardless of direction:
- Discount-by-final-price calculator stays (Ziad enters target final price, system back-calculates % — see CORE_PLAN.md §6.5)
- Split payment UI (cash + InstaPay manual amounts) stays
- Customer-required-strict stays (no walk-in)
- Mid-sale customer creation stays
- Open invoice with deposit flow stays (the controls land here per Phase 3)
- Void, override (with audit), sample-toggle visibility stays
- Scanner input stays at top of cart, autofocus on mount, debounce as today
- All Arabic, all RTL, EGP with 2-decimal precision, Western digits

What changes is the visual surface, density, hierarchy, and affordance — not the business logic.

## Picked design direction

<<TO BE FILLED IN AFTER OWNER PICK>>

Format expected when filled:
- **Name:** (e.g., "Compact dual-pane")
- **One-paragraph description**
- **Layout sketch:** (left/right/top/bottom regions and what lives where)
- **Density target:** comfortable | dense | hybrid
- **Color/typography deltas:** must be `none` per the v1.1 brief unless owner explicitly approves a change
- **Reference screenshots / Figma links** (paths in repo or URLs)
- **Animations / micro-interactions** (if any)

## Acceptance

- Scanning a roll or searching for one shows the full label payload in the detail surface
- A complete sale (scan → discount → split payment → print receipt) is faster click-count than v1.0.0 baseline
- An open-invoice sale (deposit → save → reopen → final payment → mark delivered) works through the new POS surface without falling back to other screens
- A void with Owner approval still goes through the existing approval flow and audits correctly
- No regression in `npm run typecheck && npm run build && npm run lint`
- Smoke per the checklist below passes

## Smoke checklist

- [ ] Cash sale, single roll, normal price → receipt prints
- [ ] Cash sale, multiple rolls, target-final-price discount → receipt prints with correct discount %
- [ ] Split payment (cash + InstaPay) → cash drawer movement and bank vault movement both recorded
- [ ] Open invoice with deposit → roll status flips to `reserved` → reopen invoice → final payment → status flips to `closed_pending_pickup` → mark delivered → status flips to `completed` and roll status flips to `sold`
- [ ] Mid-sale customer creation works
- [ ] Sample-flagged roll respects per-item visibility toggle
- [ ] Void within window → Owner approval blocks the cart → after approval, void completes and audits
- [ ] Scan an unknown barcode → error toast `الطوب غير موجود`, cart unaffected
- [ ] All numeric displays use Western digits (0–9), all dates in Cairo TZ, all currency `ج.م`

## Commit

`feat(v1.1-phase-7): pos redesign + enriched scan display (<direction-name>)`
