import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/auth';

export type HubCard = {
  label: string;
  description?: string;
  href: string;
  icon?: LucideIcon;
  visibleTo?: Role[];
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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              to={c.href}
              className="group block rounded-md border border-border bg-canvas p-4 hover:border-primary hover:shadow-sm transition"
            >
              <div className="flex items-start gap-3">
                {Icon && (
                  <span className="size-9 rounded bg-muted/50 inline-flex items-center justify-center text-primary group-hover:bg-primary/10 transition-colors shrink-0">
                    <Icon className="size-5" aria-hidden />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{c.label}</p>
                  {c.description && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {c.description}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
