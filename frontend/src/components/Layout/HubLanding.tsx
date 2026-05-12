import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/auth';

export type HubCard = {
  label: string;
  description?: string;
  href: string;
  icon?: LucideIcon;
  visibleTo?: Role[];
};

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

export function HubLanding({
  title,
  description,
  cards,
}: {
  title: string;
  description?: string;
  cards: HubCard[];
}) {
  const { user } = useAuth();
  const role = user?.role;
  const visible = cards.filter((c) => !c.visibleTo || (role && c.visibleTo.includes(role)));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header>
        <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-foreground-muted mt-1">{description}</p>
        )}
      </header>

      <motion.div
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {visible.map((c) => {
          const Icon = c.icon;
          return (
            <motion.div key={c.href} variants={cardVariants}>
              <Link
                to={c.href}
                className="group block rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm hover:shadow-md hover:border-border-default transition-all duration-150 ease-decelerate hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex items-start gap-4">
                  {Icon && (
                    <span
                      className="size-11 shrink-0 rounded-md bg-accent-subtle text-accent inline-flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-150"
                      aria-hidden
                    >
                      <Icon className="size-5" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground">{c.label}</p>
                    {c.description && (
                      <p className="text-sm text-foreground-muted mt-1 leading-relaxed">
                        {c.description}
                      </p>
                    )}
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
    </div>
  );
}
