import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

// ── Label card helpers ──────────────────────────────────────────────────────
function LabelRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
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
    return <p className="text-sm text-muted-foreground py-2">{ar.loading}</p>;
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
      <p className="text-sm text-muted-foreground py-2">{ar.labels.noLabelData}</p>
    );
  }

  function openLabel(format: 'thermal' | 'a4') {
    window.open(itemsApi.fabricLabelUrl(rollId, format), '_blank');
    setPrintOpen(false);
  }

  return (
    <div className="space-y-3">
      {/* Label preview card */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-2 text-sm">
        {/* Brand header */}
        {roll!.brand_arabic_name && (
          <div className="font-bold text-base">{roll!.brand_arabic_name}</div>
        )}
        {roll!.brand_arabic_name && roll!.brand_product_line && (
          <div className="text-muted-foreground text-xs -mt-1">{roll!.brand_product_line}</div>
        )}
        {/* Supplier name */}
        {roll!.supplier_arabic_name && (
          <div className="text-muted-foreground text-xs">{roll!.supplier_arabic_name}</div>
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
          <div className="text-xs text-muted-foreground font-mono" dir="ltr">
            SR: {roll!.roll_sr_no}
          </div>
        )}
        <div className="text-xs font-mono" dir="ltr">{roll!.internal_barcode}</div>
        {/* Arabic warning text */}
        {roll!.supplier_arabic_warning_text && (
          <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
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
          🏷️ {ar.labels.printThermal.replace('(حرارية)', '').trim()} ↓
        </Button>
        {printOpen && (
          <div className="absolute z-50 top-full mt-1 right-0 left-0 rounded border border-border bg-canvas shadow-md overflow-hidden">
            <button
              className="w-full text-right px-4 py-2.5 text-sm hover:bg-muted transition-colors cursor-pointer"
              onClick={() => openLabel('thermal')}
            >
              {ar.labels.printThermal}
            </button>
            <button
              className="w-full text-right px-4 py-2.5 text-sm hover:bg-muted transition-colors cursor-pointer border-t border-border"
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

const statusColors: Record<string, string> = {
  in_stock: 'bg-green-100 text-green-800',
  reserved: 'bg-yellow-100 text-yellow-800',
  sold: 'bg-gray-100 text-gray-600',
  damaged: 'bg-red-100 text-red-800',
  sample: 'bg-blue-100 text-blue-800',
  returned: 'bg-purple-100 text-purple-800',
  written_off: 'bg-gray-100 text-gray-500',
};

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

  const filterControls = (
    <Card>
      <CardHeader>
        <CardTitle>{ar.labels.rollsTitle}</CardTitle>
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
              dir="ltr"
              inputMode="text"
              className="h-11 md:h-10"
            />
          </div>
          <div className="space-y-1">
            <Label>{ar.labels.barcodeFilter}</Label>
            <Input
              value={filters.barcodePartial}
              onChange={(e) => setFilters((f) => ({ ...f, barcodePartial: e.target.value }))}
              dir="ltr"
              inputMode="text"
              className="h-11 md:h-10"
            />
          </div>
        </div>
        <Button onClick={() => setApplied({ ...filters })} disabled={q.isFetching} className="h-11 md:h-10 w-full md:w-auto">
          {q.isFetching ? ar.loading : ar.labels.search}
        </Button>
      </CardContent>
    </Card>
  );

  const columns: Column<RollWithDetails>[] = [
    {
      key: 'sr_no',
      header: ar.labels.rollSrNoFilter,
      cell: (r) => <span className="font-mono text-xs">{r.roll_sr_no ?? '—'}</span>,
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
      cell: (r) => (
        <span className={`px-1.5 py-0.5 rounded text-xs ${statusColors[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {ar.rollStatuses[r.status as keyof typeof ar.rollStatuses] ?? r.status}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <MobileFilterSheet activeCount={activeFilters}>{filterControls}</MobileFilterSheet>

      <div className="text-sm text-muted-foreground">
        {ar.labels.results}: {rolls.length}
      </div>

      <ResponsiveTable
        columns={columns}
        rows={rolls}
        rowKey={(r) => String(r.id)}
        onRowClick={(r) => setDetail(r)}
        empty={ar.common.none}
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
                  <span className="text-muted-foreground">{ar.labels.fabricFilter}: </span>
                  <span className="font-medium">{detail.fabric_name_ar}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{ar.labels.colorFilter}: </span>
                  <span className="font-medium">{detail.color_name_ar}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{ar.labels.rollSrNoFilter}: </span>
                  <span className="font-mono">{detail.roll_sr_no ?? '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{ar.labels.weight}: </span>
                  <span dir="ltr">{Number(detail.weight_kg).toFixed(3)} kg</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{ar.labels.barcode}: </span>
                  <span className="font-mono text-xs" dir="ltr">{detail.internal_barcode}</span>
                </div>
                {detail.external_barcode && (
                  <div>
                    <span className="text-muted-foreground">{ar.labels.externalBarcode}: </span>
                    <span className="font-mono text-xs" dir="ltr">{detail.external_barcode}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">{ar.labels.status}: </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${statusColors[detail.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {ar.rollStatuses[detail.status as keyof typeof ar.rollStatuses] ?? detail.status}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">السعر: </span>
                  <span dir="ltr">{fmtMoney(detail.selling_price_egp)} ج.م/كجم</span>
                </div>
              </div>
              <div className="pt-2 border-t border-border">
                <Button asChild className="w-full h-11">
                  <a href={itemsApi.labelPdfUrl(detail.id)} target="_blank" rel="noreferrer">
                    🖨️ {ar.labels.printLabel}
                  </a>
                </Button>
              </div>

              {/* Fabric label section */}
              <div className="pt-2 border-t border-border space-y-2">
                <p className="font-semibold text-sm">{ar.labels.fabricLabelSection}</p>
                <FabricLabelCard rollId={detail.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
