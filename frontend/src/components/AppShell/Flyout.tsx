import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import type { NavTop } from '@/navigation/nav.config';
import { cn } from '@/lib/utils';

type Props = {
  section: NavTop | null;
  anchor: HTMLElement | null;
  onClose: () => void;
};

const WIDTH_PX = 320;
const RAIL_WIDTH_PX = 64;

export function Flyout({ section, anchor, onClose }: Props) {
  const location = useLocation();
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const firstItemRef = useRef<HTMLAnchorElement | null>(null);
  const [position, setPosition] = useState<{ top: number } | null>(null);

  const lastPathnameOnOpen = useRef(location.pathname);

  // Recalculate vertical position whenever the anchor changes / on resize.
  // Note: pathname is NOT in this effect's deps — capturing pathname here
  // would defeat the route-change-close check below.
  useLayoutEffect(() => {
    if (!section || !anchor) {
      setPosition(null);
      return;
    }
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const top = Math.max(8, rect.top);
      setPosition({ top });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [section, anchor]);

  // Capture the pathname only when the flyout opens for a section — keyed on
  // section?.id so a fresh "opened" pathname is stored once per open cycle.
  useEffect(() => {
    if (!section) return;
    lastPathnameOnOpen.current = location.pathname;
    // We intentionally do NOT depend on location.pathname — that's the whole
    // point: capture once on open, then let the close effect react to drift.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section?.id]);

  // Auto-close on route change (when the user navigates via a leaf inside the
  // flyout, programmatic nav, browser back, or anywhere else in the app).
  useEffect(() => {
    if (!section) return;
    if (location.pathname !== lastPathnameOnOpen.current) {
      onClose();
    }
  }, [section, location.pathname, onClose]);

  // ESC + outside-click dismiss.
  useEffect(() => {
    if (!section) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        // Return focus to the anchor for keyboard users.
        anchor?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(target) &&
        anchor &&
        !anchor.contains(target)
      ) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [section, anchor, onClose]);

  // Focus first row on open.
  useEffect(() => {
    if (!section) return;
    // Defer to next paint so the row is mounted.
    const t = window.setTimeout(() => firstItemRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [section]);

  const items = useMemo(() => {
    if (!section?.children) return [];
    const flat: { groupIdx: number; itemIdx: number; isFirstInGroup: boolean; group: typeof section.children[number]; item: typeof section.children[number]['items'][number] }[] = [];
    section.children.forEach((group, groupIdx) => {
      group.items.forEach((item, itemIdx) => {
        flat.push({
          groupIdx,
          itemIdx,
          isFirstInGroup: itemIdx === 0,
          group,
          item,
        });
      });
    });
    return flat;
  }, [section]);

  const handleRowKey = useCallback(
    (e: ReactKeyboardEvent<HTMLAnchorElement>, isFirst: boolean, isLast: boolean) => {
      if (e.key === 'Tab' && e.shiftKey && isFirst) {
        e.preventDefault();
        onClose();
        anchor?.focus();
      } else if (e.key === 'Tab' && !e.shiftKey && isLast) {
        // Symmetric with Shift+Tab from the first row: return focus to the
        // opening rail icon instead of leaking into the page content beyond.
        e.preventDefault();
        onClose();
        anchor?.focus();
      }
    },
    [anchor, onClose],
  );

  return (
    <AnimatePresence>
      {section && position && (
        <motion.div
          ref={flyoutRef}
          id={`flyout-${section.id}`}
          role="menu"
          aria-label={section.labelAr}
          dir="rtl"
          initial={{ opacity: 0, x: 8 }}
          animate={{
            opacity: 1,
            x: 0,
            transition: { duration: 0.2, ease: [0, 0, 0.2, 1] },
          }}
          exit={{
            opacity: 0,
            x: 8,
            transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
          }}
          style={{
            top: position.top,
            // Anchored to the LEFT edge of the rail. Rail is at the viewport's
            // right edge (64px), so physical `right: 64px` is direction-stable
            // here regardless of dir. Logical `inset-inline-end` flips under RTL
            // and would put the flyout on the wrong side.
            right: `${RAIL_WIDTH_PX}px`,
            width: `min(${WIDTH_PX}px, calc(100vw - ${RAIL_WIDTH_PX}px))`,
            maxHeight: `calc(100vh - ${position.top}px - 1rem)`,
          }}
          className="fixed z-[1099] flex flex-col bg-surface-elevated text-foreground rounded-lg shadow-xl border border-border-subtle overflow-hidden"
        >
          <header className="px-4 py-3 border-b border-border-subtle shrink-0">
            <h2 className="text-base font-semibold text-foreground">
              {section.labelAr}
            </h2>
            {section.descAr && (
              <p className="mt-0.5 text-xs text-foreground-muted truncate">
                {section.descAr}
              </p>
            )}
          </header>

          <div className="flex-1 overflow-y-auto py-1 min-h-0">
            {section.children?.map((group, groupIdx) => (
              <div key={groupIdx} className="py-1">
                {group.groupLabelAr && (
                  <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-foreground-tertiary font-medium">
                    {group.groupLabelAr}
                  </div>
                )}
                <ul role="none" className="flex flex-col">
                  {group.items.map((item) => {
                    const flatIdx = items.findIndex(
                      (f) => f.item.id === item.id && f.groupIdx === groupIdx,
                    );
                    const isFirst = flatIdx === 0;
                    const isLast = flatIdx === items.length - 1;
                    const Icon = item.icon;
                    return (
                      <li role="none" key={item.id}>
                        <Link
                          to={item.route}
                          role="menuitem"
                          ref={isFirst ? firstItemRef : undefined}
                          onClick={onClose}
                          onKeyDown={(e) => handleRowKey(e, isFirst, isLast)}
                          className={cn(
                            'group flex items-center gap-3 ps-4 pe-3 py-2.5 min-h-11 text-sm',
                            'text-foreground hover:bg-surface-hover transition-colors duration-150',
                            'focus-visible:outline-none focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                          )}
                        >
                          <Icon
                            className="size-6 shrink-0 text-foreground-muted group-hover:text-foreground"
                            aria-hidden
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block font-medium truncate">
                              {item.labelAr}
                            </span>
                            {item.descAr && (
                              <span className="block text-xs text-foreground-muted truncate">
                                {item.descAr}
                              </span>
                            )}
                          </span>
                          <ChevronLeft
                            className="size-4 shrink-0 text-foreground-tertiary group-hover:text-foreground-muted"
                            aria-hidden
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
