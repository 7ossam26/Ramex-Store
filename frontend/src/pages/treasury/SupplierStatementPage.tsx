import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, FileText, FileSpreadsheet, ArrowRight } from 'lucide-react';
import { ar } from '@/i18n/ar';
import {
  suppliersApi,
  supplierStatementExportUrl,
  type SupplierStatement,
  type SupplierLedgerRow,
  type StatementExportFormat,
  type Currency,
} from '@/lib/suppliers-api';
import { currencySymbol, fmtMoney } from '@/components/dashboard/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';

const st = ar.supplierPayables.statement;

/** First day of the current Cairo-local month, `YYYY-MM-DD`. */
function firstOfCairoMonth(): string {
  const today = cairoToday();
  return `${today.slice(0, 7)}-01`;
}
function cairoToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

/* Forces LTR reading direction for digits/currency inside RTL cells. */
function Num({ children }: { children: React.ReactNode }) {
  return (
    <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  );
}

/** Money formatted as a bare number; blank for zero/null. */
function money(n: number | null): string {
  if (n === null || n === 0) return '';
  return fmtMoney(n);
}

const UNIT_AR: Record<string, string> = { kg: 'كجم', meter: 'متر', roll: 'توب', piece: 'قطعة' };

function qty(n: number | null): string {
  if (n === null) return '';
  return fmtMoney(n);
}

function triggerDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function SupplierStatementPage() {
  const { id } = useParams<{ id: string }>();
  const idNum = Number(id);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [from, setFrom] = useState(params.get('from') || firstOfCairoMonth());
  const [to, setTo] = useState(params.get('to') || cairoToday());

  // Keep the URL in sync so a reload / share preserves the view.
  const syncUrl = (next: { from?: string; to?: string }) => {
    const p = new URLSearchParams(params);
    p.set('from', next.from ?? from);
    p.set('to', next.to ?? to);
    setParams(p, { replace: true });
  };

  const stmtQ = useQuery<SupplierStatement>({
    queryKey: ['supplier-statement', idNum, from, to],
    queryFn: () => suppliersApi.getStatement(idNum, from, to),
    enabled: Number.isFinite(idNum) && idNum > 0 && !!from && !!to,
  });

  const data = stmtQ.data;

  const exportUrl = (format: StatementExportFormat) =>
    supplierStatementExportUrl(idNum, { from, to, format });

  return (
    <div className="min-h-screen bg-surface print:bg-white">
      {/* ── Toolbar — hidden in print ── */}
      <div
        data-print="hide"
        className="sticky top-0 z-10 border-b border-border-subtle bg-surface-elevated/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-3 px-4 py-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="stmt-from" className="text-xs text-foreground-muted">{st.from}</label>
            <input
              id="stmt-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => { setFrom(e.target.value); syncUrl({ from: e.target.value }); }}
              className="h-9 rounded-md border border-border-default bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="stmt-to" className="text-xs text-foreground-muted">{st.to}</label>
            <input
              id="stmt-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => { setTo(e.target.value); syncUrl({ to: e.target.value }); }}
              className="h-9 rounded-md border border-border-default bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>

          <div className="ms-auto flex items-end gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!data}>
              <Printer className="size-4" aria-hidden />
              {st.print}
            </Button>
            <Button size="sm" variant="outline" onClick={() => triggerDownload(exportUrl('pdf'))} disabled={!data}>
              <FileText className="size-4" aria-hidden />
              {st.pdf}
            </Button>
            <Button size="sm" variant="outline" onClick={() => triggerDownload(exportUrl('excel'))} disabled={!data}>
              <FileSpreadsheet className="size-4" aria-hidden />
              {st.excel}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (window.history.length <= 1 ? navigate('/treasury/suppliers') : navigate(-1))}>
              <ArrowRight className="size-4" aria-hidden />
              {st.back}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Document ── */}
      <div className="mx-auto max-w-6xl px-4 py-6 print:p-0">
        {stmtQ.isLoading ? (
          <div className="rounded-lg bg-white p-8 shadow-sm">
            <Skeleton className="mb-4 h-8 w-64" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : stmtQ.isError || !data ? (
          <ErrorBanner title={st.loadError} onRetry={() => stmtQ.refetch()} />
        ) : (
          <StatementDocument data={data} />
        )}
      </div>
    </div>
  );
}

// ─── Printable document ─────────────────────────────────────────────────────────

