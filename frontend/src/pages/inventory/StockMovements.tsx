import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { StockEventType } from '@/lib/inventory-types';
import { Button } from '@/components/ui/button';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const ALL_EVENTS: StockEventType[] = [
  'factory_in', 'shipment_out', 'shipment_in', 'shipment_reject_back',
  'adjustment', 'damage', 'loss_writeoff', 'sample_set',
  'return_in', 'sale_out', 'reserve', 'unreserve',
  'shop_to_factory_return',
];

// Event category → visual style
const EVENT_CATEGORY: Record<StockEventType, 'inbound' | 'outbound' | 'transfer' | 'reserve'> = {
  factory_in:             'inbound',
  shipment_in:            'inbound',
  return_in:              'inbound',
  shipment_out:           'outbound',
  sale_out:               'outbound',
  damage:                 'outbound',
  loss_writeoff:          'outbound',
  shipment_reject_back:   'transfer',
  adjustment:             'transfer',
  shop_to_factory_return: 'transfer',
  reserve:                'reserve',
  unreserve:              'reserve',
  sample_set:             'reserve',
};

const BADGE_STYLES: Record<'inbound' | 'outbound' | 'transfer' | 'reserve', string> = {
  inbound:  'bg-[hsl(var(--rmx-success-subtle))] text-[hsl(var(--rmx-success-foreground))] border border-[hsl(var(--rmx-success)/0.25)]',
  outbound: 'bg-[hsl(var(--rmx-danger-subtle))] text-[hsl(var(--rmx-danger-foreground))] border border-[hsl(var(--rmx-danger)/0.25)]',
  transfer: 'bg-[hsl(var(--rmx-info-subtle))] text-[hsl(var(--rmx-info-foreground))] border border-[hsl(var(--rmx-info)/0.25)]',
  reserve:  'bg-[hsl(var(--rmx-warning-subtle))] text-[hsl(var(--rmx-warning-foreground))] border border-[hsl(var(--rmx-warning)/0.25)]',
};

const ROW_STRIPE: Record<'inbound' | 'outbound' | 'transfer' | 'reserve', string> = {
  inbound:  'border-r-2 border-r-[hsl(var(--rmx-success))]',
  outbound: 'border-r-2 border-r-[hsl(var(--rmx-danger))]',
  transfer: 'border-r-2 border-r-[hsl(var(--rmx-info))]',
  reserve:  'border-r-2 border-r-[hsl(var(--rmx-warning))]',
};

type MovementRow = {
  id: number;
  created_at: string;
  event_type: StockEventType;
  internal_barcode: string;
  fabric_name_ar: string;
  color_name_ar: string;
  from_warehouse: string | null;
  to_warehouse: string | null;
  reference_type: string | null;
  reference_id: number | null;
};

function EventBadge({ type }: { type: StockEventType }) {
  const cat = EVENT_CATEGORY[type];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap', BADGE_STYLES[cat])}>
      {ar.stockMovements.events[type]}
    </span>
  );
}

function MovementArrow({
  from,
  to,
}: {
  from: string | null;
  to: string | null;
}) {
  const fromLabel = from ? ar.warehouses[from as keyof typeof ar.warehouses] : null;
  const toLabel = to ? ar.warehouses[to as keyof typeof ar.warehouses] : null;

  if (!fromLabel && !toLabel) return <span className="text-foreground-muted">—</span>;

  return (
    <span className="inline-flex items-center gap-1 text-sm" dir="rtl">
      {fromLabel && <span>{fromLabel}</span>}
      {fromLabel && toLabel && (
        <svg className="w-3.5 h-3.5 text-foreground-muted shrink-0 rotate-180" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      )}
      {toLabel && <span>{toLabel}</span>}
    </span>
  );
}

