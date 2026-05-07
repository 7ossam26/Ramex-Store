import { logger } from '../../lib/logger.js';

export type NotifySeverity = 'low' | 'medium' | 'high' | 'critical';
export type NotifyRecipient = { role?: 'owner' | 'shop_seller' | 'factory_sender'; userId?: number };

// Phase 9 will replace this with the real notifications module + bell icon UI.
// For now we structured-log so the events are observable in dev.
export async function notify(
  recipient: NotifyRecipient,
  severity: NotifySeverity,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  logger.info(
    { notify: true, recipient, severity, event, ...payload },
    `notify[${severity}] ${event}`,
  );
}
