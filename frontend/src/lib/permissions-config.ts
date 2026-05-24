export type PermAction = 'read' | 'write' | 'approve';

export type ResourceDef = {
  key: string;
  /** Which actions are meaningful for this resource. Only these will be rendered. */
  actions: PermAction[];
};

export type ResourceGroup = {
  groupKey: string;
  resources: ResourceDef[];
};

export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    groupKey: 'core',
    resources: [
      { key: 'customers',   actions: ['read', 'write'] },
      { key: 'invoices',    actions: ['read', 'write', 'approve'] },
      { key: 'inventory',   actions: ['read', 'write'] },
      { key: 'shipments',   actions: ['read', 'write', 'approve'] },
      { key: 'cash_drawer', actions: ['read', 'write'] },
      { key: 'returns',     actions: ['read', 'write', 'approve'] },
    ],
  },
  {
    groupKey: 'reports',
    resources: [
      { key: 'reports.daily',                   actions: ['read'] },
      { key: 'reports.salesByPaymentMethod',    actions: ['read'] },
      { key: 'reports.customerLedger',          actions: ['read'] },
      { key: 'reports.outstandingOpenInvoices', actions: ['read'] },
      { key: 'reports.salesByFabricColor',      actions: ['read'] },
      { key: 'reports.stocktakeInventory',      actions: ['read'] },
      { key: 'reports.cashFlow',                actions: ['read'] },
      { key: 'reports.bankReconciliation',      actions: ['read'] },
      { key: 'reports.expenses',                actions: ['read'] },
      { key: 'reports.damageLoss',              actions: ['read'] },
      { key: 'reports.auditLog',                actions: ['read'] },
    ],
  },
  {
    groupKey: 'admin',
    resources: [
      { key: 'settings', actions: ['read', 'write'] },
      { key: 'users',    actions: ['read', 'write'] },
    ],
  },
];

/** Flat list of all resource keys — derived from RESOURCE_GROUPS. */
export const ALL_RESOURCE_KEYS = RESOURCE_GROUPS.flatMap((g) => g.resources.map((r) => r.key));
