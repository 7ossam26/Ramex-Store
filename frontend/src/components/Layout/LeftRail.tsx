// DEPRECATED: replaced by src/components/AppShell/Rail in Phase 2. Removed in Phase 7.
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  activeSectionForPath,
  visibleRailItems,
  visibleSubTabs,
  type RailItem,
  type SubTab,
} from './nav-config';
import { cn } from '@/lib/utils';
import { ar } from '@/i18n/ar';

const COLLAPSED_KEY = 'rail.collapsed';

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(COLLAPSED_KEY) === '1';
}

type FilteredEntry = { item: RailItem; matchedSubs: SubTab[] };

export function LeftRail() {
  const { user } = useAuth();
  const role = user?.role;
  const location = useLocation();
  const active = activeSectionForPath(location.pathname);
  const items = visibleRailItems(role);

  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [query, setQuery] = useState('');

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Collapsing hides the search affordance entirely, so clear any pending query.
  useEffect(() => {
    if (collapsed) setQuery('');
  }, [collapsed]);

  const filtered: FilteredEntry[] = useMemo(() => {
    const q = query.trim();
    if (!q) return items.map((item) => ({ item, matchedSubs: [] }));
    const needle = q.toLocaleLowerCase('ar');
    const out: FilteredEntry[] = [];
    for (const item of items) {
      const itemHit = item.label.toLocaleLowerCase('ar').includes(needle);
      const subs = visibleSubTabs(item.key, role);
      const matchedSubs = subs.filter((s) =>
        s.label.toLocaleLowerCase('ar').includes(needle),
      );
      if (itemHit || matchedSubs.length > 0) {
        out.push({ item, matchedSubs: itemHit ? [] : matchedSubs });
      }
    }
    return out;
  }, [items, role, query]);

  return (
    <aside
      className={cn(
        'hidden lg:flex shrink-0 border-e border-border bg-canvas/60 sticky top-14 h-[calc(100vh-3.5rem)] flex-col transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}
      aria-label={ar.rail.searchAria}
    >
      {!collapsed && (
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search
              className="size-4 text-muted-foreground absolute top-1/2 -translate-y-1/2 end-3 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ar.rail.searchPlaceholder}
              aria-label={ar.rail.searchAria}
              className="h-9 w-full rounded border border-border bg-canvas pe-9 ps-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={ar.mobile.close}
                className="absolute top-1/2 -translate-y-1/2 start-2 size-6 inline-flex items-center justify-center text-muted-foreground hover:text-ink cursor-pointer"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-1" aria-label="القائمة الجانبية">
        {filtered.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">{ar.rail.noResults}</p>
        )}
        {filtered.map(({ item, matchedSubs }) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <div key={item.key}>
              <Link
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 text-sm transition-colors border-e-2 cursor-pointer min-h-11',
                  collapsed ? 'justify-center px-0 py-2' : 'px-4 py-2.5',
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold border-e-primary'
                    : 'text-ink hover:bg-muted/50 border-e-transparent',
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
              {!collapsed &&
                matchedSubs.map((s) => {
                  const subActive = location.pathname === s.href;
                  return (
                    <Link
                      key={s.href}
                      to={s.href}
                      className={cn(
                        'flex items-center text-xs transition-colors ps-12 pe-4 py-2 border-e-2',
                        subActive
                          ? 'text-primary font-semibold border-e-primary/70 bg-primary/5'
                          : 'text-muted-foreground hover:text-ink hover:bg-muted/40 border-e-transparent',
                      )}
                    >
                      <span className="truncate">{s.label}</span>
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? ar.rail.expand : ar.rail.collapse}
        title={collapsed ? ar.rail.expand : ar.rail.collapse}
        className="border-t border-border h-10 inline-flex items-center justify-center text-muted-foreground hover:text-ink hover:bg-muted/40 cursor-pointer transition-colors"
      >
        {collapsed ? (
          <ChevronsLeft className="size-4" aria-hidden />
        ) : (
          <ChevronsRight className="size-4" aria-hidden />
        )}
      </button>
    </aside>
  );
}
