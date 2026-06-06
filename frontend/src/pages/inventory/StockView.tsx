import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import JsBarcode from 'jsbarcode';
import { inventoryApi } from '@/lib/inventory-api';
import { salesApi } from '@/lib/sales-api';
import { itemsApi } from '@/lib/items-api';
import { openPdfBlob } from '@/lib/pdf';
import type { StockSummaryRow, Warehouse } from '@/lib/inventory-types';
import type { RollLookup } from '@/lib/sales-types';
import { PageShell } from '@/components/Layout/PageShell';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { StatusPill, type StatusTone } from '@/components/StatusPill';
import { FilterChip } from '@/components/FilterChip';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { EGP, fmtMoney, fmtWeight, num } from '@/components/dashboard/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Layers,
  Package,
  PiggyBank,
  Printer,
  Search,
  ShoppingCart,
  Store,
  Warehouse as WarehouseIcon,
  Wallet,
} from 'lucide-react';

type WarehouseChoice = 'all' | Warehouse;
type StatusFilter = 'all' | 'in_stock' | 'low' | 'out';
type SortKey = 'name' | 'count_desc' | 'count_asc' | 'weight_desc' | 'price_desc';

const WAREHOUSE_OPTIONS: ReadonlyArray<{ value: WarehouseChoice; label: string }> = [
  { value: 'all', label: 'كل المخازن' },
  { value: 'shop', label: 'المعرض' },
  { value: 'factory', label: 'المصنع' },
  { value: 'damaged_shop', label: 'مخزن التالف' },
];

function rowStatus(row: StockSummaryRow): { tone: StatusTone; label: string } {
  if (row.count_in_stock === 0) return { tone: 'danger', label: 'نفد' };
  if (row.count_in_stock <= row.min_quantity_rolls) return { tone: 'warning', label: 'منخفض' };
  return { tone: 'success', label: 'متوفر' };
}

function rowKey(r: StockSummaryRow): string {
  return `${r.fabric_id}-${r.color_id}`;
}

const ROLL_STATUS_LABEL: Record<string, string> = {
  in_stock: 'متوفر',
  reserved: 'محجوز',
  sold: 'مُباع',
  damaged: 'تالف',
  sample: 'عينة',
  returned: 'مُعاد',
  written_off: 'مشطوب',
};

