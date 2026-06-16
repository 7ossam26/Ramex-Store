import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ar } from '@/i18n/ar';

/**
 * Connectivity guard module.
 *
 * The store is online-only (CORE_PLAN §10.7). This module is the single source
 * of truth for "are we connected to the backend right now?" and renders a
 * full-screen blocking overlay whenever we are not — the whole app (including
 * login) is locked until the connection returns.
 *
 * Two signals are combined:
 *   1. The browser's online/offline events — instant, but only reflect the
 *      network interface. `navigator.onLine` reports "online" on a router with
 *      no real internet, and never notices a dead backend.
 *   2. An active heartbeat against `GET /api/health` — this is what actually
 *      catches "connected to wifi but no internet" and "server down". The
 *      endpoint is public (no auth), so the heartbeat works on the login page.
 */

/** Poll cadence while we believe we're online. */
const HEARTBEAT_MS = 10_000;
/** Tighter cadence while offline so we recover quickly once the link returns. */
const HEARTBEAT_RETRY_MS = 4_000;
/** Abort a hung health request rather than hang the "checking" state forever. */
const PING_TIMEOUT_MS = 5_000;
/** Consecutive heartbeat failures required before we block. Tolerates a single
 *  transient blip / server restart so the full-screen block never flashes up
 *  spuriously. The browser's `offline` event still blocks immediately. */
const FAILURE_THRESHOLD = 2;

export interface Connectivity {
  online: boolean;
  /** True while a heartbeat request is in flight (drives the "retrying…" hint). */
  checking: boolean;
  /** Force an immediate health check (the overlay's "retry now" button). */
  recheck: () => void;
}

const Ctx = createContext<Connectivity>({
  online: true,
  checking: false,
  recheck: () => {},
});

/**
 * Resolves `true` when the backend is *reachable*, and `false` only when the
 * request fails to complete (network down, DNS failure, timeout/abort,
 * connection refused).
 *
 * Any HTTP response — including 5xx — counts as reachable. A 503 means the
 * server answered (e.g. a transient DB blip): that's a backend-health problem,
 * NOT a loss of internet, so it must never trigger the offline block.
 */
export async function pingHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [checking, setChecking] = useState(false);

  // Latest `online` value, readable inside the polling loop without making the
  // effect re-subscribe on every status change.
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const inFlight = useRef(false);
  const mountedRef = useRef(true);
  const failuresRef = useRef(0);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    // NIC is down — a definitive signal, block immediately.
    if (!navigator.onLine) {
      failuresRef.current = 0;
      setOnline(false);
      return;
    }
    inFlight.current = true;
    setChecking(true);
    const reachable = await pingHealth();
    inFlight.current = false;
    if (!mountedRef.current) return;
    setChecking(false);
    if (reachable) {
      failuresRef.current = 0;
      setOnline(true);
    } else {
      // Block only after repeated failures, so a single blip / server restart
      // doesn't flash the overlay. Once blocked we keep polling for recovery.
      failuresRef.current += 1;
      if (failuresRef.current >= FAILURE_THRESHOLD) setOnline(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Self-scheduling loop (not setInterval) so the cadence can tighten while
    // offline and a request can never overlap the next tick.
    const loop = async () => {
      await check();
      if (cancelled) return;
      // Poll faster while anything looks wrong (offline, or a failure pending
      // confirmation) so we both confirm an outage and recover from it quickly.
      const healthy = onlineRef.current && failuresRef.current === 0;
      timer = setTimeout(loop, healthy ? HEARTBEAT_MS : HEARTBEAT_RETRY_MS);
    };
    void loop();

    const onBrowserOffline = () => setOnline(false);
    const onBrowserOnline = () => void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('offline', onBrowserOffline);
    window.addEventListener('online', onBrowserOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener('offline', onBrowserOffline);
      window.removeEventListener('online', onBrowserOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  return (
    <Ctx.Provider value={{ online, checking, recheck: check }}>
      {children}
    </Ctx.Provider>
  );
}

export const useConnectivity = () => useContext(Ctx);

/** Convenience boolean hook for call sites that only need online/offline. */
export const useOnline = () => useContext(Ctx).online;

function WifiOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <path d="M5 13a10 10 0 0 1 5.24-2.76" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

/**
 * Full-screen blocking overlay. Renders nothing while online; while offline it
 * covers the entire app (above every other layer) and locks background scroll.
 * Place it once, high in the tree, as a sibling of the app root.
 */
export function ConnectivityGate() {
  const { online, checking, recheck } = useConnectivity();

  // Lock background scroll while the block is up so nothing leaks through.
  useEffect(() => {
    if (online) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [online]);

  if (online) return null;

  const t = ar.connectivity;
  return (
    <div
      dir="rtl"
      data-print="hide"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="connectivity-title"
      aria-describedby="connectivity-body"
      // z-[2000] sits above the entire token scale (toast = 1500) so the block
      // covers toasts, modals, the command palette and every other surface.
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-foreground/85 px-4 backdrop-blur-sm print:hidden"
    >
      <div className="w-full max-w-sm rounded-2xl bg-canvas p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-danger-subtle text-danger">
          <WifiOffIcon className="size-8" />
        </div>
        <h2 id="connectivity-title" className="mb-2 text-lg font-bold text-foreground">
          {t.offlineTitle}
        </h2>
        <p id="connectivity-body" className="mb-6 text-sm leading-relaxed text-foreground-muted">
          {t.offlineBody}
        </p>
        <div
          className="mb-5 flex items-center justify-center gap-2 text-sm text-foreground-muted"
          aria-live="polite"
        >
          {checking && (
            <span
              className="size-4 animate-spin rounded-full border-2 border-border border-t-danger"
              aria-hidden="true"
            />
          )}
          <span>{checking ? t.retrying : t.willReconnect}</span>
        </div>
        <button
          type="button"
          onClick={recheck}
          disabled={checking}
          className="inline-flex w-full items-center justify-center rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-foreground-on-accent transition hover:opacity-90 disabled:opacity-60"
        >
          {t.retryNow}
        </button>
      </div>
    </div>
  );
}
