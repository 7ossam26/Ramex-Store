import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, FileText, FileSpreadsheet, ArrowRight } from 'lucide-react';
import { ar } from '@/i18n/ar';
import {
  suppliersApi,
  supplierStatementExportUrl,
  type SupplierStatement,
  type StatementRow,
  type StatementVariant,
  type StatementExportFormat,
  type Currency,
} from '@/lib/suppliers-api';
import { currencySymbol, fmtMoney } from '@/components/dashboard/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { cn } from '@/lib/utils';

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

/** Money with the account's currency symbol; blank for zero (debit/credit cells). */
function money(n: number, currency: Currency): string {
  return `${fmtMoney(n)} ${currencySymbol(currency)}`;
}

const UNIT_AR: Record<string, string> = { kg: 'كجم', meter: 'متر', roll: 'توب', piece: 'قطعة' };

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
  const [variant, setVariant] = useState<StatementVariant>(
    params.get('variant') === 'detailed' ? 'detailed' : 'summary',
  );

  // Keep the URL in sync so a reload / share preserves the view.
  const syncUrl = (next: { from?: string; to?: string; variant?: StatementVariant }) => {
    const p = new URLSearchParams(params);
    p.set('from', next.from ?? from);
    p.set('to', next.to ?? to);
    p.set('variant', next.variant ?? variant);
    setParams(p, { replace: true });
  };

  const stmtQ = useQuery<SupplierStatement>({
    queryKey: ['supplier-statement', idNum, from, to],
    queryFn: () => suppliersApi.getStatement(idNum, from, to),
    enabled: Number.isFinite(idNum) && idNum > 0 && !!from && !!to,
  });

  const data = stmtQ.data;
  const currency: Currency = data?.currency ?? 'EGP';

  const exportUrl = (format: StatementExportFormat) =>
    supplierStatementExportUrl(idNum, { from, to, variant, format });

  return (
    <div className="min-h-screen bg-surface print:bg-white">
      {/* ── Toolbar — hidden in print ── */}
      <div
        data-print="hide"
        className="sticky top-0 z-10 border-b border-border-subtle bg-surface-elevated/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-end gap-3 px-4 py-3">
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

          {/* Variant toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">{st.variant}</span>
            <div className="inline-flex h-9 rounded-md border border-border-subtle bg-surface p-0.5" role="group" aria-label={st.variant}>
              {(['summary', 'detailed'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={variant === v}
                  onClick={() => { setVariant(v); syncUrl({ variant: v }); }}
                  className={cn(
                    'px-3 rounded text-xs font-medium transition-colors cursor-pointer',
                    variant === v
                      ? 'bg-accent text-foreground-on-accent'
                      : 'text-foreground-muted hover:text-foreground',
                  )}
                >
                  {v === 'summary' ? st.summary : st.detailed}
                </button>
              ))}
            </div>
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
      <div className="mx-auto max-w-4xl px-4 py-6 print:p-0">
        {stmtQ.isLoading ? (
          <div className="rounded-lg bg-white p-8 shadow-sm">
            <Skeleton className="mb-4 h-8 w-64" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : stmtQ.isError || !data ? (
          <ErrorBanner title={st.loadError} onRetry={() => stmtQ.refetch()} />
        ) : (
          <StatementDocument data={data} variant={variant} />
        )}
      </div>
    </div>
  );
}

// ─── Printable document ─────────────────────────────────────────────────────────

function StatementDocument({ data, variant }: { data: SupplierStatement; variant: StatementVariant }) {
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
      className="mx-auto rounded-lg bg-white p-8 text-neutral-900 shadow-sm print:rounded-none print:shadow-none print:p-0"
      style={{ maxWidth: '210mm' }}
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

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-neutral-100 text-neutral-700">
            <th className="border border-neutral-200 px-2 py-1.5 text-start font-semibold">{st.date}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-start font-semibold">{st.ref}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-start font-semibold">{st.description}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.debit}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.credit}</th>
            <th className="border border-neutral-200 px-2 py-1.5 text-end font-semibold">{st.balance}</th>
          </tr>
        </thead>
        <tbody>
          {/* Brought forward */}
          <tr className="bg-neutral-50 font-medium" style={{ pageBreakInside: 'avoid' }}>
            <td className="border border-neutral-200 px-2 py-1.5" />
            <td className="border border-neutral-200 px-2 py-1.5" />
            <td className="border border-neutral-200 px-2 py-1.5">{st.broughtForward}</td>
            <td className="border border-neutral-200 px-2 py-1.5" />
            <td className="border border-neutral-200 px-2 py-1.5" />
            <td className="border border-neutral-200 px-2 py-1.5 text-end">
              <Num>{money(data.broughtForward, currency)}</Num>
            </td>
          </tr>

          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="border border-neutral-200 px-2 py-6 text-center italic text-neutral-400">
                {st.noRows}
              </td>
            </tr>
          ) : (
            data.rows.map((r, i) => (
              <StatementRows key={i} row={r} currency={currency} detailed={variant === 'detailed'} />
            ))
          )}

          {/* Closing / totals */}
          <tr className="bg-neutral-100 font-bold" style={{ pageBreakInside: 'avoid' }}>
            <td className="border border-neutral-200 px-2 py-2" />
            <td className="border border-neutral-200 px-2 py-2" />
            <td className="border border-neutral-200 px-2 py-2">{st.closing}</td>
            <td className="border border-neutral-200 px-2 py-2 text-end">
              <Num>{money(data.totalDebit, currency)}</Num>
            </td>
            <td className="border border-neutral-200 px-2 py-2 text-end">
              <Num>{money(data.totalCredit, currency)}</Num>
            </td>
            <td className="border border-neutral-200 px-2 py-2 text-end">
              <Num>{money(data.closing, currency)}</Num>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StatementRows({ row, currency, detailed }: { row: StatementRow; currency: Currency; detailed: boolean }) {
  return (
    <>
      <tr style={{ pageBreakInside: 'avoid' }}>
        <td className="border border-neutral-200 px-2 py-1.5 whitespace-nowrap"><Num>{row.date}</Num></td>
        <td className="border border-neutral-200 px-2 py-1.5 whitespace-nowrap font-mono text-xs"><Num>{row.ref || '—'}</Num></td>
        <td className="border border-neutral-200 px-2 py-1.5">{row.description}</td>
        <td className="border border-neutral-200 px-2 py-1.5 text-end">
          {row.debit ? <Num>{money(row.debit, currency)}</Num> : ''}
        </td>
        <td className="border border-neutral-200 px-2 py-1.5 text-end">
          {row.credit ? <Num>{money(row.credit, currency)}</Num> : ''}
        </td>
        <td className="border border-neutral-200 px-2 py-1.5 text-end font-medium">
          <Num>{money(row.balance, currency)}</Num>
        </td>
      </tr>
      {detailed && row.lineItems && row.lineItems.length > 0 && row.lineItems.map((li, j) => (
        <tr key={j} className="text-xs text-neutral-500" style={{ pageBreakInside: 'avoid' }}>
          <td className="border border-neutral-200 px-2 py-1" />
          <td className="border border-neutral-200 px-2 py-1" />
          <td className="border border-neutral-200 px-2 py-1" colSpan={4}>
            ↳ {li.description} — <Num>{fmtMoney(li.quantity)}</Num> {UNIT_AR[li.unit] ?? li.unit}
            {' × '}<Num>{money(li.unit_price, currency)}</Num>
            {' = '}<Num>{money(li.line_total, currency)}</Num>
          </td>
        </tr>
      ))}
    </>
  );
}
