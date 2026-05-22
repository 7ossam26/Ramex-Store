import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { activeSectionForPath, visibleNav } from '@/navigation/nav.config';
import { cn } from '@/lib/utils';

export function Rail() {
  const { user } = useAuth();
  const location = useLocation();
  const sections = useMemo(() => visibleNav(user?.role), [user?.role]);
  const activeId = activeSectionForPath(location.pathname);

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

            return (
              <div
                key={section.id}
                className="relative w-full"
              >
                <Link
                  to={section.route}
                  aria-label={section.labelAr}
                  aria-current={isActive ? 'page' : undefined}
                  data-section={section.id}
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
              </div>
            );
          })}
      </nav>
    </aside>
  );
}
