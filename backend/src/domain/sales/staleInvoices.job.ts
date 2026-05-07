import cron, { type ScheduledTask } from 'node-cron';
import { db } from '../../db/connection.js';
import { logger } from '../../lib/logger.js';
import { notify } from '../inventory/notifications.service.js';
import { getSetting } from '../settings/settings.service.js';

const NOTIFY_COOLDOWN_HOURS = 24;

/**
 * Scan open invoices that have aged past `stale_invoice_days`. For each
 * invoice without a notification in the last 24h, push a Medium-severity
 * Owner notification and stamp `last_stale_notified_at`.
 *
 * Idempotent: rerunning immediately is a no-op because the cooldown
 * filter excludes recently-notified invoices.
 */
export async function runStaleInvoiceCheck(): Promise<{ notified: number }> {
  const days = await getSetting<number>(undefined, 'stale_invoice_days', 7);
  const cutoffSql = `NOW() - INTERVAL '${Number(days)} days'`;
  const cooldownSql = `NOW() - INTERVAL '${NOTIFY_COOLDOWN_HOURS} hours'`;

  const invoices = await db('invoices as i')
    .leftJoin('customers as c', 'i.customer_id', 'c.id')
    .where('i.status', 'open')
    .whereRaw(`i.created_at < ${cutoffSql}`)
    .where((qb) =>
      qb
        .whereNull('i.last_stale_notified_at')
        .orWhereRaw(`i.last_stale_notified_at < ${cooldownSql}`),
    )
    .select(
      'i.id',
      'i.invoice_no',
      'i.created_at',
      'i.balance_egp',
      'c.name_ar as customer_name_ar',
    );

  for (const inv of invoices) {
    const ageDays = Math.floor(
      (Date.now() - new Date(inv.created_at).getTime()) / 86_400_000,
    );
    await notify({ role: 'owner' }, 'medium', 'stale_open_invoice', {
      invoice_id: inv.id,
      invoice_no: inv.invoice_no,
      customer_name_ar: inv.customer_name_ar,
      age_days: ageDays,
      balance_egp: Number(inv.balance_egp),
    });
    await db('invoices').where({ id: inv.id }).update({
      last_stale_notified_at: db.fn.now(),
    });
  }

  return { notified: invoices.length };
}

let task: ScheduledTask | null = null;

export function startStaleInvoiceCron(): void {
  if (task) return;
  // Hourly. Cooldown logic prevents duplicate notifications.
  task = cron.schedule('0 * * * *', () => {
    runStaleInvoiceCheck()
      .then((r) => {
        if (r.notified > 0) {
          logger.info({ notified: r.notified }, 'stale invoice notifications dispatched');
        }
      })
      .catch((e) => logger.error({ err: e }, 'stale invoice cron failed'));
  });
  logger.info('stale invoice cron scheduled (hourly)');
}

export function stopStaleInvoiceCron(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
