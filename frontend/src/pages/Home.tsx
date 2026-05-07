import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ar } from '@/i18n/ar';
import { useAuth } from '@/lib/auth';
import { ownerApi } from '@/lib/owner-api';

function fmt(n: number) {
  return n.toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className="text-xl font-bold text-ink">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function OwnerDashboard() {
  const { data: summary, isLoading: loadingSum } = useQuery({
    queryKey: ['owner-summary-today'],
    queryFn: ownerApi.summaryToday,
    refetchInterval: 120_000,
  });

  const { data: cash, isLoading: loadingCash } = useQuery({
    queryKey: ['owner-cash-position'],
    queryFn: ownerApi.cashPosition,
    refetchInterval: 120_000,
  });

  const { data: topFabrics = [], isLoading: loadingFabrics } = useQuery({
    queryKey: ['owner-top-fabrics'],
    queryFn: () => ownerApi.topFabrics('7d'),
    refetchInterval: 300_000,
  });

  const loading = loadingSum || loadingCash || loadingFabrics;

  if (loading && !summary) {
    return <p className="text-sm text-muted-foreground">{ar.loading}</p>;
  }

  const totalBankBalance = (cash?.banks ?? []).reduce((s, b) => s + b.current_balance_egp, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">{ar.home.ownerWidgets}</h2>

      {/* Today summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            title={ar.home.todayRevenue}
            value={`${fmt(summary.revenue_egp)} ج.م`}
            sub={`${summary.sales_count} مبيعة`}
          />
          <StatCard
            title={ar.home.salesCount}
            value={String(summary.sales_count)}
          />
          <StatCard
            title={ar.home.voidCount}
            value={String(summary.void_count)}
            sub={`${fmt(summary.void_total_egp)} ج.م`}
          />
          <StatCard
            title={ar.home.refundTotal}
            value={`${fmt(summary.refund_total_egp)} ج.م`}
            sub={`${summary.refund_count} مرتجع`}
          />
          <StatCard
            title={ar.home.expensesTotal}
            value={`${fmt(summary.expenses_total_egp)} ج.م`}
          />
          <StatCard
            title="صافي الكاش اليوم"
            value={`${fmt(summary.cash_in_egp - summary.cash_out_egp)} ج.م`}
          />
        </div>
      )}

      {/* Cash position */}
      {cash && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard
            title={ar.home.cashBalance}
            value={`${fmt(cash.cash.current_balance_egp)} ج.م`}
            sub={cash.cash.last_recon_date ? `آخر تسوية: ${cash.cash.last_recon_date}` : undefined}
          />
          <StatCard
            title={ar.home.bankBalance}
            value={`${fmt(totalBankBalance)} ج.م`}
            sub={`${cash.banks.filter((b) => b.is_active).length} حساب نشط`}
          />
        </div>
      )}

      {/* Top fabrics */}
      {topFabrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{ar.home.topFabrics}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs border-b border-border">
                  <th className="py-1.5 text-right font-medium">الخامة</th>
                  <th className="py-1.5 text-right font-medium">اللون</th>
                  <th className="py-1.5 text-left font-medium">الإيراد (ج.م)</th>
                  <th className="py-1.5 text-left font-medium">التوبات</th>
                </tr>
              </thead>
              <tbody>
                {topFabrics.slice(0, 5).map((f) => (
                  <tr key={`${f.fabric_id}-${f.color_id}`} className="border-b border-border hover:bg-muted/40">
                    <td className="py-1.5">{f.fabric_name_ar}</td>
                    <td className="py-1.5">{f.color_name_ar}</td>
                    <td className="py-1.5 text-left">{fmt(f.revenue_egp)}</td>
                    <td className="py-1.5 text-left">{f.roll_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const modules = [
  ar.topbar.inventory,
  ar.topbar.sales,
  ar.topbar.customers,
  ar.topbar.payments,
  ar.topbar.invoices,
  ar.topbar.reports,
  ar.topbar.settings,
];

export function HomePage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-ink">{ar.home.welcome}</h1>

      {isOwner && <OwnerDashboard />}

      {!isOwner && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {modules.map((m) => (
            <Card key={m}>
              <CardHeader>
                <CardTitle className="text-base">{m}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
