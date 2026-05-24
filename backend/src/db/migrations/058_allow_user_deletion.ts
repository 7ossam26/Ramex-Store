import type { Knex } from 'knex';

/**
 * Changes all RESTRICT FK constraints on users.id to SET NULL so that a user
 * account can be deleted without losing historical records. NOT NULL columns
 * whose values would become NULL on deletion are relaxed to nullable — the
 * NULL indicates "deleted user" in those audit/actor fields.
 */

type FKDef = {
  table: string;
  column: string;
  notNull?: boolean; // true → also DROP NOT NULL on the column
};

const RESTRICT_FKS: FKDef[] = [
  { table: 'stock_movements',          column: 'actor_user_id',       notNull: true  },
  { table: 'damage_events',            column: 'created_by_user_id',  notNull: true  },
  { table: 'stocktakes',               column: 'created_by_user_id',  notNull: true  },
  { table: 'invoices',                 column: 'cashier_user_id',     notNull: true  },
  { table: 'invoices',                 column: 'delivered_by_user_id'                },
  { table: 'payments',                 column: 'actor_user_id',       notNull: true  },
  { table: 'invoice_status_history',   column: 'actor_user_id',       notNull: true  },
  { table: 'cash_movements',           column: 'actor_user_id',       notNull: true  },
  { table: 'bank_movements',           column: 'actor_user_id',       notNull: true  },
  { table: 'expenses',                 column: 'approved_by_user_id'                 },
  { table: 'expenses',                 column: 'actor_user_id',       notNull: true  },
  { table: 'returns',                  column: 'created_by_user_id',  notNull: true  },
  { table: 'settings_versions',        column: 'actor_user_id',       notNull: true  },
  { table: 'shipments',                column: 'created_by_user_id',  notNull: true  },
  { table: 'customers',                column: 'created_by_user_id',  notNull: true  },
  { table: 'customer_ledger_entries',  column: 'actor_user_id',       notNull: true  },
  { table: 'reconciliations',          column: 'actor_user_id',       notNull: true  },
  { table: 'shifts',                   column: 'opened_by_user_id',   notNull: true  },
  { table: 'shifts',                   column: 'closed_by_user_id'                   },
  { table: 'hr_salary_disbursements',  column: 'actor_user_id',       notNull: true  },
  { table: 'hr_salary_adjustments',    column: 'actor_user_id',       notNull: true  },
];

function constraintName(table: string, column: string): string {
  return `${table}_${column}_foreign`;
}

export async function up(db: Knex): Promise<void> {
  for (const { table, column, notNull } of RESTRICT_FKS) {
    const constraint = constraintName(table, column);

    if (notNull) {
      await db.raw(`ALTER TABLE ?? ALTER COLUMN ?? DROP NOT NULL`, [table, column]);
    }

    await db.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, constraint]);
    await db.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES users(id) ON DELETE SET NULL`,
      [table, constraint, column],
    );
  }
}

export async function down(db: Knex): Promise<void> {
  for (const { table, column } of RESTRICT_FKS) {
    const constraint = constraintName(table, column);
    await db.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, constraint]);
    await db.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES users(id) ON DELETE RESTRICT`,
      [table, constraint, column],
    );
    // Note: NOT NULL is intentionally not restored — data may contain NULLs
    // from user deletions that occurred while this migration was active.
  }
}
