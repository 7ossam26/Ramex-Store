import { useEffect, useState } from 'react';

/**
 * Trails `value` by `delayMs`, so a search box that feeds a server query fires
 * one request per pause instead of one per keystroke.
 *
 * Only for values that reach the network — client-side filters should stay
 * instant. Pair with `placeholderData: keepPreviousData` on the query, or the
 * table blanks to a skeleton on every tick.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
