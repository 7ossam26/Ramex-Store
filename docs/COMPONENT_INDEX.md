# RMX Store — Component Index

> Single source of truth for the shared UI components landed across the
> `rmx-new-ui` redesign cycle (Phases 1–7). Use this index before writing
> a new component — if something close exists here, extend it instead.
>
> Tokens, motion, and spacing scales: [`design-system/MASTER.md`](../design-system/MASTER.md).
> Re-Skin Standard reference: [`RMX_UI_Redesign_Plan.md`](../RMX_UI_Redesign_Plan.md).

---

## App shell (Phase 2)

| Component | Path | Role |
|---|---|---|
| `AppShell` | [`components/AppShell/AppShell.tsx`](../frontend/src/components/AppShell/AppShell.tsx) | Root layout: TopBar + Rail + main + Flyout + MobileDrawer + CommandPalette. Owns global ⌘K listener. |
| `TopBar` | [`components/AppShell/TopBar.tsx`](../frontend/src/components/AppShell/TopBar.tsx) | Sticky top bar (h-14/h-13). RTL leading: hamburger (mobile), RMX wordmark, store name, page title cross-fade. RTL trailing: ⌘K trigger, NotificationBell, UserMenu. |
| `Rail` | [`components/AppShell/Rail.tsx`](../frontend/src/components/AppShell/Rail.tsx) | Vertical right-side icon rail (RTL). 64px wide. `role="navigation"`. Active pill + 2px accent indicator on RTL leading edge. Inline `RailTooltipWrapper` for chrome-tinted hover labels. |
| `Flyout` | [`components/AppShell/Flyout.tsx`](../frontend/src/components/AppShell/Flyout.tsx) | Verint-pattern click-only flyout from rail. `role="menu"`. Flat or grouped list rendering. Dismisses on ESC, outside click, route change. |
| `MobileDrawer` | [`components/AppShell/MobileDrawer.tsx`](../frontend/src/components/AppShell/MobileDrawer.tsx) | `<` lg slide-over drawer. `role="dialog" aria-modal="true"`. Accordion expansion for parents — no nested flyouts on mobile. |
| `CommandPalette` | [`components/AppShell/CommandPalette.tsx`](../frontend/src/components/AppShell/CommandPalette.tsx) | ⌘K / Ctrl+K route palette. Fuzzy match Arabic + Latin, diacritic-insensitive. Recent (last 5) persisted in `localStorage` key `rmx:cmdk:recent`. |

Navigation config: [`navigation/nav.config.ts`](../frontend/src/navigation/nav.config.ts) is the central nav source. Settings sub-nav: [`navigation/settings.config.ts`](../frontend/src/navigation/settings.config.ts).

---

## Shared layout helpers (kept from Phase 0)

| Component | Path | Role |
|---|---|---|
| `HubLanding` | [`components/Layout/HubLanding.tsx`](../frontend/src/components/Layout/HubLanding.tsx) | Card grid for section landings (Items, Inventory, Treasury, Invoices/Returns, Reports). Stagger entry, hover lift. |
| `OfflineToast` | [`components/Layout/OfflineToast.tsx`](../frontend/src/components/Layout/OfflineToast.tsx) | Full-width red banner when the online-status provider reports offline. Hidden on print. |
| `UserMenu` | [`components/Layout/UserMenu.tsx`](../frontend/src/components/Layout/UserMenu.tsx) | Avatar + dropdown (profile / logout). |

The deprecated old shell (`Layout/AppShell.tsx`, `Layout/LeftRail.tsx`, `Layout/MobileNavDrawer.tsx`, `Layout/SectionShell.tsx`, `Layout/TopHeader.tsx`, `Layout/nav-config.ts`) was removed in Phase 7.

---

## Shared primitives (Phase 7 — extracted from inline use)

