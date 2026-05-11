import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import type { Customer, CustomerDetail } from './customers.types.js';
import type {
  CreateCustomerInput,
  QuickCreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersQueryInput,
  LedgerQueryInput,
} from './customers.schemas.js';

async function nextCustomerCode(trx: Knex.Transaction): Promise<string> {
  const result = await trx.raw<{ rows: Array<{ n: number | string }> }>(
    'UPDATE db_sequences SET last_value = last_value + 1 WHERE name = ? RETURNING last_value AS n',
    ['customers_code_seq'],
  );
  const n = Number(result.rows[0].n);
  return `C-${n.toString().padStart(6, '0')}`;
}

export async function create(
  actorUserId: number,
  input: CreateCustomerInput,
): Promise<Customer> {
  return db.transaction(async (trx) => {
    const existing = await trx('customers').where({ phone: input.phone }).first();
    if (existing) throw new Error('PHONE_DUPLICATE');

    const customer_code = await nextCustomerCode(trx);
    const [{ id }] = await trx('customers').insert({
      customer_code,
      name_ar: input.name_ar,
      phone: input.phone,
      phone_secondary: input.phone_secondary ?? null,
      address_ar: input.address_ar ?? null,
      tax_no: input.tax_no ?? null,
      notes_ar: input.notes_ar ?? null,
      created_by_user_id: actorUserId,
    }).returning('id');
    const row = await trx('customers').where({ id }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'create_customer',
      entity: 'customer',
      entityId: row.id,
      after: { customer_code, name_ar: row.name_ar, phone: row.phone },
      severity: 'low',
    });

    return row as Customer;
  });
}

export async function quickCreate(
  actorUserId: number,
  input: QuickCreateCustomerInput,
): Promise<Customer> {
  return create(actorUserId, input);
}

export async function update(
  id: number,
  actorUserId: number,
  input: UpdateCustomerInput,
): Promise<Customer> {
  return db.transaction(async (trx) => {
    const current = await trx('customers').where({ id }).first();
    if (!current) throw new Error('CUSTOMER_NOT_FOUND');

    if (input.phone && input.phone !== current.phone) {
      const dup = await trx('customers').where({ phone: input.phone }).whereNot({ id }).first();
      if (dup) throw new Error('PHONE_DUPLICATE');
    }

    const updates: Record<string, unknown> = {};
    if (input.name_ar !== undefined) updates.name_ar = input.name_ar;
    if (input.phone !== undefined) updates.phone = input.phone;
    if ('phone_secondary' in input) updates.phone_secondary = input.phone_secondary ?? null;
    if ('address_ar' in input) updates.address_ar = input.address_ar ?? null;
    if ('tax_no' in input) updates.tax_no = input.tax_no ?? null;
    if ('notes_ar' in input) updates.notes_ar = input.notes_ar ?? null;
    updates.updated_at = trx.fn.now();

    await trx('customers').where({ id }).update(updates);
    const updated = await trx('customers').where({ id }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'update_customer',
      entity: 'customer',
      entityId: id,
      before: {
        name_ar: current.name_ar,
        phone: current.phone,
        phone_secondary: current.phone_secondary,
        address_ar: current.address_ar,
        tax_no: current.tax_no,
        notes_ar: current.notes_ar,
      },
      after: updates,
      severity: 'low',
    });

    return updated as Customer;
  });
}

export async function findByPhone(phone: string): Promise<Customer | undefined> {
  return db('customers').where({ phone }).first();
}

export async function list(
  query: ListCustomersQueryInput,
): Promise<{ rows: Customer[]; total: number }> {
  const { search, sort, page, limit } = query;
  const offset = (page - 1) * limit;

  const base = db('customers');
  if (search) {
    const term = `%${search}%`;
    base.where((q) => {
      q.whereILike('name_ar', term).orWhereILike('phone', term);
    });
  }

  const [countRow] = await base.clone().count('id as count');
  const rows = await base
    .orderBy(sort ?? 'created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return { rows: rows as Customer[], total: Number((countRow as { count: string }).count) };
}

export async function getDetail(
  id: number,
  ledgerQuery: LedgerQueryInput,
): Promise<CustomerDetail | undefined> {
  const customer = await db('customers').where({ id }).first();
  if (!customer) return undefined;

  const { page, limit } = ledgerQuery;
  const offset = (page - 1) * limit;

  const [countRow] = await db('customer_ledger_entries')
    .where({ customer_id: id })
    .count('id as count');
  const ledgerRows = await db('customer_ledger_entries')
    .where({ customer_id: id })
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    ...(customer as Customer),
    ledger: {
      rows: ledgerRows,
      total: Number((countRow as { count: string }).count),
      page,
      limit,
    },
  };
}
