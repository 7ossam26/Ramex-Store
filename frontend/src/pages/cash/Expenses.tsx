import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Check, X } from 'lucide-react';
import { financeApi } from '@/lib/finance-api';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import type { Expense } from '@/lib/finance-types';
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
import { FilterChip } from '@/components/FilterChip';
import { StatusPill, type StatusTone } from '@/components/StatusPill';

const PAGE_SIZE = 50;

const fmt = (n: string | number) =>
  Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const CATEGORIES = [
  { value: 'rent', label: 'إيجار' },
  { value: 'utilities', label: 'مرافق' },
  { value: 'supplies', label: 'مستلزمات' },
  { value: 'salary', label: 'رواتب' },
  { value: 'repair', label: 'صيانة' },
  { value: 'other', label: 'أخرى' },
];

type ExpenseFormValues = {
  category: string;
  amount_egp: string;
  paid_from: 'cash' | 'bank';
  bank_account_id: string;
  notes_ar: string;
};

type StatusFilter = 'all' | 'pending' | 'approved';

function getExpenseStatus(e: Expense): { tone: StatusTone; label: string } {
  const isPending = e.requires_approval && e.approved_at === null;
  if (isPending) return { tone: 'warning', label: ar.cash.pendingApproval };
  if (e.approved_at) return { tone: 'success', label: ar.cash.approved };
  return { tone: 'neutral', label: '—' };
}

