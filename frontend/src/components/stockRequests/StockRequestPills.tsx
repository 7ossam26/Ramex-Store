import { StatusPill, type StatusTone } from '@/components/StatusPill';
import { ar } from '@/i18n/ar';
import type { StockRequestItemOutcome, StockRequestStatus } from '@/lib/stock-requests-types';

const REQUEST_TONE: Record<StockRequestStatus, StatusTone> = {
  open: 'warning',            // the factory has to act
  in_progress: 'info',
  awaiting_review: 'warning', // the shop has to act
  completed: 'success',
  cancelled: 'neutral',
};

const OUTCOME_TONE: Record<StockRequestItemOutcome, StatusTone> = {
  waiting: 'neutral',
  packing: 'info',
  awaiting_review: 'warning',
  accepted: 'success',
  rejected: 'danger',
  unavailable: 'danger',
  cancelled: 'neutral',
};

export function StockRequestStatusPill({ status }: { status: StockRequestStatus }) {
  return <StatusPill tone={REQUEST_TONE[status]}>{ar.stockRequests.status[status] ?? status}</StatusPill>;
}

export function ItemOutcomePill({ outcome }: { outcome: StockRequestItemOutcome }) {
  return <StatusPill tone={OUTCOME_TONE[outcome]}>{ar.stockRequests.outcome[outcome] ?? outcome}</StatusPill>;
}
