---
name: Phase 6 — Codes Management Screen
description: v1.1 Phase 6 delivered: unified /inventory/codes page with 7-tab CRUD for all label codes
type: project
---

Phase 6 completed on 2026-05-11 and pushed to branch `v1.1/phase-6-codes-screen`.

**Fact:** /inventory/codes now manages 7 entity types in one tabbed page.
**Why:** Phase 6 goal was to give owners a single place to maintain all codes used on fabric labels and POS operations.
**How to apply:** Before Phase 7 (POS redesign), merge this branch so enriched label data (color, grade, brand, composition) is available to the POS roll-resolution logic.

### What was built
- `frontend/src/pages/inventory/CodesPage.tsx` — 7 tabs: colors, grades, brands, compositions, suppliers, damage-reasons, expense-categories
- Backend `GET /codes/:entity/:id/references` endpoint returning rolls linked to each code
- `listCodes` in codes.service now returns `usage_count` (correlated subquery) on every list response
- Inline create / edit / soft-delete / restore on Phase-5 entity tabs (no modal)
- Usage-count badge → click → Sheet side panel listing linked rolls
- Compositions tab: string-paste mode vs structured breakdown builder (with sum-to-100 warning)
- Brands tab: searchable supplier dropdown + product_line field
- Suppliers tab: full CRUD including arabic_warning_text textarea
- Settings-based tabs (damage / expense) use settingsApi; owner-only mutations
- Inventory hub card + sidebar sub-tab added

### Key decisions / quirks
- "التصنيفات (categories)" from the Phase 6 spec had NO database entity — mapped to الموردين (suppliers) instead
- Cancellation reasons tab was dropped; suppliers is the 5th Phase-5 entity
- lint script has a pre-existing Windows glob incompatibility — ignored; typecheck + build both pass cleanly
- Sheet side="left" used for the references panel (appears from left in RTL which is the document-end side)
