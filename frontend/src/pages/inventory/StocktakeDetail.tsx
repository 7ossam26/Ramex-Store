import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Search, Undo2 } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { extractApiError } from '@/lib/api-error';
import { matchesTokens, tokenize } from '@/lib/arabic-search';
import { cn } from '@/lib/utils';
import type {
  ResolveStocktakeItem,
  StocktakeLineDetail,
  StocktakeResolutionAction,
  StocktakeWithLines,
  Warehouse,
} from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScannerInput } from '@/components/ScannerInput';
import { PageShell } from '@/components/Layout/PageShell';
import { StatusPill } from '@/components/StatusPill';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FilterChip } from '@/components/FilterChip';
import { Toast, type ToastTone } from '@/components/Toast';
import { StocktakeStatusPill } from './Stocktake';
import { SearchableSelect } from '@/components/ui/searchable-select';

const WAREHOUSES: Warehouse[] = ['shop', 'factory', 'damaged_shop'];
const t = ar.stocktake;

const selectClass =
  'w-full h-9 rounded-md border border-border-default bg-surface-elevated px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75';
const thClass = 'py-2.5 px-2 font-medium whitespace-nowrap';
const rowClass =
  'border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150';

function unitLabel(l: StocktakeLineDetail): string {
  return l.fabric_unit === 'meter' ? 'م' : 'كجم';
}

function fmtQty(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(Number(Number(v).toFixed(3)));
}

function systemQty(l: StocktakeLineDetail): string | null {
  return l.fabric_unit === 'meter' ? l.expected_length_m : l.expected_weight_kg;
}

function actualQty(l: StocktakeLineDetail): string | null {
  return l.fabric_unit === 'meter' ? l.actual_length_m : l.actual_weight_kg;
}

function signed(n: number): string {
  return n > 0 ? `+${fmtQty(n)}` : fmtQty(n);
}

function rollStatusLabel(s: string | null): string {
  return s ? (ar.rollStatuses as Record<string, string>)[s] ?? s : '—';
}

function summarize(lines: StocktakeLineDetail[]) {
  const expected = lines.filter((l) => l.line_kind === 'expected');
  return {
    expected: expected.length,
    scanned: expected.filter((l) => l.actual_count !== null).length,
    missing: lines.filter((l) => l.issue === 'missing' && l.resolution !== 'changed_during_count').length,
    unexpected: lines.filter((l) => l.issue === 'unexpected').length,
    qtyDiff: lines.filter((l) => l.issue === 'quantity_diff').length,
  };
}

export function StocktakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const stocktakeId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<'complete' | 'cancel' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['stocktake', stocktakeId],
    queryFn: () => inventoryApi.getStocktake(stocktakeId),
    enabled: Number.isFinite(stocktakeId),
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['stocktake', stocktakeId] });
    qc.invalidateQueries({ queryKey: ['stocktakes'] });
  }, [qc, stocktakeId]);

  const completeM = useMutation({
    mutationFn: () => inventoryApi.completeStocktake(stocktakeId),
    onSuccess: () => { setActionError(null); refresh(); window.scrollTo({ top: 0 }); },
    onError: (e) => setActionError(extractApiError(e)),
  });
  const cancelM = useMutation({
    mutationFn: () => inventoryApi.cancelStocktake(stocktakeId),
    onSuccess: () => { refresh(); navigate('/inventory/stocktake'); },
    onError: (e) => setActionError(extractApiError(e)),
  });

  const st = q.data;
  const summary = useMemo(() => summarize(st?.lines ?? []), [st]);

  if (q.isLoading) {
    return (
      <PageShell title={t.title} backTo="/inventory/stocktake">
        <TableSkeleton rows={8} columns={6} />
      </PageShell>
    );
  }
  if (q.isError || !st) {
    return (
      <PageShell title={t.title} backTo="/inventory/stocktake">
        {q.isError
          ? <ErrorBanner title="تعذر تحميل تفاصيل الجرد" onRetry={() => q.refetch()} />
          : <EmptyState title="الجرد غير موجود" icon={ClipboardList} />}
      </PageShell>
    );
  }

  const isOpen = st.status === 'open';
  const unresolved = st.lines.filter((l) => l.allowed_actions.length > 0).length;

  return (
    <PageShell
      title={`${st.stocktake_no} — ${ar.warehouses[st.warehouse]}`}
      description={st.mode === 'roll_level' ? t.rollLevel : t.aggregate}
      backTo="/inventory/stocktake"
      actions={
        isOpen ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirm('cancel')} disabled={cancelM.isPending}>
              {t.cancel}
            </Button>
            <Button onClick={() => setConfirm('complete')} disabled={completeM.isPending}>
              {t.complete}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <StocktakeStatusPill s={{ status: st.status, unresolved_count: unresolved }} />
        <span className="text-xs text-foreground-muted">
          {t.started}: {new Date(st.started_at).toLocaleString('ar-EG-u-nu-latn')}
        </span>
      </div>

      {actionError && <ErrorBanner title={actionError} />}

      {st.mode === 'roll_level' ? (
        <>
          <SummaryCards summary={summary} />
          {isOpen && <ScanCard st={st} onChanged={refresh} />}
          {st.status === 'completed' && <ResolutionCard st={st} onResolved={refresh} />}
          <RollLinesCard st={st} onChanged={refresh} />
        </>
      ) : (
        <AggregateCard st={st} onChanged={refresh} />
      )}

      <ConfirmDialog
        open={confirm === 'complete'}
        title={t.completeConfirmTitle}
        message={
          st.mode === 'roll_level'
            ? t.completeConfirm(summary.missing, summary.unexpected, summary.qtyDiff)
            : t.completed
        }
        onConfirm={() => { setConfirm(null); completeM.mutate(); }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title={t.cancel}
        message={t.cancelConfirm}
        onConfirm={() => { setConfirm(null); cancelM.mutate(); }}
        onCancel={() => setConfirm(null)}
      />
    </PageShell>
  );
}

