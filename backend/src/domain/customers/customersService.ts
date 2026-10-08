import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import type { Customer, CustomerDetail } from './customers.types.js';
import type {
  CreateCustomerInput,
  QuickCreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersQueryInput,
  ListCustomersExportQueryInput,
  LedgerQueryInput,
} from './customers.schemas.js';

type CustomerFilters = {
  search?: string;
  /** Also match customers by what they bought (see matchedPurchases). */
  searchPurchases?: boolean;
  balance?: 'all' | 'debt' | 'credit' | 'settled';
};

// An invoice still counts as a purchase unless it was undone as a whole.
const UNDONE_INVOICE_STATUSES = ['cancelled', 'deposit_refunded', 'returned'];

/** Every token must appear somewhere in `haystackSql` (case-insensitive). */
function whereAllTokens(qb: Knex.QueryBuilder, haystackSql: string, tokens: string[]): void {
  for (const t of tokens) qb.whereRaw(`${haystackSql} ILIKE ?`, [`%${t}%`]);
}

/**
 * Per customer, the purchased items matching the search that they still hold,
 * as «قطن أحمر (2 توب)، زرار (12 قطعة)».
 *
 * Held = on an invoice that is not cancelled, deposit-refunded or fully
 * returned, and not returned in full. For أتواب that mirrors
 * invoiceReturnState: a legacy return row (no quantity) covers the whole line,
 * otherwise the returned quantities must reach the sold quantity. For
 * إكسسوارات the returned pieces must reach the sold pieces.
 *
 * A line matches when every search word appears in its خامة / لون names or
 * codes or its barcode, so «قطن أحمر» finds red cotton.
 */
function matchedPurchases(tokens: string[]): Knex.QueryBuilder {
  const rolls = db('invoice_lines as il')
    .join('invoices as i', 'i.id', 'il.invoice_id')
    .join('rolls as r', 'r.id', 'il.roll_id')
    .join('fabrics as f', 'f.id', 'r.fabric_id')
    .join('colors as c', 'c.id', 'r.color_id')
    .where('il.item_type', 'roll')
    .whereNotIn('i.status', UNDONE_INVOICE_STATUSES)
    .whereRaw(
      `NOT EXISTS (SELECT 1 FROM return_lines rl
                   WHERE rl.original_invoice_line_id = il.id AND rl.returned_quantity IS NULL)`,
    )
    .whereRaw(
      // Unknown sold quantity (legacy metre line without a length) counts as held.
      `(COALESCE((SELECT SUM(rl.returned_quantity) FROM return_lines rl WHERE rl.original_invoice_line_id = il.id), 0)
          < COALESCE(il.sold_quantity, CASE WHEN f.unit = 'meter' THEN r.length_m ELSE r.weight_kg END) - 0.0005
        OR COALESCE(il.sold_quantity, CASE WHEN f.unit = 'meter' THEN r.length_m ELSE r.weight_kg END) IS NULL)`,
    )
    .groupBy('i.customer_id', 'f.name_ar', 'c.name_ar')
    .select(
      'i.customer_id',
      db.raw(`f.name_ar || ' ' || c.name_ar AS label`),
      db.raw('COUNT(DISTINCT il.roll_id)::int AS n'),
      db.raw(`'توب' AS unit`),
    );
  whereAllTokens(
    rolls,
    `CONCAT_WS(' ', f.name_ar, f.code, c.name_ar, c.code, r.internal_barcode, r.external_barcode)`,
    tokens,
  );

  const returnedPieces =
    `COALESCE((SELECT SUM(rl.qty_pieces) FROM return_lines rl WHERE rl.original_invoice_line_id = il.id), 0)`;
  const accessories = db('invoice_lines as il')
    .join('invoices as i', 'i.id', 'il.invoice_id')
    .join('accessories as a', 'a.id', 'il.accessory_id')
    .where('il.item_type', 'accessory')
    .whereNotIn('i.status', UNDONE_INVOICE_STATUSES)
    .whereRaw(`${returnedPieces} < il.qty_pieces`)
    .groupBy('i.customer_id', 'a.name_ar')
    .select(
      'i.customer_id',
      'a.name_ar as label',
      db.raw(`SUM(il.qty_pieces - ${returnedPieces})::int AS n`),
      db.raw(`'قطعة' AS unit`),
    );
  whereAllTokens(accessories, `CONCAT_WS(' ', a.name_ar, a.internal_barcode)`, tokens);

  return db
    // A standalone union: chained onto `rolls`, knex would emit it before
    // rolls' GROUP BY.
    .from(db.unionAll([rolls, accessories], true).as('pi'))
    .groupBy('pi.customer_id')
    .select(
      'pi.customer_id',
      db.raw(`STRING_AGG(pi.label || ' (' || pi.n || ' ' || pi.unit || ')', '، ' ORDER BY pi.n DESC, pi.label) AS matched_items`),
    );
}

/** `customers` with the shared search + balance-direction filters applied. */
function filteredCustomers(filters: CustomerFilters): Knex.QueryBuilder {
  const qb = db('customers').select('customers.*');
  const search = filters.search?.trim();
  if (search) {
    const term = `%${search}%`;
    if (filters.searchPurchases) {
      qb.leftJoin(matchedPurchases(search.split(/\s+/)).as('mp'), 'mp.customer_id', 'customers.id')
        .select('mp.matched_items');
    }
    qb.where((q) => {
      q.whereILike('customers.name_ar', term).orWhereILike('customers.phone', term);
      if (filters.searchPurchases) q.orWhereNotNull('mp.customer_id');
    });
  }
  switch (filters.balance) {
    case 'debt':
      qb.where('customers.current_balance_egp', '<', 0);
      break;
    case 'credit':
      qb.where('customers.current_balance_egp', '>', 0);
      break;
    case 'settled':
      qb.where('customers.current_balance_egp', '=', 0);
      break;
    default:
      break;
  }
  return qb;
}

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

    // NB: `trx.fn.now()` returns a Knex Raw (which holds a circular reference
    // to the client), so it must not be added to `updates` — that same object
    // is passed to the audit log below and JSON.stringify'd. Apply updated_at
    // to the DB write only, keeping `updates` plain-serialisable.
    await trx('customers').where({ id }).update({ ...updates, updated_at: trx.fn.now() });
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
  const { search, search_purchases, balance, sort, page, limit } = query;
  const offset = (page - 1) * limit;

  const base = filteredCustomers({ search, searchPurchases: search_purchases, balance });

  const [countRow] = await base.clone().clearSelect().count('customers.id as count');
  const rows = await base
    .orderBy(`customers.${sort ?? 'created_at'}`, 'desc')
    .limit(limit)
    .offset(offset);

  return { rows: rows as Customer[], total: Number((countRow as { count: string }).count) };
}

/** All customers matching the search + balance filters, unpaginated — for export. */
export async function listForExport(query: ListCustomersExportQueryInput): Promise<Customer[]> {
  const { search, search_purchases, balance, sort } = query;
  const base = filteredCustomers({ search, searchPurchases: search_purchases, balance });
  const rows = await base.orderBy(`customers.${sort ?? 'created_at'}`, 'desc');
  return rows as Customer[];
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
