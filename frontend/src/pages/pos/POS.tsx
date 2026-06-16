import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { extractApiError } from '@/lib/api-error';
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
  Store,
  Factory,
  RotateCcw,
  Loader2,
  Landmark,
  FileText,
  ArrowLeftRight,
  DollarSign,
  UserPlus,
} from 'lucide-react';
import { Toast } from '@/components/Toast';
import { Tooltip } from '@/components/Tooltip';
import { ar } from '@/i18n/ar';
import { salesApi } from '@/lib/sales-api';
import { customersApi } from '@/lib/customers-api';
import { itemsApi } from '@/lib/items-api';
import { financeApi } from '@/lib/finance-api';
import type { Customer } from '@/lib/customers-types';
import type {
  BankAccount,
  ChequeDetails,
  FulfillmentDestination,
  Invoice,
  ReturnScanMeta,
  RollLookup,
  SalePreview,
} from '@/lib/sales-types';
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
import { shiftsApi, type Shift } from '@/lib/shifts-api';
import { StartDayPanel } from './StartDayPanel';
import { EndDayDialog } from './EndDayDialog';

type CartLine = {
  roll: RollLookup;
  priceOverride: string;
  lineDiscount: string;
};

type PaymentMode = 'cash' | 'instapay' | 'bank_transfer' | 'cheque' | 'split';

type ChequeFormState = {
  chequeNumber: string;
  bankNameAr: string;
  branchAr: string;
  issuerNameAr: string;
  issueDate: string;
  dueDate: string;
  notesAr: string;
};

function emptyCheque(): ChequeFormState {
  return { chequeNumber: '', bankNameAr: '', branchAr: '', issuerNameAr: '', issueDate: '', dueDate: '', notesAr: '' };
}

function chequeStateToDetails(s: ChequeFormState): ChequeDetails | null {
  if (!s.chequeNumber || !s.bankNameAr || !s.issueDate || !s.dueDate) return null;
  return {
    chequeNumber: s.chequeNumber,
    bankNameAr: s.bankNameAr,
    branchAr: s.branchAr || null,
    issuerNameAr: s.issuerNameAr || null,
    issueDate: s.issueDate,
    dueDate: s.dueDate,
    notesAr: s.notesAr || null,
  };
}

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

// v2 Phase 5 — POS price is per-unit, kg or meter. The cashier always types a
// per-unit price; the line's absolute amount = perUnit × qty. `priceOverride`
// holds the per-unit cashier input (raw string for free typing).
function rollQuantity(roll: RollLookup): number {
  if (roll.fabric_unit === 'meter') {
    return roll.length_m == null ? 0 : Number(roll.length_m);
  }
  return Number(roll.weight_kg);
}

function effectivePerUnit(line: CartLine): number {
  const v = parseAmount(line.priceOverride);
  return v > 0 ? v : 0;
}

function lineAbsolute(line: CartLine): number {
  const qty = rollQuantity(line.roll);
  return effectivePerUnit(line) * qty;
}

function lineSubtotal(line: CartLine): number {
  const price = lineAbsolute(line);
  const disc = Math.min(parseAmount(line.lineDiscount), price);
  return Math.max(0, price - disc);
}

function isFabricRoll(r: RollLookup): boolean {
  return Boolean(
    r.brand_arabic_name || r.grade_arabic_name || r.composition_description || r.width_cm,
  );
}

function isFactoryRoll(r: RollLookup): boolean {
  return r.warehouse === 'factory';
}

function isShopRoll(r: RollLookup): boolean {
  return r.warehouse === 'shop' || r.warehouse === 'damaged_shop';
}

function rollMatchesDestination(r: RollLookup, dest: FulfillmentDestination): boolean {
  return dest === 'factory_direct' ? isFactoryRoll(r) : isShopRoll(r);
}

