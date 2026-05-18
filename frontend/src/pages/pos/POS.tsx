import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  ShoppingCart,
  UserRound,
  Scan,
  Search,
  Tag,
  Receipt,
  CheckCircle2,
  Info,
  CreditCard,
  Banknote,
  AlertTriangle,
  MoreVertical,
} from 'lucide-react';
import { Toast } from '@/components/Toast';
import { Tooltip } from '@/components/Tooltip';
import { ar } from '@/i18n/ar';
import { salesApi } from '@/lib/sales-api';
import { customersApi } from '@/lib/customers-api';
import { itemsApi } from '@/lib/items-api';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScannerInput } from '@/components/ScannerInput';

type CartLine = {
  roll: RollLookup;
  priceOverride: string;
  lineDiscount: string;
};

type PaymentMode = 'cash' | 'instapay' | 'both';

type ScannerFeedback = 'idle' | 'success' | 'danger';

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

function isFabricRoll(r: RollLookup): boolean {
  return Boolean(
    r.brand_arabic_name || r.grade_arabic_name || r.composition_description || r.width_cm,
  );
}

export function POSPage() {
  const qc = useQueryClient();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState<RollLookup | null>(null);

  /* Functional-motion feedback state — local UI only, no impact on scanning logic. */
  const [scannerFeedback, setScannerFeedback] = useState<ScannerFeedback>('idle');
  const [shakeNonce, setShakeNonce] = useState(0); // increments on each failed scan to re-trigger the keyframe
  const [flashRowId, setFlashRowId] = useState<number | null>(null);

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

  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [labelRoll, setLabelRoll] = useState<RollLookup | null>(null);

  const [completed, setCompleted] = useState<Invoice | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* Bottom toast (functional error feedback). */
  type ToastState = { id: number; message: string };
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastIdRef = useRef(0);
  function showToast(message: string) {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message });
  }

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

  // Hide scan flash after a moment
  useEffect(() => {
    if (!scanFlash) return;
    const t = setTimeout(() => setScanFlash(null), 2000);
    return () => clearTimeout(t);
  }, [scanFlash]);

  // Drop the green border 150ms after a successful scan.
  useEffect(() => {
    if (scannerFeedback !== 'success') return;
    const t = setTimeout(() => setScannerFeedback('idle'), 150);
    return () => clearTimeout(t);
  }, [scannerFeedback]);

  // Drop the red border 150ms after a failed scan.
  useEffect(() => {
    if (scannerFeedback !== 'danger') return;
    const t = setTimeout(() => setScannerFeedback('idle'), 150);
    return () => clearTimeout(t);
  }, [scannerFeedback, shakeNonce]);

  // Clear row-added flash after 200ms.
  useEffect(() => {
    if (flashRowId === null) return;
    const t = setTimeout(() => setFlashRowId(null), 200);
    return () => clearTimeout(t);
  }, [flashRowId]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + lineSubtotal(l), 0), [cart]);

  const targetFinalNum = parseAmount(targetFinalRaw);
  const useCartDiscount =
    targetFinalRaw.trim() !== '' && targetFinalNum >= 0 && targetFinalNum <= subtotal;

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
        flagScanFailure(ar.pos.notFound);
      } else if (!roll.is_visible_at_pos) {
        flagScanFailure(ar.pos.notVisible);
      } else if (roll.warehouse !== 'shop' && roll.warehouse !== 'damaged_shop') {
        flagScanFailure(ar.pos.notAtShop);
      } else if (cart.find((l) => l.roll.id === roll.id)) {
        flagScanFailure(ar.pos.alreadyInCart);
      } else {
        setCart((c) => [...c, { roll, priceOverride: '', lineDiscount: '' }]);
        setScanFlash(roll);
        setScannerFeedback('success');
        setFlashRowId(roll.id);
      }
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : 0;
      flagScanFailure(status === 404 ? ar.pos.notFound : ar.common.error);
    }
  }

  function flagScanFailure(message: string) {
    setScanError(message);
    setScannerFeedback('danger');
    setShakeNonce((n) => n + 1);
    showToast(message);
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
    paymentMode === 'cash'
      ? cashNum
      : paymentMode === 'instapay'
        ? instaNum
        : cashNum + instaNum;

  const submit = useMutation({
    mutationFn: () => {
      if (!customer) throw new Error('NO_CUSTOMER');
      const payments: Array<{
        method: 'cash' | 'instapay';
        amount: number;
        bankAccountId?: number | null;
      }> = [];
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
      setPaymentSheetOpen(false);
      setSubmitError(null);
    },
    onError: (e: unknown) => {
      const msg =
        axios.isAxiosError(e) &&
        e.response?.data &&
        (e.response.data as { message?: string }).message
          ? (e.response.data as { message: string }).message
          : ar.common.error;
      setSubmitError(msg);
      showToast(msg);
    },
  });

  const validation = (() => {
    if (cart.length === 0) return ar.pos.cartEmpty;
    if (!customer) return ar.pos.customerRequired;
    if (paymentSum <= 0) return ar.pos.payment;
    if (saveAsOpen) return null;
    if (Math.abs(paymentSum - total) > 0.01) return ar.pos.sumMustEqualTotal;
    return null;
  })();

  function resetSale() {
    setCart([]);
    setScanError(null);
    setScanFlash(null);
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
    setPaymentSheetOpen(false);
    setCartSheetOpen(false);
  }

  return (
    <div
      data-motion="reduced"
      className="flex flex-col gap-4 max-w-[1600px] mx-auto pb-24 lg:pb-4"
    >
      {/* Top bar — customer + discount + open invoice + cart pill (mobile) */}
      <TopBar
        customer={customer}
        onPickCustomer={() => setPickerOpen(true)}
        onQuickCustomer={() => setQuickOpen(true)}
        onClearCustomer={() => setCustomer(null)}
        targetFinalRaw={targetFinalRaw}
        setTargetFinalRaw={setTargetFinalRaw}
        subtotalForPlaceholder={subtotal}
        saveAsOpen={saveAsOpen}
        setSaveAsOpen={setSaveAsOpen}
        cartCount={cart.length}
        onOpenCart={() => setCartSheetOpen(true)}
      />

      {/* Main two-column grid (lg+): scan area | cart */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(380px,2fr)] gap-4">
        {/* LEFT: scan + product grid + flash */}
        <ScanColumn
          onScan={handleScanEnter}
          error={scanError}
          flash={scanFlash}
          feedback={scannerFeedback}
          shakeNonce={shakeNonce}
          cart={cart}
          onPickManual={(roll) => {
            if (!cart.find((l) => l.roll.id === roll.id)) {
              setCart((c) => [...c, { roll, priceOverride: '', lineDiscount: '' }]);
              setScanFlash(roll);
              setScannerFeedback('success');
              setFlashRowId(roll.id);
            }
          }}
          onShowLabel={setLabelRoll}
        />

        {/* RIGHT: cart (visible on lg+) */}
        <div className="hidden lg:block">
          <CartPanel
            cart={cart}
            preview={preview}
            subtotal={subtotal}
            useCartDiscount={useCartDiscount}
            updateLine={updateLine}
            removeLine={removeLine}
            flashRowId={flashRowId}
            onShowLabel={setLabelRoll}
            onPay={() => setPaymentSheetOpen(true)}
            disabled={cart.length === 0}
          />
        </div>
      </div>

      {/* Cart sheet (sm/md): right slide-in */}
      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{ar.pos.cart}</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex-1 overflow-y-auto">
            <CartPanel
              cart={cart}
              preview={preview}
              subtotal={subtotal}
              useCartDiscount={useCartDiscount}
              updateLine={updateLine}
              removeLine={removeLine}
              flashRowId={flashRowId}
              onShowLabel={setLabelRoll}
              onPay={() => {
                setCartSheetOpen(false);
                setPaymentSheetOpen(true);
              }}
              disabled={cart.length === 0}
              embedded
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment bottom sheet */}
      <Sheet open={paymentSheetOpen} onOpenChange={setPaymentSheetOpen}>
        <SheetContent side="bottom" className="max-h-[92vh]">
          <SheetHeader>
            <SheetTitle>{ar.pos.paymentSheetTitle}</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex-1 overflow-y-auto">
            <PaymentForm
              banks={banks}
              paymentMode={paymentMode}
              setPaymentMode={setPaymentMode}
              cashAmount={cashAmount}
              setCashAmount={setCashAmount}
              instaAmount={instaAmount}
              setInstaAmount={setInstaAmount}
              bankAccountId={bankAccountId}
              setBankAccountId={setBankAccountId}
              saveAsOpen={saveAsOpen}
              setSaveAsOpen={setSaveAsOpen}
              notesAr={notesAr}
              setNotesAr={setNotesAr}
              preview={preview}
              paymentSum={paymentSum}
              validation={validation}
              submitError={submitError}
              submitting={submit.isPending}
              onSubmit={() => submit.mutate()}
              total={total}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile sticky bottom bar — cart count + pay */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-sticky bg-surface/95 backdrop-blur border-t border-border-subtle px-3 py-2 flex items-center gap-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-lg">
          <button
            onClick={() => setCartSheetOpen(true)}
            className="flex items-center gap-2 cursor-pointer min-h-11 px-2 text-foreground"
            aria-label={ar.pos.cart}
          >
            <ShoppingCart className="size-5" />
            <span className="font-medium text-sm">
              {cart.length} · {ar.pos.subtotal}
            </span>
            <span className="font-semibold text-base tabular-num" dir="ltr">
              {fmtMoney(preview?.total_egp ?? subtotal)}
            </span>
          </button>
          <Button
            size="lg"
            className="h-12 flex-1 cursor-pointer"
            disabled={cart.length === 0}
            onClick={() => setPaymentSheetOpen(true)}
          >
            {ar.pos.payment}
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
          <div className="max-h-80 overflow-auto border border-border-subtle rounded-md">
            {customerResults.rows.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCustomer(c);
                  setPickerOpen(false);
                }}
                className="w-full text-start p-3 hover:bg-surface-hover border-b border-border-subtle last:border-0 min-h-12 cursor-pointer transition-colors duration-150"
              >
                <div className="font-medium text-foreground">{c.name_ar}</div>
                <div className="text-xs font-mono text-foreground-tertiary" dir="ltr">
                  {c.phone}
                </div>
              </button>
            ))}
            {customerResults.rows.length === 0 && (
              <p className="p-4 text-center text-foreground-tertiary text-sm">
                {ar.customers.empty}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <QuickCustomerDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={(c) => {
          setCustomer(c);
          setQuickOpen(false);
        }}
      />

      {/* Label preview modal */}
      <LabelPreviewModal roll={labelRoll} onClose={() => setLabelRoll(null)} />

      {/* Completed */}
      <Dialog open={!!completed} onOpenChange={(o) => !o && resetSale()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ar.pos.completed}</DialogTitle>
          </DialogHeader>
          {completed && (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="size-12 mx-auto text-success" />
              <p className="text-2xl font-bold tabular-num">{completed.invoice_no}</p>
              <p className="text-foreground-muted">
                {ar.pos.total}:{' '}
                <span className="tabular-num" dir="ltr">
                  {fmtMoney(completed.total_egp)}
                </span>{' '}
                ج.م
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button asChild variant="outline" className="flex-1 h-12 cursor-pointer">
                  <a
                    href={salesApi.pdfUrl(completed.id, 'original')}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {ar.pos.print}
                  </a>
                </Button>
                <Button onClick={resetSale} className="flex-1 h-12 cursor-pointer">
                  {ar.pos.newSale}
                </Button>
              </div>
              <Link
                to={`/invoices/${completed.id}`}
                className="text-xs text-accent hover:underline inline-block py-2"
              >
                {ar.invoices.view}
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bottom-of-viewport error toast (functional motion — auto-dismiss 4s). */}
      <Toast
        key={toast?.id}
        open={!!toast}
        message={toast?.message ?? ''}
        tone="danger"
        autoDismissMs={4000}
        showProgress
        dismissible
        onClose={() => setToast(null)}
        className="bottom-20 lg:bottom-6"
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TOP BAR
 * ────────────────────────────────────────────────────────────────────────── */
function TopBar({
  customer,
  onPickCustomer,
  onQuickCustomer,
  onClearCustomer,
  targetFinalRaw,
  setTargetFinalRaw,
  subtotalForPlaceholder,
  saveAsOpen,
  setSaveAsOpen,
  cartCount,
  onOpenCart,
}: {
  customer: Customer | null;
  onPickCustomer: () => void;
  onQuickCustomer: () => void;
  onClearCustomer: () => void;
  targetFinalRaw: string;
  setTargetFinalRaw: (s: string) => void;
  subtotalForPlaceholder: number;
  saveAsOpen: boolean;
  setSaveAsOpen: (b: boolean) => void;
  cartCount: number;
  onOpenCart: () => void;
}) {
  return (
    <div className="sticky top-0 z-sticky bg-surface/95 backdrop-blur border-b border-border-subtle -mx-2 px-2 py-2 flex flex-wrap items-center gap-2">
      {/* Customer pill */}
      {customer ? (
        <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-elevated px-3 py-2 min-h-11">
          <UserRound className="size-4 text-foreground-muted" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="font-medium text-sm truncate text-foreground">
              {customer.name_ar}
            </span>
            <span className="text-xs font-mono text-foreground-tertiary" dir="ltr">
              {customer.phone}
            </span>
          </div>
          <button
            onClick={onClearCustomer}
            className="cursor-pointer text-foreground-tertiary hover:text-foreground p-1"
            aria-label={ar.common.cancel}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            onClick={onPickCustomer}
            variant="outline"
            className="h-11 cursor-pointer gap-2"
          >
            <UserRound className="size-4" />
            {ar.pos.selectCustomer}
          </Button>
          <Button
            onClick={onQuickCustomer}
            variant="ghost"
            size="sm"
            className="h-11 cursor-pointer"
          >
            +
          </Button>
        </div>
      )}

      {/* Discount inline */}
      <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-elevated px-3 py-1 min-h-11">
        <Tag className="size-4 text-foreground-muted" />
        <span className="text-xs text-foreground-muted">{ar.pos.targetFinal}</span>
        <Input
          value={targetFinalRaw}
          onChange={(e) => setTargetFinalRaw(e.target.value)}
          placeholder={fmtMoney(subtotalForPlaceholder)}
          dir="ltr"
          inputMode="decimal"
          className="h-8 w-28 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1 tabular-num"
        />
      </div>

      {/* Save as open toggle */}
      <label className="flex items-center gap-2 cursor-pointer text-sm rounded-md border border-border-default bg-surface-elevated px-3 min-h-11 text-foreground">
        <input
          type="checkbox"
          checked={saveAsOpen}
          onChange={(e) => setSaveAsOpen(e.target.checked)}
          className="size-4 cursor-pointer accent-accent"
        />
        <Receipt className="size-4 text-foreground-muted" />
        {ar.pos.saveAsOpen}
      </label>

      <div className="flex-1" />

      {/* Cart pill (mobile/tablet only) */}
      <button
        onClick={onOpenCart}
        className="lg:hidden flex items-center gap-2 cursor-pointer rounded-md border border-border-default bg-surface-elevated px-3 min-h-11 hover:bg-surface-hover transition-colors duration-150 text-foreground"
        aria-label={ar.pos.cart}
      >
        <ShoppingCart className="size-4" />
        <span className="font-medium text-sm">{cartCount}</span>
      </button>

      <div className="hidden lg:flex items-center gap-1 text-xs text-foreground-tertiary">
        <Info className="size-3.5" />
        {ar.pos.keyboardHint}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * SCAN COLUMN
 * ────────────────────────────────────────────────────────────────────────── */
function ScanColumn({
  onScan,
  error,
  flash,
  feedback,
  shakeNonce,
  cart,
  onPickManual,
  onShowLabel,
}: {
  onScan: (b: string) => Promise<void>;
  error: string | null;
  flash: RollLookup | null;
  feedback: ScannerFeedback;
  shakeNonce: number;
  cart: CartLine[];
  onPickManual: (r: RollLookup) => void;
  onShowLabel: (r: RollLookup) => void;
}) {
  // Border-color class on the scan input wrapper.
  const borderClass =
    feedback === 'success'
      ? 'border-success'
      : feedback === 'danger'
        ? 'border-danger'
        : 'border-border-default focus-within:border-accent';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-lg">
          <span className="flex items-center gap-2">
            <Scan className="size-5 text-accent" />
            {ar.pos.scan}
          </span>
          <button
            type="button"
            className="cursor-pointer p-1 text-foreground-tertiary hover:text-foreground"
            aria-label="المزيد"
            title="المزيد"
          >
            <MoreVertical className="size-4" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Hero scan input — 2px outline on focus, success/danger flash on feedback */}
        <div
          key={`scanwrap-${shakeNonce}`}
          data-functional-motion={feedback === 'danger' ? 'shake' : ''}
          className={`rounded-md border-2 bg-surface p-3 text-xl transition-colors duration-75 ${borderClass} ${
            feedback === 'danger' ? 'rmx-shake' : ''
          }`}
        >
          <ScannerInput
            onScan={(b) => void onScan(b)}
            placeholder={ar.pos.scanFocus}
          />
        </div>

        {flash && (
          <FlashCard roll={flash} onShowLabel={() => onShowLabel(flash)} />
        )}

        {/* Inline error preserved as accessible status text; toast handles the loud notify. */}
        {error && !flash && (
          <p className="text-sm text-danger-foreground flex items-center gap-2" role="status">
            <AlertTriangle className="size-4 text-danger" />
            {error}
          </p>
        )}

        <ProductsGrid
          cart={cart}
          onPick={onPickManual}
          onShowLabel={onShowLabel}
        />
      </CardContent>
    </Card>
  );
}

function FlashCard({ roll, onShowLabel }: { roll: RollLookup; onShowLabel: () => void }) {
  const fabric = isFabricRoll(roll);
  return (
    <div className="rounded-md border border-success/40 bg-success-subtle p-3 flex items-start gap-3">
      <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="font-medium text-success-foreground">{ar.pos.rollFound}</div>
        <div className="text-sm text-foreground">
          <span className="font-medium">{roll.fabric_name_ar}</span>
          {roll.brand_arabic_name && (
            <span className="text-foreground-muted">
              {' · '}
              {roll.brand_arabic_name}
              {roll.brand_product_line ? ` • ${roll.brand_product_line}` : ''}
            </span>
          )}
        </div>
        {fabric && <ChipRow roll={roll} />}
        {!fabric && roll.color_name_ar && (
          <div className="text-xs text-foreground-tertiary">{roll.color_name_ar}</div>
        )}
      </div>
      {fabric && (
        <Button
          variant="outline"
          size="sm"
          onClick={onShowLabel}
          className="cursor-pointer shrink-0 gap-1"
        >
          <Tag className="size-3.5" />
          {ar.pos.label}
        </Button>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * CART PANEL + ENRICHED CART LINE
 * ────────────────────────────────────────────────────────────────────────── */
function CartPanel({
  cart,
  preview,
  subtotal,
  useCartDiscount,
  updateLine,
  removeLine,
  flashRowId,
  onShowLabel,
  onPay,
  disabled,
  embedded = false,
}: {
  cart: CartLine[];
  preview: SalePreview | null | undefined;
  subtotal: number;
  useCartDiscount: boolean;
  updateLine: (i: number, p: Partial<CartLine>) => void;
  removeLine: (i: number) => void;
  flashRowId: number | null;
  onShowLabel: (r: RollLookup) => void;
  onPay: () => void;
  disabled: boolean;
  embedded?: boolean;
}) {
  const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? (
      <div className="space-y-3">{children}</div>
    ) : (
      <Card className="lg:sticky lg:top-20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="size-5 text-accent" />
            {ar.pos.cart}
            {cart.length > 0 && (
              <span className="inline-flex items-center justify-center rounded-pill bg-accent-subtle text-accent-foreground bg-accent px-2 py-0.5 text-xs font-medium min-w-[1.5rem]">
                {cart.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">{children}</CardContent>
      </Card>
    );

  return (
    <Wrap>
      {cart.length === 0 ? (
        <div className="text-center py-12">
          <div
            className="size-12 mx-auto mb-3 rounded-full bg-surface-hover flex items-center justify-center"
            aria-hidden
          >
            <ShoppingCart className="size-6 text-foreground-tertiary" />
          </div>
          <p className="text-foreground-muted text-sm">{ar.pos.cartEmpty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pe-1 -me-1">
          <AnimatePresence initial={false}>
            {cart.map((l, idx) => (
              <motion.div
                key={l.roll.id}
                data-functional-motion
                initial={false}
                exit={{ opacity: 0.4 }}
                transition={{ duration: 0.1, ease: [0.4, 0, 1, 1] }}
              >
                <EnrichedCartLine
                  line={l}
                  flashing={flashRowId === l.roll.id}
                  onUpdate={(p) => updateLine(idx, p)}
                  onRemove={() => removeLine(idx)}
                  onShowLabel={() => onShowLabel(l.roll)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {cart.length > 0 && (
        <div className="border-t border-border-subtle pt-3 space-y-1 text-sm tabular-num">
          <Row label={ar.pos.subtotal} value={fmtMoney(preview?.subtotal_egp ?? subtotal)} />
          {useCartDiscount && preview && preview.cart_discount_egp > 0 && (
            <Row
              label={ar.pos.discount}
              value={`- ${fmtMoney(preview.cart_discount_egp)}`}
              tone="success"
            />
          )}
          {preview && preview.tax_enabled && (
            <Row label={ar.pos.tax} value={fmtMoney(preview.tax_egp)} />
          )}
          {preview && preview.rounding_egp !== 0 && (
            <Row label={ar.pos.rounding} value={fmtMoney(preview.rounding_egp)} />
          )}
          <Row
            label={ar.pos.total}
            value={fmtMoney(preview?.total_egp ?? subtotal)}
            size="lg"
          />
        </div>
      )}

      <Button
        size="lg"
        className="w-full h-12 cursor-pointer gap-2"
        disabled={disabled}
        onClick={onPay}
      >
        <CreditCard className="size-5" />
        {ar.pos.payment}
      </Button>
    </Wrap>
  );
}

function EnrichedCartLine({
  line,
  flashing,
  onUpdate,
  onRemove,
  onShowLabel,
}: {
  line: CartLine;
  flashing: boolean;
  onUpdate: (p: Partial<CartLine>) => void;
  onRemove: () => void;
  onShowLabel: () => void;
}) {
  const r = line.roll;
  const fabric = isFabricRoll(r);

  return (
    <div
      data-functional-motion
      className={`rounded-md border bg-surface-elevated p-3 space-y-2 transition-colors duration-200 ${
        flashing ? 'border-success bg-success-subtle' : 'border-border-subtle'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="font-medium text-sm leading-tight text-foreground">
            {r.fabric_name_ar}
          </div>
          {r.brand_arabic_name && (
            <div className="text-xs text-foreground-muted">
              {r.brand_arabic_name}
              {r.brand_product_line ? ` • ${r.brand_product_line}` : ''}
            </div>
          )}
          {fabric && <ChipRow roll={r} />}
          <div className="text-xs text-foreground-tertiary font-mono tabular-num" dir="ltr">
            {r.roll_sr_no ?? r.internal_barcode} · {Number(r.weight_kg).toFixed(3)} kg
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="size-8 p-0 cursor-pointer text-foreground-tertiary hover:text-danger"
            aria-label={ar.common.cancel}
          >
            <X className="size-4" />
          </Button>
          {fabric && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowLabel}
              className="size-8 p-0 cursor-pointer text-foreground-tertiary hover:text-accent"
              aria-label={ar.pos.label}
              title={ar.pos.label}
            >
              <Tag className="size-4" />
            </Button>
          )}
          {fabric && r.composition_description && (
            <Tooltip label={r.composition_description} placement="bottom">
              <button
                className="size-8 p-0 cursor-pointer text-foreground-tertiary hover:text-accent inline-flex items-center justify-center rounded-md"
                aria-label={ar.pos.composition}
              >
                <Info className="size-4" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Inline price + line discount + total */}
      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-foreground-muted">{ar.pos.pricePerKg}</Label>
          <Input
            value={line.priceOverride}
            onChange={(e) => onUpdate({ priceOverride: e.target.value })}
            placeholder={fmtMoney(r.selling_price_egp)}
            dir="ltr"
            inputMode="decimal"
            className="h-9 tabular-num"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-foreground-muted">{ar.pos.lineDiscount}</Label>
          <Input
            value={line.lineDiscount}
            onChange={(e) => onUpdate({ lineDiscount: e.target.value })}
            placeholder="0"
            dir="ltr"
            inputMode="decimal"
            className="h-9 tabular-num"
          />
        </div>
        <div className="space-y-1 text-start">
          <Label className="text-xs text-foreground-muted">{ar.pos.lineTotal}</Label>
          <div
            className="h-9 flex items-center justify-end font-semibold text-foreground tabular-num"
            dir="ltr"
          >
            {fmtMoney(lineSubtotal(line))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChipRow({ roll }: { roll: RollLookup }) {
  const chips: Array<{ label: string; value: string }> = [];
  if (roll.grade_arabic_name)
    chips.push({ label: ar.pos.grade, value: roll.grade_arabic_name });
  if (roll.width_cm) chips.push({ label: ar.pos.width, value: `${roll.width_cm} سم` });
  if (roll.color_name_ar)
    chips.push({
      label: ar.pos.color,
      value: roll.color_code
        ? `${roll.color_name_ar} ${roll.color_code}`
        : roll.color_name_ar,
    });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.label + c.value}
          className="inline-flex items-center gap-1 rounded-pill bg-surface-row-alt px-2 py-0.5 text-[11px] text-foreground"
        >
          <span className="text-foreground-tertiary">{c.label}:</span>
          <span className="font-medium">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * PAYMENT FORM (rendered inside bottom sheet)
 * ────────────────────────────────────────────────────────────────────────── */
function PaymentForm({
  banks,
  paymentMode,
  setPaymentMode,
  cashAmount,
  setCashAmount,
  instaAmount,
  setInstaAmount,
  bankAccountId,
  setBankAccountId,
  saveAsOpen,
  setSaveAsOpen,
  notesAr,
  setNotesAr,
  preview,
  paymentSum,
  validation,
  submitError,
  submitting,
  onSubmit,
  total,
}: {
  banks: BankAccount[];
  paymentMode: PaymentMode;
  setPaymentMode: (m: PaymentMode) => void;
  cashAmount: string;
  setCashAmount: (s: string) => void;
  instaAmount: string;
  setInstaAmount: (s: string) => void;
  bankAccountId: number | '';
  setBankAccountId: (n: number | '') => void;
  saveAsOpen: boolean;
  setSaveAsOpen: (b: boolean) => void;
  notesAr: string;
  setNotesAr: (s: string) => void;
  preview: SalePreview | null | undefined;
  paymentSum: number;
  validation: string | null;
  submitError: string | null;
  submitting: boolean;
  onSubmit: () => void;
  total: number;
}) {
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Method tile grid */}
      <div className="grid grid-cols-3 gap-2">
        {(['cash', 'instapay', 'both'] as const).map((m) => {
          const active = paymentMode === m;
          const Icon = m === 'cash' ? Banknote : m === 'instapay' ? CreditCard : Receipt;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMode(m)}
              className={`cursor-pointer rounded-lg border-2 p-3 flex flex-col items-center justify-center gap-1 transition-colors duration-150 min-h-[80px] ${
                active
                  ? 'border-accent bg-accent-subtle text-accent'
                  : 'border-border-subtle bg-surface-elevated text-foreground hover:bg-surface-hover'
              }`}
            >
              <Icon className="size-6" />
              <span className="text-sm font-medium">{ar.pos[m]}</span>
            </button>
          );
        })}
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(paymentMode === 'cash' || paymentMode === 'both') && (
          <div className="space-y-1">
            <Label>{ar.pos.cashAmount}</Label>
            <Input
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              dir="ltr"
              inputMode="decimal"
              className="h-11 tabular-num"
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
                className="h-11 tabular-num"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>{ar.pos.bankAccount}</Label>
              <select
                className="h-11 w-full border border-border-default rounded-md px-2 bg-surface-elevated text-foreground cursor-pointer"
                value={bankAccountId}
                onChange={(e) =>
                  setBankAccountId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">—</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_ar}
                    {b.is_default ? ' (افتراضي)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Save as open toggle (also surfaced in top bar; mirrored here for convenience) */}
      <label className="flex items-center gap-2 text-sm cursor-pointer min-h-11 text-foreground">
        <input
          type="checkbox"
          checked={saveAsOpen}
          onChange={(e) => setSaveAsOpen(e.target.checked)}
          className="size-5 cursor-pointer accent-accent"
        />
        {ar.pos.saveAsOpen}
      </label>

      {/* Notes */}
      <div className="space-y-1">
        <Label>{ar.pos.notes}</Label>
        <Input
          value={notesAr}
          onChange={(e) => setNotesAr(e.target.value)}
          dir="rtl"
          className="h-11"
        />
      </div>

      {/* Summary */}
      {preview && (
        <div className="rounded-md border border-border-subtle bg-surface-row-alt p-3 space-y-1 text-sm tabular-num">
          <Row label={ar.pos.subtotal} value={fmtMoney(preview.subtotal_egp)} />
          {preview.cart_discount_egp > 0 && (
            <Row
              label={ar.pos.discount}
              value={`- ${fmtMoney(preview.cart_discount_egp)}`}
              tone="success"
            />
          )}
          {preview.tax_enabled && (
            <Row label={ar.pos.tax} value={fmtMoney(preview.tax_egp)} />
          )}
          {preview.rounding_egp !== 0 && (
            <Row label={ar.pos.rounding} value={fmtMoney(preview.rounding_egp)} />
          )}
          <Row label={ar.pos.total} value={fmtMoney(preview.total_egp)} size="lg" />
          <Row label={ar.pos.paid} value={fmtMoney(paymentSum)} />
          <Row
            label={ar.pos.balance}
            value={fmtMoney(Math.max(0, total - paymentSum))}
          />
        </div>
      )}

      {validation && (
        <div className="flex items-center gap-2 text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md p-2">
          <AlertTriangle className="size-4 shrink-0 text-danger" />
          <span>{validation}</span>
        </div>
      )}
      {submitError && (
        <div className="flex items-center gap-2 text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md p-2">
          <AlertTriangle className="size-4 shrink-0 text-danger" />
          <span>{submitError}</span>
        </div>
      )}

      <Button
        className="w-full h-12 cursor-pointer"
        size="lg"
        disabled={!!validation || submitting}
        onClick={onSubmit}
      >
        {ar.pos.submit}
      </Button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * PRODUCTS GRID — all available rolls displayed as inline cards
 * ────────────────────────────────────────────────────────────────────────── */
function ProductsGrid({
  cart,
  onPick,
  onShowLabel,
}: {
  cart: CartLine[];
  onPick: (r: RollLookup) => void;
  onShowLabel: (r: RollLookup) => void;
}) {
  const [search, setSearch] = useState('');

  const { data: rolls = [], isLoading } = useQuery<RollLookup[]>({
    queryKey: ['pos-rolls'],
    queryFn: () =>
      salesApi.searchRolls({ status: 'in_stock', is_visible_at_pos: true }),
  });

  const cartIds = useMemo(() => new Set(cart.map((l) => l.roll.id)), [cart]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rolls;
    return rolls.filter((r) =>
      `${r.fabric_name_ar} ${r.color_name_ar} ${r.color_code ?? ''} ${r.roll_sr_no ?? ''} ${r.internal_barcode} ${r.brand_arabic_name ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [rolls, search]);

  return (
    <div className="space-y-3 border-t border-border-subtle pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {ar.pos.allProducts}
          </h3>
          {!isLoading && (
            <span className="inline-flex items-center justify-center rounded-pill bg-surface-row-alt px-2 py-0.5 text-xs text-foreground-muted tabular-num">
              {filtered.length}
            </span>
          )}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-4 text-foreground-tertiary pointer-events-none" />
          <Input
            placeholder={ar.pos.searchProducts}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            dir="rtl"
            className="h-10 ps-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md border border-border-subtle bg-surface-elevated p-3 h-32 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-foreground-tertiary">
          {ar.common.none}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto pe-1 -me-1">
          {filtered.map((r) => {
            const inCart = cartIds.has(r.id);
            const fabric = isFabricRoll(r);
            return (
              <div
                key={r.id}
                className={`group relative rounded-md border bg-surface-elevated p-3 flex flex-col gap-2 transition-colors duration-150 ${
                  inCart
                    ? 'border-success/40 bg-success-subtle'
                    : 'border-border-subtle hover:border-accent hover:bg-surface-hover'
                }`}
              >
                {inCart && (
                  <span className="absolute top-2 start-2 inline-flex items-center gap-1 rounded-pill bg-success text-white px-2 py-0.5 text-[10px] font-medium">
                    <CheckCircle2 className="size-3" />
                    {ar.pos.inCart}
                  </span>
                )}

                <div className="min-w-0 space-y-1">
                  <div className="font-medium text-sm truncate text-foreground">
                    {r.fabric_name_ar}
                  </div>
                  {r.color_name_ar && (
                    <div className="text-xs text-foreground-muted truncate">
                      {r.color_code ? `${r.color_name_ar} · ${r.color_code}` : r.color_name_ar}
                    </div>
                  )}
                  <div
                    className="text-[11px] text-foreground-tertiary font-mono tabular-num truncate"
                    dir="ltr"
                  >
                    {r.roll_sr_no ?? r.internal_barcode}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground-muted tabular-num" dir="ltr">
                    {Number(r.weight_kg).toFixed(3)} كجم
                  </span>
                  <span className="font-semibold text-foreground tabular-num" dir="ltr">
                    {fmtMoney(r.selling_price_egp)}
                  </span>
                </div>

                <div className="flex items-center gap-1 mt-auto">
                  <Button
                    size="sm"
                    variant={inCart ? 'outline' : 'default'}
                    disabled={inCart}
                    onClick={() => onPick(r)}
                    className="h-9 flex-1 cursor-pointer gap-1 disabled:cursor-not-allowed"
                  >
                    {inCart ? (
                      <>
                        <CheckCircle2 className="size-4" />
                        {ar.pos.inCart}
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="size-4" />
                        {ar.pos.addToCart}
                      </>
                    )}
                  </Button>
                  {fabric && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onShowLabel(r)}
                      className="h-9 size-9 p-0 cursor-pointer text-foreground-tertiary hover:text-accent"
                      aria-label={ar.pos.label}
                      title={ar.pos.label}
                    >
                      <Tag className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * LABEL PREVIEW MODAL — uses Phase 5's PDF endpoint
 * ────────────────────────────────────────────────────────────────────────── */
function LabelPreviewModal({
  roll,
  onClose,
}: {
  roll: RollLookup | null;
  onClose: () => void;
}) {
  const open = !!roll;
  const [format, setFormat] = useState<'thermal' | 'a4'>('thermal');
  const [blobUrl, setBlobUrl] = useState<string>('');

  useEffect(() => {
    if (!open) setFormat('thermal');
  }, [open]);

  useEffect(() => {
    if (!roll) { setBlobUrl(''); return; }
    let created: string | null = null;
    let cancelled = false;
    itemsApi.fabricLabelBlob(roll.id, format).then((blob) => {
      if (cancelled) return;
      created = URL.createObjectURL(blob);
      setBlobUrl(created);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [roll, format]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-5" />
            {ar.pos.labelPreview}
          </DialogTitle>
        </DialogHeader>
        {roll && (
          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-medium text-foreground">{roll.fabric_name_ar}</div>
              <div className="text-xs text-foreground-tertiary font-mono tabular-num" dir="ltr">
                {roll.internal_barcode}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={format === 'thermal' ? 'default' : 'outline'}
                onClick={() => setFormat('thermal')}
                className="cursor-pointer"
              >
                Thermal
              </Button>
              <Button
                size="sm"
                variant={format === 'a4' ? 'default' : 'outline'}
                onClick={() => setFormat('a4')}
                className="cursor-pointer"
              >
                A4
              </Button>
            </div>
            {blobUrl ? (
              <iframe
                src={blobUrl}
                title={ar.pos.labelPreview}
                className="w-full h-[60vh] border border-border-subtle rounded-md"
              />
            ) : (
              <div className="w-full h-[60vh] border border-border-subtle rounded-md grid place-items-center text-sm text-foreground-tertiary">
                {ar.loading}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" className="cursor-pointer">
                  {ar.common.cancel}
                </Button>
              </DialogClose>
              <Button
                disabled={!blobUrl}
                className="cursor-pointer gap-2"
                onClick={() => { if (blobUrl) window.open(blobUrl, '_blank'); }}
              >
                <Tag className="size-4" />
                {ar.pos.print}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * QUICK CUSTOMER DIALOG
 * ────────────────────────────────────────────────────────────────────────── */
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
        axios.isAxiosError(e) &&
        e.response?.data &&
        (e.response.data as { message?: string }).message
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
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              dir="rtl"
              className="h-11 md:h-10"
            />
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
              className="h-11 md:h-10 tabular-num"
            />
          </div>
          {error && <p className="text-sm text-danger-foreground">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
            <DialogClose asChild>
              <Button variant="outline" className="h-11 md:h-10 cursor-pointer">
                {ar.common.cancel}
              </Button>
            </DialogClose>
            <Button
              onClick={() => create.mutate()}
              disabled={!name || !phone || create.isPending}
              className="h-11 md:h-10 cursor-pointer"
            >
              {ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * MISC
 * ────────────────────────────────────────────────────────────────────────── */
function Row({
  label,
  value,
  size = 'sm',
  tone,
}: {
  label: string;
  value: string;
  size?: 'sm' | 'lg';
  tone?: 'success';
}) {
  const bold = size === 'lg';
  const toneCls = tone === 'success' ? 'text-success-foreground' : '';
  return (
    <div
      className={`flex justify-between ${
        bold ? 'text-2xl font-semibold pt-1' : ''
      } ${toneCls}`}
    >
      <span className={bold ? 'text-foreground' : 'text-foreground-muted'}>{label}</span>
      <span dir="ltr" className={bold ? 'text-foreground tabular-num' : 'tabular-num'}>
        {value}
      </span>
    </div>
  );
}
