import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { activeSectionForPath, hasFlyout, visibleNav } from '@/navigation/nav.config';
import type { SectionId } from '@/navigation/nav.config';
import { cn } from '@/lib/utils';

const TOOLTIP_DELAY_MS = 400;

export type RailHandle = {
  focusItem: (sectionId: SectionId) => void;
};

type Props = {
  openFlyoutId: SectionId | null;
  onOpenFlyout: (id: SectionId | null) => void;
  onRegisterAnchor?: (id: SectionId, el: HTMLElement | null) => void;
};

export const Rail = forwardRef<RailHandle, Props>(function Rail(
  { openFlyoutId, onOpenFlyout, onRegisterAnchor },
  ref,
) {
  const { user } = useAuth();
  const location = useLocation();
  const sections = useMemo(() => visibleNav(user?.role), [user?.role]);
  const activeId = activeSectionForPath(location.pathname);

  const buttonRefs = useRef<Record<string, HTMLElement | null>>({});

  useImperativeHandle(ref, () => ({
    focusItem(sectionId) {
      const el = buttonRefs.current[sectionId];
      if (el) el.focus();
    },
  }));

  return (
    <aside
      className="hidden md:flex shrink-0 w-16 bg-chrome border-e border-chrome-border sticky top-[52px] md:top-14 h-[calc(100vh-52px)] md:h-[calc(100vh-3.5rem)] flex-col items-center py-3 z-[1090]"
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

      <nav className="flex-1 flex flex-col items-center gap-1 w-full px-3">
        {sections
          .filter((s) => s.id !== 'home')
          .map((section) => {
            const isActive = activeId === section.id;
            const isOpen = openFlyoutId === section.id;
            const hasChildren = hasFlyout(section);
            const Icon = section.icon;

            const setRef = (el: HTMLElement | null) => {
              buttonRefs.current[section.id] = el;
              onRegisterAnchor?.(section.id, el);
            };

            const indicator = isActive ? (
              <motion.span
                layoutId="rail-active-indicator"
                aria-hidden
                className="absolute inset-y-1 start-0 w-0.5 rounded-sm bg-accent"
                transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              />
            ) : null;

            const baseClass = cn(
              'relative inline-flex items-center justify-center size-10 rounded-md',
              'transition-colors duration-150',
              isActive
                ? 'bg-chrome-elevated text-chrome-text'
                : 'text-chrome-text-muted hover:text-chrome-text hover:bg-chrome-elevated/70',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome',
            );

            if (hasChildren) {
              return (
                <RailTooltipWrapper key={section.id} label={section.labelAr}>
                  {({ show, hide }) => (
                    <button
                      type="button"
                      ref={setRef}
                      className={baseClass}
                      onClick={() => onOpenFlyout(isOpen ? null : section.id)}
                      onMouseEnter={show}
                      onMouseLeave={hide}
                      onFocus={show}
                      onBlur={hide}
                      aria-haspopup="menu"
                      aria-expanded={isOpen}
                      aria-controls={`flyout-${section.id}`}
                      aria-label={section.labelAr}
                      aria-current={isActive ? 'page' : undefined}
                      data-section={section.id}
                    >
                      {indicator}
                      <Icon className="size-6 shrink-0" aria-hidden />
                    </button>
                  )}
                </RailTooltipWrapper>
              );
            }

            return (
              <RailTooltipWrapper key={section.id} label={section.labelAr}>
                {({ show, hide }) => (
                  <Link
                    to={section.route}
                    ref={setRef as (el: HTMLAnchorElement | null) => void}
                    className={baseClass}
                    onMouseEnter={show}
                    onMouseLeave={hide}
                    onFocus={show}
                    onBlur={hide}
                    aria-label={section.labelAr}
                    aria-current={isActive ? 'page' : undefined}
                    data-section={section.id}
                  >
                    {indicator}
                    <Icon className="size-6 shrink-0" aria-hidden />
                  </Link>
                )}
              </RailTooltipWrapper>
            );
          })}
      </nav>
    </aside>
  );
});

type TooltipChildrenProps = { show: () => void; hide: () => void };

function RailTooltipWrapper({
  label,
  children,
}: {
  label: string;
  children: (props: TooltipChildrenProps) => ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), TOOLTIP_DELAY_MS);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setVisible(false);
  };

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return (
    <div className="relative">
      {children({ show, hide })}
      <AnimatePresence>
        {visible && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 4 }}
            transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 end-full me-2 whitespace-nowrap rounded-md bg-chrome-elevated text-chrome-text text-xs px-2 py-1 shadow-md border border-chrome-border z-[1095]"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

