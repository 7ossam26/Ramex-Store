import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ar } from '@/i18n/ar';
import { stockRequestsApi } from '@/lib/stock-requests-api';
import type { AvailableRoll } from '@/lib/stock-requests-types';
import { extractApiError } from '@/lib/api-error';
import { rollQtyLabel } from '@/lib/fabric-unit';
import { usePersistentState } from '@/hooks/usePersistentState';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AvailableRollsPicker } from '@/components/stockRequests/AvailableRollsPicker';

const BASKET_KEY = 'stockRequests.basket';

/** The shop picks the exact tops it needs from the factory and sends one request. */
export function NewStockRequestPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // survives a refresh; cleared on logout (usePersistentState) and after sending
  const [basket, setBasket] = usePersistentState<AvailableRoll[]>(BASKET_KEY, []);
  const [notes, setNotes] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedIds = useMemo(() => new Set(basket.map((r) => Number(r.id))), [basket]);

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; count: number; kg: number; m: number }>();
    for (const r of basket) {
      const key = `${r.fabric_id}-${r.color_id}`;
      const g = m.get(key) ?? { label: `${r.fabric_name_ar} — ${r.color_name_ar}`, count: 0, kg: 0, m: 0 };
      g.count += 1;
      g.kg += Number(r.weight_kg ?? 0);
      g.m += Number(r.length_m ?? 0);
      m.set(key, g);
    }
    return [...m.values()];
  }, [basket]);

  const toggle = (roll: AvailableRoll) => {
    setInfo(null);
    setBasket((prev) =>
      prev.some((r) => Number(r.id) === Number(roll.id)) ? prev.filter((r) => Number(r.id) !== Number(roll.id)) : [...prev, roll],
    );
  };

  const send = useMutation({
    mutationFn: () => stockRequestsApi.create({ roll_ids: basket.map((r) => Number(r.id)), notes_ar: notes.trim() || null }),
    onSuccess: (created) => {
      setBasket([]);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['stock-requests'] });
      qc.invalidateQueries({ queryKey: ['stock-request-available'] });
      navigate(`/stock-requests/${created.id}`, { replace: true });
    },
    onError: (e: unknown) => {
      setError(extractApiError(e));
      // Tops taken by somebody else in the meantime: drop them so the rest can be sent.
      if (axios.isAxiosError(e)) {
        const barcodes = (e.response?.data as { barcodes?: string[] } | undefined)?.barcodes;
        if (barcodes && barcodes.length > 0) {
          setBasket((prev) => prev.filter((r) => !barcodes.includes(r.internal_barcode)));
          setInfo(ar.stockRequests.removedTaken);
          qc.invalidateQueries({ queryKey: ['stock-request-available'] });
        }
      }
    },
  });

  return (
    <PageShell title={ar.stockRequests.newRequest} description={ar.stockRequests.newRequestDesc} backTo="/stock-requests">
      <SectionCard title={ar.stockRequests.availableTitle}>
        <div>
          <AvailableRollsPicker selectedIds={selectedIds} onToggle={toggle} />
        </div>
      </SectionCard>

      <SectionCard title={`${ar.stockRequests.basketTitle} (${basket.length})`}>
        <div className="space-y-3">
          {basket.length === 0 ? (
            <p className="text-sm text-foreground-muted">{ar.stockRequests.basketEmpty}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <span key={g.label} className="rounded-md border border-border-subtle bg-surface-row-alt px-2 py-1 text-xs">
                    {g.label}: <span className="tabular-num">{ar.stockRequests.basketCount.replace('{n}', String(g.count))}</span>
                    {g.kg > 0 && <span className="tabular-num" dir="ltr"> · {g.kg.toFixed(3)} kg</span>}
                    {g.m > 0 && <span className="tabular-num" dir="ltr"> · {g.m.toFixed(2)} م</span>}
                  </span>
                ))}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {basket.map((r) => (
                    <tr key={r.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 font-mono tabular-num" dir="ltr">{r.internal_barcode}</td>
                      <td>{r.fabric_name_ar}</td>
                      <td>{r.color_name_ar}</td>
                      <td className="tabular-num" dir="ltr">{rollQtyLabel(r.weight_kg, r.length_m)}</td>
                      <td className="text-end">
                        <Button size="sm" variant="ghost" onClick={() => toggle(r)}>{ar.stockRequests.remove}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={ar.stockRequests.notesPlaceholder} maxLength={1000} />

          {info && <p className="text-sm text-warning-foreground">{info}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end">
            <Button size="lg" disabled={basket.length === 0 || send.isPending} onClick={() => { setError(null); setConfirmOpen(true); }}>
              {send.isPending ? ar.loading : ar.stockRequests.send}
            </Button>
          </div>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmOpen}
        message={ar.stockRequests.confirmSend}
        onConfirm={() => { setConfirmOpen(false); send.mutate(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </PageShell>
  );
}
