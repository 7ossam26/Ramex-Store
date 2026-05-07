import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { RollStatus, Warehouse } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      <Card>
        <CardHeader><CardTitle>{ar.adjustments.create}</CardTitle></CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((v) => create.mutate(v))}
            className="grid grid-cols-2 md:grid-cols-3 gap-3"
          >
            <div className="space-y-1">
              <Label>{ar.adjustments.rollId}</Label>
              <Input type="number" {...form.register('roll_id', { valueAsNumber: true, required: true })} />
            </div>
            <div className="space-y-1">
              <Label>{ar.adjustments.newWarehouse}</Label>
              <select {...form.register('new_warehouse')} className="w-full h-10 rounded border border-border bg-canvas px-3 text-sm">
                <option value="">—</option>
                <option value="shop">{ar.warehouses.shop}</option>
                <option value="factory">{ar.warehouses.factory}</option>
                <option value="damaged_shop">{ar.warehouses.damaged_shop}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar.adjustments.newStatus}</Label>
              <select {...form.register('new_status')} className="w-full h-10 rounded border border-border bg-canvas px-3 text-sm">
                <option value="">—</option>
                {(['in_stock', 'reserved', 'damaged', 'sample', 'returned', 'written_off'] as RollStatus[]).map((s) => (
                  <option key={s} value={s}>{ar.rollStatuses[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar.adjustments.newWeight}</Label>
              <Input type="number" step="0.001" {...form.register('new_weight_kg', { valueAsNumber: true })} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{ar.adjustments.notes}</Label>
              <Input {...form.register('notes_ar', { required: true, minLength: 1 })} />
            </div>
            <div className="col-span-full">
              <Button type="submit" disabled={create.isPending}>{ar.adjustments.create}</Button>
              {create.error && (
                <span className="text-sm text-red-600 mr-3">
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
            <thead className="text-right text-xs text-muted-foreground">
              <tr>
                <th className="py-2">{ar.stockMovements.when}</th>
                <th>{ar.stockMovements.rollBarcode}</th>
                <th>{ar.stockMovements.from}</th>
                <th>{ar.stockMovements.to}</th>
                <th>{ar.adjustments.notes}</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="py-2">{new Date(m.created_at).toLocaleString('ar-EG-u-nu-latn')}</td>
                  <td className="font-mono">#{m.roll_id}</td>
                  <td>{m.from_warehouse ? ar.warehouses[m.from_warehouse] : '—'}</td>
                  <td>{m.to_warehouse ? ar.warehouses[m.to_warehouse] : '—'}</td>
                  <td className="text-xs text-muted-foreground">{m.notes_ar ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
