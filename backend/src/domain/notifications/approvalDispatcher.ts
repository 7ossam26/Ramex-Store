import { logger } from '../../lib/logger.js';
import { completeVoid } from '../sales/invoices.service.js';
import { approveDamageEvent } from '../inventory/damage.service.js';
import { approveExpense } from '../finance/expensesService.js';

type BlockedPayload = Record<string, unknown>;

export async function dispatch(
  blockedActionPayload: BlockedPayload,
  ownerUserId: number,
): Promise<void> {
  const actionType = blockedActionPayload.actionType as string | undefined;

  switch (actionType) {
    case 'void_invoice': {
      const invoiceId = Number(blockedActionPayload.invoiceId);
      const reasonAr = String(blockedActionPayload.reasonAr ?? 'موافقة المالك');
      await completeVoid(invoiceId, ownerUserId, reasonAr);
      logger.info({ invoiceId, ownerUserId }, 'void_invoice dispatched via approval');
      break;
    }

    case 'damage_event_high_value': {
      const eventId = Number(blockedActionPayload.eventId);
      await approveDamageEvent(eventId, ownerUserId);
      logger.info({ eventId, ownerUserId }, 'damage_event_high_value dispatched via approval');
      break;
    }

    case 'expense_high_value': {
      const expenseId = Number(blockedActionPayload.expenseId);
      await approveExpense(expenseId, ownerUserId);
      logger.info({ expenseId, ownerUserId }, 'expense_high_value dispatched via approval');
      break;
    }

    default:
      logger.warn({ actionType, ownerUserId }, 'approvalDispatcher: unknown actionType — no-op');
  }
}
