import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Search, TrendingUp, Users, Wallet, Pencil, FileText, FileSpreadsheet } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { customersApi, customersListExportUrl, type CustomerBalanceFilter } from '@/lib/customers-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import type { Customer } from '@/lib/customers-types';

const PAGE_SIZE = 30;

const selectClass =
  'flex h-10 w-full sm:w-44 rounded border border-border bg-canvas px-3 py-2 text-sm focus-visible:outline-none focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer appearance-none';

function balanceColor(balance: string) {
  const n = Number(balance);
  if (n < 0) return 'text-danger';
  if (n > 0) return 'text-success-foreground';
  return 'text-foreground-muted';
}

function balanceLabel(balance: string) {
  const n = Number(balance);
  const formatted = Math.abs(n).toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return `${formatted} ${ar.customers.balanceDebt}`;
  if (n > 0) return `${formatted} ${ar.customers.balanceCredit}`;
  return '0.00';
}

/** Balance-direction pill (مدين / دائن / متعادل) — mirrors the supplier status word. */
function StatusPill({ balance }: { balance: string }) {
  const n = Number(balance);
  const label = n < 0 ? ar.customers.statusDebt : n > 0 ? ar.customers.statusCredit : ar.customers.statusSettled;
  const cls = n < 0
    ? 'bg-danger/10 text-danger'
    : n > 0
      ? 'bg-success/10 text-success-foreground'
      : 'bg-surface-row-alt text-foreground-muted';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

/** Opens an authenticated export URL (token in the query) to download the file. */
function triggerDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function CustomersListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [balance, setBalance] = useState<CustomerBalanceFilter>('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1');
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  const q = useQuery({
    queryKey: ['customers', search, balance, page],
    queryFn: () => customersApi.list({ search: search || undefined, balance, page, limit: PAGE_SIZE }),
  });

  const openCreate = useCallback(() => {
    setCreateOpen(true);
    setSearchParams({ create: '1' });
  }, [setSearchParams]);

  const closeCreate = useCallback((open: boolean) => {
    setCreateOpen(open);
    if (!open) setSearchParams({});
  }, [setSearchParams]);

  const rows: Customer[] = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportDisabled = q.isLoading || total === 0;

  const kpis = useMemo(() => {
    let withDebt = 0;
    let withCredit = 0;
    let totalVolume = 0;
    for (const c of rows) {
      const bal = Number(c.current_balance_egp);
      if (bal < 0) withDebt += 1;
      else if (bal > 0) withCredit += 1;
      totalVolume += Number(c.lifetime_volume_egp);
    }
    return { withDebt, withCredit, totalVolume };
  }, [rows]);

  const columns: Column<Customer>[] = [
    {
      key: 'code',
      header: ar.customers.customerCode,
      cell: (c) => <span className="font-mono text-xs text-foreground-muted">{c.customer_code}</span>,
      secondary: true,
    },
    {
      key: 'name',
      header: ar.customers.nameAr,
      cell: (c) => (
        <Link to={`/customers/${c.id}`} className="text-accent hover:text-accent-hover hover:underline underline-offset-2 font-medium">
          {c.name_ar}
        </Link>
      ),
      primary: true,
    },
    {
      key: 'phone',
      header: ar.customers.phone,
      cell: (c) => <span className="font-mono tabular-num" dir="ltr">{c.phone}</span>,
      secondary: true,
    },
    {
      key: 'volume',
      header: ar.customers.lifetimeVolume,
      cell: (c) => (
        <span className="tabular-num" dir="ltr">
          {Number(c.lifetime_volume_egp).toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-foreground-tertiary text-xs">ج.م</span>
        </span>
      ),
    },
    {
      key: 'balance',
      header: ar.customers.currentBalance,
      cell: (c) => (
        <span className={`font-medium tabular-num ${balanceColor(c.current_balance_egp)}`} dir="ltr">
          {balanceLabel(c.current_balance_egp)}
        </span>
      ),
    },
    {
      key: 'status',
      header: ar.customers.status,
      cell: (c) => <StatusPill balance={c.current_balance_egp} />,
    },
  ];

  return (
    <PageShell
      title={ar.customers.title}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exportDisabled}
            onClick={() => triggerDownload(customersListExportUrl({ search: search || undefined, balance, format: 'pdf' }))}
          >
            <FileText className="size-4" aria-hidden />
            {ar.customers.exportPdf}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exportDisabled}
            onClick={() => triggerDownload(customersListExportUrl({ search: search || undefined, balance, format: 'excel' }))}
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            {ar.customers.exportExcel}
          </Button>
          <Button onClick={openCreate}>{ar.customers.addCustomer}</Button>
        </div>
      }
      filters={
        <>
          <div className="relative flex-1 min-w-0 sm:max-w-md">
            <Search
              className="size-4 absolute top-1/2 -translate-y-1/2 start-3 text-foreground-tertiary pointer-events-none"
              aria-hidden
            />
            <Input
              placeholder={ar.customers.search}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              dir="rtl"
              className="ps-9 h-10"
            />
          </div>
          <select
            className={selectClass}
            value={balance}
            onChange={(e) => { setBalance(e.target.value as CustomerBalanceFilter); setPage(1); }}
            aria-label={ar.customers.filterBalance}
          >
            <option value="all">{ar.customers.filterAll}</option>
            <option value="debt">{ar.customers.statusDebt}</option>
            <option value="credit">{ar.customers.statusCredit}</option>
            <option value="settled">{ar.customers.statusSettled}</option>
          </select>
          <div className="text-sm text-foreground-muted sm:ms-auto">
            نتائج: <span className="tabular-num text-foreground" dir="ltr">{total}</span>
          </div>
        </>
      }
    >
      <SectionCard noPadding>
        <div className="p-4 border-b border-border-subtle">
          <KpiGrid>
            <MetricCard
              label="إجمالي العملاء"
              value={q.isLoading ? null : total}
              format="int"
              tone="accent"
              emDashOnZero={false}
              meta={<span className="inline-flex items-center gap-1"><Users className="size-3.5" />عميل مسجّل</span>}
            />
            <MetricCard
              label="عملاء بمديونيات"
              value={q.isLoading ? null : kpis.withDebt}
              format="int"
              tone={kpis.withDebt > 0 ? 'danger' : 'success'}
              emDashOnZero={false}
              meta={<span className="inline-flex items-center gap-1"><AlertTriangle className="size-3.5" />رصيد مدين</span>}
            />
            <MetricCard
              label="عملاء برصيد دائن"
              value={q.isLoading ? null : kpis.withCredit}
              format="int"
              tone={kpis.withCredit > 0 ? 'success' : 'default'}
              emDashOnZero={false}
              meta={<span className="inline-flex items-center gap-1"><Wallet className="size-3.5" />رصيد دائن</span>}
            />
            <MetricCard
              label="إجمالي المبيعات"
              value={q.isLoading ? null : kpis.totalVolume}
              format="money"
              tone="info"
              meta={<span className="inline-flex items-center gap-1"><TrendingUp className="size-3.5" />حجم المبيعات</span>}
            />
          </KpiGrid>
        </div>
        <ResponsiveTable
          columns={columns}
          rows={rows}
          rowKey={(c) => String(c.id)}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          empty={ar.customers.empty}
          isLoading={q.isLoading}
          isError={q.isError}
          onRetry={() => q.refetch()}
          resetKey={`${search}|${balance}|${page}`}
          actions={(c) => (
            <Button
              size="sm"
              variant="outline"
              aria-label={ar.customers.editAction}
              onClick={(e) => { e.stopPropagation(); setEditCustomer(c); }}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          )}
        />
      </SectionCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            السابق
          </Button>
          <span className="text-sm text-foreground-muted">
            صفحة <span className="tabular-num text-foreground" dir="ltr">{page}</span> من <span className="tabular-num text-foreground" dir="ltr">{totalPages}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      )}

      {/* Create + inline-edit dialogs (shared component) */}
      <CustomerFormDialog mode="create" open={createOpen} onOpenChange={closeCreate} />
      <CustomerFormDialog
        mode="edit"
        customer={editCustomer}
        open={!!editCustomer}
        onOpenChange={(o) => { if (!o) setEditCustomer(null); }}
      />
    </PageShell>
  );
}
