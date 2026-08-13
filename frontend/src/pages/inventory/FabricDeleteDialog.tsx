import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Archive, Trash2 } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { FabricBlocker, FabricFull, FabricUsage } from '@/lib/inventory-types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ResponsiveDialog';

const BLOCKER_LABELS: Record<FabricBlocker, string> = {
  invoice_lines: ar.fabrics.blockerInvoiceLines,
  return_lines: ar.fabrics.blockerReturnLines,
  shipment_lines: ar.fabrics.blockerShipmentLines,
  damage_events: ar.fabrics.blockerDamageEvents,
  stocktake_lines: ar.fabrics.blockerStocktakeLines,
};

/** The rows that get erased along with the material on a permanent delete. */
function sweptItems(u: FabricUsage): string[] {
  const parts: Array<[number, string]> = [
    [u.rolls_total, ar.fabrics.sweepRolls],
    [u.lots, ar.fabrics.sweepLots],
    [u.prices, ar.fabrics.sweepPrices],
    [u.stock_movements, ar.fabrics.sweepMovements],
  ];
  return parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
}

type Props = {
  fabric: FabricFull | null;
  /** Server-side failure text; kept rendered inside the dialog so it can't scroll out of view. */
  error: string | null;
  pending: boolean;
  onConfirm: (usage: FabricUsage) => void;
  onCancel: () => void;
};

/**
 * Confirms deleting a material, after telling the user which of the two
 * outcomes will happen — permanent delete or archive — and why. The shared
 * ConfirmDialog can't do this: it has no room for a preview, no pending state,
 * and closes on failure, which is what made a refused delete look like nothing
 * happening at all.
 */
export function FabricDeleteDialog({ fabric, error, pending, onConfirm, onCancel }: Props) {
  const usageQ = useQuery({
    queryKey: ['fabric-usage', fabric?.id],
    queryFn: () => inventoryApi.getFabricUsage(fabric!.id),
    enabled: fabric !== null,
    staleTime: 0,
    gcTime: 0,
  });

  const usage = usageQ.data;
  const swept = usage ? sweptItems(usage) : [];

  return (
    <Dialog open={fabric !== null} onOpenChange={(o) => { if (!o && !pending) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ar.fabrics.deleteTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="font-medium text-foreground">{fabric?.name_ar}</p>

          {usageQ.isLoading && (
            <p className="text-sm text-foreground-muted">{ar.fabrics.checkingUsage}</p>
          )}

          {usageQ.isError && (
            <div role="alert" className="p-3 rounded-md border border-danger/30 bg-danger-subtle text-sm text-danger-foreground">
              {ar.common.error}
            </div>
          )}

          {usage?.can_hard_delete && (
            <div className="p-3 rounded-md border border-danger/30 bg-danger-subtle space-y-2">
              <div className="flex items-center gap-2 font-medium text-danger-foreground">
                <Trash2 className="size-4 shrink-0" aria-hidden />
                {ar.fabrics.willDeleteTitle}
              </div>
              {swept.length > 0 ? (
                <>
                  <p className="text-sm text-danger-foreground">{ar.fabrics.willDeleteBody}</p>
                  <ul className="text-sm text-danger-foreground list-disc ps-5 space-y-0.5">
                    {swept.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-danger-foreground">{ar.fabrics.willDeleteNothing}</p>
              )}
            </div>
          )}

          {usage && !usage.can_hard_delete && (
            <div className="p-3 rounded-md border border-border bg-surface-muted space-y-2">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Archive className="size-4 shrink-0" aria-hidden />
                {ar.fabrics.willArchiveTitle}
              </div>
              <p className="text-sm text-foreground-muted">{ar.fabrics.willArchiveBody}</p>
              <p className="text-sm font-medium text-foreground pt-1">{ar.fabrics.archiveReasonsLabel}</p>
              <ul className="text-sm text-foreground-muted list-disc ps-5 space-y-0.5">
                {usage.blockers.map((b) => (
                  <li key={b}>{usage[b]} {BLOCKER_LABELS[b]}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-md border border-danger/30 bg-danger-subtle text-sm text-danger-foreground">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
              {ar.common.cancel}
            </Button>
            <Button
              size="sm"
              onClick={() => usage && onConfirm(usage)}
              disabled={pending || !usage}
            >
              {pending ? ar.loading : ar.common.confirm}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
