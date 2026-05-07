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
        <Card>
          <CardHeader>
            <CardTitle>{ar.shipments.submittedSuccess}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">{ar.shipments.shipmentNo}</div>
            <div className="text-2xl font-bold">{submittedNo}</div>
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

  const onSubmit = () => {
    if (!confirm(ar.shipments.confirmSubmit)) return;
    submit.mutate();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {ar.shipments.create} — {shipment.shipment_no}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onAdd)} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>{ar.shipments.rollFabric}</Label>
              <select
                {...form.register('fabric_id', { valueAsNumber: true, required: true })}
                className="w-full h-10 rounded border border-border bg-canvas px-3 text-sm"
              >
                <option value="">—</option>
                {fabricsQ.data?.map((f) => (
                  <option key={f.id} value={f.id}>{f.name_ar}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar.shipments.rollColor}</Label>
              <select
                {...form.register('color_id', { valueAsNumber: true, required: true })}
                className="w-full h-10 rounded border border-border bg-canvas px-3 text-sm"
              >
                <option value="">—</option>
                {colorsQ.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_ar} ({c.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar.shipments.rollWeight}</Label>
              <Input type="number" step="0.001" {...form.register('weight_kg', { valueAsNumber: true, required: true })} />
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
              <Input type="number" step="0.01" {...form.register('factory_purchase_price_egp', { valueAsNumber: true })} />
            </div>
            <div className="col-span-full">
              <Button type="submit" disabled={addRoll.isPending}>{ar.shipments.addRoll}</Button>
              {addRoll.error && (
                <span className="text-sm text-red-600 mr-3">
                  {(addRoll.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ar.common.error}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ar.shipments.rollsCount}: {lines.length}</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar.common.none}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground">
                <tr>
                  <th className="py-2">{ar.stockMovements.rollBarcode}</th>
                  <th>{ar.shipments.rollFabric}</th>
                  <th>{ar.shipments.rollColor}</th>
                  <th>{ar.shipments.rollWeight}</th>
                  <th>{ar.shipments.factoryPrice}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-2 font-mono">{l.internal_barcode}</td>
                    <td>{l.fabric_name_ar}</td>
                    <td>{l.color_name_ar} ({l.color_code})</td>
                    <td>{l.weight_kg}</td>
                    <td>{l.factory_purchase_price_egp ?? '—'}</td>
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
    </div>
  );
}
