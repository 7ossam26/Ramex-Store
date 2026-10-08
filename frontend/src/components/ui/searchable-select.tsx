import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { matchesTokens, tokenize } from '@/lib/arabic-search';

/**
 * Drop-in replacement for a native `<select>` whose options can be searched by
 * typing. It keeps the native API — `value`, `onChange(e)` reading
 * `e.target.value`, and `<option>` children (fragments/arrays/optgroups are
 * flattened) — so a call site only swaps the tag name.
 *
 * Typing while the closed control has focus opens it with that text already
 * in the search box. Matching goes through `arabic-search`, so أ/ا, ة/ه and
 * ى/ي are folded the same way as every other search box in the app.
 */

type Opt = { value: string; label: string; disabled: boolean };

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function collectOptions(children: React.ReactNode, out: Opt[] = []): Opt[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode; value?: unknown; disabled?: boolean; hidden?: boolean }>(child)) return;
    if (child.type === 'option') {
      if (child.props.hidden) return;
      const label = textOf(child.props.children);
      out.push({
        value: child.props.value === undefined ? label : String(child.props.value),
        label,
        disabled: Boolean(child.props.disabled),
      });
    } else {
      // React.Fragment, <optgroup> or any wrapper: look inside.
      collectOptions(child.props.children, out);
    }
  });
  return out;
}

export type SearchableSelectProps = {
  value?: string | number | null;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children?: React.ReactNode;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  title?: string;
  autoFocus?: boolean;
  dir?: string;
  /** Shown when no option matches the current value. Defaults to the first option, like a native select. */
  placeholder?: string;
  searchPlaceholder?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
};

export const SearchableSelect = React.forwardRef<HTMLButtonElement, SearchableSelectProps>(
  function SearchableSelect(
    {
      value,
      onChange,
      children,
      id,
      name,
      className,
      disabled,
      required,
      title,
      autoFocus,
      dir,
      placeholder,
      searchPlaceholder = 'اكتب للبحث…',
      ...aria
    },
    forwardedRef,
  ) {
    const options = React.useMemo(() => collectOptions(children), [children]);
    const current = value === null || value === undefined ? '' : String(value);
    const selected = options.find((o) => o.value === current);
    const shown = selected ?? (placeholder === undefined ? options[0] : undefined);

    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [active, setActive] = React.useState(0);
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const listRef = React.useRef<HTMLUListElement>(null);
    const listId = React.useId();
    // Inside a Radix dialog the popover must render within the dialog: its
    // scroll lock and focus trap otherwise swallow wheel scrolling and clicks.
    const [container, setContainer] = React.useState<HTMLElement | null>(null);

    const setTriggerRef = (el: HTMLButtonElement | null) => {
      triggerRef.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    };

    const filtered = React.useMemo(() => {
      const tokens = tokenize(query);
      return options.filter((o) => matchesTokens(tokens, [o.label, o.value]));
    }, [options, query]);

    function openWith(initialQuery: string) {
      if (disabled) return;
      setContainer(triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
      setQuery(initialQuery);
      setOpen(true);
    }

    // Start on the selected option when opened without a query; on the first
    // match while typing.
    React.useEffect(() => {
      if (!open) return;
      const idx = query ? 0 : Math.max(0, filtered.findIndex((o) => o.value === current));
      setActive(idx);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, query]);

    React.useEffect(() => {
      if (!open) return;
      const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    function choose(opt: Opt | undefined) {
      if (!opt || opt.disabled) return;
      setOpen(false);
      if (opt.value === current) return;
      const target = { value: opt.value, name: name ?? '' };
      onChange?.({ target, currentTarget: target, type: 'change' } as unknown as React.ChangeEvent<HTMLSelectElement>);
    }

    function move(delta: number) {
      if (filtered.length === 0) return;
      let next = active;
      for (let i = 0; i < filtered.length; i++) {
        next = (next + delta + filtered.length) % filtered.length;
        if (!filtered[next].disabled) break;
      }
      setActive(next);
    }

    function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); move(1); break;
        case 'ArrowUp': e.preventDefault(); move(-1); break;
        case 'Home': e.preventDefault(); setActive(0); break;
        case 'End': e.preventDefault(); setActive(Math.max(0, filtered.length - 1)); break;
        case 'Enter': e.preventDefault(); choose(filtered[active]); break;
        case 'Tab': setOpen(false); break;
      }
    }

    function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
      if (open || disabled) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openWith('');
      } else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Typing on the closed control starts a search with that character.
        e.preventDefault();
        openWith(e.key);
      }
    }

    return (
      <Popover.Root open={open} onOpenChange={(o) => (o ? openWith('') : setOpen(false))}>
        <Popover.Trigger asChild>
          <button
            ref={setTriggerRef}
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-haspopup="listbox"
            aria-required={required || undefined}
            disabled={disabled}
            title={title}
            autoFocus={autoFocus}
            dir={dir}
            data-value={current}
            onKeyDown={onTriggerKeyDown}
            className={cn(
              'inline-flex h-10 min-w-[8rem] items-center justify-between gap-2 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground text-start',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
              className,
            )}
            {...aria}
          >
            <span className={cn('truncate', !shown && 'text-foreground-muted')}>
              {shown ? shown.label : placeholder}
            </span>
            <ChevronDown className="size-4 shrink-0 text-foreground-muted" aria-hidden />
          </button>
        </Popover.Trigger>
        <Popover.Portal container={container ?? undefined}>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className="z-popover w-[var(--radix-popover-trigger-width)] min-w-[12rem] max-w-[calc(100vw-1rem)] rounded-md border border-border-default bg-surface-elevated p-1 shadow-lg"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              triggerRef.current?.focus();
            }}
          >
            <div className="relative mb-1">
              <Search className="size-4 absolute top-1/2 -translate-y-1/2 start-2.5 text-foreground-tertiary pointer-events-none" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                className="h-9 w-full rounded border border-border-default bg-canvas ps-8 pe-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain">
              {filtered.length === 0 && (
                <li className="px-2 py-2 text-sm text-foreground-muted">لا توجد نتائج</li>
              )}
              {filtered.map((o, i) => {
                const isSelected = o.value === current;
                return (
                  <li
                    key={`${o.value}-${i}`}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={o.disabled || undefined}
                    onMouseMove={() => { if (active !== i) setActive(i); }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm cursor-pointer',
                      i === active && 'bg-surface-hover',
                      isSelected && 'font-medium',
                      o.disabled && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <span className="truncate">{o.label || ' '}</span>
                    {isSelected && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
