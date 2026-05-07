import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { X } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { salesApi } from '@/lib/sales-api';
import { customersApi } from '@/lib/customers-api';
import type { Customer } from '@/lib/customers-types';
import type { BankAccount, Invoice, RollLookup, SalePreview } from '@/lib/sales-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ResponsiveDialog';
import { ScannerInput } from '@/components/ScannerInput';

type CartLine = {
  roll: RollLookup;
  priceOverride: string;
  lineDiscount: string;
};

type PaymentMode = 'cash' | 'instapay' | 'both';

function fmtMoney(n: number | string): string {
  const v = typeof n === 'number' ? n : Number(n);
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseAmount(s: string): number {
  if (!s) return 0;
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

function effectivePrice(line: CartLine): number {
  const ov = parseAmount(line.priceOverride);
  return ov > 0 ? ov : Number(line.roll.selling_price_egp);
}

function lineSubtotal(line: CartLine): number {
  const price = effectivePrice(line);
  const disc = Math.min(parseAmount(line.lineDiscount), price);
  return Math.max(0, price - disc);
}

export function POSPage() {
  const qc = useQueryClient();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const [targetFinalRaw, setTargetFinalRaw] = useState('');

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [cashAmount, setCashAmount] = useState('');
  const [instaAmount, setInstaAmount] = useState('');
  const [bankAccountId, setBankAccountId] = useState<number | ''>('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [notesAr, setNotesAr] = useState('');

  const [completed, setCompleted] = useState<Invoice | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: banks = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => salesApi.bankAccounts(),
  });

  useEffect(() => {
    if (banks.length && bankAccountId === '') {
      const def = banks.find((b) => b.is_default) ?? banks[0];
      if (def) setBankAccountId(def.id);
    }
  }, [banks, bankAccountId]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + lineSubtotal(l), 0), [cart]);

  const targetFinalNum = parseAmount(targetFinalRaw);
  const useCartDiscount = targetFinalRaw.trim() !== '' && targetFinalNum >= 0 && targetFinalNum <= subtotal;

  const previewLines = useMemo(
    () =>
      cart.map((l) => ({
        rollId: l.roll.id,
        sellingPriceOverride: parseAmount(l.priceOverride) || null,
        lineDiscountEgp: parseAmount(l.lineDiscount) || null,
      })),
    [cart],
  );

  const { data: preview } = useQuery<SalePreview | null>({
    queryKey: ['sale-preview', previewLines, useCartDiscount ? targetFinalNum : null],
    queryFn: () =>
      cart.length === 0
        ? Promise.resolve(null)
        : salesApi.preview(previewLines, useCartDiscount ? targetFinalNum : null),
    enabled: cart.length > 0,
  });

  useEffect(() => {
    if (preview && !saveAsOpen && paymentMode === 'cash' && cashAmount === '') {
      setCashAmount(preview.total_egp.toFixed(2));
    }
  }, [preview, paymentMode, saveAsOpen, cashAmount]);

  async function handleScanEnter(barcode: string) {
    setScanError(null);
    if (!barcode.trim()) return;
    try {
      const roll = await salesApi.rollByBarcode(barcode.trim());
      if (roll.status !== 'in_stock') {
        setScanError(ar.pos.notFound);
      } else if (!roll.is_visible_at_pos) {
        setScanError(ar.pos.notVisible);
      } else if (roll.warehouse !== 'shop' && roll.warehouse !== 'damaged_shop') {
        setScanError(ar.pos.notAtShop);
      } else if (cart.find((l) => l.roll.id === roll.id)) {
        // already in cart
      } else {
        setCart((c) => [...c, { roll, priceOverride: '', lineDiscount: '' }]);
      }
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : 0;
      setScanError(status === 404 ? ar.pos.notFound : ar.common.error);
    }
  }

  function removeLine(idx: number) {
    setCart((c) => c.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, patch: Partial<CartLine>) {
    setCart((c) => c.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const { data: customerResults = { rows: [] as Customer[], total: 0 } } = useQuery({
    queryKey: ['customers-pick', customerSearch],
    queryFn: () => customersApi.list({ search: customerSearch || undefined, limit: 20 }),
    enabled: pickerOpen,
  });

  const total = preview?.total_egp ?? subtotal;
  const cashNum = parseAmount(cashAmount);
  const instaNum = parseAmount(instaAmount);
  const paymentSum =
    paymentMode === 'cash' ? cashNum : paymentMode === 'instapay' ? instaNum : cashNum + instaNum;

  const submit = useMutation({
    mutationFn: () => {
      if (!customer) throw new Error('NO_CUSTOMER');
      const payments: Array<{ method: 'cash' | 'instapay'; amount: number; bankAccountId?: number | null }> = [];
      if (paymentMode === 'cash' || paymentMode === 'both') {
        if (cashNum > 0) payments.push({ method: 'cash', amount: cashNum });
      }
      if (paymentMode === 'instapay' || paymentMode === 'both') {
        if (instaNum > 0) {
          payments.push({
            method: 'instapay',
            amount: instaNum,
            bankAccountId: bankAccountId || null,
          });
        }
      }
      return salesApi.create({
        customerId: customer.id,
        lines: cart.map((l) => ({
          rollId: l.roll.id,
          sellingPriceOverride: parseAmount(l.priceOverride) || null,
          lineDiscountEgp: parseAmount(l.lineDiscount) || null,
        })),
        cartTargetFinal: useCartDiscount ? targetFinalNum : null,
        payments,
        notesAr: notesAr || null,
      });
    },
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setCompleted(invoice);
      setSubmitError(null);
    },
    onError: (e: unknown) => {
      const msg =
        axios.isAxiosError(e) && e.response?.data && (e.response.data as { message?: string }).message
          ? (e.response.data as { message: string }).message
          : ar.common.error;
      setSubmitError(msg);
    },
  });

  const validation = (() => {
    if (cart.length === 0) return ar.pos.cartEmpty;
    if (!customer) return ar.pos.customerRequired;
    if (paymentSum <= 0) return ar.pos.payment;
    if (saveAsOpen) {
      if (paymentSum >= total - 0.001) return null;
      return null;
    }
    if (Math.abs(paymentSum - total) > 0.01) return ar.pos.sumMustEqualTotal;
    return null;
  })();

  function resetSale() {
    setCart([]);
    setScanError(null);
    setCustomer(null);
    setCustomerSearch('');
    setTargetFinalRaw('');
    setPaymentMode('cash');
    setCashAmount('');
    setInstaAmount('');
    setSaveAsOpen(false);
    setNotesAr('');
    setCompleted(null);
    setSubmitError(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-7xl mx-auto pb-24 lg:pb-4">
      {/* LEFT: cart */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle>{ar.pos.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-base">{ar.pos.scan}</Label>
            <ScannerInput
              onScan={(barcode) => { setScanError(null); void handleScanEnter(barcode); }}
              placeholder={ar.labels.scanHint}
            />
            {scanError && <p className="text-sm text-red-600">{scanError}</p>}
          </div>

          <ManualSearchButton
            onPick={(roll) => {
              if (!cart.find((l) => l.roll.id === roll.id)) {
                setCart((c) => [...c, { roll, priceOverride: '', lineDiscount: '' }]);
              }
            }}
          />

          <div className="border-t border-border pt-3">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{ar.pos.cartEmpty}</p>
            ) : (
              <>
                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="text-right py-1">{ar.pos.fabric}</th>
                        <th className="text-right py-1">{ar.pos.weight}</th>
                        <th className="text-right py-1">{ar.pos.pricePerKg}</th>
                        <th className="text-right py-1">{ar.pos.lineDiscount}</th>
                        <th className="text-right py-1">{ar.pos.lineTotal}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((l, idx) => (
                        <tr key={l.roll.id} className="border-t border-border">
                          <td className="py-2">
                            <div className="font-medium">{l.roll.fabric_name_ar}</div>
                            <div className="text-xs text-muted-foreground">
                              {l.roll.color_name_ar} · {l.roll.roll_sr_no ?? l.roll.internal_barcode}
                            </div>
                          </td>
                          <td className="py-2" dir="ltr">{Number(l.roll.weight_kg).toFixed(3)}</td>
                          <td className="py-2 w-24">
                            <Input
                              value={l.priceOverride}
                              onChange={(e) => updateLine(idx, { priceOverride: e.target.value })}
                              placeholder={fmtMoney(l.roll.selling_price_egp)}
                              dir="ltr"
                              inputMode="decimal"
                              className="h-8 text-xs"
                            />
                          </td>
                          <td className="py-2 w-20">
                            <Input
                              value={l.lineDiscount}
                              onChange={(e) => updateLine(idx, { lineDiscount: e.target.value })}
                              placeholder="0"
                              dir="ltr"
                              inputMode="decimal"
                              className="h-8 text-xs"
                            />
                          </td>
                          <td className="py-2 font-medium" dir="ltr">{fmtMoney(lineSubtotal(l))}</td>
                          <td>
                            <Button variant="ghost" size="sm" onClick={() => removeLine(idx)}>
                              ×
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td colSpan={4} className="py-2 text-left font-medium">{ar.pos.subtotal}</td>
                        <td className="py-2 font-bold" dir="ltr">{fmtMoney(subtotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile: stacked cards */}
                <div className="md:hidden flex flex-col gap-2">
                  {cart.map((l, idx) => (
                    <div
                      key={l.roll.id}
                      className="rounded border border-border bg-canvas p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{l.roll.fabric_name_ar}</div>
                          <div className="text-xs text-muted-foreground">
                            {l.roll.color_name_ar} · {l.roll.roll_sr_no ?? l.roll.internal_barcode}
                          </div>
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {Number(l.roll.weight_kg).toFixed(3)} kg
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(idx)}
                          className="size-11 -mt-2 -ml-2"
                          aria-label={ar.common.cancel}
                        >
                          <X className="size-5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{ar.pos.pricePerKg}</Label>
                          <Input
                            value={l.priceOverride}
                            onChange={(e) => updateLine(idx, { priceOverride: e.target.value })}
                            placeholder={fmtMoney(l.roll.selling_price_egp)}
                            dir="ltr"
                            inputMode="decimal"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{ar.pos.lineDiscount}</Label>
                          <Input
                            value={l.lineDiscount}
                            onChange={(e) => updateLine(idx, { lineDiscount: e.target.value })}
                            placeholder="0"
                            dir="ltr"
                            inputMode="decimal"
                            className="h-11"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-border/60 text-sm">
                        <span className="text-muted-foreground">{ar.pos.lineTotal}</span>
                        <span className="font-medium" dir="ltr">{fmtMoney(lineSubtotal(l))}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-border font-bold">
                    <span>{ar.pos.subtotal}</span>
                    <span dir="ltr">{fmtMoney(subtotal)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* RIGHT: customer + payment */}
      <div className="space-y-4">
        {/* Customer card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{ar.pos.customer}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {customer ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{customer.name_ar}</div>
                  <div className="text-xs font-mono" dir="ltr">{customer.phone}</div>
                  <div className="text-xs text-muted-foreground">{customer.customer_code}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setCustomer(null)} className="h-11 md:h-9 shrink-0">
                  {ar.common.cancel}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => setPickerOpen(true)} className="flex-1 h-11 md:h-10">
                  {ar.pos.selectCustomer}
                </Button>
                <Button variant="outline" onClick={() => setQuickOpen(true)} className="h-11 md:h-10">
                  {ar.pos.quickCustomer}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Discount card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{ar.pos.discount}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label>{ar.pos.targetFinal}</Label>
              <Input
                value={targetFinalRaw}
                onChange={(e) => setTargetFinalRaw(e.target.value)}
                placeholder={fmtMoney(subtotal)}
                dir="ltr"
                inputMode="decimal"
                className="h-11 md:h-10"
              />
            </div>
            {preview && useCartDiscount && preview.cart_discount_egp > 0 && (
              <p className="text-sm text-green-700">
                {ar.pos.computedDiscount}: {fmtMoney(preview.cart_discount_egp)} ج.م ({preview.effective_discount_percent.toFixed(1)}%)
              </p>
            )}
          </CardContent>
        </Card>

        {/* Payment card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{ar.pos.payment}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'instapay', 'both'] as const).map((m) => (
                <Button
                  key={m}
                  variant={paymentMode === m ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPaymentMode(m)}
                  className="h-11 md:h-9"
                >
                  {ar.pos[m]}
                </Button>
              ))}
            </div>

            {(paymentMode === 'cash' || paymentMode === 'both') && (
              <div className="space-y-1">
                <Label>{ar.pos.cashAmount}</Label>
                <Input
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  dir="ltr"
                  inputMode="decimal"
                  className="h-11 md:h-10"
                />
              </div>
            )}
            {(paymentMode === 'instapay' || paymentMode === 'both') && (
              <>
                <div className="space-y-1">
                  <Label>{ar.pos.instapayAmount}</Label>
                  <Input
                    value={instaAmount}
                    onChange={(e) => setInstaAmount(e.target.value)}
                    dir="ltr"
                    inputMode="decimal"
                    className="h-11 md:h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{ar.pos.bankAccount}</Label>
                  <select
                    className="h-11 md:h-9 w-full border border-border rounded px-2 bg-canvas"
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">—</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name_ar}{b.is_default ? ' (افتراضي)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <label className="flex items-center gap-2 text-sm min-h-11">
              <input
                type="checkbox"
                checked={saveAsOpen}
                onChange={(e) => setSaveAsOpen(e.target.checked)}
                className="size-5"
              />
              {ar.pos.saveAsOpen}
            </label>

            <div className="space-y-1">
              <Label>{ar.pos.notes}</Label>
              <Input
                value={notesAr}
                onChange={(e) => setNotesAr(e.target.value)}
                dir="rtl"
                className="h-11 md:h-10"
              />
            </div>

            {preview && (
              <div className="text-sm space-y-1 border-t border-border pt-2">
                <Row label={ar.pos.subtotal} value={fmtMoney(preview.subtotal_egp)} />
                {preview.cart_discount_egp > 0 && (
                  <Row label={ar.pos.discount} value={`- ${fmtMoney(preview.cart_discount_egp)}`} />
                )}
                {preview.tax_enabled && (
                  <Row label={ar.pos.tax} value={fmtMoney(preview.tax_egp)} />
                )}
                {preview.rounding_egp !== 0 && (
                  <Row label={ar.pos.rounding} value={fmtMoney(preview.rounding_egp)} />
                )}
                <Row label={ar.pos.total} value={fmtMoney(preview.total_egp)} bold />
                <Row label={ar.pos.paid} value={fmtMoney(paymentSum)} />
                <Row
                  label={ar.pos.balance}
                  value={fmtMoney(Math.max(0, preview.total_egp - paymentSum))}
                />
              </div>
            )}

            {validation && <p className="text-sm text-red-600">{validation}</p>}
            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <Button
              className="w-full h-12"
              size="lg"
              disabled={!!validation || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {ar.pos.submit}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Mobile sticky bottom bar — visible only when cart has items */}
      {cart.length > 0 && (
        <div
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-canvas border-t border-border px-3 py-2 flex items-center gap-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.1)]"
        >
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">{ar.pos.subtotal}</div>
            <div className="font-bold text-base" dir="ltr">{fmtMoney(preview?.total_egp ?? subtotal)}</div>
          </div>
          <Button
            size="lg"
            className="h-12 flex-1"
            disabled={!!validation || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {ar.pos.submit}
          </Button>
        </div>
      )}

      {/* Customer picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{ar.pos.selectCustomer}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={ar.customers.search}
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            dir="rtl"
            className="h-11 md:h-10"
          />
          <div className="max-h-80 overflow-auto border border-border rounded">
            {customerResults.rows.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCustomer(c);
                  setPickerOpen(false);
                }}
                className="w-full text-right p-3 hover:bg-muted/40 border-b border-border last:border-0 min-h-12"
              >
                <div className="font-medium">{c.name_ar}</div>
                <div className="text-xs font-mono text-muted-foreground" dir="ltr">{c.phone}</div>
              </button>
            ))}
            {customerResults.rows.length === 0 && (
              <p className="p-4 text-center text-muted-foreground text-sm">{ar.customers.empty}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick-create customer dialog */}
      <QuickCustomerDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={(c) => {
          setCustomer(c);
          setQuickOpen(false);
        }}
      />

      {/* Completed dialog */}
      <Dialog open={!!completed} onOpenChange={(o) => !o && resetSale()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ar.pos.completed}</DialogTitle>
          </DialogHeader>
          {completed && (
            <div className="space-y-3 text-center">
              <p className="text-2xl font-bold">{completed.invoice_no}</p>
              <p className="text-muted-foreground">{ar.pos.total}: {fmtMoney(completed.total_egp)} ج.م</p>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button asChild variant="outline" className="flex-1 h-12">
                  <a href={salesApi.pdfUrl(completed.id, 'original')} target="_blank" rel="noreferrer">
                    {ar.pos.print}
                  </a>
                </Button>
                <Button onClick={resetSale} className="flex-1 h-12">{ar.pos.newSale}</Button>
              </div>
              <Link to={`/invoices/${completed.id}`} className="text-xs text-primary hover:underline inline-block py-2">
                {ar.invoices.view}
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-base' : ''}`}>
      <span>{label}</span>
      <span dir="ltr">{value}</span>
    </div>
  );
}

function ManualSearchButton({ onPick }: { onPick: (r: RollLookup) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: rolls = [] } = useQuery<RollLookup[]>({
    queryKey: ['pos-rolls', search],
    queryFn: () => salesApi.searchRolls({ status: 'in_stock', is_visible_at_pos: true }),
    enabled: open,
  });

  const filtered = rolls.filter((r) =>
    `${r.fabric_name_ar} ${r.color_name_ar} ${r.roll_sr_no ?? ''} ${r.internal_barcode}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="h-11 md:h-9">
        {ar.pos.manualSearch}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{ar.pos.manualSearch}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={ar.pos.manualSearch}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            dir="rtl"
            className="h-11 md:h-10"
          />
          <div className="max-h-96 overflow-auto border border-border rounded">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  onPick(r);
                  setOpen(false);
                  setSearch('');
                }}
                className="w-full text-right p-3 hover:bg-muted/40 border-b border-border last:border-0 text-sm min-h-12"
              >
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.fabric_name_ar} / {r.color_name_ar}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      {r.roll_sr_no ?? r.internal_barcode} · {Number(r.weight_kg).toFixed(3)} كجم
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div dir="ltr">{fmtMoney(r.selling_price_egp)}</div>
                  </div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="p-4 text-center text-muted-foreground text-sm">{ar.common.none}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuickCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (c: Customer) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => customersApi.quickCreate({ name_ar: name, phone }),
    onSuccess: (c) => {
      onCreated(c);
      setName('');
      setPhone('');
      setError(null);
    },
    onError: (e: unknown) => {
      const msg =
        axios.isAxiosError(e) && e.response?.data && (e.response.data as { message?: string }).message
          ? (e.response.data as { message: string }).message
          : ar.common.error;
      setError(msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ar.pos.quickCustomer}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{ar.customers.nameAr}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} dir="rtl" className="h-11 md:h-10" />
          </div>
          <div className="space-y-1">
            <Label>{ar.customers.phone}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              className="h-11 md:h-10"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
            <DialogClose asChild>
              <Button variant="outline" className="h-11 md:h-10">{ar.common.cancel}</Button>
            </DialogClose>
            <Button
              onClick={() => create.mutate()}
              disabled={!name || !phone || create.isPending}
              className="h-11 md:h-10"
            >
              {ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
