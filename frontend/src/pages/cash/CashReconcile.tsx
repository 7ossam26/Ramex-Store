import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { financeApi } from '@/lib/finance-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const fmt = (n: string | number) =>
  Number(n).toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function todayCairo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

type CashReconForm = {
  date: string;
  actual_balance_egp: string;
  notes_ar: string;
};

type BankReconForm = {
  date: string;
  actual_balance_egp: string;
  notes_ar: string;
};

export function CashReconcilePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'cash' | 'bank'>('cash');
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [result, setResult] = useState<{ variance_egp: number } | null>(null);

  const balanceQ = useQuery({
    queryKey: ['cash-balance'],
    queryFn: financeApi.getCashBalance,
    enabled: tab === 'cash',
  });

  const banksQ = useQuery({
    queryKey: ['banks'],
    queryFn: financeApi.listBanks,
    enabled: tab === 'bank',
  });

  const selectedBank = banksQ.data?.find((b) => b.id === selectedBankId);

  const cashForm = useForm<CashReconForm>({
    defaultValues: { date: todayCairo(), actual_balance_egp: '', notes_ar: '' },
  });

  const bankForm = useForm<BankReconForm>({
    defaultValues: { date: todayCairo(), actual_balance_egp: '', notes_ar: '' },
  });

  const cashMut = useMutation({
    mutationFn: (d: CashReconForm) =>
      financeApi.reconcileCash({
        date: d.date,
        actual_balance_egp: Number(d.actual_balance_egp),
        notes_ar: d.notes_ar || null,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
      setResult(data);
      cashForm.reset({ date: todayCairo(), actual_balance_egp: '', notes_ar: '' });
    },
  });

  const bankMut = useMutation({
    mutationFn: (d: BankReconForm) => {
      if (!selectedBankId) throw new Error('NO_BANK_SELECTED');
      return financeApi.reconcileBank(selectedBankId, {
        date: d.date,
        actual_balance_egp: Number(d.actual_balance_egp),
        notes_ar: d.notes_ar || null,
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['banks'] });
      qc.invalidateQueries({ queryKey: ['bank-movements'] });
      setResult(data);
      bankForm.reset({ date: todayCairo(), actual_balance_egp: '', notes_ar: '' });
    },
  });

  return (
    <div dir="rtl" className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">التسوية اليومية</h1>

      {/* Tab selector */}
      <div className="flex gap-2">
        <Button
          variant={tab === 'cash' ? 'default' : 'outline'}
          onClick={() => { setTab('cash'); setResult(null); }}
        >
          الخزنة النقدية
        </Button>
        <Button
          variant={tab === 'bank' ? 'default' : 'outline'}
          onClick={() => { setTab('bank'); setResult(null); }}
        >
          البنك
        </Button>
      </div>

      {/* Result display */}
      {result && (
        <Card className={Math.abs(result.variance_egp) < 0.001 ? 'border-green-500' : 'border-red-500'}>
          <CardContent className="pt-4">
            {Math.abs(result.variance_egp) < 0.001 ? (
              <p className="text-green-600 font-medium">تطابق مثالي — لا يوجد فرق</p>
            ) : (
              <div>
                <p className="text-red-600 font-bold text-lg">
                  فرق: {fmt(result.variance_egp)} ج.م
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.variance_egp < 0 ? 'عجز في الخزنة' : 'زيادة في الخزنة'}. تم إشعار المالك.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'cash' && (
        <Card>
          <CardHeader>
            <CardTitle>تسوية الخزنة النقدية</CardTitle>
          </CardHeader>
          <CardContent>
            {balanceQ.data && (
              <div className="mb-4 p-3 bg-muted rounded">
                <p className="text-sm text-muted-foreground">الرصيد المتوقع (حسب النظام)</p>
                <p className="text-2xl font-bold">{fmt(balanceQ.data.current_balance_egp)} ج.م</p>
              </div>
            )}
            <form
              onSubmit={cashForm.handleSubmit((d) => cashMut.mutate(d))}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Label>تاريخ التسوية *</Label>
                <Input type="date" {...cashForm.register('date', { required: true })} />
              </div>
              <div className="space-y-1">
                <Label>الرصيد الفعلي (عد نقدي) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  {...cashForm.register('actual_balance_egp', { required: true })}
                />
              </div>
              <div className="space-y-1">
                <Label>ملاحظات</Label>
                <Input {...cashForm.register('notes_ar')} />
              </div>
              {cashMut.error && <p className="text-red-600 text-sm">حدث خطأ</p>}
              <Button type="submit" disabled={cashMut.isPending}>
                {cashMut.isPending ? 'جاري التسوية...' : 'تأكيد التسوية'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === 'bank' && (
        <Card>
          <CardHeader>
            <CardTitle>تسوية البنك</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>الحساب البنكي</Label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={selectedBankId ?? ''}
                onChange={(e) => setSelectedBankId(e.target.value ? Number(e.target.value) : null)}
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

            {selectedBank && (
              <>
                <div className="p-3 bg-muted rounded">
                  <p className="text-sm text-muted-foreground">الرصيد المتوقع (حسب النظام)</p>
                  <p className="text-2xl font-bold">{fmt(selectedBank.current_balance_egp)} ج.م</p>
                </div>
                <form
                  onSubmit={bankForm.handleSubmit((d) => bankMut.mutate(d))}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <Label>تاريخ التسوية *</Label>
                    <Input type="date" {...bankForm.register('date', { required: true })} />
                  </div>
                  <div className="space-y-1">
                    <Label>الرصيد الفعلي (حسب كشف الحساب) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      {...bankForm.register('actual_balance_egp', { required: true })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>ملاحظات</Label>
                    <Input {...bankForm.register('notes_ar')} />
                  </div>
                  {bankMut.error && <p className="text-red-600 text-sm">حدث خطأ</p>}
                  <Button type="submit" disabled={bankMut.isPending || !selectedBankId}>
                    {bankMut.isPending ? 'جاري التسوية...' : 'تأكيد التسوية'}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
