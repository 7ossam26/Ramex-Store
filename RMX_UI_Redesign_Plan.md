# RMX Store — UI/UX Overhaul

Save this file as `RMX_UI_Redesign_Plan.md` at the repo root before running Phase 1. Every prompt below references it.

**Umbrella branch:** `rmx-new-ui`.
**All work stays inside this branch. Never merge `rmx-new-ui` into `main` in any phase. Never push to `main` in any phase.** Each phase opens a PR into `rmx-new-ui`.
**Skill:** `ui-ux-pro-max` (installed).

---

## How to use

1. Commit this file to the repo root.
2. Paste the code block under each phase heading into Claude Code, one at a time.
3. Merge phase N's PR into `rmx-new-ui` before pasting N+1.
4. Phase 1 will pause and ask you to pick a palette — be available.

---

## Reference

### Decisions

| Decision | Choice |
|---|---|
| Layout | RTL + vertical right-side icon rail. Verint-style click-triggered flyout for children. |
| Nesting | 2 visual levels max. Level-3 IA (Reports → تقارير فرعية → 9 items) renders as grouped lists in the same flyout, not cascades. |
| Settings | Exception: keeps its own rail icon AND its own 3-column internal layout. Re-skinned, not restructured. |
| Logo | RMX mark in BOTH places: square icon-crop at top of rail + horizontal lockup in top bar next to "رامكس ستور". |
| Logo variants | Dark (original black) for light surfaces, light (inverted white) for dark chrome. No mark redraw. |
| IA source of truth | The codebase. Phase 1 crawls routes; screenshots are reference only. |
| Trigger | Click only. No hover triggers. |
| Global search | Top-bar `⌘K` / `Ctrl+K` palette. Replaces sidebar search. |
| Typography | IBM Plex Sans Arabic + IBM Plex Sans (Latin/digits). Self-hosted. Weights 300–700. |
| Motion | Subtle-to-moderate across the app. POS runs motion-reduced. `prefers-reduced-motion: reduce` always honored. |
| Motion library | Picked in Phase 2 based on stack. |
| Dark mode | Out of scope. |
| Responsive | Required. < md = rail collapses to slide-over drawer. |
| Palette | Picked in Phase 1 from 3 generated candidates. |

### Re-Skin Standard (Phases 3–6 follow this)

**Visual**
- All colors and fonts from tokens. Zero hex literals in component code.
- Cards: token `radius-lg`, `surface-elevated`, 1px `border-subtle`, shadow `sm` default → `md` on hover.
- Section headers: title `text-3xl` weight 600 + one-line subhead `text-muted text-sm`.
- Tables: sticky header, zebra rows via `surface-row-alt`, row hover, per-row 3-dot action menu, RTL column order.
- Inputs: `radius-md`, 1px `border-default`, 2px `accent` focus ring, label above (`text-sm` weight 500), helper below (`text-tertiary`).
- Buttons: primary `accent` fill, secondary `surface-elevated` + border, tertiary text-only. Explicit hover/active/focus/disabled/loading states.
- Currency: value `text-xl`+ weight 600, "ج.م" suffix `text-tertiary` smaller.
- Status badges: pill, token surface (`success-subtle`/`warning-subtle`/`danger-subtle`/`info-subtle`), matching text color.

**Motion (full budget — POS overrides)**
- Page enter: fade + 8px translateY, 200ms decelerate.
- Card grids: stagger 60ms / 240ms each.
- Hover lift on interactive cards: 2px translate, shadow sm → md, 150ms.
- Numbers: tick up 0 → value over 600ms ease-out-cubic. Skip if value is 0.
- Tables: row hover instant; first 10 rows stagger 30ms on initial load only.
- Inputs: 75ms color tween on focus.
- Tabs: indicator slides 200ms emphasized.
- Toasts: slide from top-leading-edge, 200ms decelerate. Auto-dismiss with progress bar.

**States (mandatory for every surface)**
- Loading — skeleton matching final layout, CSS shimmer.
- Empty — 64×64 illustration slot, one-line Arabic message, optional CTA.
- Error — `danger-subtle` surface, message, retry button. Toast for transient errors.

**Responsive**
- ≥ lg: full layout.
- md–lg: rail visible, multi-col grids collapse.
- < md: rail hidden, drawer from top-bar hamburger, single-column layouts; tables become stacked cards OR scrollable (document choice per table in PR).

**Constraints**
- No data fetching / route / API changes.
- Tokens only. No inline styles for color/spacing/type.
- RTL preserved. No `dir="ltr"` overrides.
- Honor `prefers-reduced-motion: reduce` globally.

**Pre-PR self-check**
- Read your own diff.
- Lint + typecheck pass.
- Boot dev server, click every changed surface.
- Test at 360px / 768px / 1440px.
- Keyboard nav works on every interactive element.
- Reduced-motion actually disables decorative motion.

