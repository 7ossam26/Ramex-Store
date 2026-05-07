import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('invoices', (t) => {
    t.index(['created_at', 'status'], 'idx_invoices_created_at_status');
    t.index(['closed_at'], 'idx_invoices_closed_at');
  });
  await knex.schema.table('payments', (t) => {
    t.index(['created_at', 'method', 'payment_kind'], 'idx_payments_created_at_method_kind');
  });
  await knex.schema.table('cash_movements', (t) => {
    t.index(['created_at', 'event_type'], 'idx_cash_movements_created_at_event_type');
  });
  await knex.schema.table('bank_movements', (t) => {
    t.index(['created_at', 'event_type'], 'idx_bank_movements_created_at_event_type');
  });
  await knex.schema.table('stock_movements', (t) => {
    t.index(['created_at', 'event_type'], 'idx_stock_movements_created_at_event_type');
  });
  await knex.schema.table('expenses', (t) => {
    t.index(['created_at', 'category'], 'idx_expenses_created_at_category');
  });
  await knex.schema.table('damage_events', (t) => {
    t.index(['created_at', 'reason_code'], 'idx_damage_events_created_at_reason_code');
  });
  await knex.schema.table('audit_log', (t) => {
    t.index(['created_at', 'severity'], 'idx_audit_log_created_at_severity');
  });
  await knex.schema.table('customer_ledger_entries', (t) => {
    t.index(['created_at', 'entry_type'], 'idx_customer_ledger_entries_created_at_entry_type');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('invoices', (t) => {
    t.dropIndex([], 'idx_invoices_created_at_status');
    t.dropIndex([], 'idx_invoices_closed_at');
  });
  await knex.schema.table('payments', (t) => {
    t.dropIndex([], 'idx_payments_created_at_method_kind');
  });
  await knex.schema.table('cash_movements', (t) => {
    t.dropIndex([], 'idx_cash_movements_created_at_event_type');
  });
  await knex.schema.table('bank_movements', (t) => {
    t.dropIndex([], 'idx_bank_movements_created_at_event_type');
  });
  await knex.schema.table('stock_movements', (t) => {
    t.dropIndex([], 'idx_stock_movements_created_at_event_type');
  });
  await knex.schema.table('expenses', (t) => {
    t.dropIndex([], 'idx_expenses_created_at_category');
  });
  await knex.schema.table('damage_events', (t) => {
    t.dropIndex([], 'idx_damage_events_created_at_reason_code');
  });
  await knex.schema.table('audit_log', (t) => {
    t.dropIndex([], 'idx_audit_log_created_at_severity');
  });
  await knex.schema.table('customer_ledger_entries', (t) => {
    t.dropIndex([], 'idx_customer_ledger_entries_created_at_entry_type');
  });
}
