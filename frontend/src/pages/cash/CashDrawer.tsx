import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { financeApi } from '@/lib/finance-api';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import type { CashMovement } from '@/lib/finance-types';
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
import { PageHeader } from '@/components/PageHeader';
import { TableFilterBar } from '@/components/TableFilterBar';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const fmt = (n: string | number) =>
  Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const EVENT_LABELS = ar.cash.eventTypes as Record<string, string>;

export function CashDrawerPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = user?.role === 'owner';

  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showOpeningDlg, setShowOpeningDlg] = useState(false);
  const [showDepositDlg, setShowDepositDlg] = useState(false);
  const [showWithdrawalDlg, setShowWithdrawalDlg] = useState(false);

  const balanceQ = useQuery({
    queryKey: ['cash-balance'],
    queryFn: financeApi.getCashBalance,
  });

  const movementsQ = useQuery({
    queryKey: ['cash-movements', page, from, to],
    queryFn: () => financeApi.getCashMovements({ from: from || undefined, to: to || undefined, page, limit: PAGE_SIZE }),
  });

  const banksQ = useQuery({
    queryKey: ['banks'],
    queryFn: financeApi.listBanks,
    enabled: showDepositDlg,
  });

  const openingForm = useForm<{ amount: string; override: boolean }>({
    defaultValues: { amount: '', override: false },
  });
  const depositForm = useForm<{ amount: string; bank_account_id: string; notes_ar: string }>({
    defaultValues: { amount: '', bank_account_id: '', notes_ar: '' },
  });
  const withdrawalForm = useForm<{ amount: string; notes_ar: string }>({
    defaultValues: { amount: '', notes_ar: '' },
  });

  const openingMut = useMutation({
    mutationFn: (d: { amount: string; override: boolean }) =>
      financeApi.setOpeningBalance(Number(d.amount), d.override),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
      setShowOpeningDlg(false);
      openingForm.reset();
    },
  });

  const depositMut = useMutation({
    mutationFn: (d: { amount: string; bank_account_id: string; notes_ar: string }) =>
      financeApi.depositToBank({
        amount: Number(d.amount),
        bank_account_id: Number(d.bank_account_id),
        notes_ar: d.notes_ar || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
      qc.invalidateQueries({ queryKey: ['banks'] });
      setShowDepositDlg(false);
      depositForm.reset();
    },
  });

  const withdrawalMut = useMutation({
    mutationFn: (d: { amount: string; notes_ar: string }) =>
      financeApi.ownerWithdrawal({ amount: Number(d.amount), notes_ar: d.notes_ar || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
      setShowWithdrawalDlg(false);
      withdrawalForm.reset();
    },
  });

  const totalPages = movementsQ.data ? Math.ceil(movementsQ.data.total / PAGE_SIZE) : 1;
  const movementRows: CashMovement[] = movementsQ.data?.rows ?? [];

  const columns: Column<CashMovement>[] = [
    {
      key: 'date',
      header: 'التاريخ',
      cell: (m) => (
        <span className="whitespace-nowrap text-foreground-muted tabular-num" dir="ltr">
          {fmtDate(m.created_at)}
        </span>
      ),
      secondary: true,
    },
    {
      key: 'event',
      header: 'النوع',
      cell: (m) => EVENT_LABELS[m.event_type] ?? m.event_type,
      primary: true,
    },
    {
      key: 'dir',
      header: 'الاتجاه',
      cell: (m) => (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium',
            m.direction === 'in'
              ? 'bg-success-subtle text-success-foreground'
              : 'bg-danger-subtle text-danger-foreground',
          )}
        >
          {m.direction === 'in' ? (
            <TrendingUp className="size-3" aria-hidden />
          ) : (
            <TrendingDown className="size-3" aria-hidden />
          )}
          {m.direction === 'in' ? ar.treasuriesOverview.inbound : ar.treasuriesOverview.outbound}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'المبلغ',
      cell: (m) => (
        <span
          className={cn(
            'tabular-num font-medium',
            m.direction === 'in' ? 'text-success-foreground' : 'text-danger-foreground',
          )}
          dir="ltr"
        >
          {m.direction === 'out' ? '−' : '+'}
          {fmt(m.amount_egp)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'الرصيد بعد',
      cell: (m) => (
        <span className="tabular-num text-foreground" dir="ltr">
          {fmt(m.balance_after_egp)}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'بواسطة',
      cell: (m) => <span className="text-foreground-muted">{m.actor_username ?? '—'}</span>,
    },
    {
      key: 'notes',
      header: 'ملاحظات',
      cell: (m) => <span className="text-foreground-muted">{m.notes_ar ?? '—'}</span>,
      hideOnMobile: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.cash.drawer}
        description={ar.hubs.cashDesc}
        actions={
          <>
            {isOwner && !balanceQ.data?.opening_set_at && (
              <Button variant="accent" onClick={() => setShowOpeningDlg(true)}>
                {ar.cash.setOpening}
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowDepositDlg(true)}>
              {ar.cash.depositToBank}
            </Button>
            {isOwner && (
              <Button variant="outline" onClick={() => setShowWithdrawalDlg(true)}>
                {ar.cash.ownerWithdrawal}
              </Button>
            )}
          </>
        }
      />

      {/* Balance card */}
      <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm">
        {balanceQ.isLoading ? (
          <div className="space-y-3" aria-hidden>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-48" />
          </div>
        ) : balanceQ.data ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1">
                {ar.cash.balance}
              </p>
              <p className="text-4xl font-semibold text-foreground tabular-num leading-none" dir="ltr">
                {fmt(balanceQ.data.current_balance_egp)}
              </p>
              <p className="text-xs text-foreground-tertiary mt-1.5">ج.م</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1">
                {ar.cash.openingBalance}
              </p>
              <p className="text-xl font-semibold text-foreground tabular-num" dir="ltr">
                {fmt(balanceQ.data.opening_balance_egp)}
              </p>
              <p className="text-xs text-foreground-tertiary">ج.م</p>
            </div>
            {balanceQ.data.last_movement_at && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1">
                  آخر حركة
                </p>
                <p className="text-sm text-foreground tabular-num" dir="ltr">
                  {fmtDate(balanceQ.data.last_movement_at)}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Filter bar */}
      <TableFilterBar
        filters={
          <>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-foreground-muted">من تاريخ</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full sm:w-40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-foreground-muted">إلى تاريخ</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full sm:w-40"
              />
            </div>
            {(from || to) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setPage(1);
                }}
                className="self-end"
              >
                مسح
              </Button>
            )}
          </>
        }
        resultCount={movementsQ.data?.total}
      />

      <ResponsiveTable
        columns={columns}
        rows={movementRows}
        rowKey={(m) => String(m.id)}
        empty="لا توجد حركات"
        isLoading={movementsQ.isLoading}
        isError={movementsQ.isError}
        onRetry={() => movementsQ.refetch()}
        resetKey={`${from}-${to}`}
      />

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </Button>
          <span className="text-sm text-foreground-muted tabular-num" dir="ltr">
            {page} / {totalPages}
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

      {/* Opening Balance Dialog */}
      <Dialog open={showOpeningDlg} onOpenChange={setShowOpeningDlg}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعيين الرصيد الافتتاحي</DialogTitle>
          </DialogHeader>
          <form onSubmit={openingForm.handleSubmit((d) => openingMut.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>المبلغ (ج.م)</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                {...openingForm.register('amount', { required: true })}
              />
            </div>
            {openingMut.error && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">
                {(openingMut.error as Error).message === 'OPENING_BALANCE_ALREADY_SET'
                  ? 'تم تعيين الرصيد الافتتاحي من قبل. لا يمكن إعادة التعيين.'
                  : 'حدث خطأ'}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  إلغاء
                </Button>
              </DialogClose>
              <Button type="submit" variant="accent" disabled={openingMut.isPending}>
                {openingMut.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deposit to Bank Dialog */}
      <Dialog open={showDepositDlg} onOpenChange={setShowDepositDlg}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إيداع في البنك</DialogTitle>
          </DialogHeader>
          <form onSubmit={depositForm.handleSubmit((d) => depositMut.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>المبلغ (ج.م)</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                {...depositForm.register('amount', { required: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>الحساب البنكي</Label>
              <select
                className="w-full rounded-md border border-border-default bg-surface-elevated h-10 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                {...depositForm.register('bank_account_id', { required: true })}
              >
                <option value="">-- اختر حساب --</option>
                {(banksQ.data ?? [])
                  .filter((b) => b.is_active)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name_ar} {b.bank_name_ar ? `(${b.bank_name_ar})` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Input {...depositForm.register('notes_ar')} />
            </div>
            {depositMut.error && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">حدث خطأ</p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  إلغاء
                </Button>
              </DialogClose>
              <Button type="submit" variant="accent" disabled={depositMut.isPending}>
                {depositMut.isPending ? 'جاري التنفيذ...' : 'تأكيد الإيداع'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Owner Withdrawal Dialog */}
      <Dialog open={showWithdrawalDlg} onOpenChange={setShowWithdrawalDlg}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>سحب المالك</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={withdrawalForm.handleSubmit((d) => withdrawalMut.mutate(d))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>المبلغ (ج.م)</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                {...withdrawalForm.register('amount', { required: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Input {...withdrawalForm.register('notes_ar')} />
            </div>
            {withdrawalMut.error && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">حدث خطأ</p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  إلغاء
                </Button>
              </DialogClose>
              <Button type="submit" variant="accent" disabled={withdrawalMut.isPending}>
                {withdrawalMut.isPending ? 'جاري التنفيذ...' : 'تأكيد السحب'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
