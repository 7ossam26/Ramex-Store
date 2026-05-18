import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { activeSectionForPath, visibleNav } from '@/navigation/nav.config';
import { cn } from '@/lib/utils';

export function Rail() {
  const { user } = useAuth();
  const location = useLocation();
  const sections = useMemo(() => visibleNav(user?.role), [user?.role]);
  const activeId = activeSectionForPath(location.pathname);

  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    setOpenId(null);
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpenId(null), 250);
  };
  const open = (id: string) => {
    cancelClose();
    setOpenId(id);
  };

  return (
    <aside
      className="hidden md:flex shrink-0 w-20 bg-chrome border-e border-chrome-border sticky top-[52px] md:top-14 h-[calc(100vh-52px)] md:h-[calc(100vh-3.5rem)] flex-col items-center py-3 z-[1090]"
      aria-label="القائمة الرئيسية"
      role="navigation"
    >
      <Link
        to="/"
        className="size-10 rounded-md flex items-center justify-center mb-3 text-chrome-text hover:bg-chrome-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
        aria-label="الرئيسية"
      >
        <img
          src="/brand/rmx-icon-light.svg"
          alt=""
          aria-hidden
          className="size-8"
          draggable={false}
        />
      </Link>

      <nav className="flex-1 flex flex-col items-center gap-0.5 w-full px-2">
        {sections
          .filter((s) => s.id !== 'home')
          .map((section) => {
            const isActive = activeId === section.id;
            const Icon = section.icon;
            const hasChildren = !!section.children?.length;
            const isOpen = openId === section.id;

            return (
              <div
                key={section.id}
                className="relative w-full"
                onMouseEnter={() => hasChildren && open(section.id)}
                onMouseLeave={() => hasChildren && scheduleClose()}
              >
                <Link
                  to={section.route}
                  aria-label={section.labelAr}
                  aria-current={isActive ? 'page' : undefined}
                  aria-haspopup={hasChildren ? 'menu' : undefined}
                  aria-expanded={hasChildren ? isOpen : undefined}
                  data-section={section.id}
                  onFocus={() => hasChildren && open(section.id)}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-0.5 w-full py-1.5 px-1 rounded-md',
                    'transition-colors duration-150',
                    isActive
                      ? 'bg-chrome-elevated text-chrome-text'
                      : 'text-chrome-text-muted hover:text-chrome-text hover:bg-chrome-elevated/70',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="rail-active-indicator"
                      aria-hidden
                      className="absolute inset-y-1 start-0 w-0.5 rounded-sm bg-accent"
                      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                    />
                  )}
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className="text-[9px] leading-none text-center">{section.labelAr}</span>
                </Link>

                <AnimatePresence>
                  {hasChildren && isOpen && (
                    <motion.div
                      role="menu"
                      aria-label={section.labelAr}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
                      className="absolute right-full top-0 w-60 bg-surface-elevated text-foreground rounded-md border border-border-default shadow-lg z-[1095] py-1"
                    >
                      <div className="px-3 py-2 text-xs font-semibold text-foreground-muted border-b border-border-subtle flex items-center justify-between gap-2">
                        <span className="truncate">{section.labelAr}</span>
                        <Link
                          to={section.route}
                          onClick={() => setOpenId(null)}
                          className="text-[11px] text-accent hover:text-accent-hover inline-flex items-center gap-0.5"
                        >
                          <span>الكل</span>
                          <ChevronLeft className="size-3" aria-hidden />
                        </Link>
                      </div>
                      {section.children!.map((group, gi) => (
                        <div key={gi} className={gi > 0 ? 'border-t border-border-subtle/60 mt-1 pt-1' : ''}>
                          {group.groupLabelAr && (
                            <div className="px-3 py-1 text-[11px] text-foreground-muted">
                              {group.groupLabelAr}
                            </div>
                          )}
                          {group.items.map((leaf) => {
                            const LeafIcon = leaf.icon;
                            const isCurrent =
                              location.pathname === leaf.route ||
                              location.pathname.startsWith(leaf.route + '/');
                            return (
                              <Link
                                key={leaf.id}
                                to={leaf.route}
                                role="menuitem"
                                onClick={() => setOpenId(null)}
                                className={cn(
                                  'flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150',
                                  isCurrent
                                    ? 'bg-surface-active text-foreground font-medium'
                                    : 'text-foreground hover:bg-surface-hover',
                                )}
                              >
                                <LeafIcon className="size-4 shrink-0 text-foreground-muted" aria-hidden />
                                <span className="truncate">{leaf.labelAr}</span>
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
    </aside>
  );
}
