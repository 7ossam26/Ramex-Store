import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { financeApi } from '@/lib/finance-api';
import { useAuth } from '@/lib/auth';
import type { Expense } from '@/lib/finance-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';

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

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المصروفات</h1>
        <Button onClick={() => setShowCreate(true)}>تسجيل مصروف</Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
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
            onClick={() => { setStatusFilter(opt.value); setPage(1); }}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة المصروفات</CardTitle>
        </CardHeader>
        <CardContent>
          {expensesQ.isLoading ? (
            <p>جاري التحميل...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-right py-2 px-3">التاريخ</th>
                  <th className="text-right py-2 px-3">الفئة</th>
                  <th className="text-right py-2 px-3">المبلغ</th>
                  <th className="text-right py-2 px-3">مدفوع من</th>
                  <th className="text-right py-2 px-3">الحالة</th>
                  <th className="text-right py-2 px-3">بواسطة</th>
                  <th className="text-right py-2 px-3">ملاحظات</th>
                  {isOwner && <th className="text-right py-2 px-3">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {(expensesQ.data?.rows ?? []).map((e: Expense) => {
                  const isPending = e.requires_approval && e.approved_at === null;
                  return (
                    <tr
                      key={e.id}
                      className={`border-b hover:bg-muted/40 ${isPending ? 'bg-amber-50' : ''}`}
                    >
                      <td className="py-2 px-3 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                      <td className="py-2 px-3">
                        {CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}
                      </td>
                      <td className="py-2 px-3 font-mono">{fmt(e.amount_egp)} ج.م</td>
                      <td className="py-2 px-3">{e.paid_from === 'cash' ? 'نقدي' : 'بنك'}</td>
                      <td className="py-2 px-3">
                        {isPending ? (
                          <span className="text-amber-600 font-medium">بانتظار الموافقة</span>
                        ) : e.approved_at ? (
                          <span className="text-green-600">معتمد</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">{e.actor_username ?? '-'}</td>
                      <td className="py-2 px-3 text-muted-foreground">{e.notes_ar ?? '-'}</td>
                      {isOwner && (
                        <td className="py-2 px-3">
                          {isPending && (
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
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {expensesQ.data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={isOwner ? 8 : 7} className="py-6 text-center text-muted-foreground">
                      لا توجد مصروفات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
        </CardContent>
      </Card>

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
              <Input type="number" step="0.01" min="0.01" {...form.register('amount_egp', { required: true })} />
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
