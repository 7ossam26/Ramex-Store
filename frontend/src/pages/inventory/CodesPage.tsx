import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, RotateCcw, X, Check, Plus } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { codesApi, type CodeColor, type CodeGrade, type CodeBrand, type CodeComposition, type CodeSupplier, type RollReference } from '@/lib/codes-api';
import { settingsApi } from '@/lib/settings-api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey = 'colors' | 'grades' | 'brands' | 'compositions' | 'suppliers' | 'damage' | 'expense';
type StatusFilter = 'active' | 'inactive' | 'all';
type ReasonCode = { code: string; name_ar: string };

const TABS: { key: TabKey; label: string }[] = [
  { key: 'colors',       label: ar.codes.tabs.colors       },
  { key: 'grades',       label: ar.codes.tabs.grades       },
  { key: 'brands',       label: ar.codes.tabs.brands       },
  { key: 'compositions', label: ar.codes.tabs.compositions },
  { key: 'suppliers',    label: ar.codes.tabs.suppliers    },
  { key: 'damage',       label: ar.codes.tabs.damage       },
  { key: 'expense',      label: ar.codes.tabs.expense      },
];

function getInitialTab(): TabKey {
  const hash = window.location.hash.slice(1) as TabKey;
  return TABS.some((t) => t.key === hash) ? hash : 'colors';
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function extractApiError(e: unknown): string {
  const msg =
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return msg ?? ar.common.error;
}

function breakdownToString(bd: Array<{ material: string; percent: number }>): string {
  return bd.map((b) => `${b.percent}% ${b.material}`).join(' ');
}

// ── Shared small components ───────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium ${
        active ? 'bg-success-subtle text-success-foreground' : 'bg-surface-hover text-foreground-muted'
      }`}
    >
      {active ? ar.codes.active : ar.codes.inactive}
    </span>
  );
}

function UsageBadge({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return <span className="text-foreground-tertiary text-xs tabular-num">0</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-pill bg-info-subtle text-info-foreground px-2 py-0.5 text-xs font-medium tabular-num cursor-pointer hover:bg-info-subtle/70 transition-colors duration-150"
    >
      {count}
    </button>
  );
}

function Toolbar({
  search, onSearch, filter, onFilter, isOwner, onAdd,
}: {
  search: string; onSearch: (v: string) => void;
  filter: StatusFilter; onFilter: (f: StatusFilter) => void;
  isOwner: boolean; onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          dir="rtl"
          placeholder={ar.codes.search}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="border border-border-default rounded-md px-3 py-1.5 text-sm bg-surface-elevated text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-75 w-44"
        />
        <div className="flex rounded-md border border-border-default overflow-hidden text-sm">
          {(['active', 'inactive', 'all'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFilter(f)}
              className={`px-3 py-1.5 transition-colors duration-75 ${filter === f ? 'bg-accent text-accent-foreground' : 'bg-surface-elevated text-foreground-muted hover:bg-surface-hover'}`}
            >
              {ar.codes.filter[f]}
            </button>
          ))}
        </div>
      </div>
      {isOwner && (
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5 ml-1" />
          {ar.codes.addNew}
        </Button>
      )}
    </div>
  );
}

function InlineInput({
  value, onChange, placeholder = '', type = 'text',
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      dir="rtl"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border border-border rounded px-2 py-1 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary w-full"
    />
  );
}

// ── Delete dialog ─────────────────────────────────────────────────────────────

function DeleteDialog({
  name, usageCount, isOwner, pending,
  onConfirm, onForce, onCancel,
}: {
  name: string; usageCount: number; isOwner: boolean; pending: boolean;
  onConfirm: () => void; onForce: () => void; onCancel: () => void;
}) {
  const hasRefs = usageCount > 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{ar.codes.deactivateTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {hasRefs ? (
            <p className="text-warning-foreground bg-warning-subtle border border-warning/30 rounded-md p-3">
              {ar.codes.referencedWarning}{' '}
              <strong>{usageCount}</strong>{' '}
              {ar.codes.activePieces}
            </p>
          ) : (
            <p>{ar.codes.deactivateConfirm}</p>
          )}
          <p className="font-medium">{name}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
              {ar.common.cancel}
            </Button>
            {hasRefs ? (
              isOwner && (
                <Button size="sm" className="bg-danger text-white hover:bg-danger/90" onClick={onForce} disabled={pending}>
                  {ar.codes.deactivateForce}
                </Button>
              )
            ) : (
              <Button size="sm" onClick={onConfirm} disabled={pending}>
                {ar.codes.deactivate}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── References sheet ──────────────────────────────────────────────────────────

function RefsSheet({
  entity, item, onClose,
}: {
  entity: string;
  item: { id: number; name: string };
  onClose: () => void;
}) {
  const { data: refs = [], isLoading } = useQuery<RollReference[]>({
    queryKey: ['codes-refs', entity, item.id],
    queryFn: () => codesApi.getReferences(entity, item.id),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{ar.codes.refsTitle}</SheetTitle>
          <p className="text-xs text-muted-foreground">{item.name}</p>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {isLoading && <p className="text-sm text-foreground-muted">{ar.loading}</p>}
          {!isLoading && refs.length === 0 && (
            <p className="text-sm text-muted-foreground">{ar.codes.refsEmpty}</p>
          )}
          {refs.map((ref) => (
            <div
              key={ref.id}
              className="rounded border border-border p-2 text-sm space-y-0.5"
            >
              <p className="font-mono text-xs text-muted-foreground">{ref.internal_barcode}</p>
              <p>{ref.fabric_name} / {ref.color_name}</p>
              <StatusBadge active={!['sold', 'damaged', 'sample', 'returned'].includes(ref.status)} />
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Row action buttons ────────────────────────────────────────────────────────

function RowActions({
  isActive, isOwner, onEdit, onDelete, onRestore,
}: {
  isActive: boolean; isOwner: boolean;
  onEdit: () => void; onDelete: () => void; onRestore: () => void;
}) {
  if (!isOwner) return null;
  return (
    <div className="flex gap-1 justify-center">
      {isActive ? (
        <>
          <button type="button" onClick={onEdit} title={ar.codes.edit}
            className="p-1 rounded hover:bg-surface-hover text-foreground-muted hover:text-foreground transition-colors duration-150 cursor-pointer">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onDelete} title={ar.codes.deactivate}
            className="p-1 rounded hover:bg-danger-subtle text-foreground-muted hover:text-danger transition-colors duration-150 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <button type="button" onClick={onRestore} title={ar.codes.restore}
          className="p-1 rounded hover:bg-success-subtle text-foreground-muted hover:text-success transition-colors duration-150 cursor-pointer">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function SaveCancelBtns({ onSave, onCancel, disabled }: { onSave: () => void; onCancel: () => void; disabled: boolean }) {
  return (
    <div className="flex gap-1 justify-center">
      <button type="button" onClick={onSave} disabled={disabled}
        className="p-1 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors cursor-pointer disabled:opacity-50">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onCancel}
        className="p-1 rounded hover:bg-surface-hover text-foreground-muted transition-colors duration-150 cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── TH / TD helpers ───────────────────────────────────────────────────────────

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={`py-2 px-3 text-sm font-medium text-muted-foreground border-b border-border ${center ? 'text-center' : 'text-right'}`}>
      {children}
    </th>
  );
}

function Td({ children, center, muted }: { children: React.ReactNode; center?: boolean; muted?: boolean }) {
  return (
    <td className={`py-2 px-3 text-sm border-b border-border ${center ? 'text-center' : 'text-right'} ${muted ? 'text-muted-foreground' : ''}`}>
      {children}
    </td>
  );
}

// ── Colors Tab ────────────────────────────────────────────────────────────────

function ColorsTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name_ar: '', code: '', english_name: '' });
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ name_ar: '', code: '', english_name: '' });
  const [deleteTarget, setDeleteTarget] = useState<CodeColor | null>(null);
  const [refsItem, setRefsItem] = useState<{ id: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['codes-page', 'colors', filter],
    queryFn: () => codesApi.listColorsFiltered(filter),
  });

  const filtered = useMemo(
    () => data.filter((c) => c.name_ar.includes(search) || c.code.includes(search)),
    [data, search],
  );

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['codes-page', 'colors'] });
    qc.invalidateQueries({ queryKey: ['codes-colors'] });
  }

  const createMut = useMutation({
    mutationFn: () => codesApi.create('colors', { name_ar: newForm.name_ar.trim(), code: newForm.code.trim(), english_name: newForm.english_name.trim() || null }),
    onSuccess: () => { invalidate(); setAddingNew(false); setNewForm({ name_ar: '', code: '', english_name: '' }); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id }: { id: number }) => codesApi.update('colors', id, { name_ar: editForm.name_ar.trim(), code: editForm.code.trim(), english_name: editForm.english_name.trim() || null }),
    onSuccess: () => { invalidate(); setEditingId(null); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => codesApi.deactivate('colors', id, force),
    onSuccess: () => { invalidate(); setDeleteTarget(null); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => codesApi.restore('colors', id),
    onSuccess: () => { invalidate(); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  function startEdit(c: CodeColor) {
    setEditingId(c.id);
    setEditForm({ name_ar: c.name_ar, code: c.code, english_name: c.english_name ?? '' });
    setAddingNew(false);
  }

  if (isLoading) return <p className="text-sm text-foreground-muted p-4">{ar.loading}</p>;

  return (
    <div className="space-y-4">
      <Toolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter}
        isOwner={isOwner} onAdd={() => { setAddingNew(true); setEditingId(null); }} />
      {err && <p role="alert" className="text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md px-3 py-2 transition-opacity duration-75 ease-standard">{err}</p>}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse">
          <thead className="bg-surface-hover/50 sticky top-0 z-sticky">
            <tr>
              <Th>{ar.codes.columns.code}</Th>
              <Th>{ar.codes.columns.nameAr}</Th>
              <Th>{ar.codes.columns.nameEn}</Th>
              <Th center>{ar.codes.columns.usage}</Th>
              <Th center>{ar.codes.columns.status}</Th>
              {isOwner && <Th center>{ar.codes.columns.actions}</Th>}
            </tr>
          </thead>
          <tbody>
            {addingNew && (
              <tr className="bg-info-subtle/50">
                <Td><InlineInput value={newForm.code} onChange={(v) => setNewForm({ ...newForm, code: v })} placeholder="101" /></Td>
                <Td><InlineInput value={newForm.name_ar} onChange={(v) => setNewForm({ ...newForm, name_ar: v })} placeholder="كسر بياض" /></Td>
                <Td><InlineInput value={newForm.english_name} onChange={(v) => setNewForm({ ...newForm, english_name: v })} placeholder="Off White" /></Td>
                <Td center>—</Td>
                <Td center>—</Td>
                <Td center>
                  <SaveCancelBtns
                    onSave={() => createMut.mutate()}
                    onCancel={() => { setAddingNew(false); setErr(null); }}
                    disabled={!newForm.name_ar || !newForm.code || createMut.isPending}
                  />
                </Td>
              </tr>
            )}
            {filtered.length === 0 && !addingNew && (
              <tr><td colSpan={isOwner ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">{ar.codes.noResults}</td></tr>
            )}
            {filtered.map((c) =>
              editingId === c.id ? (
                <tr key={c.id} className="bg-info-subtle/40">
                  <Td><InlineInput value={editForm.code} onChange={(v) => setEditForm({ ...editForm, code: v })} /></Td>
                  <Td><InlineInput value={editForm.name_ar} onChange={(v) => setEditForm({ ...editForm, name_ar: v })} /></Td>
                  <Td><InlineInput value={editForm.english_name} onChange={(v) => setEditForm({ ...editForm, english_name: v })} /></Td>
                  <Td center>{c.usage_count}</Td>
                  <Td center><StatusBadge active={c.is_active} /></Td>
                  <Td center>
                    <SaveCancelBtns
                      onSave={() => updateMut.mutate({ id: c.id })}
                      onCancel={() => { setEditingId(null); setErr(null); }}
                      disabled={!editForm.name_ar || !editForm.code || updateMut.isPending}
                    />
                  </Td>
                </tr>
              ) : (
                <tr key={c.id} className="hover:bg-surface-hover transition-colors duration-150">
                  <Td muted>{c.code}</Td>
                  <Td>{c.name_ar}</Td>
                  <Td muted>{c.english_name ?? '—'}</Td>
                  <Td center>
                    <UsageBadge count={c.usage_count} onClick={() => setRefsItem({ id: c.id, name: `${c.name_ar} ${c.code}` })} />
                  </Td>
                  <Td center><StatusBadge active={c.is_active} /></Td>
                  {isOwner && (
                    <Td center>
                      <RowActions isActive={c.is_active} isOwner={isOwner}
                        onEdit={() => startEdit(c)}
                        onDelete={() => { setDeleteTarget(c); setErr(null); }}
                        onRestore={() => restoreMut.mutate(c.id)}
                      />
                    </Td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {deleteTarget && (
        <DeleteDialog
          name={`${deleteTarget.name_ar} ${deleteTarget.code}`}
          usageCount={deleteTarget.usage_count}
          isOwner={isOwner}
          pending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate({ id: deleteTarget.id, force: false })}
          onForce={() => deleteMut.mutate({ id: deleteTarget.id, force: true })}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {refsItem && <RefsSheet entity="colors" item={refsItem} onClose={() => setRefsItem(null)} />}
    </div>
  );
}

// ── Grades Tab ────────────────────────────────────────────────────────────────

function GradesTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ arabic_name: '', english_name: '' });
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ arabic_name: '', english_name: '' });
  const [deleteTarget, setDeleteTarget] = useState<CodeGrade | null>(null);
  const [refsItem, setRefsItem] = useState<{ id: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['codes-page', 'grades', filter],
    queryFn: () => codesApi.listGradesFiltered(filter),
  });

  const filtered = useMemo(() => data.filter((g) => g.arabic_name.includes(search)), [data, search]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['codes-page', 'grades'] });
    qc.invalidateQueries({ queryKey: ['codes-grades'] });
    qc.invalidateQueries({ queryKey: ['codes-grades-all'] });
  }

  const createMut = useMutation({
    mutationFn: () => codesApi.create('grades', { arabic_name: newForm.arabic_name.trim(), english_name: newForm.english_name.trim() || null }),
    onSuccess: () => { invalidate(); setAddingNew(false); setNewForm({ arabic_name: '', english_name: '' }); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id }: { id: number }) => codesApi.update('grades', id, { arabic_name: editForm.arabic_name.trim(), english_name: editForm.english_name.trim() || null }),
    onSuccess: () => { invalidate(); setEditingId(null); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => codesApi.deactivate('grades', id, force),
    onSuccess: () => { invalidate(); setDeleteTarget(null); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => codesApi.restore('grades', id),
    onSuccess: () => { invalidate(); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  if (isLoading) return <p className="text-sm text-foreground-muted p-4">{ar.loading}</p>;

  return (
    <div className="space-y-4">
      <Toolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter}
        isOwner={isOwner} onAdd={() => { setAddingNew(true); setEditingId(null); }} />
      {err && <p role="alert" className="text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md px-3 py-2 transition-opacity duration-75 ease-standard">{err}</p>}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse">
          <thead className="bg-surface-hover/50 sticky top-0 z-sticky">
            <tr>
              <Th>{ar.codes.columns.nameAr}</Th>
              <Th>{ar.codes.columns.nameEn}</Th>
              <Th center>{ar.codes.columns.usage}</Th>
              <Th center>{ar.codes.columns.status}</Th>
              {isOwner && <Th center>{ar.codes.columns.actions}</Th>}
            </tr>
          </thead>
          <tbody>
            {addingNew && (
              <tr className="bg-info-subtle/50">
                <Td><InlineInput value={newForm.arabic_name} onChange={(v) => setNewForm({ ...newForm, arabic_name: v })} placeholder="درجة أ" /></Td>
                <Td><InlineInput value={newForm.english_name} onChange={(v) => setNewForm({ ...newForm, english_name: v })} placeholder="Grade A" /></Td>
                <Td center>—</Td>
                <Td center>—</Td>
                <Td center>
                  <SaveCancelBtns onSave={() => createMut.mutate()} onCancel={() => { setAddingNew(false); setErr(null); }} disabled={!newForm.arabic_name || createMut.isPending} />
                </Td>
              </tr>
            )}
            {filtered.length === 0 && !addingNew && (
              <tr><td colSpan={isOwner ? 5 : 4} className="py-8 text-center text-sm text-muted-foreground">{ar.codes.noResults}</td></tr>
            )}
            {filtered.map((g) =>
              editingId === g.id ? (
                <tr key={g.id} className="bg-info-subtle/40">
                  <Td><InlineInput value={editForm.arabic_name} onChange={(v) => setEditForm({ ...editForm, arabic_name: v })} /></Td>
                  <Td><InlineInput value={editForm.english_name} onChange={(v) => setEditForm({ ...editForm, english_name: v })} /></Td>
                  <Td center>{g.usage_count}</Td>
                  <Td center><StatusBadge active={g.is_active} /></Td>
                  <Td center>
                    <SaveCancelBtns onSave={() => updateMut.mutate({ id: g.id })} onCancel={() => { setEditingId(null); setErr(null); }} disabled={!editForm.arabic_name || updateMut.isPending} />
                  </Td>
                </tr>
              ) : (
                <tr key={g.id} className="hover:bg-surface-hover transition-colors duration-150">
                  <Td>{g.arabic_name}</Td>
                  <Td muted>{g.english_name ?? '—'}</Td>
                  <Td center>
                    <UsageBadge count={g.usage_count} onClick={() => setRefsItem({ id: g.id, name: g.arabic_name })} />
                  </Td>
                  <Td center><StatusBadge active={g.is_active} /></Td>
                  {isOwner && (
                    <Td center>
                      <RowActions isActive={g.is_active} isOwner={isOwner}
                        onEdit={() => { setEditingId(g.id); setEditForm({ arabic_name: g.arabic_name, english_name: g.english_name ?? '' }); setAddingNew(false); }}
                        onDelete={() => { setDeleteTarget(g); setErr(null); }}
                        onRestore={() => restoreMut.mutate(g.id)}
                      />
                    </Td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {deleteTarget && (
        <DeleteDialog name={deleteTarget.arabic_name} usageCount={deleteTarget.usage_count} isOwner={isOwner} pending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate({ id: deleteTarget.id, force: false })}
          onForce={() => deleteMut.mutate({ id: deleteTarget.id, force: true })}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {refsItem && <RefsSheet entity="grades" item={refsItem} onClose={() => setRefsItem(null)} />}
    </div>
  );
}

// ── Brands Tab ────────────────────────────────────────────────────────────────

function BrandsTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ arabic_name: '', product_line: '', supplier_id: '' });
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ arabic_name: '', product_line: '', supplier_id: '' });
  const [deleteTarget, setDeleteTarget] = useState<CodeBrand | null>(null);
  const [refsItem, setRefsItem] = useState<{ id: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['codes-page', 'brands', filter],
    queryFn: () => codesApi.listBrandsFiltered(filter),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['codes-suppliers'],
    queryFn: codesApi.listSuppliers,
  });

  const filtered = useMemo(() => data.filter((b) => b.arabic_name.includes(search)), [data, search]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['codes-page', 'brands'] });
    qc.invalidateQueries({ queryKey: ['codes-brands'] });
    qc.invalidateQueries({ queryKey: ['codes-brands-all'] });
  }

  const supplierName = (id: number | null) => suppliers.find((s) => s.id === id)?.arabic_name ?? '—';

  function buildPayload(form: typeof newForm) {
    return { arabic_name: form.arabic_name.trim(), product_line: form.product_line.trim() || null, supplier_id: form.supplier_id ? Number(form.supplier_id) : null };
  }

  const createMut = useMutation({
    mutationFn: () => codesApi.create('brands', buildPayload(newForm)),
    onSuccess: () => { invalidate(); setAddingNew(false); setNewForm({ arabic_name: '', product_line: '', supplier_id: '' }); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id }: { id: number }) => codesApi.update('brands', id, buildPayload(editForm)),
    onSuccess: () => { invalidate(); setEditingId(null); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => codesApi.deactivate('brands', id, force),
    onSuccess: () => { invalidate(); setDeleteTarget(null); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => codesApi.restore('brands', id),
    onSuccess: () => { invalidate(); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  function SupplierSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="border border-border rounded px-2 py-1 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary w-full">
        <option value="">—</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.arabic_name}</option>)}
      </select>
    );
  }

  if (isLoading) return <p className="text-sm text-foreground-muted p-4">{ar.loading}</p>;

  return (
    <div className="space-y-4">
      <Toolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter}
        isOwner={isOwner} onAdd={() => { setAddingNew(true); setEditingId(null); }} />
      {err && <p role="alert" className="text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md px-3 py-2 transition-opacity duration-75 ease-standard">{err}</p>}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse">
          <thead className="bg-surface-hover/50 sticky top-0 z-sticky">
            <tr>
              <Th>{ar.codes.columns.nameAr}</Th>
              <Th>{ar.codes.columns.supplier}</Th>
              <Th>{ar.codes.columns.productLine}</Th>
              <Th center>{ar.codes.columns.usage}</Th>
              <Th center>{ar.codes.columns.status}</Th>
              {isOwner && <Th center>{ar.codes.columns.actions}</Th>}
            </tr>
          </thead>
          <tbody>
            {addingNew && (
              <tr className="bg-info-subtle/50">
                <Td><InlineInput value={newForm.arabic_name} onChange={(v) => setNewForm({ ...newForm, arabic_name: v })} placeholder="ماركة جديدة" /></Td>
                <Td><SupplierSelect value={newForm.supplier_id} onChange={(v) => setNewForm({ ...newForm, supplier_id: v })} /></Td>
                <Td><InlineInput value={newForm.product_line} onChange={(v) => setNewForm({ ...newForm, product_line: v })} placeholder="خط الإنتاج" /></Td>
                <Td center>—</Td>
                <Td center>—</Td>
                <Td center>
                  <SaveCancelBtns onSave={() => createMut.mutate()} onCancel={() => { setAddingNew(false); setErr(null); }} disabled={!newForm.arabic_name || createMut.isPending} />
                </Td>
              </tr>
            )}
            {filtered.length === 0 && !addingNew && (
              <tr><td colSpan={isOwner ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">{ar.codes.noResults}</td></tr>
            )}
            {filtered.map((b) =>
              editingId === b.id ? (
                <tr key={b.id} className="bg-info-subtle/40">
                  <Td><InlineInput value={editForm.arabic_name} onChange={(v) => setEditForm({ ...editForm, arabic_name: v })} /></Td>
                  <Td><SupplierSelect value={editForm.supplier_id} onChange={(v) => setEditForm({ ...editForm, supplier_id: v })} /></Td>
                  <Td><InlineInput value={editForm.product_line} onChange={(v) => setEditForm({ ...editForm, product_line: v })} /></Td>
                  <Td center>{b.usage_count}</Td>
                  <Td center><StatusBadge active={b.is_active} /></Td>
                  <Td center>
                    <SaveCancelBtns onSave={() => updateMut.mutate({ id: b.id })} onCancel={() => { setEditingId(null); setErr(null); }} disabled={!editForm.arabic_name || updateMut.isPending} />
                  </Td>
                </tr>
              ) : (
                <tr key={b.id} className="hover:bg-surface-hover transition-colors duration-150">
                  <Td>{b.arabic_name}</Td>
                  <Td muted>{supplierName(b.supplier_id)}</Td>
                  <Td muted>{b.product_line ?? '—'}</Td>
                  <Td center>
                    <UsageBadge count={b.usage_count} onClick={() => setRefsItem({ id: b.id, name: b.arabic_name })} />
                  </Td>
                  <Td center><StatusBadge active={b.is_active} /></Td>
                  {isOwner && (
                    <Td center>
                      <RowActions isActive={b.is_active} isOwner={isOwner}
                        onEdit={() => { setEditingId(b.id); setEditForm({ arabic_name: b.arabic_name, product_line: b.product_line ?? '', supplier_id: b.supplier_id ? String(b.supplier_id) : '' }); setAddingNew(false); }}
                        onDelete={() => { setDeleteTarget(b); setErr(null); }}
                        onRestore={() => restoreMut.mutate(b.id)}
                      />
                    </Td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {deleteTarget && (
        <DeleteDialog name={deleteTarget.arabic_name} usageCount={deleteTarget.usage_count} isOwner={isOwner} pending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate({ id: deleteTarget.id, force: false })}
          onForce={() => deleteMut.mutate({ id: deleteTarget.id, force: true })}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {refsItem && <RefsSheet entity="brands" item={refsItem} onClose={() => setRefsItem(null)} />}
    </div>
  );
}

// ── Compositions Tab ──────────────────────────────────────────────────────────

type CompMode = 'string' | 'structured';
type BdItem = { material: string; percent: number };

function CompositionsTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<CompMode>('string');
  const [editForm, setEditForm] = useState({ arabic_name: '', description: '', breakdown: [] as BdItem[] });
  const [addingNew, setAddingNew] = useState(false);
  const [newMode, setNewMode] = useState<CompMode>('string');
  const [newForm, setNewForm] = useState({ arabic_name: '', description: '', breakdown: [] as BdItem[] });
  const [deleteTarget, setDeleteTarget] = useState<CodeComposition | null>(null);
  const [refsItem, setRefsItem] = useState<{ id: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sumWarn, setSumWarn] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['codes-page', 'compositions', filter],
    queryFn: () => codesApi.listCompositionsFiltered(filter),
  });

  const filtered = useMemo(() => data.filter((c) => c.arabic_name.includes(search)), [data, search]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['codes-page', 'compositions'] });
    qc.invalidateQueries({ queryKey: ['codes-compositions'] });
    qc.invalidateQueries({ queryKey: ['codes-compositions-all'] });
  }

  function buildPayload(form: typeof newForm, mode: CompMode) {
    if (mode === 'structured') {
      return { arabic_name: form.arabic_name.trim(), description: breakdownToString(form.breakdown) || null, breakdown: form.breakdown };
    }
    return { arabic_name: form.arabic_name.trim(), description: form.description.trim() || null, breakdown: null };
  }

  function checkSumAndSave(form: typeof newForm, mode: CompMode, save: () => void) {
    if (mode === 'structured') {
      const sum = form.breakdown.reduce((a, b) => a + b.percent, 0);
      if (sum !== 100) { setSumWarn(true); return; }
    }
    save();
  }

  const createMut = useMutation({
    mutationFn: () => codesApi.create('compositions', buildPayload(newForm, newMode)),
    onSuccess: () => { invalidate(); setAddingNew(false); setNewForm({ arabic_name: '', description: '', breakdown: [] }); setSumWarn(false); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id }: { id: number }) => codesApi.update('compositions', id, buildPayload(editForm, editMode)),
    onSuccess: () => { invalidate(); setEditingId(null); setSumWarn(false); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => codesApi.deactivate('compositions', id, force),
    onSuccess: () => { invalidate(); setDeleteTarget(null); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => codesApi.restore('compositions', id),
    onSuccess: () => { invalidate(); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  function ModeToggle({ mode, onChange }: { mode: CompMode; onChange: (m: CompMode) => void }) {
    return (
      <div className="flex rounded border border-border overflow-hidden text-xs self-start">
        <button type="button" onClick={() => onChange('string')} className={`px-2 py-1 ${mode === 'string' ? 'bg-primary text-primary-foreground' : 'bg-canvas text-muted-foreground'}`}>{ar.codes.compositionModeString}</button>
        <button type="button" onClick={() => onChange('structured')} className={`px-2 py-1 ${mode === 'structured' ? 'bg-primary text-primary-foreground' : 'bg-canvas text-muted-foreground'}`}>{ar.codes.compositionModeStructured}</button>
      </div>
    );
  }

  function BdBuilder({ items, onChange }: { items: BdItem[]; onChange: (v: BdItem[]) => void }) {
    const sum = items.reduce((a, b) => a + b.percent, 0);
    return (
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex gap-1 items-center">
            <input type="text" dir="rtl" value={item.material} placeholder={ar.codes.material}
              onChange={(e) => { const n = [...items]; n[i] = { ...item, material: e.target.value }; onChange(n); }}
              className="border border-border rounded px-2 py-0.5 text-xs bg-canvas w-28 focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="number" value={item.percent} min={0} max={100}
              onChange={(e) => { const n = [...items]; n[i] = { ...item, percent: Number(e.target.value) }; onChange(n); }}
              className="border border-border rounded px-2 py-0.5 text-xs bg-canvas w-14 focus:outline-none focus:ring-1 focus:ring-primary" />
            <span className="text-xs text-muted-foreground">%</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-danger/60 hover:text-danger text-xs cursor-pointer transition-colors duration-150">✕</button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onChange([...items, { material: '', percent: 0 }])}
            className="text-xs text-primary hover:underline cursor-pointer">{ar.codes.addMaterial}</button>
          {items.length > 0 && (
            <span className={`text-xs font-medium tabular-num ${sum === 100 ? 'text-success' : 'text-warning-foreground'}`}>{sum}%</span>
          )}
        </div>
      </div>
    );
  }

  function CompFormCells({ form, mode, onChange, onModeChange }: {
    form: typeof newForm; mode: CompMode;
    onChange: (f: typeof newForm) => void; onModeChange: (m: CompMode) => void;
  }) {
    return (
      <>
        <Td>
          <div className="space-y-1">
            <InlineInput value={form.arabic_name} onChange={(v) => onChange({ ...form, arabic_name: v })} placeholder="تركيبة جديدة" />
            <ModeToggle mode={mode} onChange={onModeChange} />
          </div>
        </Td>
        <Td>
          {mode === 'string' ? (
            <textarea dir="rtl" value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              placeholder="94% قطن 6% ليكرا"
              rows={2}
              className="border border-border rounded px-2 py-1 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary w-full resize-none" />
          ) : (
            <BdBuilder items={form.breakdown} onChange={(bd) => onChange({ ...form, breakdown: bd, description: breakdownToString(bd) })} />
          )}
        </Td>
      </>
    );
  }

  if (isLoading) return <p className="text-sm text-foreground-muted p-4">{ar.loading}</p>;

  return (
    <div className="space-y-4">
      <Toolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter}
        isOwner={isOwner} onAdd={() => { setAddingNew(true); setEditingId(null); }} />
      {err && <p role="alert" className="text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md px-3 py-2 transition-opacity duration-75 ease-standard">{err}</p>}
      {sumWarn && (
        <div className="bg-warning-subtle border border-warning/30 rounded-md px-3 py-2 flex items-center gap-3">
          <span className="text-sm text-warning-foreground">{ar.codes.compositionSum100Warn}</span>
          <Button size="sm" variant="outline" onClick={() => { setSumWarn(false); createMut.mutate(); }}>{ar.common.confirm}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSumWarn(false)}>{ar.common.cancel}</Button>
        </div>
      )}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse">
          <thead className="bg-surface-hover/50 sticky top-0 z-sticky">
            <tr>
              <Th>{ar.codes.columns.nameAr}</Th>
              <Th>{ar.codes.columns.description}</Th>
              <Th center>{ar.codes.columns.usage}</Th>
              <Th center>{ar.codes.columns.status}</Th>
              {isOwner && <Th center>{ar.codes.columns.actions}</Th>}
            </tr>
          </thead>
          <tbody>
            {addingNew && (
              <tr className="bg-info-subtle/50 align-top">
                <CompFormCells form={newForm} mode={newMode} onChange={setNewForm} onModeChange={setNewMode} />
                <Td center>—</Td>
                <Td center>—</Td>
                <Td center>
                  <SaveCancelBtns
                    onSave={() => checkSumAndSave(newForm, newMode, () => createMut.mutate())}
                    onCancel={() => { setAddingNew(false); setSumWarn(false); setErr(null); }}
                    disabled={!newForm.arabic_name || createMut.isPending}
                  />
                </Td>
              </tr>
            )}
            {filtered.length === 0 && !addingNew && (
              <tr><td colSpan={isOwner ? 5 : 4} className="py-8 text-center text-sm text-muted-foreground">{ar.codes.noResults}</td></tr>
            )}
            {filtered.map((c) =>
              editingId === c.id ? (
                <tr key={c.id} className="bg-info-subtle/60 align-top">
                  <CompFormCells form={editForm} mode={editMode} onChange={setEditForm} onModeChange={setEditMode} />
                  <Td center>{c.usage_count}</Td>
                  <Td center><StatusBadge active={c.is_active} /></Td>
                  <Td center>
                    <SaveCancelBtns
                      onSave={() => checkSumAndSave(editForm, editMode, () => updateMut.mutate({ id: c.id }))}
                      onCancel={() => { setEditingId(null); setSumWarn(false); setErr(null); }}
                      disabled={!editForm.arabic_name || updateMut.isPending}
                    />
                  </Td>
                </tr>
              ) : (
                <tr key={c.id} className="hover:bg-surface-hover transition-colors duration-150">
                  <Td>{c.arabic_name}</Td>
                  <Td muted><span className="truncate block max-w-64">{c.description ?? '—'}</span></Td>
                  <Td center>
                    <UsageBadge count={c.usage_count} onClick={() => setRefsItem({ id: c.id, name: c.arabic_name })} />
                  </Td>
                  <Td center><StatusBadge active={c.is_active} /></Td>
                  {isOwner && (
                    <Td center>
                      <RowActions isActive={c.is_active} isOwner={isOwner}
                        onEdit={() => {
                          setEditingId(c.id);
                          const hasBd = Array.isArray(c.breakdown) && c.breakdown.length > 0;
                          setEditMode(hasBd ? 'structured' : 'string');
                          setEditForm({ arabic_name: c.arabic_name, description: c.description ?? '', breakdown: c.breakdown ?? [] });
                          setAddingNew(false);
                        }}
                        onDelete={() => { setDeleteTarget(c); setErr(null); }}
                        onRestore={() => restoreMut.mutate(c.id)}
                      />
                    </Td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {deleteTarget && (
        <DeleteDialog name={deleteTarget.arabic_name} usageCount={deleteTarget.usage_count} isOwner={isOwner} pending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate({ id: deleteTarget.id, force: false })}
          onForce={() => deleteMut.mutate({ id: deleteTarget.id, force: true })}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {refsItem && <RefsSheet entity="compositions" item={refsItem} onClose={() => setRefsItem(null)} />}
    </div>
  );
}

// ── Suppliers Tab ─────────────────────────────────────────────────────────────

function SuppliersTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ arabic_name: '', arabic_warning_text: '' });
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ arabic_name: '', arabic_warning_text: '' });
  const [deleteTarget, setDeleteTarget] = useState<CodeSupplier | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['codes-page', 'suppliers', filter],
    queryFn: () => codesApi.listSuppliersFiltered(filter),
  });

  const filtered = useMemo(() => data.filter((s) => s.arabic_name.includes(search)), [data, search]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['codes-page', 'suppliers'] });
    qc.invalidateQueries({ queryKey: ['codes-suppliers'] });
    qc.invalidateQueries({ queryKey: ['codes-suppliers-all'] });
  }

  const createMut = useMutation({
    mutationFn: () => codesApi.create('suppliers', { arabic_name: newForm.arabic_name.trim(), arabic_warning_text: newForm.arabic_warning_text.trim() || null }),
    onSuccess: () => { invalidate(); setAddingNew(false); setNewForm({ arabic_name: '', arabic_warning_text: '' }); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id }: { id: number }) => codesApi.update('suppliers', id, { arabic_name: editForm.arabic_name.trim(), arabic_warning_text: editForm.arabic_warning_text.trim() || null }),
    onSuccess: () => { invalidate(); setEditingId(null); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => codesApi.deactivate('suppliers', id, force),
    onSuccess: () => { invalidate(); setDeleteTarget(null); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => codesApi.restore('suppliers', id),
    onSuccess: () => { invalidate(); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  if (isLoading) return <p className="text-sm text-foreground-muted p-4">{ar.loading}</p>;

  return (
    <div className="space-y-4">
      <Toolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter}
        isOwner={isOwner} onAdd={() => { setAddingNew(true); setEditingId(null); }} />
      {err && <p role="alert" className="text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md px-3 py-2 transition-opacity duration-75 ease-standard">{err}</p>}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse">
          <thead className="bg-surface-hover/50 sticky top-0 z-sticky">
            <tr>
              <Th>{ar.codes.columns.nameAr}</Th>
              <Th>{ar.codes.columns.warningText}</Th>
              <Th center>{ar.codes.columns.status}</Th>
              {isOwner && <Th center>{ar.codes.columns.actions}</Th>}
            </tr>
          </thead>
          <tbody>
            {addingNew && (
              <tr className="bg-info-subtle/50">
                <Td><InlineInput value={newForm.arabic_name} onChange={(v) => setNewForm({ ...newForm, arabic_name: v })} placeholder="اسم المورد" /></Td>
                <Td>
                  <textarea dir="rtl" value={newForm.arabic_warning_text}
                    onChange={(e) => setNewForm({ ...newForm, arabic_warning_text: e.target.value })}
                    rows={2} placeholder="نص التحذير على ملصق الموردين"
                    className="border border-border rounded px-2 py-1 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary w-full resize-none" />
                </Td>
                <Td center>—</Td>
                <Td center>
                  <SaveCancelBtns onSave={() => createMut.mutate()} onCancel={() => { setAddingNew(false); setErr(null); }} disabled={!newForm.arabic_name || createMut.isPending} />
                </Td>
              </tr>
            )}
            {filtered.length === 0 && !addingNew && (
              <tr><td colSpan={isOwner ? 4 : 3} className="py-8 text-center text-sm text-muted-foreground">{ar.codes.noResults}</td></tr>
            )}
            {filtered.map((s) =>
              editingId === s.id ? (
                <tr key={s.id} className="bg-info-subtle/60 align-top">
                  <Td><InlineInput value={editForm.arabic_name} onChange={(v) => setEditForm({ ...editForm, arabic_name: v })} /></Td>
                  <Td>
                    <textarea dir="rtl" value={editForm.arabic_warning_text}
                      onChange={(e) => setEditForm({ ...editForm, arabic_warning_text: e.target.value })}
                      rows={2}
                      className="border border-border rounded px-2 py-1 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary w-full resize-none" />
                  </Td>
                  <Td center><StatusBadge active={s.is_active} /></Td>
                  <Td center>
                    <SaveCancelBtns onSave={() => updateMut.mutate({ id: s.id })} onCancel={() => { setEditingId(null); setErr(null); }} disabled={!editForm.arabic_name || updateMut.isPending} />
                  </Td>
                </tr>
              ) : (
                <tr key={s.id} className="hover:bg-surface-hover transition-colors duration-150">
                  <Td>{s.arabic_name}</Td>
                  <Td muted><span className="truncate block max-w-64">{s.arabic_warning_text ?? '—'}</span></Td>
                  <Td center><StatusBadge active={s.is_active} /></Td>
                  {isOwner && (
                    <Td center>
                      <RowActions isActive={s.is_active} isOwner={isOwner}
                        onEdit={() => { setEditingId(s.id); setEditForm({ arabic_name: s.arabic_name, arabic_warning_text: s.arabic_warning_text ?? '' }); setAddingNew(false); }}
                        onDelete={() => { setDeleteTarget(s); setErr(null); }}
                        onRestore={() => restoreMut.mutate(s.id)}
                      />
                    </Td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {deleteTarget && (
        <DeleteDialog name={deleteTarget.arabic_name} usageCount={deleteTarget.usage_count} isOwner={isOwner} pending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate({ id: deleteTarget.id, force: false })}
          onForce={() => deleteMut.mutate({ id: deleteTarget.id, force: true })}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Settings Reason Tab (cancellations / damage / expense) ────────────────────

function SettingsReasonTab({
  settingsKey, isOwner,
}: {
  settingsKey: 'reason_codes.cancellation' | 'reason_codes.damage' | 'reason_codes.expense';
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const { data: allSettings, isLoading } = useQuery({
    queryKey: ['settings-all'],
    queryFn: settingsApi.getAll,
  });

  const raw = allSettings?.[settingsKey];
  const [items, setItems] = useState<ReasonCode[]>([]);
  const [initialised, setInitialised] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sync from server once loaded
  if (!initialised && raw !== undefined) {
    setItems(Array.isArray(raw) ? (raw as ReasonCode[]) : []);
    setInitialised(true);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await settingsApi.set(settingsKey, items);
      qc.invalidateQueries({ queryKey: ['settings-all'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(extractApiError(e));
    } finally {
      setSaving(false);
    }
  }

  function addRow() {
    if (!newCode.trim() || !newName.trim()) return;
    setItems((prev) => [...prev, { code: newCode.trim(), name_ar: newName.trim() }]);
    setNewCode('');
    setNewName('');
  }

  if (isLoading) return <p className="text-sm text-foreground-muted p-4">{ar.loading}</p>;

  return (
    <div className="space-y-4 max-w-lg">
      {err && <p role="alert" className="text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md px-3 py-2 transition-opacity duration-75 ease-standard">{err}</p>}
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-surface-hover/50 sticky top-0 z-sticky">
            <tr>
              <Th>{ar.codes.columns.reasonCode}</Th>
              <Th>{ar.codes.columns.nameAr}</Th>
              {isOwner && <Th center>{ar.codes.columns.actions}</Th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.code} className="hover:bg-surface-hover transition-colors duration-150">
                <Td><span className="font-mono text-xs text-muted-foreground">{item.code}</span></Td>
                <Td>
                  {isOwner ? (
                    <input dir="rtl" value={item.name_ar}
                      onChange={(e) => { const n = [...items]; n[idx] = { ...item, name_ar: e.target.value }; setItems(n); }}
                      className="border border-border rounded px-2 py-0.5 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary w-full" />
                  ) : item.name_ar}
                </Td>
                {isOwner && (
                  <Td center>
                    <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="p-1 rounded hover:bg-danger-subtle text-foreground-muted hover:text-danger transition-colors duration-150 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={isOwner ? 3 : 2} className="py-6 text-center text-sm text-muted-foreground">{ar.codes.noResults}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {isOwner && (
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{ar.codes.columns.reasonCode}</label>
            <input dir="rtl" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="code_key"
              className="border border-border rounded px-2 py-1.5 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary w-28" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{ar.codes.columns.nameAr}</label>
            <input dir="rtl" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="الاسم"
              className="border border-border rounded px-2 py-1.5 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary w-40" />
          </div>
          <Button size="sm" variant="outline" onClick={addRow} disabled={!newCode || !newName}>
            <Plus className="w-3.5 h-3.5 ml-1" />{ar.codes.addNew}
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? ar.loading : ar.common.save}
          </Button>
          {saved && <span className="text-sm text-success-foreground">{ar.common.success}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function CodesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab);
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  function changeTab(tab: TabKey) {
    setActiveTab(tab);
    window.history.replaceState(null, '', `${window.location.pathname}#${tab}`);
  }

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Page header + tab bar */}
      <div className="px-6 pt-6 pb-0 border-b border-border-subtle bg-surface sticky top-0 z-sticky space-y-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">{ar.codes.pageTitle}</h1>
          <p className="text-sm text-foreground-muted mt-1">{ar.codes.hubDesc}</p>
        </div>
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => changeTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors duration-200 ease-emphasized cursor-pointer
                ${activeTab === tab.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-foreground-muted hover:text-foreground hover:border-border-subtle'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'colors'       && <ColorsTab       isOwner={isOwner} />}
        {activeTab === 'grades'       && <GradesTab       isOwner={isOwner} />}
        {activeTab === 'brands'       && <BrandsTab       isOwner={isOwner} />}
        {activeTab === 'compositions' && <CompositionsTab isOwner={isOwner} />}
        {activeTab === 'suppliers'    && <SuppliersTab    isOwner={isOwner} />}
        {activeTab === 'damage'       && <SettingsReasonTab settingsKey="reason_codes.damage"  isOwner={isOwner} />}
        {activeTab === 'expense'      && <SettingsReasonTab settingsKey="reason_codes.expense" isOwner={isOwner} />}
      </div>
    </div>
  );
}
