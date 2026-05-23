import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { codesApi } from '@/lib/codes-api';
import type {
  CreateFabricInput,
  FabricFull,
  FabricUnit,
  UpdateFabricInput,
} from '@/lib/inventory-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ResponsiveDialog';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusPill } from '@/components/StatusPill';
import { useAuth } from '@/lib/auth';
import { extractApiError } from '@/lib/api-error';

type CompositionRow = { material: string; percent: string };

type FormState = {
  name_ar: string;
  width_cm: string;
  unit: FabricUnit;
  notes: string;
  composition: CompositionRow[];
  is_active: boolean;
  default_grade_id: string;
  default_composition_id: string;
  default_brand_id: string;
};

const blank = (): FormState => ({
  name_ar: '',
  width_cm: '',
  unit: 'kg',
  notes: '',
  composition: [{ material: '', percent: '100' }],
  is_active: true,
  default_grade_id: '',
  default_composition_id: '',
  default_brand_id: '',
});

function fromFabric(f: FabricFull & { default_grade_id?: number | null; default_composition_id?: number | null; default_brand_id?: number | null }): FormState {
  return {
    name_ar: f.name_ar,
    width_cm: String(f.width_cm),
    unit: f.unit,
    notes: f.notes ?? '',
    composition:
      f.composition.length > 0
        ? f.composition.map((c) => ({ material: c.material, percent: String(c.percent) }))
        : [{ material: '', percent: '100' }],
    is_active: f.is_active,
    default_grade_id: f.default_grade_id != null ? String(f.default_grade_id) : '',
    default_composition_id: f.default_composition_id != null ? String(f.default_composition_id) : '',
    default_brand_id: f.default_brand_id != null ? String(f.default_brand_id) : '',
  };
}

function compositionSummary(items: FabricFull['composition']): string {
  return items.map((c) => `${c.material} ${c.percent}%`).join(' · ');
}