function StatementDocument({ data }: { data: SupplierStatement }) {
  const currency = data.currency;
  const generatedAt = useMemo(
    () => new Date().toLocaleString('en-GB', {
      timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }),
    [],
  );

  return (
    <div
      dir="rtl"
      className="mx-auto overflow-x-auto rounded-lg bg-white p-8 text-neutral-900 shadow-sm print:rounded-none print:shadow-none print:p-0"
      style={{ maxWidth: '297mm' }}
    >
      {/* Header */}
      <header className="mb-4 border-b border-neutral-200 pb-3 text-center">
        <h1 className="text-xl font-bold">{data.titleAr}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {st.from} <Num>{data.from}</Num> {st.to} <Num>{data.to}</Num>
          {' · '}
          <Num>{currencySymbol(currency)}</Num>
        </p>
        <p className="mt-0.5 text-xs text-neutral-400">
          {st.generatedAt}: <Num>{generatedAt}</Num>
        </p>
      </header>

      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <thead>
          <tr className="bg-neutral-100 text-neutral-700">
            <th className="border border-neutral-200 px-2 py-1.5 text-start font-semibold">{st.permitNo}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-start font-semibold">{st.date}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-start font-semibold">{st.description}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-start font-semibold">{st.color}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.quantity}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-center font-semibold">الوحدة</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.unitPrice} ({currencySymbol(currency)})</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.value} ({currencySymbol(currency)})</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.returnQty}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.returnValue} ({currencySymbol(currency)})</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.payment}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.balance}</th>
          </tr>
        </thead>
        <tbody>
          {/* Brought forward */}
          <tr className="bg-neutral-50 font-medium" style={{ pageBreakInside: 'avoid' }}>
            <td className="border border-neutral-200 px-2 py-1.5" colSpan={2} />
            <td className="border border-neutral-200 px-2 py-1.5">{st.broughtForward}</td>
            <td className="border border-neutral-200 px-2 py-1.5" colSpan={8} />
            <td className="border border-neutral-200 px-2 py-1.5 text-end">
              <Num>{money(data.broughtForward)}</Num>
            </td>
          </tr>

          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={12} className="border border-neutral-200 px-2 py-6 text-center italic text-neutral-400">
                {st.noRows}
              </td>
            </tr>
          ) : (
            data.rows.map((r, i) => <StatementRow key={i} row={r} />)
          )}

          {/* Closing / totals */}
          <tr className="bg-neutral-100 font-bold" style={{ pageBreakInside: 'avoid' }}>
            <td className="border border-neutral-200 px-2 py-2" colSpan={7} />
            <td className="border border-neutral-200 px-2 py-2 text-end">
              <Num>{money(data.totalValue)}</Num>
            </td>
            <td className="border border-neutral-200 px-2 py-2" />
            <td className="border border-neutral-200 px-2 py-2 text-end">
              <Num>{money(data.totalReturnValue)}</Num>
            </td>
            <td className="border border-neutral-200 px-2 py-2 text-end">
              <Num>{money(data.totalPayment)}</Num>
            </td>
            <td className="border border-neutral-200 px-2 py-2 text-end">
              <Num>{money(data.closing)}</Num>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StatementRow({ row }: { row: SupplierLedgerRow }) {
  const unitAr = row.unit ? (UNIT_AR[row.unit] ?? row.unit) : '';
  return (
    <tr style={{ pageBreakInside: 'avoid' }}>
      <td className="border border-neutral-200 px-2 py-1.5 whitespace-nowrap font-mono text-xs"><Num>{row.permitNo || '—'}</Num></td>
      <td className="border border-neutral-200 px-2 py-1.5 whitespace-nowrap"><Num>{row.date}</Num></td>
      <td className="border border-neutral-200 px-2 py-1.5">{row.description}</td>
      <td className="border border-neutral-200 px-2 py-1.5">{row.color || '—'}</td>
      <td className="border border-neutral-200 px-2 py-1.5 text-end"><Num>{qty(row.quantity)}</Num></td>
      <td className="border border-neutral-200 px-2 py-1.5 text-center">{unitAr}</td>
      <td className="border border-neutral-200 px-2 py-1.5 text-end">
        {row.unitPrice !== null ? <Num>{money(row.unitPrice)}</Num> : ''}
      </td>
      <td className="border border-neutral-200 px-2 py-1.5 text-end">
        <Num>{money(row.value)}</Num>
      </td>
      <td className="border border-neutral-200 px-2 py-1.5 text-end"><Num>{qty(row.returnQty)}</Num></td>
      <td className="border border-neutral-200 px-2 py-1.5 text-end">
        <Num>{money(row.returnValue)}</Num>
      </td>
      <td className="border border-neutral-200 px-2 py-1.5 text-end">
        <Num>{money(row.payment)}</Num>
      </td>
      <td className="border border-neutral-200 px-2 py-1.5 text-end font-medium">
        <Num>{money(row.balance)}</Num>
      </td>
    </tr>
  );
}
