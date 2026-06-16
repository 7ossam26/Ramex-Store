import { useState } from 'react';
import { Printer, RotateCcw, ScanBarcode, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { itemsApi } from '@/lib/items-api';
import { inventoryApi } from '@/lib/inventory-api';
import { openPdfBlob } from '@/lib/pdf';
import type { RollWithDetails } from '@/lib/items-types';
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
import { PageShell } from '@/components/Layout/PageShell';
import { RollStatusPill } from '@/components/items/RollStatusPill';

export function LabelsPage() {
  const [filters, setFilters] = useState({ barcode: '', fabric: '', color: '', rollSrNo: '', status: '', warehouse: '' });
  const [applied, setApplied] = useState<typeof filters | null>({ barcode: '', fabric: '', color: '', rollSrNo: '', status: '', warehouse: '' });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reprintTarget, setReprintTarget] = useState<RollWithDetails | null>(null);
  const [reprintReason, setReprintReason] = useState('');

  const fabricsQ = useQuery({ queryKey: ['fabrics-list'], queryFn: inventoryApi.listFabrics });
  const colorsQ = useQuery({ queryKey: ['colors-list'], queryFn: inventoryApi.listColors });

  const q = useQuery({
    queryKey: ['rolls-search', applied],
    queryFn: () =>
      applied
        ? itemsApi.searchRolls({
            fabric: applied.fabric || undefined,
            color: applied.color || undefined,
            rollSrNo: applied.rollSrNo || undefined,
            barcodePartial: applied.barcode || undefined,
            warehouse: applied.warehouse || undefined,
          })
        : Promise.resolve<RollWithDetails[]>([]),
    enabled: applied !== null,
  });

  const batchMut = useMutation({
    mutationFn: (ids: number[]) => itemsApi.batchLabelsPdf(ids),
    onSuccess: (blob) => openPdfBlob(blob),
  });

  const labelPdfMut = useMutation({
    mutationFn: (rollId: number) => itemsApi.labelPdfBlob(rollId),
    onSuccess: (blob) => openPdfBlob(blob),
  });

  const reprintMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      itemsApi.reprintLabel(id, reason),
    onSuccess: (blob) => {
      openPdfBlob(blob);
      setReprintTarget(null);
      setReprintReason('');
    },
  });

  const rolls = (q.data ?? []).filter((r) => {
    if (applied?.status && r.status !== applied.status) return false;
    if (applied?.warehouse === 'shop' && r.status !== 'in_stock') return false;
    return true;
  });
  const activeFilters = Object.values(filters).filter((v) => v.trim()).length;
  const resetKey = JSON.stringify(applied);

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

  function handleReset() {
    const empty = { barcode: '', fabric: '', color: '', rollSrNo: '', status: '', warehouse: '' };
    setFilters(empty);
    setApplied(empty);
    setSelected(new Set());
  }

  const selectClass =
    'flex h-11 md:h-10 w-full rounded border border-border bg-canvas px-3 py-2 text-sm focus-visible:outline-none focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 cursor-pointer appearance-none';

  const filterControls = (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3 space-y-3">
      <h2 className="text-base font-semibold text-foreground">{ar.labels.title}</h2>

      {/* Barcode — primary filter, always autofocused */}
      <div className="space-y-1">
        <Label className="text-sm font-medium text-foreground">{ar.labels.barcode}</Label>
        <div className="relative">
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
            <span className="absolute size-6 rounded-full bg-ring/20 animate-ping" />
            <ScanBarcode className="relative size-4 text-ring" aria-hidden />
          </span>
          <Input
            autoFocus
            value={filters.barcode}
            onChange={(e) => setFilters((f) => ({ ...f, barcode: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="RMX-R-000001"
            dir="ltr"
            className="h-11 md:h-10 pr-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.labels.fabricFilter}</Label>
          <select
            value={filters.fabric}
            onChange={(e) => setFilters((f) => ({ ...f, fabric: e.target.value }))}
            dir="rtl"
            className={selectClass}
          >
            <option value="">{ar.labels.fabricFilter}</option>
            {(fabricsQ.data ?? []).map((fab) => (
              <option key={fab.id} value={fab.name_ar}>{fab.name_ar}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.labels.colorFilter}</Label>
          <select
            value={filters.color}
            onChange={(e) => setFilters((f) => ({ ...f, color: e.target.value }))}
            dir="rtl"
            className={selectClass}
          >
            <option value="">{ar.labels.colorFilter}</option>
            {(colorsQ.data ?? []).map((col) => (
              <option key={col.id} value={col.name_ar}>{col.name_ar}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.labels.status}</Label>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            dir="rtl"
            className={selectClass}
          >
            <option value="">{ar.labels.status}</option>
            {Object.entries(ar.rollStatuses as Record<string, string>).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.labels.rollSrNoFilter}</Label>
          <Input
            value={filters.rollSrNo}
            onChange={(e) => setFilters((f) => ({ ...f, rollSrNo: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="SR-001"
            dir="ltr"
            className="h-11 md:h-10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.inventory.warehouse}</Label>
          <select
            value={filters.warehouse}
            onChange={(e) => setFilters((f) => ({ ...f, warehouse: e.target.value }))}
            dir="rtl"
            className={selectClass}
          >
            <option value="">كل المخازن</option>
            <option value="shop">{ar.warehouses.shop}</option>
            <option value="factory">{ar.warehouses.factory}</option>
            <option value="damaged_shop">{ar.warehouses.damaged_shop}</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={handleSearch} disabled={q.isFetching} className="h-11 md:h-10">
          {q.isFetching ? ar.loading : ar.labels.search}
        </Button>
        {activeFilters > 0 && (
          <Button
            variant="outline"
            onClick={handleReset}
            className="h-11 md:h-10 gap-1.5"
          >
            <X className="size-3.5" aria-hidden />
            مسح الفلاتر
          </Button>
        )}
      </div>
    </div>
  );

  const columns: Column<RollWithDetails>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={selected.size === rolls.length && rolls.length > 0}
          onChange={toggleAll}
          className="size-4 accent-accent cursor-pointer"
          aria-label="تحديد الكل"
        />
      ),
      cell: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onChange={() => toggleSelect(r.id)}
          onClick={(e) => e.stopPropagation()}
          className="size-5 accent-accent cursor-pointer"
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
            className="size-5 md:hidden accent-accent cursor-pointer"
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
      cell: (r) => <span className="font-mono text-sm text-foreground">{r.roll_sr_no ?? '—'}</span>,
      secondary: true,
    },
    { key: 'color', header: ar.labels.colorFilter, cell: (r) => r.color_name_ar, secondary: true },
    {
      key: 'barcode',
      header: ar.labels.barcode,
      cell: (r) => <span className="font-mono text-sm tabular-num" dir="ltr">{r.internal_barcode}</span>,
    },
    {
      key: 'weight',
      header: ar.labels.weight,
      cell: (r) => <span className="tabular-num" dir="ltr">{Number(r.weight_kg).toFixed(3)} kg</span>,
    },
    {
      key: 'status',
      header: ar.labels.status,
      cell: (r) => <RollStatusPill status={r.status} />,
    },
  ];

  return (
    <PageShell title={ar.labels.title} description={ar.hubs.itemsLabelsDesc} backTo="/items">
      <MobileFilterSheet activeCount={activeFilters}>{filterControls}</MobileFilterSheet>

      {/* Results */}
      {applied !== null && (
        <>
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-sm text-foreground-muted">
              {ar.labels.results}: <span className="tabular-num text-foreground" dir="ltr">{rolls.length}</span>
              {selected.size > 0 ? <> · المحدد: <span className="tabular-num text-foreground" dir="ltr">{selected.size}</span></> : ''}
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
            isLoading={q.isLoading}
            isError={q.isError}
            onRetry={() => q.refetch()}
            resetKey={resetKey}
            actions={(r) => (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={labelPdfMut.isPending && labelPdfMut.variables === r.id}
                  onClick={() => labelPdfMut.mutate(r.id)}
                  aria-label={ar.labels.print}
                >
                  <Printer className="size-4" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setReprintTarget(r); setReprintReason(''); }}
                  aria-label={ar.labels.reprint}
                >
                  <RotateCcw className="size-4" aria-hidden />
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
              <p className="text-sm text-foreground-muted">
                {reprintTarget.fabric_name_ar} / {reprintTarget.color_name_ar}
                {' · '}
                <span className="font-mono tabular-num" dir="ltr">{reprintTarget.internal_barcode}</span>
              </p>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.labels.reprintReason}</Label>
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
    </PageShell>
  );
}
