import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { RollStatus, Warehouse } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';

type FormVals = {
  roll_id: number;
  new_warehouse?: Warehouse | '';
  new_status?: RollStatus | '';
  new_weight_kg?: number;
  notes_ar: string;
};

export function AdjustmentsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['adjustments'], queryFn: inventoryApi.listAdjustments });

  const create = useMutation({
    mutationFn: (v: FormVals) =>
      inventoryApi.createAdjustment({
        roll_id: Number(v.roll_id),
        new_warehouse: (v.new_warehouse || undefined) as Warehouse | undefined,
        new_status: (v.new_status || undefined) as RollStatus | undefined,
        new_weight_kg: v.new_weight_kg ? Number(v.new_weight_kg) : undefined,
        notes_ar: v.notes_ar,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adjustments'] });
      form.reset();
    },
  });

  const form = useForm<FormVals>();

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader title={ar.adjustments.title} description={ar.hubs.inventoryAdjustmentsDesc} />

      <Card>
        <CardHeader><CardTitle>{ar.adjustments.create}</CardTitle></CardHeader>
        <CardContent>
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
              <select {...form.register('new_warehouse')} className="w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-75">
                <option value="">—</option>
                <option value="shop">{ar.warehouses.shop}</option>
                <option value="factory">{ar.warehouses.factory}</option>
                <option value="damaged_shop">{ar.warehouses.damaged_shop}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.adjustments.newStatus}</Label>
              <select {...form.register('new_status')} className="w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-75">
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
              {create.error && (
                <span className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
                  {(create.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ar.common.error}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{ar.adjustments.title}</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-foreground-muted uppercase tracking-wide">
              <tr className="border-b border-border-subtle">
                <th className="py-2.5 font-medium">{ar.stockMovements.when}</th>
                <th className="font-medium">{ar.stockMovements.rollBarcode}</th>
                <th className="font-medium">{ar.stockMovements.from}</th>
                <th className="font-medium">{ar.stockMovements.to}</th>
                <th className="font-medium">{ar.adjustments.notes}</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((m) => (
                <tr key={m.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150">
                  <td className="py-2.5 text-foreground-muted">{new Date(m.created_at).toLocaleString('ar-EG-u-nu-latn')}</td>
                  <td className="font-mono text-foreground">#{m.roll_id}</td>
                  <td>{m.from_warehouse ? ar.warehouses[m.from_warehouse] : '—'}</td>
                  <td>{m.to_warehouse ? ar.warehouses[m.to_warehouse] : '—'}</td>
                  <td className="text-xs text-foreground-muted">{m.notes_ar ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
