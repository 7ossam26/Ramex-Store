import type { ReactNode } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { ar } from '@/i18n/ar';

type Props = {
  /** Filter controls — same JSX is rendered inline on desktop and inside the sheet on mobile. */
  children: ReactNode;
  /** Number of active filters; shown as a badge on the trigger. */
  activeCount?: number;
  title?: string;
  className?: string;
};

/**
 * On `<md` viewports renders a single "تصفية" trigger that opens a bottom sheet
 * containing the filter controls. On `≥md` renders the filter controls inline.
 */
export function MobileFilterSheet({ children, activeCount, title, className }: Props) {
  const label = title ?? ar.mobile.filter;
  return (
    <>
      <div className={`md:hidden ${className ?? ''}`}>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-11">
              <span className="inline-flex items-center gap-2">
                <Filter className="h-4 w-4" />
                {label}
              </span>
              {activeCount && activeCount > 0 ? (
                <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">
                  {activeCount}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{label}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 pt-3">{children}</div>
            <div className="pt-4">
              <SheetClose asChild>
                <Button className="w-full h-11">{ar.mobile.apply}</Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className={`hidden md:block ${className ?? ''}`}>{children}</div>
    </>
  );
}
