import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  Palette,
  UserSquare,
  FileClock,
  TrendingUp,
  Landmark,
  Receipt,
  AlertOctagon,
  CreditCard,
  ShieldCheck,
  ChevronLeft,
  RotateCcw,
  Warehouse,
  Clock4,
  PackageSearch,
  Banknote,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { ar } from '@/i18n/ar';
import { PageHeader } from '@/components/PageHeader';

type SecondaryCard = {
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
};

type Section = {
  heading: string;
  cards: SecondaryCard[];
};

const sections: Section[] = [
  {
    heading: ar.hubs.reportsSalesSection,
    cards: [
      { label: ar.reports.salesByFabricColor, desc: ar.reports.salesByFabricColorDesc, href: '/reports/secondary/salesByFabricColor', icon: Palette },
      { label: ar.reports.salesByPaymentMethod, desc: ar.reports.salesByPaymentMethodDesc, href: '/reports/secondary/salesByPaymentMethod', icon: CreditCard },
      { label: ar.reports.outstandingOpenInvoices, desc: ar.reports.outstandingOpenInvoicesDesc, href: '/reports/secondary/outstandingOpenInvoices', icon: FileClock },
      { label: ar.reports.customerLedger, desc: ar.reports.customerLedgerDesc, href: '/reports/secondary/customerLedger', icon: UserSquare },
      { label: ar.reports.returnsReport, desc: ar.reports.returnsReportDesc, href: '/reports/secondary/returnsReport', icon: RotateCcw },
    ],
  },
  {
    heading: ar.hubs.reportsInventorySection,
    cards: [
      { label: ar.reports.stockByWarehouse, desc: ar.reports.stockByWarehouseDesc, href: '/reports/secondary/stockByWarehouse', icon: Warehouse },
      { label: ar.reports.agingInventory, desc: ar.reports.agingInventoryDesc, href: '/reports/secondary/agingInventory', icon: Clock4 },
      { label: ar.reports.shipmentsSummary, desc: ar.reports.shipmentsSummaryDesc, href: '/reports/secondary/shipmentsSummary', icon: PackageSearch },
      { label: ar.reports.damageLoss, desc: ar.reports.damageLossDesc, href: '/reports/secondary/damageLoss', icon: AlertOctagon },
    ],
  },
  {
    heading: ar.hubs.reportsTreasurySection,
    cards: [
      { label: ar.reports.cashFlow, desc: ar.reports.cashFlowDesc, href: '/reports/secondary/cashFlow', icon: TrendingUp },
      { label: ar.reports.bankReconciliation, desc: ar.reports.bankReconciliationDesc, href: '/reports/secondary/bankReconciliation', icon: Landmark },
      { label: ar.reports.expenses, desc: ar.reports.expensesDesc, href: '/reports/secondary/expenses', icon: Receipt },
      { label: ar.reports.outstandingCheques, desc: ar.reports.outstandingChequesDesc, href: '/reports/secondary/outstandingCheques', icon: Banknote },
    ],
  },
  {
    heading: ar.hubs.reportsHrSection,
    cards: [
      { label: ar.reports.payrollSummary, desc: ar.reports.payrollSummaryDesc, href: '/reports/secondary/payrollSummary', icon: Wallet },
      { label: ar.reports.hrAdjustments, desc: ar.reports.hrAdjustmentsDesc, href: '/reports/secondary/hrAdjustments', icon: Users },
    ],
  },
  {
    heading: ar.hubs.reportsSystemSection,
    cards: [
      { label: ar.reports.auditLog, desc: ar.reports.auditLogDesc, href: '/reports/secondary/auditLog', icon: ShieldCheck },
    ],
  },
];

const sectionVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0, 0, 0.2, 1] as const },
  },
};

export function ReportsHubPage() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <PageHeader
        title={ar.hubs.reportsTitle}
        description={ar.hubs.reportsDescription}
      />

      {/* Featured daily report card */}
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

      {/* Grouped sections */}
      {sections.map((section, si) => (
        <section key={section.heading} className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            {section.heading}
          </h2>
          <motion.div
            variants={sectionVariants}
            initial="hidden"
            animate="show"
            style={{ ['--delay' as string]: `${si * 0.04}s` }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {section.cards.map((c) => {
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
                        <p className="text-xs text-foreground-muted mt-0.5 leading-relaxed line-clamp-2">{c.desc}</p>
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
      ))}
    </div>
  );
}
