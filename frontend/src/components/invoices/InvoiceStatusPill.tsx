import { StatusPill, type StatusTone } from '@/components/StatusPill';
import { ar } from '@/i18n/ar';
import type { InvoiceStatus } from '@/lib/sales-types';

/* Invoice status → semantic tone:
 *  open                    → warning  (action needed: balance due)
 *  closed_pending_pickup   → info     (awaiting pickup)
 *  completed               → success
 *  cancelled               → danger
 *  deposit_refunded        → neutral  (settled — over-deposit returned to customer)
 *  partially_returned      → warning  (some lines back, invoice still partly a live sale)
 *  returned                → danger   (fully reversed — must not read as a normal completed sale)
 */
const TONE: Record<InvoiceStatus, StatusTone> = {
  open: 'warning',
  closed_pending_pickup: 'info',
  completed: 'success',
  cancelled: 'danger',
  deposit_refunded: 'neutral',
  partially_returned: 'warning',
  returned: 'danger',
};

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return <StatusPill tone={TONE[status]}>{ar.invoices.statuses[status]}</StatusPill>;
}
