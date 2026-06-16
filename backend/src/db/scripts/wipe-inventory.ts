/**
 * One-shot dev script: wipe inventory + sales data so the new
 * factory → shipment → shop → sale flow can be exercised on a clean slate.
 *
 * Refuses to run when NODE_ENV === 'production'.
 * Run with: `npm run db:wipe-inventory -w backend`
 */
import { db } from '../connection.js';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('[wipe-inventory] refusing to run in production');
    process.exit(1);
  }

  const tables = [
    // sales
    'payments',
    'invoice_status_history',
    'invoice_lines',
    'invoices',
    // returns
    'return_lines',
    'returns',
    // damage / stocktake
    'damage_events',
    'stocktake_lines',
    'stocktakes',
    // movements + shipments
    'stock_movements',
    'shipment_lines',
    'shipments',
    // rolls themselves
    'rolls',
  ];

  await db.transaction(async (trx) => {
    for (const t of tables) {
      const exists = await trx.schema.hasTable(t);
      if (!exists) {
        console.log(`[wipe-inventory] skip ${t} (table missing)`);
        continue;
      }
      await trx.raw(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`);
      console.log(`[wipe-inventory] truncated ${t}`);
    }

    // Reset the roll barcode sequence so new أتواب start clean at RMX-R-000001.
    const seqExists = await trx.schema.hasTable('db_sequences');
    if (seqExists) {
      await trx('db_sequences').where({ name: 'roll_barcode_seq' }).update({ last_value: 0 });
      console.log('[wipe-inventory] reset roll_barcode_seq');
    }
  });

  console.log('[wipe-inventory] done');
  await db.destroy();
}

main().catch((e) => {
  console.error('[wipe-inventory] failed:', e);
  process.exit(1);
});
