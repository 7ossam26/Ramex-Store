import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { shiftsApi, type Shift } from '@/lib/shifts-api';
import { ar } from '@/i18n/ar';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour12: false });
}

const columns: Column<Shift>[] = [
  {
    key: 'opened_at',
    header: ar.shifts.openedAt,
    primary: true,
    cell: (r) => (
      <span className="tabular-num" dir="ltr">
        {fmtDateTime(r.opened_at)}
      </span>
    ),
  },
  {
    key: 'closed_at',
    header: ar.shifts.closedAt,
    secondary: true,
    cell: (r) =>
      r.closed_at ? (
        <span className="tabular-num" dir="ltr">
          {fmtDateTime(r.closed_at)}
        </span>
      ) : (
        <span className="text-foreground-muted">—</span>
      ),
  },
  {
    key: 'opened_by',
    header: ar.shifts.openedBy,
    hideOnMobile: true,
    cell: (r) => r.opened_by_username ?? '—',
  },
  {
    key: 'status',
    header: 'الحالة',
    hideOnMobile: true,
    cell: (r) => (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${r.status === 'open' ? 'bg-accent-subtle text-accent-foreground border-accent' : 'text-foreground-muted border-border-subtle'}`}>
        {r.status === 'open' ? ar.shifts.status.open : ar.shifts.status.closed}
      </span>
    ),
  },
];

export function ShiftHistoryPage() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shifts-list'],
    queryFn: () => shiftsApi.list({ limit: 50 }),
  });

  return (
    <PageShell title={ar.shifts.history}>
      <SectionCard noPadding>
        <ResponsiveTable<Shift>
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => String(r.id)}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          empty={ar.shifts.noHistory}
          onRowClick={(r) => navigate(`/shifts/${r.id}`)}
        />
      </SectionCard>
    </PageShell>
  );
}
