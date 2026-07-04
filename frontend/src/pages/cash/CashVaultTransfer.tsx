import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeftRight } from 'lucide-react';
import { financeApi } from '@/lib/finance-api';
import { usePermissions } from '@/lib/permissions';
import { ar } from '@/i18n/ar';
import { extractApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { Skeleton } from '@/components/Skeleton';

const fmt = (n: string | number) =>
  Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type FormValues = {
  amount: string;
  notes_ar: string;
};

export function CashVaultTransferPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [error, setError] = useState<string | null>(null);

  const canCreate = can('cash_vault_transfer', 'write');
  const canSeeStoreBalance = can('cash_drawer', 'read');

  const storeBalanceQ = useQuery({
    queryKey: ['cash-balance'],
    queryFn: financeApi.getCashBalance,
    enabled: canSeeStoreBalance,
  });

  const generalBalanceQ = useQuery({
    queryKey: ['general-vault-balance'],
    queryFn: financeApi.getGeneralVaultBalance,
  });

  const form = useForm<FormValues>({
    defaultValues: { amount: '', notes_ar: '' },
  });

  const createMut = useMutation({
    mutationFn: (d: FormValues) =>
      financeApi.createVaultTransfer({
        amount: Number(d.amount),
        notes_ar: d.notes_ar || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-vault-transfers'] });
      navigate('/cash-transfers');
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const storeBalance = storeBalanceQ.data?.current_balance_egp ?? 0;
  const amountValue = Number(form.watch('amount')) || 0;
  const exceedsBalance = canSeeStoreBalance && amountValue > storeBalance;

  return (
    <PageShell
      title={ar.vaultTransfers.title}
      description={ar.vaultTransfers.description}
      backTo="/treasury"
    >
      <div className={cn('grid grid-cols-1 gap-4', canSeeStoreBalance && 'sm:grid-cols-2')}>
        {canSeeStoreBalance && (
          <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1">
              {ar.vaultTransfers.storeVault}
            </p>
            {storeBalanceQ.isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <p className="text-3xl font-semibold text-foreground tabular-num leading-none" dir="ltr">
                {fmt(storeBalance)}
              </p>
            )}
            <p className="text-xs text-foreground-tertiary mt-1.5">ج.م</p>
          </div>
        )}
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1">
            {ar.vaultTransfers.generalVault}
          </p>
          {generalBalanceQ.isLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : (
            <p className="text-3xl font-semibold text-foreground tabular-num leading-none" dir="ltr">
              {fmt(generalBalanceQ.data?.current_balance_egp ?? 0)}
            </p>
          )}
          <p className="text-xs text-foreground-tertiary mt-1.5">ج.م</p>
        </div>
      </div>

      <SectionCard title={ar.vaultTransfers.createTitle}>
        <div className="flex items-center gap-2 text-sm text-foreground-muted mb-4">
          <span className="font-medium text-foreground">{ar.vaultTransfers.storeVault}</span>
          <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
          <span className="font-medium text-foreground">{ar.vaultTransfers.generalVault}</span>
        </div>

        {!canCreate ? (
          <p className="text-sm text-foreground-muted">{ar.common.apiErrors.forbidden}</p>
        ) : (
          <form onSubmit={form.handleSubmit((d) => createMut.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  {ar.vaultTransfers.amount} <span className="text-danger">*</span>
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="1"
                  className="w-full"
                  {...form.register('amount', { required: true })}
                />
                {exceedsBalance && (
                  <p className="text-danger-foreground text-xs">
                    {ar.common.apiErrors.INSUFFICIENT_CASH_BALANCE}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{ar.vaultTransfers.notes}</Label>
                <Input className="w-full" {...form.register('notes_ar')} />
              </div>
            </div>
            {error && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">{error}</p>
            )}
            <Button
              type="submit"
              variant="accent"
              className="w-full sm:w-auto"
              disabled={createMut.isPending || exceedsBalance || !amountValue}
            >
              {createMut.isPending ? 'جاري الإرسال...' : ar.vaultTransfers.create}
            </Button>
          </form>
        )}
      </SectionCard>
    </PageShell>
  );
}
