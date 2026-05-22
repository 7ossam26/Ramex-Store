import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  Palette,
  AlertOctagon,
  ShieldCheck,
  ChevronLeft,
  Warehouse,
  Clock4,
  PackageSearch,
  type LucideIcon,
} from 'lucide-react';
import { ar } from '@/i18n/ar';
import { PageHeader } from '@/components/PageHeader';

type ReportCard = {
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  featured?: boolean;
};

type Section = {
  heading: string;
  cards: ReportCard[];
};

const sections: Section[] = [
  {
    heading: 'الرئيسية',
    cards: [
      {
        label: ar.reports.daily,
        desc: ar.hubs.reportsDailyDesc,
        href: '/reports/daily',
        icon: CalendarClock,
        featured: true,
      },
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
    heading: ar.hubs.reportsSalesSection,
    cards: [
      { label: ar.reports.salesByFabricColor, desc: ar.reports.salesByFabricColorDesc, href: '/reports/secondary/salesByFabricColor', icon: Palette },
    ],
  },
  {
    heading: ar.hubs.reportsSystemSection,
    cards: [
      { label: ar.reports.auditLog, desc: ar.reports.auditLogDesc, href: '/reports/secondary/auditLog', icon: ShieldCheck },
    ],
  },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0, 0, 0.2, 1] as const } },
};

function ReportCardLink({ card }: { card: ReportCard }) {
  const Icon = card.icon;
  return (
    <motion.div variants={cardVariants}>
      <Link
        to={card.href}
        className={[
          'group flex items-start gap-4 rounded-xl border bg-surface-elevated p-5 shadow-sm',
          'hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ease-decelerate',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          card.featured
            ? 'border-border-subtle border-s-4 border-s-accent'
            : 'border-border-subtle',
        ].join(' ')}
      >
        <span
          className="size-11 shrink-0 rounded-lg bg-accent-subtle text-accent inline-flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-150"
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className={['font-semibold text-foreground', card.featured ? 'text-lg' : 'text-base'].join(' ')}>
            {card.label}
          </p>
          <p className="text-sm text-foreground-muted mt-0.5 leading-relaxed line-clamp-2">{card.desc}</p>
        </div>
        <ChevronLeft
          className="size-5 text-foreground-tertiary shrink-0 mt-0.5 group-hover:text-accent transition-colors duration-150"
          aria-hidden
        />
      </Link>
    </motion.div>
  );
}

export function ReportsHubPage() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <PageHeader title={ar.hubs.reportsTitle} description={ar.hubs.reportsDescription} />

      {sections.map((section, si) => (
        <section key={section.heading} className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground-muted">{section.heading}</h2>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{ ['--section-delay' as string]: `${si * 0.05}s` }}
            className={
              section.cards.length === 1
                ? 'grid grid-cols-1'
                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4'
            }
          >
            {section.cards.map((c) => (
              <ReportCardLink key={c.href} card={c} />
            ))}
          </motion.div>
        </section>
      ))}
    </div>
  );
}
