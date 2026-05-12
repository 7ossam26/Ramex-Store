import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  activeSectionForPath,
  hasFlyout,
  visibleNav,
} from '@/navigation/nav.config';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MobileDrawer({ open, onClose }: Props) {
  const { user } = useAuth();
  const location = useLocation();
  const sections = useMemo(() => visibleNav(user?.role), [user?.role]);
  const activeId = activeSectionForPath(location.pathname);
  const [expanded, setExpanded] = useState<string | null>(activeId);

  // Auto-close on route change: capture pathname at the moment we open, close
  // whenever it changes while still open.
  const pathOnOpen = useRef<string>('');
  useEffect(() => {
    if (open) pathOnOpen.current = location.pathname;
  }, [open]); // intentional: capture only on open transitions
  useEffect(() => {
    if (open && location.pathname !== pathOnOpen.current) onClose();
  }, [open, location.pathname, onClose]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="lg:hidden fixed inset-0 z-modal" role="dialog" aria-modal="true" aria-label="القائمة">
          <motion.button
            type="button"
            aria-label="إغلاق القائمة"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: 0.25, ease: [0, 0, 0.2, 1] },
            }}
            exit={{
              opacity: 0,
              transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
            }}
            onClick={onClose}
            className="absolute inset-0 bg-foreground/40 cursor-pointer"
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{
              x: 0,
              transition: { duration: 0.25, ease: [0, 0, 0.2, 1] },
            }}
            exit={{
              x: '100%',
              transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
            }}
            dir="rtl"
            className="absolute top-0 bottom-0 right-0 w-[80vw] max-w-[360px] bg-surface-elevated text-foreground shadow-xl flex flex-col"
          >
            <header className="h-[52px] shrink-0 flex items-center gap-2 px-3 border-b border-border-subtle">
              <img
                src="/brand/rmx-mark-dark.svg"
                alt=""
                aria-hidden
                className="h-6 w-auto"
                draggable={false}
              />
              <span className="text-sm font-semibold">رامكس ستور</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                className="size-11 inline-flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-hover transition-colors duration-150"
              >
                <X className="size-5" aria-hidden />
              </button>
            </header>

            <nav className="flex-1 overflow-y-auto" aria-label="القائمة الرئيسية">
              {sections.map((section) => {
                const isActive = activeId === section.id;
                const isExpanded = expanded === section.id;
                const hasChildren = hasFlyout(section);
                const Icon = section.icon;

                if (!hasChildren) {
                  return (
                    <Link
                      key={section.id}
                      to={section.route}
                      onClick={onClose}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 ps-4 pe-3 py-3 min-h-12 text-sm',
                        'border-b border-border-subtle/60 transition-colors duration-150',
                        isActive
                          ? 'bg-surface-active text-foreground font-semibold'
                          : 'text-foreground hover:bg-surface-hover',
                      )}
                    >
                      <Icon className="size-6 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{section.labelAr}</span>
                    </Link>
                  );
                }

                return (
                  <div key={section.id} className="border-b border-border-subtle/60">
                    <div
                      className={cn(
                        'flex items-stretch transition-colors duration-150',
                        isActive ? 'bg-surface-active' : 'hover:bg-surface-hover',
                      )}
                    >
                      <Link
                        to={section.route}
                        onClick={onClose}
                        aria-current={isActive ? 'page' : undefined}
                        className="flex-1 flex items-center gap-3 ps-4 py-3 min-h-12 text-sm text-foreground"
                      >
                        <Icon className="size-6 shrink-0" aria-hidden />
                        <span className={cn('flex-1 truncate', isActive && 'font-semibold')}>
                          {section.labelAr}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => (prev === section.id ? null : section.id))
                        }
                        aria-label={isExpanded ? 'طي' : 'فتح'}
                        aria-expanded={isExpanded}
                        className="size-12 inline-flex items-center justify-center text-foreground-muted hover:text-foreground"
                      >
                        <ChevronDown
                          className={cn(
                            'size-4 transition-transform duration-200',
                            isExpanded ? 'rotate-180' : 'rotate-0',
                          )}
                          aria-hidden
                        />
                      </button>
                    </div>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{
                            height: 'auto',
                            opacity: 1,
                            transition: { duration: 0.2, ease: [0, 0, 0.2, 1] },
                          }}
                          exit={{
                            height: 0,
                            opacity: 0,
                            transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
                          }}
                          className="overflow-hidden bg-surface"
                        >
                          {section.children?.map((group, gIdx) => (
                            <div key={gIdx}>
                              {group.groupLabelAr && (
                                <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-foreground-tertiary font-medium">
                                  {group.groupLabelAr}
                                </div>
                              )}
                              {group.items.map((item) => {
                                const ItemIcon = item.icon;
                                const itemActive = location.pathname === item.route;
                                return (
                                  <Link
                                    key={item.id}
                                    to={item.route}
                                    onClick={onClose}
                                    aria-current={itemActive ? 'page' : undefined}
                                    className={cn(
                                      'flex items-center gap-3 ps-8 pe-3 py-2.5 min-h-11 text-sm',
                                      'border-t border-border-subtle/40 transition-colors duration-150',
                                      itemActive
                                        ? 'text-accent font-semibold bg-accent-subtle/60'
                                        : 'text-foreground hover:bg-surface-hover',
                                    )}
                                  >
                                    <ItemIcon
                                      className="size-5 shrink-0 text-foreground-muted"
                                      aria-hidden
                                    />
                                    <span className="truncate">{item.labelAr}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </nav>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
