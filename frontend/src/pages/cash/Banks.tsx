import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { financeApi } from '@/lib/finance-api';
import { useAuth } from '@/lib/auth';
import type { BankAccount, BankMovement } from '@/lib/finance-types';
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
  instapay_payment: 'انستاباي',
  cash_deposit: 'إيداع نقدي',
  refund: 'استرجاع',
  reconciliation_adjustment: 'تسوية',
  opening_balance_set: 'رصيد افتتاحي',
  other_in: 'دخول آخر',
  other_out: 'خروج آخر',
};

type BankFormValues = {
  name_ar: string;
  bank_name_ar: string;
  branch_ar: string;
  iban: string;
  account_number: string;
  notes_ar: string;
  is_default: boolean;
};

export function BanksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = user?.role === 'owner';

  const [selectedBank, setSelectedBank] = useState<BankAccount | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editBank, setEditBank] = useState<BankAccount | null>(null);
  const [movPage, setMovPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const banksQ = useQuery({ queryKey: ['banks'], queryFn: financeApi.listBanks });

  const movementsQ = useQuery({
    queryKey: ['bank-movements', selectedBank?.id, movPage, from, to],
    queryFn: () =>
      financeApi.getBankMovements(selectedBank!.id, {
        from: from || undefined,
        to: to || undefined,
        page: movPage,
        limit: PAGE_SIZE,
      }),
    enabled: !!selectedBank,
  });

  const createForm = useForm<BankFormValues>({
    defaultValues: {
      name_ar: '', bank_name_ar: '', branch_ar: '',
      iban: '', account_number: '', notes_ar: '', is_default: false,
    },
  });

  const editForm = useForm<BankFormValues>();

  const createMut = useMutation({
    mutationFn: (d: BankFormValues) =>
      financeApi.createBank({
        name_ar: d.name_ar,
        bank_name_ar: d.bank_name_ar || null,
        branch_ar: d.branch_ar || null,
        iban: d.iban || null,
        account_number: d.account_number || null,
        notes_ar: d.notes_ar || null,
        is_default: d.is_default,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['banks'] });
      setShowCreate(false);
      createForm.reset();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: BankFormValues }) =>
      financeApi.updateBank(id, {
        name_ar: d.name_ar,
        bank_name_ar: d.bank_name_ar || null,
        branch_ar: d.branch_ar || null,
        iban: d.iban || null,
        account_number: d.account_number || null,
        notes_ar: d.notes_ar || null,
        is_default: d.is_default,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['banks'] });
      setEditBank(null);
    },
  });

  function openEdit(b: BankAccount) {
    setEditBank(b);
    editForm.reset({
      name_ar: b.name_ar,
      bank_name_ar: b.bank_name_ar ?? '',
      branch_ar: b.branch_ar ?? '',
      iban: b.iban ?? '',
      account_number: b.account_number ?? '',
      notes_ar: b.notes_ar ?? '',
      is_default: b.is_default,
    });
  }

  const totalPages = movementsQ.data ? Math.ceil(movementsQ.data.total / PAGE_SIZE) : 1;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">البنوك</h1>
        {isOwner && (
          <Button onClick={() => setShowCreate(true)}>إضافة حساب بنكي</Button>
        )}
      </div>

      {/* Bank accounts list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(banksQ.data ?? []).map((b: BankAccount) => (
          <Card
            key={b.id}
            className={`cursor-pointer transition-colors ${selectedBank?.id === b.id ? 'border-primary' : ''} ${!b.is_active ? 'opacity-60' : ''}`}
            onClick={() => { setSelectedBank(b); setMovPage(1); }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{b.name_ar}</CardTitle>
                <div className="flex gap-1">
                  {b.is_default && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                      افتراضي
                    </span>
                  )}
                  {!b.is_active && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                      غير نشط
                    </span>
                  )}
                </div>
              </div>
              {b.bank_name_ar && <p className="text-sm text-muted-foreground">{b.bank_name_ar}</p>}
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{fmt(b.current_balance_egp)} ج.م</p>
              {b.account_number && (
                <p className="text-xs text-muted-foreground mt-1">رقم الحساب: {b.account_number}</p>
              )}
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={(e) => { e.stopPropagation(); openEdit(b); }}
                >
                  تعديل
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {banksQ.data?.length === 0 && (
          <p className="text-muted-foreground col-span-3">لا توجد حسابات بنكية</p>
        )}
      </div>

      {/* Selected bank movements */}
      {selectedBank && (
        <Card>
          <CardHeader>
            <CardTitle>حركات: {selectedBank.name_ar}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label>من تاريخ</Label>
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setMovPage(1); }} />
              </div>
              <div className="space-y-1">
                <Label>إلى تاريخ</Label>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setMovPage(1); }} />
              </div>
              <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setMovPage(1); }}>
                مسح
              </Button>
            </div>

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
                  </tr>
                </thead>
                <tbody>
                  {(movementsQ.data?.rows ?? []).map((m: BankMovement) => (
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
                    </tr>
                  ))}
                  {movementsQ.data?.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        لا توجد حركات
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-4">
                <Button variant="outline" size="sm" disabled={movPage <= 1} onClick={() => setMovPage((p) => p - 1)}>
                  السابق
                </Button>
                <span className="text-sm">{movPage} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={movPage >= totalPages} onClick={() => setMovPage((p) => p + 1)}>
                  التالي
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Bank Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حساب بنكي جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit((d) => createMut.mutate(d))} className="space-y-3">
            <div className="space-y-1">
              <Label>اسم الحساب *</Label>
              <Input {...createForm.register('name_ar', { required: true })} />
            </div>
            <div className="space-y-1">
              <Label>اسم البنك</Label>
              <Input {...createForm.register('bank_name_ar')} />
            </div>
            <div className="space-y-1">
              <Label>الفرع</Label>
              <Input {...createForm.register('branch_ar')} />
            </div>
            <div className="space-y-1">
              <Label>رقم الحساب</Label>
              <Input {...createForm.register('account_number')} />
            </div>
            <div className="space-y-1">
              <Label>IBAN</Label>
              <Input {...createForm.register('iban')} />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input {...createForm.register('notes_ar')} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_default_c" {...createForm.register('is_default')} />
              <Label htmlFor="is_default_c">حساب افتراضي</Label>
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

      {/* Edit Bank Dialog */}
      <Dialog open={!!editBank} onOpenChange={(o) => !o && setEditBank(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل الحساب البنكي</DialogTitle>
          </DialogHeader>
          {editBank && (
            <form
              onSubmit={editForm.handleSubmit((d) => updateMut.mutate({ id: editBank.id, d }))}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label>اسم الحساب *</Label>
                <Input {...editForm.register('name_ar', { required: true })} />
              </div>
              <div className="space-y-1">
                <Label>اسم البنك</Label>
                <Input {...editForm.register('bank_name_ar')} />
              </div>
              <div className="space-y-1">
                <Label>الفرع</Label>
                <Input {...editForm.register('branch_ar')} />
              </div>
              <div className="space-y-1">
                <Label>رقم الحساب</Label>
                <Input {...editForm.register('account_number')} />
              </div>
              <div className="space-y-1">
                <Label>IBAN</Label>
                <Input {...editForm.register('iban')} />
              </div>
              <div className="space-y-1">
                <Label>ملاحظات</Label>
                <Input {...editForm.register('notes_ar')} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_default_e" {...editForm.register('is_default')} />
                <Label htmlFor="is_default_e">حساب افتراضي</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active_e" {...editForm.register('is_active' as keyof BankFormValues)} />
                <Label htmlFor="is_active_e">نشط</Label>
              </div>
              {updateMut.error && <p className="text-red-600 text-sm">حدث خطأ</p>}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">إلغاء</Button>
                </DialogClose>
                <Button type="submit" disabled={updateMut.isPending}>
                  {updateMut.isPending ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
