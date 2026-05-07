import { useState } from 'react';
import { ar } from '@/i18n/ar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  children: React.ReactNode;
  loading?: boolean;
};

export function ReportShell({
  title, exportPdfUrl, exportExcelUrl, printUrl,
  showDateRange = true, dateRange, onDateRangeChange,
  extraFilters, children, loading,
}: Props) {
  const [preset, setPreset] = useState('today');

  const handlePreset = (p: string) => {
    setPreset(p);
    if (p !== 'custom' && onDateRangeChange) {
      onDateRangeChange(getPresetRange(p));
    }
  };

  const presets = [
    ['today', ar.reports.presets.today],
    ['yesterday', ar.reports.presets.yesterday],
    ['thisWeek', ar.reports.presets.thisWeek],
    ['thisMonth', ar.reports.presets.thisMonth],
    ['custom', ar.reports.presets.custom],
  ] as const;

  return (
    <div className="p-3 md:p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="flex flex-wrap gap-2">
          {exportPdfUrl && (
            <a href={exportPdfUrl} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none">
              <Button variant="outline" size="sm" className="h-11 md:h-9 w-full">{ar.reports.exportPdf}</Button>
            </a>
          )}
          {exportExcelUrl && (
            <a href={exportExcelUrl} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none">
              <Button variant="outline" size="sm" className="h-11 md:h-9 w-full">{ar.reports.exportExcel}</Button>
            </a>
          )}
          {printUrl && (
            <a href={printUrl} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none">
              <Button variant="outline" size="sm" className="h-11 md:h-9 w-full">{ar.reports.print}</Button>
            </a>
          )}
        </div>
      </div>

      {/* Filters */}
      {(showDateRange || extraFilters) && (
        <div className="bg-card border border-border rounded-lg p-3 space-y-3 md:space-y-0 md:flex md:flex-wrap md:gap-3 md:items-end">
          {showDateRange && (
            <>
              <div className="flex gap-1 overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0 whitespace-nowrap">
                {presets.map(([p, label]) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={preset === p ? 'default' : 'outline'}
                    onClick={() => handlePreset(p)}
                    className="h-11 md:h-9 shrink-0"
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {preset === 'custom' && dateRange && (
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div>
                    <Label className="text-xs">{ar.reports.from}</Label>
                    <Input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => onDateRangeChange?.({ ...dateRange, from: e.target.value })}
                      className="h-11 md:h-10 w-full sm:w-36"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{ar.reports.to}</Label>
                    <Input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => onDateRangeChange?.({ ...dateRange, to: e.target.value })}
                      className="h-11 md:h-10 w-full sm:w-36"
                    />
                  </div>
                </div>
              )}
            </>
          )}
          {extraFilters}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center text-muted-foreground py-12">{ar.loading}</div>
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

export function ReportTable({ title, columns, rows, totals, emptyText }: TableProps) {
  const fmt = (v: string | number) => v ?? '';

  return (
    <div className="mb-6">
      {title && <h2 className="font-semibold text-sm text-muted-foreground mb-2">{title}</h2>}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 text-right font-medium ${c.className ?? ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center text-muted-foreground py-8">
                  {emptyText ?? ar.reports.noData}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/20">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-1.5 ${c.className ?? ''}`}>
                      {fmt(row[c.key] as string | number)}
                    </td>
                  ))}
                </tr>
              ))
            )}
            {totals && rows.length > 0 && (
              <tr className="border-t-2 border-border font-bold bg-muted/30">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 ${c.className ?? ''}`}>
                    {totals[c.key] !== undefined ? fmt(totals[c.key] as string | number) : ''}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
