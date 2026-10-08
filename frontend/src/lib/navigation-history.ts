import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom';

/*
 * In-app Back navigation.
 *
 * React Router gives every history entry a stable `location.key` (kept in
 * `history.state`, so it survives a reload). We record, per entry, the in-app
 * location the user came from. A Back button then:
 *   - goes `navigate(-1)` when that predecessor exists — the real browser
 *     entry, so query string / filters / pagination come back exactly and
 *     browser Forward keeps working;
 *   - otherwise (direct URL entry, new tab) replaces the current entry with a
 *     parent-route fallback. Replacing (not pushing) means the fallback page
 *     has no predecessor either, so repeated Back walks *up* instead of
 *     ping-ponging between two pages.
 */

const STORAGE_KEY = 'ramex.navPrev';
const MAX_ENTRIES = 200;
/** Never send Back into the auth flow. */
const EXCLUDED_PREFIXES = ['/login', '/change-password'];

type PrevMap = Record<string, string>;

let prevByKey: PrevMap = load();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function load(): PrevMap {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as PrevMap) : {};
  } catch {
    return {};
  }
}

function save() {
  const keys = Object.keys(prevByKey);
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete prevByKey[k];
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prevByKey));
  } catch {
    /* storage unavailable — in-memory map still works for this page load */
  }
  listeners.forEach((l) => l());
}

function toPath(loc: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
  return `${loc.pathname}${loc.search}${loc.hash}`;
}

/** In-app path of the entry the user arrived at `key` from, or null. */
export function getPreviousPath(key: string): string | null {
  const prev = prevByKey[key];
  if (!prev) return null;
  const pathname = prev.split(/[?#]/)[0] ?? '';
  if (EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return prev;
}

/** Test-only: reset the recorded history. */
export function resetNavigationHistory() {
  prevByKey = {};
  listeners.forEach((l) => l());
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Mount once, inside the router (see App.tsx). */
export function useNavigationTracker() {
  const location = useLocation();
  const navType = useNavigationType();
  const lastRef = useRef<Location | null>(null);

  // Layout effect: record before paint so Back links rendered for this entry
  // pick up their href in the same frame.
  useLayoutEffect(() => {
    const last = lastRef.current;
    lastRef.current = location;
    if (!last || last.key === location.key) return;
    if (navType === 'PUSH') {
      prevByKey[location.key] = toPath(last);
      save();
    } else if (navType === 'REPLACE') {
      const inherited = prevByKey[last.key];
      if (inherited) {
        prevByKey[location.key] = inherited;
        save();
      }
    }
    // POP: Back/Forward onto an entry that was already recorded.
  }, [location, navType]);
}

/**
 * `previousPath` — where Back will go when there is in-app history (null otherwise).
 * `goBack()` — navigate(-1) if possible, else replace with `fallback` (no-op without one).
 */
export function useBackNavigation(fallback?: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const previousPath = useSyncExternalStore(subscribe, () => getPreviousPath(location.key));

  const goBack = useCallback(() => {
    if (getPreviousPath(location.key)) navigate(-1);
    else if (fallback) navigate(fallback, { replace: true });
  }, [location.key, navigate, fallback]);

  return { previousPath, goBack };
}
