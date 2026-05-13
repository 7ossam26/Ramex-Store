import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { Shipment } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type AddRollForm = {
  fabric_id: number;
  color_id: number;
  weight_kg: number;
  roll_sr_no?: string;
  order_no?: string;
  factory_purchase_price_egp?: number;
};

export function CreateShipmentPage() {
  const qc = useQueryClient();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [submittedNo, setSubmittedNo] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fabricsQ = useQuery({ queryKey: ['fabrics'], queryFn: inventoryApi.listFabrics });
  const colorsQ = useQuery({ queryKey: ['colors'], queryFn: inventoryApi.listColors });

  const detailsQ = useQuery({
    queryKey: ['shipment', shipment?.id],
    queryFn: () => inventoryApi.getShipment(shipment!.id),
    enabled: !!shipment && !submittedNo,
    refetchOnMount: 'always',
  });

  const createDraft = useMutation({
    mutationFn: () => inventoryApi.createShipmentDraft(),
    onSuccess: (s) => setShipment(s),
  });

  const addRoll = useMutation({
    mutationFn: (body: AddRollForm) => inventoryApi.addShipmentRoll(shipment!.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipment', shipment?.id] }),
  });

  const removeLine = useMutation({
    mutationFn: (lineId: number) => inventoryApi.removeShipmentLine(shipment!.id, lineId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipment', shipment?.id] }),
  });

  const submit = useMutation({
    mutationFn: () => inventoryApi.submitShipment(shipment!.id),
    onSuccess: (s) => setSubmittedNo(s.shipment_no),
  });

  useEffect(() => {
    if (!shipment && !submittedNo) createDraft.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm<AddRollForm>();

  if (submittedNo) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="border-success/40 bg-success-subtle">
          <CardHeader>
            <CardTitle className="text-success-foreground">{ar.shipments.submittedSuccess}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-success-foreground/80">{ar.shipments.shipmentNo}</div>
            <div className="text-3xl font-semibold text-success-foreground tabular-num" dir="ltr">{submittedNo}</div>
            <Button onClick={() => { setShipment(null); setSubmittedNo(null); createDraft.mutate(); }}>
              {ar.shipments.new}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!shipment) return <div>{ar.loading}</div>;

  const lines = detailsQ.data?.lines ?? [];

  const onAdd = (v: AddRollForm) => {
    addRoll.mutate(
      {
        fabric_id: Number(v.fabric_id),
        color_id: Number(v.color_id),
        weight_kg: Number(v.weight_kg),
        roll_sr_no: v.roll_sr_no || undefined,
        order_no: v.order_no || undefined,
        factory_purchase_price_egp: v.factory_purchase_price_egp ? Number(v.factory_purchase_price_egp) : undefined,
      },
      { onSuccess: () => form.reset({ fabric_id: v.fabric_id, color_id: v.color_id }) },
    );
  };

  const onSubmit = () => setConfirmOpen(true);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader title={`${ar.shipments.create} — ${shipment.shipment_no}`} />

      <Card>
        <CardHeader>
          <CardTitle>{ar.shipments.addRoll}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onAdd)} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.shipments.rollFabric}</Label>
              <select
                {...form.register('fabric_id', { valueAsNumber: true, required: true, validate: (v) => !isNaN(v) || 'مطلوب' })}
                className="w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
              >
                <option value="">—</option>
                {fabricsQ.data?.map((f) => (
                  <option key={f.id} value={f.id}>{f.name_ar}</option>
                ))}
              </select>
              {form.formState.errors.fabric_id && <p className="text-xs text-danger mt-0.5">مطلوب</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.shipments.rollColor}</Label>
              <select
                {...form.register('color_id', { valueAsNumber: true, required: true, validate: (v) => !isNaN(v) || 'مطلوب' })}
                className="w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
              >
                <option value="">—</option>
                {colorsQ.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_ar} ({c.code})</option>
                ))}
              </select>
              {form.formState.errors.color_id && <p className="text-xs text-danger mt-0.5">مطلوب</p>}
            </div>
            <div className="space-y-1">
              <Label>{ar.shipments.rollWeight}</Label>
              <Input type="number" inputMode="decimal" step="0.001" {...form.register('weight_kg', { valueAsNumber: true, required: true, validate: (v) => (v > 0) || 'مطلوب' })} />
              {form.formState.errors.weight_kg && <p className="text-xs text-danger mt-0.5">مطلوب</p>}
            </div>
            <div className="space-y-1">
              <Label>{ar.shipments.rollSrNo}</Label>
              <Input {...form.register('roll_sr_no')} />
            </div>
            <div className="space-y-1">
              <Label>{ar.shipments.orderNo}</Label>
              <Input {...form.register('order_no')} />
            </div>
            <div className="space-y-1">
              <Label>{ar.shipments.factoryPrice}</Label>
              <Input type="number" inputMode="decimal" step="0.01" {...form.register('factory_purchase_price_egp', { valueAsNumber: true })} />
            </div>
            <div className="col-span-full flex items-center gap-3 flex-wrap">
              <Button type="submit" disabled={addRoll.isPending}>{ar.shipments.addRoll}</Button>
              {addRoll.error && (
                <span className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
                  {(addRoll.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ar.common.error}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {ar.shipments.rollsCount}: <span className="tabular-num" dir="ltr">{lines.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-foreground-muted py-2">{ar.common.none}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide">
                <tr className="border-b border-border-subtle">
                  <th className="py-2.5 font-medium">{ar.stockMovements.rollBarcode}</th>
                  <th className="font-medium">{ar.shipments.rollFabric}</th>
                  <th className="font-medium">{ar.shipments.rollColor}</th>
                  <th className="font-medium">{ar.shipments.rollWeight}</th>
                  <th className="font-medium">{ar.shipments.factoryPrice}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150">
                    <td className="py-2.5 font-mono tabular-num text-foreground">{l.internal_barcode}</td>
                    <td>{l.fabric_name_ar}</td>
                    <td>{l.color_name_ar} ({l.color_code})</td>
                    <td className="tabular-num" dir="ltr">{l.weight_kg}</td>
                    <td className="tabular-num" dir="ltr">{l.factory_purchase_price_egp ?? '—'}</td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => removeLine.mutate(l.id)}>
                        {ar.common.cancel}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={lines.length === 0 || submit.isPending} size="lg">
          {ar.shipments.submit}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        message={ar.shipments.confirmSubmit}
        onConfirm={() => { setConfirmOpen(false); submit.mutate(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
