import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';
import { ar } from '@/i18n/ar';
import { useAuth } from '@/lib/auth';
import { ownerApi } from '@/lib/owner-api';

/* ────────────────────────────────────────────────────────────────────────── *
 * Number formatting — Western digits with Arabic-Egypt locale grouping.
 * Matches every other surface in the app (see owner-api.ts callers, POS, etc.).
 * Documented in PR: numbers render as `ar-EG-u-nu-latn` (e.g. 1,234.56).
 * ────────────────────────────────────────────────────────────────────────── */
function fmtMoney(n: number): string {
  return n.toLocaleString('ar-EG-u-nu-latn', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: 0 });
}

/* ────────────────────────────────────────────────────────────────────────── *
 * useTickUp — animate a value from 0 → target over `duration` ms.
 * Skips animation when target is 0 OR `prefers-reduced-motion: reduce`.
 * ────────────────────────────────────────────────────────────────────────── */
function useTickUp(target: number, duration = 600): number {
  const [value, setValue] = useState<number>(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (target === 0 || prefersReduced) {
      setValue(target);
      return;
    }

    startRef.current = null;
    setValue(0);

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Motion variants — stagger 60ms between cards, 240ms each, decelerate.
 * `prefers-reduced-motion` is honored globally by index.css transition rules.
 * ────────────────────────────────────────────────────────────────────────── */
const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: [0, 0, 0.2, 1] as const },
  },
};

/* ────────────────────────────────────────────────────────────────────────── *
 * MetricCard
 * ────────────────────────────────────────────────────────────────────────── */
type MetricCardProps = {
  label: string;
  value: number;
  format?: 'money' | 'int';
  suffix?: string;
  meta?: string;
};

function MetricCard({ label, value, format = 'money', suffix, meta }: MetricCardProps) {
  const animated = useTickUp(value);
  const displaySuffix = suffix ?? (format === 'money' ? 'ج.م' : '');
  const formatted = format === 'money' ? fmtMoney(animated) : fmtInt(animated);

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -2 }}
      transition={{ y: { duration: 0.15 } }}
      className="rounded-lg border border-border-subtle bg-surface-elevated shadow-sm hover:shadow-md transition-shadow duration-150 p-5 tabular-num"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-2">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold text-foreground" dir="ltr">
          {formatted}
        </span>
        {displaySuffix && (
          <span className="text-sm text-foreground-tertiary">{displaySuffix}</span>
        )}
      </div>
      {meta && <p className="text-xs text-foreground-tertiary mt-2">{meta}</p>}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * States
 * ────────────────────────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div
      className="rounded-lg border border-border-subtle bg-surface-elevated shadow-sm p-5"
      aria-hidden
    >
      <Skeleton className="h-3 w-1/2 mb-3" />
      <Skeleton className="h-8 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger-subtle p-5 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex items-start gap-3 flex-1">
        <AlertTriangle className="size-5 text-danger shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-danger-foreground">
            تعذر تحميل ملخص اليوم
          </p>
          <p className="text-sm text-danger-foreground/80 mt-0.5">
            يرجى المحاولة مرة أخرى.
          </p>
        </div>
      </div>
      <Button onClick={onRetry} variant="outline" size="sm" className="gap-1.5 shrink-0">
        <RefreshCw className="size-4" />
        إعادة المحاولة
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-12 text-center">
      <div
        className="size-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center"
        aria-hidden
      >
        <Inbox className="size-8 text-foreground-tertiary" />
      </div>
      <p className="text-foreground-muted text-base">لا توجد بيانات اليوم بعد</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * OwnerDashboard
 * ────────────────────────────────────────────────────────────────────────── */
