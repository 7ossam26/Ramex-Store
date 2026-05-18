import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { Shipment } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ScannerInput } from '@/components/ScannerInput';

export function CreateShipmentPage() {
  const qc = useQueryClient();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [submittedNo, setSubmittedNo] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scanFlash, setScanFlash] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [fabricFilter, setFabricFilter] = useState<number | null>(null);
  const [colorFilter, setColorFilter] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fabricsQ = useQuery({ queryKey: ['fabrics'], queryFn: inventoryApi.listFabrics });
  const colorsQ = useQuery({ queryKey: ['colors'], queryFn: inventoryApi.listColors });

  const factoryRollsQ = useQuery({
    queryKey: ['factory-rolls', fabricFilter, colorFilter, searchTerm],
    queryFn: () =>
      inventoryApi.listFactoryRolls({
        fabric_id: fabricFilter ?? undefined,
        color_id: colorFilter ?? undefined,
        q: searchTerm.trim() || undefined,
      }),
    enabled: !!shipment && !submittedNo,
  });

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

  const addById = useMutation({
    mutationFn: (rollId: number) => inventoryApi.addShipmentRollById(shipment!.id, rollId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment', shipment?.id] });
      qc.invalidateQueries({ queryKey: ['factory-rolls'] });
    },
  });

  const addByBarcode = useMutation({
    mutationFn: (barcode: string) =>
      inventoryApi.addShipmentRollByBarcode(shipment!.id, barcode),
    onSuccess: (_data, barcode) => {
      qc.invalidateQueries({ queryKey: ['shipment', shipment?.id] });
      qc.invalidateQueries({ queryKey: ['factory-rolls'] });
      setScanFlash(`✓ ${barcode}`);
      setScanError(null);
      setTimeout(() => setScanFlash(null), 1000);
    },
    onError: (e: unknown, barcode) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        `${ar.shipments.barcodeNotFound}: ${barcode}`;
      setScanError(msg);
      setScanFlash(null);
    },
  });

  const removeLine = useMutation({
    mutationFn: (lineId: number) => inventoryApi.removeShipmentLine(shipment!.id, lineId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment', shipment?.id] });
      qc.invalidateQueries({ queryKey: ['factory-rolls'] });
    },
  });

  const submit = useMutation({
    mutationFn: () => inventoryApi.submitShipment(shipment!.id),
    onSuccess: (s) => setSubmittedNo(s.shipment_no),
  });

  useEffect(() => {
    if (!shipment && !submittedNo) createDraft.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = useMemo(() => detailsQ.data?.lines ?? [], [detailsQ.data]);
  const alreadyAddedIds = useMemo(() => new Set(lines.map((l) => l.roll_id)), [lines]);

  if (submittedNo) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="border-success/40 bg-success-subtle">
          <CardHeader>
            <CardTitle className="text-success-foreground">
              {ar.shipments.submittedSuccess}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-success-foreground/80">{ar.shipments.shipmentNo}</div>
            <div className="text-3xl font-semibold text-success-foreground tabular-num" dir="ltr">
              {submittedNo}
            </div>
            <Button
              onClick={() => {
                setShipment(null);
                setSubmittedNo(null);
                createDraft.mutate();
              }}
            >
              {ar.shipments.new}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!shipment) return <div>{ar.loading}</div>;

  const onSubmit = () => setConfirmOpen(true);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader title={`${ar.shipments.create} — ${shipment.shipment_no}`} />

      <Card>
        <CardHeader>
          <CardTitle>{ar.shipments.addRoll}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium text-foreground">
              {ar.shipments.addRollHint}
            </Label>
            <div className="flex gap-2 items-center">
              <div className="flex-1 max-w-sm">
                <ScannerInput
                  onScan={(barcode) => {
                    setScanError(null);
                    addByBarcode.mutate(barcode);
                  }}
                  placeholder={ar.shipments.addRollHint}
                />
              </div>
              {scanFlash && (
                <span
                  className="text-xs font-mono tabular-num text-success-foreground"
                  dir="ltr"
                >
                  {scanFlash}
                </span>
              )}
            </div>
            {scanError && (
              <p className="text-sm text-danger transition-opacity duration-75 ease-standard">
                {scanError}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ar.shipments.factoryRollsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                {ar.shipments.filterByFabric}
              </Label>
              <select
                value={fabricFilter === null ? '' : String(fabricFilter)}
                onChange={(e) =>
                  setFabricFilter(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground"
              >
                <option value="">—</option>
                {fabricsQ.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name_ar}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                {ar.shipments.filterByColor}
              </Label>
              <select
                value={colorFilter === null ? '' : String(colorFilter)}
                onChange={(e) =>
                  setColorFilter(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground"
              >
                <option value="">—</option>
                {colorsQ.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_ar} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                {ar.shipments.searchPlaceholder}
              </Label>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={ar.shipments.searchPlaceholder}
              />
            </div>
          </div>

          {factoryRollsQ.data && factoryRollsQ.data.length === 0 ? (
            <p className="text-sm text-foreground-muted py-2">
              {ar.shipments.noFactoryRolls}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide">
                <tr className="border-b border-border-subtle">
                  <th className="py-2.5 font-medium">{ar.stockMovements.rollBarcode}</th>
                  <th className="font-medium">{ar.shipments.rollFabric}</th>
                  <th className="font-medium">{ar.shipments.rollColor}</th>
                  <th className="font-medium">{ar.shipments.rollWeight}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {factoryRollsQ.data?.map((r) => {
                  const added = alreadyAddedIds.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150"
                    >
                      <td className="py-2.5 font-mono tabular-num text-foreground">
                        {r.internal_barcode}
                      </td>
                      <td>{r.fabric_name_ar}</td>
                      <td>
                        {r.color_name_ar} ({r.color_code})
                      </td>
                      <td className="tabular-num" dir="ltr">
                        {r.weight_kg}
                      </td>
                      <td>
                        <Button
                          size="sm"
                          disabled={added || addById.isPending}
                          onClick={() => addById.mutate(r.id)}
                        >
                          {added ? ar.common.success : ar.shipments.addRoll}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {ar.shipments.rollsCount}:{' '}
            <span className="tabular-num" dir="ltr">
              {lines.length}
            </span>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150"
                  >
                    <td className="py-2.5 font-mono tabular-num text-foreground">
                      {l.internal_barcode}
                    </td>
                    <td>{l.fabric_name_ar}</td>
                    <td>
                      {l.color_name_ar} ({l.color_code})
                    </td>
                    <td className="tabular-num" dir="ltr">
                      {l.weight_kg}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine.mutate(l.id)}
                      >
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
        <Button
          onClick={onSubmit}
          disabled={lines.length === 0 || submit.isPending}
          size="lg"
        >
          {ar.shipments.submit}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        message={ar.shipments.confirmSubmit}
        onConfirm={() => {
          setConfirmOpen(false);
          submit.mutate();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
