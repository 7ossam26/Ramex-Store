import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { customersApi } from '@/lib/customers-api';
import { extractApiError } from '@/lib/api-error';
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
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import type { LedgerEntry } from '@/lib/customers-types';

type Tab = 'ledger' | 'invoices' | 'notes';

const LEDGER_PAGE_SIZE = 30;
const TABS: { key: Tab; label: string }[] = [
  { key: 'ledger', label: ar.customers.ledger },
  { key: 'invoices', label: ar.customers.openInvoices },
  { key: 'notes', label: ar.customers.notes },
];

function balanceColor(balance: string) {
  const n = Number(balance);
  if (n < 0) return 'text-danger';
  if (n > 0) return 'text-success-foreground';
  return 'text-foreground-muted';
}

function fmtMoney(v: string | number) {
  return Number(v).toLocaleString('ar-EG-u-nu-latn', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const [updateError, setUpdateError] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
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
      setUpdateError(null);
    },
    onError: (e) => setUpdateError(extractApiError(e)),
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

  if (isLoading) return <p className="p-6 text-center text-foreground-muted">{ar.loading}</p>;
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <ErrorBanner
          title={ar.customers.notFound}
          onRetry={() => refetch()}
        />
        <Link to="/customers" className="text-accent hover:text-accent-hover underline underline-offset-2 text-sm inline-block">
          {ar.customers.allCustomers}
        </Link>
      </div>
    );
  }

  const ledger = data.ledger;
  const totalLedgerPages = Math.max(1, Math.ceil(ledger.total / LEDGER_PAGE_SIZE));

  const summaryCard = (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground truncate">{data.name_ar}</h2>
          <p className="text-sm text-foreground-tertiary font-mono mt-0.5">{data.customer_code}</p>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}>{ar.customers.edit}</Button>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm">
        <div>
          <dt className="text-xs text-foreground-muted">{ar.customers.phone}</dt>
          <dd className="font-mono tabular-num mt-0.5 text-foreground" dir="ltr">{data.phone}</dd>
        </div>
        {data.phone_secondary && (
          <div>
            <dt className="text-xs text-foreground-muted">{ar.customers.phoneSecondary}</dt>
            <dd className="font-mono tabular-num mt-0.5 text-foreground" dir="ltr">{data.phone_secondary}</dd>
          </div>
        )}
        {data.address_ar && (
          <div>
            <dt className="text-xs text-foreground-muted">{ar.customers.address}</dt>
            <dd className="mt-0.5 text-foreground">{data.address_ar}</dd>
          </div>
        )}
        {data.tax_no && (
          <div>
            <dt className="text-xs text-foreground-muted">{ar.customers.taxNo}</dt>
            <dd className="font-mono mt-0.5 text-foreground">{data.tax_no}</dd>
          </div>
        )}
      </dl>

      <div className="pt-3 border-t border-border-subtle space-y-3">
        <div>
          <p className="text-xs text-foreground-muted">{ar.customers.lifetimeVolume}</p>
          <p className="text-xl font-semibold text-foreground tabular-num mt-0.5" dir="ltr">
            {fmtMoney(data.lifetime_volume_egp)} <span className="text-sm text-foreground-tertiary font-normal">ج.م</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">{ar.customers.currentBalance}</p>
          <p className={`text-2xl font-semibold tabular-num mt-0.5 ${balanceColor(data.current_balance_egp)}`} dir="ltr">
            {fmtMoney(data.current_balance_egp)} <span className="text-sm text-foreground-tertiary font-normal">ج.م</span>
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Back link */}
      <Link
        to="/customers"
        className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground transition-colors duration-150"
      >
        <ChevronRight className="size-4" aria-hidden />
        {ar.customers.allCustomers}
      </Link>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Main column — tabs + content */}
        <div className="space-y-4 min-w-0">
          {/* Tabs with sliding indicator */}
          <div className="relative flex gap-1 border-b border-border-subtle overflow-x-auto whitespace-nowrap -mx-3 md:mx-0 px-3 md:px-0">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`relative px-4 py-3 text-sm font-medium min-h-11 transition-colors duration-150 ${
                    active ? 'text-accent' : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  {t.label}
                  {active && (
                    <motion.div
                      layoutId="customer-tab-indicator"
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-accent"
                      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {tab === 'ledger' && (
            <div className="rounded-lg border border-border-subtle bg-surface-elevated overflow-hidden shadow-sm">
              {ledger.rows.length === 0 ? (
                <EmptyState title={ar.customers.noLedgerEntries} bordered={false} />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-sticky bg-surface-elevated">
                        <tr className="text-start text-xs text-foreground-muted uppercase tracking-wide border-b border-border-subtle">
                          <th className="px-4 py-3 font-medium">التاريخ</th>
                          <th className="px-4 py-3 font-medium">النوع</th>
                          <th className="px-4 py-3 font-medium">المبلغ</th>
                          <th className="px-4 py-3 font-medium">الرصيد بعد</th>
                          <th className="px-4 py-3 font-medium">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.rows.map((e: LedgerEntry) => (
                          <tr key={e.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150">
                            <td className="px-4 py-3 text-xs text-foreground-muted">
                              {new Date(e.created_at).toLocaleString('ar-EG-u-nu-latn')}
                            </td>
                            <td className="px-4 py-3 text-foreground">
                              {ar.customers.ledgerEntryTypes[e.entry_type]}
                            </td>
                            <td className={`px-4 py-3 font-mono tabular-num ${Number(e.amount_egp) < 0 ? 'text-danger' : 'text-success-foreground'}`} dir="ltr">
                              {Number(e.amount_egp).toLocaleString('ar-EG-u-nu-latn', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                                signDisplay: 'always',
                              })}
                            </td>
                            <td className={`px-4 py-3 font-mono tabular-num ${balanceColor(e.balance_after_egp)}`} dir="ltr">
                              {fmtMoney(e.balance_after_egp)}
                            </td>
                            <td className="px-4 py-3 text-foreground-muted">{e.notes_ar ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalLedgerPages > 1 && (
                    <div className="flex items-center justify-center gap-2 p-3 border-t border-border-subtle">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={ledgerPage <= 1}
                        onClick={() => setLedgerPage((p) => p - 1)}
                      >
                        السابق
                      </Button>
                      <span className="text-sm text-foreground-muted">
                        صفحة <span className="tabular-num text-foreground" dir="ltr">{ledgerPage}</span> من <span className="tabular-num text-foreground" dir="ltr">{totalLedgerPages}</span>
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
            </div>
          )}

          {tab === 'invoices' && (
            <div className="rounded-lg border border-border-subtle bg-surface-elevated shadow-sm">
              <EmptyState title={ar.customers.noOpenInvoices} bordered={false} />
            </div>
          )}

          {tab === 'notes' && (
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm">
              <p className="text-sm text-foreground whitespace-pre-wrap min-h-[100px]">
                {data.notes_ar || <span className="text-foreground-muted">—</span>}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openEdit}>
                تعديل الملاحظات
              </Button>
            </div>
          )}
        </div>

        {/* Summary column — sticky on desktop */}
        <aside className="lg:sticky lg:top-20 lg:self-start">{summaryCard}</aside>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{ar.customers.edit}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => update.mutate(v))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">
                  {ar.customers.nameAr}
                  <span className="text-danger ms-1" aria-hidden>*</span>
                </Label>
                <Input {...form.register('name_ar', { required: true })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.customers.phone}</Label>
                <Input {...form.register('phone')} placeholder="01012345678" dir="ltr" inputMode="tel" autoComplete="tel" />
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
            {updateError && (
              <p className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
                {updateError}
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
