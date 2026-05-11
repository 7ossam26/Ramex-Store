import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { OfflineToast } from './OfflineToast';
import { TopHeader } from './TopHeader';
import { LeftRail } from './LeftRail';
import { SectionShell } from './SectionShell';
import { activeSectionForPath } from './nav-config';

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const section = activeSectionForPath(pathname);
  const isPos = section === 'pos';

  return (
    <div className="min-h-screen flex flex-col">
      <OfflineToast />
      <TopHeader />
      <div className="flex-1 flex">
        <LeftRail />
        <main className="flex-1 min-w-0">
          {isPos ? (
            <div className="p-3 md:p-6">{children}</div>
          ) : (
            <SectionShell section={section}>{children}</SectionShell>
          )}
        </main>
      </div>
    </div>
  );
}
