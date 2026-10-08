import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { Plus, Check, X } from 'lucide-react';
import { financeApi } from '@/lib/finance-api';
import { useAuth } from '@/lib/auth';
import { isOwnerOrAbove } from '@/lib/roles';
import { usePermissions } from '@/lib/permissions';
import { ar } from '@/i18n/ar';
import { extractApiError } from '@/lib/api-error';
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
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { FilterChip } from '@/components/FilterChip';
import { TableFilterBar } from '@/components/TableFilterBar';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { StatusPill, type StatusTone } from '@/components/StatusPill';
import { SearchableSelect } from '@/components/ui/searchable-select';

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

/** الخزنة picker value: 'cash_drawer' | 'general_vault' | 'bank:<id>'. */
type ExpenseFormValues = {
  category: string;
  amount_egp: string;
  source: string;
  bank_method: 'bank' | 'instapay';
  notes_ar: string;
};

const BANK_PREFIX = 'bank:';

function sourceLabel(e: Expense): string {
  if (e.paid_from === 'cash') {
    return e.cash_source === 'general_vault' ? 'الخزنة العامة' : 'الخزنة النقدية';
  }
  const method = e.paid_from === 'instapay' ? 'انستاباي' : 'بنك';
  return e.bank_account_name_ar ? `${method} — ${e.bank_account_name_ar}` : method;
}

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
  const isOwner = isOwnerOrAbove(user?.role);
  const { can } = usePermissions();
  const canUseVault = can('cash_vault_transfer', 'write');
  const canReadVault = can('cash_vault_transfer', 'read');

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [showCreate, setShowCreate] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const expensesQ = useQuery({
    queryKey: ['expenses', page, statusFilter, debouncedSearch],
    queryFn: () => financeApi.listExpenses({
      status: statusFilter,
      search: debouncedSearch || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });

  const banksQ = useQuery({
    queryKey: ['banks'],
    queryFn: financeApi.listBanks,
    enabled: showCreate,
  });

  const cashBalanceQ = useQuery({
    queryKey: ['cash-balance'],
    queryFn: financeApi.getCashBalance,
    enabled: showCreate,
  });

  const vaultBalanceQ = useQuery({
    queryKey: ['general-vault-balance'],
    queryFn: financeApi.getGeneralVaultBalance,
    enabled: showCreate && canUseVault && canReadVault,
  });

  const form = useForm<ExpenseFormValues>({
    defaultValues: {
      category: 'other',
      amount_egp: '',
      source: 'cash_drawer',
      bank_method: 'bank',
      notes_ar: '',
    },
  });

  const source = form.watch('source');
  const bankMethod = form.watch('bank_method');
  const isBankSource = source.startsWith(BANK_PREFIX);

  const createMut = useMutation({
    mutationFn: (d: ExpenseFormValues) => {
      const isBank = d.source.startsWith(BANK_PREFIX);
      return financeApi.createExpense({
        category: d.category,
        amount_egp: Number(d.amount_egp),
        paid_from: isBank ? d.bank_method : 'cash',
        cash_source: isBank ? null : (d.source as 'cash_drawer' | 'general_vault'),
        bank_account_id: isBank ? Number(d.source.slice(BANK_PREFIX.length)) : null,
        notes_ar: d.notes_ar || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
      qc.invalidateQueries({ queryKey: ['banks'] });
      qc.invalidateQueries({ queryKey: ['general-vault-balance'] });
      qc.invalidateQueries({ queryKey: ['treasuries-overview'] });
      setShowCreate(false);
      form.reset();
      setCreateError(null);
    },
    onError: (e) => setCreateError(extractApiError(e)),
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => financeApi.approveExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
      qc.invalidateQueries({ queryKey: ['banks'] });
      qc.invalidateQueries({ queryKey: ['general-vault-balance'] });
      qc.invalidateQueries({ queryKey: ['treasuries-overview'] });
    },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      financeApi.rejectExpense(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setRejectTarget(null);
      setRejectReason('');
      setRejectError(null);
    },
    onError: (e) => setRejectError(extractApiError(e)),
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
      header: 'الخزنة',
      cell: (e) => sourceLabel(e),
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
    { value: 'approved', label: 'معتمدة' },
  ];

  return (
    <PageShell
      title={ar.cash.expenses}
      description={ar.hubs.expensesDesc}
      backTo="/treasury"
      actions={
        <Button variant="accent" onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          تسجيل مصروف
        </Button>
      }
    >

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

      <TableFilterBar
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: ar.cash.expensesSearchPlaceholder,
          maxLength: 64,
        }}
        resultCount={expensesQ.data?.total}
      />

      <SectionCard noPadding>
      <ResponsiveTable
        columns={columns}
        rows={expenseRows}
        rowKey={(e) => String(e.id)}
        empty="لا توجد مصروفات"
        isLoading={expensesQ.isLoading}
        isError={expensesQ.isError}
        onRetry={() => expensesQ.refetch()}
        resetKey={`${statusFilter}|${debouncedSearch}`}
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
                className="text-success-foreground border-success/40 hover:bg-success-subtle"
                aria-label="موافقة"
              >
                <Check className="size-4" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectTarget(e.id)}
                className="text-danger-foreground border-danger/40 hover:bg-danger-subtle"
                aria-label="رفض"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          );
        }}
      />
      </SectionCard>

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
              <Controller
                control={form.control}
                name="category"
                rules={{ required: true }}
                render={({ field }) => (
                  <SearchableSelect
                    ref={field.ref}
                    name={field.name}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="w-full rounded-md border border-border-default bg-surface-elevated h-10 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </SearchableSelect>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                المبلغ (ج.م) <span className="text-danger">*</span>
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="1"
                min="1"
                {...form.register('amount_egp', { required: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                الخزنة <span className="text-danger">*</span>
              </Label>
              <Controller
                control={form.control}
                name="source"
                rules={{ required: true }}
                render={({ field }) => (
                  <SearchableSelect
                    ref={field.ref}
                    name={field.name}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="w-full rounded-md border border-border-default bg-surface-elevated h-10 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <option value="cash_drawer">
                      {`الخزنة النقدية${cashBalanceQ.data ? ` — ${fmt(cashBalanceQ.data.current_balance_egp)} ج.م` : ''}`}
                    </option>
                    {canUseVault && (
                      <option value="general_vault">
                        {`الخزنة العامة${vaultBalanceQ.data ? ` — ${fmt(vaultBalanceQ.data.current_balance_egp)} ج.م` : ''}`}
                      </option>
                    )}
                    {(banksQ.data ?? [])
                      .filter((b) => b.is_active)
                      .map((b) => (
                        <option key={b.id} value={`${BANK_PREFIX}${b.id}`}>
                          {`${b.name_ar} — ${fmt(b.current_balance_egp)} ج.م`}
                        </option>
                      ))}
                  </SearchableSelect>
                )}
              />
            </div>
            {isBankSource && (
              <div className="space-y-1.5">
                <Label>طريقة الدفع</Label>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      { value: 'bank', label: 'بنك' },
                      { value: 'instapay', label: 'انستاباي' },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors ${
                        bankMethod === opt.value
                          ? 'border-accent bg-accent/10 text-foreground font-medium'
                          : 'border-border-default text-foreground-muted hover:border-accent/60'
                      }`}
                    >
                      <input
                        type="radio"
                        value={opt.value}
                        className="sr-only"
                        {...form.register('bank_method')}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Input {...form.register('notes_ar')} />
            </div>
            {createError && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">{createError}</p>
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
            {rejectError && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">{rejectError}</p>
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
    </PageShell>
  );
}
