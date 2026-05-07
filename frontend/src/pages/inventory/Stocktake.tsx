import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { Stocktake, StocktakeMode, Warehouse } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScannerInput } from '@/components/ScannerInput';

export function StocktakePage() {
  const [active, setActive] = useState<Stocktake | null>(null);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {!active ? <StartCard onStarted={setActive} /> : <RunStocktake stocktake={active} onComplete={() => setActive(null)} />}
      <PastStocktakes />
    </div>
  );
}

function StartCard({ onStarted }: { onStarted: (s: Stocktake) => void }) {
  const [mode, setMode] = useState<StocktakeMode>('roll_level');
  const [warehouse, setWarehouse] = useState<Warehouse>('shop');

  const m = useMutation({
    mutationFn: () => inventoryApi.startStocktake({ mode, warehouse }),
    onSuccess: onStarted,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar.stocktake.start}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3 items-end">
        <div className="space-y-1">
          <Label>{ar.stocktake.mode}</Label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as StocktakeMode)}
            className="w-full h-10 rounded border border-border bg-canvas px-3 text-sm"
          >
            <option value="roll_level">{ar.stocktake.rollLevel}</option>
            <option value="aggregate">{ar.stocktake.aggregate}</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>{ar.stocktake.warehouse}</Label>
          <select
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value as Warehouse)}
            className="w-full h-10 rounded border border-border bg-canvas px-3 text-sm"
          >
            <option value="shop">{ar.warehouses.shop}</option>
            <option value="factory">{ar.warehouses.factory}</option>
            <option value="damaged_shop">{ar.warehouses.damaged_shop}</option>
          </select>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {ar.stocktake.start}
        </Button>
      </CardContent>
    </Card>
  );
}

