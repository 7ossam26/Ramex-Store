import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add optional supplier link to shipments
  await knex.schema.alterTable('shipments', (t) => {
    t.bigInteger('supplier_id').nullable().references('id').inTable('suppliers');
  });

  // Supplier invoices — debt-creating documents
  await knex.schema.createTable('supplier_invoices', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('supplier_id').notNullable().references('id').inTable('suppliers');
    t.string('invoice_no', 128).nullable();
    t.date('invoice_date').notNullable();
    t.decimal('amount_egp', 12, 2).notNullable();
    t.text('notes_ar').nullable();
    t.string('source', 32).notNullable().defaultTo('manual')
      .checkIn(['manual', 'shipment_receive'], 'supplier_invoices_source_check');
    t.bigInteger('source_ref').nullable();
    t.bigInteger('created_by_user_id').notNullable().references('id').inTable('users');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'ALTER TABLE supplier_invoices ADD CONSTRAINT supplier_invoices_amount_positive CHECK (amount_egp > 0)',
  );
  await knex.schema.raw('CREATE INDEX supplier_invoices_supplier_idx ON supplier_invoices(supplier_id)');

  // Supplier payments — money flowing out to suppliers
  await knex.schema.createTable('supplier_payments', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('supplier_id').notNullable().references('id').inTable('suppliers');
    t.decimal('amount_egp', 12, 2).notNullable();
    t.timestamp('paid_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.string('method', 32).notNullable()
      .checkIn(['cash', 'instapay', 'bank_transfer'], 'supplier_payments_method_check');
    t.bigInteger('bank_account_id').nullable().references('id').inTable('bank_accounts');
    t.text('notes_ar').nullable();
    t.bigInteger('actor_user_id').notNullable().references('id').inTable('users');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'ALTER TABLE supplier_payments ADD CONSTRAINT supplier_payments_amount_positive CHECK (amount_egp > 0)',
  );
  await knex.schema.raw('CREATE INDEX supplier_payments_supplier_idx ON supplier_payments(supplier_id)');

  // Widen action CHECK to include 'payments.write'
  await knex.schema.raw(`
    ALTER TABLE role_permissions
      DROP CONSTRAINT role_permissions_action_check,
      ADD CONSTRAINT role_permissions_action_check
        CHECK (action = ANY (ARRAY[
          'read', 'write', 'approve',
          'view', 'manage', 'salary.disburse', 'advance.create', 'deduction.create',
          'payments.write'
        ]))
  `);

  // Seed suppliers permissions — Owner/super_admin short-circuit; explicit deny for all others
  const roles = ['shop_seller', 'factory_sender'];
  const actions = ['view', 'write', 'payments.write'];
  const rows = roles.flatMap((role) =>
    actions.map((action) => ({ role, resource: 'suppliers', action, is_allowed: false })),
  );
  await knex('role_permissions').insert(rows).onConflict(['role', 'resource', 'action']).ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('role_permissions').where({ resource: 'suppliers' }).delete();

  // Restore previous action CHECK (without payments.write)
  await knex.schema.raw(`
    ALTER TABLE role_permissions
      DROP CONSTRAINT role_permissions_action_check,
      ADD CONSTRAINT role_permissions_action_check
        CHECK (action = ANY (ARRAY[
          'read', 'write', 'approve',
          'view', 'manage', 'salary.disburse', 'advance.create', 'deduction.create'
        ]))
  `);

  await knex.schema.dropTableIfExists('supplier_payments');
  await knex.schema.dropTableIfExists('supplier_invoices');

  await knex.schema.alterTable('shipments', (t) => {
    t.dropForeign(['supplier_id']);
    t.dropColumn('supplier_id');
  });
}
