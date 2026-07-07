import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Plus, Search, ChevronRight, Pencil, Trash2, Ban, X, FileText } from 'lucide-react';
import { ar } from '@/i18n/ar';
import {
  suppliersApi,
  type SupplierWithBalance,
  type SupplierInvoice,
  type SupplierInvoiceWithLines,
  type SupplierPayment,
  type Currency,
  type Unit,
} from '@/lib/suppliers-api';
import { bankAccountsApi } from '@/lib/settings-api';
import { currencySymbol, fmtCurrency, fmtMoney } from '@/components/dashboard/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ResponsiveDialog';
import { ErrorBanner } from '@/components/ErrorBanner';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { format } from 'date-fns';

const inputCls =
  'h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const EGYPTIAN_PHONE_REGEX = /^01[0125][0-9]{8}$/;
function validateEgyptianPhone(phone: string): boolean {
  if (!phone) return true;
  return EGYPTIAN_PHONE_REGEX.test(phone);
}

// ─── Add / Edit Supplier Dialog ───────────────────────────────────────────────

function SupplierFormDialog({
  supplier,
  hasTransactions,
  onClose,
  onDone,
}: {
  supplier: SupplierWithBalance | null; // null = create mode
  hasTransactions: boolean;
  onClose: () => void;
  onDone: (id: number) => void;
}) {
  const isEdit = supplier !== null;
  const [arabicName, setArabicName] = useState(supplier?.arabic_name ?? '');
  const [englishName, setEnglishName] = useState(supplier?.english_name ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [currency, setCurrency] = useState<Currency>(supplier?.currency ?? 'EGP');
  const [openingBalance, setOpeningBalance] = useState(
    supplier && Number(supplier.opening_balance) !== 0 ? String(supplier.opening_balance) : '',
  );
  const [openingDate, setOpeningDate] = useState(supplier?.opening_balance_date ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => {
      const body = {
        arabic_name: arabicName.trim(),
        english_name: englishName.trim() || null,
        phone: phone.trim() || null,
        opening_balance: openingBalance === '' ? 0 : Number(openingBalance),
        opening_balance_date: openingDate || null,
      };
      if (isEdit) {
        return suppliersApi.updateSupplier(supplier!.id, {
          ...body,
          // Only send currency when it can still change (no transactions yet).
          ...(hasTransactions ? {} : { currency }),
        });
      }
      return suppliersApi.createSupplier({ ...body, currency });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      if (isEdit) qc.invalidateQueries({ queryKey: ['supplier-ledger', supplier!.id] });
      onDone(data.id);
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const submit = () => {
    if (!validateEgyptianPhone(phone.trim())) {
      setPhoneError('رقم الهاتف يجب أن يكون بصيغة مصرية: 01[0-1-2-5]XXXXXXXX');
      return;
    }
    mut.mutate();
  };

  const currencyLocked = isEdit && hasTransactions;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? ar.supplierPayables.editSupplierTitle : ar.supplierPayables.addSupplier}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <ErrorBanner title={ar.common.error} description={error} />}

          <div className="space-y-1">
            <Label className="text-sm font-medium text-foreground">
              {ar.supplierPayables.supplierName}
              <span className="text-danger ms-1" aria-hidden>*</span>
            </Label>
            <Input value={arabicName} onChange={(e) => setArabicName(e.target.value)} dir="rtl" />
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium text-foreground">الاسم بالإنجليزي</Label>
            <Input value={englishName} onChange={(e) => setEnglishName(e.target.value)} dir="ltr" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.phone}</Label>
            <Input
              value={phone}
              placeholder="01012345678"
              dir="ltr"
              inputMode="tel"
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError(
                  e.target.value && !validateEgyptianPhone(e.target.value)
                    ? 'رقم الهاتف يجب أن يكون بصيغة مصرية: 01[0-1-2-5]XXXXXXXX'
                    : null,
                );
              }}
            />
            {phoneError && <p className="text-xs text-danger">{phoneError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.currency}</Label>
            <select
              className={cn(inputCls, currencyLocked && 'opacity-60 cursor-not-allowed')}
              value={currency}
              disabled={currencyLocked}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="EGP">{ar.supplierPayables.currencyEgp}</option>
              <option value="RMB">{ar.supplierPayables.currencyRmb}</option>
            </select>
            {currencyLocked && (
              <p className="text-xs text-foreground-muted">{ar.supplierPayables.currencyLocked}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">
                {ar.supplierPayables.openingBalance} ({currencySymbol(currency)})
              </Label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                style={{ unicodeBidi: 'plaintext' }}
                placeholder="0"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.openingBalanceDate}</Label>
              <input
                type="date"
                className={inputCls}
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-foreground-muted">{ar.supplierPayables.openingBalanceHint}</p>

          <div className="flex gap-2 justify-end pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button onClick={submit} disabled={mut.isPending || !arabicName.trim() || !!phoneError}>
              {mut.isPending ? ar.loading : ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Purchase-invoice form (create + edit) ────────────────────────────────────

const UNIT_KEYS: Unit[] = ['kg', 'meter', 'roll', 'piece'];

type LineDraft = { description: string; quantity: string; unit: Unit; unit_price: string };

const emptyLine = (): LineDraft => ({ description: '', quantity: '1', unit: 'piece', unit_price: '' });

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function PurchaseInvoiceFormDialog({
  supplierId,
  currency,
  invoice,
  onClose,
  onDone,
}: {
  supplierId: number;
  currency: Currency;
  invoice: SupplierInvoiceWithLines | null; // null = create
  onClose: () => void;
  onDone: () => void;
}) {
  const isEdit = invoice !== null;
  const today = format(new Date(), 'yyyy-MM-dd');
  const [invoiceNo, setInvoiceNo] = useState(invoice?.invoice_no ?? '');
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoice_date ?? today);
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? '');
  const [extraCharges, setExtraCharges] = useState(
    invoice && Number(invoice.extra_charges) !== 0 ? String(Number(invoice.extra_charges)) : '',
  );
  const [notes, setNotes] = useState(invoice?.notes_ar ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    invoice && invoice.lines.length > 0
      ? invoice.lines.map((l) => ({
          description: l.description,
          quantity: String(Number(l.quantity)),
          unit: l.unit,
          unit_price: String(Number(l.unit_price)),
        }))
      : [emptyLine()],
  );
  const [error, setError] = useState<string | null>(null);

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => {
      const body = {
        invoice_no: invoiceNo.trim() || null,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        extra_charges: extraCharges === '' ? 0 : Number(extraCharges),
        lines: lines.map((l) => ({
          description: l.description.trim(),
          quantity: Number(l.quantity),
          unit: l.unit,
          unit_price: Number(l.unit_price),
        })),
        notes_ar: notes.trim() || null,
      };
      if (isEdit) return suppliersApi.updateInvoice(invoice!.id, body);
      return suppliersApi.createInvoice({ supplier_id: supplierId, ...body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-ledger', supplierId] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      if (isEdit) qc.invalidateQueries({ queryKey: ['supplier-invoice', invoice!.id] });
      onDone();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const updateLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const lineTotal = (l: LineDraft) => round2((Number(l.quantity) || 0) * (Number(l.unit_price) || 0));
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const extra = extraCharges === '' ? 0 : Number(extraCharges) || 0;
  const total = round2(subtotal + extra);

  const linesValid =
    lines.length > 0 &&
    lines.every(
      (l) =>
        l.description.trim() !== '' &&
        Number(l.quantity) > 0 &&
        l.unit_price !== '' &&
        Number(l.unit_price) >= 0,
    );
  const canSubmit = linesValid && !!invoiceDate && extra >= 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? ar.supplierPayables.editInvoice : ar.supplierPayables.newInvoice}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pe-1">
          {error && <ErrorBanner title={ar.common.error} description={error} />}

          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.invoiceDate}</Label>
              <input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.dueDate}</Label>
              <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.supplierInvoiceNo}</Label>
              <input
                className={inputCls}
                dir="ltr"
                placeholder="INV-001"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
              />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-foreground">{ar.supplierPayables.lines}</Label>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={addLine}>
                <Plus className="size-4" aria-hidden />
                {ar.supplierPayables.addLine}
              </Button>
            </div>

            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border border-border-subtle bg-surface p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-foreground-muted">{ar.supplierPayables.lineDescription}</Label>
                    <Input dir="rtl" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                  </div>
                  <button
                    type="button"
                    title={ar.supplierPayables.removeLine}
                    aria-label={ar.supplierPayables.removeLine}
                    onClick={() => removeLine(i)}
                    disabled={lines.length === 1}
                    className="mt-6 size-8 shrink-0 flex items-center justify-center rounded-md text-danger-foreground hover:bg-danger/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground-muted">{ar.supplierPayables.quantity}</Label>
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      className={inputCls}
                      style={{ unicodeBidi: 'plaintext' }}
                      value={l.quantity}
                      onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground-muted">{ar.supplierPayables.unit}</Label>
                    <select
                      className={inputCls}
                      value={l.unit}
                      onChange={(e) => updateLine(i, { unit: e.target.value as Unit })}
                    >
                      {UNIT_KEYS.map((u) => (
                        <option key={u} value={u}>{ar.supplierPayables.units[u]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground-muted">
                      {ar.supplierPayables.unitPrice} ({currencySymbol(currency)})
                    </Label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputCls}
                      style={{ unicodeBidi: 'plaintext' }}
                      placeholder="0"
                      value={l.unit_price}
                      onChange={(e) => updateLine(i, { unit_price: e.target.value })}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground-muted">{ar.supplierPayables.lineTotal}</Label>
                    <div
                      className="h-10 flex items-center px-3 rounded-md border border-border-subtle bg-surface-row-alt text-sm font-semibold tabular-num text-foreground"
                      dir="ltr"
                    >
                      {fmtCurrency(lineTotal(l), currency)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Extra charges + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">
                {ar.supplierPayables.extraCharges} ({currencySymbol(currency)})
              </Label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                style={{ unicodeBidi: 'plaintext' }}
                placeholder="0"
                value={extraCharges}
                onChange={(e) => setExtraCharges(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.notes}</Label>
              <Input dir="rtl" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Totals footer */}
          <div className="rounded-lg border border-border-subtle bg-surface-row-alt p-3 space-y-1.5">
            <div className="flex justify-between text-sm text-foreground-muted">
              <span>{ar.supplierPayables.subtotal}</span>
              <span className="tabular-num" dir="ltr">{fmtCurrency(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-sm text-foreground-muted">
              <span>{ar.supplierPayables.extraCharges}</span>
              <span className="tabular-num" dir="ltr">{fmtCurrency(extra, currency)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-foreground pt-1.5 border-t border-border-subtle">
              <span>{ar.supplierPayables.total}</span>
              <span className="tabular-num" dir="ltr">{fmtCurrency(total, currency)}</span>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit}>
              {mut.isPending ? ar.loading : ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice detail dialog ────────────────────────────────────────────────────

function InvoiceDetailDialog({
  invoiceId,
  currency,
  onClose,
  onEdit,
  onDelete,
}: {
  invoiceId: number;
  currency: Currency;
  onClose: () => void;
  onEdit: (inv: SupplierInvoiceWithLines) => void;
  onDelete: (inv: SupplierInvoiceWithLines) => void;
}) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['supplier-invoice', invoiceId],
    queryFn: () => suppliersApi.getInvoice(invoiceId),
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ar.supplierPayables.invoiceDetails}</DialogTitle>
        </DialogHeader>
        {isLoading || !invoice ? (
          <p className="p-6 text-center text-sm text-foreground-muted">{ar.loading}</p>
        ) : (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pe-1">
            {/* Header meta */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-foreground-muted">{ar.supplierPayables.internalNo}</span>
                <span className="font-mono font-semibold text-foreground" dir="ltr">{invoice.internal_no ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-foreground-muted">{ar.supplierPayables.supplierInvoiceNo}</span>
                <span className="font-mono text-foreground" dir="ltr">{invoice.invoice_no ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-foreground-muted">{ar.supplierPayables.invoiceDate}</span>
                <span className="tabular-num text-foreground" dir="ltr">{invoice.invoice_date}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-foreground-muted">{ar.supplierPayables.dueDate}</span>
                <span className="tabular-num text-foreground" dir="ltr">{invoice.due_date ?? '—'}</span>
              </div>
            </div>

            {invoice.notes_ar && (
              <p className="text-sm text-foreground-muted border-e-2 border-border-subtle pe-2">{invoice.notes_ar}</p>
            )}

            {/* Lines */}
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              <table className="w-full text-sm" dir="rtl">
                <thead className="bg-surface-row-alt text-foreground-muted border-b border-border-subtle">
                  <tr>
                    <th className="py-2 px-3 text-start font-medium">{ar.supplierPayables.lineDescription}</th>
                    <th className="py-2 px-3 text-end font-medium">{ar.supplierPayables.quantity}</th>
                    <th className="py-2 px-3 text-center font-medium">{ar.supplierPayables.unit}</th>
                    <th className="py-2 px-3 text-end font-medium">{ar.supplierPayables.unitPrice}</th>
                    <th className="py-2 px-3 text-end font-medium">{ar.supplierPayables.lineTotal}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle bg-surface-elevated">
                  {invoice.lines.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-foreground-muted">{ar.supplierPayables.noLines}</td></tr>
                  ) : (
                    invoice.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 px-3 text-foreground">{l.description}</td>
                        <td className="py-2 px-3 text-end tabular-num text-foreground-muted" dir="ltr">{fmtMoney(Number(l.quantity))}</td>
                        <td className="py-2 px-3 text-center text-foreground-muted">{ar.supplierPayables.units[l.unit]}</td>
                        <td className="py-2 px-3 text-end tabular-num text-foreground-muted" dir="ltr">{fmtCurrency(l.unit_price, currency)}</td>
                        <td className="py-2 px-3 text-end tabular-num font-semibold text-foreground" dir="ltr">{fmtCurrency(l.line_total, currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="rounded-lg border border-border-subtle bg-surface-row-alt p-3 space-y-1.5">
              <div className="flex justify-between text-sm text-foreground-muted">
                <span>{ar.supplierPayables.subtotal}</span>
                <span className="tabular-num" dir="ltr">{fmtCurrency(invoice.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm text-foreground-muted">
                <span>{ar.supplierPayables.extraCharges}</span>
                <span className="tabular-num" dir="ltr">{fmtCurrency(invoice.extra_charges, currency)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-foreground pt-1.5 border-t border-border-subtle">
                <span>{ar.supplierPayables.total}</span>
                <span className="tabular-num" dir="ltr">{fmtCurrency(invoice.total, currency)}</span>
              </div>
            </div>

            <div className="flex gap-2 justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                className="text-danger-foreground hover:text-danger-foreground"
                onClick={() => onDelete(invoice)}
              >
                <Trash2 className="size-4" aria-hidden />
                {ar.supplierPayables.deleteInvoice}
              </Button>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">{ar.common.close}</Button>
                </DialogClose>
                <Button onClick={() => onEdit(invoice)}>
                  <Pencil className="size-4" aria-hidden />
                  {ar.supplierPayables.editInvoice}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Record / Edit Payment Dialog ─────────────────────────────────────────────

function PaymentDialog({
  supplierId,
  currency,
  payment,
  onClose,
  onDone,
}: {
  supplierId: number;
  currency: Currency;
  payment: SupplierPayment | null; // null = create
  onClose: () => void;
  onDone: () => void;
}) {
  const isEdit = payment !== null;
  const [amount, setAmount] = useState(payment ? String(payment.amount_egp) : '');
  const [method, setMethod] = useState<'cash' | 'instapay' | 'bank_transfer'>(payment?.method ?? 'cash');
  const [bankAccountId, setBankAccountId] = useState(payment?.bank_account_id ? String(payment.bank_account_id) : '');
  const [notes, setNotes] = useState(payment?.notes_ar ?? '');
  const [error, setError] = useState<string | null>(null);

  const { data: banks = [] } = useQuery({ queryKey: ['bank-accounts'], queryFn: bankAccountsApi.list });

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => {
      const body = {
        amount_egp: Number(amount),
        method,
        bank_account_id: method !== 'cash' ? Number(bankAccountId) : null,
        notes_ar: notes.trim() || null,
      };
      if (isEdit) return suppliersApi.updatePayment(payment!.id, body);
      return suppliersApi.recordPayment({ supplier_id: supplierId, ...body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-ledger', supplierId] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      onDone();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const needsBank = method !== 'cash';
  const canSubmit = Number(amount) > 0 && (!needsBank || !!bankAccountId);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? ar.supplierPayables.editPaymentTitle : ar.supplierPayables.recordPayment}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <ErrorBanner title={ar.common.error} description={error} />}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">المبلغ ({currencySymbol(currency)})</Label>
            <input
              type="number"
              min={1}
              step="0.01"
              className={cn(inputCls, 'w-44')}
              style={{ unicodeBidi: 'plaintext' }}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.paymentMethod}</Label>
            <div className="flex gap-2">
              {(['cash', 'instapay', 'bank_transfer'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMethod(m); setBankAccountId(''); }}
                  className={cn(
                    'h-8 px-3 rounded-md border text-xs transition-colors cursor-pointer',
                    method === m
                      ? 'bg-accent text-foreground-on-accent border-accent font-medium'
                      : 'bg-surface text-foreground-muted border-border-subtle hover:bg-surface-hover hover:text-foreground',
                  )}
                >
                  {ar.supplierPayables.method[m]}
                </button>
              ))}
            </div>
          </div>
          {needsBank && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.bankAccount}</Label>
              <select className={inputCls} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">— اختر حساباً —</option>
                {banks.filter((b) => b.is_active).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_ar} {b.bank_name_ar ? `/ ${b.bank_name_ar}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.notes}</Label>
            <Input dir="rtl" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit}>
              {mut.isPending ? ar.loading : ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-foreground-muted">{message}</p>
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button
              onClick={onConfirm}
              disabled={pending}
              className="bg-danger text-white hover:opacity-90"
            >
              {pending ? ar.loading : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SuppliersPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<{ open: boolean; invoice: SupplierInvoiceWithLines | null }>({
    open: false,
    invoice: null,
  });
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<SupplierInvoiceWithLines | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<SupplierPayment | null>(null);
  const [supplierForm, setSupplierForm] = useState<{ open: boolean; supplier: SupplierWithBalance | null }>({
    open: false,
    supplier: null,
  });
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [search, setSearch] = useState('');

  const qc = useQueryClient();

  const listQ = useQuery<SupplierWithBalance[]>({
    queryKey: ['suppliers-list'],
    queryFn: suppliersApi.list,
  });

  const ledgerQ = useQuery({
    queryKey: ['supplier-ledger', selectedId],
    queryFn: () => suppliersApi.getLedger(selectedId!),
    enabled: selectedId !== null,
  });

  const deletePaymentMut = useMutation({
    mutationFn: (id: number) => suppliersApi.deletePayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-ledger', selectedId] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      setDeletingPayment(null);
    },
  });

  const deleteInvoiceMut = useMutation({
    mutationFn: (id: number) => suppliersApi.deleteInvoice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-ledger', selectedId] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      setDeletingInvoice(null);
      setViewingInvoiceId(null);
    },
  });

  const deactivateMut = useMutation({
    mutationFn: (id: number) => suppliersApi.deactivateSupplier(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      setConfirmDeactivate(false);
      setSelectedId(null);
    },
  });

  const suppliers = listQ.data ?? [];
  const q = search.trim();
  const filtered = q ? suppliers.filter((s) => s.arabic_name.includes(q)) : suppliers;
  const selected = suppliers.find((s) => s.id === selectedId) ?? null;
  const currency: Currency = selected?.currency ?? 'EGP';

  const invoices = ledgerQ.data?.invoices ?? [];
  const payments = ledgerQ.data?.payments ?? [];
  const hasTransactions = invoices.length > 0 || payments.length > 0;
  const balance = ledgerQ.data?.balance;
  const openingBalance = balance?.opening_balance ?? selected?.opening_balance ?? 0;

  type LedgerRow =
    | { date: string; kind: 'debt'; row: SupplierInvoice }
    | { date: string; kind: 'payment'; row: SupplierPayment };
  const entries: LedgerRow[] = [
    ...invoices.map((r): LedgerRow => ({ date: r.invoice_date, kind: 'debt', row: r })),
    ...payments.map((r): LedgerRow => ({ date: r.paid_at, kind: 'payment', row: r })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const totalBalance = balance?.balance_egp ?? selected?.balance_egp ?? 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent/10">
            <Truck className="size-6 text-accent" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold text-foreground">{ar.supplierPayables.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/treasury">
              <ChevronRight className="size-4" aria-hidden />
              {ar.hubs.treasuryTitle}
            </Link>
          </Button>
          <Button onClick={() => setSupplierForm({ open: true, supplier: null })}>
            <Plus className="size-4" aria-hidden />
            {ar.supplierPayables.addSupplier}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-4 md:flex-row">
        {/* RIGHT: supplier list sidebar */}
        <div className="md:w-80 w-full shrink-0 self-start rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="size-5 text-foreground-muted" aria-hidden />
              <span className="text-base font-semibold text-foreground">
                الموردون ({suppliers.length})
              </span>
            </div>
            <div className="relative">
              <Search className="absolute top-1/2 -translate-y-1/2 end-3 size-4 text-foreground-muted pointer-events-none" aria-hidden />
              <Input
                dir="rtl"
                placeholder="بحث بالاسم..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pe-9"
              />
            </div>
          </div>
          <div className="overflow-y-auto md:max-h-[calc(100vh-260px)]">
            {listQ.isLoading ? (
              <p className="p-4 text-center text-sm text-foreground-muted">{ar.loading}</p>
            ) : suppliers.length === 0 ? (
              <p className="p-4 text-center text-sm text-foreground-muted">لا يوجد موردين</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-foreground-muted">لا يوجد نتائج</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    'w-full px-4 py-3 border-b border-border-subtle last:border-0 cursor-pointer',
                    'hover:bg-surface-hover transition-colors text-start',
                    selectedId === s.id && 'bg-surface-row-alt',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        'shrink-0 text-sm font-bold tabular-num text-start',
                        s.balance_egp > 0 ? 'text-danger-foreground' : 'text-foreground-muted',
                      )}
                      dir="ltr"
                    >
                      {fmtCurrency(s.balance_egp, s.currency)}
                    </p>
                    <div className="min-w-0 text-end">
                      <p className="text-base font-bold text-foreground truncate">{s.arabic_name}</p>
                      <p
                        className={cn(
                          'text-xs mt-0.5',
                          s.balance_egp > 0 ? 'text-danger-foreground' : 'text-foreground-muted',
                        )}
                      >
                        {s.balance_egp > 0 ? 'مستحق' : 'متعادل'}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* LEFT: detail panel */}
        <div className="flex-1 min-w-0 space-y-4">
          {!selected ? (
            <div className="rounded-xl border border-border-subtle bg-surface-elevated p-12 flex flex-col items-center justify-center gap-4 text-center min-h-[20rem]">
              <div className="flex size-16 items-center justify-center rounded-full bg-surface-row-alt">
                <Truck className="size-7 text-foreground-muted" aria-hidden />
              </div>
              <p className="text-sm text-foreground-muted">اختر مورداً لعرض التفاصيل</p>
            </div>
          ) : (
            <>
              {/* Supplier header */}
              <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4 space-y-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs text-foreground-muted">{ar.supplierPayables.balance}</p>
                    <p
                      className={cn(
                        'text-2xl font-bold tabular-num',
                        totalBalance > 0 ? 'text-danger-foreground' : 'text-success-foreground',
                      )}
                      dir="ltr"
                    >
                      {fmtCurrency(totalBalance, currency)}
                    </p>
                    {Number(openingBalance) !== 0 && (
                      <p className="text-xs text-foreground-muted" dir="ltr">
                        {ar.supplierPayables.broughtForward}: {fmtCurrency(openingBalance, currency)}
                      </p>
                    )}
                  </div>
                  <div className="text-end space-y-1">
                    <p className="text-lg font-semibold text-foreground">{selected.arabic_name}</p>
                    <div className="flex items-center gap-1 justify-end">
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <Link to={`/treasury/suppliers/${selected.id}/statement`}>
                          <FileText className="size-3.5" aria-hidden />
                          {ar.supplierPayables.statement.open}
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSupplierForm({ open: true, supplier: selected })}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        {ar.supplierPayables.editSupplier}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-danger-foreground hover:text-danger-foreground"
                        onClick={() => setConfirmDeactivate(true)}
                      >
                        <Ban className="size-3.5" aria-hidden />
                        {ar.supplierPayables.deactivateSupplier}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setShowPayment(true)} className="w-full">
                    {ar.supplierPayables.recordPayment}
                  </Button>
                  <Button onClick={() => setInvoiceForm({ open: true, invoice: null })} className="w-full">
                    <FileText className="size-4" aria-hidden />
                    {ar.supplierPayables.newInvoice}
                  </Button>
                </div>
              </div>

              {/* Transaction history */}
              <div className="rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden">
                <div className="px-4 py-3 border-b border-border-subtle">
                  <span className="text-sm font-semibold text-foreground">
                    سجل الحركات ({entries.length})
                  </span>
                </div>
                {ledgerQ.isLoading ? (
                  <p className="p-4 text-center text-sm text-foreground-muted">{ar.loading}</p>
                ) : entries.length === 0 ? (
                  <p className="p-6 text-center text-sm text-foreground-muted">لا يوجد حركات مسجلة</p>
                ) : (
                  <table className="w-full text-sm" dir="rtl">
                    <thead className="bg-surface-row-alt text-foreground-muted border-b border-border-subtle">
                      <tr>
                        <th className="py-2.5 px-4 text-start font-medium">التاريخ</th>
                        <th className="py-2.5 px-4 text-start font-medium">النوع</th>
                        <th className="py-2.5 px-4 text-start font-medium">ملاحظات</th>
                        <th className="py-2.5 px-4 text-end font-medium">المبلغ ({currencySymbol(currency)})</th>
                        <th className="py-2.5 px-4 text-end font-medium">{ar.supplierPayables.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle bg-surface-elevated">
                      {entries.map((entry) => {
                        const isDebt = entry.kind === 'debt';
                        return (
                          <tr
                            key={`${entry.kind}-${entry.row.id}`}
                            onClick={isDebt ? () => setViewingInvoiceId(entry.row.id) : undefined}
                            className={cn(
                              'hover:bg-surface-hover/50 transition-colors',
                              isDebt && 'cursor-pointer',
                            )}
                          >
                            <td className="py-2.5 px-4 text-foreground-muted tabular-num text-xs">
                              {isDebt
                                ? entry.row.invoice_date
                                : format(new Date(entry.row.paid_at), 'yyyy-MM-dd')}
                            </td>
                            <td className="py-2.5 px-4">
                              <span
                                className={cn(
                                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                                  isDebt ? 'bg-danger/10 text-danger-foreground' : 'bg-success/10 text-success-foreground',
                                )}
                              >
                                {isDebt ? 'دين' : 'دفعة'}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-foreground-muted text-xs max-w-48 truncate">
                              {entry.kind === 'debt'
                                ? [entry.row.internal_no, entry.row.invoice_no, entry.row.notes_ar]
                                    .filter(Boolean).join(' · ') || '—'
                                : [
                                    ar.supplierPayables.method[entry.row.method],
                                    entry.row.bank_name_ar,
                                    entry.row.notes_ar,
                                  ].filter(Boolean).join(' · ')}
                            </td>
                            <td
                              className={cn(
                                'py-2.5 px-4 text-end tabular-num font-semibold',
                                isDebt ? 'text-danger-foreground' : 'text-success-foreground',
                              )}
                              dir="ltr"
                            >
                              {isDebt ? '+' : '−'} {fmtMoney(Number(entry.row.amount_egp))}
                            </td>
                            <td className="py-2.5 px-4 text-end">
                              {entry.kind === 'debt' ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <button
                                    type="button"
                                    title={ar.supplierPayables.invoiceDetails}
                                    aria-label={ar.supplierPayables.invoiceDetails}
                                    onClick={(e) => { e.stopPropagation(); setViewingInvoiceId(entry.row.id); }}
                                    className="size-7 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-hover cursor-pointer"
                                  >
                                    <FileText className="size-3.5" aria-hidden />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 justify-end">
                                  <button
                                    type="button"
                                    title={ar.supplierPayables.editPayment}
                                    onClick={(e) => { e.stopPropagation(); setEditingPayment(entry.row); }}
                                    className="size-7 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-hover cursor-pointer"
                                  >
                                    <Pencil className="size-3.5" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    title={ar.supplierPayables.deletePayment}
                                    onClick={(e) => { e.stopPropagation(); setDeletingPayment(entry.row); }}
                                    className="size-7 flex items-center justify-center rounded-md text-danger-foreground hover:bg-danger/10 cursor-pointer"
                                  >
                                    <Trash2 className="size-3.5" aria-hidden />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {supplierForm.open && (
        <SupplierFormDialog
          supplier={supplierForm.supplier}
          hasTransactions={supplierForm.supplier !== null && hasTransactions}
          onClose={() => setSupplierForm({ open: false, supplier: null })}
          onDone={(id) => {
            setSupplierForm({ open: false, supplier: null });
            setSelectedId(id);
          }}
        />
      )}

      {invoiceForm.open && selectedId !== null && (
        <PurchaseInvoiceFormDialog
          supplierId={selectedId}
          currency={currency}
          invoice={invoiceForm.invoice}
          onClose={() => setInvoiceForm({ open: false, invoice: null })}
          onDone={() => setInvoiceForm({ open: false, invoice: null })}
        />
      )}

      {viewingInvoiceId !== null && (
        <InvoiceDetailDialog
          invoiceId={viewingInvoiceId}
          currency={currency}
          onClose={() => setViewingInvoiceId(null)}
          onEdit={(inv) => {
            setViewingInvoiceId(null);
            setInvoiceForm({ open: true, invoice: inv });
          }}
          onDelete={(inv) => setDeletingInvoice(inv)}
        />
      )}

      {deletingInvoice && (
        <ConfirmDialog
          title={ar.supplierPayables.deleteInvoice}
          message={ar.supplierPayables.deleteInvoiceConfirm}
          confirmLabel={ar.supplierPayables.deleteInvoice}
          pending={deleteInvoiceMut.isPending}
          onConfirm={() => deleteInvoiceMut.mutate(deletingInvoice.id)}
          onClose={() => setDeletingInvoice(null)}
        />
      )}

      {showPayment && selectedId !== null && (
        <PaymentDialog
          supplierId={selectedId}
          currency={currency}
          payment={null}
          onClose={() => setShowPayment(false)}
          onDone={() => setShowPayment(false)}
        />
      )}

      {editingPayment && selectedId !== null && (
        <PaymentDialog
          supplierId={selectedId}
          currency={currency}
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onDone={() => setEditingPayment(null)}
        />
      )}

      {deletingPayment && (
        <ConfirmDialog
          title={ar.supplierPayables.deletePayment}
          message={ar.supplierPayables.deletePaymentConfirm}
          confirmLabel={ar.supplierPayables.deletePayment}
          pending={deletePaymentMut.isPending}
          onConfirm={() => deletePaymentMut.mutate(deletingPayment.id)}
          onClose={() => setDeletingPayment(null)}
        />
      )}

      {confirmDeactivate && selected && (
        <ConfirmDialog
          title={ar.supplierPayables.deactivateSupplier}
          message={ar.supplierPayables.deactivateConfirm}
          confirmLabel={ar.supplierPayables.deactivateSupplier}
          pending={deactivateMut.isPending}
          onConfirm={() => deactivateMut.mutate(selected.id)}
          onClose={() => setConfirmDeactivate(false)}
        />
      )}
    </div>
  );
}
