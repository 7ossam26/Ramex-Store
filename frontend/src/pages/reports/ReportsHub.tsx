import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  Palette,
  UserSquare,
  FileClock,
  Boxes,
  TrendingUp,
  Landmark,
  Receipt,
  AlertOctagon,
  CreditCard,
  ShieldCheck,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';
import { ar } from '@/i18n/ar';
import { PageHeader } from '@/components/PageHeader';

type SecondaryCard = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const secondary: SecondaryCard[] = [
  { label: ar.reports.salesByFabricColor, href: '/reports/secondary/salesByFabricColor', icon: Palette },
  { label: ar.reports.customerLedger, href: '/reports/secondary/customerLedger', icon: UserSquare },
  { label: ar.reports.outstandingOpenInvoices, href: '/reports/secondary/outstandingOpenInvoices', icon: FileClock },
  { label: ar.reports.stocktakeInventory, href: '/reports/secondary/stocktakeInventory', icon: Boxes },
  { label: ar.reports.cashFlow, href: '/reports/secondary/cashFlow', icon: TrendingUp },
  { label: ar.reports.bankReconciliation, href: '/reports/secondary/bankReconciliation', icon: Landmark },
  { label: ar.reports.expenses, href: '/reports/secondary/expenses', icon: Receipt },
  { label: ar.reports.damageLoss, href: '/reports/secondary/damageLoss', icon: AlertOctagon },
  { label: ar.reports.salesByPaymentMethod, href: '/reports/secondary/salesByPaymentMethod', icon: CreditCard },
  { label: ar.reports.auditLog, href: '/reports/secondary/auditLog', icon: ShieldCheck },
];

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: [0, 0, 0.2, 1] as const },
  },
};

export function ReportsHubPage() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <PageHeader
        title={ar.hubs.reportsTitle}
        description={ar.hubs.reportsDescription}
      />

      {/* Featured daily report card — full-width, accent leading-edge border */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
      >
        <Link
          to="/reports/daily"
          className="group block rounded-lg border border-border-subtle border-s-2 border-s-accent bg-surface-elevated p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ease-decelerate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <div className="flex items-start gap-5">
            <span
              className="size-14 shrink-0 rounded-lg bg-accent-subtle text-accent inline-flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-150"
              aria-hidden
            >
              <CalendarClock className="size-7" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-semibold text-foreground">{ar.reports.daily}</p>
              <p className="text-sm text-foreground-muted mt-1 leading-relaxed">
                {ar.hubs.reportsDailyDesc}
              </p>
            </div>
            <ChevronLeft
              className="size-6 text-foreground-tertiary shrink-0 mt-1 group-hover:text-accent transition-colors duration-150"
              aria-hidden
            />
          </div>
        </Link>
      </motion.div>

      {/* Secondary reports — grouped grid */}
      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          {ar.hubs.reportsSecondarySection}
        </h2>
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {secondary.map((c) => {
            const Icon = c.icon;
            return (
              <motion.div key={c.href} variants={cardVariants}>
                <Link
                  to={c.href}
                  className="group block rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm hover:shadow-md hover:border-border-default hover:-translate-y-0.5 transition-all duration-150 ease-decelerate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="flex items-start gap-4">
                    <span
                      className="size-11 shrink-0 rounded-md bg-accent-subtle text-accent inline-flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-150"
                      aria-hidden
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-foreground">{c.label}</p>
                    </div>
                    <ChevronLeft
                      className="size-5 text-foreground-tertiary shrink-0 mt-0.5 group-hover:text-accent transition-colors duration-150"
                      aria-hidden
                    />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </section>
    </div>
  );
}