function RunStocktake({ stocktake, onComplete }: { stocktake: Stocktake; onComplete: () => void }) {
  const qc = useQueryClient();
  const [scanFlash, setScanFlash] = useState<string | null>(null);

  const detailsQ = useQuery({
    queryKey: ['stocktake', stocktake.id],
    queryFn: () => inventoryApi.getStocktake(stocktake.id),
  });

  const fabricsQ = useQuery({ queryKey: ['fabrics'], queryFn: inventoryApi.listFabrics });
  const colorsQ = useQuery({ queryKey: ['colors'], queryFn: inventoryApi.listColors });

  const scanM = useMutation({
    mutationFn: (barcode: string) => inventoryApi.scanStocktake(stocktake.id, barcode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stocktake', stocktake.id] }),
  });

  const aggM = useMutation({
    mutationFn: (body: { fabric_id: number; color_id: number; actual_count: number; actual_weight_kg?: number }) =>
      inventoryApi.recordStocktakeAggregate(stocktake.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stocktake', stocktake.id] }),
  });

  const completeM = useMutation({
    mutationFn: () => inventoryApi.completeStocktake(stocktake.id),
    onSuccess: () => onComplete(),
  });


  const data = detailsQ.data;
  if (!data) return <div>{ar.loading}</div>;

  function handleScan(barcode: string) {
    scanM.mutate(barcode, {
      onSuccess: () => { setScanFlash(barcode); setTimeout(() => setScanFlash(null), 800); },
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{stocktake.stocktake_no} — {ar.warehouses[stocktake.warehouse]}</CardTitle>
        <Button onClick={() => completeM.mutate()} disabled={completeM.isPending}>
          {ar.stocktake.complete}
        </Button>
      </CardHeader>
      <CardContent>
        {stocktake.mode === 'roll_level' ? (
          <>
            <div className="mb-3 space-y-1">
              <Label>{ar.stocktake.scanPrompt}</Label>
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <ScannerInput
                    onScan={handleScan}
                    placeholder={ar.labels.scanHint}
                    disabled={scanM.isPending}
                  />
                </div>
                {scanFlash && <span className="text-xs text-green-600">✓ {scanFlash}</span>}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground">
                <tr>
                  <th className="py-2">{ar.stockMovements.rollBarcode}</th>
                  <th>{ar.stocktake.expected}</th>
                  <th>{ar.stocktake.actual}</th>
                  <th>{ar.stocktake.variance}</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-2 font-mono">#{l.roll_id}</td>
                    <td>{l.expected_count ?? '—'}</td>
                    <td className={l.actual_count == null ? 'text-amber-600' : ''}>
                      {l.actual_count ?? '—'}
                    </td>
                    <td>{l.variance ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <AggregateGrid
            lines={data.lines}
            fabrics={fabricsQ.data ?? []}
            colors={colorsQ.data ?? []}
            onSave={(line) => aggM.mutate(line)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AggregateGrid({
  lines, fabrics, colors, onSave,
}: {
  lines: import('@/lib/inventory-types').StocktakeLine[];
  fabrics: { id: number; name_ar: string }[];
  colors: { id: number; name_ar: string; code: string }[];
  onSave: (l: { fabric_id: number; color_id: number; actual_count: number; actual_weight_kg?: number }) => void;
}) {
  const [draft, setDraft] = useState<Record<number, { count?: string; weight?: string }>>({});
  return (
    <table className="w-full text-sm">
      <thead className="text-right text-xs text-muted-foreground">
        <tr>
          <th className="py-2">{ar.shipments.rollFabric}</th>
          <th>{ar.shipments.rollColor}</th>
          <th>{ar.stocktake.expected}</th>
          <th>{ar.stocktake.actual}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const fab = fabrics.find((f) => f.id === l.fabric_id);
          const col = colors.find((c) => c.id === l.color_id);
          const d = draft[l.id] ?? {};
          return (
            <tr key={l.id} className="border-t border-border">
              <td className="py-2">{fab?.name_ar ?? l.fabric_id}</td>
              <td>{col ? `${col.name_ar} (${col.code})` : l.color_id}</td>
              <td>{l.expected_count ?? '—'} / {l.expected_weight_kg ?? '—'}</td>
              <td className="flex gap-1">
                <Input
                  type="number"
                  className="w-20"
                  defaultValue={l.actual_count ?? ''}
                  onChange={(e) => setDraft((s) => ({ ...s, [l.id]: { ...s[l.id], count: e.target.value } }))}
                />
                <Input
                  type="number"
                  step="0.001"
                  className="w-24"
                  defaultValue={l.actual_weight_kg ?? ''}
                  onChange={(e) => setDraft((s) => ({ ...s, [l.id]: { ...s[l.id], weight: e.target.value } }))}
                />
              </td>
              <td>
                <Button
                  size="sm"
                  onClick={() =>
                    onSave({
                      fabric_id: l.fabric_id!,
                      color_id: l.color_id!,
                      actual_count: Number(d.count ?? l.actual_count ?? 0),
                      actual_weight_kg: d.weight ? Number(d.weight) : undefined,
                    })
                  }
                >
                  {ar.common.save}
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PastStocktakes() {
  const q = useQuery({ queryKey: ['stocktakes'], queryFn: inventoryApi.listStocktakes });
  return (
    <Card>
      <CardHeader><CardTitle>{ar.stocktake.title}</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-right text-xs text-muted-foreground">
            <tr>
              <th className="py-2">رقم الجرد</th>
              <th>{ar.stocktake.warehouse}</th>
              <th>{ar.stocktake.mode}</th>
              <th>الحالة</th>
              <th>بدأ</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="py-2 font-mono">{s.stocktake_no}</td>
                <td>{ar.warehouses[s.warehouse]}</td>
                <td>{s.mode === 'roll_level' ? ar.stocktake.rollLevel : ar.stocktake.aggregate}</td>
                <td>{s.status === 'open' ? 'مفتوح' : s.status === 'completed' ? 'منتهي' : 'ملغى'}</td>
                <td>{new Date(s.started_at).toLocaleString('ar-EG-u-nu-latn')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