function BarcodeModal({
  roll,
  onClose,
  onPrint,
  printing,
}: {
  roll: RollLookup;
  onClose: () => void;
  onPrint: () => void;
  printing: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Defer one tick so the Radix portal has committed the SVG to the DOM
    // before jsbarcode tries to read/write it.
    const id = setTimeout(() => {
      if (!svgRef.current) return;
      JsBarcode(svgRef.current, roll.internal_barcode, {
        format: 'CODE128',
        width: 2,
        height: 64,
        displayValue: true,
        font: 'monospace',
        fontSize: 13,
        textMargin: 4,
        background: '#ffffff',
        lineColor: '#000000',
      });
      // jsbarcode stamps a fixed pixel width onto the SVG element.
      // Remove it and let the container control the width instead.
      svgRef.current.removeAttribute('width');
      svgRef.current.style.width = '100%';
      svgRef.current.style.height = 'auto';
    }, 0);
    return () => clearTimeout(id);
  }, [roll.internal_barcode]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xs" dir="rtl">
        <DialogHeader>
          <DialogTitle>باركود الروول</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <div>
            <span className="text-foreground-muted">الصنف: </span>
            <span className="font-medium">{roll.fabric_name_ar} — {roll.color_name_ar}</span>
          </div>
          {roll.roll_sr_no && (
            <div>
              <span className="text-foreground-muted">رقم الروول: </span>
              <span className="font-mono">{roll.roll_sr_no}</span>
            </div>
          )}
          <div>
            <span className="text-foreground-muted">الوزن: </span>
            <span dir="ltr" className="tabular-num">{fmtWeight(num(roll.weight_kg))} kg</span>
          </div>
        </div>

        <div className="flex justify-center rounded-md border border-border-subtle bg-white p-4">
          <svg ref={svgRef} />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>إغلاق</Button>
          <Button size="sm" onClick={onPrint} disabled={printing} className="gap-2">
            <Printer className="size-4" />
            {printing ? 'جارٍ التحضير…' : 'طباعة الملصق'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RollDetailsPanel({ row }: { row: StockSummaryRow }) {
  const [barcodeRoll, setBarcodeRoll] = useState<RollLookup | null>(null);

  const { data, isLoading, isError } = useQuery<RollLookup[]>({
    queryKey: ['rolls-for-stock', row.fabric_id, row.color_id],
    queryFn: () =>
      salesApi.searchRolls({
        fabric_id: row.fabric_id,
        color_id: row.color_id,
        status: 'in_stock',
      }),
    staleTime: 30_000,
  });

  const labelMut = useMutation({
    mutationFn: (rollId: number) => itemsApi.labelPdfBlob(rollId),
    onSuccess: (blob) => openPdfBlob(blob),
  });

  if (isLoading) {
    return <div className="text-xs text-foreground-muted py-2">جاري تحميل تفاصيل الاتواب…</div>;
  }
  if (isError) {
    return <div className="text-xs text-danger-foreground py-2">تعذر تحميل تفاصيل الاتواب.</div>;
  }
  const rolls = data ?? [];
  if (rolls.length === 0) {
    return <div className="text-xs text-foreground-muted py-2">لا توجد اتواب متاحة لهذه الخامة.</div>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-border-subtle bg-surface">
        <table className="w-full text-xs" style={{ textAlign: 'center' }}>
          <thead>
            <tr className="text-[11px] text-foreground-muted border-b border-border-subtle">
              <th className="px-3 py-2 font-medium">الباركود</th>
              <th className="px-3 py-2 font-medium">رقم التوب</th>
              <th className="px-3 py-2 font-medium text-end">الوزن (kg)</th>
              <th className="px-3 py-2 font-medium text-end">سعر البيع</th>
              <th className="px-3 py-2 font-medium">المخزن</th>
              <th className="px-3 py-2 font-medium">الحالة</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rolls.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 font-mono text-foreground" dir="ltr">
                  {r.internal_barcode}
                </td>
                <td className="px-3 py-2 text-foreground-muted">{r.roll_sr_no ?? '—'}</td>
                <td className="px-3 py-2 text-end tabular-num" dir="ltr">
                  {fmtWeight(num(r.weight_kg))}
                </td>
                <td className="px-3 py-2 text-end tabular-num" dir="ltr">
                  {fmtMoney(num(r.selling_price_egp))} {EGP}
                </td>
                <td className="px-3 py-2 text-foreground-muted">
                  {WAREHOUSE_OPTIONS.find((w) => w.value === r.warehouse)?.label ?? r.warehouse}
                </td>
                <td className="px-3 py-2">
                  <StatusPill tone="success">
                    {ROLL_STATUS_LABEL[r.status] ?? r.status}
                  </StatusPill>
                </td>
                <td className="px-3 py-2 text-end">
                  <button
                    type="button"
                    onClick={() => setBarcodeRoll(r)}
                    className="inline-flex items-center gap-1 rounded-md border border-border-default px-2 py-1 text-[11px] text-foreground-muted hover:bg-surface-hover hover:text-foreground transition-colors"
                  >
                    <Printer className="size-3" />
                    باركود
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {barcodeRoll && (
        <BarcodeModal
          roll={barcodeRoll}
          onClose={() => setBarcodeRoll(null)}
          onPrint={() => labelMut.mutate(barcodeRoll.id)}
          printing={labelMut.isPending}
        />
      )}
    </>
  );
}

export function StockViewPage() {
  const [search, setSearch] = useState('');
  const [warehouse, setWarehouse] = useState<WarehouseChoice>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading, isError, refetch } = useQuery<StockSummaryRow[]>({
    queryKey: ['stock-summary', warehouse],
    queryFn: () =>
      inventoryApi.getStockSummary(
        warehouse === 'all' ? undefined : { warehouse },
      ),
  });

  const kpis = useMemo(() => {
    let itemsInStock = 0;
    let lowStock = 0;
    let totalPurchase = 0;
    let totalSale = 0;
    for (const r of rows) {
      if (r.count_in_stock > 0) itemsInStock += 1;
      if (r.count_in_stock > 0 && r.count_in_stock <= r.min_quantity_rolls) lowStock += 1;
      totalPurchase += r.weight_kg_in_stock * r.avg_reference_price_per_unit;
      totalSale += r.weight_kg_in_stock * r.selling_price_egp;
    }
    return {
      itemsInStock,
      lowStock,
      totalPurchase,
      totalSale,
      profit: totalSale - totalPurchase,
    };
  }, [rows]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.fabric_name_ar, (map.get(r.fabric_name_ar) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [rows]);

  const statusCounts = useMemo(() => {
    let inStock = 0, low = 0, out = 0;
    for (const r of rows) {
      if (r.count_in_stock === 0) out++;
      else if (r.count_in_stock <= r.min_quantity_rolls) low++;
      else inStock++;
    }
    return { inStock, low, out };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = rows.filter((r) => {
      if (activeCategory !== 'all' && r.fabric_name_ar !== activeCategory) return false;
      if (statusFilter === 'in_stock' && r.count_in_stock === 0) return false;
      if (statusFilter === 'low' && (r.count_in_stock === 0 || r.count_in_stock > r.min_quantity_rolls)) return false;
      if (statusFilter === 'out' && r.count_in_stock > 0) return false;
      if (q) {
        const haystack = `${r.fabric_name_ar} ${r.fabric_code} ${r.color_name_ar} ${r.color_code}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    switch (sortKey) {
      case 'count_desc': result = [...result].sort((a, b) => b.count_in_stock - a.count_in_stock); break;
      case 'count_asc':  result = [...result].sort((a, b) => a.count_in_stock - b.count_in_stock); break;
      case 'weight_desc': result = [...result].sort((a, b) => b.weight_kg_in_stock - a.weight_kg_in_stock); break;
      case 'price_desc': result = [...result].sort((a, b) => b.selling_price_egp - a.selling_price_egp); break;
    }

    return result;
  }, [rows, search, activeCategory, statusFilter, sortKey]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const columns: Column<StockSummaryRow>[] = [
    {
      key: 'name',
      header: 'اسم الصنف',
      primary: true,
      cell: (row) => {
        const key = rowKey(row);
        const isOpen = expanded.has(key);
        return (
          <button
            type="button"
            onClick={() => toggleExpand(key)}
            className="flex items-start gap-2 text-start hover:text-accent transition-colors"
          >
            <span className="mt-0.5 text-foreground-muted">
              {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </span>
            <span className="flex flex-col">
              <span className="font-medium text-foreground">
                {row.fabric_name_ar} — {row.color_name_ar}
              </span>
              <span className="text-[11px] text-foreground-muted font-mono" dir="ltr">
                كود: {row.fabric_code}
              </span>
            </span>
          </button>
        );
      },
    },
    {
      key: 'category',
      header: 'التصنيف',
      secondary: true,
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-hover px-2.5 py-0.5 text-xs text-foreground-muted">
          <span className="size-1.5 rounded-full bg-accent" />
          {row.fabric_name_ar}
        </span>
      ),
    },
    {
      key: 'available',
      header: 'الكمية المتاحة',
      align: 'end',
      cell: (row) => (
        <div className="flex flex-col items-end leading-tight" dir="ltr">
          <span
            className={cn(
              'tabular-num font-semibold',
              row.count_in_stock === 0
                ? 'text-foreground-muted'
                : row.count_in_stock <= row.min_quantity_rolls
                  ? 'text-warning-foreground'
                  : 'text-success-foreground',
            )}
          >
            {row.count_in_stock} توب
          </span>
          <span className="text-[11px] text-foreground-muted tabular-num">
            {fmtWeight(row.weight_kg_in_stock)} kg
          </span>
        </div>
      ),
    },
    {
      key: 'avg_reference',
      header: 'متوسط السعر المرجعي',
      align: 'end',
      hideOnMobile: false,
      cell: (row) => (
        <span className="tabular-num" dir="ltr">
          {fmtMoney(row.avg_reference_price_per_unit)} <span className="text-foreground-muted text-xs">{EGP}</span>
        </span>
      ),
    },
    {
      key: 'last_reference',
      header: 'آخر سعر مرجعي',
      align: 'end',
      hideOnMobile: true,
      cell: (row) => (
        <span className="tabular-num" dir="ltr">
          {fmtMoney(row.last_reference_price_per_unit)} <span className="text-foreground-muted text-xs">{EGP}</span>
        </span>
      ),
    },
    {
      key: 'selling',
      header: 'سعر البيع',
      align: 'end',
      hideOnMobile: false,
      cell: (row) => (
        <span className="tabular-num font-medium text-foreground" dir="ltr">
          {fmtMoney(row.selling_price_egp)} <span className="text-foreground-muted text-xs">{EGP}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      cell: (row) => {
        const s = rowStatus(row);
        return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
      },
    },
  ];

  return (
    <PageShell
      title="إدارة المخزون"
      description="إدارة مستويات المخزون، الأسعار وتفاصيل المنتجات"
      backTo="/inventory"
    >
      <KpiGrid className="lg:grid-cols-5">
        <MetricCard
          label="إجمالي الأصناف"
          value={kpis.itemsInStock}
          format="int"
          tone="accent"
          meta={
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" />
              صنف متاح
            </span>
          }
        />
        <MetricCard
          label="نواقص المخزون"
          value={kpis.lowStock}
          format="int"
          tone={kpis.lowStock > 0 ? 'danger' : 'success'}
          emDashOnZero={false}
          meta={
            kpis.lowStock > 0 ? (
              <span className="inline-flex items-center gap-1 text-danger-foreground">
                <AlertTriangle className="size-3.5" />
                إجراء مطلوب
              </span>
            ) : (
              <span className="text-foreground-muted">لا توجد نواقص</span>
            )
          }
        />
        <MetricCard
          label="إجمالي السعر المرجعي"
          value={kpis.totalPurchase}
          format="money"
          tone="warning"
          meta={
            <span className="inline-flex items-center gap-1">
              <ShoppingCart className="size-3.5" />
              تكلفة المخزون
            </span>
          }
        />
        <MetricCard
          label="إجمالي سعر البيع"
          value={kpis.totalSale}
          format="money"
          tone="info"
          meta={
            <span className="inline-flex items-center gap-1">
              <Wallet className="size-3.5" />
              قيمة سوقية
            </span>
          }
        />
        <MetricCard
          label="الأرباح المتوقعة"
          value={kpis.profit}
          format="money"
          tone="success"
          meta={
            <span className="inline-flex items-center gap-1">
              <PiggyBank className="size-3.5" />
              ربح محتمل
            </span>
          }
        />
      </KpiGrid>

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-lg border border-border-subtle bg-surface-elevated shadow-sm p-4 space-y-4"
      >
        <div className="space-y-3">
          {/* Row 1: category chips + status filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
              count={rows.length}
            >
              الكل
            </FilterChip>
            {categories.map((c) => (
              <FilterChip
                key={c.name}
                active={activeCategory === c.name}
                onClick={() => setActiveCategory(c.name)}
                count={c.count}
              >
                {c.name}
              </FilterChip>
            ))}
            <div className="h-5 w-px bg-border-subtle self-center" />
            <FilterChip
              active={statusFilter === 'in_stock'}
              onClick={() => setStatusFilter(statusFilter === 'in_stock' ? 'all' : 'in_stock')}
              count={statusCounts.inStock + statusCounts.low}
            >
              في المخزون
            </FilterChip>
            <FilterChip
              active={statusFilter === 'low'}
              onClick={() => setStatusFilter(statusFilter === 'low' ? 'all' : 'low')}
              count={statusCounts.low}
            >
              منخفض
            </FilterChip>
            <FilterChip
              active={statusFilter === 'out'}
              onClick={() => setStatusFilter(statusFilter === 'out' ? 'all' : 'out')}
              count={statusCounts.out}
            >
              نفد
            </FilterChip>
          </div>

          {/* Row 2: sort + warehouse + search */}
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="relative inline-flex">
              <ArrowUpDown className="absolute top-1/2 -translate-y-1/2 start-3 size-4 text-foreground-muted pointer-events-none" />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className={cn(
                  'h-10 rounded-md border border-border-default bg-surface ps-9 pe-8 text-sm text-foreground',
                  'appearance-none cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  'hover:bg-surface-hover transition-colors',
                )}
              >
                <option value="name">ترتيب: الاسم</option>
                <option value="count_desc">الأكثر توفراً</option>
                <option value="count_asc">الأقل توفراً</option>
                <option value="weight_desc">الأثقل وزناً</option>
                <option value="price_desc">أعلى سعر بيع</option>
              </select>
              <ChevronDown className="absolute top-1/2 -translate-y-1/2 end-3 size-4 text-foreground-muted pointer-events-none" />
            </div>

            <div className="relative inline-flex">
              <WarehouseIcon className="absolute top-1/2 -translate-y-1/2 start-3 size-4 text-foreground-muted pointer-events-none" />
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value as WarehouseChoice)}
                className={cn(
                  'h-10 rounded-md border border-border-default bg-surface ps-9 pe-8 text-sm text-foreground',
                  'appearance-none cursor-pointer min-w-[140px]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  'hover:bg-surface-hover transition-colors',
                )}
              >
                {WAREHOUSE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute top-1/2 -translate-y-1/2 end-3 size-4 text-foreground-muted pointer-events-none" />
            </div>

            <div className="relative flex-1 sm:flex-none sm:w-64">
              <Search className="absolute top-1/2 -translate-y-1/2 start-3 size-4 text-foreground-muted pointer-events-none" />
              <Input
                placeholder="ابحث بالاسم، الكود، أو التصنيف…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ps-9"
              />
            </div>
          </div>
        </div>

        <ResponsiveTable
          columns={columns}
          rows={filteredRows}
          rowKey={rowKey}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          errorTitle="تعذر تحميل المخزون"
          empty={
            <div className="py-10 text-center text-sm text-foreground-muted">
              <Package className="size-8 mx-auto mb-2 opacity-50" />
              لا توجد أصناف مطابقة لهذا البحث.
            </div>
          }
          resetKey={`${warehouse}-${activeCategory}-${statusFilter}-${sortKey}-${search}`}
          expandedKeys={expanded}
          expandedContent={(row) => <RollDetailsPanel row={row} />}
        />
      </motion.div>

      <div className="text-xs text-foreground-muted flex items-center gap-1.5">
        <Store className="size-3.5" />
        {warehouse === 'all'
          ? 'البيانات مجمّعة من كل المخازن'
          : `البيانات من ${WAREHOUSE_OPTIONS.find((w) => w.value === warehouse)?.label}`}
      </div>
    </PageShell>
  );
}
