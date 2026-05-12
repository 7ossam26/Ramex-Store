import { StatusPill, type StatusTone } from '@/components/StatusPill';
import { ar } from '@/i18n/ar';
import type { ShipmentStatus } from '@/lib/inventory-types';

/* Shipment status → semantic tone:
 *  draft             → neutral
 *  pending_approval  → warning (action needed by shop seller)
 *  partial_approved  → info
 *  approved          → success
 *  rejected          → danger
 *  cancelled         → neutral
 */
const TONE: Record<ShipmentStatus, StatusTone> = {
  draft: 'neutral',
  pending_approval: 'warning',
  partial_approved: 'info',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export function ShipmentStatusPill({ status }: { status: ShipmentStatus }) {
  return <StatusPill tone={TONE[status]}>{ar.shipments.status[status]}</StatusPill>;
}