| Component | Path | Role |
|---|---|---|
| `Toast` | [`components/Toast.tsx`](../frontend/src/components/Toast.tsx) | Bottom-of-viewport notification. Tones: `success`/`danger`/`warning`/`info`. Optional auto-dismiss + progress bar, optional X close button. `role="alert"` (danger/warning) or `role="status"` (success/info). Survives `data-motion="reduced"`. |
| `Tooltip` | [`components/Tooltip.tsx`](../frontend/src/components/Tooltip.tsx) | Delayed (400ms default) light-surface tooltip. Placements: `top`/`bottom`/`start`/`end`. The dark-chrome rail tooltip stays inline in Rail.tsx. |
| `Badge` | [`components/Badge.tsx`](../frontend/src/components/Badge.tsx) | Solid-color count / label indicator (NotificationBell unread count, inline tags). Distinct from `StatusPill`: Badge is solid + count-focused, StatusPill is subtle + status-focused. |
| `Skeleton` + `CardSkeleton` | [`components/Skeleton.tsx`](../frontend/src/components/Skeleton.tsx) | Base shimmer block + card-shaped composite. Table-shaped skeleton lives in `TableSkeleton.tsx`. |
| `TableSkeleton` | [`components/TableSkeleton.tsx`](../frontend/src/components/TableSkeleton.tsx) | Header + N rows × M columns of shimmer placeholders. Used by every list page during initial load. |
| `EmptyState` | [`components/EmptyState.tsx`](../frontend/src/components/EmptyState.tsx) | 64×64 icon slot, Arabic title, optional description and CTA. Bordered card or embedded variant. |
| `ErrorBanner` | [`components/ErrorBanner.tsx`](../frontend/src/components/ErrorBanner.tsx) | `danger-subtle` banner with `role="alert"` + optional retry button. |
| `StatusPill` | [`components/StatusPill.tsx`](../frontend/src/components/StatusPill.tsx) | Pill-radius status indicator. Tones: `success`/`warning`/`danger`/`info`/`neutral`. |
| `FilterChip` | [`components/FilterChip.tsx`](../frontend/src/components/FilterChip.tsx) | Toggleable pill chip for filter rows. Filled accent when active, outlined when inactive. 75ms color tween. |
| `TableFilterBar` | [`components/TableFilterBar.tsx`](../frontend/src/components/TableFilterBar.tsx) | Search input + filter dropdowns + result count strip above tables. |
| `PageHeader` | [`components/PageHeader.tsx`](../frontend/src/components/PageHeader.tsx) | Section title + one-line description + trailing actions slot. Used by every page that isn't a hub landing. |
| `FormField` | [`components/FormField.tsx`](../frontend/src/components/FormField.tsx) | Label above + input + helper / error below. Used by every create/edit form. |
| `ResponsiveDialog` | [`components/ResponsiveDialog.tsx`](../frontend/src/components/ResponsiveDialog.tsx) | Dialog on desktop, bottom-sheet on `< md`. Wraps shadcn Dialog/Sheet. |
| `ResponsiveTable` | [`components/ResponsiveTable.tsx`](../frontend/src/components/ResponsiveTable.tsx) | Table on desktop, stacked-cards on `< md`. Per-row 3-dot action menu. |
| `MobileFilterSheet` | [`components/MobileFilterSheet.tsx`](../frontend/src/components/MobileFilterSheet.tsx) | Slide-up sheet for filter controls on mobile. |
| `NotificationBell` | [`components/NotificationBell.tsx`](../frontend/src/components/NotificationBell.tsx) | Bell + popover (desktop) / top-sheet (mobile) for unread notifications. Uses `Badge` for the unread count. |
| `Code128` | [`components/Code128.tsx`](../frontend/src/components/Code128.tsx) | jsbarcode wrapper. Renders barcodes with intentional hex literals (`#000`/`#fff`) for guaranteed scan contrast. |
| `ScannerInput` | [`components/ScannerInput.tsx`](../frontend/src/components/ScannerInput.tsx) | Barcode input — keyboard primary, ZXing camera fallback. |
| `ProtectedRoute` | [`components/ProtectedRoute.tsx`](../frontend/src/components/ProtectedRoute.tsx) | Auth gate around `<AppShell>`. Redirects to `/login` on 401 or missing token. |

---

## shadcn primitives

In [`components/ui/`](../frontend/src/components/ui/). Generated via shadcn/ui (new-york style, Radix-based). Consumed directly by the components above.

| Primitive | Path | Notes |
|---|---|---|
| `Button` | [`ui/button.tsx`](../frontend/src/components/ui/button.tsx) | cva variants: `default`/`outline`/`ghost`/`accent`. Sizes `default`/`sm`/`lg`. `focus-visible:ring-2 ring-ring`. |
| `Card` | [`ui/card.tsx`](../frontend/src/components/ui/card.tsx) | Header / Title / Content sub-parts. |
| `Dialog` | [`ui/dialog.tsx`](../frontend/src/components/ui/dialog.tsx) | Radix dialog primitive — auto-handles ESC and focus trap. |
| `DropdownMenu` | [`ui/dropdown-menu.tsx`](../frontend/src/components/ui/dropdown-menu.tsx) | Radix dropdown — used by UserMenu. |
| `Input` | [`ui/input.tsx`](../frontend/src/components/ui/input.tsx) | Plain styled `<input>` — `focus-visible:ring-2 ring-ring`. |
| `Label` | [`ui/label.tsx`](../frontend/src/components/ui/label.tsx) | Radix label. |
| `Sheet` | [`ui/sheet.tsx`](../frontend/src/components/ui/sheet.tsx) | Radix dialog with directional slide-out — backs NotificationBell mobile sheet, MobileFilterSheet. |

---

## Pages — page-local composites

Some pages own composites that are too specific to lift into shared:

| Composite | Path | Why it stays local |
|---|---|---|
| `ReportShell` + `ReportTable` | [`pages/reports/ReportShell.tsx`](../frontend/src/pages/reports/ReportShell.tsx) | Reports-only layout: filter bar (date range presets + custom range) + export buttons + chart slot + table slot. |
| `SecondaryReportChart` | [`pages/reports/SecondaryReportChart.tsx`](../frontend/src/pages/reports/SecondaryReportChart.tsx) | Recharts theming layer. Uses concrete hex literals (Recharts does not read CSS variables) mapped 1:1 to MASTER.md tokens. |
| `SavedToast` | inside [`pages/settings/SettingsPage.tsx`](../frontend/src/pages/settings/SettingsPage.tsx) | 3-line thin wrapper around shared `Toast` for "تم الحفظ بنجاح". Could be a constant if reused. |
| `RailTooltipWrapper` | inside [`components/AppShell/Rail.tsx`](../frontend/src/components/AppShell/Rail.tsx) | Chrome-surface tooltip variant. Lives next to Rail so its dark styling stays purpose-built. Other surfaces use the generic `Tooltip` primitive. |
