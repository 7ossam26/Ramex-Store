import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extractApiError } from '@/lib/api-error';
import { useForm } from 'react-hook-form';
import { Inbox } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { accessoriesApi } from '@/lib/accessories-api';
import type { RollStatus, Warehouse } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/Layout/PageShell';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { cn } from '@/lib/utils';

type FormVals = {
  roll_id: number;
  new_warehouse?: Warehouse | '';
  new_status?: RollStatus | '';
  new_weight_kg?: number;
  notes_ar: string;
};

const selectClass =
  'w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75';

export function AdjustmentsPage() {
  const qc = useQueryClient();
  const [entityType, setEntityType] = useState<'roll' | 'accessory'>('roll');
  const [createError, setCreateError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['adjustments'], queryFn: inventoryApi.listAdjustments });

  const form = useForm<FormVals>();

  // Accessory adjustment — controlled state (parity flow for accessory stock).
  const accListQ = useQuery({
    queryKey: ['accessories-all'],
    queryFn: () => accessoriesApi.list(),
    enabled: entityType === 'accessory',
  });
  const [accId, setAccId] = useState<number | ''>('');
  const [accQty, setAccQty] = useState<string>('');
  const [accNotes, setAccNotes] = useState<string>('');
  const selectedAcc = (accListQ.data ?? []).find((a) => a.id === accId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['adjustments'] });
    qc.invalidateQueries({ queryKey: ['accessories-all'] });
    qc.invalidateQueries({ queryKey: ['rolls-page-accessories'] });
  };

  const create = useMutation({
    mutationFn: (v: FormVals) =>
      inventoryApi.createAdjustment({
        entity_type: 'roll',
        roll_id: Number(v.roll_id),
        new_warehouse: (v.new_warehouse || undefined) as Warehouse | undefined,
        new_status: (v.new_status || undefined) as RollStatus | undefined,
        new_weight_kg: v.new_weight_kg ? Number(v.new_weight_kg) : undefined,
        notes_ar: v.notes_ar,
      }),
    onSuccess: () => { invalidate(); setCreateError(null); form.reset(); },
    onError: (e) => setCreateError(extractApiError(e)),
  });

  const createAcc = useMutation({
    mutationFn: () =>
      inventoryApi.createAdjustment({
        entity_type: 'accessory',
        accessory_id: Number(accId),
        new_qty: Number(accQty),
        notes_ar: accNotes,
      }),
    onSuccess: () => {
      invalidate();
      setCreateError(null);
      setAccId(''); setAccQty(''); setAccNotes('');
    },
    onError: (e) => setCreateError(extractApiError(e)),
  });

  const accInvalid =
    accId === '' || accQty === '' || !Number.isFinite(Number(accQty)) || Number(accQty) < 0 || accNotes.trim() === '';

  const switchEntity = (t: 'roll' | 'accessory') => {
    setEntityType(t);
    setCreateError(null);
  };

  return (
    <PageShell title={ar.adjustments.title} description={ar.hubs.inventoryAdjustmentsDesc} backTo="/inventory">
      <Card>
        <CardHeader><CardTitle>{ar.adjustments.create}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Entity toggle — rolls vs accessories (same adjustments workflow) */}
          <div className="flex gap-1 p-1 bg-surface-hover rounded-lg w-fit">
            {(['roll', 'accessory'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchEntity(t)}
                className={cn(
                  'px-4 py-1.5 text-sm rounded-md transition-colors',
                  entityType === t
                    ? 'bg-canvas shadow-sm font-semibold text-foreground'
                    : 'text-foreground-muted hover:text-foreground',
                )}
              >
                {t === 'roll' ? ar.adjustments.entityRoll : ar.adjustments.entityAccessory}
              </button>
            ))}
          </div>

          {entityType === 'roll' ? (
            <form
              onSubmit={form.handleSubmit((v) => create.mutate(v))}
              className="grid grid-cols-2 md:grid-cols-3 gap-3"
            >
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.rollId}</Label>
                <Input type="number" inputMode="decimal" {...form.register('roll_id', { valueAsNumber: true, required: true })} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.newWarehouse}</Label>
                <select {...form.register('new_warehouse')} className={selectClass}>
                  <option value="">—</option>
                  <option value="shop">{ar.warehouses.shop}</option>
                  <option value="factory">{ar.warehouses.factory}</option>
                  <option value="damaged_shop">{ar.warehouses.damaged_shop}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.newStatus}</Label>
                <select {...form.register('new_status')} className={selectClass}>
                  <option value="">—</option>
                  {(['in_stock', 'reserved', 'damaged', 'sample', 'returned', 'written_off'] as RollStatus[]).map((s) => (
                    <option key={s} value={s}>{ar.rollStatuses[s]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.newWeight}</Label>
                <Input type="number" inputMode="decimal" step="0.001" {...form.register('new_weight_kg', { valueAsNumber: true })} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.notes}</Label>
                <Input {...form.register('notes_ar', { required: true, minLength: 1 })} />
              </div>
              <div className="col-span-full flex items-center gap-3 flex-wrap">
                <Button type="submit" disabled={create.isPending}>{ar.adjustments.create}</Button>
                {createError && (
                  <span className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
                    {createError}
                  </span>
                )}
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!accInvalid) createAcc.mutate(); }}
              className="grid grid-cols-2 md:grid-cols-3 gap-3"
            >
              <div className="space-y-1 col-span-2 md:col-span-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.selectAccessory}</Label>
                <select
                  className={selectClass}
                  value={accId === '' ? '' : String(accId)}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : '';
                    setAccId(id);
                    const acc = (accListQ.data ?? []).find((a) => a.id === id);
                    setAccQty(acc ? String(acc.qty_in_stock) : '');
                  }}
                >
                  <option value="">—</option>
                  {(accListQ.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name_ar} ({a.internal_barcode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.currentQty}</Label>
                <Input value={selectedAcc ? String(selectedAcc.qty_in_stock) : ''} readOnly dir="ltr" className="bg-surface-hover" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.newQty}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={accQty}
                  onChange={(e) => setAccQty(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.notes}</Label>
                <Input value={accNotes} onChange={(e) => setAccNotes(e.target.value)} />
              </div>
              <div className="col-span-full flex items-center gap-3 flex-wrap">
                <Button type="submit" disabled={createAcc.isPending || accInvalid}>{ar.adjustments.create}</Button>
                {createError && (
                  <span className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
                    {createError}
                  </span>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {list.isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : list.isError ? (
        <ErrorBanner onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={ar.codes.noResults}
          description={ar.adjustments.title}
        />
      ) : (
        <Card>
          <CardHeader><CardTitle>{ar.adjustments.title}</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide">
                <tr className="border-b border-border-subtle">
                  <th className="py-2.5 font-medium">{ar.stockMovements.when}</th>
                  <th className="font-medium">{ar.adjustments.itemColumn}</th>
                  <th className="font-medium">{ar.stockMovements.from}</th>
                  <th className="font-medium">{ar.stockMovements.to}</th>
                  <th className="font-medium">{ar.adjustments.notes}</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((m) => (
                  <tr key={m.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150">
                    <td className="py-2.5 text-foreground-muted">{new Date(m.created_at).toLocaleString('ar-EG-u-nu-latn')}</td>
                    <td className="font-mono text-foreground">
                      {m.entity_type === 'accessory' ? `${ar.adjustments.accessoryItem} #${m.accessory_id}` : `#${m.roll_id}`}
                    </td>
                    <td>{m.from_warehouse ? ar.warehouses[m.from_warehouse] : '—'}</td>
                    <td>{m.to_warehouse ? ar.warehouses[m.to_warehouse] : '—'}</td>
                    <td className="text-xs text-foreground-muted">{m.notes_ar ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