export function StockMovementsPage() {
  const [event, setEvent] = useState<StockEventType | ''>('');
  const [search, setSearch] = useState('');
  const [fabricId, setFabricId] = useState('');
  const [colorId, setColorId] = useState('');
  const [offset, setOffset] = useState(0);

  const fabricsQ = useQuery({ queryKey: ['fabrics'], queryFn: inventoryApi.listFabrics });
  const colorsQ = useQuery({ queryKey: ['colors'], queryFn: inventoryApi.listColors });
  const fabrics = fabricsQ.data ?? [];
  const colors = colorsQ.data ?? [];

  const q = useQuery({
    queryKey: ['stock-movements', event, search, fabricId, colorId, offset],
    queryFn: () =>
      inventoryApi.listStockMovements({
        event_type: event || undefined,
        search: search.trim() || undefined,
        fabric_id: fabricId ? Number(fabricId) : undefined,
        color_id: colorId ? Number(colorId) : undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const total = q.data?.total ?? 0;
  const rows: MovementRow[] = (q.data?.rows ?? []) as MovementRow[];
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: Column<MovementRow>[] = [
    {
      key: 'when',
      header: ar.stockMovements.when,
      cell: (m) => (
        <span className="text-sm text-foreground-muted tabular-num whitespace-nowrap">
          {new Date(m.created_at).toLocaleString('ar-EG-u-nu-latn')}
        </span>
      ),
      secondary: true,
    },
    {
      key: 'event',
      header: ar.stockMovements.eventType,
      cell: (m) => <EventBadge type={m.event_type} />,
      primary: true,
    },
    {
      key: 'barcode',
      header: ar.stockMovements.rollBarcode,
      cell: (m) => (
        <span className="font-mono text-sm tabular-num tracking-wide" dir="ltr">
          {m.internal_barcode}
        </span>
      ),
    },
    {
      key: 'fc',
      header: ar.stockMovements.fabricColor,
      cell: (m) => (
        <span className="text-sm">{m.fabric_name_ar} / {m.color_name_ar}</span>
      ),
    },
    {
      key: 'movement',
      header: 'الحركة',
      cell: (m) => <MovementArrow from={m.from_warehouse} to={m.to_warehouse} />,
    },
    {
      key: 'ref',
      header: ar.stockMovements.reference,
      cell: (m) =>
        m.reference_type ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-row-alt px-2 py-0.5 text-xs font-mono text-foreground-muted border border-border-subtle">
            {m.reference_type}#{m.reference_id ?? ''}
          </span>
        ) : (
          <span className="text-foreground-muted text-xs">—</span>
        ),
      hideOnMobile: true,
    },
  ];

  return (
    <PageShell
      title={ar.stockMovements.title}
      description={ar.hubs.inventoryMovementsDesc}
      backTo="/inventory"
      actions={
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Barcode / material search */}
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            placeholder={ar.stockMovements.searchPlaceholder}
            dir="rtl"
            className="h-9 w-52 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
          />

          {/* Material filter */}
          <select
            value={fabricId}
            onChange={(e) => { setFabricId(e.target.value); setOffset(0); }}
            disabled={fabricsQ.isLoading}
            dir="rtl"
            className="h-9 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
          >
            <option value="">{ar.stockMovements.allMaterials}</option>
            {fabrics.map((f) => (
              <option key={f.id} value={String(f.id)}>{f.name_ar}</option>
            ))}
          </select>

          {/* Color filter */}
          <select
            value={colorId}
            onChange={(e) => { setColorId(e.target.value); setOffset(0); }}
            disabled={colorsQ.isLoading}
            dir="rtl"
            className="h-9 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
          >
            <option value="">{ar.stockMovements.allColors}</option>
            {colors.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name_ar}</option>
            ))}
          </select>

          {/* Event type filter */}
          <select
            value={event}
            onChange={(e) => { setEvent(e.target.value as StockEventType | ''); setOffset(0); }}
            className="h-9 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
          >
            <option value="">كل الأنواع</option>
            {ALL_EVENTS.map((ev) => (
              <option key={ev} value={ev}>{ar.stockMovements.events[ev]}</option>
            ))}
          </select>

          {/* Total count chip */}
          {!q.isLoading && (
            <span className="inline-flex items-center rounded-full bg-surface-row-alt border border-border-subtle px-3 py-1 text-xs text-foreground-muted tabular-num">
              {total.toLocaleString('ar-EG-u-nu-latn')} حركة
            </span>
          )}
        </div>
      }
    >
      <SectionCard noPadding>
        <ResponsiveTable
          columns={columns}
          rows={rows}
          rowKey={(m) => String(m.id)}
          rowClassName={(m) => ROW_STRIPE[EVENT_CATEGORY[m.event_type]]}
          empty={ar.common.none}
          isLoading={q.isLoading}
          isError={q.isError}
          onRetry={() => q.refetch()}
          resetKey={`${event}|${search}|${fabricId}|${colorId}|${offset}`}
        />
      </SectionCard>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-foreground-muted">
        <span className="tabular-num" dir="ltr">
          صفحة {currentPage.toLocaleString('ar-EG-u-nu-latn')} من {totalPages.toLocaleString('ar-EG-u-nu-latn')}
          {' · '}
          {rows.length.toLocaleString('ar-EG-u-nu-latn')} / {total.toLocaleString('ar-EG-u-nu-latn')}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
            السابق
          </Button>
          <Button size="sm" variant="outline" disabled={offset + rows.length >= total}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}>
            التالي
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
