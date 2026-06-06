# Ramex Store — Permissions System

## Overview

Every backend endpoint and frontend route is gated by a permission check. The system is matrix-driven: a `role_permissions` table determines what each role can do by default, and a `user_permission_overrides` table allows per-user adjustments on top of those defaults.

---

## Roles

| Role | Description |
|------|-------------|
| `super_admin` | Unconditional access to everything. Manages users, permissions matrix, and `/settings`. Short-circuited in `can()` — no DB lookup. |
| `owner` | Full operational access (all resources). Cannot access `/settings`, users, or the permissions matrix. Matrix-controlled — losing a permission blocks the feature. |
| `shop_seller` | POS + customers + receive shipments + cash drawer daily ops. No HR, suppliers, advanced reports, or finance admin. |
| `factory_sender` | Creates outbound shipments and accesses factory warehouse stock. Hard-denied from approving shipments (code-enforced). |
| `accountant` | Full read access + HR management + suppliers + all reports. Can record expenses (`POST /expenses`) but cannot approve them. Cannot access admin-level cash operations. |

---

## Resources and Actions

### Core

| Resource | Actions | Description |
|----------|---------|-------------|
| `customers` | read, write | Customer records and ledger |
| `invoices` | read, write, approve | Sales invoices and POS |
| `returns` | read, write, approve | Returns and exchanges |
| `fabric_rolls` | read, write | Rolls, fabrics, colors, labels |
| `inventory` | read, write, approve | Stock, stocktakes, adjustments, damage events |
| `shipments` | read, write, approve | Factory shipments |
| `cash_drawer` | read, write, approve | Cash balance, movements, reconciliation; **approve** gates admin operations (opening balance, withdrawal, bank CRUD, treasuries overview, expense approval) |

### Reports

All report resources have a single `read` action. They are namespaced as `reports.<key>`:
`reports.general`, `reports.daily`, `reports.salesByPaymentMethod`, `reports.customerLedger`, `reports.outstandingOpenInvoices`, `reports.salesByFabricColor`, `reports.stocktakeInventory`, `reports.stockByWarehouse`, `reports.agingInventory`, `reports.shipmentsSummary`, `reports.returnsReport`, `reports.outstandingCheques`, `reports.cashFlow`, `reports.bankReconciliation`, `reports.expenses`, `reports.payrollSummary`, `reports.hrAdjustments`, `reports.auditLog`.

### HR

| Resource | Actions |
|----------|---------|
| `hr` | view, manage, salary.disburse, advance.create, deduction.create |

### Treasury

| Resource | Actions |
|----------|---------|
| `suppliers` | view, write, payments.write |

### Admin (super_admin only)

| Resource | Actions |
|----------|---------|
| `settings` | read, write |
| `users` | read, write |

---

## Hard-Deny Invariants

These denials are enforced in code before any DB lookup or per-user override. No admin action can override them.

| Role | Resource | Action | Reason |
|------|----------|--------|--------|
| `factory_sender` | `shipments` | `approve` | Factory staff must not accept their own shipments |

---

## Backend Enforcement

Every route has one of these guard types:

| Guard | Where used |
|-------|-----------|
| `requirePermission(resource, action)` | All operational routes — matrix-driven |
| `requireRole('super_admin')` | Settings, users CRUD, permissions matrix management |
| `requireRole('owner', 'super_admin')` | `POST /trigger-stale-check` (admin utility) |
| `requireAuth` | Pre-auth (`/login`, `/logout`) and personal-data endpoints (`/me/permissions`) |
| Inline `can()` | `POST /hr/adjustments` — action depends on request body (`advance.create` vs `deduction.create`) |

The route audit script (`backend/scripts/audit-routes.ts`) enforces these categories as a CI gate: any route classified as `NONE` (no detected guard) will fail the build.

### Special case: POST /expenses

`POST /expenses` uses a custom inline guard (`canCreateExpense`) because accountant has `cash_drawer.write = false` by design (they can record expenses but cannot reconcile cash). The guard:
1. If role is `accountant` → pass (accountant is explicitly authorised)  
2. Otherwise → check `cash_drawer.write` via `can()` (respects per-user overrides)

---

## Frontend Enforcement

### Route gating

Every page route in `App.tsx` is wrapped in `<PermGate resource="...">`. If `canSee(resource)` returns false, the user is redirected to `/no-access`.

`canSee(resource)` returns true if `can(resource, 'read') || can(resource, 'view')` — this handles resources whose read-equivalent action is `view` (hr, suppliers).

### Navigation hiding

`visibleNav(role, can)` in `nav.config.ts` filters out nav items where either:
- `visibleTo` does not include the user's role, **or**
- `permission` is set and `canSee(permission)` returns false

### Inline hiding

The `<Can resource action>` component renders its children only when `can(resource, action)` is true. Use it to hide buttons/columns the user cannot act on.

### Home redirect

If a user has no accessible feature pages (beyond the home route), `HomePage` redirects to `/no-access`.

---

## Source of Truth

**`shared/permissions/catalog.ts`** is the single source of truth for:
- `PermAction` union type
- `RESOURCE_GROUPS` — all resources and their valid actions
- `ROLE_DEFAULTS` — default permission matrix for all roles
- `HARD_DENY` — code-enforced absolute denials

The frontend imports from this file directly via the `@shared/*` path alias. The backend mirrors the data inline in each seed migration (TypeScript `rootDir` constraint prevents cross-package runtime imports). The parity script detects any divergence.

---

## Migrations

| Migration | Description |
|-----------|-------------|
| 070 | Initial accountant role seed |
| 072 | Full role_permissions seed for owner, shop_seller, factory_sender; fills missing rows for accountant |
| 073 | Adds `cash_drawer.approve` for all roles |

Migrations use `onConflict(['role','resource','action']).ignore()` — existing admin customisations are never overwritten. A `_seed_audit_NNN` table tracks inserted IDs for safe rollback.

---

## Adding a New Permission

1. Add the action to the resource's `actions` array in `shared/permissions/catalog.ts`
2. Add default rows for every role in `ROLE_DEFAULTS`
3. Create a new migration (copy migration 073 pattern)
4. Add `requirePermission(resource, action)` to the relevant backend route(s)
5. If the action needs to hide UI elements, wrap them in `<Can resource={resource} action={action}>`
6. Run `npx tsx backend/scripts/audit-routes.ts` to verify no regressions

---

## Permissions API

`GET /api/users/me/permissions` — returns the resolved permission set for the current user:

```json
{ "all": false, "permissions": { "invoices": { "read": true, "write": true, "approve": false } } }
```

`super_admin` never hits the API — the frontend sets `{ all: true }` immediately on login.

---

*Last updated: 2026-06-07 — Phase 5 (Hardening)*
