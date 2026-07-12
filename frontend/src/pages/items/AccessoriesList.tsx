import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { accessoriesApi } from '@/lib/accessories-api';
import type { Accessory } from '@/lib/accessories-types';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { Input } from '@/components/ui/input';

const COLUMNS: Column<Accessory>[] = [
  {
    key: 'internal_barcode',
    header: 'الباركود',
    cell: (r) => (
      <span className="font-mono text-xs text-foreground-muted" dir="ltr">
        {r.internal_barcode}
      </span>
    ),
  },
  {
    key: 'name_ar',
    header: 'الاسم / الكود',
    cell: (r) => (
      <span className="font-medium text-foreground">{r.name_ar}</span>
    ),
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
              : 'text-foreground'
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
        className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium ${
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

export function AccessoriesListPage() {
  const [search, setSearch] = useState('');

  const { data: accessories = [], isLoading } = useQuery<Accessory[]>({
    queryKey: ['accessories-list'],
    queryFn: () => accessoriesApi.list(),
  });

  const filtered = search.trim()
    ? accessories.filter(
        (a) =>
          a.name_ar.toLowerCase().includes(search.toLowerCase()) ||
          a.internal_barcode.toLowerCase().includes(search.toLowerCase()),
      )
    : accessories;

  return (
    <PageShell title="الاكسسوارات" description="عرض وبحث في كل الاكسسوارات المسجلة بالمخزون">
      <SectionCard>
        <div className="mb-4 relative max-w-xs">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-foreground-tertiary pointer-events-none" />
          <Input
            placeholder="ابحث بالاسم أو الباركود"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 ps-9"
            dir="rtl"
          />
        </div>

        <ResponsiveTable
          columns={COLUMNS}
          rows={filtered}
          rowKey={(r) => String(r.id)}
          isLoading={isLoading}
          empty={search ? ar.common.none : 'لا توجد اكسسوارات مسجلة بعد'}
        />
      </SectionCard>
    </PageShell>
  );
}
