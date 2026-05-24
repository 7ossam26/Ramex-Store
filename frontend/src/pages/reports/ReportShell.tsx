import { useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { FilterChip } from '@/components/FilterChip';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';

export type DateRange = { from: string; to: string };

function getPresetRange(preset: string): DateRange {
  const now = new Date();
  const toIso = (d: Date) => d.toISOString().slice(0, 10);

  const cairoOffset = () => {
    const utcMs = now.getTime();
    const cairoMs = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' })).getTime();
    return cairoMs - utcMs;
  };
  const offset = cairoOffset();
  const cairo = new Date(now.getTime() + offset);

  if (preset === 'today') {
    const d = toIso(cairo);
    return { from: d, to: d };
  }
  if (preset === 'yesterday') {
    const y = new Date(cairo);
    y.setDate(y.getDate() - 1);
    const d = toIso(y);
    return { from: d, to: d };
  }
  if (preset === 'thisWeek') {
    const day = cairo.getDay();
    const sat = new Date(cairo);
    sat.setDate(cairo.getDate() - ((day + 1) % 7)); // Saturday = week start in AR
    return { from: toIso(sat), to: toIso(cairo) };
  }
  if (preset === 'thisMonth') {
    const first = new Date(cairo.getFullYear(), cairo.getMonth(), 1);
    return { from: toIso(first), to: toIso(cairo) };
  }
  return { from: toIso(cairo), to: toIso(cairo) };
}

type Props = {
  title: string;
  exportPdfUrl?: string;
  exportExcelUrl?: string;
  printUrl?: string;
  showDateRange?: boolean;
  dateRange?: DateRange;
  onDateRangeChange?: (r: DateRange) => void;
  extraFilters?: React.ReactNode;
  /** Chart pane rendered between filters and table. Optional. */
  chart?: React.ReactNode;
  children: React.ReactNode;
  loading?: boolean;
};

export function ReportShell({
  title,
  exportPdfUrl,
  exportExcelUrl,
  printUrl,
  showDateRange = true,
  dateRange,
  onDateRangeChange,
  extraFilters,
  chart,
  children,
  loading,
}: Props) {
  const [preset, setPreset] = useState('today');

  const handlePreset = (p: string) => {
    setPreset(p);
    if (p !== 'custom' && onDateRangeChange) {
      onDateRangeChange(getPresetRange(p));
    }
  };

  const presets: [string, string][] = [
    ['today', ar.reports.presets.today],
    ['yesterday', ar.reports.presets.yesterday],
    ['thisWeek', ar.reports.presets.thisWeek],
    ['thisMonth', ar.reports.presets.thisMonth],
    ['custom', ar.reports.presets.custom],
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title={title}
        backTo="/reports"
        actions={
          <span className="contents [&_a]:print:hidden [&_button]:print:hidden">
            {exportPdfUrl && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={exportPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5"
                >
                  <FileText className="size-4" aria-hidden />
                  {ar.reports.exportPdf}
                </a>
              </Button>
            )}
            {exportExcelUrl && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={exportExcelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5"
                >
                  <Download className="size-4" aria-hidden />
                  {ar.reports.exportExcel}
                </a>
              </Button>
            )}
            {printUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={printUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                  <Printer className="size-4" aria-hidden />
                  {ar.reports.print}
                </a>
              </Button>
            )}
          </span>
        }
      />

      {/* Filters — hidden on print so the page is a clean snapshot of the data. */}
      {(showDateRange || extraFilters) && (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-sm flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end print:hidden">
          {showDateRange && (
            <>
              <div className="flex gap-2 overflow-x-auto -mx-1 px-1 whitespace-nowrap">
                {presets.map(([p, label]) => (
                  <FilterChip key={p} active={preset === p} onClick={() => handlePreset(p)}>
                    {label}
                  </FilterChip>
                ))}
              </div>
              {preset === 'custom' && dateRange && (
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground-muted">{ar.reports.from}</Label>
                    <Input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => onDateRangeChange?.({ ...dateRange, from: e.target.value })}
                      className="h-10 w-full sm:w-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground-muted">{ar.reports.to}</Label>
                    <Input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => onDateRangeChange?.({ ...dateRange, to: e.target.value })}
                      className="h-10 w-full sm:w-40"
                    />
                  </div>
                </div>
              )}
            </>
          )}
          {extraFilters && (
            <div className="flex flex-wrap items-end gap-3">{extraFilters}</div>
          )}
        </div>
      )}

      {/* Chart pane */}
      {chart && !loading && (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm">
          {chart}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated overflow-hidden shadow-sm" aria-hidden>
          <div className="px-3 py-3 border-b border-border-subtle bg-surface-hover/40 flex items-center gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-3" style={{ width: '20%' }} />
            ))}
          </div>
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 8 }).map((_, ri) => (
              <div key={ri} className="px-3 py-3 flex items-center gap-3">
                {[1, 2, 3, 4, 5].map((ci) => (
                  <Skeleton
                    key={ci}
                    className="h-3"
                    style={{ width: '20%', animationDelay: `${(ri * 5 + ci) * 30}ms` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

type TableProps = {
  title?: string;
  columns: { label: string; key: string; className?: string }[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number>;
  emptyText?: string;
};

/** Numeric keys get tabular-num + LTR for proper digit alignment. */
const NUMERIC_KEY_HINT = /amount|egp|count|weight|balance|total|kg|age_days|valuation/i;

/** Identifier keys (invoice numbers, serials, barcodes) pin to monospace,
 * including when printed (via the .rmx-print-code utility). */
const IDENTIFIER_KEY_HINT = /\b(invoice_no|roll_sr_no|internal_barcode|sku|code|barcode|stocktake_no|shipment_no)\b/i;

export function ReportTable({ title, columns, rows, totals, emptyText }: TableProps) {
  const fmt = (v: string | number) => v ?? '';

  return (
    <div className="space-y-3">
      {title && (
        <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          {title}
        </h2>
      )}
      <div className="rounded-lg border border-border-subtle bg-surface-elevated overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-hover/40">
              <tr className="text-start">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      'px-3 py-3 font-medium text-xs uppercase tracking-wide text-foreground-muted',
                      c.className,
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="text-center text-foreground-muted py-10"
                  >
                    {emptyText ?? ar.reports.noData}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-t border-border-subtle even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150"
                  >
                    {columns.map((c) => {
                      const isNumeric = NUMERIC_KEY_HINT.test(c.key);
                      const isIdent = IDENTIFIER_KEY_HINT.test(c.key);
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            'px-3 py-2.5 text-foreground align-middle',
                            isNumeric && 'tabular-num',
                            isIdent && 'rmx-print-code font-mono tabular-num',
                            c.className,
                          )}
                          dir={isNumeric || isIdent ? 'ltr' : undefined}
                        >
                          {fmt(row[c.key] as string | number)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
              {totals && rows.length > 0 && (
                <tr className="border-t-2 border-border-default font-semibold bg-surface-hover/60">
                  {columns.map((c) => {
                    const isNumeric = NUMERIC_KEY_HINT.test(c.key);
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          'px-3 py-2.5 text-foreground',
                          isNumeric && 'tabular-num',
                          c.className,
                        )}
                        dir={isNumeric ? 'ltr' : undefined}
                      >
                        {totals[c.key] !== undefined ? fmt(totals[c.key] as string | number) : ''}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