export function ExpensesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = user?.role === 'owner';

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const expensesQ = useQuery({
    queryKey: ['expenses', page, statusFilter],
    queryFn: () => financeApi.listExpenses({ status: statusFilter, page, limit: PAGE_SIZE }),
  });

  const banksQ = useQuery({
    queryKey: ['banks'],
    queryFn: financeApi.listBanks,
    enabled: showCreate,
  });

  const form = useForm<ExpenseFormValues>({
    defaultValues: {
      category: 'other',
      amount_egp: '',
      paid_from: 'cash',
      bank_account_id: '',
      notes_ar: '',
    },
  });

  const paidFrom = form.watch('paid_from');

  const createMut = useMutation({
    mutationFn: (d: ExpenseFormValues) =>
      financeApi.createExpense({
        category: d.category,
        amount_egp: Number(d.amount_egp),
        paid_from: d.paid_from,
        bank_account_id: d.paid_from === 'bank' && d.bank_account_id ? Number(d.bank_account_id) : null,
        notes_ar: d.notes_ar || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
      qc.invalidateQueries({ queryKey: ['banks'] });
      setShowCreate(false);
      form.reset();
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => financeApi.approveExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
    },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      financeApi.rejectExpense(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setRejectTarget(null);
      setRejectReason('');
    },
  });

  const totalPages = expensesQ.data ? Math.ceil(expensesQ.data.total / PAGE_SIZE) : 1;
  const expenseRows: Expense[] = expensesQ.data?.rows ?? [];

  const columns: Column<Expense>[] = [
    {
      key: 'date',
      header: 'التاريخ',
      cell: (e) => (
        <span className="whitespace-nowrap text-foreground-muted tabular-num" dir="ltr">
          {fmtDate(e.created_at)}
        </span>
      ),
      secondary: true,
    },
    {
      key: 'category',
      header: 'الفئة',
      cell: (e) => CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category,
      primary: true,
    },
    {
      key: 'amount',
      header: 'المبلغ',
      cell: (e) => (
        <span className="tabular-num font-medium text-foreground" dir="ltr">
          {fmt(e.amount_egp)} <span className="text-foreground-tertiary text-xs">ج.م</span>
        </span>
      ),
    },
    {
      key: 'paid_from',
      header: 'مدفوع من',
      cell: (e) => (e.paid_from === 'cash' ? 'نقدي' : 'بنك'),
    },
    {
      key: 'status',
      header: 'الحالة',
      cell: (e) => {
        const { tone, label } = getExpenseStatus(e);
        return <StatusPill tone={tone}>{label}</StatusPill>;
      },
    },
    {
      key: 'actor',
      header: 'بواسطة',
      cell: (e) => <span className="text-foreground-muted">{e.actor_username ?? '—'}</span>,
    },
    {
      key: 'notes',
      header: 'ملاحظات',
      cell: (e) => <span className="text-foreground-muted">{e.notes_ar ?? '—'}</span>,
      hideOnMobile: true,
    },
  ];

  const filters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'الكل' },
    { value: 'pending', label: 'بانتظار الموافقة' },
    { value: 'approved', label: 'معتمدة' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.cash.expenses}
        description={ar.hubs.expensesDesc}
        actions={
          <Button variant="accent" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="size-4" aria-hidden />
            تسجيل مصروف
          </Button>
        }
      />

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
        {filters.map((opt) => (
          <FilterChip
            key={opt.value}
            active={statusFilter === opt.value}
            onClick={() => {
              setStatusFilter(opt.value);
              setPage(1);
            }}
          >
            {opt.label}
          </FilterChip>
        ))}
      </div>

      <ResponsiveTable
        columns={columns}
        rows={expenseRows}
        rowKey={(e) => String(e.id)}
        empty="لا توجد مصروفات"
        isLoading={expensesQ.isLoading}
        isError={expensesQ.isError}
        onRetry={() => expensesQ.refetch()}
        resetKey={statusFilter}
        rowClassName={(e) =>
          e.requires_approval && e.approved_at === null ? 'bg-warning-subtle/30' : ''
        }
        actions={(e) => {
          const isPending = e.requires_approval && e.approved_at === null;
          if (!isOwner || !isPending) return null;
          return (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={approveMut.isPending}
                onClick={() => approveMut.mutate(e.id)}
                className="gap-1 text-success-foreground border-success/40 hover:bg-success-subtle"
              >
                <Check className="size-3.5" aria-hidden />
                موافقة
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectTarget(e.id)}
                className="gap-1 text-danger-foreground border-danger/40 hover:bg-danger-subtle"
              >
                <X className="size-3.5" aria-hidden />
                رفض
              </Button>
            </div>
          );
        }}
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

      {/* Create Expense Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل مصروف جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((d) => createMut.mutate(d))} className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                الفئة <span className="text-danger">*</span>
              </Label>
              <select
                className="w-full rounded-md border border-border-default bg-surface-elevated h-10 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                {...form.register('category', { required: true })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>
                المبلغ (ج.م) <span className="text-danger">*</span>
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                {...form.register('amount_egp', { required: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                مدفوع من <span className="text-danger">*</span>
              </Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="cash" {...form.register('paid_from')} />
                  <span className="text-sm text-foreground">نقدي</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="bank" {...form.register('paid_from')} />
                  <span className="text-sm text-foreground">بنك</span>
                </label>
              </div>
            </div>
            {paidFrom === 'bank' && (
              <div className="space-y-1.5">
                <Label>الحساب البنكي</Label>
                <select
                  className="w-full rounded-md border border-border-default bg-surface-elevated h-10 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  {...form.register('bank_account_id')}
                >
                  <option value="">-- اختر حساب --</option>
                  {(banksQ.data ?? [])
                    .filter((b) => b.is_active)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name_ar}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Input {...form.register('notes_ar')} />
            </div>
            {createMut.error && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">حدث خطأ</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  إلغاء
                </Button>
              </DialogClose>
              <Button type="submit" variant="accent" disabled={createMut.isPending}>
                {createMut.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectTarget !== null} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>رفض المصروف</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                سبب الرفض <span className="text-danger">*</span>
              </Label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
            {rejectMut.error && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">حدث خطأ</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  إلغاء
                </Button>
              </DialogClose>
              <Button
                variant="accent"
                disabled={!rejectReason.trim() || rejectMut.isPending}
                onClick={() =>
                  rejectTarget !== null && rejectMut.mutate({ id: rejectTarget, reason: rejectReason })
                }
                className="bg-danger hover:bg-danger/90"
              >
                {rejectMut.isPending ? 'جاري الرفض...' : 'رفض'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
