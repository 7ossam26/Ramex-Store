/**
 * One-off CLI for verifying the stale-invoice job end-to-end.
 *
 * Usage (from backend/):
 *   npx tsx scripts/trigger-stale-check.ts
 *   npx tsx scripts/trigger-stale-check.ts --backdate <invoiceId> <days>
 *
 * The --backdate variant updates a single invoice's `created_at` to NOW() - days
 * before triggering the job — handy for forcing a notification without waiting
 * for real-world time to pass. Restore the invoice's `created_at` manually
 * afterward if needed.
 */
import { db } from '../src/db/connection.js';
import { runStaleInvoiceCheck } from '../src/domain/sales/staleInvoices.job.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const backdateIdx = args.indexOf('--backdate');
  if (backdateIdx !== -1) {
    const invoiceId = Number(args[backdateIdx + 1]);
    const days = Number(args[backdateIdx + 2]);
    if (!Number.isFinite(invoiceId) || !Number.isFinite(days) || invoiceId <= 0 || days <= 0) {
      console.error('Usage: --backdate <invoiceId> <days>');
      process.exit(2);
    }
    const updated = await db('invoices')
      .where({ id: invoiceId })
      .update({
        created_at: db.raw(`NOW() - INTERVAL '${days} days'`),
        last_stale_notified_at: null,
      });
    if (updated === 0) {
      console.error(`Invoice ${invoiceId} not found.`);
      process.exit(3);
    }
    console.log(`Backdated invoice ${invoiceId} by ${days} days, cleared last_stale_notified_at.`);
  }

  const result = await runStaleInvoiceCheck();
  console.log('Stale check complete:', result);
}

main()
  .catch((e) => {
    console.error('FAIL:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.destroy();
  });
