import type { Knex } from 'knex';

const NEW_ROLES = "'owner', 'shop_seller', 'factory_sender', 'super_admin', 'accountant'";
const OLD_ROLES = "'owner', 'shop_seller', 'factory_sender', 'super_admin'";

type Perm = { resource: string; action: string; is_allowed: boolean };

const ACCOUNTANT_PERMS: Perm[] = [
  // ── Operational reads (read-only visibility for accounting/reconciliation) ──
  { resource: 'customers',    action: 'read',    is_allowed: true  },
  { resource: 'customers',    action: 'write',   is_allowed: false },
  { resource: 'invoices',     action: 'read',    is_allowed: true  },
  { resource: 'invoices',     action: 'write',   is_allowed: false },
  { resource: 'invoices',     action: 'approve', is_allowed: false },
  { resource: 'returns',      action: 'read',    is_allowed: true  },
  { resource: 'returns',      action: 'write',   is_allowed: false },
  { resource: 'returns',      action: 'approve', is_allowed: false },
  { resource: 'inventory',    action: 'read',    is_allowed: true  },
  { resource: 'inventory',    action: 'write',   is_allowed: false },
  { resource: 'shipments',    action: 'read',    is_allowed: true  },
  { resource: 'shipments',    action: 'write',   is_allowed: false },
  { resource: 'shipments',    action: 'approve', is_allowed: false },
  { resource: 'fabric_rolls', action: 'read',    is_allowed: true  },
  { resource: 'fabric_rolls', action: 'write',   is_allowed: false },

  // ── Cash drawer — read only. Expense writes are gated separately on the route. ──
  { resource: 'cash_drawer', action: 'read',  is_allowed: true  },
  { resource: 'cash_drawer', action: 'write', is_allowed: false },

  // ── Admin — fully denied ──
  { resource: 'settings', action: 'read',  is_allowed: false },
  { resource: 'settings', action: 'write', is_allowed: false },
  { resource: 'users',    action: 'read',  is_allowed: false },
  { resource: 'users',    action: 'write', is_allowed: false },

  // ── HR — full accounting access (payroll + advances + deductions) ──
  { resource: 'hr', action: 'view',             is_allowed: true },
  { resource: 'hr', action: 'manage',           is_allowed: true },
  { resource: 'hr', action: 'salary.disburse',  is_allowed: true },
  { resource: 'hr', action: 'advance.create',   is_allowed: true },
  { resource: 'hr', action: 'deduction.create', is_allowed: true },

  // ── Suppliers (الديون) — full debt + payment management ──
  { resource: 'suppliers', action: 'view',           is_allowed: true },
  { resource: 'suppliers', action: 'write',          is_allowed: true },
  { resource: 'suppliers', action: 'payments.write', is_allowed: true },

  // ── Reports — granular (each report is its own permission row, individually editable) ──
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
];

export async function up(db: Knex): Promise<void> {
  // Widen users.role CHECK
  await db.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await db.raw(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${NEW_ROLES}))`);

  // Widen role_permissions.role CHECK
  await db.raw(`ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check`);
  await db.raw(`ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN (${NEW_ROLES}))`);

  // Widen notifications.recipient_role CHECK (table may not exist in some envs, so guard with IF EXISTS in raw)
  await db.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_recipient_role_check;
        ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_role_check
          CHECK (recipient_role IN (${NEW_ROLES}));
      END IF;
    END $$;
  `);

  // Seed accountant default permissions
  const rows = ACCOUNTANT_PERMS.map((p) => ({ role: 'accountant', ...p }));
  await db('role_permissions')
    .insert(rows)
    .onConflict(['role', 'resource', 'action'])
    .ignore();
}

export async function down(db: Knex): Promise<void> {
  // Remove all accountant users and permission rows before narrowing the constraint
  await db('users').where({ role: 'accountant' }).delete();
  await db('role_permissions').where({ role: 'accountant' }).delete();

  await db.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await db.raw(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${OLD_ROLES}))`);

  await db.raw(`ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check`);
  await db.raw(`ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN (${OLD_ROLES}))`);

  await db.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        DELETE FROM notifications WHERE recipient_role = 'accountant';
        ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_recipient_role_check;
        ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_role_check
          CHECK (recipient_role IN (${OLD_ROLES}));
      END IF;
    END $$;
  `);
}
