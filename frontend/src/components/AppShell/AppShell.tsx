import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { OfflineToast } from '@/components/Layout/OfflineToast';
import { Rail } from './Rail';
import { TopBar } from './TopBar';
import { Flyout } from './Flyout';
import { MobileDrawer } from './MobileDrawer';
import { CommandPalette } from './CommandPalette';
import { visibleNav } from '@/navigation/nav.config';
import type { SectionId } from '@/navigation/nav.config';
import { useAuth } from '@/lib/auth';

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [openFlyoutId, setOpenFlyoutId] = useState<SectionId | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const anchorsRef = useRef<Record<string, HTMLElement | null>>({});
  const registerAnchor = useCallback((id: SectionId, el: HTMLElement | null) => {
    anchorsRef.current[id] = el;
  }, []);

  // Global ⌘K / Ctrl+K to toggle the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isModK) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close flyout when opening drawer/palette and vice versa to avoid stacking.
  useEffect(() => {
    if (mobileDrawerOpen || paletteOpen) setOpenFlyoutId(null);
  }, [mobileDrawerOpen, paletteOpen]);

  const activeSection =
    openFlyoutId
      ? visibleNav(user?.role).find((s) => s.id === openFlyoutId) ?? null
      : null;
  const activeAnchor = openFlyoutId ? anchorsRef.current[openFlyoutId] ?? null : null;

  return (
    <div className="min-h-screen flex flex-col bg-surface text-foreground">
      <OfflineToast />
      <TopBar
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
      />

      <div className="flex-1 flex min-h-0">
        {/* Under dir="rtl" a default `flex-row` lays the first DOM child at the
            right and the second at the left — which is what we want here:
            <Rail> at the viewport's right edge, <main> filling the rest. */}
        <Rail
          openFlyoutId={openFlyoutId}
          onOpenFlyout={setOpenFlyoutId}
          onRegisterAnchor={registerAnchor}
        />
        <main className="flex-1 min-w-0 p-3 md:p-6">
          {children}
        </main>
      </div>

      <Flyout
        section={activeSection}
        anchor={activeAnchor}
        onClose={() => setOpenFlyoutId(null)}
      />

      <MobileDrawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
      />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
