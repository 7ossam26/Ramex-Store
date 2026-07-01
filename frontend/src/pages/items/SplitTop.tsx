import { useEffect, useRef, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { itemsApi } from '@/lib/items-api';
import { openPdfBlob } from '@/lib/pdf';
import { extractApiError } from '@/lib/api-error';
import { rollQtyLabel, quantityUnitLabel } from '@/lib/fabric-unit';
import type { RollWithDetails } from '@/lib/items-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { Code128 } from '@/components/Code128';
import { RollStatusPill } from '@/components/items/RollStatusPill';

type Mode = 'scan' | 'split' | 'success';

type SuccessResult = {
  original: RollWithDetails;
  rib: RollWithDetails;
};

function warehouseLabel(w: string): string {
  if (w === 'shop') return ar.warehouses.shop;
  if (w === 'factory') return ar.warehouses.factory;
  if (w === 'damaged_shop') return ar.warehouses.damaged_shop;
  return w;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-foreground-muted">{label}: </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function SplitTopPage() {
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>('scan');
  const [barcode, setBarcode] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [roll, setRoll] = useState<RollWithDetails | null>(null);
  const [newQty, setNewQty] = useState('');
  const [splitError, setSplitError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'scan') {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [mode]);

  const lookupMut = useMutation({
    mutationFn: (bc: string) => itemsApi.getRollByBarcode(bc),
    onSuccess: (data) => {
      setScanError(null);
      setRoll(data);
      setNewQty('');
      setSplitError(null);
      setMode('split');
    },
    onError: (e: unknown) => {
      import('axios').then(({ default: axios }) => {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setScanError(ar.splitTop.notFound);
        } else {
          setScanError(extractApiError(e));
        }
      });
    },
  });

  const splitMut = useMutation({
    mutationFn: ({ id, qty }: { id: number; qty: number }) => itemsApi.splitTop(id, qty),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['rolls-search'] });
      setResult(data);
      setMode('success');
    },
    onError: (e: unknown) => {
      setSplitError(extractApiError(e));
    },
  });

  const printMut = useMutation({
    mutationFn: (rollId: number) => itemsApi.labelPdfBlob(rollId),
    onSuccess: (blob) => openPdfBlob(blob),
  });

  function handleScan() {
    const trimmed = barcode.trim();
    if (!trimmed) return;
    setScanError(null);
    lookupMut.mutate(trimmed);
  }

  function handleReset() {
    setMode('scan');
    setBarcode('');
    setScanError(null);
    setRoll(null);
    setNewQty('');
    setSplitError(null);
    setResult(null);
  }

  const currentQty = roll
    ? roll.fabric_unit === 'meter'
      ? Number(roll.length_m ?? 0)
      : Number(roll.weight_kg ?? 0)
    : 0;

  const unitLabel = roll ? quantityUnitLabel(roll.fabric_unit) : '';

  const parsedNew = parseFloat(newQty);
  const isValidQty = !isNaN(parsedNew) && parsedNew > 0 && parsedNew < currentQty;
  const remainder = isValidQty ? Math.round((currentQty - parsedNew) * 1000) / 1000 : null;

  function handleSplit() {
    if (!roll || !isValidQty) return;
    setSplitError(null);
    splitMut.mutate({ id: roll.id, qty: parsedNew });
  }

  return (
    <PageShell title={ar.splitTop.navTitle} description={ar.splitTop.description} backTo="/items">

      {/* ── SCAN STEP ─────────────────────────────────────────────────── */}
      {mode === 'scan' && (
        <SectionCard>
          <div className="space-y-4 max-w-sm">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.splitTop.scanPrompt}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
                  <span className="absolute size-6 rounded-full bg-ring/20 animate-ping" />
                  <ScanBarcode className="relative size-4 text-ring" aria-hidden />
                </span>
                <Input
                  ref={barcodeInputRef}
                  autoFocus
                  value={barcode}
                  onChange={(e) => { setBarcode(e.target.value); setScanError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                  placeholder={ar.splitTop.scanPlaceholder}
                  dir="ltr"
                  className="h-11 md:h-10 pr-10"
                  disabled={lookupMut.isPending}
                />
              </div>
            </div>
            <Button
              onClick={handleScan}
              disabled={!barcode.trim() || lookupMut.isPending}
              className="w-full h-11 md:h-10"
            >
              {lookupMut.isPending ? ar.loading : ar.labels.search}
            </Button>
            {scanError && (
              <p className="text-sm text-danger-foreground">{scanError}</p>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── SPLIT STEP ────────────────────────────────────────────────── */}
      {mode === 'split' && roll && (
        <div className="space-y-4">
          <SectionCard>
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">{ar.labels.rollDetail}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <InfoRow label={ar.splitTop.fabricLabel} value={roll.fabric_name_ar} />
                <InfoRow label={ar.splitTop.colorLabel} value={roll.color_name_ar} />
                <InfoRow label={ar.splitTop.warehouseLabel} value={warehouseLabel(roll.warehouse)} />
                <InfoRow label={ar.labels.status} value={<RollStatusPill status={roll.status} />} />
                <InfoRow
                  label={ar.splitTop.barcodeLabel}
                  value={<span className="font-mono text-xs" dir="ltr">{roll.internal_barcode}</span>}
                />
                <InfoRow
                  label={ar.splitTop.currentQtyLabel}
                  value={<span dir="ltr">{rollQtyLabel(roll.weight_kg, roll.length_m)}</span>}
                />
              </div>

              {roll.status !== 'in_stock' && (
                <p className="text-sm text-danger-foreground font-medium">{ar.splitTop.notInStock}</p>
              )}
            </div>
          </SectionCard>

          {roll.status === 'in_stock' && (
            <SectionCard>
              <div className="space-y-4 max-w-sm">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-foreground">
                    {ar.splitTop.newQtyLabel} ({unitLabel})
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={newQty}
                    onChange={(e) => { setNewQty(e.target.value); setSplitError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && isValidQty && handleSplit()}
                    placeholder={ar.splitTop.newQtyPlaceholder}
                    dir="ltr"
                    className="h-11 md:h-10"
                    disabled={splitMut.isPending}
                  />
                  {newQty !== '' && !isValidQty && (
                    <p className="text-xs text-danger-foreground">{ar.splitTop.invalidQty}</p>
                  )}
                </div>

                {remainder !== null && (
                  <div className="rounded-md border border-border-subtle bg-surface-hover/40 p-3 text-sm space-y-1">
                    <div>
                      <span className="text-foreground-muted">{ar.splitTop.remainderLabel}: </span>
                      <span className="font-semibold tabular-num" dir="ltr">
                        {remainder.toFixed(roll.fabric_unit === 'meter' ? 2 : 3)} {unitLabel}
                      </span>
                    </div>
                    <div>
                      <span className="text-foreground-muted">{ar.splitTop.newQtyLabel}: </span>
                      <span className="font-semibold tabular-num" dir="ltr">
                        {parsedNew.toFixed(roll.fabric_unit === 'meter' ? 2 : 3)} {unitLabel}
                      </span>
                    </div>
                  </div>
                )}

                {splitError && (
                  <p className="text-sm text-danger-foreground">{splitError}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-11 md:h-10"
                    onClick={handleReset}
                    disabled={splitMut.isPending}
                  >
                    {ar.common.cancel}
                  </Button>
                  <Button
                    className="flex-1 h-11 md:h-10"
                    onClick={handleSplit}
                    disabled={!isValidQty || splitMut.isPending}
                  >
                    {splitMut.isPending ? ar.loading : ar.splitTop.splitButton}
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {roll.status !== 'in_stock' && (
            <Button variant="outline" onClick={handleReset} className="h-11 md:h-10">
              {ar.splitTop.resetButton}
            </Button>
          )}
        </div>
      )}

      {/* ── SUCCESS STEP ──────────────────────────────────────────────── */}
      {mode === 'success' && result && (
        <div className="space-y-4">
          <SectionCard>
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">{ar.splitTop.successTitle}</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Original top */}
                <div className="rounded-md border border-border-subtle p-3 space-y-2 text-sm">
                  <p className="font-semibold text-foreground-muted text-xs uppercase tracking-wide">
                    {ar.splitTop.originalLabel}
                  </p>
                  <div className="space-y-1">
                    <InfoRow label={ar.splitTop.barcodeLabel} value={
                      <span className="font-mono text-xs" dir="ltr">{result.original.internal_barcode}</span>
                    } />
                    <InfoRow label={ar.splitTop.currentQtyLabel} value={
                      <span dir="ltr">{rollQtyLabel(result.original.weight_kg, result.original.length_m)}</span>
                    } />
                    <InfoRow label={ar.splitTop.fabricLabel} value={result.original.fabric_name_ar} />
                  </div>
                </div>

                {/* New rib */}
                <div className="rounded-md border border-ring/30 bg-surface-hover/30 p-3 space-y-2 text-sm">
                  <p className="font-semibold text-ring text-xs uppercase tracking-wide">
                    {ar.splitTop.ribLabel}
                  </p>
                  <div className="space-y-1">
                    <InfoRow label={ar.splitTop.barcodeLabel} value={
                      <span className="font-mono text-xs" dir="ltr">{result.rib.internal_barcode}</span>
                    } />
                    <InfoRow label={ar.splitTop.newQtyLabel} value={
                      <span dir="ltr">{rollQtyLabel(result.rib.weight_kg, result.rib.length_m)}</span>
                    } />
                    <InfoRow label={ar.splitTop.fabricLabel} value={result.rib.fabric_name_ar} />
                  </div>

                  {/* Barcode preview — on-screen before printing */}
                  <div className="pt-2">
                    <Code128
                      value={result.rib.internal_barcode}
                      height={40}
                      fontSize={11}
                      className="w-full"
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-10"
                    disabled={printMut.isPending && printMut.variables === result.rib.id}
                    onClick={() => printMut.mutate(result.rib.id)}
                  >
                    {printMut.isPending ? ar.loading : ar.splitTop.printRibLabel}
                  </Button>
                </div>
              </div>
            </div>
          </SectionCard>

          <Button onClick={handleReset} className="h-11 md:h-10">
            {ar.splitTop.resetButton}
          </Button>
        </div>
      )}
    </PageShell>
  );
}