### RTL cheatsheet
- Logical CSS properties: `margin-inline-start`/`-end`, `padding-inline-*`, `border-inline-*`, `inset-inline-*`. Not `left`/`right`.
- Flexbox `row` auto-reverses visual order in RTL — desired. Use `row-reverse` only when you actually want LTR ordering inside RTL.
- Directional icons (chevron, arrow): `transform: scaleX(-1)` or directionally-neutral.
- Numeric input values stay LTR even in RTL: `unicode-bidi: plaintext` on the input.
- Slide animations: animate `inset-inline-start` or use transforms with dir-aware sign. Framer Motion `x` respects parent `dir="rtl"`.
- Mirror everything: scroll shadows, dropdown anchors, tooltip placement, drawer slide side. Test at `dir="rtl"`.

### Skill invocation
- Generator: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system [-p "Project Name"] [--persist]`.
- Use `--persist` ONCE in Phase 1 with the chosen palette to write `design-system/MASTER.md`.
- Per-page invocation pattern in later phases: "I am building the [Page Name] page. Please read `design-system/MASTER.md`."

---

# Phase Prompts

## Phase 1 — Foundations

```
You are working on the Ramex Store codebase — an RTL Arabic POS/inventory web app. Read `RMX_UI_Redesign_Plan.md` at the repo root first for full context (decisions, re-skin standard, RTL cheatsheet, skill invocation). Activate the ui-ux-pro-max skill.

Goal: discover the codebase, generate the design system, land tokens + fonts + logo assets. No component re-skinning this phase.

Setup
1. `git status` — confirm clean tree. If not, stop and ask.
2. Verify `.claude/skills/ui-ux-pro-max/SKILL.md` exists. If missing, run `npm install -g uipro-cli && uipro init --ai claude`.
3. From the default branch, create the umbrella branch if missing: `git checkout -b rmx-new-ui` and push. Then `git checkout -b phase-1/foundations`.

PART A — Audit

Produce `docs/RMX_REDESIGN_AUDIT.md` covering:
- Stack: framework + version, build tool, package manager, Node, TypeScript or not, test framework, lint/format.
- Routing pattern + file paths.
- AppShell / Layout components — concrete paths for top bar, rail, page container.
- Existing design tokens / theme files / Tailwind config — or explicit "none".
- Fonts — what's loaded, how, self-hosted or CDN.
- UI primitives — Button, Input, Card, Modal, Table, Tabs, Tooltip, Badge, Drawer, etc. — paths and library origin.
- Motion library if any.
- i18n + RTL pattern.
- Asset pipeline.
- State management + store locations.
- API layer PATTERN (not endpoints) — what must not be touched.
- IA crawl: full 3-level nested route tree mapped to source files. Cross-check against expected top-levels: الرئيسية / نقطة البيع / الأصناف / المخزون / الطلبيات / العملاء / الفواتير والمرتجعات / الخزينة / التقارير / الموافقات / الإعدادات. Flag mismatches. Be explicit about level-3 groupings (Reports تقارير فرعية, Settings sub-pages).
- Hardcoded color / font / inline-style sites — grep counts + sample paths.
- Build/dev/test/lint commands.
- Risks & entanglements.
- Open Questions section.

Commit: `chore(audit): codebase discovery`. Do not modify any source file outside `docs/`.

PART B — Design system candidates

Run the skill generator three times with these directional briefs:
1. Warm Editorial — deep midnight navy chrome, terracotta/clay accent, sage positive, warm-white surface.
2. Cool Techy — deep ink/charcoal chrome, electric indigo accent, cyan positive, cool off-white surface.
3. Earthy Studio — espresso chrome, ochre accent, olive positive, oat/cream surface.

Command:
`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "pos inventory dashboard arabic rtl factory owner <direction keywords>" --design-system -p "Ramex Store"`

Produce `docs/design-candidates.md` with: full hex values per palette (surface / chrome / text / text-muted / text-tertiary / border / accent / accent-hover / success / warning / danger), one paragraph of feel per palette, inline swatch grid.

STOP and ask the user to pick one of the three. Do not continue until they answer.

PART C — After user picks

1. Re-run with chosen direction and `--persist -p "Ramex Store"` → writes `design-system/MASTER.md`.
2. Translate MASTER.md into token files in the project's existing format (CSS vars or theme config — match audit findings):
   - Colors
   - Spacing scale: 4/8/12/16/20/24/32/40/48/64/80/96
   - Radius: sm 4 / md 8 / lg 12 / xl 16 / 2xl 24 / pill 9999
   - Shadow: xs / sm / md / lg / xl
   - Motion: durations 75/150/200/300/500ms, easings (standard, decelerate, accelerate, emphasized)
   - Breakpoints: sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536
   - Z-index: base 0 / dropdown 1000 / sticky 1100 / overlay 1200 / modal 1300 / popover 1400 / toast 1500
   - Typography scale with line-heights and weights
