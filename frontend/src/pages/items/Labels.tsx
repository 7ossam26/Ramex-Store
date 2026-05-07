import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { itemsApi } from '@/lib/items-api';
import type { RollWithDetails } from '@/lib/items-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function openBlobPdf(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function LabelsPage() {
  const [filters, setFilters] = useState({ fabric: '', color: '', rollSrNo: '', barcodePartial: '' });
  const [applied, setApplied] = useState<typeof filters | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reprintTarget, setReprintTarget] = useState<RollWithDetails | null>(null);
  const [reprintReason, setReprintReason] = useState('');

  const q = useQuery({
    queryKey: ['rolls-search', applied],
    queryFn: () =>
      applied
        ? itemsApi.searchRolls({
            fabric: applied.fabric || undefined,
            color: applied.color || undefined,
            rollSrNo: applied.rollSrNo || undefined,
            barcodePartial: applied.barcodePartial || undefined,
          })
        : Promise.resolve<RollWithDetails[]>([]),
    enabled: applied !== null,
  });

  const batchMut = useMutation({
    mutationFn: (ids: number[]) => itemsApi.batchLabelsPdf(ids),
    onSuccess: (blob) => openBlobPdf(blob),
  });

  const reprintMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      itemsApi.reprintLabel(id, reason),
    onSuccess: (blob) => {
      openBlobPdf(blob);
      setReprintTarget(null);
      setReprintReason('');
    },
  });

  const rolls = q.data ?? [];

  function toggleSelect(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rolls.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rolls.map((r) => r.id)));
    }
  }

  function handleSearch() {
    setSelected(new Set());
    setApplied({ ...filters });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>{ar.labels.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>{ar.labels.fabricFilter}</Label>
              <Input
                value={filters.fabric}
                onChange={(e) => setFilters((f) => ({ ...f, fabric: e.target.value }))}
                placeholder={ar.labels.fabricFilter}
                dir="rtl"
              />
            </div>
            <div className="space-y-1">
              <Label>{ar.labels.colorFilter}</Label>
              <Input
                value={filters.color}
                onChange={(e) => setFilters((f) => ({ ...f, color: e.target.value }))}
                placeholder={ar.labels.colorFilter}
                dir="rtl"
              />
            </div>
            <div className="space-y-1">
              <Label>{ar.labels.rollSrNoFilter}</Label>
              <Input
                value={filters.rollSrNo}
                onChange={(e) => setFilters((f) => ({ ...f, rollSrNo: e.target.value }))}
                placeholder="SR-001"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>{ar.labels.barcodeFilter}</Label>
              <Input
                value={filters.barcodePartial}
                onChange={(e) => setFilters((f) => ({ ...f, barcodePartial: e.target.value }))}
                placeholder="RMX-R-"
                dir="ltr"
              />
            </div>
          </div>
          <Button onClick={handleSearch} disabled={q.isFetching}>
            {q.isFetching ? ar.loading : ar.labels.search}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {applied !== null && (
        <Card>
          <CardHeader className="flex-row items-center justify-between py-3">
            <CardTitle className="text-base">
              {ar.labels.results}: {rolls.length}
            </CardTitle>
            {selected.size > 0 && (
              <Button
                size="sm"
                disabled={batchMut.isPending}
                onClick={() => batchMut.mutate(Array.from(selected))}
              >
                {ar.labels.printBatch} ({selected.size})
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {rolls.length === 0 ? (
              <p className="text-center text-muted-foreground p-6">{ar.common.none}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-right text-xs text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-2 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === rolls.length && rolls.length > 0}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="p-2">{ar.labels.rollSrNoFilter}</th>
                    <th className="p-2">{ar.labels.fabricFilter}</th>
                    <th className="p-2">{ar.labels.colorFilter}</th>
                    <th className="p-2">{ar.labels.barcode}</th>
                    <th className="p-2">{ar.labels.weight}</th>
                    <th className="p-2">{ar.labels.status}</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rolls.map((roll) => (
                    <tr key={roll.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(roll.id)}
                          onChange={() => toggleSelect(roll.id)}
                        />
                      </td>
                      <td className="p-2 font-mono text-xs">{roll.roll_sr_no ?? '—'}</td>
                      <td className="p-2">{roll.fabric_name_ar}</td>
                      <td className="p-2">{roll.color_name_ar}</td>
                      <td className="p-2 font-mono text-xs" dir="ltr">{roll.internal_barcode}</td>
                      <td className="p-2" dir="ltr">{Number(roll.weight_kg).toFixed(3)} kg</td>
                      <td className="p-2">
                        <StatusBadge status={roll.status} />
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                          >
                            <a
                              href={itemsApi.labelPdfUrl(roll.id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {ar.labels.print}
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setReprintTarget(roll); setReprintReason(''); }}
                          >
                            {ar.labels.reprint}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reprint dialog */}
      <Dialog open={!!reprintTarget} onOpenChange={(o) => !o && setReprintTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ar.labels.reprintTitle}</DialogTitle>
          </DialogHeader>
          {reprintTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {reprintTarget.fabric_name_ar} / {reprintTarget.color_name_ar}
                {' · '}
                <span dir="ltr">{reprintTarget.internal_barcode}</span>
              </p>
              <div className="space-y-1">
                <Label>{ar.labels.reprintReason}</Label>
                <Input
                  value={reprintReason}
                  onChange={(e) => setReprintReason(e.target.value)}
                  placeholder={ar.labels.reprintReasonPlaceholder}
                  dir="rtl"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setReprintTarget(null)}>
                  {ar.common.cancel}
                </Button>
                <Button
                  disabled={reprintMut.isPending}
                  onClick={() =>
                    reprintMut.mutate({
                      id: reprintTarget.id,
                      reason: reprintReason || 'lost_label',
                    })
                  }
                >
                  {ar.labels.reprintConfirm}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const statusColors: Record<string, string> = {
  in_stock: 'bg-green-100 text-green-800',
  reserved: 'bg-yellow-100 text-yellow-800',
  sold: 'bg-gray-100 text-gray-600',
  damaged: 'bg-red-100 text-red-800',
  sample: 'bg-blue-100 text-blue-800',
  returned: 'bg-purple-100 text-purple-800',
  written_off: 'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }: { status: string }) {
  const key = status as keyof typeof statusColors;
  const cls = statusColors[key] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${cls}`}>
      {ar.rollStatuses[key as keyof typeof ar.rollStatuses] ?? status}
    </span>
  );
}
