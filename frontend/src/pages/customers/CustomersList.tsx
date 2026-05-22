import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Search, TrendingUp, Users, Wallet } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { customersApi } from '@/lib/customers-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ResponsiveDialog';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import type { Customer } from '@/lib/customers-types';

const PAGE_SIZE = 30;

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

type CreateFormVals = {
  name_ar: string;
  phone: string;
  phone_secondary: string;
  address_ar: string;
  tax_no: string;
  notes_ar: string;
};

export function CustomersListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1');
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => customersApi.list({ search: search || undefined, page, limit: PAGE_SIZE }),
  });

  const form = useForm<CreateFormVals>({
    defaultValues: { name_ar: '', phone: '', phone_secondary: '', address_ar: '', tax_no: '', notes_ar: '' },
  });

  const create = useMutation({
    mutationFn: (v: CreateFormVals) =>
      customersApi.create({
        name_ar: v.name_ar,
        phone: v.phone,
        phone_secondary: v.phone_secondary || null,
        address_ar: v.address_ar || null,
        tax_no: v.tax_no || null,
        notes_ar: v.notes_ar || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      form.reset();
      setCreateOpen(false);
      setSearchParams({});
    },
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
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader
        title={ar.customers.title}
        actions={<Button onClick={openCreate}>{ar.customers.addCustomer}</Button>}
      />

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

      {/* Filter bar */}
      <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3 flex flex-col sm:flex-row sm:items-center gap-3">
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
        <div className="text-sm text-foreground-muted sm:ms-auto">
          نتائج: <span className="tabular-num text-foreground" dir="ltr">{total}</span>
        </div>
      </div>

      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(c) => String(c.id)}
        empty={ar.customers.empty}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        resetKey={`${search}|${page}`}
      />

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

      {/* Create customer dialog */}
      <Dialog open={createOpen} onOpenChange={closeCreate}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{ar.customers.create}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">
                  {ar.customers.nameAr}
                  <span className="text-danger ms-1" aria-hidden>*</span>
                </Label>
                <Input {...form.register('name_ar', { required: true })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">
                  {ar.customers.phone}
                  <span className="text-danger ms-1" aria-hidden>*</span>
                </Label>
                <Input {...form.register('phone', { required: true })} placeholder="01012345678" dir="ltr" inputMode="tel" autoComplete="tel" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.customers.phoneSecondary}</Label>
                <Input {...form.register('phone_secondary')} placeholder="01012345678" dir="ltr" inputMode="tel" autoComplete="tel" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.customers.taxNo}</Label>
                <Input {...form.register('tax_no')} dir="ltr" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-sm font-medium text-foreground">{ar.customers.address}</Label>
                <Input {...form.register('address_ar')} dir="rtl" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-sm font-medium text-foreground">{ar.customers.notes}</Label>
                <Input {...form.register('notes_ar')} dir="rtl" />
              </div>
            </div>
            {create.error && (
              <p className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
                {(create.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ar.common.error}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline">{ar.common.cancel}</Button>
              </DialogClose>
              <Button type="submit" disabled={create.isPending}>{ar.common.save}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
