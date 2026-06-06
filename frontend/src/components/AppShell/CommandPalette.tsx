import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/permissions';
import { allLeaves } from '@/navigation/nav.config';
import type { NavLeaf } from '@/navigation/nav.config';
import { cn } from '@/lib/utils';

const RECENT_KEY = 'rmx:cmdk:recent';
const RECENT_LIMIT = 5;

// TODO Phase 7: action commands — current scope is route-navigation only.

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function normalizeAr(input: string): string {
  return input
    .toLocaleLowerCase('ar')
    .replace(/[ً-ْٰـ]/g, '') // harakat + dagger alef + tatweel
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(q: string): string[] {
  const norm = normalizeAr(q);
  if (!norm) return [];
  return norm.split(/\s+/);
}

function matches(leaf: NavLeaf, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = `${normalizeAr(leaf.labelAr)} ${normalizeAr(leaf.descAr ?? '')} ${leaf.id.toLowerCase()} ${leaf.route.toLowerCase()}`;
  return tokens.every((t) => haystack.includes(t));
}

function readRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function pushRecent(leafId: string) {
  if (typeof window === 'undefined') return;
  const current = readRecents().filter((id) => id !== leafId);
  current.unshift(leafId);
  try {
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(current.slice(0, RECENT_LIMIT)),
    );
  } catch {
    /* localStorage quota / privacy mode — silent fail */
  }
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Use a ref so the memoized leaves stay stable between renders without
  // needing `can` in the dependency array (can is redefined each render).
  const canRef = useRef(can);
  canRef.current = can;

  const leaves = useMemo(
    () => allLeaves(user?.role, (r) => canRef.current(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.role],
  );
  const leafById = useMemo(() => {
    const map = new Map<string, NavLeaf>();
    for (const leaf of leaves) map.set(leaf.id, leaf);
    return map;
  }, [leaves]);

  // Result set: when query empty → recents (resolved against current leaves);
  // otherwise → fuzzy filter.
  const { results, isRecentMode } = useMemo(() => {
    const tokens = tokenize(query);
    if (tokens.length === 0) {
      const recents = readRecents()
        .map((id) => leafById.get(id))
        .filter((leaf): leaf is NavLeaf => Boolean(leaf));
      return { results: recents, isRecentMode: true };
    }
    return { results: leaves.filter((l) => matches(l, tokens)), isRecentMode: false };
  }, [query, leaves, leafById]);

  // Reset state on open / close.
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      // Focus next tick to wait for portal mount + animation.
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Clamp selection inside result bounds.
  useEffect(() => {
    if (results.length === 0) {
      setSelectedIdx(0);
      return;
    }
    setSelectedIdx((idx) => Math.min(idx, results.length - 1));
  }, [results.length]);

  // Scroll selected row into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(
      `[data-idx="${selectedIdx}"]`,
    );
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const handleSelect = useCallback(
    (leaf: NavLeaf) => {
      pushRecent(leaf.id);
      onOpenChange(false);
      navigate(leaf.route);
    },
    [navigate, onOpenChange],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (results.length === 0) return;
        setSelectedIdx((idx) => (idx + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (results.length === 0) return;
        setSelectedIdx((idx) => (idx - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = results[selectedIdx];
        if (chosen) handleSelect(chosen);
      }
    },
    [results, selectedIdx, handleSelect],
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[1290] bg-foreground/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-[20vh] z-[1300] w-[min(600px,calc(100vw-2rem))] -translate-x-1/2',
            'bg-surface-elevated text-foreground border border-border-subtle rounded-lg shadow-xl',
            'flex flex-col max-h-[80vh] overflow-hidden',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
          dir="rtl"
          aria-label="بحث عن صفحة"
        >
          <DialogPrimitive.Title className="sr-only">
            بحث عن صفحة
          </DialogPrimitive.Title>

          <div className="flex items-center gap-2 ps-4 pe-3 py-3 border-b border-border-subtle">
            <Search className="size-5 shrink-0 text-foreground-muted" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="بحث عن صفحة..."
              aria-label="بحث عن صفحة"
              aria-autocomplete="list"
              aria-controls="cmdk-results"
              aria-activedescendant={
                results[selectedIdx] ? `cmdk-row-${results[selectedIdx].id}` : undefined
              }
              className="flex-1 bg-transparent border-0 outline-none text-base placeholder:text-foreground-tertiary"
            />
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {isRecentMode && results.length > 0 && (
              <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-foreground-tertiary font-medium">
                الأخيرة
              </div>
            )}

            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-foreground-muted">
                {query ? 'لا توجد نتائج' : 'اكتب للبحث عن صفحة'}
              </div>
            ) : (
              <ul
                ref={listRef}
                id="cmdk-results"
                role="listbox"
                aria-label="نتائج البحث"
                className="flex flex-col"
              >
                {results.map((leaf, idx) => {
                  const Icon = leaf.icon;
                  const isSelected = idx === selectedIdx;
                  return (
                    <li
                      key={leaf.id}
                      data-idx={idx}
                      role="option"
                      id={`cmdk-row-${leaf.id}`}
                      aria-selected={isSelected}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      onClick={() => handleSelect(leaf)}
                      className={cn(
                        'flex items-center gap-3 ps-4 pe-3 py-2.5 min-h-11 cursor-pointer text-sm',
                        'transition-colors duration-150',
                        isSelected
                          ? 'bg-surface-hover text-foreground'
                          : 'text-foreground hover:bg-surface-hover/60',
                      )}
                    >
                      <Icon
                        className="size-5 shrink-0 text-foreground-muted"
                        aria-hidden
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">{leaf.labelAr}</span>
                        {leaf.descAr && (
                          <span className="block text-xs text-foreground-muted truncate">
                            {leaf.descAr}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-foreground-tertiary tabular-num shrink-0">
                        {leaf.route}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-border-subtle px-4 py-2 text-[11px] text-foreground-tertiary flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 rounded bg-surface-hover border border-border-subtle">↑↓</kbd> تنقل</span>
            <span><kbd className="px-1 py-0.5 rounded bg-surface-hover border border-border-subtle">↵</kbd> فتح</span>
            <span><kbd className="px-1 py-0.5 rounded bg-surface-hover border border-border-subtle">Esc</kbd> إغلاق</span>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
