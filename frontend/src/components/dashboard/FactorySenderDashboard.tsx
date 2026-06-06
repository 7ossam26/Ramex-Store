import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Package, Send } from 'lucide-react';

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0, 0, 0.2, 1] as const } },
};

const ACTIONS = [
  {
    key: 'add-top',
    label: 'إضافة توب',
    href: '/items/tops/add',
    Icon: Package,
    accent: 'bg-accent text-accent-foreground hover:opacity-90',
  },
  {
    key: 'new-shipment',
    label: 'إنشاء طلبية',
    href: '/shipments/create',
    Icon: Send,
    accent: 'bg-surface-elevated text-foreground border border-border hover:bg-surface-hover',
  },
] as const;

export function FactorySenderDashboard() {
  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4"
      dir="rtl"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
    >
      {ACTIONS.map(({ key, label, href, Icon, accent }) => (
        <motion.div key={key} variants={cardVariants} className="w-full max-w-sm">
          <Link
            to={href}
            className={`flex items-center justify-center gap-3 w-full rounded-2xl px-8 py-10 text-2xl font-bold shadow-sm transition-all duration-150 ${accent}`}
          >
            <Icon className="size-7 shrink-0" aria-hidden />
            {label}
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
