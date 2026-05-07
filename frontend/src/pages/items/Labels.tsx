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
} from '@/components/ResponsiveDialog';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { MobileFilterSheet } from '@/components/MobileFilterSheet';

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
  const activeFilters = Object.values(filters).filter((v) => v.trim()).length;

  function toggleSelect(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rolls.length) setSelected(new Set());
    else setSelected(new Set(rolls.map((r) => r.id)));
  }

  function handleSearch() {
    setSelected(new Set());
    setApplied({ ...filters });
  }

  const filterControls = (
    <Card>
      <CardHeader>
        <CardTitle>{ar.labels.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>{ar.labels.fabricFilter}</Label>
            <Input
              value={filters.fabric}
              onChange={(e) => setFilters((f) => ({ ...f, fabric: e.target.value }))}
              placeholder={ar.labels.fabricFilter}
              dir="rtl"
              className="h-11 md:h-10"
            />
          </div>
          <div className="space-y-1">
            <Label>{ar.labels.colorFilter}</Label>
            <Input
              value={filters.color}
              onChange={(e) => setFilters((f) => ({ ...f, color: e.target.value }))}
              placeholder={ar.labels.colorFilter}
              dir="rtl"
              className="h-11 md:h-10"
            />
          </div>
          <div className="space-y-1">
            <Label>{ar.labels.rollSrNoFilter}</Label>
            <Input
              value={filters.rollSrNo}
              onChange={(e) => setFilters((f) => ({ ...f, rollSrNo: e.target.value }))}
              placeholder="SR-001"
              dir="ltr"
              className="h-11 md:h-10"
            />
          </div>
          <div className="space-y-1">
            <Label>{ar.labels.barcodeFilter}</Label>
            <Input
              value={filters.barcodePartial}
              onChange={(e) => setFilters((f) => ({ ...f, barcodePartial: e.target.value }))}
              placeholder="RMX-R-"
              dir="ltr"
              className="h-11 md:h-10"
            />
          </div>
        </div>
        <Button onClick={handleSearch} disabled={q.isFetching} className="h-11 md:h-10 w-full md:w-auto">
          {q.isFetching ? ar.loading : ar.labels.search}
        </Button>
      </CardContent>
    </Card>
  );

  const columns: Column<RollWithDetails>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={selected.size === rolls.length && rolls.length > 0}
          onChange={toggleAll}
          className="size-4"
          aria-label="تحديد الكل"
        />
      ),
      cell: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onChange={() => toggleSelect(r.id)}
          onClick={(e) => e.stopPropagation()}
          className="size-5"
          aria-label={`تحديد ${r.internal_barcode}`}
        />
      ),
      width: '2rem',
      hideOnMobile: true,
    },
    {
      key: 'fabric',
      header: ar.labels.fabricFilter,
      cell: (r) => (
        <span className="inline-flex items-center gap-2 md:gap-0">
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={() => toggleSelect(r.id)}
            onClick={(e) => e.stopPropagation()}
            className="size-5 md:hidden"
            aria-label={`تحديد ${r.internal_barcode}`}
          />
          {r.fabric_name_ar}
        </span>
      ),
      primary: true,
    },
    {
      key: 'sr_no',
      header: ar.labels.rollSrNoFilter,
      cell: (r) => <span className="font-mono text-xs">{r.roll_sr_no ?? '—'}</span>,
      secondary: true,
    },
    { key: 'color', header: ar.labels.colorFilter, cell: (r) => r.color_name_ar, secondary: true },
    {
      key: 'barcode',
      header: ar.labels.barcode,
      cell: (r) => <span className="font-mono text-xs" dir="ltr">{r.internal_barcode}</span>,
    },
    {
      key: 'weight',
      header: ar.labels.weight,
      cell: (r) => <span dir="ltr">{Number(r.weight_kg).toFixed(3)} kg</span>,
    },
    {
      key: 'status',
      header: ar.labels.status,
      cell: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <MobileFilterSheet activeCount={activeFilters}>{filterControls}</MobileFilterSheet>

      {/* Results */}
      {applied !== null && (
        <>
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              {ar.labels.results}: {rolls.length}
              {selected.size > 0 ? ` · المحدد: ${selected.size}` : ''}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleAll}
                disabled={rolls.length === 0}
                className="md:hidden h-11"
              >
                {selected.size === rolls.length && rolls.length > 0 ? 'إلغاء الكل' : 'تحديد الكل'}
              </Button>
              {selected.size > 0 && (
                <Button
                  size="sm"
                  disabled={batchMut.isPending}
                  onClick={() => batchMut.mutate(Array.from(selected))}
                  className="h-11 md:h-9 flex-1 sm:flex-none"
                >
                  {ar.labels.printBatch} ({selected.size})
                </Button>
              )}
            </div>
          </div>

          <ResponsiveTable
            columns={columns}
            rows={rolls}
            rowKey={(r) => String(r.id)}
            empty={ar.common.none}
            actions={(r) => (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" asChild>
                  <a href={itemsApi.labelPdfUrl(r.id)} target="_blank" rel="noreferrer">
                    {ar.labels.print}
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setReprintTarget(r); setReprintReason(''); }}
                >
                  {ar.labels.reprint}
                </Button>
              </div>
            )}
          />
        </>
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
                  className="h-11 md:h-10"
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
