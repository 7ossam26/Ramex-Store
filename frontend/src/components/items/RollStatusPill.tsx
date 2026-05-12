import { StatusPill, type StatusTone } from '@/components/StatusPill';
import { ar } from '@/i18n/ar';

/* Roll status → semantic tone map.
 *  in_stock      → success (available for sale)
 *  reserved      → info    (held by an open invoice)
 *  sold          → neutral (terminal, expected)
 *  damaged       → danger
 *  sample        → info    (special handling)
 *  returned      → warning (needs review back into stock)
 *  written_off   → neutral (terminal, accepted)
 */
const TONE: Record<string, StatusTone> = {
  in_stock: 'success',
  reserved: 'info',
  sold: 'neutral',
  damaged: 'danger',
  sample: 'info',
  returned: 'warning',
  written_off: 'neutral',
};

export function RollStatusPill({ status }: { status: string }) {
  const tone = TONE[status] ?? 'neutral';
  const label =
    (ar.rollStatuses as Record<string, string>)[status] ?? status;
  return <StatusPill tone={tone}>{label}</StatusPill>;
}
