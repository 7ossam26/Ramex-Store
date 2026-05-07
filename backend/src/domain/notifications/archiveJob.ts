import cron, { type ScheduledTask } from 'node-cron';
import { db } from '../../db/connection.js';
import { logger } from '../../lib/logger.js';

export async function runArchiveJob(): Promise<{ archived: number }> {
  const result = await db('notifications')
    .whereNull('archived_at')
    .whereRaw(`created_at < NOW() - INTERVAL '7 days'`)
    .update({ archived_at: db.fn.now() });

  return { archived: result };
}

let task: ScheduledTask | null = null;

export function startArchiveCron(): void {
  if (task) return;
  // Daily at 03:00 Africa/Cairo
  task = cron.schedule(
    '0 3 * * *',
    () => {
      runArchiveJob()
        .then((r) => {
          if (r.archived > 0) {
            logger.info({ archived: r.archived }, 'notification archive job completed');
          }
        })
        .catch((e) => logger.error({ err: e }, 'notification archive job failed'));
    },
    { timezone: 'Africa/Cairo' },
  );
  logger.info('notification archive cron scheduled (daily 03:00 Cairo)');
}

export function stopArchiveCron(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
