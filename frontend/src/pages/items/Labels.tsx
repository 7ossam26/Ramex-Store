import { useState } from 'react';
import { Printer, RotateCcw, ScanBarcode, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { itemsApi } from '@/lib/items-api';
import { inventoryApi } from '@/lib/inventory-api';
import { accessoriesApi } from '@/lib/accessories-api';
import { openPdfBlob } from '@/lib/pdf';
import type { RollWithDetails } from '@/lib/items-types';
import type { Accessory } from '@/lib/accessories-types';
import { rollQtyLabel } from '@/lib/fabric-unit';
import { usePermissions } from '@/lib/permissions';
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
import { StatusPill } from '@/components/StatusPill';

type ItemType = 'all' | 'tops' | 'accessories';

// A Labels-page row is either a fabric roll (توب) or an accessory (اكسسوار).
// Both carry `id`, `internal_barcode` and `created_at`; the `kind` discriminant
// lets the shared table, selection and print flows treat them uniformly while
// each still routes to its own existing label endpoint.
type LabelRow =
  | ({ kind: 'roll' } & RollWithDetails)
  | ({ kind: 'accessory' } & Accessory);

// Composite key — a roll and an accessory can share a numeric id, so the
// selection Set and table rowKey are namespaced by kind (`roll:12`, `accessory:12`).
const rowKeyOf = (row: LabelRow) => `${row.kind}:${row.id}`;

type Filters = {
  barcode: string;
  fabric: string;
  color: string;
  rollSrNo: string;
  status: string;
  warehouse: string;
  itemType: ItemType;
};

const EMPTY_FILTERS: Filters = {
  barcode: '', fabric: '', color: '', rollSrNo: '', status: '', warehouse: '', itemType: 'all',
};

export function LabelsPage() {
  const { can } = usePermissions();
  const canReadAccessories = can('accessories', 'read');

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters | null>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reprintTarget, setReprintTarget] = useState<LabelRow | null>(null);
  const [reprintReason, setReprintReason] = useState('');

  const fabricsQ = useQuery({ queryKey: ['fabrics-list', 'all'], queryFn: () => inventoryApi.listFabrics('all') });
  const colorsQ = useQuery({ queryKey: ['colors-list'], queryFn: inventoryApi.listColors });

  // Tops drop out only when the user has explicitly narrowed to accessories.
  const rollsEnabled = applied !== null && applied.itemType !== 'accessories';
  // Accessories participate whenever the user can read them and hasn't narrowed to tops.
  const accessoriesEnabled =
    applied !== null && applied.itemType !== 'tops' && canReadAccessories;

  const rollsQ = useQuery({
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
    enabled: rollsEnabled,
  });

  // Shares the AccessoriesList cache key so creating an accessory (which
  // invalidates ['accessories-list']) refreshes this queue too. Barcode/type
  // filtering happens client-side below.
  const accessoriesQ = useQuery({
    queryKey: ['accessories-list'],
    queryFn: () => accessoriesApi.list(),
    enabled: accessoriesEnabled,
  });

  // Batch print — splits the mixed selection back into its two native endpoints.
  // Rolls and accessories use different label stock (100×150 vs 100×60 mm), so
  // each yields its own PDF and both open; no new/merged print path is created.
  const batchMut = useMutation({
    mutationFn: async (keys: string[]) => {
      const rollIds = keys.filter((k) => k.startsWith('roll:')).map((k) => Number(k.slice(5)));
      const accIds = keys.filter((k) => k.startsWith('accessory:')).map((k) => Number(k.slice(10)));
      const blobs: Blob[] = [];
      if (rollIds.length) blobs.push(await itemsApi.batchLabelsPdf(rollIds));
      if (accIds.length) blobs.push(await accessoriesApi.batchLabelsBlob(accIds));
      return blobs;
    },
    onSuccess: (blobs) => blobs.forEach(openPdfBlob),
  });

  // Single-row print — routes to the roll or accessory label endpoint by kind.
  const printMut = useMutation({
    mutationFn: (row: LabelRow) =>
      row.kind === 'roll' ? itemsApi.labelPdfBlob(row.id) : accessoriesApi.labelBlob(row.id),
    onSuccess: openPdfBlob,
  });

  // Reprint-with-reason (lost/damaged sticker) — an identical action for both
  // kinds: same dialog, same required reason, same server-side `label_reprinted`
  // audit — each routed to its own existing reprint endpoint.
  const reprintMut = useMutation({
    mutationFn: ({ row, reason }: { row: LabelRow; reason: string }) =>
      row.kind === 'roll'
        ? itemsApi.reprintLabel(row.id, reason)
        : accessoriesApi.reprintLabel(row.id, reason),
    onSuccess: (blob) => {
      openPdfBlob(blob);
      setReprintTarget(null);
      setReprintReason('');
    },
  });

  // ── Assemble the unified row list ────────────────────────────────────────
  const rollRows: LabelRow[] = rollsEnabled
    ? (rollsQ.data ?? [])
        .filter((r) => {
          if (applied?.status && r.status !== applied.status) return false;
          if (applied?.warehouse === 'shop' && r.status !== 'in_stock') return false;
          return true;
        })
        .map((r): LabelRow => ({ kind: 'roll', ...r }))
    : [];

  const accessoryRows: LabelRow[] = accessoriesEnabled
    ? (accessoriesQ.data ?? [])
        .filter((a) => {
          const bc = applied?.barcode.trim().toLowerCase();
          if (bc && !a.internal_barcode.toLowerCase().includes(bc)) return false;
          // Roll-attribute filters (fabric/color/SR/warehouse/status) can't apply to
          // an accessory. In "all" mode they narrow the view to tops, so drop
          // accessories when any is active; in "accessories" mode they're ignored.
          if (
            applied?.itemType === 'all' &&
            (applied.fabric || applied.color || applied.rollSrNo || applied.warehouse || applied.status)
          ) {
            return false;
          }
          return true;
        })
        .map((a): LabelRow => ({ kind: 'accessory', ...a }))
    : [];

  const rows: LabelRow[] = [...rollRows, ...accessoryRows];
  // In the combined view, interleave by recency so a just-created top OR
  // accessory surfaces at the top of the queue.
  if (applied?.itemType === 'all') {
    rows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }

  const isFetching = rollsQ.isFetching || accessoriesQ.isFetching;
  const isLoading =
    (rollsEnabled && rollsQ.isLoading) || (accessoriesEnabled && accessoriesQ.isLoading);
  // Only the tops query drives the page-level error state — a failed accessories
  // fetch degrades to "no accessories" rather than blocking the tops workflow.
  const isError = rollsEnabled && rollsQ.isError;
  const refetch = () => {
    if (rollsEnabled) rollsQ.refetch();
    if (accessoriesEnabled) accessoriesQ.refetch();
  };

  const activeFilters = Object.entries(filters).filter(([k, v]) =>
    k === 'itemType' ? v !== 'all' : String(v).trim(),
  ).length;
  const resetKey = JSON.stringify(applied);

  function toggleSelect(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(rowKeyOf)));
  }

  function handleSearch() {
    setSelected(new Set());
    setApplied({ ...filters });
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
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

      {/* Item type — tops / accessories / all. Hidden entirely when the user
          cannot read accessories, leaving the tops-only page unchanged. */}
      {canReadAccessories && (
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.labels.itemType}</Label>
          <select
            value={filters.itemType}
            onChange={(e) => setFilters((f) => ({ ...f, itemType: e.target.value as ItemType }))}
            dir="rtl"
            className={`${selectClass} sm:max-w-xs`}
          >
            <option value="all">{ar.labels.itemTypeAll}</option>
            <option value="tops">{ar.labels.itemTypeTops}</option>
            <option value="accessories">{ar.labels.itemTypeAccessories}</option>
          </select>
        </div>
      )}

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
        <Button onClick={handleSearch} disabled={isFetching} className="h-11 md:h-10">
          {isFetching ? ar.loading : ar.labels.search}
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

  const columns: Column<LabelRow>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={selected.size === rows.length && rows.length > 0}
          onChange={toggleAll}
          className="size-4 accent-accent cursor-pointer"
          aria-label="تحديد الكل"
        />
      ),
      cell: (r) => (
        <input
          type="checkbox"
          checked={selected.has(rowKeyOf(r))}
          onChange={() => toggleSelect(rowKeyOf(r))}
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
        <span className="inline-flex items-center gap-2 md:gap-1.5">
          <input
            type="checkbox"
            checked={selected.has(rowKeyOf(r))}
            onChange={() => toggleSelect(rowKeyOf(r))}
            onClick={(e) => e.stopPropagation()}
            className="size-5 md:hidden accent-accent cursor-pointer"
            aria-label={`تحديد ${r.internal_barcode}`}
          />
          {r.kind === 'roll' ? (
            r.fabric_name_ar
          ) : (
            <>
              {r.name_ar}
              <StatusPill tone="info" className="px-1.5 py-0 text-[10px]">
                {ar.labels.accessoryTag}
              </StatusPill>
            </>
          )}
        </span>
      ),
      primary: true,
    },
    {
      key: 'sr_no',
      header: ar.labels.rollSrNoFilter,
      cell: (r) => (
        <span className="font-mono text-sm text-foreground">
          {r.kind === 'roll' ? (r.roll_sr_no ?? '—') : '—'}
        </span>
      ),
      secondary: true,
    },
    {
      key: 'color',
      header: ar.labels.colorFilter,
      cell: (r) => (r.kind === 'roll' ? r.color_name_ar : '—'),
      secondary: true,
    },
    {
      key: 'barcode',
      header: ar.labels.barcode,
      cell: (r) => <span className="font-mono text-sm tabular-num" dir="ltr">{r.internal_barcode}</span>,
    },
    {
      key: 'weight',
      header: ar.labels.weight,
      cell: (r) => (
        <span className="tabular-num" dir="ltr">
          {r.kind === 'roll' ? rollQtyLabel(r.weight_kg, r.length_m) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: ar.labels.status,
      cell: (r) =>
        r.kind === 'roll' ? (
          <RollStatusPill status={r.status} />
        ) : (
          <StatusPill tone={r.is_active ? 'success' : 'neutral'}>
            {r.is_active ? 'نشط' : 'موقوف'}
          </StatusPill>
        ),
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
              {ar.labels.results}: <span className="tabular-num text-foreground" dir="ltr">{rows.length}</span>
              {selected.size > 0 ? <> · المحدد: <span className="tabular-num text-foreground" dir="ltr">{selected.size}</span></> : ''}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleAll}
                disabled={rows.length === 0}
                className="md:hidden h-11"
              >
                {selected.size === rows.length && rows.length > 0 ? 'إلغاء الكل' : 'تحديد الكل'}
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
            rows={rows}
            rowKey={rowKeyOf}
            empty={ar.common.none}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            resetKey={resetKey}
            actions={(r) => (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    printMut.isPending &&
                    printMut.variables != null &&
                    rowKeyOf(printMut.variables) === rowKeyOf(r)
                  }
                  onClick={() => printMut.mutate(r)}
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

      {/* Reprint (lost/damaged sticker) dialog — shared by tops & accessories */}
      <Dialog open={!!reprintTarget} onOpenChange={(o) => !o && setReprintTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ar.labels.reprintTitle}</DialogTitle>
          </DialogHeader>
          {reprintTarget && (
            <div className="space-y-3">
              <p className="text-sm text-foreground-muted">
                {reprintTarget.kind === 'roll'
                  ? `${reprintTarget.fabric_name_ar} / ${reprintTarget.color_name_ar}`
                  : reprintTarget.name_ar}
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
                      row: reprintTarget,
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
