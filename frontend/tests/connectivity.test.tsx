import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { ConnectivityProvider, ConnectivityGate, pingHealth } from '@/lib/connectivity';

function renderGate() {
  return render(
    <ConnectivityProvider>
      <ConnectivityGate />
    </ConnectivityProvider>,
  );
}

/** Drain pending timers + microtasks (the heartbeat loop awaits a fetch). */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const blockVisible = () => screen.queryByRole('alertdialog') !== null;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pingHealth — reachability, not health', () => {
  it('treats a 200 as reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await expect(pingHealth()).resolves.toBe(true);
  });

  it('treats a 503 (server up, DB blip) as reachable — must NOT read as offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(pingHealth()).resolves.toBe(true);
  });

  it('reports unreachable only when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    await expect(pingHealth()).resolves.toBe(false);
  });
});

describe('ConnectivityGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('stays hidden while the server is reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    renderGate();
    await flush(0);
    expect(blockVisible()).toBe(false);
  });

  it('never blocks on repeated 503s — a backend-health issue is not "offline"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    renderGate();
    await flush(0);
    await flush(30_000); // several poll cycles
    expect(blockVisible()).toBe(false);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('tolerates a single failure, then blocks after the threshold, then recovers', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'));
    vi.stubGlobal('fetch', fetchMock);
    renderGate();

    // First failure — below threshold, app stays usable (no flash).
    await flush(0);
    expect(blockVisible()).toBe(false);

    // Second consecutive failure crosses the threshold → full-screen block.
    await flush(4_000);
    expect(blockVisible()).toBe(true);

    // Server comes back → next heartbeat succeeds → block clears automatically.
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await flush(4_000);
    expect(blockVisible()).toBe(false);
  });

  it('blocks immediately on the browser offline event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    renderGate();
    await flush(0);
    expect(blockVisible()).toBe(false);

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(blockVisible()).toBe(true);
  });
});
