import type { Knex } from 'knex';

// v2 Phase 7 — bank_transfer + cheque payment methods.
// - payments.method: extend CHECK to include 'bank_transfer' and 'cheque'.
// - payments.reference: add VARCHAR(64) NULL for external transfer reference.
// - returns.refund_method: extend CHECK to include 'bank_transfer' and 'cheque'.
// - bank_movements.event_type: extend CHECK to include 'bank_transfer_payment'.
// - cheques: new table capturing cheque details per payment row.
export async function up(db: Knex): Promise<void> {
  // 0) Extend bank_movements.event_type CHECK to include 'bank_transfer_payment'.
  await db.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bank_movements_event_type_check'
      ) THEN
        ALTER TABLE bank_movements DROP CONSTRAINT bank_movements_event_type_check;
      END IF;
    END $$;
  `);
  await db.raw(
    `ALTER TABLE bank_movements ADD CONSTRAINT bank_movements_event_type_check ` +
      `CHECK (event_type IN ('instapay_payment','cash_deposit','refund',` +
      `'reconciliation_adjustment','opening_balance_set','bank_transfer_payment','other_in','other_out'))`,
  );

  // 1) Extend payments.method check constraint.
  await db.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_method_check'
      ) THEN
        ALTER TABLE payments DROP CONSTRAINT payments_method_check;
      END IF;
    END $$;
  `);
  await db.raw(
    `ALTER TABLE payments ADD CONSTRAINT payments_method_check ` +
      `CHECK (method IN ('cash','instapay','bank_transfer','cheque'))`,
  );

  // 2) Add payments.reference column (optional free-text reference for bank_transfer).
  await db.schema.alterTable('payments', (t) => {
    t.string('reference', 64).nullable();
  });

  // 3) Extend returns.refund_method check constraint.
  await db.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'returns_refund_method_check'
      ) THEN
        ALTER TABLE returns DROP CONSTRAINT returns_refund_method_check;
      END IF;
    END $$;
  `);
  await db.raw(
    `ALTER TABLE returns ADD CONSTRAINT returns_refund_method_check ` +
      `CHECK (refund_method IN ('cash','instapay','customer_credit','bank_transfer','cheque'))`,
  );

  // 4) Create cheques table.
  await db.schema.createTable('cheques', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('payment_id').unsigned().notNullable()
      .references('id').inTable('payments').onDelete('CASCADE');
    t.string('cheque_number', 64).notNullable();
    t.string('bank_name_ar', 128).notNullable();
    t.string('branch_ar', 128).nullable();
    t.string('issuer_name_ar', 128).nullable();
    t.decimal('amount_egp', 12, 2).notNullable();
    t.date('issue_date').notNullable();
    t.date('due_date').notNullable();
    t.string('status', 32).notNullable().defaultTo('pending')
      .checkIn(['pending', 'cleared', 'bounced', 'cancelled']);
    t.text('notes_ar').nullable();
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
  });

  await db.raw(`CREATE INDEX cheques_due_date_idx ON cheques(due_date)`);
  await db.raw(`CREATE INDEX cheques_status_idx ON cheques(status)`);
}

export async function down(db: Knex): Promise<void> {
  // 4) Drop cheques table first (FK references payments).
  await db.schema.dropTableIfExists('cheques');

  // 0) Revert bank_movements.event_type check.
  await db.raw(`ALTER TABLE bank_movements DROP CONSTRAINT IF EXISTS bank_movements_event_type_check`);
  await db.raw(
    `ALTER TABLE bank_movements ADD CONSTRAINT bank_movements_event_type_check ` +
      `CHECK (event_type IN ('instapay_payment','cash_deposit','refund',` +
      `'reconciliation_adjustment','opening_balance_set','other_in','other_out'))`,
  );

  // 3) Revert returns.refund_method constraint.
  await db.raw(`ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_refund_method_check`);
  await db.raw(
    `ALTER TABLE returns ADD CONSTRAINT returns_refund_method_check ` +
      `CHECK (refund_method IN ('cash','instapay','customer_credit'))`,
  );

  // 2) Drop payments.reference.
  await db.schema.alterTable('payments', (t) => {
    t.dropColumn('reference');
  });

  // 1) Revert payments.method constraint.
  // Wipe bank_transfer / cheque rows so the tighter constraint fits.
  await db('payments')
    .whereIn('method', ['bank_transfer', 'cheque'])
    .update({ method: 'cash' });

  await db.raw(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check`);
  await db.raw(
    `ALTER TABLE payments ADD CONSTRAINT payments_method_check ` +
      `CHECK (method IN ('cash','instapay'))`,
  );
}