function OwnerDashboard() {
  const summaryQ = useQuery({
    queryKey: ['owner-summary-today'],
    queryFn: ownerApi.summaryToday,
    refetchInterval: 120_000,
  });
  const cashQ = useQuery({
    queryKey: ['owner-cash-position'],
    queryFn: ownerApi.cashPosition,
    refetchInterval: 120_000,
  });

  const loading = summaryQ.isLoading || cashQ.isLoading;
  const error = summaryQ.error || cashQ.error;

  if (error) {
    return (
      <ErrorState
        onRetry={() => {
          void summaryQ.refetch();
          void cashQ.refetch();
        }}
      />
    );
  }

  if (loading || !summaryQ.data || !cashQ.data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  const summary = summaryQ.data;
  const cash = cashQ.data;
  const totalBankBalance = cash.banks.reduce((s, b) => s + b.current_balance_egp, 0);
  const netCash = summary.cash_in_egp - summary.cash_out_egp;
  const activeBanks = cash.banks.filter((b) => b.is_active).length;

  const totalsAreZero =
    summary.revenue_egp === 0 &&
    summary.sales_count === 0 &&
    summary.void_count === 0 &&
    summary.refund_total_egp === 0 &&
    summary.expenses_total_egp === 0 &&
    netCash === 0 &&
    cash.cash.current_balance_egp === 0 &&
    totalBankBalance === 0;

  if (totalsAreZero) return <EmptyState />;

  return (
    <motion.div
      className="space-y-4"
      variants={gridVariants}
      initial="hidden"
      animate="show"
    >
      {/* Today's six metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          label={ar.home.todayRevenue}
          value={summary.revenue_egp}
          meta={`${fmtInt(summary.sales_count)} مبيعة`}
        />
        <MetricCard
          label={ar.home.salesCount}
          value={summary.sales_count}
          format="int"
        />
        <MetricCard
          label={ar.home.voidCount}
          value={summary.void_count}
          format="int"
          meta={`${fmtMoney(summary.void_total_egp)} ج.م`}
        />
        <MetricCard
          label={ar.home.refundTotal}
          value={summary.refund_total_egp}
          meta={`${fmtInt(summary.refund_count)} مرتجع`}
        />
        <MetricCard label={ar.home.expensesTotal} value={summary.expenses_total_egp} />
        <MetricCard label="صافي الكاش اليوم" value={netCash} />
      </div>

      {/* Two balance cards — span 3 of 6 columns on lg */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="lg:col-span-3">
          <MetricCard
            label={ar.home.cashBalance}
            value={cash.cash.current_balance_egp}
            meta={
              cash.cash.last_recon_date
                ? `آخر تسوية: ${cash.cash.last_recon_date}`
                : undefined
            }
          />
        </div>
        <div className="lg:col-span-3">
          <MetricCard
            label={ar.home.bankBalance}
            value={totalBankBalance}
            meta={`${fmtInt(activeBanks)} حساب نشط`}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Non-owner landing — minimal token re-skin of the module overview.
 * ────────────────────────────────────────────────────────────────────────── */
const modules = [
  ar.topbar.inventory,
  ar.topbar.sales,
  ar.topbar.customers,
  ar.topbar.payments,
  ar.topbar.invoices,
  ar.topbar.reports,
  ar.topbar.settings,
];

function SellerLanding() {
  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      variants={gridVariants}
      initial="hidden"
      animate="show"
    >
      {modules.map((m) => (
        <motion.div
          key={m}
          variants={cardVariants}
          whileHover={{ y: -2 }}
          transition={{ y: { duration: 0.15 } }}
          className="rounded-lg border border-border-subtle bg-surface-elevated shadow-sm hover:shadow-md transition-shadow duration-150 p-5"
        >
          <p className="text-base font-semibold text-foreground">{m}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * HomePage
 * ────────────────────────────────────────────────────────────────────────── */
export function HomePage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  return (
    <div className="space-y-6" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-foreground">{ar.home.welcome}</h1>
        <p className="text-sm text-foreground-muted">{ar.home.ownerWidgets}</p>
      </header>

      {isOwner ? <OwnerDashboard /> : <SellerLanding />}
    </div>
  );
}
