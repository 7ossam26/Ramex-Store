import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* Titled section that wraps a fold (Pulse / Trends / Movers).
 * Uses a hairline divider + tracking-wider small label — calm, not loud. */
export function FoldSection({
  label,
  caption,
  children,
  divider = true,
}: {
  label: string;
  caption?: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <section className="space-y-4">
      <div
        className={cn(
          'flex items-baseline justify-between gap-3 pb-1',
          divider && 'border-t border-border-subtle pt-6',
        )}
      >
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-tertiary">
          {label}
        </h2>
        {caption && (
          <p className="text-xs text-foreground-tertiary">{caption}</p>
        )}
      </div>
      <div className="grid grid-cols-12 gap-4 lg:gap-5">{children}</div>
    </section>
  );
}
