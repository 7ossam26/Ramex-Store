import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2, X } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { extractApiError } from '@/lib/api-error';
import { itemsApi } from '@/lib/items-api';
import type {
  Color,
  CreateFabricInput,
  CreateTopBatchResult,
  FabricFull,
  FabricUnit,
  Lot,
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

// ---------- helpers ----------

function uid() {
  return Math.random().toString(36).slice(2);
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

// ---------- types ----------

type RollErrors = {
  color?: string;
  width_cm?: string;
  weight_kg?: string;
  length_m?: string;
};

type RollRowState = {
  uid: string;
  colorId: number | null;
  width_cm: string;
  weight_kg: string;
  length_m: string;
  lot_id: number | null;
  selected: boolean;
  errors: RollErrors;
};

type GroupState = {
  uid: string;
  fabricId: number | null;
  rows: RollRowState[];
};

function blankRow(opts?: {
  colorId?: number | null;
  width_cm?: string;
}): RollRowState {
  return {
    uid: uid(),
    colorId: opts?.colorId ?? null,
    width_cm: opts?.width_cm ?? '',
    weight_kg: '',
    length_m: '',
    lot_id: null,
    selected: false,
    errors: {},
  };
}

function blankGroup(): GroupState {
  return { uid: uid(), fabricId: null, rows: [blankRow()] };
}

function validateRow(row: RollRowState, isMeter: boolean): RollErrors {
  const errors: RollErrors = {};
  if (!row.colorId) errors.color = ar.addTop.errors.colorRequired;
  const w = Number(row.width_cm);
  if (!row.width_cm || !Number.isFinite(w) || w <= 0)
    errors.width_cm = ar.addTop.errors.widthCmRequired;
  const wt = Number(row.weight_kg);
  if (!row.weight_kg || !Number.isFinite(wt) || wt <= 0)
    errors.weight_kg = ar.addTop.errors.weightRequired;
  if (isMeter) {
    const l = Number(row.length_m);
    if (!row.length_m || !Number.isFinite(l) || l <= 0)
      errors.length_m = ar.addTop.errors.lengthMRequired;
  }
  return errors;
}

// ---------- FabricCreateDialog ----------

type CompositionRow = { material: string; percent: string };
type FabricDraftState = {
  name_ar: string;
  width_cm: string;
  composition: CompositionRow[];
  notes: string;
  unit: FabricUnit;
};

const blankFabricDraft = (): FabricDraftState => ({
  name_ar: '',
  width_cm: '',
  composition: [{ material: '', percent: '100' }],
  notes: '',
  unit: 'kg',
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
      qc.invalidateQueries({ queryKey: ['fabrics-full'] });
      onCreated(fabric);
      onOpenChange(false);
      setDraft(blankFabricDraft());
      setErr(null);
    },
    onError: (e: unknown) => {
      setErr(extractApiError(e));
    },
  });

  function handleSubmit() {
    setErr(null);
    const composition = draft.composition
      .filter((c) => c.material.trim() && c.percent.trim())
      .map((c) => ({ material: c.material.trim(), percent: Number(c.percent) }));
    if (!draft.name_ar.trim()) { setErr(ar.addTop.errors.fabricFieldsRequired); return; }
    const width_cm = Number(draft.width_cm);
    if (!width_cm || width_cm <= 0) { setErr(ar.addTop.errors.widthRequired); return; }
    if (composition.length === 0) { setErr(ar.addTop.errors.compositionRequired); return; }
    const sum = composition.reduce((s, c) => s + c.percent, 0);
    if (Math.abs(sum - 100) > 0.01) { setErr(ar.addTop.errors.compositionMustSum100); return; }
    mut.mutate({
      name_ar: draft.name_ar.trim(),
      width_cm,
      grade: 'A',
      composition,
      notes: draft.notes.trim() || null,
      unit: draft.unit,
      supplier_code: null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{ar.fabrics.createTitle}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>{ar.addTop.fabricNameAr}</Label>
              <Input value={draft.name_ar} onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })} placeholder="قطن مصري سادة 150سم" />
            </div>
            <div className="space-y-1">
              <Label>{ar.addTop.widthCm}</Label>
              <Input type="number" inputMode="numeric" step="1" value={draft.width_cm} onChange={(e) => setDraft({ ...draft, width_cm: e.target.value })} dir="ltr" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{ar.fabrics.unit}</Label>
              <div className="inline-flex rounded border border-border bg-canvas p-0.5 h-10" role="radiogroup">
                {(['kg', 'meter'] as FabricUnit[]).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={draft.unit === u}
                    onClick={() => setDraft({ ...draft, unit: u })}
                    className={'cursor-pointer px-4 rounded-sm text-sm transition-colors ' + (draft.unit === u ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground')}>
                    {u === 'kg' ? ar.fabrics.unitKg : ar.fabrics.unitMeter}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label>{ar.addTop.composition}</Label>
            <div className="space-y-2">
              {draft.composition.map((c, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_auto] gap-2">
                  <Input value={c.material} onChange={(e) => { const next = [...draft.composition]; next[idx] = { ...c, material: e.target.value }; setDraft({ ...draft, composition: next }); }} placeholder={ar.addTop.material} />
                  <div className="flex items-center gap-1">
                    <Input type="number" inputMode="numeric" step="1" value={c.percent} onChange={(e) => {
                      const next = [...draft.composition];
                      next[idx] = { ...c, percent: e.target.value };
                      if (idx + 1 < next.length) {
                        const sumExceptNext = next.reduce((s, row, i) => i !== idx + 1 ? s + (Number(row.percent) || 0) : s, 0);
                        next[idx + 1] = { ...next[idx + 1], percent: String(Math.max(0, 100 - sumExceptNext)) };
                      }
                      setDraft({ ...draft, composition: next });
                    }} dir="ltr" />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...draft, composition: draft.composition.filter((_, i) => i !== idx) })} disabled={draft.composition.length === 1}>×</Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const used = draft.composition.reduce((s, c) => s + (Number(c.percent) || 0), 0);
                const remaining = Math.max(0, 100 - used);
                setDraft({ ...draft, composition: [...draft.composition, { material: '', percent: String(remaining) }] });
              }}>
                + {ar.addTop.addMaterial}
              </Button>
            </div>
          </div>
          {err && <p className="text-sm text-danger-foreground">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{ar.common.cancel}</Button>
            <Button type="button" onClick={handleSubmit} disabled={mut.isPending}>{mut.isPending ? ar.loading : ar.common.save}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- ColorCreateDialog ----------

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
      setErr(extractApiError(e));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>إضافة لون جديد</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>{ar.addTop.newColorNameAr}</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="أحمر" autoFocus />
          </div>
          {err && <p className="text-sm text-danger-foreground">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{ar.common.cancel}</Button>
            <Button type="button" onClick={() => { setErr(null); if (!nameAr.trim()) { setErr(ar.addTop.errors.colorFieldsRequired); return; } mut.mutate({ name_ar: nameAr.trim() }); }} disabled={mut.isPending}>
              {mut.isPending ? ar.loading : ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- LotCell ----------

function LotCell({
  fabricId,
  colorId,
  lot_id,
  lots,
  onChangeLot,
  onLotCreated,
}: {
  fabricId: number;
  colorId: number | null;
  lot_id: number | null;
  lots: Lot[];
  onChangeLot: (id: number | null) => void;
  onLotCreated: (lot: Lot) => void;
}) {
  const qc = useQueryClient();
  const createMut = useMutation({
    mutationFn: () => inventoryApi.createLot({ fabric_id: fabricId, color_id: colorId! }),
    onSuccess: (lot) => {
      qc.setQueryData<Lot[]>(['lots', fabricId], (old) => [...(old ?? []), lot]);
      onLotCreated(lot);
      onChangeLot(lot.id);
    },
  });

  const filtered = colorId ? lots.filter((l) => l.color_id === colorId) : [];
  const disabled = !colorId;

  return (
    <div className="flex items-center gap-1 min-w-0">
      <select
        className="flex-1 h-7 rounded border border-border bg-canvas px-1.5 text-xs min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
        value={lot_id === null ? '' : String(lot_id)}
        onChange={(e) => onChangeLot(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
      >
        <option value="">{disabled ? ar.lots.selectFabricColorFirst : ar.addTop.lotNone}</option>
        {filtered.map((l) => (
          <option key={l.id} value={l.id}>
            {l.lot_no}
          </option>
        ))}
      </select>
      <button
        type="button"
        title={ar.lots.createNew}
        disabled={disabled || createMut.isPending}
        onClick={() => createMut.mutate()}
        className="shrink-0 h-7 px-1.5 text-xs rounded border border-border bg-canvas hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        {createMut.isPending ? ar.addTop.lotCreating : ar.addTop.lotNewInline}
      </button>
    </div>
  );
}

// ---------- FabricSubGroup ----------

function FabricSubGroup({
  group,
  fabricsFull,
  colors,
  onFabricChange,
  onRemoveGroup,
  onRowChange,
  onRemoveRow,
  onDuplicateRow,
  onAddRows,
  onOpenColorDialog,
  onOpenFabricDialog,
  submitted,
}: {
  group: GroupState;
  fabricsFull: FabricFull[];
  colors: Color[];
  onFabricChange: (fabricId: number | null) => void;
  onRemoveGroup: () => void;
  onRowChange: (rowUid: string, changes: Partial<RollRowState>) => void;
  onRemoveRow: (rowUid: string) => void;
  onDuplicateRow: (rowUid: string) => void;
  onAddRows: (count: number) => void;
  onOpenColorDialog: (rowUid: string) => void;
  onOpenFabricDialog: () => void;
  submitted: boolean;
}) {
  const qc = useQueryClient();

  const lotsQ = useQuery({
    queryKey: ['lots', group.fabricId],
    queryFn: () => inventoryApi.listLots({ fabric_id: group.fabricId! }),
    enabled: !!group.fabricId,
    staleTime: 60_000,
  });

  const fabric = fabricsFull.find((f) => f.id === group.fabricId) ?? null;
  const isMeter = fabric?.unit === 'meter';

  const selectedCount = group.rows.filter((r) => r.selected).length;
  const [bulkColorId, setBulkColorId] = useState<number | null>(null);

  function applyBulkColor() {
    if (!bulkColorId) return;
    group.rows.forEach((r) => {
      if (r.selected) {
        onRowChange(r.uid, { colorId: bulkColorId, lot_id: null, selected: false });
      }
    });
    setBulkColorId(null);
  }

  function handleLotCreated(rowUid: string, lot: Lot) {
    qc.setQueryData<Lot[]>(['lots', group.fabricId], (old) =>
      (old ?? []).some((l) => l.id === lot.id) ? old ?? [] : [...(old ?? []), lot],
    );
    onRowChange(rowUid, { lot_id: lot.id });
  }

  const lots = lotsQ.data ?? [];

  // column count: checkbox + color + width + weight + (length?) + lot + actions
  const colCount = 6 + (isMeter ? 1 : 0) + 1; // +1 for checkbox

  return (
    <Card className="overflow-hidden">
      {/* Sub-group header */}
      <CardHeader className="py-2 px-3 flex-row items-center gap-2 space-y-0 bg-surface-elevated border-b border-border-subtle">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <select
            className="flex-1 h-9 rounded border border-border bg-canvas px-2 text-sm font-medium"
            value={group.fabricId === null ? '' : String(group.fabricId)}
            onChange={(e) => {
              const newId = e.target.value ? Number(e.target.value) : null;
              onFabricChange(newId);
            }}
          >
            <option value="">{ar.addTop.groupFabricPlaceholder}</option>
            {fabricsFull.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name_ar} ({f.code}) — {f.unit === 'meter' ? ar.addTop.meterUnit : ar.addTop.kgUnit}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" className="h-9 w-9 shrink-0 p-0" title="إضافة خامة جديدة" onClick={onOpenFabricDialog}>
            <Plus className="size-4" />
          </Button>
          {fabric && (
            <span className="text-xs text-foreground-muted whitespace-nowrap">
              {isMeter ? ar.addTop.meterUnit : ar.addTop.kgUnit}
            </span>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-foreground-muted hover:text-danger-foreground shrink-0" title={ar.addTop.removeFabricGroup} onClick={onRemoveGroup}>
          <X className="size-4" />
        </Button>
      </CardHeader>

      {!group.fabricId && (
        <CardContent className="py-4 text-center text-sm text-foreground-muted">
          {ar.addTop.errors.fabricGroupRequired}
        </CardContent>
      )}

      {group.fabricId && (
        <CardContent className="p-0">
          {/* Bulk color bar */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-accent/20 border-b border-border-subtle" dir="rtl">
              <span className="text-xs font-medium">{selectedCount} {ar.addTop.selectedRows}</span>
              <select
                className="h-7 rounded border border-border bg-canvas px-1.5 text-xs"
                value={bulkColorId === null ? '' : String(bulkColorId)}
                onChange={(e) => setBulkColorId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{ar.addTop.colColor}</option>
                {colors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_ar} ({c.code})</option>
                ))}
              </select>
              <Button type="button" size="sm" className="h-7 text-xs" onClick={applyBulkColor} disabled={!bulkColorId}>
                {ar.addTop.bulkSetColor}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => group.rows.forEach((r) => r.selected && onRowChange(r.uid, { selected: false }))}>
                {ar.common.cancel}
              </Button>
            </div>
          )}

          {/* Compact table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" dir="rtl">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-elevated/50 text-xs text-foreground-muted">
                  <th className="py-1.5 px-2 text-right font-medium w-36 shrink-0">{ar.addTop.colColor}</th>
                  <th className="py-1.5 px-2 text-right font-medium w-20">{ar.addTop.colWidthCm}</th>
                  <th className="py-1.5 px-2 text-right font-medium w-24">{ar.addTop.colWeightKg}</th>
                  {isMeter && <th className="py-1.5 px-2 text-right font-medium w-20">{ar.addTop.colLengthM}</th>}
                  <th className="py-1.5 px-2 text-right font-medium w-40">{ar.addTop.colLot}</th>
                  <th className="py-1.5 px-2 text-center font-medium w-16">—</th>
                  <th className="py-1.5 px-2 text-center font-medium w-6">
                    <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer"
                      checked={group.rows.length > 0 && group.rows.every((r) => r.selected)}
                      onChange={(e) => group.rows.forEach((r) => onRowChange(r.uid, { selected: e.target.checked }))}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, rowIdx) => {
                  const prevRow = group.rows[rowIdx - 1];
                  const hasErrors = submitted && Object.keys(validateRow(row, isMeter)).length > 0;
                  const rowErrors = submitted ? validateRow(row, isMeter) : {};

                  return (
                    <>
                      <tr
                        key={row.uid}
                        className={[
                          'border-b border-border-subtle transition-colors',
                          row.selected ? 'bg-accent/10' : 'hover:bg-surface-elevated/40',
                          hasErrors ? 'bg-danger-subtle/20' : '',
                        ].join(' ')}
                      >
                        {/* Color */}
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <select
                              className={[
                                'flex-1 h-7 rounded border px-1.5 text-xs bg-canvas min-w-0',
                                rowErrors.color ? 'border-danger-foreground' : 'border-border',
                              ].join(' ')}
                              value={row.colorId === null ? '' : String(row.colorId)}
                              onChange={(e) => {
                                const colorId = e.target.value ? Number(e.target.value) : null;
                                onRowChange(row.uid, { colorId, lot_id: null });
                              }}
                            >
                              <option value="">—</option>
                              {colors.map((c) => (
                                <option key={c.id} value={c.id}>{c.name_ar}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              title="إضافة لون جديد"
                              className="h-7 w-7 flex items-center justify-center rounded border border-border bg-canvas hover:bg-accent transition-colors cursor-pointer text-foreground-muted shrink-0"
                              onClick={() => onOpenColorDialog(row.uid)}
                            >
                              <Plus className="size-3" />
                            </button>
                          </div>
                          {rowErrors.color && <p className="text-xs text-danger-foreground mt-0.5">{rowErrors.color}</p>}
                        </td>

                        {/* Width cm */}
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="1"
                            dir="ltr"
                            className={['h-7 text-xs px-2', rowErrors.width_cm ? 'border-danger-foreground ring-1 ring-danger-foreground' : ''].join(' ')}
                            value={row.width_cm}
                            onChange={(e) => onRowChange(row.uid, { width_cm: e.target.value })}
                          />
                          {rowErrors.width_cm && <p className="text-xs text-danger-foreground mt-0.5">{rowErrors.width_cm}</p>}
                        </td>

                        {/* Weight kg */}
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.001"
                            dir="ltr"
                            className={['h-7 text-xs px-2', rowErrors.weight_kg ? 'border-danger-foreground ring-1 ring-danger-foreground' : ''].join(' ')}
                            value={row.weight_kg}
                            placeholder={prevRow?.weight_kg || ar.addTop.weightPlaceholder}
                            onChange={(e) => onRowChange(row.uid, { weight_kg: e.target.value })}
                          />
                          {rowErrors.weight_kg && <p className="text-xs text-danger-foreground mt-0.5">{rowErrors.weight_kg}</p>}
                        </td>

                        {/* Length m — meter-fabric only */}
                        {isMeter && (
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              dir="ltr"
                              className={['h-7 text-xs px-2', rowErrors.length_m ? 'border-danger-foreground ring-1 ring-danger-foreground' : ''].join(' ')}
                              value={row.length_m}
                              onChange={(e) => onRowChange(row.uid, { length_m: e.target.value })}
                            />
                            {rowErrors.length_m && <p className="text-xs text-danger-foreground mt-0.5">{rowErrors.length_m}</p>}
                          </td>
                        )}

                        {/* Lot */}
                        <td className="px-2 py-1">
                          <LotCell
                            fabricId={group.fabricId!}
                            colorId={row.colorId}
                            lot_id={row.lot_id}
                            lots={lots}
                            onChangeLot={(id) => onRowChange(row.uid, { lot_id: id })}
                            onLotCreated={(lot) => handleLotCreated(row.uid, lot)}
                          />
                        </td>

                        {/* Actions */}
                        <td className="px-2 py-1 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              type="button"
                              title={ar.addTop.duplicate}
                              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors cursor-pointer text-foreground-muted"
                              onClick={() => onDuplicateRow(row.uid)}
                            >
                              <Copy className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              title={ar.addTop.removeRow}
                              className="h-7 w-7 flex items-center justify-center rounded hover:bg-danger-subtle transition-colors cursor-pointer text-foreground-muted hover:text-danger-foreground"
                              onClick={() => onRemoveRow(row.uid)}
                              disabled={group.rows.length === 1}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Checkbox */}
                        <td className="px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 cursor-pointer"
                            checked={row.selected}
                            onChange={(e) => onRowChange(row.uid, { selected: e.target.checked })}
                          />
                        </td>
                      </tr>

</>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sub-group footer */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-border-subtle" dir="rtl">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddRows(1)}>
              + {ar.addTop.addRoll}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddRows(5)}>
              {ar.addTop.addRows5}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddRows(10)}>
              {ar.addTop.addRows10}
            </Button>
            <span className="text-xs text-foreground-muted mr-auto">
              {group.rows.length} {ar.addTop.rollIndexPrefix}
              {isMeter && (() => {
                const totalL = group.rows.reduce((s, r) => s + (num(r.length_m) ?? 0), 0);
                return totalL > 0 ? ` · ${totalL.toFixed(2)} م` : '';
              })()}
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------- LabelPrint state ----------

type LabelPrintState = { open: boolean; format: 'thermal' | 'a4'; perPage: string };

// ---------- AddTopPage ----------

export function AddTopPage() {
  const qc = useQueryClient();
  const fabricsFullQ = useQuery({ queryKey: ['fabrics-full'], queryFn: inventoryApi.listFabricsFull });
  const colorsQ = useQuery({ queryKey: ['colors'], queryFn: inventoryApi.listColors });

  const fabricsFull: FabricFull[] = fabricsFullQ.data ?? [];
  const colors: Color[] = colorsQ.data ?? [];

  const [groups, setGroups] = useState<GroupState[]>([blankGroup()]);
  const [fabricDialogOpen, setFabricDialogOpen] = useState(false);
  const [pendingFabricGroupUid, setPendingFabricGroupUid] = useState<string | null>(null);
  const [colorDialogRowKey, setColorDialogRowKey] = useState<{ groupUid: string; rowUid: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<CreateTopBatchResult[]>([]);
  const [labelPrint, setLabelPrint] = useState<LabelPrintState>({ open: false, format: 'thermal', perPage: '24' });
  const [labelPrinting, setLabelPrinting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const submitMut = useMutation({
    mutationFn: async (groups: GroupState[]) => {
      const out: CreateTopBatchResult[] = [];
      for (const g of groups) {
        if (!g.fabricId) continue;
        const fabric = fabricsFull.find((f) => f.id === g.fabricId)!;
        const isMeter = fabric.unit === 'meter';
        const rolls = g.rows.map((r) => ({
          color: { id: r.colorId! },
          weight_kg: Number(r.weight_kg),
          width_cm: Number(r.width_cm),
          ...(isMeter ? { length_m: Number(r.length_m) } : {}),
          lot_id: r.lot_id ?? null,
        }));
        const result = await inventoryApi.createTopBatch({ fabric: { id: g.fabricId }, rolls });
        out.push(result);
      }
      return out;
    },
    onSuccess: (res) => {
      setResults(res);
      setGlobalError(null);
      setSubmitted(false);
      setGroups([blankGroup()]);
      qc.invalidateQueries({ queryKey: ['fabrics-full'] });
      qc.invalidateQueries({ queryKey: ['colors'] });
      qc.invalidateQueries({ queryKey: ['rolls-search'] });
    },
    onError: (e: unknown) => {
      setGlobalError(extractApiError(e));
    },
  });

  // ----- state updaters -----

  function updateGroup(groupUid: string, updater: (g: GroupState) => GroupState) {
    setGroups((gs) => gs.map((g) => (g.uid === groupUid ? updater(g) : g)));
  }

  function updateRow(groupUid: string, rowUid: string, changes: Partial<RollRowState>) {
    updateGroup(groupUid, (g) => ({
      ...g,
      rows: g.rows.map((r) => (r.uid === rowUid ? { ...r, ...changes } : r)),
    }));
  }

  function handleFabricChange(groupUid: string, fabricId: number | null) {
    const fabric = fabricsFull.find((f) => f.id === fabricId);
    const defaultWidth = fabric ? String(Math.round(Number(fabric.width_cm))) : '';
    updateGroup(groupUid, (g) => ({
      ...g,
      fabricId,
      rows: g.rows.map((r) => ({
        ...r,
        width_cm: defaultWidth,
        lot_id: null, // lot scope changed
        length_m: '',
      })),
    }));
  }

  function handleRemoveGroup(groupUid: string) {
    setGroups((gs) => (gs.length === 1 ? gs : gs.filter((g) => g.uid !== groupUid)));
  }

  function handleAddGroup() {
    setGroups((gs) => [...gs, blankGroup()]);
  }

  function handleRemoveRow(groupUid: string, rowUid: string) {
    updateGroup(groupUid, (g) => ({
      ...g,
      rows: g.rows.length === 1 ? g.rows : g.rows.filter((r) => r.uid !== rowUid),
    }));
  }

  function handleDuplicateRow(groupUid: string, rowUid: string) {
    updateGroup(groupUid, (g) => {
      const idx = g.rows.findIndex((r) => r.uid === rowUid);
      if (idx === -1) return g;
      const src = g.rows[idx];
      const newRow = blankRow({ colorId: src.colorId, width_cm: src.width_cm });
      // weight starts empty per spec
      const next = [...g.rows];
      next.splice(idx + 1, 0, newRow);
      return { ...g, rows: next };
    });
  }

  function handleAddRows(groupUid: string, count: number) {
    updateGroup(groupUid, (g) => {
      const fabric = fabricsFull.find((f) => f.id === g.fabricId);
      const defaultWidth = fabric ? String(Math.round(Number(fabric.width_cm))) : '';
      const lastRow = g.rows[g.rows.length - 1];
      const newRows = Array.from({ length: count }, () =>
        blankRow({ colorId: lastRow?.colorId ?? null, width_cm: defaultWidth }),
      );
      return { ...g, rows: [...g.rows, ...newRows] };
    });
  }

  function handleOpenColorDialog(groupUid: string, rowUid: string) {
    setColorDialogRowKey({ groupUid, rowUid });
  }

  function handleOpenFabricDialog(groupUid: string) {
    setPendingFabricGroupUid(groupUid);
    setFabricDialogOpen(true);
  }

  // ----- validation & submit -----

  function validateAll(): boolean {
    for (const g of groups) {
      if (!g.fabricId) return false;
      const fabric = fabricsFull.find((f) => f.id === g.fabricId);
      const isMeter = fabric?.unit === 'meter';
      for (const r of g.rows) {
        if (Object.keys(validateRow(r, isMeter ?? false)).length > 0) return false;
      }
    }
    return true;
  }

  function handleSubmit() {
    setSubmitted(true);
    setGlobalError(null);
    if (!validateAll()) {
      setGlobalError('يوجد أخطاء في البيانات — راجع الحقول المحددة بالأحمر');
      return;
    }
    submitMut.mutate(groups);
  }

  // ----- totals -----

  const totals = useMemo(() => {
    let rolls = 0;
    let weight = 0;
    let length = 0;
    let hasMeter = false;
    for (const g of groups) {
      const fabric = fabricsFull.find((f) => f.id === g.fabricId);
      const isMeter = fabric?.unit === 'meter';
      if (isMeter) hasMeter = true;
      for (const r of g.rows) {
        rolls++;
        weight += num(r.weight_kg) ?? 0;
        if (isMeter) length += num(r.length_m) ?? 0;
      }
    }
    return { rolls, weight, length, hasMeter };
  }, [groups, fabricsFull]);

  // ----- PDF helpers -----

  const allResultRollIds = results.flatMap((r) => r.rolls.map((roll) => roll.id));

  async function openSupplierLabelsPdf(rollIds: number[]) {
    setLabelPrinting(true);
    try {
      const blob = await itemsApi.batchFabricLabels(rollIds, labelPrint.format, num(labelPrint.perPage) ?? 24);
      openPdfBlob(blob);
    } finally {
      setLabelPrinting(false);
    }
  }

  // ----- Success view -----

  if (results.length > 0) {
    const allRolls = results.flatMap((r) => r.rolls);
    return (
      <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
        <PageHeader title={ar.addTop.navTitle} description={ar.hubs.itemsAddTopDesc} backTo="/items" />
        <Card className="border-success/40 bg-success-subtle">
          <CardHeader>
            <CardTitle className="text-success-foreground">
              {ar.addTop.successPrefix} {allRolls.length} {ar.addTop.successSuffix}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-success-foreground/80">{ar.addTop.previewHint}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {allRolls.map((r, i) => (
                <div key={r.id} className="border border-border-subtle rounded-md p-3 bg-surface-elevated space-y-2">
                  <div className="flex items-baseline justify-between text-xs text-foreground-muted">
                    <span>{ar.addTop.rollIndexPrefix} {i + 1}</span>
                    <span dir="ltr" className="tabular-num">{Number(r.weight_kg).toFixed(3)} kg</span>
                  </div>
                  <div className="text-sm">
                    <div className="font-medium text-foreground">{r.fabric_name_ar}</div>
                    <div className="text-foreground-muted text-xs">{r.color_name_ar} ({r.color_code})</div>
                    {r.lot_no && <div className="text-xs text-foreground-muted">{ar.lots.label}: {r.lot_no}</div>}
                    {r.length_m && <div className="text-xs text-foreground-muted" dir="ltr">{Number(r.length_m).toFixed(2)} م</div>}
                  </div>
                  <div className="flex justify-center pt-1">
                    <Code128 value={r.internal_barcode} height={40} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => itemsApi.batchLabelsPdf(allResultRollIds).then((b) => openPdfBlob(b))}>
                {ar.addTop.printAllBarcodes}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLabelPrint((s) => ({ ...s, open: !s.open }))}>
                {ar.addTop.printSupplierLabels}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setResults([])}>
                {ar.addTop.addFabricGroup}
              </Button>
            </div>
            {labelPrint.open && (
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-md border border-border-subtle bg-surface-elevated">
                <div className="flex gap-2">
                  {(['thermal', 'a4'] as const).map((fmt) => (
                    <Button key={fmt} size="sm" variant={labelPrint.format === fmt ? 'default' : 'outline'} onClick={() => setLabelPrint((s) => ({ ...s, format: fmt }))}>
                      {fmt === 'thermal' ? ar.addTop.printFormatThermal : ar.addTop.printFormatA4}
                    </Button>
                  ))}
                </div>
                {labelPrint.format === 'a4' && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">{ar.addTop.perPageLabel}</Label>
                    <Input type="number" inputMode="numeric" value={labelPrint.perPage} onChange={(e) => setLabelPrint((s) => ({ ...s, perPage: e.target.value }))} dir="ltr" className="h-9 w-20" min={1} max={100} />
                  </div>
                )}
                <Button size="sm" onClick={() => openSupplierLabelsPdf(allResultRollIds)} disabled={labelPrinting}>
                  {labelPrinting ? ar.loading : ar.labels.print}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----- Main form -----

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <PageHeader title={ar.addTop.navTitle} description={ar.hubs.itemsAddTopDesc} backTo="/items" />
        <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
          {ar.addTop.factoryBadge}
        </span>
      </div>

      {/* Fabric dialogs */}
      <FabricCreateDialog
        open={fabricDialogOpen}
        onOpenChange={setFabricDialogOpen}
        onCreated={(fabric) => {
          if (pendingFabricGroupUid) {
            handleFabricChange(pendingFabricGroupUid, fabric.id);
            setPendingFabricGroupUid(null);
          }
        }}
      />

      <ColorCreateDialog
        open={colorDialogRowKey !== null}
        onOpenChange={(v) => { if (!v) setColorDialogRowKey(null); }}
        onCreated={(color) => {
          if (colorDialogRowKey) {
            updateRow(colorDialogRowKey.groupUid, colorDialogRowKey.rowUid, { colorId: color.id, lot_id: null });
            setColorDialogRowKey(null);
          }
        }}
      />

      {/* Sub-groups */}
      {groups.map((group) => (
        <FabricSubGroup
          key={group.uid}
          group={group}
          fabricsFull={fabricsFull}
          colors={colors}
          onFabricChange={(fabricId) => handleFabricChange(group.uid, fabricId)}
          onRemoveGroup={() => handleRemoveGroup(group.uid)}
          onRowChange={(rowUid, changes) => updateRow(group.uid, rowUid, changes)}
          onRemoveRow={(rowUid) => handleRemoveRow(group.uid, rowUid)}
          onDuplicateRow={(rowUid) => handleDuplicateRow(group.uid, rowUid)}
          onAddRows={(count) => handleAddRows(group.uid, count)}
          onOpenColorDialog={(rowUid) => handleOpenColorDialog(group.uid, rowUid)}
          onOpenFabricDialog={() => handleOpenFabricDialog(group.uid)}
          submitted={submitted}
        />
      ))}

      {/* Add fabric group */}
      <Button type="button" variant="outline" className="w-full h-10 border-dashed" onClick={handleAddGroup}>
        {ar.addTop.addFabricGroup}
      </Button>

      {/* Global error */}
      {globalError && (
        <div role="alert" className="p-3 rounded-md border border-danger/30 bg-danger-subtle text-sm text-danger-foreground">
          {globalError}
        </div>
      )}

      {/* Footer totals + submit */}
      <div className="sticky bottom-0 bg-canvas border-t border-border-subtle py-3 px-4 flex items-center gap-4 -mx-4 sm:-mx-6" dir="rtl">
        <div className="flex items-center gap-4 text-sm text-foreground-muted flex-1 flex-wrap">
          <span>
            {ar.addTop.totalCount}: <span className="font-mono font-medium text-foreground">{totals.rolls}</span>
          </span>
          <span>
            {ar.addTop.totalWeight}: <span className="font-mono font-medium text-foreground" dir="ltr">{totals.weight.toFixed(3)} kg</span>
          </span>
          {totals.hasMeter && (
            <span>
              {ar.addTop.totalLength}: <span className="font-mono font-medium text-foreground" dir="ltr">{totals.length.toFixed(2)} م</span>
            </span>
          )}
        </div>
        <Button
          onClick={handleSubmit}
          disabled={submitMut.isPending}
          size="lg"
          className="h-10 shrink-0"
        >
          {submitMut.isPending ? ar.loading : ar.addTop.saveAndPrint}
        </Button>
      </div>
    </div>
  );
}
