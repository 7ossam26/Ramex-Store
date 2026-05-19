import { db } from '../../db/connection.js';
import { cairoToday, cairoDayWindow } from '../../lib/datetime/cairo.js';

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

// ── Summary today ─────────────────────────────────────────────────────────────

export async function summaryToday() {
  const today = cairoToday();
  const { startUtc, endUtc } = cairoDayWindow(today);
  const s = startUtc.toISOString();
  const e = endUtc.toISOString();

  const [sales, cash, bank, refunds, voids, expenses] = await Promise.all([
    db('invoices')
      .whereBetween('created_at', [s, e])
      .whereNotIn('status', ['cancelled'])
      .select(
        db.raw('COUNT(DISTINCT id) AS sales_count'),
        db.raw('COALESCE(SUM(total_egp), 0) AS revenue_egp'),
      )
      .first(),

    db('cash_movements')
      .whereBetween('created_at', [s, e])
      .select(
        db.raw("COALESCE(SUM(CASE WHEN direction='in'  THEN amount_egp ELSE 0 END), 0) AS cash_in_egp"),
        db.raw("COALESCE(SUM(CASE WHEN direction='out' THEN amount_egp ELSE 0 END), 0) AS cash_out_egp"),
      )
      .first(),

    db('bank_movements')
      .whereBetween('created_at', [s, e])
      .select(
        db.raw("COALESCE(SUM(CASE WHEN direction='in'  THEN amount_egp ELSE 0 END), 0) AS bank_in_egp"),
        db.raw("COALESCE(SUM(CASE WHEN direction='out' THEN amount_egp ELSE 0 END), 0) AS bank_out_egp"),
      )
      .first(),

    db('returns')
      .whereBetween('processed_at', [s, e])
      .select(
        db.raw('COUNT(*) AS refund_count'),
        db.raw('COALESCE(SUM(total_refund_egp), 0) AS refund_total_egp'),
      )
      .first(),

    db('invoices')
      .where('status', 'cancelled')
      .whereBetween('cancelled_at', [s, e])
      .select(
        db.raw('COUNT(*) AS void_count'),
        db.raw('COALESCE(SUM(total_egp), 0) AS void_total_egp'),
      )
      .first(),

    db('expenses')
      .whereBetween('created_at', [s, e])
      .select(db.raw('COALESCE(SUM(amount_egp), 0) AS expenses_total_egp'))
      .first(),
  ]);

  return {
    date: today,
    sales_count:       toNum((sales as Record<string,unknown>)?.sales_count),
    revenue_egp:       toNum((sales as Record<string,unknown>)?.revenue_egp),
    cash_in_egp:       toNum((cash as Record<string,unknown>)?.cash_in_egp),
    cash_out_egp:      toNum((cash as Record<string,unknown>)?.cash_out_egp),
    bank_in_egp:       toNum((bank as Record<string,unknown>)?.bank_in_egp),
    bank_out_egp:      toNum((bank as Record<string,unknown>)?.bank_out_egp),
    refund_count:      toNum((refunds as Record<string,unknown>)?.refund_count),
    refund_total_egp:  toNum((refunds as Record<string,unknown>)?.refund_total_egp),
    void_count:        toNum((voids as Record<string,unknown>)?.void_count),
    void_total_egp:    toNum((voids as Record<string,unknown>)?.void_total_egp),
    expenses_total_egp:toNum((expenses as Record<string,unknown>)?.expenses_total_egp),
  };
}

// ── Cash position ─────────────────────────────────────────────────────────────

