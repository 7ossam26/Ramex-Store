import type { ReactNode } from 'react';
import { TopBar } from './TopBar';
import { OfflineToast } from './OfflineToast';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <OfflineToast />
      <TopBar />
      <main className="flex-1 p-3 md:p-6">{children}</main>
    </div>
  );
}
