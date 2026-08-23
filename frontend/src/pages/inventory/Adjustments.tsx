import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extractApiError } from '@/lib/api-error';
import { AlertTriangle, Inbox, Search } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { accessoriesApi } from '@/lib/accessories-api';
import { salesApi } from '@/lib/sales-api';
import type { RollStatus, Warehouse } from '@/lib/inventory-types';
import type { RollLookup } from '@/lib/sales-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/Layout/PageShell';
import { ScannerInput } from '@/components/ScannerInput';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { cn } from '@/lib/utils';
import { matchesTokens, tokenize } from '@/lib/arabic-search';

const selectClass =
  'w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75';

/** Statuses the form offers. `sold` is reachable only through an actual sale. */
const STATUS_CHOICES: RollStatus[] = [
  'in_stock', 'reserved', 'damaged', 'sample', 'returned', 'written_off',
];

export function AdjustmentsPage() {
  const qc = useQueryClient();
  const [entityType, setEntityType] = useState<'roll' | 'accessory'>('roll');
  const [createError, setCreateError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['adjustments'], queryFn: inventoryApi.listAdjustments });

  // Hoisted above the loading/empty branches below: if the search box lived
  // inside the results card, filtering to zero would unmount it and strand the
  // user with no way to clear the query.
  const [search, setSearch] = useState('');
  const rows = list.data ?? [];
  const filtered = useMemo(() => {
    const tokens = tokenize(search);
    return rows.filter((m) =>
      matchesTokens(tokens, [
        m.fabric_name_ar,
        m.color_name_ar,
        m.accessory_name_ar,
        m.internal_barcode,
        m.notes_ar,
        m.roll_id != null ? String(m.roll_id) : null,
      ]),
    );
  }, [rows, search]);

  // Roll adjustment — the توب is resolved by scanning its printed barcode.
  // Everything below stays disabled until a real توب is on screen, so a تسوية
  // can no longer be aimed at a number the user only *thinks* identifies it.
  const [rollBarcode, setRollBarcode] = useState<string | null>(null);
  const [newQty, setNewQty] = useState('');
  const [newStatus, setNewStatus] = useState<RollStatus | ''>('');
  const [newWarehouse, setNewWarehouse] = useState<Warehouse | ''>('');
  const [rollNotes, setRollNotes] = useState('');
  const [ackHide, setAckHide] = useState(false);

  const rollQ = useQuery<RollLookup>({
    queryKey: ['adjustment-roll', rollBarcode],
    queryFn: () => salesApi.rollByBarcode(rollBarcode!),
    enabled: rollBarcode !== null,
    retry: false,
    gcTime: 0,
  });
  const roll = rollQ.data;
  const isMeter = roll?.fabric_unit === 'meter';

  const resetRollForm = () => {
    setRollBarcode(null);
    setNewQty(''); setNewStatus(''); setNewWarehouse(''); setRollNotes('');
    setAckHide(false);
  };

  // A تسوية that changes حالة away from «متاح», or moves the توب to another
  // مخزن, takes it out of المخزون and شاشة البيع — both filter on
  // status='in_stock'. That is the whole "the roll disappeared" report, so it
  // has to be stated before the write, not discovered afterwards.
  const hidesByStatus = newStatus !== '' && newStatus !== 'in_stock';
  const hidesByWarehouse =
    newWarehouse !== '' && roll != null && newWarehouse !== roll.warehouse;
  const willHide = hidesByStatus || hidesByWarehouse;

  const rollInvalid =
    roll == null ||
    rollNotes.trim() === '' ||
    (willHide && !ackHide) ||
    (newQty !== '' && (!Number.isFinite(Number(newQty)) || Number(newQty) <= 0)) ||
    (newQty === '' && newStatus === '' && newWarehouse === '');

  // Accessory adjustment — controlled state (parity flow for accessory stock).
  const accListQ = useQuery({
    queryKey: ['accessories-all'],
    queryFn: () => accessoriesApi.list(),
    enabled: entityType === 'accessory',
  });
  const [accId, setAccId] = useState<number | ''>('');
  const [accQty, setAccQty] = useState<string>('');
  const [accNotes, setAccNotes] = useState<string>('');
  const selectedAcc = (accListQ.data ?? []).find((a) => a.id === accId);

  // A تسوية changes quantity, status and warehouse — every screen that reads
  // أتواب is stale afterwards. Missing these is what made a corrected weight
  // keep showing its old value elsewhere (`rolls-for-stock` even caches for 30s).
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['adjustments'] });
    qc.invalidateQueries({ queryKey: ['accessories-all'] });
    qc.invalidateQueries({ queryKey: ['rolls-page-accessories'] });
    qc.invalidateQueries({ queryKey: ['rolls-search'] });
    qc.invalidateQueries({ queryKey: ['rolls-for-stock'] });
    qc.invalidateQueries({ queryKey: ['stock-summary'] });
    qc.invalidateQueries({ queryKey: ['roll-label'] });
    qc.invalidateQueries({ queryKey: ['stock-movements'] });
  };

  const create = useMutation({
    mutationFn: () => {
      const qty = newQty === '' ? undefined : Number(newQty);
      return inventoryApi.createAdjustment({
        entity_type: 'roll',
        roll_id: roll!.id,
        new_warehouse: newWarehouse || undefined,
        new_status: newStatus || undefined,
        // Quantity goes to the column the material actually uses.
        ...(isMeter ? { new_length_m: qty } : { new_weight_kg: qty }),
        notes_ar: rollNotes,
      });
    },
    onSuccess: () => { invalidate(); setCreateError(null); resetRollForm(); },
    onError: (e) => setCreateError(extractApiError(e)),
  });

  const createAcc = useMutation({
    mutationFn: () =>
      inventoryApi.createAdjustment({
        entity_type: 'accessory',
        accessory_id: Number(accId),
        new_qty: Number(accQty),
        notes_ar: accNotes,
      }),
    onSuccess: () => {
      invalidate();
      setCreateError(null);
      setAccId(''); setAccQty(''); setAccNotes('');
    },
    onError: (e) => setCreateError(extractApiError(e)),
  });

  const accInvalid =
    accId === '' || accQty === '' || !Number.isFinite(Number(accQty)) || Number(accQty) < 0 || accNotes.trim() === '';

  const switchEntity = (t: 'roll' | 'accessory') => {
    setEntityType(t);
    setCreateError(null);
    // Drop the half-filled توب so switching back never shows a scanned roll
    // paired with values the user typed for a different entity.
    if (t === 'accessory') resetRollForm();
  };

  return (
    <PageShell title={ar.adjustments.title} description={ar.hubs.inventoryAdjustmentsDesc} backTo="/inventory">
      <Card>
        <CardHeader><CardTitle>{ar.adjustments.create}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Entity toggle — rolls vs accessories (same adjustments workflow) */}
          <div className="flex gap-1 p-1 bg-surface-hover rounded-lg w-fit">
            {(['roll', 'accessory'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchEntity(t)}
                className={cn(
                  'px-4 py-1.5 text-sm rounded-md transition-colors',
                  entityType === t
                    ? 'bg-canvas shadow-sm font-semibold text-foreground'
                    : 'text-foreground-muted hover:text-foreground',
                )}
              >
                {t === 'roll' ? ar.adjustments.entityRoll : ar.adjustments.entityAccessory}
              </button>
            ))}
          </div>

          {entityType === 'roll' ? (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!rollInvalid) create.mutate(); }}
              className="space-y-4"
            >
              {/* Step 1 — identify the توب by its printed barcode. */}
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.scanRoll}</Label>
                {roll ? (
                  <div className="flex items-start justify-between gap-3 p-3 rounded-md border border-border-default bg-surface-hover">
                    <div className="space-y-0.5 text-sm">
                      <div className="font-medium text-foreground">
                        {roll.fabric_name_ar} — {roll.color_name_ar}
                      </div>
                      <div className="font-mono text-xs text-foreground-muted" dir="ltr">
                        {roll.internal_barcode}
                        {roll.roll_sr_no ? ` · ${roll.roll_sr_no}` : ''}
                      </div>
                      <div className="text-foreground-muted">
                        {isMeter ? ar.adjustments.currentLength : ar.adjustments.currentWeight}:{' '}
                        <span className="tabular-num text-foreground" dir="ltr">
                          {isMeter ? (roll.length_m ?? '—') : (roll.weight_kg ?? '—')}
                        </span>
                        {' · '}
                        {ar.labels.status}: <span className="text-foreground">{ar.rollStatuses[roll.status as RollStatus] ?? roll.status}</span>
                        {' · '}
                        {ar.warehouses[roll.warehouse as Warehouse] ?? roll.warehouse}
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={resetRollForm}>
                      {ar.adjustments.changeRoll}
                    </Button>
                  </div>
                ) : (
                  <>
                    <ScannerInput
                      onScan={(code) => { setRollBarcode(code); setCreateError(null); }}
                      placeholder={ar.adjustments.scanRollHint}
                      autoFocus={false}
                    />
                    {rollQ.isLoading && (
                      <p className="text-sm text-foreground-muted">{ar.adjustments.lookingUpRoll}</p>
                    )}
                    {rollQ.isError && (
                      <p className="text-sm text-danger" role="alert">{ar.adjustments.rollNotFound}</p>
                    )}
                  </>
                )}
              </div>

              {/* Step 2 — the actual تسوية, only once a توب is on screen. */}
              {roll && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium text-foreground">
                        {isMeter ? ar.adjustments.newLength : ar.adjustments.newWeight}
                      </Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        min={0}
                        dir="ltr"
                        value={newQty}
                        onChange={(e) => setNewQty(e.target.value)}
                        placeholder={ar.adjustments.keepSame}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium text-foreground">{ar.adjustments.newStatus}</Label>
                      <select
                        className={selectClass}
                        value={newStatus}
                        onChange={(e) => { setNewStatus(e.target.value as RollStatus | ''); setAckHide(false); }}
                      >
                        <option value="">—</option>
                        {STATUS_CHOICES.map((s) => (
                          <option key={s} value={s}>{ar.rollStatuses[s]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium text-foreground">{ar.adjustments.newWarehouse}</Label>
                      <select
                        className={selectClass}
                        value={newWarehouse}
                        onChange={(e) => { setNewWarehouse(e.target.value as Warehouse | ''); setAckHide(false); }}
                      >
                        <option value="">—</option>
                        <option value="shop">{ar.warehouses.shop}</option>
                        <option value="factory">{ar.warehouses.factory}</option>
                        <option value="damaged_shop">{ar.warehouses.damaged_shop}</option>
                      </select>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-sm font-medium text-foreground">{ar.adjustments.notes}</Label>
                      <Input value={rollNotes} onChange={(e) => setRollNotes(e.target.value)} />
                    </div>
                  </div>

                  {willHide && (
                    <div className="p-3 rounded-md border border-warning/30 bg-warning-subtle space-y-2">
                      <div className="flex items-center gap-2 font-medium text-warning-foreground">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden />
                        {ar.adjustments.hideWarningTitle}
                      </div>
                      <p className="text-sm text-warning-foreground">
                        {hidesByStatus
                          ? ar.adjustments.hideWarningStatus.replace(
                              '{status}',
                              ar.rollStatuses[newStatus as RollStatus],
                            )
                          : ar.adjustments.hideWarningWarehouse.replace(
                              '{warehouse}',
                              ar.warehouses[newWarehouse as Warehouse],
                            )}
                      </p>
                      <label className="flex items-center gap-2 text-sm text-warning-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ackHide}
                          onChange={(e) => setAckHide(e.target.checked)}
                          className="size-4"
                        />
                        {ar.adjustments.hideWarningAck}
                      </label>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <Button type="submit" disabled={create.isPending || rollInvalid}>
                  {ar.adjustments.create}
                </Button>
                {createError && (
                  <span className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
                    {createError}
                  </span>
                )}
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!accInvalid) createAcc.mutate(); }}
              className="grid grid-cols-2 md:grid-cols-3 gap-3"
            >
              <div className="space-y-1 col-span-2 md:col-span-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.selectAccessory}</Label>
                <select
                  className={selectClass}
                  value={accId === '' ? '' : String(accId)}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : '';
                    setAccId(id);
                    const acc = (accListQ.data ?? []).find((a) => a.id === id);
                    setAccQty(acc ? String(acc.qty_in_stock) : '');
                  }}
                >
                  <option value="">—</option>
                  {(accListQ.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name_ar} ({a.internal_barcode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.currentQty}</Label>
                <Input value={selectedAcc ? String(selectedAcc.qty_in_stock) : ''} readOnly dir="ltr" className="bg-surface-hover" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.newQty}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={accQty}
                  onChange={(e) => setAccQty(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-sm font-medium text-foreground">{ar.adjustments.notes}</Label>
                <Input value={accNotes} onChange={(e) => setAccNotes(e.target.value)} />
              </div>
              <div className="col-span-full flex items-center gap-3 flex-wrap">
                <Button type="submit" disabled={createAcc.isPending || accInvalid}>{ar.adjustments.create}</Button>
                {createError && (
                  <span className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
                    {createError}
                  </span>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {list.isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : list.isError ? (
        <ErrorBanner onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={ar.codes.noResults}
          description={ar.adjustments.title}
        />
      ) : (
        <Card>
          <CardHeader className="gap-3">
            <CardTitle>{ar.adjustments.title}</CardTitle>
            <div className="relative">
              <Search
                className="size-4 absolute top-1/2 -translate-y-1/2 start-3 text-foreground-tertiary pointer-events-none"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={ar.adjustments.searchPlaceholder}
                aria-label={ar.adjustments.searchPlaceholder}
                dir="rtl"
                className="ps-9 h-10"
              />
            </div>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide">
                <tr className="border-b border-border-subtle">
                  <th className="py-2.5 font-medium">{ar.stockMovements.when}</th>
                  <th className="font-medium">{ar.adjustments.itemColumn}</th>
                  <th className="font-medium">{ar.stockMovements.from}</th>
                  <th className="font-medium">{ar.stockMovements.to}</th>
                  <th className="font-medium">{ar.adjustments.notes}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-foreground-muted">
                      {ar.labels.noSearchResults}
                    </td>
                  </tr>
                ) : filtered.map((m) => (
                  <tr key={m.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150">
                    <td className="py-2.5 text-foreground-muted">{new Date(m.created_at).toLocaleString('ar-EG-u-nu-latn')}</td>
                    <td className="text-foreground">
                      {/* Name first, id second — searching by خامة is meaningless
                          if the row only shows a bare number. */}
                      {m.entity_type === 'accessory' ? (
                        <>
                          <div>{m.accessory_name_ar ?? ar.adjustments.accessoryItem}</div>
                          <div className="font-mono text-xs text-foreground-muted" dir="ltr">#{m.accessory_id}</div>
                        </>
                      ) : (
                        <>
                          <div>
                            {m.fabric_name_ar ?? '—'}
                            {m.color_name_ar && <span className="text-foreground-muted"> — {m.color_name_ar}</span>}
                          </div>
                          <div className="font-mono text-xs text-foreground-muted" dir="ltr">
                            {m.internal_barcode ?? `#${m.roll_id}`}
                          </div>
                        </>
                      )}
                    </td>
                    <td>{m.from_warehouse ? ar.warehouses[m.from_warehouse] : '—'}</td>
                    <td>{m.to_warehouse ? ar.warehouses[m.to_warehouse] : '—'}</td>
                    <td className="text-xs text-foreground-muted">{m.notes_ar ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
