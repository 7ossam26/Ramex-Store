import { motion } from 'framer-motion';
import { ar } from '@/i18n/ar';
import { useAuth } from '@/lib/auth';
import { isOwnerOrAbove } from '@/lib/roles';
import { OwnerDashboard, SellerDashboard } from '@/components/dashboard';

/* Role-aware landing.
 *   owner          → rich 3-fold analytics dashboard
 *   shop_seller    → slim "shift at a glance"
 *   factory_sender → minimal module grid (existing behavior, untouched) */
export function HomePage() {
  const { user } = useAuth();
  const role = user?.role;

  if (isOwnerOrAbove(role)) return <OwnerDashboard />;
  if (role === 'shop_seller') return <SellerDashboard />;
  return <FactorySenderLanding />;
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

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0, 0, 0.2, 1] as const } },
};

function FactorySenderLanding() {
  return (
    <div className="space-y-6" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-foreground">{ar.home.welcome}</h1>
        <p className="text-sm text-foreground-muted">{ar.home.ownerWidgets}</p>
      </header>
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
    </div>
  );
}