export function FabricsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = user?.role === 'owner';

  const fabricsQ = useQuery({
    queryKey: ['fabrics-full'],
    queryFn: inventoryApi.listFabricsFull,
  });

  const gradesQ = useQuery({ queryKey: ['codes-grades'], queryFn: codesApi.listGrades });
  const compositionsQ = useQuery({ queryKey: ['codes-compositions'], queryFn: codesApi.listCompositions });
  const brandsQ = useQuery({ queryKey: ['codes-brands'], queryFn: codesApi.listBrands });

  const [editing, setEditing] = useState<FabricFull | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(blank());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isOpen = creating || editing !== null;

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(blank());
    setErrorMsg(null);
  }

  function openEdit(f: FabricFull) {
    setCreating(false);
    setEditing(f);
    setForm(fromFabric(f));
    setErrorMsg(null);
  }

  function close() {
    setEditing(null);
    setCreating(false);
    setErrorMsg(null);
  }

  const createMut = useMutation({
    mutationFn: (body: CreateFabricInput) => inventoryApi.createFabric(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabrics-full'] });
      qc.invalidateQueries({ queryKey: ['fabrics'] });
      close();
    },
    onError: (e: unknown) => setErrorMsg(extractApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateFabricInput }) =>
      inventoryApi.updateFabric(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabrics-full'] });
      qc.invalidateQueries({ queryKey: ['fabrics'] });
      close();
    },
    onError: (e: unknown) => setErrorMsg(extractApiError(e)),
  });

  function buildPayload(): CreateFabricInput | null {
    setErrorMsg(null);
    const composition = form.composition
      .filter((c) => c.material.trim() !== '' && c.percent.trim() !== '')
      .map((c) => ({ material: c.material.trim(), percent: Number(c.percent) }));
    if (composition.length === 0) {
      setErrorMsg(ar.addTop.errors.compositionRequired);
      return null;
    }
    const sum = composition.reduce((s, c) => s + (c.percent || 0), 0);
    if (Math.abs(sum - 100) > 0.01) {
      setErrorMsg(ar.addTop.errors.compositionMustSum100);
      return null;
    }
    const widthCm = Number(form.width_cm);
    if (!Number.isFinite(widthCm) || widthCm <= 0) {
      setErrorMsg(ar.addTop.errors.widthRequired);
      return null;
    }
    if (!form.name_ar.trim()) {
      setErrorMsg(ar.addTop.errors.fabricFieldsRequired);
      return null;
    }
    return {
      name_ar: form.name_ar.trim(),
      width_cm: widthCm,
      grade: 'A',
      composition,
      notes: form.notes.trim() || null,
      unit: form.unit,
    };
  }

  function onSave() {
    const body = buildPayload();
    if (!body) return;
    const defaultFields: Pick<UpdateFabricInput, 'default_grade_id' | 'default_composition_id' | 'default_brand_id'> = {
      default_grade_id: form.default_grade_id ? Number(form.default_grade_id) : null,
      default_composition_id: form.default_composition_id ? Number(form.default_composition_id) : null,
      default_brand_id: form.default_brand_id ? Number(form.default_brand_id) : null,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, body: { ...body, is_active: form.is_active, ...defaultFields } });
    } else {
      createMut.mutate(body);
    }
  }

  const fabrics = fabricsQ.data ?? [];

  const columns: Column<FabricFull>[] = useMemo(
    () => [
      {
        key: 'name_ar',
        header: ar.fabrics.nameAr,
        cell: (f) => f.name_ar,
        primary: true,
      },
      {
        key: 'code',
        header: ar.fabrics.code,
        cell: (f) => <span className="font-mono text-xs" dir="ltr">{f.code}</span>,
        secondary: true,
      },
      {
        key: 'width',
        header: ar.fabrics.width,
        cell: (f) => <span dir="ltr">{Number(f.width_cm).toFixed(2)} cm</span>,
      },
      {
        key: 'unit',
        header: ar.fabrics.unit,
        cell: (f) => (f.unit === 'meter' ? ar.fabrics.unitMeter : ar.fabrics.unitKg),
      },
      {
        key: 'composition',
        header: ar.fabrics.composition,
        cell: (f) => (
          <span className="text-xs text-foreground-muted">{compositionSummary(f.composition)}</span>
        ),
      },
      {
        key: 'is_active',
        header: ar.fabrics.isActive,
        cell: (f) => (
          <StatusPill tone={f.is_active ? 'success' : 'neutral'}>
            {f.is_active ? ar.common.yes : ar.common.no}
          </StatusPill>
        ),
      },
    ],
    [],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-4" dir="rtl">
      <PageHeader
        title={ar.fabrics.title}
        description={ar.hubs.inventoryFabricsDesc}
        backTo="/items"
        actions={
          isOwner && (
            <Button onClick={openCreate}>+ {ar.fabrics.addFabric}</Button>
          )
        }
      />

      <div className="text-sm text-foreground-muted">
        {ar.fabrics.hint}{' '}
        <Link to="/items/tops/add" className="text-accent hover:text-accent-hover underline underline-offset-2">
          {ar.addTop.navTitle}
        </Link>
        .
      </div>

      <ResponsiveTable
        columns={columns}
        rows={fabrics}
        rowKey={(f) => String(f.id)}
        onRowClick={isOwner ? openEdit : undefined}
        empty={ar.common.none}
        isLoading={fabricsQ.isLoading}
        isError={fabricsQ.isError}
        onRetry={() => fabricsQ.refetch()}
        actions={
          isOwner
            ? (f) => (
                <Button size="sm" variant="outline" onClick={() => openEdit(f)}>
                  {ar.fabrics.edit}
                </Button>
              )
            : undefined
        }
      />

      <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? ar.fabrics.editTitle : ar.fabrics.createTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{ar.addTop.fabricNameAr}</Label>
                <Input
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  placeholder="قطن مصري سادة 150سم"
                  className="h-11 md:h-10"
                />
              </div>
              <div className="space-y-1">
                <Label>{ar.addTop.fabricCode}</Label>
                <Input
                  value={editing ? editing.code : 'سيتم توليده تلقائياً'}
                  readOnly
                  dir="ltr"
                  className="h-11 md:h-10 bg-surface-muted text-foreground-muted cursor-default select-all"
                />
              </div>
              <div className="space-y-1">
                <Label>{ar.addTop.widthCm}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={form.width_cm}
                  onChange={(e) => setForm({ ...form, width_cm: e.target.value })}
                  dir="ltr"
                  className="h-11 md:h-10"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>{ar.fabrics.unit}</Label>
                <div
                  className="inline-flex rounded border border-border bg-canvas p-0.5 h-11 md:h-10"
                  role="radiogroup"
                  aria-label={ar.fabrics.unit}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.unit === 'kg'}
                    onClick={() => setForm({ ...form, unit: 'kg' })}
                    className={
                      'cursor-pointer px-4 rounded-sm text-sm transition-colors ' +
                      (form.unit === 'kg'
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground-muted hover:text-foreground')
                    }
                  >
                    {ar.fabrics.unitKg}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.unit === 'meter'}
                    onClick={() => setForm({ ...form, unit: 'meter' })}
                    className={
                      'cursor-pointer px-4 rounded-sm text-sm transition-colors ' +
                      (form.unit === 'meter'
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground-muted hover:text-foreground')
                    }
                  >
                    {ar.fabrics.unitMeter}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>{ar.addTop.composition}</Label>
              <div className="space-y-2">
                {form.composition.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_120px_auto] gap-2">
                    <Input
                      value={c.material}
                      onChange={(e) => {
                        const next = [...form.composition];
                        next[idx] = { ...c, material: e.target.value };
                        setForm({ ...form, composition: next });
                      }}
                      placeholder={ar.addTop.material}
                      className="h-11 md:h-10"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={c.percent}
                        onChange={(e) => {
                          const next = [...form.composition];
                          next[idx] = { ...c, percent: e.target.value };
                          if (idx + 1 < next.length) {
                            const sumExceptNext = next.reduce((s, row, i) => i !== idx + 1 ? s + (Number(row.percent) || 0) : s, 0);
                            next[idx + 1] = { ...next[idx + 1], percent: String(Math.max(0, 100 - sumExceptNext)) };
                          }
                          setForm({ ...form, composition: next });
                        }}
                        dir="ltr"
                        className="h-11 md:h-10"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm({
                          ...form,
                          composition: form.composition.filter((_, i) => i !== idx),
                        })
                      }
                      disabled={form.composition.length === 1}
                    >
                      {ar.common.cancel}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const used = form.composition.reduce((s, c) => s + (Number(c.percent) || 0), 0);
                    const remaining = Math.max(0, 100 - used);
                    setForm({ ...form, composition: [...form.composition, { material: '', percent: String(remaining) }] });
                  }}
                >
                  + {ar.addTop.addMaterial}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label>{ar.fabrics.notes}</Label>
              <textarea
                dir="rtl"
                className="w-full min-h-16 rounded border border-border bg-canvas px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {/* Default label fields — shown only when editing */}
            {editing && (
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground py-1 select-none">
                  {ar.fabrics.defaultLabelSection}
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{ar.fabrics.defaultGrade}</label>
                    <select
                      className="w-full h-11 md:h-10 rounded border border-border bg-canvas px-3 text-sm"
                      value={form.default_grade_id}
                      onChange={(e) => setForm({ ...form, default_grade_id: e.target.value })}
                    >
                      <option value="">—</option>
                      {(gradesQ.data ?? []).map((g) => (
                        <option key={g.id} value={g.id}>{g.arabic_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{ar.fabrics.defaultComposition}</label>
                    <select
                      className="w-full h-11 md:h-10 rounded border border-border bg-canvas px-3 text-sm"
                      value={form.default_composition_id}
                      onChange={(e) => setForm({ ...form, default_composition_id: e.target.value })}
                    >
                      <option value="">—</option>
                      {(compositionsQ.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>{c.arabic_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-sm font-medium">{ar.fabrics.defaultBrand}</label>
                    <select
                      className="w-full h-11 md:h-10 rounded border border-border bg-canvas px-3 text-sm"
                      value={form.default_brand_id}
                      onChange={(e) => setForm({ ...form, default_brand_id: e.target.value })}
                    >
                      <option value="">—</option>
                      {(brandsQ.data ?? []).map((b) => (
                        <option key={b.id} value={b.id}>{b.arabic_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </details>
            )}

            {editing && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="fabric-is-active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <label htmlFor="fabric-is-active" className="text-sm">
                  {ar.fabrics.isActive}
                </label>
              </div>
            )}

            {errorMsg && (
              <div role="alert" className="p-3 rounded-md border border-danger/30 bg-danger-subtle text-sm text-danger-foreground transition-opacity duration-75 ease-standard">
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={close}>
                {ar.common.cancel}
              </Button>
              <Button
                onClick={onSave}
                disabled={createMut.isPending || updateMut.isPending}
              >
                {createMut.isPending || updateMut.isPending ? ar.loading : ar.common.save}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

