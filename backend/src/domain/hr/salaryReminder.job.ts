import cron, { type ScheduledTask } from 'node-cron';
import { db } from '../../db/connection.js';
import { logger } from '../../lib/logger.js';
import { cairoUpcomingThursday } from '../../lib/datetime/cairo.js';
import { notify } from '../notifications/notificationsService.js';

/**
 * Weekly salaries are paid every Thursday. Remind owner + accountant of the
 * active employees not yet paid for this Thursday. Does not move any money —
 * disbursement stays manual from the employee page.
 */
export async function runSalaryReminderJob(): Promise<{ payDate: string; unpaid: number }> {
  const payDate = cairoUpcomingThursday();
  const [row] = await db('hr_employees as e')
    .where('e.is_active', true)
    .whereNotExists(
      db('hr_salary_disbursements as d').whereRaw('d.employee_id = e.id').where('d.month', payDate),
    )
    .count<Array<{ count: string }>>('e.id as count');
  const unpaid = Number(row?.count ?? 0);
  if (unpaid === 0) return { payDate, unpaid };

  for (const recipientRole of ['owner', 'accountant'] as const) {
    await notify({
      recipientRole,
      severity: 'medium',
      eventType: 'hr_weekly_salary_due',
      titleAr: 'موعد صرف الرواتب الأسبوعية',
      bodyAr: `اليوم الخميس ${payDate}: ${unpaid} موظف لم يُصرف راتبه الأسبوعي بعد`,
      payload: { pay_date: payDate, unpaid_count: unpaid },
    });
  }
  return { payDate, unpaid };
}

let task: ScheduledTask | null = null;

export function startSalaryReminderCron(): void {
  if (task) return;
  // Every Thursday at 10:00 Africa/Cairo
  task = cron.schedule(
    '0 10 * * 4',
    () => {
      runSalaryReminderJob()
        .then((r) => logger.info(r, 'weekly salary reminder job completed'))
        .catch((e) => logger.error({ err: e }, 'weekly salary reminder job failed'));
    },
    { timezone: 'Africa/Cairo' },
  );
  logger.info('weekly salary reminder cron scheduled (Thursday 10:00 Cairo)');
}

export function stopSalaryReminderCron(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