export async function cashPosition() {
  const drawer = await db('cash_drawer').where({ id: 1 }).first() as
    { current_balance_egp: string; opening_balance_egp: string } | undefined;

  const banks = await db('bank_accounts')
    .select('id', 'name_ar', 'bank_name_ar', 'is_default', 'is_active', 'current_balance_egp')
    .orderBy('is_default', 'desc')
    .orderBy('name_ar') as Array<{
      id: number; name_ar: string; bank_name_ar: string | null;
      is_default: boolean; is_active: boolean; current_balance_egp: string;
    }>;

  const lastRecons = await db('reconciliations')
    .select('type', 'bank_account_id', 'variance_egp', 'recon_date')
    .orderBy('recon_date', 'desc')
    .limit(50) as Array<{
      type: string; bank_account_id: number | null; variance_egp: string; recon_date: string;
    }>;

  const lastCashRecon = lastRecons.find((r) => r.type === 'cash');
  const bankReconsMap = new Map<number, (typeof lastRecons)[number]>();
  for (const r of lastRecons) {
    if (r.type === 'bank' && r.bank_account_id && !bankReconsMap.has(r.bank_account_id)) {
      bankReconsMap.set(r.bank_account_id, r);
    }
  }

  return {
    cash: {
      current_balance_egp: toNum(drawer?.current_balance_egp),
      last_recon_date:     lastCashRecon?.recon_date ?? null,
      last_recon_variance: lastCashRecon ? toNum(lastCashRecon.variance_egp) : null,
    },
    banks: banks.map((b) => {
      const recon = bankReconsMap.get(b.id);
      return {
        id: b.id,
        name_ar: b.name_ar,
        bank_name_ar: b.bank_name_ar,
        is_default: b.is_default,
        is_active: b.is_active,
        current_balance_egp: toNum(b.current_balance_egp),
        last_recon_date:     recon?.recon_date ?? null,
        last_recon_variance: recon ? toNum(recon.variance_egp) : null,
      };
    }),
  };
}

// ── Open invoices ─────────────────────────────────────────────────────────────

export async function openInvoices() {
  const rows = await db('invoices as i')
    .join('customers as c', 'i.customer_id', 'c.id')
    .where('i.status', 'open')
    .select(
      'i.id', 'i.invoice_no', 'i.total_egp', 'i.paid_egp', 'i.balance_egp',
      'i.created_at', 'c.full_name_ar as customer_name', 'c.phone as customer_phone',
    )
    .orderBy('i.created_at', 'asc') as Array<Record<string, unknown>>;

  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    age_days: Math.floor((now - new Date(r.created_at as string).getTime()) / 86_400_000),
  }));
}

// ── Stock summary ─────────────────────────────────────────────────────────────

export async function stockSummary() {
  const rows = await db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .select(
      'r.warehouse', 'r.status',
      db.raw('COUNT(*) AS roll_count'),
      db.raw('COALESCE(SUM(r.weight_kg), 0) AS total_weight_kg'),
      db.raw('COALESCE(SUM(r.selling_price_egp * r.weight_kg), 0) AS total_valuation_egp'),
    )
    .groupBy('r.warehouse', 'r.status') as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    warehouse:            r.warehouse,
    status:               r.status,
    roll_count:           toNum(r.roll_count),
    total_weight_kg:      toNum(r.total_weight_kg),
    total_valuation_egp:  toNum(r.total_valuation_egp),
  }));
}

// ── Top fabrics ───────────────────────────────────────────────────────────────

export async function topFabrics(period: '7d' | '30d' | '90d' = '7d', limit = 10) {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const rows = await db('invoice_lines as il')
    .join('invoices as i', 'il.invoice_id', 'i.id')
    .join('rolls as r', 'il.roll_id', 'r.id')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as col', 'r.color_id', 'col.id')
    .where('i.created_at', '>=', since)
    .whereNotIn('i.status', ['cancelled'])
    .select(
      'f.id as fabric_id', 'f.name_ar as fabric_name_ar',
      'col.id as color_id', 'col.name_ar as color_name_ar',
      db.raw('COUNT(il.id) AS roll_count'),
      db.raw('COALESCE(SUM(il.line_total_egp), 0) AS revenue_egp'),
    )
    .groupBy('f.id', 'f.name_ar', 'col.id', 'col.name_ar')
    .orderBy('revenue_egp', 'desc')
    .limit(limit) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    fabric_id:      r.fabric_id,
    fabric_name_ar: r.fabric_name_ar,
    color_id:       r.color_id,
    color_name_ar:  r.color_name_ar,
    roll_count:     toNum(r.roll_count),
    revenue_egp:    toNum(r.revenue_egp),
  }));
}

