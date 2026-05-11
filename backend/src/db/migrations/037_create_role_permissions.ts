import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('role_permissions', (t) => {
    t.bigIncrements('id').primary();
    t.enu('role', ['owner', 'shop_seller', 'factory_sender']).notNullable();
    t.string('resource', 64).notNullable();
    t.enu('action', ['read', 'write', 'approve']).notNullable();
    t.boolean('is_allowed').notNullable();
    t.unique(['role', 'resource', 'action']);
  });

  const perms: Array<{ role: string; resource: string; action: string; is_allowed: boolean }> = [
    // ── shop_seller ────────────────────────────────────────────────────────────
    { role: 'shop_seller', resource: 'customers',   action: 'read',  is_allowed: true  },
    { role: 'shop_seller', resource: 'customers',   action: 'write', is_allowed: true  },
    { role: 'shop_seller', resource: 'invoices',    action: 'read',  is_allowed: true  },
    { role: 'shop_seller', resource: 'invoices',    action: 'write', is_allowed: true  },
    { role: 'shop_seller', resource: 'inventory',   action: 'read',  is_allowed: true  },
    { role: 'shop_seller', resource: 'inventory',   action: 'write', is_allowed: true  },
    { role: 'shop_seller', resource: 'cash_drawer', action: 'read',  is_allowed: true  },
    { role: 'shop_seller', resource: 'cash_drawer', action: 'write', is_allowed: true  },
    { role: 'shop_seller', resource: 'shipments',   action: 'read',  is_allowed: true  },
    { role: 'shop_seller', resource: 'shipments',   action: 'write', is_allowed: true  },
    { role: 'shop_seller', resource: 'returns',     action: 'read',  is_allowed: true  },
    { role: 'shop_seller', resource: 'returns',     action: 'write', is_allowed: true  },
    { role: 'shop_seller', resource: 'reports.daily',                  action: 'read', is_allowed: true  },
    { role: 'shop_seller', resource: 'reports.salesByPaymentMethod',   action: 'read', is_allowed: true  },
    { role: 'shop_seller', resource: 'reports.customerLedger',         action: 'read', is_allowed: true  },
    { role: 'shop_seller', resource: 'reports.outstandingOpenInvoices',action: 'read', is_allowed: true  },
    { role: 'shop_seller', resource: 'reports.salesByFabricColor',     action: 'read', is_allowed: false },
    { role: 'shop_seller', resource: 'reports.stocktakeInventory',     action: 'read', is_allowed: false },
    { role: 'shop_seller', resource: 'reports.cashFlow',               action: 'read', is_allowed: false },
    { role: 'shop_seller', resource: 'reports.bankReconciliation',     action: 'read', is_allowed: false },
    { role: 'shop_seller', resource: 'reports.expenses',               action: 'read', is_allowed: false },
    { role: 'shop_seller', resource: 'reports.damageLoss',             action: 'read', is_allowed: false },
    { role: 'shop_seller', resource: 'reports.auditLog',               action: 'read', is_allowed: false },
    { role: 'shop_seller', resource: 'settings', action: 'read',  is_allowed: false },
    { role: 'shop_seller', resource: 'settings', action: 'write', is_allowed: false },
    { role: 'shop_seller', resource: 'users',    action: 'read',  is_allowed: false },
    { role: 'shop_seller', resource: 'users',    action: 'write', is_allowed: false },

    // ── factory_sender ─────────────────────────────────────────────────────────
    { role: 'factory_sender', resource: 'inventory',  action: 'read',  is_allowed: true  },
    { role: 'factory_sender', resource: 'inventory',  action: 'write', is_allowed: false },
    { role: 'factory_sender', resource: 'shipments',  action: 'read',  is_allowed: true  },
    { role: 'factory_sender', resource: 'shipments',  action: 'write', is_allowed: true  },
    { role: 'factory_sender', resource: 'customers',  action: 'read',  is_allowed: false },
    { role: 'factory_sender', resource: 'invoices',   action: 'read',  is_allowed: false },
    { role: 'factory_sender', resource: 'cash_drawer',action: 'read',  is_allowed: false },
    { role: 'factory_sender', resource: 'returns',    action: 'read',  is_allowed: false },
    { role: 'factory_sender', resource: 'reports.daily',   action: 'read', is_allowed: false },
    { role: 'factory_sender', resource: 'reports.auditLog',action: 'read', is_allowed: false },
    { role: 'factory_sender', resource: 'settings',  action: 'read',  is_allowed: false },
    { role: 'factory_sender', resource: 'settings',  action: 'write', is_allowed: false },
    { role: 'factory_sender', resource: 'users',     action: 'read',  is_allowed: false },
  ];

  await knex('role_permissions')
    .insert(perms)
    .onConflict(['role', 'resource', 'action'])
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('role_permissions');
}
