import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import type { PermAction } from './permissions-config';

type PermData =
  | { all: true }
  | { all: false; permissions: Record<string, Record<string, boolean>> };

type PermCtx = {
  /** Returns true if the current user is allowed to perform action on resource. */
  can: (resource: string, action?: PermAction) => boolean;
  /** True if the user can see/access the resource at all. Some resources expose their
   *  "read-equivalent" action as `view` (hr, suppliers) rather than `read` — this
   *  helper accepts either, so navigation and route gates show the resource whenever
   *  the user has any read-level access to it. */
  canSee: (resource: string) => boolean;
  /** True while auth or the permissions fetch is unresolved. PermGate uses this to
   *  withhold an access decision until we definitively know what the user can do. */
  loading: boolean;
};

const PermContext = createContext<PermCtx>({ can: () => false, canSee: () => false, loading: true });

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<PermData | null>(null);

  useEffect(() => {
    // Wait for auth to settle — otherwise the first effect run sees user=null
    // (auth still resolving), clears state, and the next render briefly has
    // user-set + data=null which would redirect to /no-access. See regression
    // test in frontend/tests/permissions-provider.test.tsx.
    if (authLoading) return;
    if (!user) {
      setData(null);
      return;
    }
    if (user.role === 'super_admin') {
      setData({ all: true });
      return;
    }
    // Clear any previous user's data so we never grant access using stale perms.
    setData(null);
    api
      .get<PermData>('/users/me/permissions')
      .then((r) => setData(r.data))
      .catch(() => setData({ all: false, permissions: {} }));
  }, [authLoading, user?.id, user?.role]);

  // Derived: "loading" means we have no definitive answer for the current user yet.
  // - authLoading: we don't even know who the user is
  // - user present but data still null: the permissions fetch hasn't resolved
  // super_admin and a failed fetch both populate `data` synchronously-ish, so they
  // exit loading immediately.
  const loading = authLoading || (user != null && data === null);

  function can(resource: string, action: PermAction = 'read'): boolean {
    if (loading) return false; // withhold an answer while unresolved
    if (!data) return false;
    if (data.all) return true;
    return Boolean(data.permissions[resource]?.[action]);
  }

  function canSee(resource: string): boolean {
    return can(resource, 'read') || can(resource, 'view');
  }

  return (
    <PermContext.Provider value={{ can, canSee, loading }}>
      {children}
    </PermContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermContext);
}

/** Renders children only when the user has the given permission; renders nothing otherwise. */
export function Can({
  resource,
  action = 'write',
  children,
}: {
  resource: string;
  action?: PermAction;
  children: ReactNode;
}) {
  const { can } = usePermissions();
  return can(resource, action) ? <>{children}</> : null;
}

