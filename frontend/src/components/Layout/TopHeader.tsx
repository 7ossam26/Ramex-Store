import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from './UserMenu';
import { MobileNavDrawer } from './MobileNavDrawer';
import {
  activeSectionForPath,
  railItems,
  visibleRailItems,
  visibleSubTabs,
} from './nav-config';
import type { NavGroup } from './MobileNavDrawer';

export function TopHeader() {
  const { user } = useAuth();
  const role = user?.role;
  const location = useLocation();

  const visibleItems = visibleRailItems(role);

  // Mobile drawer groups: each rail item is a group. Sections with sub-tabs
  // expose them inline; sections without sub-tabs render as a single link to
  // their landing path.
  const mobileGroups: NavGroup[] = visibleItems.map((item) => {
    const subs = visibleSubTabs(item.key, role);
    return {
      label: item.label,
      primaryHref: item.path,
      items: subs.length > 0 ? subs.map((s) => ({ label: s.label, href: s.href })) : [],
    };
  });

  const activeKey = activeSectionForPath(location.pathname);
  const activeItem = railItems.find((i) => i.key === activeKey);
  const isAtHub = activeItem ? location.pathname === activeItem.path : false;
  const showCategory = activeItem && activeKey !== 'home';

  return (
    <header className="h-14 bg-canvas border-b border-border flex items-center px-3 md:px-4 gap-2 md:gap-4 sticky top-0 z-30">
      <MobileNavDrawer groups={mobileGroups} />
      <Link
        to="/"
        className="size-9 rounded bg-primary text-primary-foreground inline-flex items-center justify-center font-bold cursor-pointer hover:opacity-80 transition-opacity shrink-0"
        title={ar.rail.home}
      >
        R
      </Link>
      <span className="hidden md:inline text-sm font-semibold text-ink truncate">
        {ar.app.name}
      </span>
      {showCategory && activeItem && (
        <>
          <span className="hidden md:inline h-5 w-px bg-border" aria-hidden />
          {isAtHub ? (
            <span className="text-sm md:text-base font-semibold text-ink truncate">
              {activeItem.label}
            </span>
          ) : (
            <Link
              to={activeItem.path}
              title={`${ar.rail.backToHub} ${activeItem.label}`}
              className="text-sm md:text-base font-semibold text-ink hover:text-primary transition-colors truncate cursor-pointer"
            >
              {activeItem.label}
            </Link>
          )}
        </>
      )}
      <div className="flex-1" />
      <NotificationBell />
      <UserMenu />
    </header>
  );
}
