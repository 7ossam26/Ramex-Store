import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { itemsApi } from '@/lib/items-api';
import { codesApi } from '@/lib/codes-api';
import type {
  Color,
  CreateFabricInput,
  CreateTopBatchInput,
  CreateTopBatchResult,
  FabricFull,
} from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Code128 } from '@/components/Code128';
import { PageHeader } from '@/components/PageHeader';
import { Plus } from 'lucide-react';

const DEFAULT_WEIGHT_KG = 25;

type RollRowState = {
  uid: string;
  pickedColorId: number | null;
  weight_kg: string;
  selling_price_egp: string;
  set_default_price: boolean;
  roll_sr_no: string;
  order_no: string;
  purchase_price_egp: string;
  // Label fields (Phase 5)
  supplier_order_no: string;
  top_number: string;
  brand_id: number | null;
  grade_id: number | null;
  width_cm_roll: string;
  composition_id: number | null;
};

// --- Fabric create dialog ---
type CompositionRow = { material: string; percent: string };
type FabricDraftState = {
  name_ar: string;
  width_cm: string;
  grade: string;
  composition: CompositionRow[];
  notes: string;
};

const blankFabricDraft = (): FabricDraftState => ({
  name_ar: '',
  width_cm: '',
  grade: 'A',
  composition: [{ material: '', percent: '100' }],
  notes: '',
});

function FabricCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (fabric: FabricFull) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<FabricDraftState>(blankFabricDraft);
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (body: CreateFabricInput) => inventoryApi.createFabric(body),
    onSuccess: (fabric) => {
      qc.invalidateQueries({ queryKey: ['fabrics'] });
      onCreated(fabric);
      onOpenChange(false);
      setDraft(blankFabricDraft());
      setErr(null);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        ar.common.error;
      setErr(msg);
    },
  });

  function handleSubmit() {
    setErr(null);
    const composition = draft.composition
      .filter((c) => c.material.trim() && c.percent.trim())
      .map((c) => ({ material: c.material.trim(), percent: Number(c.percent) }));
    if (!draft.name_ar.trim()) {
      setErr(ar.addTop.errors.fabricFieldsRequired);
      return;
    }
    const width_cm = Number(draft.width_cm);
    if (!width_cm || width_cm <= 0) {
      setErr(ar.addTop.errors.widthRequired);
      return;
    }
    if (composition.length === 0) {
      setErr(ar.addTop.errors.compositionRequired);
      return;
    }
    const sum = composition.reduce((s, c) => s + c.percent, 0);
    if (Math.abs(sum - 100) > 0.01) {
      setErr(ar.addTop.errors.compositionMustSum100);
      return;
    }
    mut.mutate({
      name_ar: draft.name_ar.trim(),
      width_cm,
      grade: draft.grade,
      composition,
      notes: draft.notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{ar.fabrics.createTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>{ar.addTop.fabricNameAr}</Label>
              <Input
                value={draft.name_ar}
                onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })}
                placeholder="قطن مصري سادة 150سم"
              />
            </div>
            <div className="space-y-1">
              <Label>{ar.addTop.widthCm}</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={draft.width_cm}
                onChange={(e) => setDraft({ ...draft, width_cm: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>{ar.addTop.grade}</Label>
              <select
                className="w-full h-10 rounded border border-border bg-canvas px-3 text-sm"
                value={draft.grade}
                onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>{ar.addTop.composition}</Label>
            <div className="space-y-2">
              {draft.composition.map((c, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_auto] gap-2">
                  <Input
                    value={c.material}
                    onChange={(e) => {
                      const next = [...draft.composition];
                      next[idx] = { ...c, material: e.target.value };
                      setDraft({ ...draft, composition: next });
                    }}
                    placeholder={ar.addTop.material}
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={c.percent}
                      onChange={(e) => {
                        const next = [...draft.composition];
                        next[idx] = { ...c, percent: e.target.value };
                        setDraft({ ...draft, composition: next });
                      }}
                      dir="ltr"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDraft({ ...draft, composition: draft.composition.filter((_, i) => i !== idx) })
                    }
                    disabled={draft.composition.length === 1}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft({ ...draft, composition: [...draft.composition, { material: '', percent: '' }] })
                }
              >
                + {ar.addTop.addMaterial}
              </Button>
            </div>
          </div>

          {err && (
            <p className="text-sm text-danger-foreground">{err}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {ar.common.cancel}
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={mut.isPending}>
              {mut.isPending ? ar.loading : ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Color create dialog ---
function ColorCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (color: Color) => void;
}) {
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (body: { name_ar: string }) => inventoryApi.createColor(body),
    onSuccess: (color) => {
      qc.invalidateQueries({ queryKey: ['colors'] });
      onCreated(color);
      onOpenChange(false);
      setNameAr('');
      setErr(null);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        ar.common.error;
      setErr(msg);
    },
  });

  function handleSubmit() {
    setErr(null);
    if (!nameAr.trim()) {
      setErr(ar.addTop.errors.colorFieldsRequired);
      return;
    }
    mut.mutate({ name_ar: nameAr.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>إضافة لون جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>{ar.addTop.newColorNameAr}</Label>
            <Input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="أحمر"
              autoFocus
            />
          </div>
          {err && <p className="text-sm text-danger-foreground">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {ar.common.cancel}
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={mut.isPending}>
              {mut.isPending ? ar.loading : ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type LabelPrintState = { open: boolean; format: 'thermal' | 'a4'; perPage: string };

const blankRow = (color?: { pickedColorId: number | null }): RollRowState => ({
  uid: Math.random().toString(36).slice(2),
  pickedColorId: color?.pickedColorId ?? null,
  weight_kg: String(DEFAULT_WEIGHT_KG),
  selling_price_egp: '',
  set_default_price: false,
  roll_sr_no: '',
  order_no: '',
  purchase_price_egp: '',
  supplier_order_no: '',
  top_number: '',
  brand_id: null,
  grade_id: null,
  width_cm_roll: '',
  composition_id: null,
});

function copyLabelFields(src: RollRowState, dst: RollRowState): RollRowState {
  return {
    ...dst,
    supplier_order_no: src.supplier_order_no,
    brand_id: src.brand_id,
    grade_id: src.grade_id,
    width_cm_roll: src.width_cm_roll,
    composition_id: src.composition_id,
  };
}

function num(s: string): number | undefined {
  if (s === '' || s == null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function openPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function AddTopPage() {
  const qc = useQueryClient();
  const fabricsQ = useQuery({ queryKey: ['fabrics'], queryFn: inventoryApi.listFabrics });
  const colorsQ = useQuery({ queryKey: ['colors'], queryFn: inventoryApi.listColors });
  const gradesQ = useQuery({ queryKey: ['codes-grades'], queryFn: codesApi.listGrades });
  const brandsQ = useQuery({ queryKey: ['codes-brands'], queryFn: codesApi.listBrands });
  const compositionsQ = useQuery({ queryKey: ['codes-compositions'], queryFn: codesApi.listCompositions });

  const [pickedFabricId, setPickedFabricId] = useState<number | null>(null);
  const [fabricDialogOpen, setFabricDialogOpen] = useState(false);
  const [colorDialogForIdx, setColorDialogForIdx] = useState<number | null>(null);

  const [rows, setRows] = useState<RollRowState[]>([blankRow()]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<CreateTopBatchResult | null>(null);
  const [labelPrint, setLabelPrint] = useState<LabelPrintState>({ open: false, format: 'thermal', perPage: '24' });
  const [labelPrinting, setLabelPrinting] = useState(false);

  const create = useMutation({
    mutationFn: (body: CreateTopBatchInput) => inventoryApi.createTopBatch(body),
    onSuccess: (result) => {
      setLastBatch(result);
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ['fabrics'] });
      qc.invalidateQueries({ queryKey: ['colors'] });
      qc.invalidateQueries({ queryKey: ['rolls-search'] });
      setRows([blankRow()]);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ??
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        ar.common.error;
      setErrorMsg(msg);
    },
  });

  function openBatchPdf(rollIds: number[]) {
    itemsApi.batchLabelsPdf(rollIds).then((blob) => openPdfBlob(blob));
  }

  async function openSupplierLabelsPdf(rollIds: number[]) {
    setLabelPrinting(true);
    try {
      const blob = await itemsApi.batchFabricLabels(
        rollIds,
        labelPrint.format,
        num(labelPrint.perPage) ?? 24,
      );
      openPdfBlob(blob);
    } finally {
      setLabelPrinting(false);
    }
  }

  const totalWeight = useMemo(
    () => rows.reduce((s, r) => s + (num(r.weight_kg) ?? 0), 0),
    [rows],
  );

  function buildPayload(): CreateTopBatchInput | null {
    if (!pickedFabricId) {
      setErrorMsg('اختر خامة أولاً، أو أنشئ خامة جديدة بالضغط على +');
      return null;
    }

    const rollEntries = [];
    for (const r of rows) {
      if (!r.pickedColorId) {
        setErrorMsg('اختر لوناً لكل توب، أو أنشئ لوناً جديداً بالضغط على +');
        return null;
      }
      const weight_kg = num(r.weight_kg);
      if (!weight_kg || weight_kg <= 0) {
        setErrorMsg(ar.addTop.errors.weightRequired);
        return null;
      }
      const selling = num(r.selling_price_egp);
      rollEntries.push({
        color: { id: r.pickedColorId },
        weight_kg,
        selling_price_egp: selling,
        set_default_price_per_kg: r.set_default_price ? selling : undefined,
        roll_sr_no: r.roll_sr_no.trim() || null,
        order_no: r.order_no.trim() || null,
        purchase_price_egp: num(r.purchase_price_egp) ?? null,
        supplier_order_no: r.supplier_order_no.trim() || null,
        top_number: num(r.top_number) ?? null,
        width_cm: num(r.width_cm_roll) ?? null,
        grade_id: r.grade_id ?? null,
        composition_id: r.composition_id ?? null,
        brand_id: r.brand_id ?? null,
      });
    }
    return { fabric: { id: pickedFabricId }, rolls: rollEntries, warehouse: 'shop' };
  }

  function onSubmit() {
    setErrorMsg(null);
    const body = buildPayload();
    if (!body) return;
    create.mutate(body);
  }

  function startFresh() {
    setPickedFabricId(null);
    setRows([blankRow()]);
    setLastBatch(null);
    setErrorMsg(null);
    setLabelPrint({ open: false, format: 'thermal', perPage: '24' });
  }

  function handleCopyLabelFromFirst() {
    if (rows.length < 2) return;
    setRows((rs) => rs.map((r, i) => (i === 0 ? r : copyLabelFields(rs[0], r))));
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4" dir="rtl">
      <PageHeader title={ar.addTop.navTitle} description={ar.hubs.itemsAddTopDesc} />

      {lastBatch && (
        <Card className="border-success/40 bg-success-subtle">
          <CardHeader>
            <CardTitle className="text-success-foreground">
              {ar.addTop.successPrefix} {lastBatch.rolls.length} {ar.addTop.successSuffix}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-success-foreground/80">{ar.addTop.previewHint}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lastBatch.rolls.map((r, i) => (
                <div
                  key={r.id}
                  className="border border-border-subtle rounded-md p-3 bg-surface-elevated space-y-2"
                >
                  <div className="flex items-baseline justify-between text-sm">
                    <div>
                      <span className="text-foreground-muted">{ar.addTop.rollIndexPrefix} </span>
                      <span className="font-medium text-foreground tabular-num">{i + 1}</span>
                    </div>
                    <div className="text-xs text-foreground-muted tabular-num" dir="ltr">
                      {Number(r.weight_kg).toFixed(3)} kg
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="font-medium text-foreground">{r.fabric_name_ar}</div>
                    <div className="text-foreground-muted">
                      {r.color_name_ar} ({r.color_code})
                    </div>
                  </div>
                  <div className="flex justify-center pt-1">
                    <Code128 value={r.internal_barcode} height={48} />
                  </div>
                </div>
              ))}
            </div>

            {/* Bulk print actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openBatchPdf(lastBatch.rolls.map((r) => r.id))}
              >
                {ar.addTop.printAllBarcodes}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLabelPrint((s) => ({ ...s, open: !s.open }))}
              >
                {ar.addTop.printSupplierLabels}
              </Button>
              <Button size="sm" variant="outline" onClick={startFresh}>
                {ar.addTop.addAnotherFabric}
              </Button>
            </div>

            {/* Supplier label format chooser */}
            {labelPrint.open && (
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-md border border-border-subtle bg-surface-elevated">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={labelPrint.format === 'thermal' ? 'default' : 'outline'}
                    onClick={() => setLabelPrint((s) => ({ ...s, format: 'thermal' }))}
                  >
                    {ar.addTop.printFormatThermal}
                  </Button>
                  <Button
                    size="sm"
                    variant={labelPrint.format === 'a4' ? 'default' : 'outline'}
                    onClick={() => setLabelPrint((s) => ({ ...s, format: 'a4' }))}
                  >
                    {ar.addTop.printFormatA4}
                  </Button>
                </div>
                {labelPrint.format === 'a4' && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">{ar.addTop.perPageLabel}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={labelPrint.perPage}
                      onChange={(e) => setLabelPrint((s) => ({ ...s, perPage: e.target.value }))}
                      dir="ltr"
                      className="h-9 w-20"
                      min={1}
                      max={100}
                    />
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={() => openSupplierLabelsPdf(lastBatch.rolls.map((r) => r.id))}
                  disabled={labelPrinting}
                >
                  {labelPrinting ? ar.loading : ar.labels.print}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <FabricCreateDialog
        open={fabricDialogOpen}
        onOpenChange={setFabricDialogOpen}
        onCreated={(fabric) => setPickedFabricId(fabric.id)}
      />

      <ColorCreateDialog
        open={colorDialogForIdx !== null}
        onOpenChange={(v) => { if (!v) setColorDialogForIdx(null); }}
        onCreated={(color) => {
          if (colorDialogForIdx !== null) {
            setRows((rs) =>
              rs.map((r, i) => (i === colorDialogForIdx ? { ...r, pickedColorId: color.id } : r)),
            );
            setColorDialogForIdx(null);
          }
        }}
      />

      {/* Section 1 — Fabric */}
      <Card>
        <CardHeader>
          <CardTitle>{ar.addTop.fabricSection}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>{ar.addTop.fabricPick}</Label>
            <div className="flex gap-2">
              <select
                className="flex-1 h-11 md:h-10 rounded border border-border bg-canvas px-3 text-sm"
                value={pickedFabricId === null ? '' : String(pickedFabricId)}
                onChange={(e) => setPickedFabricId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— اختر خامة —</option>
                {fabricsQ.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name_ar} ({f.code})
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 md:h-10 w-10 shrink-0"
                onClick={() => setFabricDialogOpen(true)}
                title="إضافة خامة جديدة"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — Toob rows */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{ar.addTop.rollsSection}</CardTitle>
          {rows.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyLabelFromFirst}
              className="text-xs"
            >
              {ar.addTop.copyLabelFromFirst}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row, idx) => {
            return (
              <div
                key={row.uid}
                className="border border-border rounded-md p-3 space-y-3 bg-canvas"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {ar.addTop.rollIndexPrefix} {idx + 1}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRows((rs) => [
                          ...rs.slice(0, idx + 1),
                          blankRow({ pickedColorId: row.pickedColorId }),
                          ...rs.slice(idx + 1),
                        ])
                      }
                    >
                      + {ar.addTop.duplicate}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}
                      disabled={rows.length === 1}
                    >
                      {ar.addTop.removeRow}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{ar.addTop.color}</Label>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 h-11 md:h-10 rounded border border-border bg-canvas px-3 text-sm"
                        value={row.pickedColorId === null ? '' : String(row.pickedColorId)}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx
                                ? { ...r, pickedColorId: e.target.value ? Number(e.target.value) : null }
                                : r,
                            ),
                          )
                        }
                      >
                        <option value="">— اختر لوناً —</option>
                        {colorsQ.data?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name_ar} ({c.code})
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 md:h-10 w-10 shrink-0"
                        onClick={() => setColorDialogForIdx(idx)}
                        title="إضافة لون جديد"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>
                      {ar.addTop.weightKg}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({ar.addTop.weightHint})
                      </span>
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      value={row.weight_kg}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((r, i) => (i === idx ? { ...r, weight_kg: e.target.value } : r)),
                        )
                      }
                      dir="ltr"
                      className="h-11 md:h-10"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>{ar.addTop.sellingPricePerKg}</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={row.selling_price_egp}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((r, i) =>
                            i === idx ? { ...r, selling_price_egp: e.target.value } : r,
                          ),
                        )
                      }
                      dir="ltr"
                      placeholder={ar.addTop.priceFallbackHint}
                      className="h-11 md:h-10"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id={`set-default-${row.uid}`}
                      checked={row.set_default_price}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((r, i) =>
                            i === idx ? { ...r, set_default_price: e.target.checked } : r,
                          ),
                        )
                      }
                    />
                    <label htmlFor={`set-default-${row.uid}`} className="text-sm">
                      {ar.addTop.setAsDefaultPrice}
                    </label>
                  </div>
                </div>

                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground py-1">
                    {ar.addTop.optionalFields}
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    {/* Existing optional fields */}
                    <div className="space-y-1">
                      <Label>{ar.addTop.rollSrNo}</Label>
                      <Input
                        value={row.roll_sr_no}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx ? { ...r, roll_sr_no: e.target.value } : r,
                            ),
                          )
                        }
                        dir="ltr"
                        className="h-11 md:h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{ar.addTop.orderNo}</Label>
                      <Input
                        value={row.order_no}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) => (i === idx ? { ...r, order_no: e.target.value } : r)),
                          )
                        }
                        dir="ltr"
                        className="h-11 md:h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{ar.addTop.purchasePrice}</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={row.purchase_price_egp}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx ? { ...r, purchase_price_egp: e.target.value } : r,
                            ),
                          )
                        }
                        dir="ltr"
                        className="h-11 md:h-10"
                      />
                    </div>

                    {/* Label fields — Phase 5 */}
                    <div className="col-span-full pt-1 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">بيانات ملصق المورد</p>
                    </div>

                    <div className="space-y-1">
                      <Label>{ar.addTop.supplierOrderNo}</Label>
                      <Input
                        value={row.supplier_order_no}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx ? { ...r, supplier_order_no: e.target.value } : r,
                            ),
                          )
                        }
                        dir="ltr"
                        className="h-11 md:h-10"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>{ar.addTop.topNumber}</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={row.top_number}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx ? { ...r, top_number: e.target.value } : r,
                            ),
                          )
                        }
                        dir="ltr"
                        className="h-11 md:h-10"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>{ar.addTop.widthCmRoll}</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={row.width_cm_roll}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx ? { ...r, width_cm_roll: e.target.value } : r,
                            ),
                          )
                        }
                        dir="ltr"
                        className="h-11 md:h-10"
                        placeholder="150"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>{ar.addTop.brand}</Label>
                      <select
                        className="w-full h-11 md:h-10 rounded border border-border bg-canvas px-3 text-sm"
                        value={row.brand_id === null ? '' : String(row.brand_id)}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx
                                ? { ...r, brand_id: e.target.value ? Number(e.target.value) : null }
                                : r,
                            ),
                          )
                        }
                      >
                        <option value="">—</option>
                        {brandsQ.data?.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.arabic_name}
                            {b.product_line ? ` — ${b.product_line}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label>{ar.addTop.gradeCode}</Label>
                      <select
                        className="w-full h-11 md:h-10 rounded border border-border bg-canvas px-3 text-sm"
                        value={row.grade_id === null ? '' : String(row.grade_id)}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx
                                ? { ...r, grade_id: e.target.value ? Number(e.target.value) : null }
                                : r,
                            ),
                          )
                        }
                      >
                        <option value="">—</option>
                        {gradesQ.data?.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.arabic_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label>{ar.addTop.compositionCode}</Label>
                      <select
                        className="w-full h-11 md:h-10 rounded border border-border bg-canvas px-3 text-sm"
                        value={row.composition_id === null ? '' : String(row.composition_id)}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx
                                ? {
                                    ...r,
                                    composition_id: e.target.value ? Number(e.target.value) : null,
                                  }
                                : r,
                            ),
                          )
                        }
                      >
                        <option value="">—</option>
                        {compositionsQ.data?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.arabic_name}
                            {c.description ? ` (${c.description})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </details>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRows((rs) => [...rs, blankRow()])}
            >
              + {ar.addTop.addRoll}
            </Button>
            <div className="text-sm text-muted-foreground">
              {ar.addTop.totalCount}: <span className="font-mono">{rows.length}</span>
              {' · '}
              {ar.addTop.totalWeight}:{' '}
              <span className="font-mono" dir="ltr">
                {totalWeight.toFixed(3)} kg
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {errorMsg && (
        <div role="alert" className="p-3 rounded-md border border-danger/30 bg-danger-subtle text-sm text-danger-foreground transition-opacity duration-75 ease-standard">
          {errorMsg}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onSubmit} disabled={create.isPending} size="lg" className="h-12">
          {create.isPending ? ar.loading : ar.addTop.saveAndPrint}
        </Button>
      </div>
    </div>
  );
}
