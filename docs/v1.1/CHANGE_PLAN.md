# RMX Store v1.1 — Change Plan

## Context

RMX Store fabric branch ERP `v1.0.0` is live on Hostinger (Postgres 16 + Knex + TypeScript backend, React frontend, Cairo TZ, Arabic RTL). 11 phases shipped, tagged, stable. The owner has requested 5 changes:

1. Fabric roll label — capture all fields shown on the supplier sticker (image 3) and print them when a roll is added; same data shows on the POS when the barcode is scanned.
2. A single Codes management screen (colors, fabric grades, brands, compositions, categories, damage reason codes, expense categories).
3. *(reserved)* — owner skipped this number in the request.
4. Open Invoices workflow — UI controls are missing in production, so the deposit-and-pickup flow is not driveable. 7-day stale → Owner notification (already in v1.0.0 backend per Phase 9, but unverified end-to-end).
5. Cash treasury vs Bank treasury — InstaPay routing should land in bank, current state unverified.

Plus two visual changes:
- Whole-app navigation rebuilt around the Verint-style hub pattern (left rail + top sub-tabs + multi-column hub landing). **Layout only — no theme or color changes.**
- Full POS redesign — modern, sleek, recognisably Ramex but a clear upgrade. 3 design directions to be presented in chat before code is touched.

## Phase sequencing

| # | Phase | Depends on | Notes |
|---|---|---|---|
| 1 | UI Foundation — `frontend-design` skill + Verint-style nav | nothing | Pure layout, no logic |
| 2 | Investigation Sweep (Playwright MCP) | Phase 1 nav so screenshots reflect new shell | Output: markdown report at `docs/investigations/2026-XX-XX-open-invoices-instapay.md` |
| 3 | Open Invoices fix | Phase 2 report | Prompt generated after Phase 2 lands |
| 4 | Treasury display + InstaPay verification | Phase 2 report | Prompt generated after Phase 2 lands |
| 5 | Fabric label — schema, codes tables, print (thermal + A4) | Phase 1 | Independent of investigation |
| 6 | Codes management screen | Phase 5 (uses new tables) | Single page, 7 entity types |
| 7 | POS Redesign + enriched scan display | Phase 5 (label data must exist), Phase 6 (codes managed) | Design direction picked in chat first |

**Phases 3 and 4 are not pre-written.** After Phase 2 produces its investigation report, run the generator prompt at `docs/v1.1/phase-3-4-generator.md` against that report to produce the implementation prompts.

**Phase 7 has a chat-mode gate.** Before the implementation prompt is finalised, 3 design directions are presented in chat, owner picks one, the picked direction is filled into the placeholder block in `docs/v1.1/phase-7-pos-redesign.md`.

## Universal constraints

These apply to every phase. Each phase prompt restates the relevant ones so it's standalone, but document them once here for reference.

**Stack invariants:**
- Backend: Node.js + TypeScript, Express-style routes, Knex migrations only (no Prisma)
- DB: Postgres 16, snake_case columns, Cairo TZ, all timestamps stored UTC and rendered Cairo
- Frontend: React + TypeScript, RTL only (no LTR fallback), Arabic labels only
- Auth: existing JWT system + permissions matrix in `Settings`; use `permissionsService.can()` — never inline role checks
- Branch isolation: every query that touches branch-scoped data filters by branch
- Migrations: numbered sequentially, reversible (`up`/`down` both implemented), Claude Code reads `migrations/` and picks the next number

**UI/UX skill constraint (hard rule):**

> Every UI- or UX-touching phase MUST invoke the `ui-ux-pro-max` skill at the start of work, and re-invoke it for each major UI section. No UI code is written without consulting the skill first.
>
> **Note (2026-05-11):** the original Phase 1 prompt named the package `@nextlevelbuilder/uipro`, which does not exist on npm. The actual package is `uipro-cli` (v2.2.3, by viettranx), installed globally via `npm install -g uipro-cli` and initialised with `uipro init --ai claude`. The init dropped the `ui-ux-pro-max` skill at `.claude/skills/ui-ux-pro-max/`, which is the active skill for the entire v1.1 sequence. The pre-existing `frontend-design` skill remains available as a secondary reference.

Phases that are subject to this rule: **1, 5 (item form + print preview), 6, 7, plus any UI work generated for 3 and 4.**
Phase 2 is investigation-only (Playwright reads the existing UI) and does NOT invoke the skill.

**Process invariants:**
- Each phase is a single Claude Code session, revertable with `git revert`
- Commit message format: `feat(v1.1-phase-N): <summary>`
- Every phase ends with: `npm run typecheck && npm run build && npm run lint` clean + smoke checks
- No new npm dependencies without justification stated in the commit body
- Existing v1.0.0 features must not regress — the existing test suite stays green

## Going live

After all 7 phases land:
- Tag `v1.1.0`
- Backup production DB
- Deploy via existing Dokploy pipeline
- Run smoke against production
- Owner walkthrough for: open-invoice workflow, treasury split visibility, label printing, codes screen, redesigned POS

This document is the index. The implementation prompts are alongside it under `docs/v1.1/`.
