import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ar } from '@/i18n/ar';
import { customersApi } from '@/lib/customers-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { LedgerEntry } from '@/lib/customers-types';

type Tab = 'ledger' | 'invoices' | 'notes';

const LEDGER_PAGE_SIZE = 30;

function balanceColor(balance: string) {
  const n = Number(balance);
  if (n < 0) return 'text-red-600';
  if (n > 0) return 'text-green-600';
  return 'text-muted-foreground';
}

type EditFormVals = {
  name_ar: string;
  phone: string;
  phone_secondary: string;
  address_ar: string;
  tax_no: string;
  notes_ar: string;
};

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const [tab, setTab] = useState<Tab>('ledger');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['customer', customerId, ledgerPage],
    queryFn: () => customersApi.get(customerId, { page: ledgerPage, limit: LEDGER_PAGE_SIZE }),
    enabled: !isNaN(customerId),
  });

  const form = useForm<EditFormVals>();

  const update = useMutation({
    mutationFn: (v: EditFormVals) =>
      customersApi.update(customerId, {
        name_ar: v.name_ar,
        phone: v.phone || undefined,
        phone_secondary: v.phone_secondary || null,
        address_ar: v.address_ar || null,
        tax_no: v.tax_no || null,
        notes_ar: v.notes_ar || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setEditOpen(false);
    },
  });

  const openEdit = () => {
    if (!data) return;
    form.reset({
      name_ar: data.name_ar,
      phone: data.phone,
      phone_secondary: data.phone_secondary ?? '',
      address_ar: data.address_ar ?? '',
      tax_no: data.tax_no ?? '',
      notes_ar: data.notes_ar ?? '',
    });
    setEditOpen(true);
  };

  if (isLoading) return <p className="p-6 text-center text-muted-foreground">{ar.loading}</p>;
  if (error || !data) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-red-600">{ar.customers.notFound}</p>
        <Link to="/customers" className="text-primary hover:underline text-sm">{ar.customers.allCustomers}</Link>
      </div>
    );
  }

  const ledger = data.ledger;
  const totalLedgerPages = Math.max(1, Math.ceil(ledger.total / LEDGER_PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Back link */}
      <Link to="/customers" className="text-sm text-muted-foreground hover:text-foreground">
        ← {ar.customers.allCustomers}
      </Link>

      {/* Customer card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">{data.name_ar}</CardTitle>
            <p className="text-sm text-muted-foreground font-mono mt-1">{data.customer_code}</p>
          </div>
          <Button variant="outline" size="sm" onClick={openEdit}>{ar.customers.edit}</Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{ar.customers.phone}</p>
              <p className="font-mono mt-0.5" dir="ltr">{data.phone}</p>
            </div>
            {data.phone_secondary && (
              <div>
                <p className="text-xs text-muted-foreground">{ar.customers.phoneSecondary}</p>
                <p className="font-mono mt-0.5" dir="ltr">{data.phone_secondary}</p>
              </div>
            )}
            {data.address_ar && (
              <div>
                <p className="text-xs text-muted-foreground">{ar.customers.address}</p>
                <p className="mt-0.5">{data.address_ar}</p>
              </div>
            )}
            {data.tax_no && (
              <div>
                <p className="text-xs text-muted-foreground">{ar.customers.taxNo}</p>
                <p className="font-mono mt-0.5">{data.tax_no}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">{ar.customers.lifetimeVolume}</p>
              <p className="font-medium mt-0.5">
                {Number(data.lifetime_volume_egp).toLocaleString('ar-EG-u-nu-latn', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} ج.م
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar.customers.currentBalance}</p>
              <p className={`font-bold mt-0.5 ${balanceColor(data.current_balance_egp)}`}>
                {Number(data.current_balance_egp).toLocaleString('ar-EG-u-nu-latn', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} ج.م
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto whitespace-nowrap -mx-3 md:mx-0 px-3 md:px-0">
        {(['ledger', 'invoices', 'notes'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors min-h-11 ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'ledger' ? ar.customers.ledger
              : t === 'invoices' ? ar.customers.openInvoices
              : ar.customers.notes}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'ledger' && (
        <Card>
          <CardContent className="p-0">
            {ledger.rows.length === 0 ? (
              <p className="p-4 text-center text-muted-foreground">{ar.customers.noLedgerEntries}</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="text-right text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3">التاريخ</th>
                      <th className="px-4 py-3">النوع</th>
                      <th className="px-4 py-3">المبلغ</th>
                      <th className="px-4 py-3">الرصيد بعد</th>
                      <th className="px-4 py-3">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.rows.map((e: LedgerEntry) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(e.created_at).toLocaleString('ar-EG-u-nu-latn')}
                        </td>
                        <td className="px-4 py-3">
                          {ar.customers.ledgerEntryTypes[e.entry_type]}
                        </td>
                        <td className={`px-4 py-3 font-mono ${Number(e.amount_egp) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {Number(e.amount_egp).toLocaleString('ar-EG-u-nu-latn', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            signDisplay: 'always',
                          })}
                        </td>
                        <td className={`px-4 py-3 font-mono ${balanceColor(e.balance_after_egp)}`}>
                          {Number(e.balance_after_egp).toLocaleString('ar-EG-u-nu-latn', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{e.notes_ar ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalLedgerPages > 1 && (
                  <div className="flex items-center justify-center gap-2 p-3 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={ledgerPage <= 1}
                      onClick={() => setLedgerPage((p) => p - 1)}
                    >
                      السابق
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      صفحة {ledgerPage} من {totalLedgerPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={ledgerPage >= totalLedgerPages}
                      onClick={() => setLedgerPage((p) => p + 1)}
                    >
                      التالي
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'invoices' && (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-muted-foreground">{ar.customers.noOpenInvoices}</p>
          </CardContent>
        </Card>
      )}

      {tab === 'notes' && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap min-h-[100px]">
              {data.notes_ar || '—'}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={openEdit}>
              تعديل الملاحظات
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{ar.customers.edit}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => update.mutate(v))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{ar.customers.nameAr}</Label>
                <Input {...form.register('name_ar', { required: true })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>{ar.customers.phone}</Label>
                <Input {...form.register('phone')} placeholder="01012345678" dir="ltr" inputMode="tel" autoComplete="tel" />
              </div>
              <div className="space-y-1">
                <Label>{ar.customers.phoneSecondary}</Label>
                <Input {...form.register('phone_secondary')} placeholder="01012345678" dir="ltr" inputMode="tel" autoComplete="tel" />
              </div>
              <div className="space-y-1">
                <Label>{ar.customers.taxNo}</Label>
                <Input {...form.register('tax_no')} dir="ltr" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>{ar.customers.address}</Label>
                <Input {...form.register('address_ar')} dir="rtl" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>{ar.customers.notes}</Label>
                <Input {...form.register('notes_ar')} dir="rtl" />
              </div>
            </div>
            {update.error && (
              <p className="text-sm text-red-600">
                {(update.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ar.common.error}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline">{ar.common.cancel}</Button>
              </DialogClose>
              <Button type="submit" disabled={update.isPending}>{ar.common.save}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