export function POSPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [endDayShift, setEndDayShift] = useState<Shift | null>(null);

  const shiftQ = useQuery<Shift | null>({
    queryKey: ['shift-current'],
    queryFn: () => shiftsApi.current(),
    // Pause refetch while the End Day dialog is showing the report —
    // otherwise the auto-refetch would set shiftQ.data=null, the gate would
    // re-render to StartDayPanel, and the dialog would unmount mid-report.
    refetchInterval: endDayShift ? false : 60_000,
    refetchOnWindowFocus: !endDayShift,
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState<RollLookup | null>(null);

  // Phase 4 — fulfillment destination (per invoice). Default: shop.
  const [destination, setDestination] = useState<FulfillmentDestination>('shop');
  const [pendingDestination, setPendingDestination] = useState<FulfillmentDestination | null>(null);

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
  const [reference, setReference] = useState('');
  const [chequeState, setChequeState] = useState<ChequeFormState>(emptyCheque());
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [notesAr, setNotesAr] = useState('');

  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [labelRoll, setLabelRoll] = useState<RollLookup | null>(null);

  // Quick action buttons for elderly users
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  // v2 Phase 5 — no-lines deposit dialog state.
  const [depositOpen, setDepositOpen] = useState(false);

  // v2 Phase 6 — return on scan state.
  const [returnDrawerRoll, setReturnDrawerRoll] = useState<RollLookup | null>(null);
  const [returnMeta, setReturnMeta] = useState<ReturnScanMeta | null>(null);
  const [returnMetaLoading, setReturnMetaLoading] = useState(false);
  const [returnMethod, setReturnMethod] = useState<'cash' | 'instapay' | 'bank_transfer' | 'cheque'>('cash');
  const [returnBankId, setReturnBankId] = useState<number | ''>('');
  const [returnReference, setReturnReference] = useState('');
  const [returnChequeState, setReturnChequeState] = useState<ChequeFormState>(emptyCheque());
  const [returnConfirming, setReturnConfirming] = useState(false);

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
        finalPricePerUnit: parseAmount(l.priceOverride) || null,
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


  async function handleScanEnter(barcode: string) {
    setScanError(null);
    if (!barcode.trim()) return;
    try {
      const roll = await salesApi.rollByBarcode(barcode.trim());

      // Phase 6 — sold roll triggers return drawer, not cart addition.
      if (roll.status === 'sold') {
        if (returnDrawerRoll?.id === roll.id) {
          // Re-scan of the roll already in the open return panel — silent no-op.
          showToast(ar.pos.returnAlreadyOpen);
          return;
        }
        await openReturnDrawer(roll);
        return;
      }

      if (roll.status === 'damaged') {
        flagScanFailure(ar.pos.returnDamagedRoll);
        return;
      }

      if (roll.status !== 'in_stock') {
        flagScanFailure(ar.pos.notFound);
      } else if (!roll.is_visible_at_pos) {
        flagScanFailure(ar.pos.notVisible);
      } else if (!rollMatchesDestination(roll, destination)) {
        flagScanFailure(
          destination === 'shop'
            ? ar.pos.factoryRollInShopMode
            : ar.pos.shopRollInFactoryMode,
        );
      } else if (cart.find((l) => l.roll.id === roll.id)) {
        flagScanFailure(ar.pos.alreadyInCart);
      } else {
        setCart((c) => [...c, { roll, priceOverride: '', lineDiscount: '' }]);
        setScanFlash(roll);
        setScannerFeedback('success');
        setFlashRowId(roll.id);
      }
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      flagScanFailure(status === 404 ? ar.pos.notFound : extractApiError(e));
    }
  }

  async function openReturnDrawer(roll: RollLookup) {
    setReturnDrawerRoll(roll);
    setReturnMeta(null);
    setReturnMetaLoading(true);
    setReturnMethod('cash');
    setReturnBankId(typeof bankAccountId === 'number' ? bankAccountId : '');
    try {
      const meta = await salesApi.scanPreview(roll.id);
      setReturnMeta(meta);
    } catch {
      setReturnDrawerRoll(null);
      showToast(ar.common.error);
    } finally {
      setReturnMetaLoading(false);
    }
  }

  async function confirmScanReturn() {
    if (!returnMeta || returnConfirming) return;
    setReturnConfirming(true);
    try {
      const result = await salesApi.scanReturn({
        rollId: returnMeta.rollId,
        refundMethod: returnMethod,
        bankAccountId: (returnMethod === 'instapay' || returnMethod === 'bank_transfer') ? (returnBankId || null) : null,
        reference: returnMethod === 'bank_transfer' ? (returnReference || null) : null,
        chequeDetails: returnMethod === 'cheque' ? chequeStateToDetails(returnChequeState) : null,
      });
      setReturnDrawerRoll(null);
      setReturnMeta(null);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['pos-rolls'] });
      showToast(`${ar.pos.returnSuccess} — ${result.return_no}`);
    } catch (e) {
      showToast(extractApiError(e));
    } finally {
      setReturnConfirming(false);
    }
  }

  function requestDestinationChange(next: FulfillmentDestination) {
    if (next === destination) return;
    const incompatible = cart.some((l) => !rollMatchesDestination(l.roll, next));
    if (incompatible) {
      setPendingDestination(next);
      return;
    }
    setDestination(next);
  }

  function confirmDestinationChange() {
    if (!pendingDestination) return;
    const next = pendingDestination;
    setCart((c) => c.filter((l) => rollMatchesDestination(l.roll, next)));
    setDestination(next);
    setPendingDestination(null);
    setScanFlash(null);
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
    enabled: pickerOpen || (paymentSheetOpen && customerSearch.length > 0),
  });

  const total = preview?.total_egp ?? subtotal;
  const cashNum = parseAmount(cashAmount);
  const instaNum = parseAmount(instaAmount);
  const paymentSum =
    paymentMode === 'cash' || paymentMode === 'cheque'
      ? cashNum
      : paymentMode === 'instapay' || paymentMode === 'bank_transfer'
        ? instaNum
        : cashNum + instaNum; // split


  const submit = useMutation({
    mutationFn: () => {
      if (!customer) throw new Error('NO_CUSTOMER');
      // Cap payments at total so backend never sees an overpayment.
      // For split mode, excess is absorbed from cash first.
      const changeAmt = Math.max(0, paymentSum - total);
      const cappedCash =
        paymentMode === 'split'
          ? Math.max(0, cashNum - changeAmt)
          : Math.min(cashNum, total);
      const cappedInsta =
        paymentMode === 'split'
          ? Math.min(instaNum, total - cappedCash)
          : Math.min(instaNum, total);
      const payments: Array<{
        method: 'cash' | 'instapay' | 'bank_transfer' | 'cheque';
        amount: number;
        bankAccountId?: number | null;
        reference?: string | null;
        chequeDetails?: ChequeDetails | null;
      }> = [];
      if (paymentMode === 'cash' || paymentMode === 'split') {
        if (cappedCash > 0) payments.push({ method: 'cash', amount: cappedCash });
      }
      if (paymentMode === 'instapay' || paymentMode === 'split') {
        if (cappedInsta > 0) {
          payments.push({ method: 'instapay', amount: cappedInsta, bankAccountId: bankAccountId || null });
        }
      }
      if (paymentMode === 'bank_transfer') {
        if (cappedInsta > 0) {
          payments.push({ method: 'bank_transfer', amount: cappedInsta, bankAccountId: bankAccountId || null, reference: reference || null });
        }
      }
      if (paymentMode === 'cheque') {
        if (cappedCash > 0) {
          payments.push({ method: 'cheque', amount: cappedCash, chequeDetails: chequeStateToDetails(chequeState) });
        }
      }
      return salesApi.create({
        customerId: customer.id,
        fulfillmentDestination: destination,
        lines: cart.map((l) => ({
          rollId: l.roll.id,
          finalPricePerUnit: parseAmount(l.priceOverride) || null,
          lineDiscountEgp: parseAmount(l.lineDiscount) || null,
        })),
        cartTargetFinal: useCartDiscount ? targetFinalNum : null,
        payments,
        notesAr: notesAr || null,
      });
    },
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setPaymentSheetOpen(false);
      setSubmitError(null);
      resetSale();
      navigate(`/invoices/${invoice.id}/draft`);
    },
    onError: (e: unknown) => {
      const msg = extractApiError(e);
      setSubmitError(msg);
      showToast(msg);
    },
  });

  // Gates the Pay button — only requires a non-empty cart.
  const openValidation = cart.length === 0 ? ar.pos.cartEmpty : null;

  // Gates the Submit button inside the payment dialog — full check.
  const submitValidation = (() => {
    if (cart.length === 0) return ar.pos.cartEmpty;
    if (!customer) return ar.pos.customerRequired;
    // v2 Phase 5: every cart line must carry a per-unit final price.
    if (cart.some((l) => effectivePerUnit(l) <= 0)) return ar.pos.finalPriceRequired;
    if (paymentSum <= 0) return ar.pos.payment;
    if (saveAsOpen) return null;
    if (paymentSum < total - 0.01) return ar.pos.sumMustEqualTotal; // allow overpayment
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
    setReference('');
    setChequeState(emptyCheque());
    setSaveAsOpen(false);
    setNotesAr('');
    setSubmitError(null);
    setPaymentSheetOpen(false);
    setCartSheetOpen(false);
    setDestination('shop');
    setPendingDestination(null);
  }

  // Render the End Day dialog whenever it's been opened — it captures its own
  // shift snapshot so it stays mounted even after shiftQ.data becomes null
  // (i.e., right after the user closes the shift). The user must explicitly
  // click "تم" to dismiss it.
  const endDayDialog = endDayShift ? (
    <EndDayDialog
      open
      shift={endDayShift}
      onClose={() => {
        setEndDayShift(null);
        qc.invalidateQueries({ queryKey: ['shift-current'] });
        qc.invalidateQueries({ queryKey: ['cash-balance'] });
      }}
    />
  ) : null;

  // --- Shift gate ---
  if (shiftQ.isLoading) {
    return (
      <>
        {endDayDialog}
        <div className="flex min-h-screen items-center justify-center text-foreground-muted text-sm">
          {ar.loading}
        </div>
      </>
    );
  }

  if (shiftQ.isError) {
    return (
      <>
        {endDayDialog}
        <div className="flex min-h-screen items-center justify-center flex-col gap-4 px-4" dir="rtl">
          <p className="text-sm text-danger-foreground">{ar.common.error}</p>
          <button
            type="button"
            onClick={() => shiftQ.refetch()}
            className="text-sm text-accent hover:underline"
          >
            {ar.common.refresh}
          </button>
        </div>
      </>
    );
  }

  if (!shiftQ.data) {
    return (
      <>
        {endDayDialog}
        <StartDayPanel
          onStaleShift={async () => {
            // A stale open shift exists — fetch it and surface in EndDayDialog
            const stale = await shiftsApi.current();
            if (stale) {
              setEndDayShift(stale);
            }
          }}
        />
      </>
    );
  }

  const activeShift = shiftQ.data;

  return (
    <>
      {endDayDialog}

    <div
      data-motion="reduced"
      className="flex flex-col gap-4 max-w-[1600px] mx-auto pb-24 lg:pb-4"
    >
      {/* Shift strip — elderly-friendly: large, prominent buttons */}
      <ShiftStrip
        activeShift={activeShift}
        onEndDay={() => setEndDayShift(activeShift)}
      />

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
        onOpenExpense={() => setExpenseDialogOpen(true)}
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
          destination={destination}
          onPickManual={(roll) => {
            if (!rollMatchesDestination(roll, destination)) {
              flagScanFailure(
                destination === 'shop'
                  ? ar.pos.factoryRollInShopMode
                  : ar.pos.shopRollInFactoryMode,
              );
              return;
            }
            if (!cart.find((l) => l.roll.id === roll.id)) {
              setCart((c) => [...c, { roll, priceOverride: '', lineDiscount: '' }]);
              setScanFlash(roll);
              setScannerFeedback('success');
              setFlashRowId(roll.id);
            }
          }}
          onRemoveManual={(rollId) => {
            const idx = cart.findIndex((l) => l.roll.id === rollId);
            if (idx !== -1) removeLine(idx);
          }}
          onShowLabel={setLabelRoll}
        />

        {/* RIGHT: cart panel (lg+) */}
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
            disabled={!!openValidation}
            destination={destination}
            onChangeDestination={requestDestinationChange}
            customer={customer}
            onOpenDeposit={() => setDepositOpen(true)}
          />
        </div>
      </div>

      {/* Cart sheet (sm/md): right slide-in */}
      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md pb-[max(env(safe-area-inset-bottom),1rem)]">
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
              disabled={!!openValidation}
              embedded
              destination={destination}
              onChangeDestination={requestDestinationChange}
              customer={customer}
              onOpenDeposit={() => {
                setCartSheetOpen(false);
                setDepositOpen(true);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment modal — all screen sizes */}
      <Dialog open={paymentSheetOpen} onOpenChange={setPaymentSheetOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border-subtle shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-accent" />
              {ar.pos.paymentSheetTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
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
              reference={reference}
              setReference={setReference}
              chequeState={chequeState}
              setChequeState={setChequeState}
              saveAsOpen={saveAsOpen}
              setSaveAsOpen={setSaveAsOpen}
              notesAr={notesAr}
              setNotesAr={setNotesAr}
              preview={preview}
              paymentSum={paymentSum}
              validation={submitValidation}
              submitError={submitError}
              submitting={submit.isPending}
              onSubmit={() => submit.mutate()}
              total={total}
              customer={customer}
              customerSearch={customerSearch}
              setCustomerSearch={setCustomerSearch}
              customerResults={customerResults}
              onPickCustomer={(c: Customer) => { setCustomer(c); setCustomerSearch(''); }}
              onQuickCustomer={() => setQuickOpen(true)}
              onClearCustomer={() => setCustomer(null)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile sticky bottom bar — cart count + pay. Stacks to two rows on narrow phones. */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-sticky bg-surface/95 backdrop-blur border-t border-border-subtle px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-lg">
          <button
            onClick={() => setCartSheetOpen(true)}
            className="flex items-center justify-between sm:justify-start gap-2 cursor-pointer min-h-11 px-2 text-foreground w-full sm:w-auto"
            aria-label={ar.pos.cart}
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-5" />
              <span className="font-medium text-sm">
                {cart.length} · {ar.pos.subtotal}
              </span>
            </span>
            <span className="font-semibold text-base tabular-num" dir="ltr">
              {fmtMoney(preview?.total_egp ?? subtotal)}
            </span>
          </button>
          <Button
            size="lg"
            className="h-12 w-full sm:flex-1 cursor-pointer"
            disabled={!!openValidation}
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
          setCustomerSearch('');
          setQuickOpen(false);
        }}
      />

      {/* Label preview modal */}
      <LabelPreviewModal roll={labelRoll} onClose={() => setLabelRoll(null)} />


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

      {/* Phase 4 — confirm switching destination when cart has incompatible rolls. */}
      <Dialog
        open={pendingDestination !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDestination(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ar.pos.switchDestinationTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">
            {pendingDestination === 'factory_direct'
              ? ar.pos.switchDestinationToFactoryBody
              : ar.pos.switchDestinationToShopBody}
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingDestination(null)}
              className="cursor-pointer"
            >
              {ar.common.cancel}
            </Button>
            <Button
              size="sm"
              onClick={confirmDestinationChange}
              className="cursor-pointer"
            >
              {ar.pos.switchDestinationConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Phase 6 — return on scan: side drawer opens when a sold roll is scanned. */}
      <ReturnDrawer
        roll={returnDrawerRoll}
        meta={returnMeta}
        metaLoading={returnMetaLoading}
        banks={banks}
        method={returnMethod}
        setMethod={setReturnMethod}
        bankId={returnBankId}
        setBankId={setReturnBankId}
        reference={returnReference}
        setReference={setReturnReference}
        chequeState={returnChequeState}
        setChequeState={setReturnChequeState}
        confirming={returnConfirming}
        onConfirm={() => void confirmScanReturn()}
        onClose={() => {
          if (!returnConfirming) {
            setReturnDrawerRoll(null);
            setReturnMeta(null);
          }
        }}
      />

      {/* Phase 5 — save a no-lines deposit invoice. Enabled when the cart is
          empty and a customer is selected. */}
      <NoLinesDepositDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        customer={customer}
        destination={destination}
        banks={banks}
        defaultBankId={typeof bankAccountId === 'number' ? bankAccountId : null}
        onCreated={(invoice) => {
          qc.invalidateQueries({ queryKey: ['invoices'] });
          setDepositOpen(false);
          resetSale();
          navigate(`/invoices/${invoice.id}/draft`);
        }}
      />

      {/* Quick expense dialog — elderly-friendly */}
      <QuickExpenseDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
      />
    </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * SHIFT STRIP — Elderly-friendly shift control with prominent buttons
 * ────────────────────────────────────────────────────────────────────────── */
function ShiftStrip({
  activeShift,
  onEndDay,
}: {
  activeShift: Shift;
  onEndDay: () => void;
}) {
  const openedTime = new Date(activeShift.opened_at);
  const now = new Date();
  const hoursOpen = (now.getTime() - openedTime.getTime()) / (1000 * 60 * 60);

  // Warning if shift has been open for over 24 hours (didn't close from previous day)
  const isStaleShift = hoursOpen > 24;

  return (
    <div
      className={`rounded-lg border px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
        isStaleShift
          ? 'border-warning bg-warning-subtle'
          : 'border-border-subtle bg-surface-elevated'
      }`}
      dir="rtl"
    >
      <div className="space-y-1 flex-1">
        <div className="text-sm font-medium text-foreground">
          {ar.shifts.openedAt}:{' '}
          <span className="font-semibold text-base tabular-num" dir="ltr">
            {openedTime.toLocaleString('en-GB', {
              timeZone: 'Africa/Cairo',
              hour12: false,
            })}
          </span>
        </div>
        {isStaleShift && (
          <div className="flex items-center gap-2 text-sm text-warning-foreground">
            <AlertTriangle className="size-4 shrink-0" />
            <span>الوردية لم تُغلق منذ أكثر من 24 ساعة. يرجى إغلاق الوردية وفتح وردية جديدة.</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onEndDay}
        className="h-12 px-6 rounded-md bg-danger text-danger-foreground font-semibold text-base hover:opacity-90 transition-opacity w-full sm:w-auto whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
      >
        <AlertTriangle className="size-5" />
        {ar.shifts.endDay}
      </button>
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
  onOpenExpense,
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
  onOpenExpense: () => void;
}) {
  return (
    <div className="bg-surface border-b border-border-subtle -mx-2 px-2 py-2 flex flex-wrap items-center gap-2">
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
        <Tag className="size-4 text-foreground-muted shrink-0" />
        <span className="text-xs text-foreground-muted shrink-0">{ar.pos.targetFinal}</span>
        <Input
          value={targetFinalRaw}
          onChange={(e) => setTargetFinalRaw(e.target.value)}
          placeholder={fmtMoney(subtotalForPlaceholder)}
          dir="ltr"
          inputMode="decimal"
          className="h-8 w-24 sm:w-28 text-base sm:text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1 tabular-num"
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

      {/* Quick action buttons — elderly-friendly, large and noticeable */}
      <div className="flex items-center gap-2">
        {/* Add Expense button */}
        <Button
          onClick={onOpenExpense}
          variant="outline"
          className="h-11 cursor-pointer gap-2 px-4 whitespace-nowrap text-sm font-medium"
          title="إضافة مصروف"
        >
          <DollarSign className="size-5" />
          <span className="hidden sm:inline">مصروف</span>
        </Button>

        {/* Cart pill (mobile/tablet only) */}
        <button
          onClick={onOpenCart}
          className="lg:hidden flex items-center gap-2 cursor-pointer rounded-md border border-border-default bg-surface-elevated px-3 min-h-11 hover:bg-surface-hover transition-colors duration-150 text-foreground"
          aria-label={ar.pos.cart}
        >
          <ShoppingCart className="size-4" />
          <span className="font-medium text-sm">{cartCount}</span>
        </button>
      </div>

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
  destination,
  onPickManual,
  onRemoveManual,
  onShowLabel,
}: {
  onScan: (b: string) => Promise<void>;
  error: string | null;
  flash: RollLookup | null;
  feedback: ScannerFeedback;
  shakeNonce: number;
  cart: CartLine[];
  destination: FulfillmentDestination;
  onPickManual: (r: RollLookup) => void;
  onRemoveManual: (rollId: number) => void;
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
          destination={destination}
          onPick={onPickManual}
          onRemove={onRemoveManual}
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

function CartPanelWrap({
  embedded,
  cartLength,
  children,
}: {
  embedded?: boolean;
  cartLength: number;
  children: React.ReactNode;
}) {
  if (embedded) return <div className="space-y-3">{children}</div>;
  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShoppingCart className="size-5 text-accent" />
          {ar.pos.cart}
          {cartLength > 0 && (
            <span className="inline-flex items-center justify-center rounded-pill bg-accent-subtle text-accent-foreground bg-accent px-2 py-0.5 text-xs font-medium min-w-[1.5rem]">
              {cartLength}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

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
  destination,
  onChangeDestination,
  customer,
  onOpenDeposit,
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
  destination: FulfillmentDestination;
  onChangeDestination: (d: FulfillmentDestination) => void;
  customer: Customer | null;
  onOpenDeposit: () => void;
}) {
  return (
    <CartPanelWrap embedded={embedded} cartLength={cart.length}>
      <DestinationToggle value={destination} onChange={onChangeDestination} />

      {cart.length === 0 ? (
        <div className="text-center py-10 space-y-4">
          <div
            className="size-12 mx-auto rounded-full bg-surface-hover flex items-center justify-center"
            aria-hidden
          >
            <ShoppingCart className="size-6 text-foreground-tertiary" />
          </div>
          <p className="text-foreground-muted text-sm">{ar.pos.cartEmpty}</p>
          <div className="px-3 space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-11 cursor-pointer gap-2 disabled:cursor-not-allowed"
              disabled={!customer}
              onClick={onOpenDeposit}
            >
              <Receipt className="size-4" />
              {ar.pos.saveAsDeposit}
            </Button>
            <p className="text-[11px] text-foreground-tertiary leading-snug">
              {customer ? ar.pos.saveAsDepositHint : ar.pos.customerRequired}
            </p>
          </div>
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
    </CartPanelWrap>
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
  const isMeter = r.fabric_unit === 'meter';
  const qty = rollQuantity(r);
  const qtyLabel = isMeter ? ar.pos.quantityM : ar.pos.quantityKg;
  const finalPriceLabel = isMeter ? ar.pos.finalPricePerMeter : ar.pos.finalPricePerKg;
  const referenceUnit = r.reference_price_per_unit;
  const hasReference = referenceUnit != null && Number(referenceUnit) > 0;

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
            {r.roll_sr_no ?? r.internal_barcode} · {qty.toFixed(3)} {qtyLabel}
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

      {/* Reference price — read-only hint from shipment receive time (Phase 3). */}
      <div className="flex items-center justify-between text-[11px] text-foreground-muted">
        <span>
          {ar.pos.referencePrice}{' '}
          <span className="text-foreground-tertiary">({qtyLabel})</span>
        </span>
        <span className="tabular-num text-foreground" dir="ltr">
          {hasReference ? fmtMoney(referenceUnit!) : ar.pos.referenceUnset}
        </span>
      </div>

      {/* Inline per-unit final price + line discount + total */}
      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-foreground-muted">{finalPriceLabel}</Label>
          <Input
            value={line.priceOverride}
            onChange={(e) => onUpdate({ priceOverride: e.target.value })}
            placeholder={hasReference ? fmtMoney(referenceUnit!) : '0.00'}
            dir="ltr"
            inputMode="decimal"
            className="h-9 tabular-num"
            aria-label={finalPriceLabel}
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
function ChequeDetailsForm({
  state,
  onChange,
  className,
}: {
  state: ChequeFormState;
  onChange: (s: ChequeFormState) => void;
  className?: string;
}) {
  const set = (k: keyof ChequeFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...state, [k]: e.target.value });
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className ?? ''}`}>
      <div className="space-y-1">
        <Label>{ar.pos.chequeNumber}</Label>
        <Input value={state.chequeNumber} onChange={set('chequeNumber')} dir="ltr" className="h-11" />
      </div>
      <div className="space-y-1">
        <Label>{ar.pos.chequeBank}</Label>
        <Input value={state.bankNameAr} onChange={set('bankNameAr')} dir="rtl" className="h-11" />
      </div>
      <div className="space-y-1">
        <Label>{ar.pos.chequeBranch}</Label>
        <Input value={state.branchAr} onChange={set('branchAr')} dir="rtl" className="h-11" placeholder="اختياري" />
      </div>
      <div className="space-y-1">
        <Label>{ar.pos.chequeIssuer}</Label>
        <Input value={state.issuerNameAr} onChange={set('issuerNameAr')} dir="rtl" className="h-11" placeholder="اختياري" />
      </div>
      <div className="space-y-1">
        <Label>{ar.pos.chequeIssueDate}</Label>
        <Input type="date" value={state.issueDate} onChange={set('issueDate')} dir="ltr" className="h-11" />
      </div>
      <div className="space-y-1">
        <Label>{ar.pos.chequeDueDate}</Label>
        <Input type="date" value={state.dueDate} onChange={set('dueDate')} dir="ltr" className="h-11" />
      </div>
    </div>
  );
}

function BankAccountSelect({
  banks,
  value,
  onChange,
}: {
  banks: BankAccount[];
  value: number | '';
  onChange: (n: number | '') => void;
}) {
  return (
    <select
      className="h-11 w-full border border-border-default rounded-md px-2 bg-surface-elevated text-foreground cursor-pointer"
      value={value}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
    >
      <option value="">—</option>
      {banks.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name_ar}{b.is_default ? ' (افتراضي)' : ''}
        </option>
      ))}
    </select>
  );
}

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
  reference,
  setReference,
  chequeState,
  setChequeState,
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
  compact = false,
  customer,
  customerSearch,
  setCustomerSearch,
  customerResults,
  onPickCustomer,
  onQuickCustomer,
  onClearCustomer,
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
  reference: string;
  setReference: (s: string) => void;
  chequeState: ChequeFormState;
  setChequeState: (s: ChequeFormState) => void;
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
  compact?: boolean;
  customer?: Customer | null;
  customerSearch?: string;
  setCustomerSearch?: (s: string) => void;
  customerResults?: { rows: Customer[]; total: number };
  onPickCustomer?: (c: Customer) => void;
  onQuickCustomer?: () => void;
  onClearCustomer?: () => void;
}) {
  const ALL_TILES: { value: PaymentMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'cash', label: ar.pos.cash, Icon: Banknote },
    { value: 'instapay', label: ar.pos.instapay, Icon: CreditCard },
    { value: 'bank_transfer', label: ar.pos.bank_transfer, Icon: Landmark },
    { value: 'cheque', label: ar.pos.cheque, Icon: FileText },
    { value: 'split', label: 'كاش + انستاباي', Icon: ArrowLeftRight },
  ];

  return (
    <div className={compact ? 'space-y-4' : 'space-y-4 max-w-2xl mx-auto'}>
      {/* Inline customer selection — shown when props provided (payment dialog, not compact invoice form) */}
      {onPickCustomer !== undefined && (
        <div className="space-y-2">
          <Label>{ar.pos.customer}</Label>
          {customer ? (
            <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-elevated px-3 py-2 min-h-11">
              <UserRound className="size-4 text-foreground-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">{customer.name_ar}</p>
                <p className="text-xs font-mono text-foreground-tertiary" dir="ltr">{customer.phone}</p>
              </div>
              <button
                type="button"
                onClick={onClearCustomer}
                className="shrink-0 rounded p-1 hover:bg-surface-hover text-foreground-muted"
                aria-label="إزالة العميل"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex gap-1">
                <Input
                  placeholder={ar.customers.search}
                  value={customerSearch ?? ''}
                  onChange={(e) => setCustomerSearch?.(e.target.value)}
                  dir="rtl"
                  className="h-11 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={onQuickCustomer}
                  className="h-11 shrink-0 gap-1 px-3"
                  title={ar.pos.quickCustomer}
                >
                  <UserRound className="size-4" />
                  <span className="text-sm">+</span>
                </Button>
              </div>
              {(customerSearch ?? '').length > 0 && (customerResults?.rows ?? []).length > 0 && (
                <div className="border border-border-subtle rounded-md max-h-48 overflow-y-auto">
                  {(customerResults?.rows ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onPickCustomer(c)}
                      className="w-full text-start px-3 py-2 hover:bg-surface-hover border-b border-border-subtle last:border-0 min-h-11"
                    >
                      <p className="font-medium text-sm text-foreground">{c.name_ar}</p>
                      <p className="text-xs font-mono text-foreground-tertiary" dir="ltr">{c.phone}</p>
                    </button>
                  ))}
                </div>
              )}
              {(customerSearch ?? '').length > 0 && (customerResults?.rows ?? []).length === 0 && (
                <p className="text-sm text-foreground-tertiary px-1 py-1">{ar.customers.empty}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Payment method selector */}
      {compact ? (
        /* Inline panel: 5 methods in a clean 2-col grid */
        <div className="grid grid-cols-2 gap-2">
          {ALL_TILES.map(({ value: m, label, Icon }) => {
            const active = paymentMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMode(m)}
                className={`cursor-pointer rounded-lg border-2 px-3 py-3 flex items-center gap-3 transition-colors duration-150 ${
                  active
                    ? 'border-accent bg-accent-subtle text-accent'
                    : 'border-border-subtle bg-surface-elevated text-foreground hover:bg-surface-hover'
                }`}
              >
                <Icon className="size-5 shrink-0" />
                <span className="text-sm font-medium leading-snug">{label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        /* Bottom sheet: 4 tile cols + separate split row */
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ALL_TILES.filter((t) => t.value !== 'split').map(({ value: m, label, Icon }) => {
              const active = paymentMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMode(m)}
                  className={`cursor-pointer rounded-lg border-2 p-3 flex flex-col items-center justify-center gap-1 transition-colors duration-150 min-h-[72px] ${
                    active
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-border-subtle bg-surface-elevated text-foreground hover:bg-surface-hover'
                  }`}
                >
                  <Icon className="size-5" />
                  <span className="text-xs font-medium text-center leading-snug">{label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setPaymentMode('split')}
            className={`w-full cursor-pointer rounded-lg border-2 p-2.5 flex items-center justify-center gap-2 transition-colors duration-150 ${
              paymentMode === 'split'
                ? 'border-accent bg-accent-subtle text-accent'
                : 'border-border-subtle bg-surface-elevated text-foreground hover:bg-surface-hover'
            }`}
          >
            <ArrowLeftRight className="size-4" />
            <span className="text-sm font-medium">كاش + انستاباي</span>
          </button>
        </>
      )}

      {/* Amounts / method-specific fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Cash: standalone or split */}
        {(paymentMode === 'cash' || paymentMode === 'split') && (
          <div className="space-y-1">
            <Label>{ar.pos.cashAmount}</Label>
            <Input value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} dir="ltr" inputMode="decimal" className="h-11 tabular-num" />
          </div>
        )}
        {/* Cheque: standalone amount field */}
        {paymentMode === 'cheque' && (
          <div className="space-y-1 sm:col-span-2">
            <Label>{ar.pos.chequeAmount}</Label>
            <Input value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} dir="ltr" inputMode="decimal" className="h-11 tabular-num" />
          </div>
        )}
        {/* Instapay / bank_transfer / split: bank-channel amount */}
        {(paymentMode === 'instapay' || paymentMode === 'bank_transfer' || paymentMode === 'split') && (
          <div className="space-y-1">
            <Label>
              {paymentMode === 'bank_transfer' ? ar.pos.bankTransferAmount : ar.pos.instapayAmount}
            </Label>
            <Input value={instaAmount} onChange={(e) => setInstaAmount(e.target.value)} dir="ltr" inputMode="decimal" className="h-11 tabular-num" />
          </div>
        )}
        {/* Bank account selector */}
        {(paymentMode === 'instapay' || paymentMode === 'bank_transfer' || paymentMode === 'split') && (
          <div className="space-y-1 sm:col-span-2">
            <Label>{ar.pos.bankAccount}</Label>
            <BankAccountSelect banks={banks} value={bankAccountId} onChange={setBankAccountId} />
          </div>
        )}
        {/* Reference for bank_transfer */}
        {paymentMode === 'bank_transfer' && (
          <div className="space-y-1 sm:col-span-2">
            <Label>{ar.pos.reference}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" maxLength={64} className="h-11" placeholder="اختياري" />
          </div>
        )}
        {/* Cheque details form */}
        {paymentMode === 'cheque' && (
          <ChequeDetailsForm state={chequeState} onChange={setChequeState} className="sm:col-span-2" />
        )}
      </div>

      {/* Save as open toggle */}
      <label className="flex items-center gap-2 text-sm cursor-pointer min-h-11 text-foreground">
        <input type="checkbox" checked={saveAsOpen} onChange={(e) => setSaveAsOpen(e.target.checked)} className="size-5 cursor-pointer accent-accent" />
        {ar.pos.saveAsOpen}
      </label>

      {/* Notes */}
      <div className="space-y-1">
        <Label>{ar.pos.notes}</Label>
        <Input value={notesAr} onChange={(e) => setNotesAr(e.target.value)} dir="rtl" className="h-11" />
      </div>

      {/* Summary */}
      {preview && (
        <div className="rounded-md border border-border-subtle bg-surface-row-alt p-3 space-y-1 text-sm tabular-num">
          <Row label={ar.pos.subtotal} value={fmtMoney(preview.subtotal_egp)} />
          {preview.cart_discount_egp > 0 && (
            <Row label={ar.pos.discount} value={`- ${fmtMoney(preview.cart_discount_egp)}`} tone="success" />
          )}
          {preview.tax_enabled && <Row label={ar.pos.tax} value={fmtMoney(preview.tax_egp)} />}
          {preview.rounding_egp !== 0 && <Row label={ar.pos.rounding} value={fmtMoney(preview.rounding_egp)} />}
          <Row label={ar.pos.total} value={fmtMoney(preview.total_egp)} size="lg" />
          <Row label={ar.pos.paid} value={fmtMoney(paymentSum)} />
          {paymentSum > total + 0.01 ? (
            <Row label={ar.pos.change} value={fmtMoney(paymentSum - total)} tone="warning" />
          ) : (
            <Row label={ar.pos.balance} value={fmtMoney(Math.max(0, total - paymentSum))} />
          )}
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

      <Button className="w-full h-12 cursor-pointer" size="lg" disabled={!!validation || submitting} onClick={onSubmit}>
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
  destination,
  onPick,
  onRemove,
  onShowLabel,
}: {
  cart: CartLine[];
  destination: FulfillmentDestination;
  onPick: (r: RollLookup) => void;
  onRemove: (rollId: number) => void;
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
    const visible =
      destination === 'factory_direct'
        ? // Hide shop rolls entirely when picking from the factory.
          rolls.filter((r) => isFactoryRoll(r))
        : rolls;
    const q = search.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((r) =>
      `${r.fabric_name_ar} ${r.color_name_ar} ${r.color_code ?? ''} ${r.roll_sr_no ?? ''} ${r.internal_barcode} ${r.brand_arabic_name ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [rolls, search, destination]);

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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pe-1 -me-1">
          {filtered.map((r) => {
            const inCart = cartIds.has(r.id);
            const fabric = isFabricRoll(r);
            const wrongWarehouse = !rollMatchesDestination(r, destination);
            const factoryInShopMode = destination === 'shop' && isFactoryRoll(r);
            return (
              <div
                key={r.id}
                aria-disabled={wrongWarehouse || undefined}
                className={`group rounded-md border bg-surface-elevated p-3 flex flex-col gap-2 transition-colors duration-150 ${
                  inCart
                    ? 'border-success/40 bg-success-subtle'
                    : wrongWarehouse
                      ? 'border-border-subtle opacity-60'
                      : 'border-border-subtle hover:border-accent hover:bg-surface-hover'
                }`}
              >
                {inCart && (
                  <span className="self-start inline-flex items-center gap-1 rounded-pill bg-success text-white px-2 py-0.5 text-[10px] font-medium">
                    <CheckCircle2 className="size-3" />
                    {ar.pos.inCart}
                  </span>
                )}
                {!inCart && factoryInShopMode && (
                  <span className="self-start inline-flex items-center gap-1 rounded-pill bg-surface-row-alt text-foreground-muted border border-border-default px-2 py-0.5 text-[10px] font-medium">
                    <Factory className="size-3" />
                    {ar.pos.factoryRollBadge}
                  </span>
                )}

                <div className="min-w-0 space-y-1">
                  <div className="font-medium text-sm line-clamp-2 text-foreground">
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
                    {rollQuantity(r).toFixed(3)}{' '}
                    {r.fabric_unit === 'meter' ? ar.pos.quantityM : ar.pos.quantityKg}
                  </span>
                  <span className="font-semibold text-foreground tabular-num" dir="ltr">
                    {r.reference_price_per_unit != null
                      ? fmtMoney(r.reference_price_per_unit)
                      : '—'}
                  </span>
                </div>

                <div className="flex items-center gap-1 mt-auto">
                  <Button
                    size="sm"
                    variant={inCart ? 'outline' : 'default'}
                    disabled={!inCart && wrongWarehouse}
                    onClick={() => inCart ? onRemove(r.id) : onPick(r)}
                    className="h-9 flex-1 cursor-pointer gap-1 disabled:cursor-not-allowed"
                    title={factoryInShopMode ? ar.pos.factoryRollBadge : undefined}
                  >
                    {inCart ? (
                      <>
                        <X className="size-4" />
                        {ar.pos.inCart}
                      </>
                    ) : factoryInShopMode ? (
                      <>
                        <Factory className="size-4" />
                        {ar.pos.factoryRollBadge}
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
 * NO-LINES DEPOSIT DIALOG — v2 Phase 5
 * Creates an open invoice with `lines: []` and a single deposit payment.
 * Cashier later attaches rolls via the standard POS flow.
 * ────────────────────────────────────────────────────────────────────────── */
function NoLinesDepositDialog({
  open,
  onOpenChange,
  customer,
  destination,
  banks,
  defaultBankId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer: Customer | null;
  destination: FulfillmentDestination;
  banks: BankAccount[];
  defaultBankId: number | null;
  onCreated: (invoice: Invoice) => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'instapay' | 'bank_transfer' | 'cheque'>('cash');
  const [bankAccountId, setBankAccountId] = useState<number | ''>(defaultBankId ?? '');
  const [reference, setReference] = useState('');
  const [chequeState, setChequeState] = useState<ChequeFormState>(emptyCheque());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset state on each open.
  useEffect(() => {
    if (open) {
      setAmount('');
      setMethod('cash');
      setBankAccountId(defaultBankId ?? '');
      setReference('');
      setChequeState(emptyCheque());
      setNotes('');
      setError(null);
    }
  }, [open, defaultBankId]);

  const mut = useMutation({
    mutationFn: () => {
      if (!customer) throw new Error('NO_CUSTOMER');
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error('AMOUNT_INVALID');
      const bankId = (method === 'instapay' || method === 'bank_transfer')
        ? (bankAccountId === '' ? null : Number(bankAccountId))
        : null;
      return salesApi.create({
        customerId: customer.id,
        fulfillmentDestination: destination,
        lines: [],
        cartTargetFinal: null,
        payments: [{
          method,
          amount: value,
          bankAccountId: bankId,
          reference: method === 'bank_transfer' ? (reference || null) : null,
          chequeDetails: method === 'cheque' ? chequeStateToDetails(chequeState) : null,
        }],
        notesAr: notes || null,
      });
    },
    onSuccess: onCreated,
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === 'AMOUNT_INVALID') {
        setError(ar.pos.depositRequired);
        return;
      }
      setError(extractApiError(e));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-accent" />
            {ar.pos.saveAsDeposit}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {customer ? (
            <div className="rounded-md border border-border-subtle bg-surface-row-alt p-2 text-sm">
              <span className="text-foreground-muted">{ar.pos.customer}: </span>
              <span className="font-medium text-foreground">{customer.name_ar}</span>
              <span className="text-xs text-foreground-tertiary mx-2 font-mono" dir="ltr">
                {customer.phone}
              </span>
            </div>
          ) : (
            <p className="text-sm text-danger-foreground">{ar.pos.customerRequired}</p>
          )}

          <div className="space-y-1">
            <Label>{ar.pos.depositAmount}</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              dir="ltr"
              inputMode="decimal"
              className="h-11 tabular-num"
              aria-label={ar.pos.depositAmount}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{ar.pos.paymentMethod}</Label>
            <div className="grid grid-cols-4 gap-2">
              {([
                { v: 'cash' as const, label: ar.pos.cash, Icon: Banknote },
                { v: 'instapay' as const, label: ar.pos.instapay, Icon: CreditCard },
                { v: 'bank_transfer' as const, label: ar.pos.bank_transfer, Icon: Landmark },
                { v: 'cheque' as const, label: ar.pos.cheque, Icon: FileText },
              ]).map(({ v: m, label, Icon }) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`cursor-pointer rounded-lg border-2 p-2 flex flex-col items-center justify-center gap-1 transition-colors duration-150 min-h-[64px] ${
                    method === m
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-border-subtle bg-surface-elevated text-foreground hover:bg-surface-hover'
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="text-xs font-medium text-center leading-snug">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {(method === 'instapay' || method === 'bank_transfer') && (
            <div className="space-y-1">
              <Label>{ar.pos.bankAccount}</Label>
              <BankAccountSelect banks={banks} value={bankAccountId} onChange={setBankAccountId} />
            </div>
          )}
          {method === 'bank_transfer' && (
            <div className="space-y-1">
              <Label>{ar.pos.reference}</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" maxLength={64} className="h-11" placeholder="اختياري" />
            </div>
          )}
          {method === 'cheque' && (
            <ChequeDetailsForm state={chequeState} onChange={setChequeState} />
          )}

          <div className="space-y-1">
            <Label>{ar.pos.notes}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              dir="rtl"
              className="h-11"
            />
          </div>

          {error && (
            <p
              className="text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md p-2 flex items-center gap-2"
              role="alert"
            >
              <AlertTriangle className="size-4 shrink-0 text-danger" />
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="outline" className="h-11 cursor-pointer">
                {ar.common.cancel}
              </Button>
            </DialogClose>
            <Button
              className="h-11 cursor-pointer gap-2"
              disabled={!customer || mut.isPending || Number(amount) <= 0}
              onClick={() => mut.mutate()}
            >
              <Receipt className="size-4" />
              {ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * RETURN DRAWER — v2 Phase 6
 * Opens from the right edge (RTL) when a sold roll is scanned.
 * ────────────────────────────────────────────────────────────────────────── */
function ReturnDrawer({
  roll,
  meta,
  metaLoading,
  banks,
  method,
  setMethod,
  bankId,
  setBankId,
  reference,
  setReference,
  chequeState,
  setChequeState,
  confirming,
  onConfirm,
  onClose,
}: {
  roll: RollLookup | null;
  meta: ReturnScanMeta | null;
  metaLoading: boolean;
  banks: BankAccount[];
  method: 'cash' | 'instapay' | 'bank_transfer' | 'cheque';
  setMethod: (m: 'cash' | 'instapay' | 'bank_transfer' | 'cheque') => void;
  bankId: number | '';
  setBankId: (n: number | '') => void;
  reference: string;
  setReference: (s: string) => void;
  chequeState: ChequeFormState;
  setChequeState: (s: ChequeFormState) => void;
  confirming: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!roll} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b border-border-subtle shrink-0">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <RotateCcw className="size-5 text-accent" />
            {ar.pos.returnDrawerTitle}
          </SheetTitle>
        </SheetHeader>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          {metaLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-28 rounded-xl bg-surface-hover" />
              <div className="h-5 rounded bg-surface-hover w-3/4" />
              <div className="h-5 rounded bg-surface-hover w-1/2" />
              <div className="h-5 rounded bg-surface-hover w-2/3" />
              <div className="h-24 rounded-md bg-surface-hover" />
              <div className="h-20 rounded-lg bg-surface-hover" />
            </div>
          ) : meta ? (
            <>
              {/* Refund amount — prominent hero block */}
              <div className="rounded-xl border-2 border-success/40 bg-success-subtle p-6 text-center space-y-1">
                <p className="text-sm text-foreground-muted">{ar.pos.returnDrawerRefundAmount}</p>
                <p
                  className="text-5xl font-bold text-success-foreground tabular-num leading-none"
                  dir="ltr"
                >
                  {fmtMoney(meta.refundEgp)}
                </p>
                <p className="text-base font-medium text-success-foreground">ج.م</p>
              </div>

              {/* Sale meta */}
              <div className="rounded-md border border-border-subtle bg-surface-elevated divide-y divide-border-subtle text-sm">
                <ReturnMetaRow label={ar.pos.returnDrawerOriginalInvoice} value={meta.originalInvoiceNo} mono />
                <ReturnMetaRow
                  label={ar.pos.returnDrawerCustomer}
                  value={`${meta.customerNameAr}`}
                  sub={meta.customerPhone}
                />
                <ReturnMetaRow label={ar.pos.returnDrawerSaleDate} value={fmtReturnDate(meta.saleDate)} />
              </div>

              {/* Roll info */}
              <div className="rounded-md border border-border-subtle bg-surface-elevated p-3 space-y-1 text-sm">
                <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
                  {ar.pos.returnDrawerRollInfo}
                </p>
                <p className="font-medium text-foreground">{meta.fabricNameAr}</p>
                <p className="text-foreground-muted">
                  {meta.colorNameAr}
                  {meta.colorCode ? ` · ${meta.colorCode}` : ''}
                </p>
                <p className="text-xs font-mono text-foreground-tertiary" dir="ltr">
                  {meta.rollInternalBarcode}
                  {meta.rollSrNo ? ` · ${meta.rollSrNo}` : ''}
                </p>
              </div>

              {/* Method picker — 4 tiles */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  {ar.pos.paymentMethod}
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { v: 'cash' as const, label: ar.pos.cash, Icon: Banknote },
                    { v: 'instapay' as const, label: ar.pos.instapay, Icon: CreditCard },
                    { v: 'bank_transfer' as const, label: ar.pos.bank_transfer, Icon: Landmark },
                    { v: 'cheque' as const, label: ar.pos.cheque, Icon: FileText },
                  ]).map(({ v: m, label, Icon }) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`cursor-pointer rounded-lg border-2 p-2.5 flex flex-col items-center justify-center gap-1 transition-colors duration-150 min-h-[68px] ${
                        method === m
                          ? 'border-accent bg-accent-subtle text-accent'
                          : 'border-border-subtle bg-surface-elevated text-foreground hover:bg-surface-hover'
                      }`}
                    >
                      <Icon className="size-4" />
                      <span className="text-xs font-medium text-center leading-snug">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {(method === 'instapay' || method === 'bank_transfer') && (
                <div className="space-y-1">
                  <Label>{ar.pos.bankAccount}</Label>
                  <BankAccountSelect banks={banks} value={bankId} onChange={setBankId} />
                </div>
              )}
              {method === 'bank_transfer' && (
                <div className="space-y-1">
                  <Label>{ar.pos.reference}</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" maxLength={64} className="h-11" placeholder="اختياري" />
                </div>
              )}
              {method === 'cheque' && (
                <ChequeDetailsForm state={chequeState} onChange={setChequeState} />
              )}
            </>
          ) : null}
        </div>

        {/* Sticky footer */}
        <div className="border-t border-border-subtle px-4 py-4 space-y-2 shrink-0 bg-surface">
          <Button
            className="w-full h-12 cursor-pointer gap-2"
            size="lg"
            disabled={!meta || confirming || metaLoading}
            onClick={onConfirm}
          >
            {confirming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            {ar.pos.returnDrawerConfirm}
          </Button>
          <Button
            variant="ghost"
            className="w-full h-11 cursor-pointer"
            onClick={onClose}
            disabled={confirming}
          >
            {ar.common.cancel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReturnMetaRow({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <span className="text-foreground-muted text-sm shrink-0">{label}</span>
      <div className="text-end">
        <span className={`text-sm font-medium text-foreground ${mono ? 'font-mono' : ''}`}>
          {value}
        </span>
        {sub && (
          <p className="text-xs text-foreground-tertiary font-mono" dir="ltr">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function fmtReturnDate(s: string): string {
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(s));
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
      setError(extractApiError(e));
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
 * DESTINATION TOGGLE — Phase 4
 * ────────────────────────────────────────────────────────────────────────── */
function DestinationToggle({
  value,
  onChange,
}: {
  value: FulfillmentDestination;
  onChange: (d: FulfillmentDestination) => void;
}) {
  const options: Array<{ key: FulfillmentDestination; label: string; Icon: typeof Store }> = [
    { key: 'shop', label: ar.pos.fulfillmentShop, Icon: Store },
    { key: 'factory_direct', label: ar.pos.fulfillmentFactoryDirect, Icon: Factory },
  ];
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-foreground-muted">{ar.pos.fulfillment}</div>
      <div
        role="radiogroup"
        aria-label={ar.pos.fulfillment}
        className="grid grid-cols-2 gap-1 rounded-md border border-border-subtle bg-surface-row-alt p-1"
      >
        {options.map(({ key, label, Icon }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={`cursor-pointer rounded-sm px-3 py-2 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                active
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-transparent text-foreground hover:bg-surface-hover'
              }`}
            >
              <Icon className="size-4" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
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
  tone?: 'success' | 'warning';
}) {
  const bold = size === 'lg';
  const toneCls =
    tone === 'success' ? 'text-success-foreground' :
    tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : '';
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
