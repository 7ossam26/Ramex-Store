import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  /** Search box props — omit to skip rendering the search input. */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    /** Set `ltr` for barcode/phone/code searches. Default rtl. */
    dir?: 'rtl' | 'ltr';
    /** Cap for server-side searches — the API rejects terms over 64 chars. */
    maxLength?: number;
  };
  /** Filter controls — selects, date inputs, custom widgets. Each becomes a flex item. */
  filters?: ReactNode;
  /** Total result count. Rendered trailing as "نتائج: N". */
  resultCount?: number;
  /** Optional custom right-side slot. Overrides the default resultCount renderer if set. */
  trailing?: ReactNode;
  className?: string;
};

export function TableFilterBar({ search, filters, resultCount, trailing, className }: Props) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-elevated p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3',
        className,
      )}
    >
      {search && (
        <div className="relative flex-1 min-w-0 lg:max-w-md">
          <Search
            className="size-4 absolute top-1/2 -translate-y-1/2 start-3 text-foreground-tertiary pointer-events-none"
            aria-hidden
          />
          <Input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            maxLength={search.maxLength}
            dir={search.dir ?? 'rtl'}
            className="ps-9 h-10"
          />
        </div>
      )}
      {filters && (
        <div className="flex flex-wrap items-center gap-2 lg:gap-3 flex-1 min-w-0">
          {filters}
        </div>
      )}
      <div className="flex items-center lg:ms-auto text-sm text-foreground-muted shrink-0">
        {trailing != null
          ? trailing
          : resultCount != null && (
              <span>
                نتائج: <span className="tabular-num text-foreground" dir="ltr">{resultCount}</span>
              </span>
            )}
      </div>
    </div>
  );
}
