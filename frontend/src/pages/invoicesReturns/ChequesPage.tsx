import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { FileText, Search, Filter } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { salesApi } from '@/lib/sales-api';
import type { Cheque } from '@/lib/sales-types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/StatusPill';
import type { StatusTone } from '@/components/StatusPill';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

function fmtMoney(n: string | number): string {
  const v = typeof n === 'number' ? n : Number(n);
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string): string {
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(s));
}

type ChequeStatus = 'pending' | 'cleared' | 'bounced' | 'cancelled';

const STATUS_TONE: Record<ChequeStatus, StatusTone> = {
  pending: 'warning',
  cleared: 'success',
  bounced: 'danger',
  cancelled: 'neutral',
};

export function ChequesPage() {
  const [status, setStatus] = useState<ChequeStatus | ''>('');
  const [bankFilter, setBankFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 30;
  const debouncedSearch = useDebouncedValue(search);
  const debouncedBank = useDebouncedValue(bankFilter);

  const [selectedCheque, setSelectedCheque] = useState<Cheque | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['cheques', status, debouncedBank, debouncedSearch, dueDateFrom, dueDateTo, page],
    queryFn: () => salesApi.listCheques({
      status: status || undefined,
      bank_name_ar: debouncedBank || undefined,
      search: debouncedSearch || undefined,
      due_date_from: dueDateFrom || undefined,
      due_date_to: dueDateTo || undefined,
      page,
      limit,
    }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileText className="size-6 text-accent" />
        <h1 className="text-xl font-bold text-foreground">{ar.cheques.title}</h1>
        {total > 0 && (
          <span className="text-sm text-foreground-muted">({total})</span>
        )}
      </div>

      {/* General search — full width above the filter grid so the 4-cell layout
          stays intact. Covers cheque no. / الساحب / invoice no. / customer; the
          البنك box below stays a separate filter and is not duplicated here. */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-foreground-tertiary pointer-events-none" aria-hidden />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={ar.cheques.searchPlaceholder}
          aria-label={ar.cheques.searchPlaceholder}
          maxLength={64}
          dir="rtl"
          className="ps-9 h-10"
        />
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{ar.cheques.filterStatus}</Label>
          <select
            className="h-9 w-full border border-border-default rounded-md px-2 text-sm bg-surface-elevated text-foreground cursor-pointer"
            value={status}
            onChange={(e) => { setStatus(e.target.value as ChequeStatus | ''); setPage(1); }}
          >
            <option value="">{ar.cheques.filterAll}</option>
            {(['pending', 'cleared', 'bounced', 'cancelled'] as ChequeStatus[]).map((s) => (
              <option key={s} value={s}>{ar.cheques.statuses[s]}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{ar.cheques.filterBank}</Label>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-foreground-tertiary" />
            <Input
              value={bankFilter}
              onChange={(e) => { setBankFilter(e.target.value); setPage(1); }}
              className="h-9 text-sm pr-7"
              dir="rtl"
              placeholder="—"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{ar.cheques.filterDueDateFrom}</Label>
          <Input
            type="date"
            value={dueDateFrom}
            onChange={(e) => { setDueDateFrom(e.target.value); setPage(1); }}
            className="h-9 text-sm"
            dir="ltr"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{ar.cheques.filterDueDateTo}</Label>
          <Input
            type="date"
            value={dueDateTo}
            onChange={(e) => { setDueDateTo(e.target.value); setPage(1); }}
            className="h-9 text-sm"
            dir="ltr"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-surface-hover" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-foreground-muted">
          <Filter className="size-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{ar.cheques.empty}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border-subtle overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated border-b border-border-subtle">
              <tr className="text-right text-xs text-foreground-muted">
                <th className="px-3 py-2 font-medium">{ar.cheques.chequeNo}</th>
                <th className="px-3 py-2 font-medium">{ar.cheques.bank}</th>
                <th className="px-3 py-2 font-medium text-end">{ar.cheques.amount}</th>
                <th className="px-3 py-2 font-medium">{ar.cheques.issueDate}</th>
                <th className="px-3 py-2 font-medium">{ar.cheques.dueDate}</th>
                <th className="px-3 py-2 font-medium">{ar.cheques.customer}</th>
                <th className="px-3 py-2 font-medium">{ar.cheques.invoice}</th>
                <th className="px-3 py-2 font-medium">{ar.cheques.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((ch) => (
                <tr
                  key={ch.id}
                  className="hover:bg-surface-row-alt cursor-pointer transition-colors duration-100"
                  onClick={() => setSelectedCheque(ch)}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-foreground" dir="ltr">{ch.cheque_number}</td>
                  <td className="px-3 py-2.5 text-foreground">{ch.bank_name_ar}</td>
                  <td className="px-3 py-2.5 tabular-num text-end font-medium text-foreground" dir="ltr">
                    {fmtMoney(ch.amount_egp)} ج.م
                  </td>
                  <td className="px-3 py-2.5 tabular-num text-foreground-muted" dir="ltr">{fmtDate(ch.issue_date)}</td>
                  <td className="px-3 py-2.5 tabular-num font-medium text-foreground" dir="ltr">{fmtDate(ch.due_date)}</td>
                  <td className="px-3 py-2.5 text-foreground-muted">{ch.customer_name_ar ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-foreground-muted" dir="ltr">{ch.invoice_no ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <StatusPill tone={STATUS_TONE[ch.status as ChequeStatus] ?? 'neutral'}>
                      {ar.cheques.statuses[ch.status as ChequeStatus] ?? ch.status}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="cursor-pointer h-9">
            &rsaquo;
          </Button>
          <span className="text-sm text-foreground-muted tabular-num">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="cursor-pointer h-9">
            &lsaquo;
          </Button>
        </div>
      )}

      {/* Detail sheet */}
      <Sheet open={!!selectedCheque} onOpenChange={(o) => !o && setSelectedCheque(null)}>
        <SheetContent side="left" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="size-5 text-accent" />
              {ar.cheques.title}
            </SheetTitle>
          </SheetHeader>
          {selectedCheque && (
            <div className="mt-4 space-y-0 text-sm">
              <DetailRow label={ar.cheques.chequeNo} value={selectedCheque.cheque_number} mono />
              <DetailRow label={ar.cheques.bank} value={selectedCheque.bank_name_ar} />
              {selectedCheque.branch_ar && <DetailRow label={ar.cheques.branch} value={selectedCheque.branch_ar} />}
              {selectedCheque.issuer_name_ar && <DetailRow label={ar.cheques.issuer} value={selectedCheque.issuer_name_ar} />}
              <DetailRow label={ar.cheques.amount} value={`${fmtMoney(selectedCheque.amount_egp)} ج.م`} mono />
              <DetailRow label={ar.cheques.issueDate} value={fmtDate(selectedCheque.issue_date)} mono />
              <DetailRow label={ar.cheques.dueDate} value={fmtDate(selectedCheque.due_date)} mono />
              <DetailRow label={ar.cheques.customer} value={selectedCheque.customer_name_ar ?? '—'} />
              <DetailRow label={ar.cheques.invoice} value={selectedCheque.invoice_no ?? '—'} mono />
              <div className="flex items-center justify-between py-2.5 border-b border-border-subtle">
                <span className="text-foreground-muted">{ar.cheques.status}</span>
                <StatusPill tone={STATUS_TONE[selectedCheque.status as ChequeStatus] ?? 'neutral'}>
                  {ar.cheques.statuses[selectedCheque.status as ChequeStatus] ?? selectedCheque.status}
                </StatusPill>
              </div>
              {selectedCheque.notes_ar && (
                <div className="space-y-1 pt-2">
                  <p className="text-foreground-muted text-xs">{ar.cheques.notes}</p>
                  <p className="text-foreground bg-surface-elevated rounded-md p-2 text-sm" dir="rtl">{selectedCheque.notes_ar}</p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-border-subtle">
      <span className="text-foreground-muted shrink-0">{label}</span>
      <span className={`font-medium text-foreground text-end ${mono ? 'font-mono text-xs' : ''}`} dir={mono ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
}
