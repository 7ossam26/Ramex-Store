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
  items: Array<{ label: string; href: string }>;
};

export function MobileNavDrawer({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="lg:hidden inline-flex items-center justify-center size-11 rounded hover:bg-muted/50 -ml-2"
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
        <SheetHeader className="border-b border-border px-4 py-3 pl-12">
          <SheetTitle>{ar.mobile.menu}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col">
          <SheetClose asChild>
            <Link
              to="/"
              className="px-4 py-3 text-base font-medium border-b border-border hover:bg-muted/40"
            >
              {ar.app.name}
            </Link>
          </SheetClose>
          {groups.map((g) => (
            <details
              key={g.label}
              className="border-b border-border last:border-0 group"
            >
              <summary className="px-4 py-3 text-base font-medium cursor-pointer flex items-center justify-between hover:bg-muted/40 list-none">
                <span>{g.label}</span>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
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
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
