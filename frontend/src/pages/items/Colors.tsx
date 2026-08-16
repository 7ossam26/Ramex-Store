import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { codesApi, type CodeColor } from '@/lib/codes-api';
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
import { PageShell } from '@/components/Layout/PageShell';
import { StatusPill } from '@/components/StatusPill';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuth } from '@/lib/auth';
import { isOwnerOrAbove } from '@/lib/roles';
import { extractApiError } from '@/lib/api-error';
import { ErrorBanner } from '@/components/ErrorBanner';
import { TableFilterBar } from '@/components/TableFilterBar';
import { matchesTokens, tokenize } from '@/lib/arabic-search';

type FormState = { name_ar: string; english_name: string };
const blank = (): FormState => ({ name_ar: '', english_name: '' });

function invalidateColorKeys(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['codes-colors-all'] });
  qc.invalidateQueries({ queryKey: ['codes-colors'] });
  qc.invalidateQueries({ queryKey: ['colors'] });
  qc.invalidateQueries({ queryKey: ['colors-list'] });
}

export function ColorsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = isOwnerOrAbove(user?.role);

  const colorsQ = useQuery({
    queryKey: ['codes-colors-all'],
    queryFn: codesApi.listAllColors,
  });
  const colors = colorsQ.data ?? [];

  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const tokens = tokenize(search);
    return colors.filter((c) => matchesTokens(tokens, [c.name_ar, c.code, c.english_name]));
  }, [colors, search]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CodeColor | null>(null);
  const [form, setForm] = useState<FormState>(blank());
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CodeColor | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openCreate() {
    setEditTarget(null);
    setForm(blank());
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(c: CodeColor) {
    setEditTarget(c);
    setForm({ name_ar: c.name_ar, english_name: c.english_name ?? '' });
    setFormError(null);
    setDialogOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        name_ar: form.name_ar.trim(),
        english_name: form.english_name.trim() || null,
      };
      return editTarget
        ? codesApi.update('colors', editTarget.id, payload)
        : codesApi.create('colors', payload);
    },
    onSuccess: () => {
      invalidateColorKeys(qc);
      setDialogOpen(false);
      setFormError(null);
    },
    onError: (e) => setFormError(extractApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => codesApi.deactivate('colors', id),
    onSuccess: () => {
      invalidateColorKeys(qc);
      setPendingDelete(null);
      setDeleteError(null);
    },
    onError: (e) => {
      setDeleteError(extractApiError(e));
      setPendingDelete(null);
    },
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => codesApi.restore('colors', id),
    onSuccess: () => invalidateColorKeys(qc),
    onError: (e) => setDeleteError(extractApiError(e)),
  });

  const columns: Column<CodeColor>[] = [
    {
      key: 'name_ar',
      header: ar.colors.nameAr,
      cell: (c) => <span className="font-medium text-foreground">{c.name_ar}</span>,
      primary: true,
    },
    {
      key: 'code',
      header: ar.colors.code,
      cell: (c) => (
        <span className="font-mono text-xs text-foreground-muted" dir="ltr">
          {c.code}
        </span>
      ),
      secondary: true,
    },
    {
      key: 'english_name',
      header: ar.colors.englishName,
      cell: (c) => (
        <span className="text-foreground-muted text-sm">{c.english_name ?? '—'}</span>
      ),
    },
    {
      key: 'is_active',
      header: ar.colors.isActive,
      cell: (c) => (
        <StatusPill tone={c.is_active ? 'success' : 'neutral'}>
          {c.is_active ? ar.codes.active : ar.codes.inactive}
        </StatusPill>
      ),
    },
  ];

  return (
    <PageShell
      title={ar.colors.title}
      backTo="/items"
    >
      {isOwner && (
        <button
          onClick={openCreate}
          className="group flex w-full items-center gap-4 rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 px-5 py-4 text-right transition-all duration-150 hover:border-accent/70 hover:bg-accent/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-sm">
            <Plus className="size-5" />
          </div>
          <div className="text-right">
            <div className="font-semibold text-foreground">{ar.colors.addColor}</div>
            <div className="text-sm text-foreground-muted">{ar.hubs.itemsColorsDesc}</div>
          </div>
        </button>
      )}

      {deleteError && (
        <div role="alert" className="p-3 rounded-md border border-danger/30 bg-danger-subtle text-sm text-danger-foreground">
          {deleteError}
        </div>
      )}

      <TableFilterBar
        search={{ value: search, onChange: setSearch, placeholder: ar.colors.searchPlaceholder }}
        resultCount={filtered.length}
      />

      <ResponsiveTable
        columns={columns}
        rows={filtered}
        rowKey={(c) => String(c.id)}
        empty={search.trim() && colors.length > 0 ? ar.labels.noSearchResults : ar.codes.noResults}
        isLoading={colorsQ.isLoading}
        isError={colorsQ.isError}
        onRetry={() => colorsQ.refetch()}
        resetKey={search}
        actions={
          isOwner
            ? (c) => (
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => openEdit(c)} aria-label={ar.colors.edit}>
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  {c.is_active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setDeleteError(null); setPendingDelete(c); }}
                      aria-label={ar.colors.delete}
                      className="text-danger hover:text-danger"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreMut.mutate(c.id)}
                      aria-label={ar.colors.restore}
                      className="text-success hover:text-success"
                      disabled={restoreMut.isPending}
                    >
                      <Undo2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              )
            : undefined
        }
      />

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? ar.colors.editTitle : ar.colors.createTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {formError && (
              <ErrorBanner
                title={ar.common.error}
                description={formError}
                onRetry={() => setFormError(null)}
                retryLabel="إغلاق"
              />
            )}
            <div className="space-y-1.5">
              <Label htmlFor="color-name-ar">{ar.colors.nameAr}</Label>
              <Input
                id="color-name-ar"
                dir="rtl"
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color-english-name">{ar.colors.englishName}</Label>
              <Input
                id="color-english-name"
                dir="ltr"
                value={form.english_name}
                onChange={(e) => setForm({ ...form, english_name: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-start pt-1">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={!form.name_ar.trim() || saveMut.isPending}
              >
                {ar.common.save}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {ar.common.cancel}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        message={pendingDelete ? `${ar.colors.confirmDelete}\n${pendingDelete.name_ar}` : ''}
        onConfirm={() => pendingDelete && deleteMut.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </PageShell>
  );
}