function SummaryCards({ summary }: { summary: ReturnType<typeof summarize> }) {
  const items: { label: string; value: string; tone?: string }[] = [
    { label: t.summaryExpected, value: String(summary.expected) },
    { label: t.summaryScanned, value: `${summary.scanned} / ${summary.expected}`, tone: 'text-success-foreground' },
    { label: t.summaryMissing, value: String(summary.missing), tone: summary.missing ? 'text-danger-foreground' : undefined },
    { label: t.summaryUnexpected, value: String(summary.unexpected), tone: summary.unexpected ? 'text-warning-foreground' : undefined },
    { label: t.summaryQtyDiff, value: String(summary.qtyDiff), tone: summary.qtyDiff ? 'text-warning-foreground' : undefined },
  ];
  const pct = summary.expected ? Math.round((summary.scanned / summary.expected) * 100) : 0;
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {items.map((i) => (
            <div key={i.label} className="rounded-md border border-border-subtle px-3 py-2">
              <div className="text-xs text-foreground-muted">{i.label}</div>
              <div className={cn('text-lg font-semibold tabular-num', i.tone)}>{i.value}</div>
            </div>
          ))}
        </div>
        <div className="h-2 w-full rounded-pill bg-surface-hover overflow-hidden" aria-label={t.progress(summary.scanned, summary.expected)}>
          <div className="h-full bg-success transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScanCard({ st, onChanged }: { st: StocktakeWithLines; onChanged: () => void }) {
  const [toast, setToast] = useState<{ msg: string; tone: ToastTone } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  const scanM = useMutation({
    mutationFn: (barcode: string) => inventoryApi.scanStocktake(st.id, barcode),
    onSuccess: (res) => {
      onChanged();
      const l = res.line;
      if (res.alreadyScanned) {
        setToast({ msg: `${t.scanAlready} — ${l.internal_barcode ?? ''}`, tone: 'info' });
      } else if (l.line_kind === 'unexpected') {
        setToast({
          msg: t.scanUnexpected(
            l.system_warehouse ? ar.warehouses[l.system_warehouse] : '—',
            rollStatusLabel(l.system_status),
          ),
          tone: 'warning',
        });
      } else {
        setToast({ msg: `${t.scanOk} ✓ ${l.internal_barcode ?? ''}`, tone: 'success' });
      }
    },
    onError: (e) => setToast({ msg: extractApiError(e), tone: 'danger' }),
  });

  return (
    <Card>
      <CardContent className="pt-4 space-y-1">
        <Label>{t.scanPrompt}</Label>
        <ScannerInput
          onScan={(b) => scanM.mutate(b)}
          placeholder={ar.labels.scanHint}
          disabled={scanM.isPending}
        />
      </CardContent>
      <Toast open={!!toast} message={toast?.msg ?? ''} tone={toast?.tone} onClose={closeToast} />
    </Card>
  );
}

