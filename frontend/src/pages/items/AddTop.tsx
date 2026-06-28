import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MapPin, Plus, Trash2, X } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { extractApiError } from '@/lib/api-error';
import { itemsApi } from '@/lib/items-api';
import type {
  Color,
  CreateFabricInput,
  CreateTopBatchResult,
  FabricCategory,
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
import { PageShell } from '@/components/Layout/PageShell';
import { openPdfBlob } from '@/lib/pdf';

// ---------- helpers ----------

function uid() {
  return Math.random().toString(36).slice(2);
}

function num(s: string): number | undefined {
  if (s === '' || s == null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
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
  lot_no: string | null;
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
    lot_no: null,
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
  if (!isMeter) {
    const wt = Number(row.weight_kg);
    if (!row.weight_kg || !Number.isFinite(wt) || wt <= 0)
      errors.weight_kg = ar.addTop.errors.weightRequired;
  }
  if (isMeter) {
    const l = Number(row.length_m);
    if (!row.length_m || !Number.isFinite(l) || l <= 0)
      errors.length_m = ar.addTop.errors.lengthMRequired;
  }
  return errors;
}

// ---------- FabricCreateDialog ----------

type FabricDraftState = {
  name_ar: string;
  width_cm: string;
  gsm: string;
  mad_m: string;
  notes: string;
  unit: FabricUnit;
  category: FabricCategory;
};

const blankFabricDraft = (): FabricDraftState => ({
  name_ar: '',
  width_cm: '',
  gsm: '',
  mad_m: '',
  notes: '',
  unit: 'kg',
  category: 'main',
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
    if (!draft.name_ar.trim()) { setErr(ar.addTop.errors.fabricFieldsRequired); return; }
    const width_cm = Number(draft.width_cm);
    if (!width_cm || width_cm <= 0) { setErr(ar.addTop.errors.widthRequired); return; }
    const gsm = draft.gsm !== '' ? Number(draft.gsm) : null;
    const mad_m = draft.mad_m !== '' ? Number(draft.mad_m) : null;
    mut.mutate({
      name_ar: draft.name_ar.trim(),
      width_cm,
      grade: 'A',
      gsm: gsm !== null && gsm > 0 ? gsm : null,
      mad_m: mad_m !== null && mad_m > 0 ? mad_m : null,
      notes: draft.notes.trim() || null,
      unit: draft.unit,
      category: draft.category,
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
            <div className="space-y-1 col-span-2">
              <Label>{ar.fabrics.category}</Label>
              <div className="inline-flex rounded border border-border bg-canvas p-0.5 h-10" role="radiogroup">
                {([['main', ar.fabrics.categoryMain], ['rib', ar.fabrics.categoryRib], ['accessory', ar.fabrics.categoryAccessory]] as [FabricCategory, string][]).map(([cat, label]) => (
                  <button key={cat} type="button" role="radio" aria-checked={draft.category === cat}
                    onClick={() => setDraft({ ...draft, category: cat })}
                    className={'cursor-pointer px-4 rounded-sm text-sm transition-colors ' + (draft.category === cat ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar.fabrics.gsm}</Label>
              <div className="flex items-center gap-1">
                <Input type="number" inputMode="decimal" step="0.01" min="0" dir="ltr" value={draft.gsm} onChange={(e) => setDraft({ ...draft, gsm: e.target.value })} placeholder="—" />
                <span className="text-sm text-muted-foreground shrink-0">{ar.fabrics.gsmUnit}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{ar.fabrics.mad}</Label>
              <div className="flex items-center gap-1">
                <Input type="number" inputMode="decimal" step="0.01" min="0" dir="ltr" value={draft.mad_m} onChange={(e) => setDraft({ ...draft, mad_m: e.target.value })} placeholder="—" />
                <span className="text-sm text-muted-foreground shrink-0">{ar.fabrics.madUnit}</span>
              </div>
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
    <div className="flex items-center gap-1.5 min-w-0">
      <select
        className="flex-1 h-12 rounded border border-border bg-canvas px-3 text-base min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
        className="shrink-0 h-12 px-3 text-sm rounded border border-border bg-canvas hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
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
    onRowChange(rowUid, { lot_id: lot.id, lot_no: lot.lot_no });
  }

  const lots = lotsQ.data ?? [];

  const selectClass =
    'flex h-12 w-full rounded border border-border bg-canvas px-3 py-2 text-base focus-visible:outline-none focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 cursor-pointer appearance-none';

  return (
    <div className="rounded-xl border-2 border-dashed border-border-subtle bg-surface-elevated">
      {/* ── Sticky fabric header ─────────────────────────────────────────── */}
      <div className="sticky top-[52px] md:top-14 z-10 bg-surface-elevated rounded-t-xl border-b border-border-subtle px-5 pt-4 pb-3">
        <div className="flex items-center gap-2" dir="rtl">
          <select
            className={`${selectClass} flex-1 font-medium`}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-12 w-12 shrink-0 p-0"
            title="إضافة خامة جديدة"
            onClick={onOpenFabricDialog}
          >
            <Plus className="size-5" />
          </Button>
          {fabric && (
            <span className="text-sm text-foreground-muted whitespace-nowrap shrink-0 font-medium">
              {isMeter ? ar.addTop.meterUnit : ar.addTop.kgUnit}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-12 w-12 p-0 text-foreground-muted hover:text-danger-foreground shrink-0 [&_svg]:size-5"
            title={ar.addTop.removeFabricGroup}
            onClick={onRemoveGroup}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="p-5 space-y-5">
        {!group.fabricId && (
          <div className="rounded-lg border border-dashed border-border-subtle py-10 text-center text-base text-foreground-muted">
            {ar.addTop.errors.fabricGroupRequired}
          </div>
        )}

        {group.fabricId && (
          <div className="space-y-4">
            {/* Bulk color bar */}
            {selectedCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-accent/20 border border-border-subtle" dir="rtl">
                <span className="text-sm font-semibold">{selectedCount} {ar.addTop.selectedRows}</span>
                <select
                  className="h-11 rounded border border-border bg-canvas px-3 text-base"
                  value={bulkColorId === null ? '' : String(bulkColorId)}
                  onChange={(e) => setBulkColorId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{ar.addTop.colColor}</option>
                  {colors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name_ar} ({c.code})</option>
                  ))}
                </select>
                <Button type="button" className="h-11 text-sm" onClick={applyBulkColor} disabled={!bulkColorId}>
                  {ar.addTop.bulkSetColor}
                </Button>
                <Button type="button" variant="ghost" className="h-11 text-sm" onClick={() => group.rows.forEach((r) => r.selected && onRowChange(r.uid, { selected: false }))}>
                  {ar.common.cancel}
                </Button>
              </div>
            )}

            {/* Roll cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" dir="rtl">
              {group.rows.map((row, rowIdx) => {
                const prevRow = group.rows[rowIdx - 1];
                const hasErrors = submitted && Object.keys(validateRow(row, isMeter)).length > 0;
                const rowErrors = submitted ? validateRow(row, isMeter) : {};

                return (
                  <div
                    key={row.uid}
                    className={[
                      'rounded-lg border bg-canvas p-5 space-y-4',
                      hasErrors
                        ? 'border-danger/40 bg-danger-subtle/10'
                        : row.selected
                          ? 'border-ring/50 bg-accent/5'
                          : 'border-border-subtle',
                    ].join(' ')}
                  >
                    {/* Card header: roll index + controls */}
                    <div className="flex items-center justify-between pb-1 border-b border-border-subtle">
                      <span className="text-base font-bold text-foreground">
                        {ar.addTop.rollIndexPrefix} {rowIdx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer ml-1"
                          checked={row.selected}
                          onChange={(e) => onRowChange(row.uid, { selected: e.target.checked })}
                        />
                        <button
                          type="button"
                          title={ar.addTop.duplicate}
                          className="h-9 w-9 flex items-center justify-center rounded hover:bg-accent transition-colors cursor-pointer text-foreground-muted"
                          onClick={() => onDuplicateRow(row.uid)}
                        >
                          <Copy className="size-4" />
                        </button>
                        <button
                          type="button"
                          title={ar.addTop.removeRow}
                          className="h-9 w-9 flex items-center justify-center rounded hover:bg-danger-subtle transition-colors cursor-pointer text-foreground-muted hover:text-danger-foreground"
                          onClick={() => onRemoveRow(row.uid)}
                          disabled={group.rows.length === 1}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>

                    {/* Color */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold text-foreground">{ar.addTop.colColor}</Label>
                      <div className="flex items-center gap-2">
                        <select
                          className={[
                            'flex-1 h-12 rounded border px-3 text-base bg-canvas min-w-0',
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
                          className="h-12 w-12 flex items-center justify-center rounded border border-border bg-canvas hover:bg-accent transition-colors cursor-pointer text-foreground-muted shrink-0"
                          onClick={() => onOpenColorDialog(row.uid)}
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                      {rowErrors.color && <p className="text-sm text-danger-foreground mt-1">{rowErrors.color}</p>}
                    </div>

                    {/* Width cm */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold text-foreground">{ar.addTop.colWidthCm}</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="1"
                        dir="ltr"
                        className={['h-12 text-base', rowErrors.width_cm ? 'border-danger-foreground ring-1 ring-danger-foreground' : ''].join(' ')}
                        value={row.width_cm}
                        onChange={(e) => onRowChange(row.uid, { width_cm: e.target.value })}
                      />
                      {rowErrors.width_cm && <p className="text-sm text-danger-foreground mt-1">{rowErrors.width_cm}</p>}
                    </div>

                    {/* Weight kg — kg-fabric only */}
                    {!isMeter && (
                      <div className="space-y-2">
                        <Label className="text-base font-semibold text-foreground">{ar.addTop.colWeightKg}</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min="0"
                          dir="ltr"
                          className={['h-12 text-base', rowErrors.weight_kg ? 'border-danger-foreground ring-1 ring-danger-foreground' : ''].join(' ')}
                          value={row.weight_kg}
                          placeholder={prevRow?.weight_kg || ar.addTop.weightPlaceholder}
                          onChange={(e) => {
                            const val = e.target.value.replace(',', '.');
                            onRowChange(row.uid, { weight_kg: val });
                          }}
                        />
                        {rowErrors.weight_kg && <p className="text-sm text-danger-foreground mt-1">{rowErrors.weight_kg}</p>}
                      </div>
                    )}

                    {/* Length m — meter-fabric only */}
                    {isMeter && (
                      <div className="space-y-2">
                        <Label className="text-base font-semibold text-foreground">{ar.addTop.colLengthM}</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          dir="ltr"
                          className={['h-12 text-base', rowErrors.length_m ? 'border-danger-foreground ring-1 ring-danger-foreground' : ''].join(' ')}
                          value={row.length_m}
                          onChange={(e) => onRowChange(row.uid, { length_m: e.target.value })}
                        />
                        {rowErrors.length_m && <p className="text-sm text-danger-foreground mt-1">{rowErrors.length_m}</p>}
                      </div>
                    )}

                    {/* Lot */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold text-foreground">{ar.addTop.colLot}</Label>
                      <LotCell
                        fabricId={group.fabricId!}
                        colorId={row.colorId}
                        lot_id={row.lot_id}
                        lots={lots}
                        onChangeLot={(id) => {
                          const lotObj = lots.find((l) => l.id === id);
                          onRowChange(row.uid, { lot_id: id, lot_no: lotObj?.lot_no ?? null });
                        }}
                        onLotCreated={(lot) => handleLotCreated(row.uid, lot)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add rows footer */}
            <div className="flex flex-wrap items-center gap-2 pt-1" dir="rtl">
              <Button type="button" variant="outline" className="h-12 gap-2 border-dashed text-base font-semibold px-6" onClick={() => onAddRows(1)}>
                <Plus className="size-5" />
                {ar.addTop.addRoll}
              </Button>
              <span className="text-sm text-foreground-muted mr-auto font-medium">
                {group.rows.length} {ar.addTop.rollIndexPrefix}
                {isMeter && (() => {
                  const totalL = group.rows.reduce((s, r) => s + (num(r.length_m) ?? 0), 0);
                  return totalL > 0 ? ` · ${totalL.toFixed(2)} م` : '';
                })()}
              </span>
            </div>
          </div>
        )}
      </div>{/* /body */}
    </div>
  );
}

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
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [mode, setMode] = useState<'form' | 'review'>('form');

  const submitMut = useMutation({
    mutationFn: async (groups: GroupState[]) => {
      const out: CreateTopBatchResult[] = [];
      for (const g of groups) {
        if (!g.fabricId) continue;
        const fabric = fabricsFull.find((f) => f.id === g.fabricId)!;
        const isMeter = fabric.unit === 'meter';
        const rolls = g.rows.map((r) => ({
          color: { id: r.colorId! },
          ...(!isMeter ? { weight_kg: Number(r.weight_kg) } : {}),
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
      setMode('form');
      setGroups([blankGroup()]);
      qc.invalidateQueries({ queryKey: ['fabrics-full'] });
      qc.invalidateQueries({ queryKey: ['colors'] });
      qc.invalidateQueries({ queryKey: ['rolls-search'] });
    },
    onError: (e: unknown) => {
      setGlobalError(extractApiError(e));
      setMode('form');
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
        lot_id: null,
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

  function handleReview() {
    setSubmitted(true);
    setGlobalError(null);
    if (!validateAll()) {
      setGlobalError('يوجد أخطاء في البيانات — راجع الحقول المحددة بالأحمر');
      return;
    }
    setSubmitted(false);
    setGlobalError(null);
    setMode('review');
  }

  function handleSubmit() {
    setGlobalError(null);
    submitMut.mutate(groups);
  }

  // ----- totals -----

  const totals = useMemo(() => {
    let rolls = 0;
    let weight = 0;
    let length = 0;
    let hasMeter = false;
    let hasKg = false;
    for (const g of groups) {
      const fabric = fabricsFull.find((f) => f.id === g.fabricId);
      const isMeter = fabric?.unit === 'meter';
      if (isMeter) hasMeter = true;
      else hasKg = true;
      for (const r of g.rows) {
        rolls++;
        if (!isMeter) weight += num(r.weight_kg) ?? 0;
        if (isMeter) length += num(r.length_m) ?? 0;
      }
    }
    return { rolls, weight, length, hasMeter, hasKg };
  }, [groups, fabricsFull]);

  // ----- PDF helpers -----

  const allResultRollIds = results.flatMap((r) => r.rolls.map((roll) => roll.id));

  // ----- Success view -----

  if (results.length > 0) {
    const allRolls = results.flatMap((r) => r.rolls);
    return (
      <PageShell title={ar.addTop.navTitle} description={ar.hubs.itemsAddTopDesc} backTo="/items" className="max-w-5xl">
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
                    <span dir="ltr" className="tabular-num">
                      {r.length_m ? `${Number(r.length_m).toFixed(2)} م` : `${Number(r.weight_kg).toFixed(3)} kg`}
                    </span>
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
              <Button size="sm" variant="outline" onClick={() => setResults([])}>
                {ar.addTop.addFabricGroup}
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // ----- Review screen -----

  if (mode === 'review') {
    return (
      <PageShell title={ar.addTop.navTitle} description={ar.hubs.itemsAddTopDesc} backTo="/items" className="max-w-5xl">

        {/* Header */}
        <div className="rounded-lg border border-border-subtle bg-surface-elevated px-5 py-4 space-y-1" dir="rtl">
          <p className="text-base font-semibold text-foreground">{ar.addTop.reviewTitle}</p>
          <p className="text-sm text-foreground-muted">{ar.addTop.reviewHint}</p>
        </div>

        {/* One card per fabric group */}
        {groups.map((group) => {
          const fabric = fabricsFull.find((f) => f.id === group.fabricId)!;
          const isMeter = fabric.unit === 'meter';
          return (
            <Card key={group.uid} className="border-border-subtle">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  {fabric.name_ar}
                  <span className="text-foreground-muted font-normal text-sm mr-2">
                    ({fabric.code}) · {group.rows.length} {ar.addTop.rollIndexPrefix}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="border-b border-border-subtle text-foreground-muted text-xs">
                        <th className="py-2 px-3 text-start font-medium">#</th>
                        <th className="py-2 px-3 text-start font-medium">{ar.addTop.colColor}</th>
                        <th className="py-2 px-3 text-start font-medium">{ar.addTop.colWidthCm}</th>
                        {!isMeter && <th className="py-2 px-3 text-start font-medium">{ar.addTop.colWeightKg}</th>}
                        {isMeter && <th className="py-2 px-3 text-start font-medium">{ar.addTop.colLengthM}</th>}
                        <th className="py-2 px-3 text-start font-medium">{ar.addTop.colLot}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {group.rows.map((row, idx) => {
                        const color = colors.find((c) => c.id === row.colorId);
                        return (
                          <tr key={row.uid} className="hover:bg-surface-hover transition-colors">
                            <td className="py-2 px-3 text-foreground-muted">{idx + 1}</td>
                            <td className="py-2 px-3 text-foreground">{color?.name_ar ?? '—'}</td>
                            <td className="py-2 px-3 text-foreground tabular-num" dir="ltr">{row.width_cm}</td>
                            {!isMeter && <td className="py-2 px-3 text-foreground tabular-num font-medium" dir="ltr">{row.weight_kg}</td>}
                            {isMeter && <td className="py-2 px-3 text-foreground tabular-num" dir="ltr">{row.length_m}</td>}
                            <td className="py-2 px-3 text-foreground-muted">{row.lot_no ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Summary totals */}
        <div className="rounded-lg border border-border-subtle bg-surface-elevated px-5 py-3 flex flex-wrap gap-4 text-sm text-foreground-muted" dir="rtl">
          <span>{ar.addTop.totalCount}: <span className="font-mono font-medium text-foreground">{totals.rolls}</span></span>
          {totals.hasKg && <span>{ar.addTop.totalWeight}: <span className="font-mono font-medium text-foreground" dir="ltr">{totals.weight.toFixed(3)} kg</span></span>}
          {totals.hasMeter && (
            <span>{ar.addTop.totalLength}: <span className="font-mono font-medium text-foreground" dir="ltr">{totals.length.toFixed(2)} م</span></span>
          )}
        </div>

        {/* Global error (shown if save failed and user returned here) */}
        {globalError && (
          <div role="alert" className="p-3 rounded-md border border-danger/30 bg-danger-subtle text-sm text-danger-foreground">
            {globalError}
          </div>
        )}

        {/* Sticky footer */}
        <div className="sticky bottom-0 bg-canvas border-t border-border-subtle py-3 px-4 flex items-center gap-3 -mx-4 sm:-mx-6" dir="rtl">
          <Button variant="outline" size="lg" className="h-10 shrink-0" onClick={() => setMode('form')}>
            {ar.addTop.backToEdit}
          </Button>
          <Button size="lg" className="h-10 shrink-0" onClick={handleSubmit} disabled={submitMut.isPending}>
            {submitMut.isPending ? ar.loading : ar.addTop.saveAndPrint}
          </Button>
        </div>

      </PageShell>
    );
  }

  // ----- Main form -----

  return (
    <PageShell
      title={ar.addTop.navTitle}
      description={ar.hubs.itemsAddTopDesc}
      backTo="/items"
      className="max-w-5xl"
      extra={
        <span className="inline-flex items-center gap-2 text-base font-semibold px-4 py-2 rounded-lg bg-accent text-accent-foreground w-fit">
          <MapPin className="size-5" />
          {ar.addTop.factoryBadge}
        </span>
      }
    >

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

      {/* Used fabrics summary — read-only */}
      {groups.some((g) => g.fabricId) && (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated px-5 py-4 space-y-3" dir="rtl">
          <p className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">الخامات المستخدمة</p>
          <div className="flex flex-wrap gap-2">
            {groups
              .map((g) => ({ g, f: fabricsFull.find((x) => x.id === g.fabricId) }))
              .filter((entry): entry is { g: typeof entry.g; f: NonNullable<typeof entry.f> } => Boolean(entry.f))
              .map(({ g, f }) => {
                const rollCount = g.rows.length;
                return (
                  <span
                    key={g.uid}
                    className="inline-flex flex-col gap-0.5 px-4 py-3 rounded-lg border border-border-subtle bg-canvas select-none cursor-default"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base font-semibold text-foreground">{f.name_ar}</span>
                      <span className="text-sm text-foreground-muted">({f.code})</span>
                      <span className="text-sm text-foreground-muted">· {rollCount} {ar.addTop.rollIndexPrefix}</span>
                    </span>
                    {f.gsm != null && (
                      <span className="text-sm text-foreground-muted">GSM: {f.gsm} {ar.fabrics.gsmUnit}</span>
                    )}
                  </span>
                );
              })}
          </div>
        </div>
      )}

      {/* Fabric groups */}
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

      {/* Add fabric group drop area */}
      <button
        type="button"
        className="w-full rounded-xl border-2 border-dashed border-border-subtle bg-surface-elevated/40 hover:bg-surface-elevated transition-colors py-6 flex items-center justify-center gap-2 text-base font-semibold text-foreground-muted hover:text-foreground cursor-pointer"
        onClick={handleAddGroup}
      >
        <Plus className="size-4" />
        {ar.addTop.addFabricGroup}
      </button>

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
          onClick={handleReview}
          disabled={submitMut.isPending}
          size="lg"
          className="h-10 shrink-0"
        >
          {ar.addTop.reviewButton}
        </Button>
      </div>
    </PageShell>
  );
}
