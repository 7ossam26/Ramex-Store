export type PermAction =
  | 'read' | 'write' | 'approve'
  | 'view' | 'manage' | 'salary.disburse' | 'advance.create' | 'deduction.create'
  | 'payments.write';

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
      { key: 'customers',    actions: ['read', 'write'],           descriptionKey: 'customers' },
      { key: 'invoices',     actions: ['read', 'write', 'approve'], descriptionKey: 'invoices' },
      { key: 'fabric_rolls', actions: ['read', 'write'],           descriptionKey: 'fabric_rolls' },
      { key: 'inventory',    actions: ['read', 'write'],           descriptionKey: 'inventory' },
      { key: 'shipments',    actions: ['read', 'write', 'approve'], descriptionKey: 'shipments' },
      { key: 'cash_drawer',  actions: ['read', 'write'],           descriptionKey: 'cash_drawer' },
      { key: 'returns',      actions: ['read', 'write', 'approve'], descriptionKey: 'returns' },
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
