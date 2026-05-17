import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '@/lib/inventory-api';
import type { StockSummaryRow } from '@/lib/inventory-types';
import { PageHeader } from '@/components/PageHeader';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

const columns: Column<StockSummaryRow>[] = [
  {
    key: 'fabric',
    header: 'الخامة',
    primary: true,
    cell: (row) => (
      <div>
        <span className="font-medium">{row.fabric_name_ar}</span>
        <span className="ms-2 text-xs text-foreground-muted font-mono">{row.fabric_code}</span>
      </div>
    ),
  },
  {
    key: 'color',
    header: 'اللون',
    secondary: true,
    cell: (row) => (
      <span>
        {row.color_name_ar}
        {row.color_code && (
          <span className="ms-1 text-xs text-foreground-muted font-mono">({row.color_code})</span>
        )}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'الحالة',
    hideOnMobile: false,
    cell: (row) =>
      row.count_in_stock > 0 ? (
        <StatusPill tone="success">متوفر</StatusPill>
      ) : (
        <StatusPill tone="danger">غير متوفر</StatusPill>
      ),
  },
  {
    key: 'count_in_stock',
    header: 'متاح',
    align: 'end',
    hideOnMobile: false,
    cell: (row) => (
      <span className={row.count_in_stock > 0 ? 'text-success-foreground font-semibold' : 'text-foreground-muted'}>
        {row.count_in_stock}
      </span>
    ),
  },
  {
    key: 'count_reserved',
    header: 'محجوز',
    align: 'end',
    hideOnMobile: true,
    cell: (row) => <span className="text-foreground-muted">{row.count_reserved}</span>,
  },
  {
    key: 'count_total',
    header: 'الإجمالي',
    align: 'end',
    hideOnMobile: true,
    cell: (row) => <span>{row.count_total}</span>,
  },
];

export function StockViewPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['stock-summary'],
    queryFn: () => inventoryApi.getStockSummary(),
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (r) =>
        r.fabric_name_ar.toLowerCase().includes(q) ||
        r.fabric_code.toLowerCase().includes(q) ||
        r.color_name_ar.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="space-y-4">
      <PageHeader title="المخزون" description="الكميات المتاحة لكل خامة ولون" />

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 -translate-y-1/2 start-3 size-4 text-foreground-muted pointer-events-none" />
        <Input
          placeholder="ابحث بالخامة أو اللون…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.fabric_id}-${r.color_id}`}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        errorTitle="تعذر تحميل المخزون"
        empty="لا توجد أصناف مسجلة حتى الآن"
        resetKey={search}
      />
    </div>
  );
}
