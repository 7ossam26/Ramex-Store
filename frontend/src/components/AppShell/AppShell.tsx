import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { OfflineToast } from '@/components/Layout/OfflineToast';
import { Rail } from './Rail';
import { TopBar } from './TopBar';
import { MobileDrawer } from './MobileDrawer';
import { CommandPalette } from './CommandPalette';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global ⌘K / Ctrl+K to toggle the palette. Skipped while the user is
  // typing into an input, textarea, or contentEditable element so the
  // shortcut doesn't steal focus mid-typing (POS / forms / Settings).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (!isModK) return;
      const t = e.target as HTMLElement | null;
      const isTyping =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t?.isContentEditable ?? false);
      if (isTyping) return;
      e.preventDefault();
      setPaletteOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        <Rail />
        <main className="flex-1 min-w-0 p-3 md:p-6">
          {children}
        </main>
      </div>

      <MobileDrawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
      />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