3. Fonts: self-host IBM Plex Sans Arabic (300/400/500/600/700) + IBM Plex Sans (400/500/600/700) under `public/fonts/` (or project equivalent). `@font-face` with `font-display: swap` and correct `unicode-range`. Wire as default family.
4. Logos:
   - `public/brand/rmx-mark-dark.svg` — supplied black wordmark, unchanged
   - `public/brand/rmx-mark-light.svg` — inverted (white fill)
   - `public/brand/rmx-icon-light.svg` — square ~32×32 viewBox icon-crop, light variant
   Inversion + crop only. Do not redraw.
5. Motion-reduced scope: `[data-motion="reduced"]` selector collapses durations to 1ms and disables transform-based motion. Also handle `@media (prefers-reduced-motion: reduce)` globally with same effect.

Wire tokens into the global stylesheet entrypoint. Do NOT replace hardcoded values in component files yet.

Commits (suggested split):
- `feat(design-system): tokens for color, spacing, radius, shadow, motion, breakpoints, z-index, typography`
- `feat(typography): self-hosted IBM Plex Sans Arabic + Latin`
- `feat(brand): RMX logo assets`
- `feat(motion): motion-reduced scope and prefers-reduced-motion handling`
- `docs: MASTER.md and palette candidates`

PR: `Phase 1 — Foundations` → `rmx-new-ui`. Body: stack summary, palette chosen + why, links to audit + MASTER.md, rendered final swatches.

DO NOT push to or merge into main. All work stays in `rmx-new-ui`.
```

---

## Phase 2 — Global Shell

```
Phase 1 merged into `rmx-new-ui`. Read `RMX_UI_Redesign_Plan.md`, `docs/RMX_REDESIGN_AUDIT.md`, `design-system/MASTER.md`. Activate ui-ux-pro-max skill.

Goal: build TopBar + RTL right-side Rail + Verint-style Flyout + Mobile Drawer + ⌘K Command Palette. Wire into routing. Pages still render their current internals.

Setup
1. `git checkout rmx-new-ui && git pull`
2. `git checkout -b phase-2/app-shell`

Pick motion library based on stack from audit:
- React → `framer-motion`
- Vue → `motion` (Motion One) or `@vueuse/motion`
- Svelte → native transitions
- Vanilla → Motion One
Add the dep. Note choice in PR body.

TopBar (`AppShell/TopBar`)
- 56px desktop / 52px mobile. Background `chrome-surface`, 1px bottom border `border-subtle-on-dark`.
- RTL leading (right): RMX horizontal lockup light + separator + "رامكس ستور" + separator + page title (from router, 180ms cross-fade on route change).
- RTL trailing (left): ⌘K search-trigger (with shortcut hint), bell, profile icon, R-avatar dropdown.

Rail (`AppShell/Rail`)
- Vertical, pinned right. 64px wide. `chrome-surface`. Subtle left border.
- Top slot: RMX icon-light 32×32, links to dashboard.
- Below: 24×24 icons evenly spaced, 12px padding.
- Active: filled pill `surface-active-on-dark` + 2px accent indicator on RTL leading edge.
- Hover: 120ms tint brighten + tooltip after 400ms on trailing side, Arabic label.
- Click: leaf → navigate; parent (has children) → open Flyout, no navigate. SETTINGS EXCEPTION: navigates directly to /settings.

Flyout (`AppShell/Flyout`) — Verint pattern, RTL-mirrored
- Anchored to rail trailing edge (visually LEFT of the rail in RTL).
- 320px desktop, 100vw mobile.
- Header: section title + one-line description.
- Body: SINGLE panel, no cascades.
  - Flat children: vertical list of rows (icon 24×24 + label + one-line desc muted + trailing chevron RTL-aware).
  - Grouped children (e.g. التقارير with تقارير فرعية): top-level items first, then group label small-caps muted, then group items below.
- Open: 200ms slide+fade decelerate. Close: 150ms accelerate.
- Dismiss on: ESC, outside click, route change, opening another flyout, focus moving out via Tab.
- Focus trap: first row focused on open. Shift+Tab from first row returns to opening rail icon.
- ARIA: rail icon `aria-haspopup="menu"` `aria-expanded`; flyout `role="menu"`; rows `role="menuitem"`.

MobileDrawer (`AppShell/MobileDrawer`)
- < md: hide rail. TopBar shows hamburger on RTL leading edge.
- Full-height slide-over from right edge, 80vw max 360px.
- Renders rail items as vertical list WITH Arabic labels. Parents expand inline as accordions — no nested flyouts on mobile.
- Backdrop 40% dim, tap-to-close.
- 250ms slide decelerate, RTL-correct direction.

