import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/*
 * List-page state that survives leaving the page (open a row → Back), a reload,
 * or a new tab. Stored in localStorage under one prefix so logout can wipe it
 * and the next user on the same machine starts clean.
 */

const PREFIX = 'ramex.pageState.';

function read<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — state still works in memory */
  }
}

/** Removes every persisted page state (called on logout). */
export function clearPersistedPageState() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/**
 * `useState` backed by localStorage. Values must be JSON-serialisable.
 * Changing `key` re-reads the stored value for the new key.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(() => ({ key, value: read(key, initial) }));

  // Key changed (e.g. per-tab page number) — swap in that key's value during render.
  let current = state;
  if (state.key !== key) {
    current = { key, value: read(key, initial) };
    setState(current);
  }

  useEffect(() => {
    write(current.key, current.value);
  }, [current.key, current.value]);

  const set = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setState((prev) => ({
      key: prev.key,
      value: typeof action === 'function' ? (action as (p: T) => T)(prev.value) : action,
    }));
  }, []);

  return [current.value, set];
}

/**
 * Remembers the window scroll position for `key` and restores it once `ready`
 * (the list's rows are rendered). Saving only starts after the restore, so the
 * short skeleton layout on mount can't overwrite the remembered position.
 */
export function useScrollRestoration(key: string, ready: boolean) {
  const restoredRef = useRef<string | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!ready || restoredRef.current === key) return;
    const y = read<number>(`scroll.${key}`, 0);
    const frame = requestAnimationFrame(() => {
      restoredRef.current = key;
      window.scrollTo(0, y);
      setActive(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [key, ready]);

  // Layout effect so the listener is gone before the next route's DOM can
  // shift the scroll position and get recorded as ours.
  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => write(`scroll.${key}`, Math.round(window.scrollY)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [key, active]);

  // A new key (tab switch) restores again before saving resumes.
  useLayoutEffect(() => {
    if (restoredRef.current !== key) setActive(false);
  }, [key]);
}
