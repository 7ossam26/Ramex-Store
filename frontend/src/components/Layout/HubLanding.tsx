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
  featured?: boolean;
  group?: string;
};

// Max-width is based on total visible card count (overall page width)
function resolveMaxWidth(count: number): string {
  if (count <= 1) return 'max-w-lg';
  if (count <= 2) return 'max-w-3xl';
  if (count <= 3) return 'max-w-4xl';
  if (count <= 5) return count === 4 ? 'max-w-3xl' : 'max-w-4xl';
  return 'max-w-5xl';
}

// Grid cols are based on the standard (non-featured) card count so rows are always balanced
function resolveGridCols(count: number): { cols: 1 | 2 | 3; gridCols: string } {
  if (count <= 1) return { cols: 1, gridCols: 'grid-cols-1' };
  if (count === 2) return { cols: 2, gridCols: 'grid-cols-1 sm:grid-cols-2' };
  if (count === 3) return { cols: 3, gridCols: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' };
  if (count === 4) return { cols: 3, gridCols: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' };
  if (count === 5) return { cols: 2, gridCols: 'grid-cols-1 sm:grid-cols-2' };
  if (count === 6) return { cols: 3, gridCols: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' };
  return             { cols: 3, gridCols: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' };
}

function getOrphanSpan(index: number, total: number, cols: number): string {
  return index === total - 1 && total % cols === 1 ? 'col-span-full' : '';
}

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

function FeaturedCard({ card }: { card: HubCard }) {
  const Icon = card.icon;
  return (
    <Link
      to={card.href}
      className="group flex items-center gap-4 rounded-xl border border-border-subtle border-s-4 border-s-accent bg-surface-elevated p-5 min-h-[88px] shadow-sm hover:shadow-md hover:border-border-default hover:-translate-y-0.5 transition-all duration-150 ease-decelerate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {Icon && (
        <span
          className="size-12 shrink-0 rounded-md bg-accent-subtle text-accent inline-flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-150"
          aria-hidden
        >
          <Icon className="size-6" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-lg font-semibold text-foreground">{card.label}</p>
        {card.description && (
          <p className="text-sm text-foreground-muted mt-0.5 leading-relaxed line-clamp-2">
            {card.description}
          </p>
        )}
      </div>
      <ChevronLeft
        className="size-5 text-foreground-tertiary shrink-0 group-hover:text-accent transition-colors duration-150"
        aria-hidden
      />
    </Link>
  );
}

function StandardCard({ card }: { card: HubCard }) {
  const Icon = card.icon;
  return (
    <Link
      to={card.href}
      className="group flex flex-col items-center justify-center gap-4 rounded-xl border border-border-subtle bg-surface-elevated px-6 h-[220px] shadow-sm hover:shadow-md hover:border-border-default transition-all duration-150 ease-decelerate hover:-translate-y-0.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {Icon && (
        <span
          className="size-16 shrink-0 rounded-full bg-surface-hover text-foreground-muted inline-flex items-center justify-center group-hover:bg-accent-subtle group-hover:text-accent transition-colors duration-150"
          aria-hidden
        >
          <Icon className="size-7" />
        </span>
      )}
      <div className="space-y-1.5">
        <p className="text-xl font-semibold text-foreground">{card.label}</p>
        {card.description && (
          <p className="text-sm text-foreground-muted leading-relaxed">
            {card.description}
          </p>
        )}
      </div>
    </Link>
  );
}

export function HubLanding({
  title,
  description,
  cards,
  featuredMode = 'auto',
}: {
  title: string;
  description?: string;
  cards: HubCard[];
  featuredMode?: 'auto' | 'explicit' | 'none';
}) {
  const { user } = useAuth();
  const role = user?.role;
  const visible = cards.filter((c) => !c.visibleTo || (role && c.visibleTo.includes(role)));

  // Determine which card (if any) gets featured treatment, and split the array
  let featuredCard: HubCard | null = null;
  let standardCards = visible;

  if (featuredMode !== 'none' && visible.length > 0) {
    const explicitIdx = visible.findIndex((c) => c.featured);

    if (featuredMode === 'explicit' && explicitIdx >= 0) {
      // Only promote if the explicitly-flagged card is actually visible
      featuredCard = visible[explicitIdx];
      standardCards = visible.filter((_, i) => i !== explicitIdx);
    } else if (featuredMode === 'auto') {
      if (explicitIdx >= 0) {
        // Respect explicit flag in auto mode
        featuredCard = visible[explicitIdx];
        standardCards = visible.filter((_, i) => i !== explicitIdx);
      } else if (visible.length === 1 || visible.length === 5) {
        // Auto-promote first card only when it solves the orphan/hierarchy problem
        featuredCard = visible[0];
        standardCards = visible.slice(1);
      }
    }
  }

  const maxWidth = resolveMaxWidth(visible.length);
  const { cols, gridCols } = resolveGridCols(standardCards.length);

  return (
    <div className={`space-y-6 ${maxWidth} mx-auto`}>
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
        className={`grid ${gridCols} gap-4`}
      >
        {featuredCard && (
          <motion.div key={featuredCard.href} variants={cardVariants} className="col-span-full">
            <FeaturedCard card={featuredCard} />
          </motion.div>
        )}

        {standardCards.map((c, i) => (
          <motion.div
            key={c.href}
            variants={cardVariants}
            className={getOrphanSpan(i, standardCards.length, cols)}
          >
            <StandardCard card={c} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
