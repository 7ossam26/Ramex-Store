import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/permissions';
import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/Layout/UserMenu';
import { pageTitleForPath } from '@/navigation/nav.config';

function detectIsMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const p = navigator.platform || '';
  const ua = navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/.test(p) || /Macintosh/.test(ua);
}

type Props = {
  onOpenCommandPalette: () => void;
  onOpenMobileDrawer: () => void;
};

export function TopBar({ onOpenCommandPalette, onOpenMobileDrawer }: Props) {
  const { user } = useAuth();
  const { canSee } = usePermissions();
  const location = useLocation();
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(detectIsMac());
  }, []);

  const title = pageTitleForPath(location.pathname, user?.role, canSee);
  const shortcut = isMac ? '⌘K' : 'Ctrl+K';

  return (
    <header
      className="bg-chrome text-chrome-text border-b border-chrome-border sticky top-0 z-sticky h-[52px] md:h-14 flex items-center px-3 md:px-4 gap-2 md:gap-4"
      role="banner"
    >
      {/* RTL leading edge (right) — DOM order is right-to-left under dir="rtl".
          Gated at md:hidden (not lg:hidden) so 768–1023px tablets that already
          show the rail don't also see a redundant hamburger. */}
      <button
        type="button"
        onClick={onOpenMobileDrawer}
        className="md:hidden inline-flex items-center justify-center size-11 -ms-2 rounded-md text-chrome-text hover:bg-chrome-elevated transition-colors duration-150"
        aria-label="فتح القائمة"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <Link
        to="/"
        className="inline-flex items-center gap-2 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
        title="رامكس ستور"
      >
        <img
          src="/brand/rmx-mark-light.svg"
          alt=""
          aria-hidden
          className="h-6 md:h-7 w-auto select-none"
          draggable={false}
        />
        <span className="sr-only">RMX</span>
      </Link>

      <span
        className="hidden md:inline-block h-5 w-px bg-chrome-border"
        aria-hidden
      />

      <span className="hidden md:inline text-sm font-semibold text-chrome-text truncate">
        رامكس ستور
      </span>

      {title && (
        <>
          <span
            className="hidden md:inline-block h-5 w-px bg-chrome-border"
            aria-hidden
          />
          <div className="relative min-w-0 flex-1 md:flex-initial overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={title}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
                className="text-sm md:text-base font-medium text-chrome-text truncate block"
              >
                {title}
              </motion.span>
            </AnimatePresence>
          </div>
        </>
      )}

      <div className="hidden md:block flex-1" />

      {/* RTL trailing edge (left) */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="hidden md:inline-flex items-center gap-2 ps-3 pe-2 h-9 rounded-md bg-chrome-elevated/60 hover:bg-chrome-elevated border border-chrome-border text-chrome-text-muted hover:text-chrome-text transition-colors duration-150 text-sm"
        aria-label="بحث عن صفحة"
        aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
      >
        <Search className="size-4" aria-hidden />
        <span className="text-xs">بحث عن صفحة…</span>
        <kbd
          className="ms-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-chrome border border-chrome-border text-chrome-text-muted tabular-num"
          aria-hidden
        >
          {shortcut}
        </kbd>
      </button>

      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="md:hidden inline-flex items-center justify-center size-11 rounded-md text-chrome-text hover:bg-chrome-elevated transition-colors duration-150"
        aria-label="بحث عن صفحة"
      >
        <Search className="size-5" aria-hidden />
      </button>

      <div className="text-chrome-text">
        <NotificationBell />
      </div>

      <div className="text-chrome-text">
        <UserMenu />
      </div>
    </header>
  );
}
