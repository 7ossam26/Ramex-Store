import { useEffect, useRef, useState } from 'react';
import { Printer, ScanBarcode, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { itemsApi } from '@/lib/items-api';
import { inventoryApi } from '@/lib/inventory-api';
import { openPdfBlob } from '@/lib/pdf';
import type { RollWithDetails } from '@/lib/items-types';
import { rollQtyLabel } from '@/lib/fabric-unit';
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
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { RollStatusPill } from '@/components/items/RollStatusPill';
import { useAuth } from '@/lib/auth';
import { isOwnerOrAbove } from '@/lib/roles';
import { usePermissions } from '@/lib/permissions';
import { accessoriesApi } from '@/lib/accessories-api';
import type { Accessory } from '@/lib/accessories-types';

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

  const fabricLabelMut = useMutation({
    mutationFn: (format: 'thermal' | 'a4') => itemsApi.fabricLabelBlob(rollId, format),
    onSuccess: (blob) => openPdfBlob(blob),
  });

  if (isLoading) {
    return <p className="text-sm text-foreground-muted py-2">{ar.loading}</p>;
  }

  const hasLabelData =
    roll &&
    (roll.brand_arabic_name ||
      roll.supplier_arabic_name ||
      roll.grade_arabic_name ||
      roll.gsm != null ||
      roll.mad_m != null ||
      roll.supplier_order_no ||
      roll.top_number ||
      roll.width_cm);

  if (!hasLabelData) {
    return <p className="text-sm text-foreground-muted py-2">{ar.labels.noLabelData}</p>;
  }

  function openLabel(format: 'thermal' | 'a4') {
    fabricLabelMut.mutate(format);
    setPrintOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border-subtle bg-surface-hover/40 p-3 space-y-2 text-sm">
        {roll!.brand_arabic_name && (
          <div className="font-bold text-base text-foreground">{roll!.brand_arabic_name}</div>
        )}
        {roll!.brand_arabic_name && roll!.brand_product_line && (
          <div className="text-foreground-muted text-xs -mt-1">{roll!.brand_product_line}</div>
        )}
        {roll!.supplier_arabic_name && (
          <div className="text-foreground-muted text-xs">{roll!.supplier_arabic_name}</div>
        )}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
          {roll!.supplier_order_no && <LabelRow label="أمر الشراء" value={roll!.supplier_order_no} />}
          {roll!.top_number != null && <LabelRow label="رقم التوب" value={roll!.top_number} />}
          <LabelRow label="الصنف" value={roll!.fabric_name_ar} />
          {roll!.grade_arabic_name && <LabelRow label="الدرجة" value={roll!.grade_arabic_name} />}
          {roll!.width_cm != null && <LabelRow label="العرض" value={`${roll!.width_cm} سم`} />}
          <LabelRow label="اللون" value={`${roll!.color_name_ar} / ${roll!.color_code}`} />
          {(roll!.gsm != null || roll!.mad_m != null) && (
            <div className="col-span-2 grid grid-cols-2 gap-x-3">
              {roll!.gsm != null && <LabelRow label="GSM" value={`${roll!.gsm} جرام`} />}
              {roll!.mad_m != null && <LabelRow label="المد" value={`${roll!.mad_m} متر`} />}
            </div>
          )}
        </div>
        {roll!.roll_sr_no && (
          <div className="text-xs text-foreground-muted font-mono" dir="ltr">SR: {roll!.roll_sr_no}</div>
        )}
        <div className="text-xs font-mono text-foreground" dir="ltr">{roll!.internal_barcode}</div>
        {roll!.supplier_arabic_warning_text && (
          <div className="text-xs text-foreground-muted border-t border-border-subtle pt-2 mt-2">
            {roll!.supplier_arabic_warning_text}
          </div>
        )}
      </div>
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
              className="w-full text-start px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors cursor-pointer"
              onClick={() => openLabel('thermal')}
            >
              {ar.labels.printThermal}
            </button>
            <button
              className="w-full text-start px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors cursor-pointer border-t border-border-subtle"
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

// ── Main page ────────────────────────────────────────────────────────────────
export function RollsPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const isOwner = isOwnerOrAbove(user?.role);

  const [viewType, setViewType] = useState<'rolls' | 'accessories'>('rolls');
  const [accSearch, setAccSearch] = useState('');
  const [accActive, setAccActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [accDetail, setAccDetail] = useState<Accessory | null>(null);

  const [barcode, setBarcode] = useState('');
  const [fabricId, setFabricId] = useState('');
  const [colorId, setColorId] = useState('');
  const [warehouse, setWarehouse] = useState('');

  // Applied state — dropdowns apply immediately, scanner applies on Enter
  const [applied, setApplied] = useState({ barcode: '', fabricId: '', colorId: '', warehouse: '' });
  const [detail, setDetail] = useState<RollWithDetails | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<'sample' | 'unsample' | 'return' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Refocus barcode input whenever the detail dialog closes
  useEffect(() => {
    if (!detail) {
      setTimeout(() => barcodeInputRef.current?.focus(), 2000);
    }
  }, [detail]);

  const fabricsQ = useQuery({ queryKey: ['fabrics'], queryFn: inventoryApi.listFabrics });
  const colorsQ  = useQuery({ queryKey: ['colors'],  queryFn: inventoryApi.listColors });

  const fabrics = Array.isArray(fabricsQ.data) ? fabricsQ.data : [];
  const colors  = Array.isArray(colorsQ.data)  ? colorsQ.data  : [];

  const fabricName = fabrics.find((f) => String(f.id) === fabricId)?.name_ar ?? '';
  const colorName  = colors.find((c)  => String(c.id) === colorId)?.name_ar  ?? '';

  const q = useQuery({
    queryKey: ['rolls-search', applied],
    queryFn: () =>
      itemsApi.searchRolls({
        fabric:         fabricName  || undefined,
        color:          colorName   || undefined,
        barcodePartial: applied.barcode || undefined,
        warehouse:      applied.warehouse || undefined,
      }),
  });

  const rolls = q.data ?? [];
  const resetKey = JSON.stringify(applied);

  const activeFilters = viewType === 'rolls'
    ? [barcode, fabricId, colorId, warehouse].filter(Boolean).length
    : (accSearch ? 1 : 0) + (accActive !== 'all' ? 1 : 0);

  const qc = useQueryClient();

  const accQ = useQuery({
    queryKey: ['rolls-page-accessories', accActive],
    queryFn: () => accessoriesApi.list(accActive === 'all' ? undefined : { is_active: accActive === 'active' }),
    enabled: viewType === 'accessories',
  });

  const allAccessories = accQ.data ?? [];
  const filteredAccessories = accSearch.trim()
    ? allAccessories.filter(
        (a) =>
          a.name_ar.toLowerCase().includes(accSearch.toLowerCase()) ||
          a.internal_barcode.toLowerCase().includes(accSearch.toLowerCase()),
      )
    : allAccessories;

  const accLabelMut = useMutation({
    mutationFn: (id: number) => accessoriesApi.labelBlob(id),
    onSuccess: (blob) => openPdfBlob(blob),
  });

  const accActiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      accessoriesApi.update(id, { is_active }),
    onSuccess: (updated) => {
      setAccDetail((prev) => (prev ? { ...prev, ...updated } : null));
      qc.invalidateQueries({ queryKey: ['rolls-page-accessories'] });
    },
  });

  const accColumns: Column<Accessory>[] = [
    {
      key: 'internal_barcode',
      header: ar.labels.barcode,
      cell: (r) => (
        <span className="font-mono text-sm tabular-num" dir="ltr">
          {r.internal_barcode}
        </span>
      ),
      primary: true,
    },
    {
      key: 'name_ar',
      header: 'الاسم / الكود',
      cell: (r) => <span className="font-medium">{r.name_ar}</span>,
      secondary: true,
    },
    {
      key: 'qty_in_stock',
      header: 'الكمية المتاحة',
      cell: (r) => (
        <span
          className={`tabular-num font-semibold ${
            r.qty_in_stock === 0
              ? 'text-danger-foreground'
              : r.qty_in_stock <= 5
                ? 'text-warning-foreground'
                : ''
          }`}
        >
          {r.qty_in_stock} قطعة
        </span>
      ),
    },
    {
      key: 'selling_price_egp',
      header: 'سعر البيع',
      cell: (r) =>
        r.selling_price_egp != null ? (
          <span className="tabular-num text-foreground-muted" dir="ltr">
            {Number(r.selling_price_egp).toFixed(2)} ج.م
          </span>
        ) : (
          <span className="text-foreground-tertiary">—</span>
        ),
    },
    {
      key: 'is_active',
      header: 'الحالة',
      cell: (r) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            r.is_active
              ? 'bg-success/10 text-success-foreground'
              : 'bg-surface-row-alt text-foreground-muted'
          }`}
        >
          {r.is_active ? 'نشط' : 'موقوف'}
        </span>
      ),
    },
  ];

  const labelPdfMut = useMutation({
    mutationFn: (rollId: number) => itemsApi.labelPdfBlob(rollId),
    onSuccess: (blob) => openPdfBlob(blob),
  });

  const updateRollMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { status?: import('@/lib/inventory-types').RollStatus; is_visible_at_pos?: boolean } }) =>
      itemsApi.updateRoll(id, data),
    onSuccess: (updated) => {
      setDetail((prev) => prev ? { ...prev, ...updated } : null);
      qc.invalidateQueries({ queryKey: ['rolls-search'] });
      setPendingConfirm(null);
      setActionError(null);
    },
    onError: () => setActionError(ar.common.error),
  });

  const returnToFactoryMut = useMutation({
    mutationFn: (id: number) => itemsApi.returnRollToFactory(id),
    onSuccess: (updated) => {
      setDetail((prev) => prev ? { ...prev, ...updated } : null);
      qc.invalidateQueries({ queryKey: ['rolls-search'] });
      setPendingConfirm(null);
      setActionError(null);
    },
    onError: () => setActionError(ar.common.error),
  });

  function handleSearch() {
    setApplied({ barcode, fabricId, colorId, warehouse });
  }

  function handleReset() {
    setBarcode(''); setFabricId(''); setColorId(''); setWarehouse('');
    setApplied({ barcode: '', fabricId: '', colorId: '', warehouse: '' });
    setTimeout(() => barcodeInputRef.current?.focus(), 2000);
  }

  const selectClass =
    'flex h-11 md:h-10 w-full rounded border border-border bg-canvas px-3 py-2 text-sm focus-visible:outline-none focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 cursor-pointer appearance-none';

  const filterControls = (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3 space-y-3">
      <h2 className="text-base font-semibold text-foreground">{ar.labels.rollsTitle}</h2>

      {/* View type toggle */}
      <div className="flex gap-1 p-1 bg-surface-hover rounded-lg w-fit">
        <button
          onClick={() => setViewType('rolls')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            viewType === 'rolls'
              ? 'bg-canvas shadow-sm font-semibold text-foreground'
              : 'text-foreground-muted hover:text-foreground'
          }`}
        >
          توبات
        </button>
        <button
          onClick={() => setViewType('accessories')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            viewType === 'accessories'
              ? 'bg-canvas shadow-sm font-semibold text-foreground'
              : 'text-foreground-muted hover:text-foreground'
          }`}
        >
          اكسسوارات
        </button>
      </div>

      {viewType === 'rolls' ? (
        <>
          <div className="space-y-1">
            <Label className="text-sm font-medium text-foreground">{ar.labels.barcode}</Label>
            <div className="relative">
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
                <span className="absolute size-6 rounded-full bg-ring/20 animate-ping" />
                <ScanBarcode className="relative size-4 text-ring" aria-hidden />
              </span>
              <Input
                ref={barcodeInputRef}
                autoFocus
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="RMX-R-000001"
                dir="ltr"
                className="h-11 md:h-10 pr-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.labels.fabricFilter}</Label>
              <select
                value={fabricId}
                onChange={(e) => setFabricId(e.target.value)}
                disabled={fabricsQ.isLoading}
                dir="rtl"
                className={selectClass}
              >
                <option value="">كل الخامات</option>
                {fabrics.map((f) => (
                  <option key={f.id} value={String(f.id)}>{f.name_ar}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.labels.colorFilter}</Label>
              <select
                value={colorId}
                onChange={(e) => setColorId(e.target.value)}
                disabled={colorsQ.isLoading}
                dir="rtl"
                className={selectClass}
              >
                <option value="">كل الألوان</option>
                {colors.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name_ar}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.inventory.warehouse}</Label>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
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
              <Button variant="outline" onClick={handleReset} className="h-11 md:h-10 gap-1.5">
                <X className="size-3.5" aria-hidden />
                مسح الفلاتر
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <Label className="text-sm font-medium text-foreground">بحث</Label>
            <Input
              value={accSearch}
              onChange={(e) => setAccSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الباركود"
              className="h-11 md:h-10"
              dir="rtl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-medium text-foreground">الحالة</Label>
            <select
              className={selectClass}
              value={accActive}
              onChange={(e) => setAccActive(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">موقوف</option>
            </select>
          </div>
        </>
      )}
    </div>
  );

  const columns: Column<RollWithDetails>[] = [
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
      cell: (r) => <span className="font-mono text-sm tabular-num" dir="ltr">{r.internal_barcode}</span>,
    },
    {
      key: 'weight',
      header: ar.labels.weight,
      cell: (r) => <span className="tabular-num" dir="ltr">{rollQtyLabel(r.weight_kg, r.length_m)}</span>,
    },
    {
      key: 'status',
      header: ar.labels.status,
      cell: (r) => <RollStatusPill status={r.status} />,
    },
  ];

  return (
    <PageShell title={ar.labels.rollsTitle} description={ar.hubs.itemsRollsDesc} backTo="/items">
      <MobileFilterSheet activeCount={activeFilters}>{filterControls}</MobileFilterSheet>

      <div className="text-sm text-foreground-muted">
        {ar.labels.results}:{' '}
        <span className="tabular-num font-medium text-foreground">
          {viewType === 'rolls' ? rolls.length : filteredAccessories.length}
        </span>
      </div>

      <SectionCard noPadding>
        {viewType === 'rolls' ? (
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
              <Button
                size="sm"
                variant="outline"
                disabled={labelPdfMut.isPending && labelPdfMut.variables === r.id}
                onClick={(e) => { e.stopPropagation(); labelPdfMut.mutate(r.id); }}
                aria-label={ar.labels.print}
              >
                <Printer className="size-4" aria-hidden />
              </Button>
            )}
          />
        ) : (
          <ResponsiveTable
            columns={accColumns}
            rows={filteredAccessories}
            rowKey={(r) => String(r.id)}
            onRowClick={(r) => setAccDetail(r)}
            empty="لا توجد اكسسوارات مسجلة بعد"
            isLoading={accQ.isLoading}
            isError={accQ.isError}
            onRetry={() => accQ.refetch()}
            actions={(r) => (
              <Button
                size="sm"
                variant="outline"
                disabled={accLabelMut.isPending && accLabelMut.variables === r.id}
                onClick={(e) => { e.stopPropagation(); accLabelMut.mutate(r.id); }}
                aria-label={ar.labels.print}
              >
                <Printer className="size-4" aria-hidden />
              </Button>
            )}
          />
        )}
      </SectionCard>

      {/* Roll detail drawer */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setPendingConfirm(null); setActionError(null); } }}>
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
                  <span className="text-foreground-muted">{ar.labels.weight}: </span>
                  <span className="tabular-num" dir="ltr">{rollQtyLabel(detail.weight_kg, detail.length_m)}</span>
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
                <Button
                  className="w-full h-11"
                  disabled={labelPdfMut.isPending && labelPdfMut.variables === detail.id}
                  onClick={() => labelPdfMut.mutate(detail.id)}
                >
                  {ar.labels.printLabel}
                </Button>
              </div>
              <div className="pt-2 border-t border-border-subtle space-y-2">
                <p className="font-semibold text-sm text-foreground">{ar.labels.fabricLabelSection}</p>
                <FabricLabelCard rollId={detail.id} />
              </div>

              {/* Roll actions — sample + return to factory */}
              {(isOwner || can('inventory', 'write')) && (
                <div className="pt-2 border-t border-border-subtle space-y-2">
                  {isOwner && detail.status === 'in_stock' && !pendingConfirm && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-11 md:h-10"
                      onClick={() => { setPendingConfirm('sample'); setActionError(null); }}
                    >
                      {ar.labels.markAsSample}
                    </Button>
                  )}
                  {isOwner && detail.status === 'sample' && !pendingConfirm && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-11 md:h-10"
                      onClick={() => { setPendingConfirm('unsample'); setActionError(null); }}
                    >
                      {ar.labels.unmarkSample}
                    </Button>
                  )}
                  {can('inventory', 'write') && detail.status === 'in_stock' && detail.warehouse === 'shop' && !pendingConfirm && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-11 md:h-10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                      onClick={() => { setPendingConfirm('return'); setActionError(null); }}
                    >
                      {ar.labels.returnToFactory}
                    </Button>
                  )}

                  {pendingConfirm && (
                    <div className="rounded-md border border-border-subtle bg-surface-hover p-3 space-y-2">
                      <p className="text-sm text-foreground">
                        {pendingConfirm === 'sample'
                          ? ar.labels.sampleConfirm
                          : pendingConfirm === 'unsample'
                            ? ar.labels.unmarkSampleConfirm
                            : ar.labels.returnToFactoryConfirm}
                      </p>
                      {actionError && (
                        <p className="text-sm text-danger-foreground">{actionError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-9"
                          onClick={() => { setPendingConfirm(null); setActionError(null); }}
                        >
                          {ar.common.cancel}
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 h-9"
                          disabled={updateRollMut.isPending || returnToFactoryMut.isPending}
                          onClick={() => {
                            if (pendingConfirm === 'sample') {
                              updateRollMut.mutate({ id: detail.id, data: { status: 'sample', is_visible_at_pos: false } });
                            } else if (pendingConfirm === 'unsample') {
                              updateRollMut.mutate({ id: detail.id, data: { status: 'in_stock', is_visible_at_pos: true } });
                            } else {
                              returnToFactoryMut.mutate(detail.id);
                            }
                          }}
                        >
                          {updateRollMut.isPending || returnToFactoryMut.isPending ? ar.loading : ar.common.confirm}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Accessory detail dialog */}
      <Dialog open={!!accDetail} onOpenChange={(o) => { if (!o) setAccDetail(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تفاصيل الإكسسوار</DialogTitle>
          </DialogHeader>
          {accDetail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-foreground-muted">الاسم / الكود: </span>
                  <span className="font-medium text-foreground">{accDetail.name_ar}</span>
                </div>
                <div>
                  <span className="text-foreground-muted">{ar.labels.barcode}: </span>
                  <span className="font-mono text-xs tabular-num" dir="ltr">{accDetail.internal_barcode}</span>
                </div>
                <div>
                  <span className="text-foreground-muted">الكمية المتاحة: </span>
                  <span className="tabular-num" dir="ltr">{accDetail.qty_in_stock} قطعة</span>
                </div>
                <div>
                  <span className="text-foreground-muted">سعر البيع: </span>
                  <span className="tabular-num" dir="ltr">
                    {accDetail.selling_price_egp != null ? `${fmtMoney(accDetail.selling_price_egp)} ج.م` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-foreground-muted">الحالة: </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    accDetail.is_active ? 'bg-success/10 text-success-foreground' : 'bg-surface-row-alt text-foreground-muted'
                  }`}>
                    {accDetail.is_active ? 'نشط' : 'موقوف'}
                  </span>
                </div>
              </div>
              {accDetail.notes_ar && (
                <div className="pt-1">
                  <span className="text-foreground-muted">ملاحظات: </span>
                  <span className="text-foreground">{accDetail.notes_ar}</span>
                </div>
              )}
              <div className="pt-2 border-t border-border-subtle">
                <Button
                  className="w-full h-11"
                  disabled={accLabelMut.isPending && accLabelMut.variables === accDetail.id}
                  onClick={() => accLabelMut.mutate(accDetail.id)}
                >
                  {ar.labels.printLabel}
                </Button>
              </div>
              {(isOwner || can('accessories', 'write')) && (
                <div className="pt-2 border-t border-border-subtle">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={accActiveMut.isPending}
                    onClick={() => accActiveMut.mutate({ id: accDetail.id, is_active: !accDetail.is_active })}
                  >
                    {accActiveMut.isPending ? ar.loading : accDetail.is_active ? 'إيقاف' : 'تفعيل'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
