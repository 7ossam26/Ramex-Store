import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extractApiError } from '@/lib/api-error';
import { useForm, useWatch } from 'react-hook-form';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { DamageDisposition, DamageReasonCode } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { StatusPill } from '@/components/StatusPill';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';

const REASONS: DamageReasonCode[] = [
  'damage_in_transit', 'damage_in_shop', 'damage_quality_defect',
  'loss_theft', 'loss_misplaced', 'inventory_discrepancy',
  'cutting_sample_loss', 'other',
];

const LOSS_REASONS: DamageReasonCode[] = ['loss_theft', 'loss_misplaced'];

type FormVals = {
  roll_id: number;
  reason_code: DamageReasonCode;
  disposition?: DamageDisposition;
  notes_ar?: string;
};

export function DamagePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [createError, setCreateError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['damage-events'], queryFn: () => inventoryApi.listDamageEvents() });

  const create = useMutation({
    mutationFn: (v: FormVals) =>
      inventoryApi.createDamageEvent({
        roll_id: Number(v.roll_id),
        reason_code: v.reason_code,
        disposition: v.disposition,
        notes_ar: v.notes_ar || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['damage-events'] });
      setCreateError(null);
      form.reset();
    },
    onError: (e) => setCreateError(extractApiError(e)),
  });

  const approve = useMutation({
    mutationFn: ({ id, ok }: { id: number; ok: boolean }) => inventoryApi.approveDamageEvent(id, ok),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['damage-events'] }),
  });

  const form = useForm<FormVals>({ defaultValues: { reason_code: 'damage_in_shop' } });
  const reason = useWatch({ control: form.control, name: 'reason_code' });
  const isLoss = LOSS_REASONS.includes(reason);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader title={ar.damage.title} description={ar.hubs.inventoryDamageDesc} backTo="/inventory" />

      <Card>
        <CardHeader><CardTitle>{ar.damage.record}</CardTitle></CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((v) => create.mutate(v))}
            className="grid grid-cols-2 md:grid-cols-3 gap-3"
          >
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.damage.rollId}</Label>
              <Input type="number" inputMode="decimal" {...form.register('roll_id', { valueAsNumber: true, required: true })} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.damage.reasonCode}</Label>
              <select {...form.register('reason_code')} className="w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75">
                {REASONS.map((r) => (
                  <option key={r} value={r}>{ar.damage.reasons[r]}</option>
                ))}
              </select>
            </div>
            {!isLoss && (
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.damage.disposition}</Label>
                <select {...form.register('disposition', { required: !isLoss })} className="w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75">
                  <option value="">—</option>
                  <option value="damaged_stock">{ar.damage.dispositions.damaged_stock}</option>
                  <option value="return_to_factory">{ar.damage.dispositions.return_to_factory}</option>
                </select>
              </div>
            )}
            <div className="space-y-1 col-span-2">
              <Label className="text-sm font-medium text-foreground">{ar.damage.notes}</Label>
              <Input {...form.register('notes_ar')} />
            </div>
            <div className="col-span-full flex items-center gap-3 flex-wrap">
              <Button type="submit" disabled={create.isPending}>{ar.damage.record}</Button>
              {createError && (
                <span className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
                  {createError}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <TableSkeleton rows={5} columns={6} />
      ) : list.isError ? (
        <ErrorBanner onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={ar.codes.noResults}
          description={ar.damage.title}
        />
      ) : (
        <Card>
          <CardHeader><CardTitle>{ar.damage.title}</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide">
                <tr className="border-b border-border-subtle">
                  <th className="py-2.5 font-medium">{ar.stockMovements.when}</th>
                  <th className="font-medium">{ar.damage.rollId}</th>
                  <th className="font-medium">{ar.damage.reasonCode}</th>
                  <th className="font-medium">{ar.damage.disposition}</th>
                  <th className="font-medium">{ar.damage.valuation}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150">
                    <td className="py-2.5 text-foreground-muted">{new Date(e.created_at).toLocaleString('ar-EG-u-nu-latn')}</td>
                    <td className="font-mono text-foreground">#{e.roll_id}</td>
                    <td>{ar.damage.reasons[e.reason_code]}</td>
                    <td>{ar.damage.dispositions[e.disposition]}</td>
                    <td className="tabular-num" dir="ltr">{e.valuation_egp}</td>
                    <td>
                      {e.requires_approval && !e.approved_at && user?.role === 'owner' ? (
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => approve.mutate({ id: e.id, ok: true })}>
                            {ar.damage.approve}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => approve.mutate({ id: e.id, ok: false })}>
                            {ar.damage.reject}
                          </Button>
                        </div>
                      ) : e.requires_approval && !e.approved_at ? (
                        <StatusPill tone="warning">{ar.damage.requiresApproval}</StatusPill>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