CommandPalette (`AppShell/CommandPalette`) — skeleton only
- Trigger: ⌘K / Ctrl+K or top-bar search button.
- Centered modal 600px wide, max 80vh, RTL.
- Input top (magnifier leading, placeholder "بحث عن صفحة..."), results list below scrollable.
- Scope this phase: route-navigation commands ONLY, sourced from the same nav config as the rail. Fuzzy match Arabic + Latin, diacritic-insensitive for Arabic.
- Keyboard: ↑↓ move, Enter navigate, Esc close, click-outside close.
- "Recent" at top when input empty. Persist last 5 in localStorage key `rmx:cmdk:recent`. No backend.
- Mark `// TODO Phase 7: action commands` — action commands out of scope.

Navigation config
- Create `src/navigation/nav.config.ts` (or framework equivalent).
- Shape: `NavTop = { id, labelAr, descAr?, icon, route, children?: NavGroup[] }`, `NavGroup = { groupLabelAr?, items: NavLeaf[] }`, `NavLeaf = { id, labelAr, descAr?, icon, route }`.
- Seed from `docs/RMX_REDESIGN_AUDIT.md` IA section — audit is authoritative, NOT screenshots.
- Active item derived from route.

Wiring
- Replace OLD AppShell wrapper at root layout with new shell.
- Pages render UNCHANGED inside `<main>`. Do not touch page bodies.
- Old sidebar component: unimport, mark `// DEPRECATED: removed in Phase 7`. Delete in Phase 7.

Motion (use tokens): Flyout 200/150ms decelerate/accelerate. Drawer 250/180ms. Page title cross-fade 180ms. Rail hover 120ms. Active indicator slide 200ms emphasized. Honor `prefers-reduced-motion: reduce`.

Acceptance
- [ ] TopBar on every route with logo + store name + page title (cross-fade on nav).
- [ ] ⌘K opens palette, filters routes, Enter navigates.
- [ ] Rail icons match nav config; active correct on every page.
- [ ] Leaf items navigate; parents open flyouts; Settings navigates directly.
- [ ] Flyout flat list for الأصناف; grouped list for التقارير.
- [ ] Flyout dismisses on all required triggers.
- [ ] < md: rail hidden, drawer from RTL leading edge, accordion expansion.
- [ ] RTL correct everywhere — slide directions, tooltip placement, focus order.
- [ ] No existing page broken — old content renders inside new shell.
- [ ] Lint + typecheck pass.

Constraints: no page body changes, no route changes, no API changes, no new component library, tokens only.

Commits (suggested):
- `feat(shell): top bar with logo, store name, page title, ⌘K trigger`
- `feat(shell): RTL right-side icon rail with active state and tooltips`
- `feat(shell): verint-pattern flyout with grouped lists`
- `feat(shell): mobile slide-over drawer with accordion expansion`
- `feat(shell): command palette skeleton with route navigation`
- `feat(nav): central navigation config seeded from audit IA`
- `chore(shell): wire new AppShell, deprecate old sidebar`

PR: `Phase 2 — Global Shell` → `rmx-new-ui`. Body: recordings of المخزون flyout, التقارير grouped flyout, mobile drawer, ⌘K palette. Note motion library added.

DO NOT push to or merge into main. All work stays in `rmx-new-ui`.
```

---

## Phase 3 — Primary Surfaces (Dashboard + POS)

```
Phases 1–2 merged into `rmx-new-ui`. Read `RMX_UI_Redesign_Plan.md` (Re-Skin Standard especially), `docs/RMX_REDESIGN_AUDIT.md`, `design-system/MASTER.md`. Activate ui-ux-pro-max skill.

Goal: re-skin Dashboard (الرئيسية) with full motion. Re-skin POS (نقطة البيع) with motion-reduced scope.

Setup
1. `git checkout rmx-new-ui && git pull`
2. `git checkout -b phase-3/primary-surfaces`

Apply Re-Skin Standard to both — visual, states, responsive — unless overridden below.

PART A — Dashboard

Content: section title "لوحة التحكم", subhead "ملخص اليوم". Six metric cards (إيرادات اليوم / عدد المبيعات / فواتير ملغاة / إجمالي المرتجعات / المصروفات / صافي الكاش اليوم) + two balance cards (رصيد الكاش / رصيد البنوك).

- Card header = small-caps muted label (`text-muted text-xs uppercase tracking-wide`). Value `text-3xl` weight 600. Meta below `text-tertiary text-xs`.
- Currency: number primary, "ج.م" suffix `text-tertiary` smaller, RTL-aware.
- Balance cards span 3 cols on lg.
- Number locale: match existing app. Document in PR.

Motion (full budget):
- Stagger card entry: 60ms between, 240ms each, decelerate, translateY 8px + opacity.
- Metric values tick up 0 → actual over 600ms ease-out-cubic. Skip if value is 0.
- Hover lift 2px, shadow sm → md, 150ms.

States: skeleton on load, "لا توجد بيانات اليوم بعد" + 64×64 illustration slot when empty, `danger-subtle` + retry on error.