// ── Notifications for owner ───────────────────────────────────────────────────

export async function ownerNotifications(includeArchived = false, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const q = db('notifications')
    .where('recipient_role', 'owner')
    .orderBy('created_at', 'desc');

  if (!includeArchived) q.whereNull('archived_at');

  const [countRow] = await q.clone().clearSelect().count<Array<{ count: string }>>('id as count');
  const rows = await q.clone().select('*').limit(limit).offset(offset);

  return { rows, total: Number((countRow as { count: string }).count) };
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function auditLog(opts: {
  from?: string; to?: string; entity?: string; action?: string;
  severity?: string; page?: number; limit?: number;
}) {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 50;
  const offset = (page - 1) * limit;

  const q = db('audit_log as al')
    .leftJoin('users as u', 'al.user_id', 'u.id')
    .select('al.*', 'u.username as actor_username', 'u.full_name_ar as actor_name_ar');

  if (opts.from)     q.where('al.created_at', '>=', opts.from);
  if (opts.to)       q.where('al.created_at', '<=', opts.to);
  if (opts.entity)   q.where('al.entity', opts.entity);
  if (opts.action)   q.where('al.action', opts.action);
  if (opts.severity) q.where('al.severity', opts.severity);

  const [countRow] = await q.clone().clearSelect().count<Array<{ count: string }>>('al.id as count');
  const rows = await q.clone().orderBy('al.created_at', 'desc').limit(limit).offset(offset);

  return { rows, total: Number((countRow as { count: string }).count) };
}

// ── Expenses summary ──────────────────────────────────────────────────────────

export async function expensesSummary(from?: string, to?: string) {
  const q = db('expenses');
  if (from) q.where('created_at', '>=', from);
  if (to)   q.where('created_at', '<=', to);

  const rows = await q
    .select(
      'category',
      db.raw('COUNT(*) AS expense_count'),
      db.raw('COALESCE(SUM(amount_egp), 0) AS total_egp'),
    )
    .groupBy('category')
    .orderBy('total_egp', 'desc') as Array<Record<string, unknown>>;

  const [totals] = await db('expenses')
    .modify((qb) => { if (from) qb.where('created_at', '>=', from); if (to) qb.where('created_at', '<=', to); })
    .select(db.raw('COALESCE(SUM(amount_egp), 0) AS grand_total_egp')) as Array<Record<string, unknown>>;

  return {
    by_category: rows.map((r) => ({
      category:      r.category,
      expense_count: toNum(r.expense_count),
      total_egp:     toNum(r.total_egp),
    })),
    grand_total_egp: toNum(totals?.grand_total_egp),
  };
}

// ── Damage / loss ─────────────────────────────────────────────────────────────

export async function damageLoss(from?: string, to?: string) {
  const q = db('damage_events');
  if (from) q.where('created_at', '>=', from);
  if (to)   q.where('created_at', '<=', to);

  const rows = await q
    .select(
      'reason_code',
      db.raw('COUNT(*) AS event_count'),
      db.raw('COALESCE(SUM(valuation_egp), 0) AS total_valuation_egp'),
    )
    .groupBy('reason_code')
    .orderBy('total_valuation_egp', 'desc') as Array<Record<string, unknown>>;

  const [totals] = await db('damage_events')
    .modify((qb) => { if (from) qb.where('created_at', '>=', from); if (to) qb.where('created_at', '<=', to); })
    .select(db.raw('COALESCE(SUM(valuation_egp), 0) AS grand_total_egp')) as Array<Record<string, unknown>>;

  return {
    by_reason: rows.map((r) => ({
      reason_code:          r.reason_code,
      event_count:          toNum(r.event_count),
      total_valuation_egp:  toNum(r.total_valuation_egp),
    })),
    grand_total_egp: toNum(totals?.grand_total_egp),
  };
}

// ── Daily totals (cross-branch) ───────────────────────────────────────────────

export async function dailyTotals(from: string, to: string) {
  // created_at is timestamptz; `AT TIME ZONE 'Africa/Cairo'` returns the
  // wall-clock TIMESTAMP in Cairo. Adding `AT TIME ZONE 'UTC'` first would
  // double-shift by 2h and silently bucket sales into the wrong day.
  const { rows } = await db.raw<{ rows: Array<Record<string, unknown>> }>(`
    SELECT
      DATE(created_at AT TIME ZONE 'Africa/Cairo') AS date,
      COALESCE(SUM(CASE WHEN status NOT IN ('cancelled') THEN total_egp END), 0) AS revenue_egp,
      COALESCE(SUM(CASE WHEN status NOT IN ('cancelled') THEN
        (SELECT COALESCE(SUM(r.reference_price_per_unit * il2.line_total_egp / NULLIF(il2.selling_price_egp, 0)), 0)
         FROM invoice_lines il2
         JOIN rolls r ON il2.roll_id = r.id
         WHERE il2.invoice_id = invoices.id) END), 0) AS cost_egp
    FROM invoices
    WHERE DATE(created_at AT TIME ZONE 'Africa/Cairo') BETWEEN ? AND ?
    GROUP BY DATE(created_at AT TIME ZONE 'Africa/Cairo')
    ORDER BY date
  `, [from, to]);

  return rows.map((r) => {
    const revenue = toNum(r.revenue_egp);
    const cost    = toNum(r.cost_egp);
    return { date: r.date, revenue_egp: revenue, cost_egp: cost, net_egp: revenue - cost };
  });
}

// ── Hourly sales curve ────────────────────────────────────────────────────────

export async function hourlySalesCurve(date: string) {
  const { startUtc, endUtc } = cairoDayWindow(date);

  const { rows } = await db.raw<{ rows: Array<Record<string, unknown>> }>(`
    SELECT
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Cairo') AS hour,
      COUNT(*) AS count,
      COALESCE(SUM(total_egp), 0) AS revenue_egp
    FROM invoices
    WHERE created_at >= ? AND created_at < ?
      AND status NOT IN ('cancelled')
    GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Cairo')
    ORDER BY hour
  `, [startUtc.toISOString(), endUtc.toISOString()]);

  // Fill all 24 hours (0-23) with zeros for missing hours
  const map = new Map<number, { count: number; revenue_egp: number }>();
  for (const r of rows) {
    map.set(Number(r.hour), { count: toNum(r.count), revenue_egp: toNum(r.revenue_egp) });
  }
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count:      map.get(h)?.count      ?? 0,
    revenue_egp:map.get(h)?.revenue_egp ?? 0,
  }));
}

// ── Inventory turnover ────────────────────────────────────────────────────────

export async function inventoryTurnover(period: '7d' | '30d' | '90d' = '30d') {
  const days  = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [soldRow] = await db('rolls')
    .where('status', 'sold')
    .where('updated_at', '>=', since)
    .count<Array<{ count: string }>>('id as count');

  const [stockRow] = await db('rolls')
    .whereIn('status', ['in_stock', 'reserved'])
    .count<Array<{ count: string }>>('id as count');

  const sold    = toNum((soldRow as { count: string }).count);
  const inStock = toNum((stockRow as { count: string }).count);
  const ratio   = inStock > 0 ? Number((sold / inStock).toFixed(4)) : null;

  return { period, days_in_period: days, sold_rolls: sold, current_in_stock: inStock, turnover_ratio: ratio };
}
