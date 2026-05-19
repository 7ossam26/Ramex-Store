import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { inventoryApi } from '@/lib/inventory-api';
import { salesApi } from '@/lib/sales-api';
import type { StockSummaryRow, Warehouse } from '@/lib/inventory-types';
import type { RollLookup } from '@/lib/sales-types';
import { PageHeader } from '@/components/PageHeader';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { StatusPill, type StatusTone } from '@/components/StatusPill';
import { FilterChip } from '@/components/FilterChip';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { EGP, fmtMoney, fmtWeight, num } from '@/components/dashboard/format';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Layers,
  Package,
  PiggyBank,
  Search,
  ShoppingCart,
  Store,
  Warehouse as WarehouseIcon,
  Wallet,
} from 'lucide-react';

type WarehouseChoice = 'all' | Warehouse;

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

function RollDetailsPanel({ row }: { row: StockSummaryRow }) {
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

  if (isLoading) {
    return (
      <div className="text-xs text-foreground-muted py-2">جاري تحميل تفاصيل الرولات…</div>
    );
  }
  if (isError) {
    return (
      <div className="text-xs text-danger-foreground py-2">تعذر تحميل تفاصيل الرولات.</div>
    );
  }
  const rolls = data ?? [];
  if (rolls.length === 0) {
    return (
      <div className="text-xs text-foreground-muted py-2">لا توجد رولات متاحة لهذا الصنف.</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border-subtle bg-surface">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-start text-[11px] text-foreground-muted border-b border-border-subtle">
            <th className="px-3 py-2 font-medium">الباركود</th>
            <th className="px-3 py-2 font-medium">رقم الروول</th>
            <th className="px-3 py-2 font-medium text-end">الوزن (kg)</th>
            <th className="px-3 py-2 font-medium text-end">سعر البيع</th>
            <th className="px-3 py-2 font-medium">المخزن</th>
            <th className="px-3 py-2 font-medium">الحالة</th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StockViewPage() {
  const [search, setSearch] = useState('');
  const [warehouse, setWarehouse] = useState<WarehouseChoice>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeCategory !== 'all' && r.fabric_name_ar !== activeCategory) return false;
      if (q) {
        const haystack = `${r.fabric_name_ar} ${r.fabric_code} ${r.color_name_ar} ${r.color_code}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, activeCategory]);

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
            {row.count_in_stock} رولات
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
    <div className="space-y-6">
      <PageHeader
        title="إدارة المخزون"
        description="إدارة مستويات المخزون، الأسعار وتفاصيل المنتجات"
      />

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          </div>

          <div className="flex items-center gap-2">
            <div className="relative inline-flex">
              <WarehouseIcon className="absolute top-1/2 -translate-y-1/2 start-3 size-4 text-foreground-muted pointer-events-none" />
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value as WarehouseChoice)}
                className={cn(
                  'h-10 rounded-md border border-border-default bg-surface ps-9 pe-8 text-sm text-foreground',
                  'appearance-none cursor-pointer min-w-[160px]',
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

            <div className="relative flex-1 sm:flex-none sm:w-72">
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
          resetKey={`${warehouse}-${activeCategory}-${search}`}
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
    </div>
  );
}
