/**
 * Regression test for the "/no-access on refresh" race between AuthProvider
 * and PermissionsProvider.
 *
 * Before the fix, the permissions effect ran with user=null on the first commit
 * (auth still resolving), set loading=false, and the next render — once auth
 * resolved with a real user — briefly had user set + perm data=null + perm
 * loading=false. A PermGate evaluating in that window incorrectly redirected
 * to /no-access for a route the user actually had access to.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider } from '../src/lib/auth';
import { PermissionsProvider, usePermissions } from '../src/lib/permissions';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}

// Hold a per-test queue of deferreds so each test wires up its own resolution order.
const calls: { me?: Deferred<{ data: unknown }>; perms?: Deferred<{ data: unknown }> } = {};

vi.mock('../src/lib/api', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url === '/users/me') return calls.me!.promise;
      if (url === '/users/me/permissions') return calls.perms!.promise;
      throw new Error(`unexpected api.get url: ${url}`);
    }),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

type Snapshot = { loading: boolean; canRolls: boolean };
const snapshots: Snapshot[] = [];

function Probe() {
  const { loading, can } = usePermissions();
  snapshots.push({ loading, canRolls: can('fabric_rolls', 'read') });
  // Only show "page" once a definitive grant is in place.
  if (loading) return <div data-testid="state">loading</div>;
  return <div data-testid="state">{can('fabric_rolls', 'read') ? 'allowed' : 'denied'}</div>;
}

function renderTree() {
  return render(
    <AuthProvider>
      <PermissionsProvider>
        <Probe />
      </PermissionsProvider>
    </AuthProvider>,
  );
}

beforeEach(() => {
  snapshots.length = 0;
  calls.me = deferred();
  calls.perms = deferred();
  localStorage.setItem('ramex_token', 'test-token');
});

describe('PermissionsProvider — refresh race', () => {
  it('never reports loading=false + denied while user is set but perms unresolved', async () => {
    renderTree();

    // Phase 1: nothing resolved yet — must be loading.
    expect(screen.getByTestId('state').textContent).toBe('loading');

    // Phase 2: auth resolves first (the canonical race window). Perms still pending.
    await act(async () => {
      calls.me!.resolve({
        data: { id: 7, username: 'ahmed', full_name_ar: 'أحمد', role: 'factory_sender' },
      });
    });

    // Must STILL be loading — we haven't heard back from /users/me/permissions yet.
    // This is the assertion that catches the regression.
    expect(screen.getByTestId('state').textContent).toBe('loading');

    // Phase 3: perms resolve granting fabric_rolls.read.
    await act(async () => {
      calls.perms!.resolve({
        data: { all: false, permissions: { fabric_rolls: { read: true } } },
      });
    });

    expect(screen.getByTestId('state').textContent).toBe('allowed');

    // Cross-check every snapshot: at no point did loading=false coexist with canRolls=false.
    for (const s of snapshots) {
      if (!s.loading) {
        // Once we leave loading, the only acceptable state is "allowed" — anything
        // else means the race fired.
        expect(s.canRolls).toBe(true);
      }
    }
  });

  it('definitive deny: loaded matrix without the resource → not loading and not allowed', async () => {
    renderTree();

    await act(async () => {
      calls.me!.resolve({
        data: { id: 7, username: 'ahmed', full_name_ar: 'أحمد', role: 'factory_sender' },
      });
    });
    await act(async () => {
      calls.perms!.resolve({
        data: { all: false, permissions: { customers: { read: true } } },
      });
    });

    expect(screen.getByTestId('state').textContent).toBe('denied');
    const final = snapshots[snapshots.length - 1]!;
    expect(final.loading).toBe(false);
    expect(final.canRolls).toBe(false);
  });

  it('fetch error: catches and exits loading rather than getting stuck', async () => {
    renderTree();

    await act(async () => {
      calls.me!.resolve({
        data: { id: 7, username: 'ahmed', full_name_ar: 'أحمد', role: 'factory_sender' },
      });
    });
    await act(async () => {
      calls.perms!.reject(new Error('network down'));
    });

    // After the catch, we land on a definitive (empty) matrix → not loading, denied.
    const final = snapshots[snapshots.length - 1]!;
    expect(final.loading).toBe(false);
    expect(final.canRolls).toBe(false);
  });
});
