import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Landmark, Plus, TrendingUp, TrendingDown, Star, Pencil } from 'lucide-react';
import { financeApi } from '@/lib/finance-api';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import type { BankAccount, BankMovement } from '@/lib/finance-types';
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
import { PageShell } from '@/components/Layout/PageShell';
import { TableFilterBar } from '@/components/TableFilterBar';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
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

const EVENT_LABELS = ar.cash.bankEventTypes as Record<string, string>;

type BankFormValues = {
  name_ar: string;
  bank_name_ar: string;
  branch_ar: string;
  iban: string;
  account_number: string;
  notes_ar: string;
  is_default: boolean;
  is_active?: boolean;
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
      name_ar: '',
      bank_name_ar: '',
      branch_ar: '',
      iban: '',
      account_number: '',
      notes_ar: '',
      is_default: false,
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
        is_active: d.is_active,
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
      is_active: b.is_active,
    });
  }

  const totalPages = movementsQ.data ? Math.ceil(movementsQ.data.total / PAGE_SIZE) : 1;
  const movementRows: BankMovement[] = movementsQ.data?.rows ?? [];

  const columns: Column<BankMovement>[] = [
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
              ? 'bg-info-subtle text-info-foreground'
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
            m.direction === 'in' ? 'text-info-foreground' : 'text-danger-foreground',
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
  ];

  return (
    <PageShell
      title={ar.cash.banks}
      description={ar.hubs.banksDesc}
      backTo="/treasury"
      actions={
        isOwner ? (
          <Button variant="accent" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="size-4" aria-hidden />
            إضافة حساب بنكي
          </Button>
        ) : null
      }
    >

      {/* Bank account cards */}
      {banksQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm space-y-3"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : banksQ.isError ? (
        <ErrorBanner
          title="تعذر تحميل الحسابات البنكية"
          onRetry={() => banksQ.refetch()}
        />
      ) : banksQ.data?.length === 0 ? (
        <EmptyState
          title="لا توجد حسابات بنكية بعد"
          description="ابدأ بإضافة حساب بنكي لاستقبال مدفوعات الانستاباي"
          icon={Landmark}
          action={
            isOwner && (
              <Button variant="accent" onClick={() => setShowCreate(true)} className="gap-1.5">
                <Plus className="size-4" aria-hidden />
                إضافة حساب بنكي
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(banksQ.data ?? []).map((b: BankAccount) => {
            const active = selectedBank?.id === b.id;
            return (
              <button
                type="button"
                key={b.id}
                onClick={() => {
                  setSelectedBank(b);
                  setMovPage(1);
                }}
                className={cn(
                  'text-start rounded-lg border bg-surface-elevated p-5 shadow-sm transition-all duration-150 ease-decelerate cursor-pointer',
                  'hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  active ? 'border-accent ring-2 ring-accent/30' : 'border-border-subtle',
                  !b.is_active && 'opacity-60',
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground truncate">{b.name_ar}</p>
                    {b.bank_name_ar && (
                      <p className="text-xs text-foreground-muted truncate">{b.bank_name_ar}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {b.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-accent-subtle text-accent px-2 py-0.5 text-[11px] font-medium">
                        <Star className="size-3" aria-hidden />
                        افتراضي
                      </span>
                    )}
                    {!b.is_active && (
                      <span className="rounded-pill bg-surface-hover text-foreground-muted px-2 py-0.5 text-[11px]">
                        غير نشط
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-3xl font-semibold text-foreground tabular-num leading-none" dir="ltr">
                  {fmt(b.current_balance_egp)}
                </p>
                <p className="text-xs text-foreground-tertiary mt-1.5">ج.م</p>
                {b.account_number && (
                  <p className="text-xs text-foreground-muted mt-3 tabular-num" dir="ltr">
                    {b.account_number}
                  </p>
                )}
                {isOwner && (
                  <div className="flex justify-end mt-3 pt-3 border-t border-border-subtle">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(b);
                      }}
                      className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-accent transition-colors duration-150 cursor-pointer"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      تعديل
                    </button>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected bank movements */}
      {selectedBank && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              حركات: <span className="text-accent">{selectedBank.name_ar}</span>
            </h2>
            <p className="text-sm text-foreground-muted mt-0.5">
              {selectedBank.bank_name_ar ?? ''}
              {selectedBank.account_number && (
                <span className="tabular-num" dir="ltr">
                  {' '}
                  · {selectedBank.account_number}
                </span>
              )}
            </p>
          </div>

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
                      setMovPage(1);
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
                      setMovPage(1);
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
                      setMovPage(1);
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
            resetKey={`${selectedBank.id}-${from}-${to}`}
          />

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={movPage <= 1}
                onClick={() => setMovPage((p) => p - 1)}
              >
                السابق
              </Button>
              <span className="text-sm text-foreground-muted tabular-num" dir="ltr">
                {movPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={movPage >= totalPages}
                onClick={() => setMovPage((p) => p + 1)}
              >
                التالي
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Create Bank Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حساب بنكي جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit((d) => createMut.mutate(d))} className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                اسم الحساب <span className="text-danger">*</span>
              </Label>
              <Input {...createForm.register('name_ar', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>اسم البنك</Label>
              <Input {...createForm.register('bank_name_ar')} />
            </div>
            <div className="space-y-1.5">
              <Label>الفرع</Label>
              <Input {...createForm.register('branch_ar')} />
            </div>
            <div className="space-y-1.5">
              <Label>رقم الحساب</Label>
              <Input {...createForm.register('account_number')} />
            </div>
            <div className="space-y-1.5">
              <Label>IBAN</Label>
              <Input {...createForm.register('iban')} />
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Input {...createForm.register('notes_ar')} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="is_default_c" {...createForm.register('is_default')} />
              <span className="text-sm text-foreground">حساب افتراضي</span>
            </label>
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
              <div className="space-y-1.5">
                <Label>
                  اسم الحساب <span className="text-danger">*</span>
                </Label>
                <Input {...editForm.register('name_ar', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>اسم البنك</Label>
                <Input {...editForm.register('bank_name_ar')} />
              </div>
              <div className="space-y-1.5">
                <Label>الفرع</Label>
                <Input {...editForm.register('branch_ar')} />
              </div>
              <div className="space-y-1.5">
                <Label>رقم الحساب</Label>
                <Input {...editForm.register('account_number')} />
              </div>
              <div className="space-y-1.5">
                <Label>IBAN</Label>
                <Input {...editForm.register('iban')} />
              </div>
              <div className="space-y-1.5">
                <Label>ملاحظات</Label>
                <Input {...editForm.register('notes_ar')} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="is_default_e" {...editForm.register('is_default')} />
                  <span className="text-sm text-foreground">حساب افتراضي</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="is_active_e" {...editForm.register('is_active')} />
                  <span className="text-sm text-foreground">نشط</span>
                </label>
              </div>
              {updateMut.error && (
                <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">حدث خطأ</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    إلغاء
                  </Button>
                </DialogClose>
                <Button type="submit" variant="accent" disabled={updateMut.isPending}>
                  {updateMut.isPending ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
