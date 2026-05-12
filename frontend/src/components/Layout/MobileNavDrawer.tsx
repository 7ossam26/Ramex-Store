// DEPRECATED: replaced by src/components/AppShell/MobileDrawer in Phase 2. Removed in Phase 7.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Menu } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { ar } from '@/i18n/ar';

export type NavGroup = {
  label: string;
  /** If set, the group label itself navigates here (the section landing). */
  primaryHref?: string;
  items: Array<{ label: string; href: string }>;
};

export function MobileNavDrawer({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="lg:hidden inline-flex items-center justify-center size-11 rounded hover:bg-muted/50 -ms-2"
          aria-label={ar.mobile.menu}
        >
          <Menu className="size-6" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[85vw] max-w-sm p-0 overflow-y-auto"
        dir="rtl"
      >
        <SheetHeader className="border-b border-border px-4 py-3 ps-12">
          <SheetTitle>{ar.mobile.menu}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col">
          {groups.map((g) => {
            // Section without sub-items → render as a flat link to the landing.
            if (g.items.length === 0 && g.primaryHref) {
              return (
                <SheetClose asChild key={`flat:${g.label}:${g.primaryHref}`}>
                  <Link
                    to={g.primaryHref}
                    className="px-4 py-3 text-base font-medium border-b border-border hover:bg-muted/40"
                  >
                    {g.label}
                  </Link>
                </SheetClose>
              );
            }

            // Section with sub-items → collapsible group; the header itself
            // links to the landing if `primaryHref` is set, with a separate
            // chevron control to expand. We render the header as a Link and
            // the chevron as part of a sibling button via <details>/<summary>.
            return (
              <details
                key={`grp:${g.label}`}
                className="border-b border-border last:border-0 group"
              >
                <summary className="list-none cursor-pointer">
                  <div className="flex items-center justify-between hover:bg-muted/40">
                    {g.primaryHref ? (
                      <SheetClose asChild>
                        <Link
                          to={g.primaryHref}
                          className="flex-1 px-4 py-3 text-base font-medium"
                        >
                          {g.label}
                        </Link>
                      </SheetClose>
                    ) : (
                      <span className="flex-1 px-4 py-3 text-base font-medium">
                        {g.label}
                      </span>
                    )}
                    <span className="px-4 py-3 text-muted-foreground">
                      <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                    </span>
                  </div>
                </summary>
                <div className="flex flex-col bg-muted/20">
                  {g.items.map((i) => (
                    <SheetClose asChild key={i.href}>
                      <Link
                        to={i.href}
                        className="px-6 py-3 text-sm hover:bg-muted/60 border-t border-border/40 first:border-0"
                      >
                        {i.label}
                      </Link>
                    </SheetClose>
                  ))}
                </div>
              </details>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
