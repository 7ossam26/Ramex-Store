import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { accessoriesApi } from '@/lib/accessories-api';
import type { Accessory } from '@/lib/accessories-types';
import { extractApiError } from '@/lib/api-error';
import { openPdfBlob } from '@/lib/pdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';

const t = ar.addAccessory;

type FormErrors = {
  name_ar?: string;
  quantity?: string;
};

// Minimal shape needed to display the queue row and drive the batch print.
type QueueItem = Pick<Accessory, 'id' | 'internal_barcode' | 'name_ar' | 'qty_in_stock'>;

function validate(name: string, qty: string): FormErrors {
  const errs: FormErrors = {};
  if (!name.trim()) errs.name_ar = t.errors.nameRequired;
  if (!qty) {
    errs.quantity = t.errors.qtyRequired;
  } else {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) errs.quantity = t.errors.qtyInvalid;
  }
  return errs;
}

export function AddAccessoryPage() {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [lastBarcode, setLastBarcode] = useState<string | null>(null);

  // ── Print queue (additive — does not change any existing behaviour) ──────
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const removeFromQueue = (id: number) =>
    setQueue((prev) => prev.filter((item) => item.id !== id));

  const clearQueue = () => setQueue([]);
  // ────────────────────────────────────────────────────────────────────────


  // Batch-print mutation — used only by the "Print All" button.
  const batchMut = useMutation({
    mutationFn: (ids: number[]) => accessoriesApi.batchLabelsBlob(ids),
    onSuccess: (blob) => openPdfBlob(blob),
  });

  const createMut = useMutation({
    mutationFn: () =>
      accessoriesApi.create({
        name_ar: name.trim(),
        quantity: Number(qty),
        selling_price_egp: price !== '' ? Number(price) : undefined,
        notes_ar: notes.trim() || undefined,
      }),
    onSuccess: (acc) => {
      setLastBarcode(acc.internal_barcode);
      setServerError(null);
      setName('');
      setQty('');
      setPrice('');
      setNotes('');
      setErrors({});
      // ── Push to the print queue ──────────────────────────────────────────
      setQueue((prev) => [
        ...prev,
        {
          id: acc.id,
          internal_barcode: acc.internal_barcode,
          name_ar: acc.name_ar,
          qty_in_stock: acc.qty_in_stock,
        },
      ]);
    },
    onError: (err) => {
      setServerError(extractApiError(err));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(name, qty);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setServerError(null);
    createMut.mutate();
  }

  const isPrinting = createMut.isPending;

  return (
    <PageShell title={t.navTitle} description="تسجيل اكسسوار جديد بالكمية بالقطع" backTo="/items">
      <SectionCard>
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">

            {/* Name — full width */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="acc-name">{t.nameLabel}</Label>
              <Input
                id="acc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.namePlaceholder}
                autoFocus
                className="h-10"
              />
              {errors.name_ar && (
                <p className="text-destructive text-sm">{errors.name_ar}</p>
              )}
            </div>

            {/* Qty */}
            <div className="space-y-1.5">
              <Label htmlFor="acc-qty">{t.qtyLabel}</Label>
              <Input
                id="acc-qty"
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={t.qtyPlaceholder}
                className="h-10"
              />
              {errors.quantity && (
                <p className="text-destructive text-sm">{errors.quantity}</p>
              )}
            </div>

            {/* Selling price */}
            <div className="space-y-1.5">
              <Label htmlFor="acc-price">{t.priceLabel}</Label>
              <Input
                id="acc-price"
                type="number"
                min={0}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t.pricePlaceholder}
                className="h-10"
              />
            </div>

            {/* Notes — full width */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="acc-notes">{t.notesLabel}</Label>
              <textarea
                id="acc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>

          </div>

          {/* Feedback */}
          {serverError && (
            <p className="text-destructive text-sm mt-4">{serverError}</p>
          )}
          {lastBarcode && !createMut.isPending && (
            <p className="text-green-600 text-sm mt-4">
              {t.successMessage} — {lastBarcode}
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={createMut.isPending} className="h-10 px-6">
              {isPrinting ? '…' : t.submitButton}
            </Button>
          </div>
        </form>
      </SectionCard>

      {/* ── Print queue section ──────────────────────────────────────────── */}
      <SectionCard className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{t.queue.sectionTitle}</h2>
          <div className="flex gap-2">
            {queue.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearQueue}
                  disabled={batchMut.isPending}
                >
                  {t.queue.clearBtn}
                </Button>
                <Button
                  size="sm"
                  onClick={() => batchMut.mutate(queue.map((item) => item.id))}
                  disabled={batchMut.isPending}
                >
                  {batchMut.isPending ? t.queue.printingAll : t.queue.printAllBtn}
                </Button>
              </>
            )}
          </div>
        </div>

        {queue.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">{t.queue.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-right pb-2 font-medium">{t.queue.colBarcode}</th>
                  <th className="text-right pb-2 font-medium">{t.queue.colName}</th>
                  <th className="text-right pb-2 font-medium">{t.queue.colQty}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{item.internal_barcode}</td>
                    <td className="py-2">{item.name_ar}</td>
                    <td className="py-2">{item.qty_in_stock}</td>
                    <td className="py-2 text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-7 px-2"
                        onClick={() => removeFromQueue(item.id)}
                      >
                        {t.queue.removeBtn}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {/* ── End print queue section ──────────────────────────────────────── */}
    </PageShell>
  );
}
