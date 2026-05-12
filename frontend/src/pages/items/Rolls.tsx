import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { itemsApi } from '@/lib/items-api';
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
import { PageHeader } from '@/components/PageHeader';
import { RollStatusPill } from '@/components/items/RollStatusPill';

// ── Label card helpers ──────────────────────────────────────────────────────
function LabelRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <span className="text-foreground-muted">{label}: </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function FabricLabelCard({ rollId }: { rollId: number }) {
  const { data: roll, isLoading } = useQuery({
    queryKey: ['roll-label', rollId],
    queryFn: () => itemsApi.getRollDetail(rollId),
  });

  const [printOpen, setPrintOpen] = useState(false);

  if (isLoading) {
    return <p className="text-sm text-foreground-muted py-2">{ar.loading}</p>;
  }

  const hasLabelData =
    roll &&
    (roll.brand_arabic_name ||
      roll.supplier_arabic_name ||
      roll.grade_arabic_name ||
      roll.composition_description ||
      roll.supplier_order_no ||
      roll.top_number ||
      roll.width_cm);

  if (!hasLabelData) {
    return (
      <p className="text-sm text-foreground-muted py-2">{ar.labels.noLabelData}</p>
    );
  }

  function openLabel(format: 'thermal' | 'a4') {
    window.open(itemsApi.fabricLabelUrl(rollId, format), '_blank');
    setPrintOpen(false);
  }

  return (
    <div className="space-y-3">
      {/* Label preview card */}
      <div className="rounded-md border border-border-subtle bg-surface-hover/40 p-3 space-y-2 text-sm">
        {/* Brand header */}
        {roll!.brand_arabic_name && (
          <div className="font-bold text-base text-foreground">{roll!.brand_arabic_name}</div>
        )}
        {roll!.brand_arabic_name && roll!.brand_product_line && (
          <div className="text-foreground-muted text-xs -mt-1">{roll!.brand_product_line}</div>
        )}
        {/* Supplier name */}
        {roll!.supplier_arabic_name && (
          <div className="text-foreground-muted text-xs">{roll!.supplier_arabic_name}</div>
        )}
        {/* Field grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
          {roll!.supplier_order_no && (
            <LabelRow label="أمر الشراء" value={roll!.supplier_order_no} />
          )}
          {roll!.top_number != null && (
            <LabelRow label="رقم التوب" value={roll!.top_number} />
          )}
          <LabelRow label="الصنف" value={roll!.fabric_name_ar} />
          {roll!.grade_arabic_name && (
            <LabelRow label="الدرجة" value={roll!.grade_arabic_name} />
          )}
          {roll!.width_cm != null && (
            <LabelRow label="العرض" value={`${roll!.width_cm} سم`} />
          )}
          <LabelRow label="اللون" value={`${roll!.color_name_ar} / ${roll!.color_code}`} />
          {roll!.composition_description && (
            <div className="col-span-2">
              <LabelRow label="التركيب" value={roll!.composition_description} />
            </div>
          )}
        </div>
        {/* Roll SR + barcode */}
        {roll!.roll_sr_no && (
          <div className="text-xs text-foreground-muted font-mono" dir="ltr">
            SR: {roll!.roll_sr_no}
          </div>
        )}
        <div className="text-xs font-mono text-foreground" dir="ltr">{roll!.internal_barcode}</div>
        {/* Arabic warning text */}
        {roll!.supplier_arabic_warning_text && (
          <div className="text-xs text-foreground-muted border-t border-border-subtle pt-2 mt-2">
            {roll!.supplier_arabic_warning_text}
          </div>
        )}
      </div>

      {/* Print menu */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-11 md:h-10"
          onClick={() => setPrintOpen((o) => !o)}
        >
          {ar.labels.printThermal.replace('(حرارية)', '').trim()} ↓
        </Button>
        {printOpen && (
          <div className="absolute z-dropdown top-full mt-1 right-0 left-0 rounded-md border border-border-subtle bg-surface-elevated shadow-md overflow-hidden">
            <button
              className="w-full text-right px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors cursor-pointer"
              onClick={() => openLabel('thermal')}
            >
              {ar.labels.printThermal}
            </button>
            <button
              className="w-full text-right px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors cursor-pointer border-t border-border-subtle"
              onClick={() => openLabel('a4')}
            >
              {ar.labels.printA4}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtMoney(n: string | number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RollsPage() {
  const [filters, setFilters] = useState({ fabric: '', color: '', rollSrNo: '', barcodePartial: '' });
  const [applied, setApplied] = useState<typeof filters>({ fabric: '', color: '', rollSrNo: '', barcodePartial: '' });
  const [detail, setDetail] = useState<RollWithDetails | null>(null);

  const q = useQuery({
    queryKey: ['rolls-search', applied],
    queryFn: () =>
      itemsApi.searchRolls({
        fabric: applied.fabric || undefined,
        color: applied.color || undefined,
        rollSrNo: applied.rollSrNo || undefined,
        barcodePartial: applied.barcodePartial || undefined,
      }),
  });

  const rolls = q.data ?? [];
  const activeFilters = Object.values(applied).filter((v) => v.trim()).length;
  const resetKey = JSON.stringify(applied);

  const filterControls = (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3 space-y-3">
      <h2 className="text-base font-semibold text-foreground">{ar.labels.rollsTitle}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.labels.fabricFilter}</Label>
          <Input
            value={filters.fabric}
            onChange={(e) => setFilters((f) => ({ ...f, fabric: e.target.value }))}
            placeholder={ar.labels.fabricFilter}
            dir="rtl"
            className="h-11 md:h-10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.labels.colorFilter}</Label>
          <Input
            value={filters.color}
            onChange={(e) => setFilters((f) => ({ ...f, color: e.target.value }))}
            placeholder={ar.labels.colorFilter}
            dir="rtl"
            className="h-11 md:h-10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.labels.rollSrNoFilter}</Label>
          <Input
            value={filters.rollSrNo}
            onChange={(e) => setFilters((f) => ({ ...f, rollSrNo: e.target.value }))}
            dir="ltr"
            inputMode="text"
            className="h-11 md:h-10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.labels.barcodeFilter}</Label>
          <Input
            value={filters.barcodePartial}
            onChange={(e) => setFilters((f) => ({ ...f, barcodePartial: e.target.value }))}
            dir="ltr"
            inputMode="text"
            className="h-11 md:h-10"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button onClick={() => setApplied({ ...filters })} disabled={q.isFetching} className="h-11 md:h-10 w-full md:w-auto">
          {q.isFetching ? ar.loading : ar.labels.search}
        </Button>
        <div className="text-sm text-foreground-muted">
          {ar.labels.results}: <span className="tabular-num text-foreground" dir="ltr">{rolls.length}</span>
        </div>
      </div>
    </div>
  );

  const columns: Column<RollWithDetails>[] = [
    {
      key: 'sr_no',
      header: ar.labels.rollSrNoFilter,
      cell: (r) => <span className="font-mono text-xs text-foreground">{r.roll_sr_no ?? '—'}</span>,
      secondary: true,
    },
    {
      key: 'fabric',
      header: ar.labels.fabricFilter,
      cell: (r) => r.fabric_name_ar,
      primary: true,
    },
    {
      key: 'color',
      header: ar.labels.colorFilter,
      cell: (r) => r.color_name_ar,
      secondary: true,
    },
    {
      key: 'barcode',
      header: ar.labels.barcode,
      cell: (r) => <span className="font-mono text-xs tabular-num" dir="ltr">{r.internal_barcode}</span>,
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
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader title={ar.labels.rollsTitle} description={ar.hubs.itemsRollsDesc} />

      <MobileFilterSheet activeCount={activeFilters}>{filterControls}</MobileFilterSheet>

      <ResponsiveTable
        columns={columns}
        rows={rolls}
        rowKey={(r) => String(r.id)}
        onRowClick={(r) => setDetail(r)}
        empty={ar.common.none}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        resetKey={resetKey}
        actions={(r) => (
          <Button size="sm" variant="outline" asChild>
            <a href={itemsApi.labelPdfUrl(r.id)} target="_blank" rel="noreferrer">
              {ar.labels.print}
            </a>
          </Button>
        )}
      />

      {/* Roll detail drawer */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ar.labels.rollDetail}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-foreground-muted">{ar.labels.fabricFilter}: </span>
                  <span className="font-medium text-foreground">{detail.fabric_name_ar}</span>
                </div>
                <div>
                  <span className="text-foreground-muted">{ar.labels.colorFilter}: </span>
                  <span className="font-medium text-foreground">{detail.color_name_ar}</span>
                </div>
                <div>
                  <span className="text-foreground-muted">{ar.labels.rollSrNoFilter}: </span>
                  <span className="font-mono text-foreground">{detail.roll_sr_no ?? '—'}</span>
                </div>
                <div>
                  <span className="text-foreground-muted">{ar.labels.weight}: </span>
                  <span className="tabular-num" dir="ltr">{Number(detail.weight_kg).toFixed(3)} kg</span>
                </div>
                <div>
                  <span className="text-foreground-muted">{ar.labels.barcode}: </span>
                  <span className="font-mono text-xs tabular-num" dir="ltr">{detail.internal_barcode}</span>
                </div>
                {detail.external_barcode && (
                  <div>
                    <span className="text-foreground-muted">{ar.labels.externalBarcode}: </span>
                    <span className="font-mono text-xs tabular-num" dir="ltr">{detail.external_barcode}</span>
                  </div>
                )}
                <div>
                  <span className="text-foreground-muted">{ar.labels.status}: </span>
                  <RollStatusPill status={detail.status} />
                </div>
                <div>
                  <span className="text-foreground-muted">السعر: </span>
                  <span className="tabular-num" dir="ltr">{fmtMoney(detail.selling_price_egp)} ج.م/كجم</span>
                </div>
              </div>
              <div className="pt-2 border-t border-border-subtle">
                <Button asChild className="w-full h-11">
                  <a href={itemsApi.labelPdfUrl(detail.id)} target="_blank" rel="noreferrer">
                    {ar.labels.printLabel}
                  </a>
                </Button>
              </div>

              {/* Fabric label section */}
              <div className="pt-2 border-t border-border-subtle space-y-2">
                <p className="font-semibold text-sm text-foreground">{ar.labels.fabricLabelSection}</p>
                <FabricLabelCard rollId={detail.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