Responsive: ≥ lg 6+2 cols / md 3+2 / < md single column.

PART B — POS (motion-reduced)

Wrap POS route root in `<div data-motion="reduced">` (or framework equivalent) so motion tokens collapse inside.

Content: top input bar (customer selector "اختر عميل", required sale price, "حفظ كفاتورة مفتوحة" checkbox). Two-pane: barcode scanner ("مرر الباركود") + cart ("السلة"). Empty cart "السلة فارغة" + disabled "الدفع" CTA. Footer keyboard hints.

- Barcode input prominent: 2px accent outline on focus, `text-xl` for entered codes, scan icon leading + 3-dot menu trailing.
- Cart panel header: cart icon + "السلة" + count badge.
- Cart rows: thumbnail 40×40 + name + qty stepper + unit price + line total + remove. 44px row height.
- Cart footer sticky: subtotal / discount / tax / total. Total `text-2xl` weight 600.
- "الدفع" CTA: full-width inside cart panel, primary, prominent.

Functional motion ONLY (everything else NO motion):
- Input focus: 75ms border color tween.
- Item added: row flashes `success-subtle` 200ms then resets. NO slide-in.
- Item removed: row dimmed 100ms then removed. NO slide-out.
- Successful scan: barcode flashes `success` border 150ms.
- Failed scan: barcode flashes `danger` border + 4px translateX shake, 2 cycles, 150ms total. THE intentional exception.
- No stagger, no hover-lift on cart rows, no tick-up on totals.

States:
- Loading: inline spinner only in the row being added. NEVER full skeleton.
- Empty: re-skinned "السلة فارغة" + 48×48 cart icon placeholder.
- Error: toast at BOTTOM of viewport, 4s auto-dismiss with progress bar.

Keyboard: preserve everything. Document existing shortcuts in PR. Focus ring 2px accent, highly visible. Focus returns to barcode after every scan (preserve).

Responsive: md–lg same two-pane narrower; < md stack — barcode top, cart below, footer sticky to viewport bottom.

Constraints (both):
- No changes to data layer, scanning logic, keyboard handlers, focus management, API calls.
- Tokens only, zero hex literals.

Acceptance
Dashboard:
- [ ] Tokens applied, stagger plays on mount, values tick up.
- [ ] Skeleton/empty/error reachable.
- [ ] 3 breakpoints render without horizontal scroll.

POS:
- [ ] Visually consistent with app but calmer/faster.
- [ ] No decorative motion.
- [ ] Error shake and success flash work.
- [ ] Mobile usable at 360px.
- [ ] Keyboard unchanged.
- [ ] Focus ring highly visible.

Both:
- [ ] `prefers-reduced-motion: reduce` disables decorative motion.
- [ ] Lint + typecheck pass.

Commits (suggested):
- `refactor(dashboard): tokens, typography, layout`
- `feat(dashboard): stagger entry, value tick-up, hover lift, states`
- `refactor(pos): tokens with motion-reduced scope`
- `feat(pos): functional feedback (success flash, error shake)`
- `feat(pos): mobile stacked layout`

PR: `Phase 3 — Primary Surfaces` → `rmx-new-ui`. Body: before/after of both at lg/md/sm, recordings of dashboard stagger and POS error shake. List preserved POS keyboard shortcuts.

DO NOT push to or merge into main. All work stays in `rmx-new-ui`.
```

---

## Phase 4 — Catalog, Inventory & Sales

```
Phases 1–2 merged. Read `RMX_UI_Redesign_Plan.md` (Re-Skin Standard especially), `docs/RMX_REDESIGN_AUDIT.md`, `design-system/MASTER.md`. Activate ui-ux-pro-max skill.

Goal: re-skin all business-CRUD surfaces.

Setup
1. `git checkout rmx-new-ui && git pull`
2. `git checkout -b phase-4/catalog-inventory-sales`

Surfaces (cross-reference audit for authoritative list):
- الأصناف — landing (3-card: إضافة توب / التوبات / إدارة الملصقات) + sub-pages.
- المخزون — landing (6-card: الخامات / حركات المخزون / الجرد / التسويات / أحداث التلف والفقد / التكويدات) + sub-pages.
- الطلبيات — list + detail.
- العملاء — list + detail + create.
- الفواتير والمرتجعات — landing (2-card: الفواتير / المرتجعات) + sub-pages.

Apply Re-Skin Standard universally. Specifics below.

Section landing pages:
- Standard card pattern (leading icon, title, one-line desc, trailing chevron RTL-aware).
- Standard stagger + hover lift.