type Filter = 'all' | 'not_scanned' | 'scanned' | 'unexpected' | 'qty';

function RollLinesCard({ st, onChanged }: { st: StocktakeWithLines; onChanged: () => void }) {
  const isOpen = st.status === 'open';
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const measureM = useMutation({
    mutationFn: (v: { line: StocktakeLineDetail; value: number | null }) =>
      inventoryApi.updateStocktakeLine(
        st.id,
        v.line.id,
        v.line.fabric_unit === 'meter' ? { actual_length_m: v.value } : { actual_weight_kg: v.value },
      ),
    onSuccess: () => { setError(null); onChanged(); },
    onError: (e) => setError(extractApiError(e)),
  });
  const unscanM = useMutation({
    mutationFn: (lineId: number) => inventoryApi.unscanStocktakeLine(st.id, lineId),
    onSuccess: () => { setError(null); onChanged(); },
    onError: (e) => setError(extractApiError(e)),
  });

  const counts = useMemo(() => ({
    all: st.lines.length,
    not_scanned: st.lines.filter((l) => l.actual_count === null).length,
    scanned: st.lines.filter((l) => l.actual_count !== null && l.line_kind === 'expected').length,
    unexpected: st.lines.filter((l) => l.line_kind === 'unexpected').length,
    qty: st.lines.filter((l) => l.issue === 'quantity_diff').length,
  }), [st.lines]);

  const rows = useMemo(() => {
    const tokens = tokenize(search);
    return st.lines
      .filter((l) => {
        switch (filter) {
          case 'not_scanned': return l.actual_count === null;
          case 'scanned': return l.actual_count !== null && l.line_kind === 'expected';
          case 'unexpected': return l.line_kind === 'unexpected';
          case 'qty': return l.issue === 'quantity_diff';
          default: return true;
        }
      })
      .filter((l) => matchesTokens(tokens, [
        l.internal_barcode, l.external_barcode, l.fabric_name_ar, l.color_name_ar, l.color_code, l.roll_sr_no,
      ]));
  }, [st.lines, filter, search]);

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: t.filterAll },
    { key: 'not_scanned', label: t.filterNotScanned },
    { key: 'scanned', label: t.filterScanned },
    { key: 'unexpected', label: t.filterUnexpected },
    { key: 'qty', label: t.filterQtyDiff },
  ];

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)} count={counts[c.key]}>
              {c.label}
            </FilterChip>
          ))}
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-foreground-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} className="ps-9" />
        </div>
        {error && <ErrorBanner title={error} />}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="لا توجد أتواب مطابقة" icon={ClipboardList} bordered={false} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ textAlign: 'center' }}>
              <thead className="text-xs text-foreground-muted uppercase tracking-wide">
                <tr className="border-b border-border-subtle">
                  <th className={thClass}>{t.barcode}</th>
                  <th className={thClass}>{t.fabric}</th>
                  <th className={thClass}>{t.color}</th>
                  <th className={thClass}>{t.topNo}</th>
                  <th className={thClass}>{t.systemQty}</th>
                  <th className={thClass}>{t.actualQty}</th>
                  <th className={thClass}>{t.qtyDiff}</th>
                  <th className={thClass}>{t.state}</th>
                  {!isOpen && <th className={thClass}>{t.actionCol}</th>}
                  {isOpen && <th className={thClass}></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className={rowClass}>
                    <td className="py-2 px-2 font-mono text-foreground" dir="ltr">{l.internal_barcode ?? `#${l.roll_id}`}</td>
                    <td className="px-2">{l.fabric_name_ar ?? '—'}</td>
                    <td className="px-2">{l.color_name_ar ? `${l.color_name_ar} (${l.color_code})` : '—'}</td>
                    <td className="px-2 tabular-num">{l.roll_sr_no ?? l.top_number ?? '—'}</td>
                    <td className="px-2 tabular-num whitespace-nowrap">{fmtQty(systemQty(l))} {unitLabel(l)}</td>
                    <td className="px-2">
                      {isOpen && l.actual_count !== null ? (
                        <MeasureInput key={`${l.id}-${actualQty(l)}`} line={l} disabled={measureM.isPending} onSave={(value) => measureM.mutate({ line: l, value })} />
                      ) : (
                        <span className="tabular-num">{actualQty(l) !== null ? `${fmtQty(actualQty(l))} ${unitLabel(l)}` : '—'}</span>
                      )}
                    </td>
                    <td className={cn('px-2 tabular-num', l.qty_diff ? (l.qty_diff < 0 ? 'text-danger-foreground' : 'text-warning-foreground') : 'text-foreground-muted')}>
                      {l.qty_diff !== null ? signed(l.qty_diff) : '—'}
                    </td>
                    <td className="px-2"><LineStatePill line={l} open={isOpen} /></td>
                    {!isOpen && <td className="px-2"><ResolutionLabel line={l} /></td>}
                    {isOpen && (
                      <td className="px-2">
                        {l.actual_count !== null && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t.unscan}
                            aria-label={t.unscan}
                            disabled={unscanM.isPending}
                            onClick={() => unscanM.mutate(l.id)}
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MeasureInput({
  line, disabled, onSave,
}: { line: StocktakeLineDetail; disabled: boolean; onSave: (v: number | null) => void }) {
  const current = actualQty(line);
  const [draft, setDraft] = useState(current === null ? '' : fmtQty(current));

  function commit() {
    const trimmed = draft.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    const prev = current === null ? null : Number(current);
    if (value === prev) return;
    onSave(value);
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <Input
        type="number"
        inputMode="decimal"
        step="0.001"
        min="0"
        className="w-24 h-8 text-center"
        placeholder={fmtQty(systemQty(line))}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <span className="text-xs text-foreground-muted">{unitLabel(line)}</span>
    </div>
  );
}

function LineStatePill({ line, open }: { line: StocktakeLineDetail; open: boolean }) {
  if (line.line_kind === 'unexpected') {
    return (
      <StatusPill tone="warning">
        {t.lineUnexpected} — {t.registeredIn} {line.system_warehouse ? ar.warehouses[line.system_warehouse] : '—'}
        {' '}({rollStatusLabel(line.system_status)})
      </StatusPill>
    );
  }
  if (line.actual_count !== null) return <StatusPill tone="success">{t.lineScanned}</StatusPill>;
  return <StatusPill tone={open ? 'neutral' : 'danger'}>{open ? t.lineMissing : t.summaryMissing}</StatusPill>;
}

function ResolutionLabel({ line }: { line: StocktakeLineDetail }) {
  if (!line.resolution) {
    return line.issue ? <StatusPill tone="warning">{t.chooseAction}</StatusPill> : <span className="text-foreground-muted">—</span>;
  }
  const target = line.resolution_target_warehouse ? ` ← ${ar.warehouses[line.resolution_target_warehouse]}` : '';
  return <StatusPill tone="neutral">{t.actions[line.resolution]}{target}</StatusPill>;
}

function issueText(l: StocktakeLineDetail): string {
  if (l.issue === 'missing') return t.issueMissing;
  if (l.issue === 'unexpected') {
    return `${t.issueUnexpected} — ${t.registeredIn} ${l.system_warehouse ? ar.warehouses[l.system_warehouse] : '—'} (${rollStatusLabel(l.system_status)})`;
  }
  return `${t.issueQtyDiff}: ${fmtQty(systemQty(l))} ← ${fmtQty(actualQty(l))} ${unitLabel(l)}`;
}

type Draft = { action?: StocktakeResolutionAction; target?: Warehouse; notes?: string };

function ResolutionCard({ st, onResolved }: { st: StocktakeWithLines; onResolved: () => void }) {
  const pending = st.lines.filter((l) => l.allowed_actions.length > 0);
  const resolved = st.lines.filter((l) => l.resolution !== null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [error, setError] = useState<string | null>(null);

  const resolveM = useMutation({
    mutationFn: (items: ResolveStocktakeItem[]) => inventoryApi.resolveStocktake(st.id, items),
    onSuccess: () => { setDrafts({}); setError(null); onResolved(); },
    onError: (e) => setError(extractApiError(e)),
  });

  function setDraft(lineId: number, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [lineId]: { ...d[lineId], ...patch } }));
  }

  function actionLabel(l: StocktakeLineDetail, a: StocktakeResolutionAction): string {
    if (a === 'transfer' && l.issue === 'unexpected') {
      return `${t.actions.transferHere} (${ar.warehouses[st.warehouse]})`;
    }
    return t.actions[a];
  }

  function submit() {
    const items: ResolveStocktakeItem[] = [];
    for (const l of pending) {
      const d = drafts[l.id];
      if (!d?.action) continue;
      const notes = d.notes?.trim() || undefined;
      if (d.action === 'keep_as_is' && !notes) {
        setError(`${l.internal_barcode ?? ''}: ${t.noteRequired}`);
        return;
      }
      if (d.action === 'transfer' && l.issue === 'missing' && !d.target) {
        setError(`${l.internal_barcode ?? ''}: ${t.targetWarehouse}`);
        return;
      }
      items.push({
        line_id: l.id,
        action: d.action,
        target_warehouse: d.action === 'transfer' && l.issue === 'missing' ? d.target : undefined,
        notes_ar: notes,
      });
    }
    if (items.length === 0) {
      setError(t.chooseAction);
      return;
    }
    resolveM.mutate(items);
  }

  const chosen = pending.filter((l) => drafts[l.id]?.action).length;

  return (
    <>
      {pending.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success-subtle px-3 py-2 text-sm text-success-foreground">
          <CheckCircle2 className="h-4 w-4" /> {t.resolutionDone}
        </div>
      ) : (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle>{t.resolutionTitle} ({pending.length})</CardTitle>
            <p className="text-sm text-foreground-muted">{t.resolutionHint}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <ErrorBanner title={error} />}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ textAlign: 'center' }}>
                <thead className="text-xs text-foreground-muted uppercase tracking-wide">
                  <tr className="border-b border-border-subtle">
                    <th className={thClass}>{t.barcode}</th>
                    <th className={thClass}>{t.fabric}</th>
                    <th className={thClass}>{t.color}</th>
                    <th className={thClass}>{t.issueCol}</th>
                    <th className={cn(thClass, 'min-w-[180px]')}>{t.chooseAction}</th>
                    <th className={cn(thClass, 'min-w-[200px]')}>{t.notes}</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((l) => {
                    const d = drafts[l.id] ?? {};
                    return (
                      <tr key={l.id} className={rowClass}>
                        <td className="py-2 px-2 font-mono" dir="ltr">{l.internal_barcode ?? `#${l.roll_id}`}</td>
                        <td className="px-2">{l.fabric_name_ar ?? '—'}</td>
                        <td className="px-2">{l.color_name_ar ?? '—'}</td>
                        <td className="px-2 text-start">{issueText(l)}</td>
                        <td className="px-2 py-1.5 space-y-1">
                          <SearchableSelect
                            className={selectClass}
                            value={d.action ?? ''}
                            onChange={(e) => setDraft(l.id, { action: (e.target.value || undefined) as StocktakeResolutionAction | undefined })}
                          >
                            <option value="">{t.chooseAction}</option>
                            {l.allowed_actions.map((a) => (
                              <option key={a} value={a}>{actionLabel(l, a)}</option>
                            ))}
                          </SearchableSelect>
                          {d.action === 'transfer' && l.issue === 'missing' && (
                            <SearchableSelect
                              className={selectClass}
                              value={d.target ?? ''}
                              onChange={(e) => setDraft(l.id, { target: (e.target.value || undefined) as Warehouse | undefined })}
                            >
                              <option value="">{t.targetWarehouse}</option>
                              {WAREHOUSES.filter((w) => w !== st.warehouse).map((w) => (
                                <option key={w} value={w}>{ar.warehouses[w]}</option>
                              ))}
                            </SearchableSelect>
                          )}
                        </td>
                        <td className="px-2">
                          <Input
                            className="h-9"
                            value={d.notes ?? ''}
                            placeholder={d.action === 'keep_as_is' ? t.noteRequired : t.noteOptional}
                            onChange={(e) => setDraft(l.id, { notes: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button onClick={submit} disabled={resolveM.isPending || chosen === 0}>
                {t.apply}{chosen > 0 ? ` (${chosen})` : ''}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {resolved.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t.resolvedTitle} ({resolved.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ textAlign: 'center' }}>
                <thead className="text-xs text-foreground-muted uppercase tracking-wide">
                  <tr className="border-b border-border-subtle">
                    <th className={thClass}>{t.barcode}</th>
                    <th className={thClass}>{t.fabric}</th>
                    <th className={thClass}>{t.issueCol}</th>
                    <th className={thClass}>{t.actionCol}</th>
                    <th className={thClass}>{t.notes}</th>
                    <th className={thClass}>{t.byCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((l) => (
                    <tr key={l.id} className={rowClass}>
                      <td className="py-2 px-2 font-mono" dir="ltr">{l.internal_barcode ?? `#${l.roll_id}`}</td>
                      <td className="px-2">{l.fabric_name_ar ?? '—'}</td>
                      <td className="px-2 text-start">{issueText(l)}</td>
                      <td className="px-2"><ResolutionLabel line={l} /></td>
                      <td className="px-2 text-foreground-muted">{l.resolution_notes_ar ?? '—'}</td>
                      <td className="px-2 text-foreground-muted whitespace-nowrap">
                        {l.resolved_by_name_ar ?? '—'}
                        {l.resolved_at && (
                          <div className="text-xs">{new Date(l.resolved_at).toLocaleString('ar-EG-u-nu-latn')}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function AggregateCard({ st, onChanged }: { st: StocktakeWithLines; onChanged: () => void }) {
  const isOpen = st.status === 'open';
  const [draft, setDraft] = useState<Record<number, { count?: string; weight?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const aggM = useMutation({
    mutationFn: (body: { fabric_id: number; color_id: number; actual_count: number; actual_weight_kg?: number }) =>
      inventoryApi.recordStocktakeAggregate(st.id, body),
    onSuccess: () => { setError(null); onChanged(); },
    onError: (e) => setError(extractApiError(e)),
  });

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {!isOpen && <p className="text-sm text-foreground-muted">{t.aggregateNoResolution}</p>}
        {error && <ErrorBanner title={error} />}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ textAlign: 'center' }}>
            <thead className="text-xs text-foreground-muted uppercase tracking-wide">
              <tr className="border-b border-border-subtle">
                <th className={thClass}>{t.fabric}</th>
                <th className={thClass}>{t.color}</th>
                <th className={thClass}>{t.expected}</th>
                <th className={thClass}>{t.actual}</th>
                <th className={thClass}>{t.countDiff}</th>
                <th className={thClass}>{t.weightDiff}</th>
                {isOpen && <th className={thClass}></th>}
              </tr>
            </thead>
            <tbody>
              {st.lines.map((l) => {
                const d = draft[l.id] ?? {};
                const countDiff = l.actual_count === null ? null : Number(l.actual_count) - Number(l.expected_count ?? 0);
                return (
                  <tr key={l.id} className={cn(rowClass, l.issue && !isOpen && 'bg-warning-subtle/40')}>
                    <td className="py-2 px-2">{l.fabric_name_ar ?? l.fabric_id}</td>
                    <td className="px-2">{l.color_name_ar ? `${l.color_name_ar} (${l.color_code})` : l.color_id}</td>
                    <td className="px-2 tabular-num whitespace-nowrap">
                      {l.expected_count ?? '—'} / {fmtQty(l.expected_weight_kg)} كجم
                    </td>
                    <td className="px-2">
                      {isOpen ? (
                        <div className="flex gap-1 justify-center">
                          <Input
                            type="number" inputMode="numeric" step="1" min="0"
                            className="w-20 h-8"
                            defaultValue={l.actual_count ?? ''}
                            onChange={(e) => setDraft((s) => ({ ...s, [l.id]: { ...s[l.id], count: e.target.value } }))}
                          />
                          <Input
                            type="number" inputMode="decimal" step="0.001" min="0"
                            className="w-24 h-8"
                            defaultValue={l.actual_weight_kg ?? ''}
                            onChange={(e) => setDraft((s) => ({ ...s, [l.id]: { ...s[l.id], weight: e.target.value } }))}
                          />
                        </div>
                      ) : (
                        <span className="tabular-num">{l.actual_count ?? '—'} / {fmtQty(l.actual_weight_kg)} كجم</span>
                      )}
                    </td>
                    <td className={cn('px-2 tabular-num', countDiff ? 'text-danger-foreground' : 'text-foreground-muted')}>
                      {countDiff === null ? '—' : signed(countDiff)}
                    </td>
                    <td className={cn('px-2 tabular-num', l.qty_diff ? 'text-warning-foreground' : 'text-foreground-muted')}>
                      {l.qty_diff === null ? '—' : signed(l.qty_diff)}
                    </td>
                    {isOpen && (
                      <td className="px-2">
                        <Button
                          size="sm"
                          disabled={aggM.isPending}
                          onClick={() =>
                            aggM.mutate({
                              fabric_id: l.fabric_id!,
                              color_id: l.color_id!,
                              actual_count: Number(d.count ?? l.actual_count ?? 0),
                              // Omitted when untouched so the stored weight is kept.
                              actual_weight_kg: d.weight !== undefined && d.weight !== '' ? Number(d.weight) : undefined,
                            })
                          }
                        >
                          {ar.common.save}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
