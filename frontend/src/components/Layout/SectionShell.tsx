// DEPRECATED: sub-tab navigation moved into the new shell's Flyout (Phase 2). Removed in Phase 7.
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { type SectionKey, visibleSubTabs } from './nav-config';
import { cn } from '@/lib/utils';

export function SectionShell({
  section,
  children,
}: {
  section: SectionKey;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const tabs = visibleSubTabs(section, user?.role);

  const exact = tabs.find((t) => location.pathname === t.href);
  const prefix = tabs
    .filter((t) => location.pathname.startsWith(t.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const activeTab = exact ?? prefix;
  const activeHref = activeTab?.href;

  return (
    <div className="flex flex-col min-h-full">
      {tabs.length > 0 && (
        <div className="sticky top-14 z-20 bg-canvas border-b border-border">
          <nav
            className="flex items-center gap-1 px-2 md:px-4 overflow-x-auto"
            aria-label="التبويبات الفرعية"
          >
            {tabs.map((t) => {
              const isActive = activeHref === t.href;
              return (
                <Link
                  key={t.href}
                  to={t.href}
                  className={cn(
                    'px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors cursor-pointer',
                    isActive
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-ink hover:text-primary hover:border-border',
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          {activeTab && (
            <div
              className="px-3 md:px-4 py-1.5 text-xs text-muted-foreground border-t border-border/60 truncate"
              aria-label="موقع الصفحة الحالية"
            >
              {activeTab.label}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 p-3 md:p-6">{children}</div>
    </div>
  );
}
