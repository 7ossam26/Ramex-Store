/**
 * Ramex Store — Permissions Catalog (single source of truth)
 *
 * This file is the authoritative definition of:
 *   - All resources and their actions
 *   - Role defaults (what each role can/cannot do by default)
 *   - Hard-deny invariants (code-enforced, override-proof)
 *
 * Frontend: imports directly via @shared/* path alias.
 * Backend migration 072: data is mirrored inline (TypeScript rootDir constraint prevents
 *   direct cross-package import in tsc). The parity script detects any drift.
 * Backend parity script: imports this file via tsx (no rootDir restriction at runtime).
 */

// ─── Action types ────────────────────────────────────────────────────────────

/** All permission action values. Preserves existing DB enum values. */
export type PermAction =
  | 'read'
  | 'write'
  | 'approve'
  | 'view'
  | 'manage'
  | 'salary.disburse'
  | 'advance.create'
  | 'deduction.create'
  | 'payments.write';

// ─── Resource catalog ────────────────────────────────────────────────────────

export type ResourceDef = {
  key: string;
  actions: PermAction[];
  descriptionKey?: string;
};

export type ResourceGroup = {
  groupKey: string;
  resources: ResourceDef[];
};

export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    groupKey: 'core',
    resources: [
      { key: 'customers',    actions: ['read', 'write'],                    descriptionKey: 'customers' },
      { key: 'invoices',     actions: ['read', 'write', 'approve'],         descriptionKey: 'invoices' },
      { key: 'fabric_rolls', actions: ['read', 'write', 'manage'],          descriptionKey: 'fabric_rolls' },
      { key: 'accessories',  actions: ['read', 'write'],                    descriptionKey: 'accessories' },
      { key: 'inventory',    actions: ['read', 'write', 'approve'],         descriptionKey: 'inventory' },
      { key: 'shipments',    actions: ['read', 'write', 'approve'],         descriptionKey: 'shipments' },
      { key: 'cash_drawer',  actions: ['read', 'write', 'approve'],          descriptionKey: 'cash_drawer' },
      { key: 'returns',      actions: ['read', 'write', 'approve'],         descriptionKey: 'returns' },
    ],
  },
  {
    groupKey: 'reports',
    resources: [
      { key: 'reports.general',                 actions: ['read'] },
      { key: 'reports.daily',                   actions: ['read'] },
      { key: 'reports.salesByPaymentMethod',    actions: ['read'] },
      { key: 'reports.customerLedger',          actions: ['read'] },
      { key: 'reports.outstandingOpenInvoices', actions: ['read'] },
      { key: 'reports.salesByFabricColor',      actions: ['read'] },
      { key: 'reports.stocktakeInventory',      actions: ['read'] },
      { key: 'reports.stockByWarehouse',        actions: ['read'] },
      { key: 'reports.agingInventory',          actions: ['read'] },
      { key: 'reports.shipmentsSummary',        actions: ['read'] },
      { key: 'reports.returnsReport',           actions: ['read'] },
      { key: 'reports.outstandingCheques',      actions: ['read'] },
      { key: 'reports.cashFlow',                actions: ['read'] },
      { key: 'reports.bankReconciliation',      actions: ['read'] },
      { key: 'reports.expenses',                actions: ['read'] },
      { key: 'reports.payrollSummary',          actions: ['read'] },
      { key: 'reports.hrAdjustments',           actions: ['read'] },
      { key: 'reports.auditLog',                actions: ['read'] },
    ],
  },
  {
    groupKey: 'admin',
    resources: [
      { key: 'settings', actions: ['read', 'write'], descriptionKey: 'settings' },
      { key: 'users',    actions: ['read', 'write'], descriptionKey: 'users' },
    ],
  },
  {
    groupKey: 'hr',
    resources: [
      {
        key: 'hr',
        actions: ['view', 'manage', 'salary.disburse', 'advance.create', 'deduction.create'],
        descriptionKey: 'hr',
      },
    ],
  },
  {
    groupKey: 'treasury',
    resources: [
      {
        key: 'suppliers',
        actions: ['view', 'write', 'payments.write'],
        descriptionKey: 'suppliers',
      },
    ],
  },
];

/** Flat list of all resource keys — derived from RESOURCE_GROUPS. */
export const ALL_RESOURCE_KEYS = RESOURCE_GROUPS.flatMap((g) => g.resources.map((r) => r.key));

// ─── Role defaults ────────────────────────────────────────────────────────────

export type PermRow = { resource: string; action: string; is_allowed: boolean };
export type RoleDefaultsMap = Record<string, PermRow[]>;

