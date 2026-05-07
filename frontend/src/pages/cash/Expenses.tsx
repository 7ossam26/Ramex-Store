import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { financeApi } from '@/lib/finance-api';
import { useAuth } from '@/lib/auth';
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

const PAGE_SIZE = 50;

const fmt = (n: string | number) =>
  Number(n).toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('ar-EG-u-nu-latn', {
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

export function ExpensesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = user?.role === 'owner';

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');
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
      cell: (e) => <span className="whitespace-nowrap">{fmtDate(e.created_at)}</span>,
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
      cell: (e) => <span className="font-mono">{fmt(e.amount_egp)} ج.م</span>,
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
        const isPending = e.requires_approval && e.approved_at === null;
        if (isPending) return <span className="text-amber-600 font-medium">بانتظار الموافقة</span>;
        if (e.approved_at) return <span className="text-green-600">معتمد</span>;
        return <span className="text-muted-foreground">—</span>;
      },
    },
    { key: 'actor', header: 'بواسطة', cell: (e) => e.actor_username ?? '-' },
    {
      key: 'notes',
      header: 'ملاحظات',
      cell: (e) => <span className="text-muted-foreground">{e.notes_ar ?? '-'}</span>,
      hideOnMobile: true,
    },
  ];

  return (
    <div dir="rtl" className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold">المصروفات</h1>
        <Button onClick={() => setShowCreate(true)} className="h-11 md:h-10">تسجيل مصروف</Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
        {(
          [
            { value: 'all', label: 'الكل' },
            { value: 'pending', label: 'بانتظار الموافقة' },
            { value: 'approved', label: 'معتمدة' },
          ] as const
        ).map((opt) => (
          <Button
            key={opt.value}
            variant={statusFilter === opt.value ? 'default' : 'outline'}
            size="sm"
            className="h-11 md:h-9 whitespace-nowrap"
            onClick={() => { setStatusFilter(opt.value); setPage(1); }}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {expensesQ.isLoading ? (
        <p>جاري التحميل...</p>
      ) : (
        <ResponsiveTable
          columns={columns}
          rows={expenseRows}
          rowKey={(e) => String(e.id)}
          empty="لا توجد مصروفات"
          rowClassName={(e) =>
            e.requires_approval && e.approved_at === null ? 'bg-amber-50' : ''
          }
          actions={(e) => {
            const isPending = e.requires_approval && e.approved_at === null;
            if (!isOwner || !isPending) return null;
            return (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-700"
                  disabled={approveMut.isPending}
                  onClick={() => approveMut.mutate(e.id)}
                >
                  موافقة
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-700"
                  onClick={() => setRejectTarget(e.id)}
                >
                  رفض
                </Button>
              </div>
            );
          }}
        />
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </Button>
          <span className="text-sm">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
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
            <div className="space-y-1">
              <Label>الفئة *</Label>
              <select className="w-full border rounded px-3 py-2 text-sm" {...form.register('category', { required: true })}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>المبلغ (ج.م) *</Label>
              <Input type="number" inputMode="decimal" step="0.01" min="0.01" {...form.register('amount_egp', { required: true })} />
            </div>
            <div className="space-y-1">
              <Label>مدفوع من *</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1">
                  <input type="radio" value="cash" {...form.register('paid_from')} />
                  <span>نقدي</span>
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" value="bank" {...form.register('paid_from')} />
                  <span>بنك</span>
                </label>
              </div>
            </div>
            {paidFrom === 'bank' && (
              <div className="space-y-1">
                <Label>الحساب البنكي</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" {...form.register('bank_account_id')}>
                  <option value="">-- اختر حساب --</option>
                  {(banksQ.data ?? []).filter((b) => b.is_active).map((b) => (
                    <option key={b.id} value={b.id}>{b.name_ar}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input {...form.register('notes_ar')} />
            </div>
            {createMut.error && <p className="text-red-600 text-sm">حدث خطأ</p>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">إلغاء</Button>
              </DialogClose>
              <Button type="submit" disabled={createMut.isPending}>
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
            <div className="space-y-1">
              <Label>سبب الرفض *</Label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            {rejectMut.error && <p className="text-red-600 text-sm">حدث خطأ</p>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">إلغاء</Button>
              </DialogClose>
              <Button
                disabled={!rejectReason.trim() || rejectMut.isPending}
                onClick={() => rejectTarget !== null && rejectMut.mutate({ id: rejectTarget, reason: rejectReason })}
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
