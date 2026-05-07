import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { financeApi } from '@/lib/finance-api';
import { useAuth } from '@/lib/auth';
import type { CashMovement } from '@/lib/finance-types';
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
    hour: '2-digit',
    minute: '2-digit',
  });

const EVENT_LABELS: Record<string, string> = {
  sale_payment: 'دفعة بيع نهائية',
  deposit_payment: 'عربون',
  refund: 'استرجاع',
  expense: 'مصروف',
  cash_to_bank: 'إيداع في البنك',
  owner_withdrawal: 'سحب المالك',
  opening_balance_set: 'رصيد افتتاحي',
  reconciliation_adjustment: 'تسوية',
};

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

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الخزنة الكاش</h1>
        <div className="flex gap-2">
          {isOwner && !balanceQ.data?.opening_set_at && (
            <Button onClick={() => setShowOpeningDlg(true)}>تعيين رصيد افتتاحي</Button>
          )}
          <Button variant="outline" onClick={() => setShowDepositDlg(true)}>
            إيداع في البنك
          </Button>
          {isOwner && (
            <Button variant="outline" onClick={() => setShowWithdrawalDlg(true)}>
              سحب المالك
            </Button>
          )}
        </div>
      </div>

      {/* Balance card */}
      <Card>
        <CardHeader>
          <CardTitle>الرصيد الحالي</CardTitle>
        </CardHeader>
        <CardContent>
          {balanceQ.isLoading ? (
            <p>جاري التحميل...</p>
          ) : balanceQ.data ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
                <p className="text-3xl font-bold text-green-600">
                  {fmt(balanceQ.data.current_balance_egp)} ج.م
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">الرصيد الافتتاحي</p>
                <p className="text-xl">{fmt(balanceQ.data.opening_balance_egp)} ج.م</p>
              </div>
              {balanceQ.data.last_movement_at && (
                <div>
                  <p className="text-sm text-muted-foreground">آخر حركة</p>
                  <p className="text-sm">{fmtDate(balanceQ.data.last_movement_at)}</p>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label>من تاريخ</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <Label>إلى تاريخ</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>
          مسح الفلتر
        </Button>
      </div>

      {/* Movements table */}
      <Card>
        <CardHeader>
          <CardTitle>الحركات</CardTitle>
        </CardHeader>
        <CardContent>
          {movementsQ.isLoading ? (
            <p>جاري التحميل...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-right py-2 px-3">التاريخ</th>
                  <th className="text-right py-2 px-3">النوع</th>
                  <th className="text-right py-2 px-3">الاتجاه</th>
                  <th className="text-right py-2 px-3">المبلغ</th>
                  <th className="text-right py-2 px-3">الرصيد بعد</th>
                  <th className="text-right py-2 px-3">بواسطة</th>
                  <th className="text-right py-2 px-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {(movementsQ.data?.rows ?? []).map((m: CashMovement) => (
                  <tr key={m.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 px-3 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                    <td className="py-2 px-3">{EVENT_LABELS[m.event_type] ?? m.event_type}</td>
                    <td className="py-2 px-3">
                      <span className={m.direction === 'in' ? 'text-green-600' : 'text-red-600'}>
                        {m.direction === 'in' ? '↑ داخل' : '↓ خارج'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono">{fmt(m.amount_egp)}</td>
                    <td className="py-2 px-3 font-mono">{fmt(m.balance_after_egp)}</td>
                    <td className="py-2 px-3">{m.actor_username ?? '-'}</td>
                    <td className="py-2 px-3 text-muted-foreground">{m.notes_ar ?? '-'}</td>
                  </tr>
                ))}
                {movementsQ.data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      لا توجد حركات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                السابق
              </Button>
              <span className="text-sm">
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
        </CardContent>
      </Card>

      {/* Opening Balance Dialog */}
      <Dialog open={showOpeningDlg} onOpenChange={setShowOpeningDlg}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعيين الرصيد الافتتاحي</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={openingForm.handleSubmit((d) => openingMut.mutate(d))}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>المبلغ (ج.م)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...openingForm.register('amount', { required: true })}
              />
            </div>
            {openingMut.error && (
              <p className="text-red-600 text-sm">
                {(openingMut.error as Error).message === 'OPENING_BALANCE_ALREADY_SET'
                  ? 'تم تعيين الرصيد الافتتاحي من قبل. لا يمكن إعادة التعيين.'
                  : 'حدث خطأ'}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">إلغاء</Button>
              </DialogClose>
              <Button type="submit" disabled={openingMut.isPending}>
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
          <form
            onSubmit={depositForm.handleSubmit((d) => depositMut.mutate(d))}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>المبلغ (ج.م)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                {...depositForm.register('amount', { required: true })}
              />
            </div>
            <div className="space-y-1">
              <Label>الحساب البنكي</Label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
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
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input {...depositForm.register('notes_ar')} />
            </div>
            {depositMut.error && (
              <p className="text-red-600 text-sm">حدث خطأ</p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">إلغاء</Button>
              </DialogClose>
              <Button type="submit" disabled={depositMut.isPending}>
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
            <div className="space-y-1">
              <Label>المبلغ (ج.م)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                {...withdrawalForm.register('amount', { required: true })}
              />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input {...withdrawalForm.register('notes_ar')} />
            </div>
            {withdrawalMut.error && (
              <p className="text-red-600 text-sm">حدث خطأ</p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">إلغاء</Button>
              </DialogClose>
              <Button type="submit" disabled={withdrawalMut.isPending}>
                {withdrawalMut.isPending ? 'جاري التنفيذ...' : 'تأكيد السحب'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