/**
 * Default permissions for every non-super_admin role.
 * Migration 072 seeds these rows (onConflict.ignore — existing customisations are preserved).
 *
 * super_admin is unconditionally allowed via the short-circuit in can() and is not seeded here.
 */
export const ROLE_DEFAULTS: RoleDefaultsMap = {

  // ── Owner ──────────────────────────────────────────────────────────────────
  // Full operational access. settings + users are super_admin-only (always denied for owner).
  owner: [
    { resource: 'customers',    action: 'read',    is_allowed: true  },
    { resource: 'customers',    action: 'write',   is_allowed: true  },
    { resource: 'invoices',     action: 'read',    is_allowed: true  },
    { resource: 'invoices',     action: 'write',   is_allowed: true  },
    { resource: 'invoices',     action: 'approve', is_allowed: true  },
    { resource: 'returns',      action: 'read',    is_allowed: true  },
    { resource: 'returns',      action: 'write',   is_allowed: true  },
    { resource: 'returns',      action: 'approve', is_allowed: true  },
    { resource: 'fabric_rolls', action: 'read',    is_allowed: true  },
    { resource: 'fabric_rolls', action: 'write',   is_allowed: true  },
    { resource: 'fabric_rolls', action: 'manage',  is_allowed: true  }, // create/edit fabrics, colors, prices
    { resource: 'accessories',  action: 'read',    is_allowed: true  },
    { resource: 'accessories',  action: 'write',   is_allowed: true  },
    { resource: 'inventory',    action: 'read',    is_allowed: true  },
    { resource: 'inventory',    action: 'write',   is_allowed: true  },
    { resource: 'inventory',    action: 'approve', is_allowed: true  },
    { resource: 'shipments',    action: 'read',    is_allowed: true  },
    { resource: 'shipments',    action: 'write',   is_allowed: true  },
    { resource: 'shipments',    action: 'approve', is_allowed: true  },
    { resource: 'cash_drawer',  action: 'read',    is_allowed: true  },
    { resource: 'cash_drawer',  action: 'write',   is_allowed: true  },
    { resource: 'cash_drawer',  action: 'approve', is_allowed: true  },
    { resource: 'hr',           action: 'view',             is_allowed: true  },
    { resource: 'hr',           action: 'manage',           is_allowed: true  },
    { resource: 'hr',           action: 'salary.disburse',  is_allowed: true  },
    { resource: 'hr',           action: 'advance.create',   is_allowed: true  },
    { resource: 'hr',           action: 'deduction.create', is_allowed: true  },
    { resource: 'suppliers',    action: 'view',           is_allowed: true  },
    { resource: 'suppliers',    action: 'write',          is_allowed: true  },
    { resource: 'suppliers',    action: 'payments.write', is_allowed: true  },
    { resource: 'reports.general',                 action: 'read', is_allowed: true  },
    { resource: 'reports.daily',                   action: 'read', is_allowed: true  },
    { resource: 'reports.salesByPaymentMethod',    action: 'read', is_allowed: true  },
    { resource: 'reports.customerLedger',          action: 'read', is_allowed: true  },
    { resource: 'reports.outstandingOpenInvoices', action: 'read', is_allowed: true  },
    { resource: 'reports.salesByFabricColor',      action: 'read', is_allowed: true  },
    { resource: 'reports.stocktakeInventory',      action: 'read', is_allowed: true  },
    { resource: 'reports.stockByWarehouse',        action: 'read', is_allowed: true  },
    { resource: 'reports.agingInventory',          action: 'read', is_allowed: true  },
    { resource: 'reports.shipmentsSummary',        action: 'read', is_allowed: true  },
    { resource: 'reports.returnsReport',           action: 'read', is_allowed: true  },
    { resource: 'reports.outstandingCheques',      action: 'read', is_allowed: true  },
    { resource: 'reports.cashFlow',                action: 'read', is_allowed: true  },
    { resource: 'reports.bankReconciliation',      action: 'read', is_allowed: true  },
    { resource: 'reports.expenses',                action: 'read', is_allowed: true  },
    { resource: 'reports.payrollSummary',          action: 'read', is_allowed: true  },
    { resource: 'reports.hrAdjustments',           action: 'read', is_allowed: true  },
    { resource: 'reports.auditLog',                action: 'read', is_allowed: true  },
    // super_admin-only — explicitly denied for owner
    { resource: 'settings', action: 'read',  is_allowed: false },
    { resource: 'settings', action: 'write', is_allowed: false },
    { resource: 'users',    action: 'read',  is_allowed: false },
    { resource: 'users',    action: 'write', is_allowed: false },
  ],

  // ── Shop seller (Ziad) ────────────────────────────────────────────────────
  // POS + customers + receive shipments + cash drawer.
  shop_seller: [
    { resource: 'customers',    action: 'read',    is_allowed: true  },
    { resource: 'customers',    action: 'write',   is_allowed: true  },
    { resource: 'invoices',     action: 'read',    is_allowed: true  },
    { resource: 'invoices',     action: 'write',   is_allowed: true  },
    { resource: 'invoices',     action: 'approve', is_allowed: true  },  // void invoices
    { resource: 'returns',      action: 'read',    is_allowed: true  },
    { resource: 'returns',      action: 'write',   is_allowed: true  },
    { resource: 'returns',      action: 'approve', is_allowed: false },
    { resource: 'fabric_rolls', action: 'read',    is_allowed: true  },
    { resource: 'fabric_rolls', action: 'write',   is_allowed: true  },  // label printing
    { resource: 'fabric_rolls', action: 'manage',  is_allowed: false },  // catalog CRUD = factory only
    { resource: 'accessories',  action: 'read',    is_allowed: true  },
    { resource: 'accessories',  action: 'write',   is_allowed: true  },  // add accessory SKUs + sell via POS
    { resource: 'inventory',    action: 'read',    is_allowed: true  },
    { resource: 'inventory',    action: 'write',   is_allowed: true  },  // stocktakes, adjustments
    { resource: 'inventory',    action: 'approve', is_allowed: false }, // damage event approval = owner
    { resource: 'shipments',    action: 'read',    is_allowed: true  },
    { resource: 'shipments',    action: 'write',   is_allowed: false }, // factory creates shipments
    { resource: 'shipments',    action: 'approve', is_allowed: true  }, // receives factory shipments
    { resource: 'cash_drawer',  action: 'read',    is_allowed: true  },
    { resource: 'cash_drawer',  action: 'write',   is_allowed: true  },
    { resource: 'cash_drawer',  action: 'approve', is_allowed: false },
    { resource: 'hr',           action: 'view',             is_allowed: false },
    { resource: 'hr',           action: 'manage',           is_allowed: false },
    { resource: 'hr',           action: 'salary.disburse',  is_allowed: false },
    { resource: 'hr',           action: 'advance.create',   is_allowed: false },
    { resource: 'hr',           action: 'deduction.create', is_allowed: false },
    { resource: 'suppliers',    action: 'view',           is_allowed: false },
    { resource: 'suppliers',    action: 'write',          is_allowed: false },
    { resource: 'suppliers',    action: 'payments.write', is_allowed: false },
    { resource: 'reports.general',                 action: 'read', is_allowed: false },
    { resource: 'reports.daily',                   action: 'read', is_allowed: true  },
    { resource: 'reports.salesByPaymentMethod',    action: 'read', is_allowed: true  },
    { resource: 'reports.customerLedger',          action: 'read', is_allowed: true  },
    { resource: 'reports.outstandingOpenInvoices', action: 'read', is_allowed: true  },
    { resource: 'reports.salesByFabricColor',      action: 'read', is_allowed: false },
    { resource: 'reports.stocktakeInventory',      action: 'read', is_allowed: true  },
    { resource: 'reports.stockByWarehouse',        action: 'read', is_allowed: true  },
    { resource: 'reports.agingInventory',          action: 'read', is_allowed: false },
    { resource: 'reports.shipmentsSummary',        action: 'read', is_allowed: false },
    { resource: 'reports.returnsReport',           action: 'read', is_allowed: true  },
    { resource: 'reports.outstandingCheques',      action: 'read', is_allowed: true  },
    { resource: 'reports.cashFlow',                action: 'read', is_allowed: false },
    { resource: 'reports.bankReconciliation',      action: 'read', is_allowed: false },
    { resource: 'reports.expenses',                action: 'read', is_allowed: false },
    { resource: 'reports.payrollSummary',          action: 'read', is_allowed: false },
    { resource: 'reports.hrAdjustments',           action: 'read', is_allowed: false },
    { resource: 'reports.auditLog',                action: 'read', is_allowed: false },
    { resource: 'settings', action: 'read',  is_allowed: false },
    { resource: 'settings', action: 'write', is_allowed: false },
    { resource: 'users',    action: 'read',  is_allowed: false },
    { resource: 'users',    action: 'write', is_allowed: false },
  ],

  // ── Factory sender (Ahmed) ────────────────────────────────────────────────
  // Creates outbound shipments; sees Factory Warehouse stock.
  // shipments.approve is also HARD_DENIED in code regardless of any DB row.
  factory_sender: [
    { resource: 'customers',    action: 'read',    is_allowed: false },
    { resource: 'customers',    action: 'write',   is_allowed: false },
    { resource: 'invoices',     action: 'read',    is_allowed: false },
    { resource: 'invoices',     action: 'write',   is_allowed: false },
    { resource: 'invoices',     action: 'approve', is_allowed: false },
    { resource: 'returns',      action: 'read',    is_allowed: false },
    { resource: 'returns',      action: 'write',   is_allowed: false },
    { resource: 'returns',      action: 'approve', is_allowed: false },
    { resource: 'fabric_rolls', action: 'read',    is_allowed: true  },
    { resource: 'fabric_rolls', action: 'write',   is_allowed: true  }, // AddTop wizard
    { resource: 'fabric_rolls', action: 'manage',  is_allowed: true  }, // add fabrics, colors, prices
    { resource: 'accessories',  action: 'read',    is_allowed: false },
    { resource: 'accessories',  action: 'write',   is_allowed: false },
    { resource: 'inventory',    action: 'read',    is_allowed: true  }, // sees factory warehouse
    { resource: 'inventory',    action: 'write',   is_allowed: false },
    { resource: 'inventory',    action: 'approve', is_allowed: false },
    { resource: 'shipments',    action: 'read',    is_allowed: true  },
    { resource: 'shipments',    action: 'write',   is_allowed: true  }, // creates/submits shipments
    { resource: 'shipments',    action: 'approve', is_allowed: false }, // HARD_DENY also enforced in code
    { resource: 'cash_drawer',  action: 'read',    is_allowed: false },
    { resource: 'cash_drawer',  action: 'write',   is_allowed: false },
    { resource: 'cash_drawer',  action: 'approve', is_allowed: false },
    { resource: 'hr',           action: 'view',             is_allowed: false },
    { resource: 'hr',           action: 'manage',           is_allowed: false },
    { resource: 'hr',           action: 'salary.disburse',  is_allowed: false },
    { resource: 'hr',           action: 'advance.create',   is_allowed: false },
    { resource: 'hr',           action: 'deduction.create', is_allowed: false },
    { resource: 'suppliers',    action: 'view',           is_allowed: false },
    { resource: 'suppliers',    action: 'write',          is_allowed: false },
    { resource: 'suppliers',    action: 'payments.write', is_allowed: false },
    { resource: 'reports.general',                 action: 'read', is_allowed: false },
    { resource: 'reports.daily',                   action: 'read', is_allowed: false },
    { resource: 'reports.salesByPaymentMethod',    action: 'read', is_allowed: false },
    { resource: 'reports.customerLedger',          action: 'read', is_allowed: false },
    { resource: 'reports.outstandingOpenInvoices', action: 'read', is_allowed: false },
    { resource: 'reports.salesByFabricColor',      action: 'read', is_allowed: false },
    { resource: 'reports.stocktakeInventory',      action: 'read', is_allowed: false },
    { resource: 'reports.stockByWarehouse',        action: 'read', is_allowed: false },
    { resource: 'reports.agingInventory',          action: 'read', is_allowed: false },
    { resource: 'reports.shipmentsSummary',        action: 'read', is_allowed: false },
    { resource: 'reports.returnsReport',           action: 'read', is_allowed: false },
    { resource: 'reports.outstandingCheques',      action: 'read', is_allowed: false },
    { resource: 'reports.cashFlow',                action: 'read', is_allowed: false },
    { resource: 'reports.bankReconciliation',      action: 'read', is_allowed: false },
    { resource: 'reports.expenses',                action: 'read', is_allowed: false },
    { resource: 'reports.payrollSummary',          action: 'read', is_allowed: false },
    { resource: 'reports.hrAdjustments',           action: 'read', is_allowed: false },
    { resource: 'reports.auditLog',                action: 'read', is_allowed: false },
    { resource: 'settings', action: 'read',  is_allowed: false },
    { resource: 'settings', action: 'write', is_allowed: false },
    { resource: 'users',    action: 'read',  is_allowed: false },
    { resource: 'users',    action: 'write', is_allowed: false },
  ],

  // ── Accountant ────────────────────────────────────────────────────────────
  // Already seeded in migration 070. Listed here for catalog completeness.
  // Migration 072 uses onConflict.ignore() so these rows are not duplicated.
  accountant: [
    { resource: 'customers',    action: 'read',    is_allowed: true  },
    { resource: 'customers',    action: 'write',   is_allowed: false },
    { resource: 'invoices',     action: 'read',    is_allowed: true  },
    { resource: 'invoices',     action: 'write',   is_allowed: false },
    { resource: 'invoices',     action: 'approve', is_allowed: false },
    { resource: 'returns',      action: 'read',    is_allowed: true  },
    { resource: 'returns',      action: 'write',   is_allowed: false },
    { resource: 'returns',      action: 'approve', is_allowed: false },
    { resource: 'fabric_rolls', action: 'read',    is_allowed: true  },
    { resource: 'fabric_rolls', action: 'write',   is_allowed: false },
    { resource: 'fabric_rolls', action: 'manage',  is_allowed: false },
    { resource: 'accessories',  action: 'read',    is_allowed: true  },
    { resource: 'accessories',  action: 'write',   is_allowed: false },
    { resource: 'inventory',    action: 'read',    is_allowed: true  },
    { resource: 'inventory',    action: 'write',   is_allowed: false },
    { resource: 'inventory',    action: 'approve', is_allowed: false },
    { resource: 'shipments',    action: 'read',    is_allowed: true  },
    { resource: 'shipments',    action: 'write',   is_allowed: false },
    { resource: 'shipments',    action: 'approve', is_allowed: false },
    { resource: 'cash_drawer',  action: 'read',    is_allowed: true  },
    { resource: 'cash_drawer',  action: 'write',   is_allowed: false },
    { resource: 'cash_drawer',  action: 'approve', is_allowed: false },
    { resource: 'hr',           action: 'view',             is_allowed: true  },
    { resource: 'hr',           action: 'manage',           is_allowed: true  },
    { resource: 'hr',           action: 'salary.disburse',  is_allowed: true  },
    { resource: 'hr',           action: 'advance.create',   is_allowed: true  },
    { resource: 'hr',           action: 'deduction.create', is_allowed: true  },
    { resource: 'suppliers',    action: 'view',           is_allowed: true  },
    { resource: 'suppliers',    action: 'write',          is_allowed: true  },
    { resource: 'suppliers',    action: 'payments.write', is_allowed: true  },
    { resource: 'reports.general',                 action: 'read', is_allowed: true  },
    { resource: 'reports.daily',                   action: 'read', is_allowed: true  },
    { resource: 'reports.salesByPaymentMethod',    action: 'read', is_allowed: true  },
    { resource: 'reports.customerLedger',          action: 'read', is_allowed: true  },
    { resource: 'reports.outstandingOpenInvoices', action: 'read', is_allowed: true  },
    { resource: 'reports.salesByFabricColor',      action: 'read', is_allowed: true  },
    { resource: 'reports.stocktakeInventory',      action: 'read', is_allowed: true  },
    { resource: 'reports.stockByWarehouse',        action: 'read', is_allowed: true  },
    { resource: 'reports.agingInventory',          action: 'read', is_allowed: true  },
    { resource: 'reports.shipmentsSummary',        action: 'read', is_allowed: true  },
    { resource: 'reports.returnsReport',           action: 'read', is_allowed: true  },
    { resource: 'reports.outstandingCheques',      action: 'read', is_allowed: true  },
    { resource: 'reports.cashFlow',                action: 'read', is_allowed: true  },
    { resource: 'reports.bankReconciliation',      action: 'read', is_allowed: true  },
    { resource: 'reports.expenses',                action: 'read', is_allowed: true  },
    { resource: 'reports.payrollSummary',          action: 'read', is_allowed: true  },
    { resource: 'reports.hrAdjustments',           action: 'read', is_allowed: true  },
    { resource: 'reports.auditLog',                action: 'read', is_allowed: false },
    { resource: 'settings', action: 'read',  is_allowed: false },
    { resource: 'settings', action: 'write', is_allowed: false },
    { resource: 'users',    action: 'read',  is_allowed: false },
    { resource: 'users',    action: 'write', is_allowed: false },
  ],
};

// ─── Hard-deny invariants ─────────────────────────────────────────────────────

/**
 * Absolute denials enforced in code before any DB lookup or per-user override.
 * No admin action can grant these permissions to the specified role.
 *
 * Do NOT add new entries without explicit owner approval.
 */
export const HARD_DENY: Array<{ role: string; resource: string; action: string }> = [
  { role: 'factory_sender', resource: 'shipments', action: 'approve' },
];
