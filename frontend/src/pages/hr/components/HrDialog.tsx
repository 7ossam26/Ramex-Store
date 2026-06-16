import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { cn } from '@/lib/utils';

/** Shared centered modal shell for all HR dialogs. Click backdrop or ✕ to close. */
export function HrDialog({
  title,
  onClose,
  children,
  maxW = 'max-w-md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxW?: string;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        dir="rtl"
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          className={cn(
            'w-full rounded-xl border border-border-subtle bg-surface-elevated shadow-xl flex flex-col max-h-[90vh]',
            maxW,
          )}
        >
          <header className="flex items-center justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              aria-label={ar.mobile.close}
              onClick={onClose}
              className="size-8 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </header>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      </div>
    </>
  );
}