Table sub-pages:
- Filter bar top: search input (leading icon), filter dropdowns, "نتائج: N" trailing.
- Table: sticky header, zebra rows, row hover, per-row 3-dot action menu.
- RTL column order: identifier leading (right), actions trailing (left).
- Standard pagination — preserve existing behavior.
- States: skeleton (8 placeholder rows), empty ("لا توجد عناصر بعد" + CTA where appropriate), error (`danger-subtle` banner + retry).
- Stagger on first 10 rows on initial mount only.
- Filter changes: 150ms fade between row states.

Status pills (for orders, invoices):
- `info-subtle` awaiting/in-progress, `success-subtle` completed/paid, `warning-subtle` action-needed, `danger-subtle` cancelled/failed.

Filter chip row (الفواتير):
- Pill toggles above table. Active filled `accent` white text, inactive outlined. 75ms color tween. RTL ordering.

Detail pages (orders, invoices, customers):
- Two-column desktop: line items / history (leading ~60%) + summary card (trailing ~40%, sticky on scroll).
- Summary: subtotal / discount / tax / total / status pill / action buttons.
- Mobile: stack — items first, summary collapses to sticky footer with total + primary action.

العملاء detail tabs (only those that already exist — don't add): History / Orders / Invoices / Notes. Tab indicator slides 200ms emphasized.

Forms:
- Standard form pattern. Labels above. Required asterisk in `danger`. Inline error `text-danger text-sm` 75ms fade-in.
- Save trailing edge desktop / full-width mobile. Cancel secondary leading the Save.
- Unsaved-changes warning ONLY if it already exists.

Constraints:
- Preserve all CRUD logic, API calls, status state machines, tab structure, filter logic, column data and order.
- Tokens only.

Acceptance:
- [ ] Every landing re-skinned with cards + stagger.
- [ ] Every table sub-page has filter bar + standard table + pagination + all states.
- [ ] Status pills + filter chips work on الطلبيات + الفواتير.
- [ ] Detail pages: two-column desktop / sticky-footer mobile.
- [ ] Tabs (where they exist) have sliding indicator.
- [ ] Forms re-skinned with validation patterns.
- [ ] Mobile: tables stack or scroll (document per table in PR).
- [ ] RTL correct.
- [ ] Lint + typecheck pass.

Commits (suggested):
- `refactor(items): re-skin الأصناف landing and sub-pages`
- `refactor(inventory): re-skin المخزون landing and sub-pages`
- `refactor(orders): re-skin الطلبيات list and detail`
- `refactor(customers): re-skin العملاء list, detail, create`
- `refactor(invoices): re-skin الفواتير والمرتجعات`
- `feat(tables): standard filter bar + skeleton + empty + error`
- `feat(forms): standard form patterns for create/edit`
- `feat(components): status pill + filter chip`

PR: `Phase 4 — Catalog, Inventory & Sales` → `rmx-new-ui`. Body: screenshots of each landing + one table sub-page + one detail page + one form, at lg and sm. Document table mobile pattern choices.

DO NOT push to or merge into main. All work stays in `rmx-new-ui`.
```

---

## Phase 5 — Treasury, Reports & Approvals

```
Phases 1–2 merged. Read `RMX_UI_Redesign_Plan.md` (Re-Skin Standard especially), `docs/RMX_REDESIGN_AUDIT.md`, `design-system/MASTER.md`. Activate ui-ux-pro-max skill.

Goal: re-skin finance + reporting surfaces. First chart introduction.

Setup
1. `git checkout rmx-new-ui && git pull`
2. `git checkout -b phase-5/treasury-reports-approvals`

Surfaces (cross-reference audit):
- الخزينة — landing (5-card: نظرة عامة على الخزائن / الخزنة الكاش / البنوك / المصروفات / التسوية اليومية) + sub-pages.
- التقارير — landing with prominent "التقرير اليومي" card + "تقارير فرعية" grouped grid of ~9 reports. Each sub-report = filterable view + chart + table.
- الموافقات — approval queue + per-item review.

Apply Re-Skin Standard. Specifics:

الخزينة tabular numerics:
- Apply `font-variant-numeric: tabular-nums` to every numeric cell across this tree. Add a `.tabular-num` utility or inline-apply.
- Balance values: `text-4xl` weight 600.
- Optional sparkline if data available — inline SVG, accent color, 600ms draw-in.

التسوية اليومية:
- Side-by-side "متوقع / فعلي / فرق" columns. Difference cell color: `success` zero, `warning` small delta, `danger` over threshold. Preserve existing threshold logic.

التقارير landing:
- "التقرير اليومي" full-width card, 2px accent left-border on RTL leading edge, visually distinct.
- "تقارير فرعية" group label small-caps muted above grid. 3-col grid lg, 2-col md, 1-col sm.

التقارير sub-pages:
- Filter bar (date range + dimensions) top.
- Chart middle. Token colors: primary `accent`, secondary `accent-2`, tertiary `accent-3` or neutral.
- Token tooltip, RTL-aware anchor flip.
- Chart loads with 600ms ease-out-cubic draw-in.
- Backing data table bottom with existing export buttons (no new export if none exists).

Chart library:
- If repo already has one (per audit), theme via tokens.
- If none: React → Recharts. Vue → Chart.js with vue-chartjs. Svelte → LayerChart or Chart.js. Document in PR.

الموافقات:
- Queue table with status pills per row (pending / approved / rejected).
- Per-row "مراجعة" opens detail.
- Detail: item info + context + comment field + accept (`success` primary) + reject (`danger` primary).
- Accept/reject: button inline spinner 200ms then row flashes `success-subtle` or `danger-subtle` 200ms before settling.
- History section shows past decisions.

Motion: standard + chart draw-in + approval-row flash on action.

Constraints:
- Preserve all report data/filter logic, currency formatting locale, threshold values, approval state machine.
- Tokens only.

Acceptance:
- [ ] الخزينة landing + all sub-pages re-skinned with tabular-nums.
- [ ] Balance values tick up.
- [ ] التسوية cell color-coding works correctly.
- [ ] التقارير landing has prominent daily + grouped sub-reports.
- [ ] Each sub-report page: filter bar + themed chart + backing table.
- [ ] Charts draw in on mount.
- [ ] الموافقات queue + detail review with accept/reject feedback flash.
- [ ] Mobile: charts readable, filter bars stack, tables scroll or stack.
- [ ] Lint + typecheck pass.

Commits (suggested):
- `refactor(treasury): re-skin landing, overview, cash, banks, expenses, reconciliation`
- `feat(treasury): tabular-num utility for finance tables`
- `refactor(reports): re-skin landing with grouped layout`
- `refactor(reports): re-skin sub-report pages`
- `feat(charts): token-themed chart library integration`
- `refactor(approvals): re-skin queue and detail review`

PR: `Phase 5 — Treasury, Reports & Approvals` → `rmx-new-ui`. Body: screenshots of each surface at lg and sm, chart screenshot, approval action recording. Note chart library choice.

DO NOT push to or merge into main. All work stays in `rmx-new-ui`.
```

---

## Phase 6 — Settings

```
Phases 1–2 merged. Read `RMX_UI_Redesign_Plan.md` (Re-Skin Standard especially), `docs/RMX_REDESIGN_AUDIT.md`, `design-system/MASTER.md`. Activate ui-ux-pro-max skill.

Goal: re-skin الإعدادات preserving its 3-column island layout.

Setup
1. `git checkout rmx-new-ui && git pull`
2. `git checkout -b phase-6/settings`

Settings keeps its existing 3-column desktop layout:
- Rail (right, from Phase 2 — unchanged)
- Settings sub-nav column (middle) — persistent vertical sub-nav
- Form content area (left)

Sub-pages (cross-reference audit for authoritative list):
- المعلومات العامة (logo path, address, phone, tax ID, receipt warning text)
- الضرائب
- نقطة البيع
- خزنة الكاش
- البنوك
- المستخدمون والصلاحيات
- أكواد الأسباب
- وقت تحديد اليوم
- النظام
- كودات الملصقات

Sub-nav column:
- Vertical list of settings sub-pages.
- Active: filled `surface-active` + 2px accent indicator on RTL leading edge.
- Inactive: `text-default` with hover tint `surface-hover`.
- Sourced from `src/navigation/settings.config.ts` (or framework equivalent).
- 240px wide desktop, sticky on scroll.
- Active indicator slides 200ms emphasized between items.

Form area:
- Standard form pattern from Re-Skin Standard.
- Save button: primary, sticky at bottom on long forms (`surface-elevated` + top border + padding `lg`).
- Success toast "تم الحفظ بنجاح" bottom of viewport, 3s auto-dismiss.
- Unsaved-changes warning ONLY if it already exists.

Mobile (< md):
- Sub-nav collapses to either: horizontal scroll chip row sticky under top bar, OR accordion above form. Match project's existing mobile-nav pattern from audit. Document choice in PR.
- Form area full-width.

Motion: standard, but NO stagger on form fields. Sub-nav indicator slides 200ms.

States: skeleton form on load, button spinner + form opacity reduce on save, validation per standard, save-level error banner top of form area.

Constraints:
- Preserve 3-column desktop layout.
- Preserve every form's field set, validation logic, permission-based hiding.
- Tokens only.

Acceptance:
- [ ] Settings rail icon navigates to /settings (Phase 2 behavior preserved).
- [ ] 3-column desktop layout: rail / sub-nav / form (right to left in RTL).
- [ ] Sub-nav active state correct on every sub-page with sliding indicator.
- [ ] Every form re-skinned: inputs, labels, validation, sticky save.
- [ ] Save toast appears on success.
- [ ] Mobile: sub-nav collapses correctly, form usable at 360px.
- [ ] RTL correct.
- [ ] Lint + typecheck pass.

Commits (suggested):
- `refactor(settings): re-skin 3-column island layout`
- `refactor(settings): re-skin all sub-page forms`
- `feat(settings): persistent sub-nav with sliding indicator`
- `feat(settings): save toast and form-level error banner`

PR: `Phase 6 — Settings` → `rmx-new-ui`. Body: screenshots of at least 4 different sub-pages at lg and sm. Note mobile sub-nav pattern choice.

DO NOT push to or merge into main. All work stays in `rmx-new-ui`.
```

---

## Phase 7 — Polish

```
Phases 1–6 merged into `rmx-new-ui`. Read `RMX_UI_Redesign_Plan.md`, `docs/RMX_REDESIGN_AUDIT.md`, `design-system/MASTER.md`. Activate ui-ux-pro-max skill.

Goal: cross-cutting sweep. States completeness, mobile audit, perf, a11y, dead code removal, closeout docs.

Setup
1. `git checkout rmx-new-ui && git pull`
2. `git checkout -b phase-7/polish`

1. States completeness
For every list/table/form/detail surface from Phases 3–6, verify all four states are reachable and consistent: loading, empty, error, success-toast. Add any missing per Re-Skin Standard.

2. Shared components
Extract and tokenize any per-surface inline implementations of: Toast, Modal/Dialog, Drawer (non-nav), Tooltip, Badge, Status pill, Filter chip, Skeleton variants, Date range picker, Empty-state component. Single source of truth per component.

3. Print / receipt views
- POS receipt printout: print-friendly variant (black on white, monospace for codes, RTL preserved).
- Invoice and daily report print views if they exist.
- Use `@media print` to override chrome → white surfaces / black text.

4. Mobile sweep
Open every page at 360px. Document anything broken. Fix. Verify drawer / flyout / palette work on touch. Verify all sticky elements behave.

5. Performance
- Fonts: woff2 self-hosted, `font-display: swap`, preload hints for primary weights only (400, 500, 600).
- Code split: confirm route-level chunks. Chart library lazy-loaded on Reports routes only.
- Logo SVGs: inlined or optimally cached.
- Animations: confirm no `top`/`left` animations — transform-only. No animations on hidden elements.
- Bundle size: before/after comparison in PR.

6. Accessibility
- Focus ring visible on every interactive element.
- Tab order correct in RTL on every page.
- ESC closes: flyout, mobile drawer, command palette, modals, drawers.
- ARIA: rail `role="navigation"`, flyout `role="menu"`, palette `role="dialog"`, modals `role="dialog"` + `aria-modal="true"`, tabs `role="tablist"`, tables proper `<th>` `scope`.
- Contrast: 4.5:1 body, 3:1 large text. Spot-check via skill's a11y check.
- `prefers-reduced-motion: reduce` honored — manually test by toggling OS setting.
- Form labels associated (`for`/`id` or wrapping).
- Error messages associated via `aria-describedby`.

7. Dead code
- Delete deprecated old sidebar (marked DEPRECATED in Phase 2).
- Delete orphaned styles, unused tokens, unused assets.
- Grep components for hex literals — convert to tokens or remove. Prove via grep output in PR.

8. Closeout docs
- Update `docs/RMX_REDESIGN_AUDIT.md` with Closeout section: final stack additions (motion lib, chart lib), final palette, tokens count + locations, known follow-ups.
- Add `docs/COMPONENT_INDEX.md`: shared components enumerated with one-line descriptions and paths.

Acceptance:
- [ ] All four states reachable on every surface.
- [ ] Shared components extracted and tokenized.
- [ ] Print views work for receipt, invoice, daily report.
- [ ] Every page renders correctly at 360 / 768 / 1440px.
- [ ] No regressions in bundle size beyond documented justified delta.
- [ ] All keyboard / ESC / focus rules pass.
- [ ] Contrast meets ratios.
- [ ] Reduced-motion verified.
- [ ] Old sidebar deleted.
- [ ] No remaining hex literals in component files (grep proves it).
- [ ] Closeout doc and component index added.
- [ ] Lint + typecheck pass.

Commits (suggested):
- `feat(states): complete loading/empty/error/success coverage`
- `refactor(components): extract and tokenize shared components`
- `feat(print): print-friendly views for receipt, invoice, daily report`
- `fix(mobile): mobile-viewport fixes from audit`
- `perf: font preload, route-level chunks, transform-only animations`
- `a11y: focus rings, ARIA, tab order, contrast, reduced-motion`
- `chore: remove deprecated sidebar and dead styles`
- `docs: redesign closeout and component index`

PR: `Phase 7 — Polish & Closeout` → `rmx-new-ui`. Body: bundle size delta, full screenshot grid all surfaces at lg + sm, list of anything intentionally deferred.

After this phase, `rmx-new-ui` is the final state. DO NOT merge `rmx-new-ui` into `main`. DO NOT push to `main`. The branch stays as-is until the user explicitly requests a merge.
```
