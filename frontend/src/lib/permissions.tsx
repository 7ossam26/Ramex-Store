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
  /** True while the initial permissions fetch is in-flight. */
  loading: boolean;
};

const PermContext = createContext<PermCtx>({ can: () => false, canSee: () => false, loading: true });

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<PermData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setData(null);
      return;
    }
    // owner and super_admin have unconditional access — no fetch needed
    if (user.role === 'owner' || user.role === 'super_admin') {
      setData({ all: true });
      return;
    }
    setLoading(true);
    api
      .get<PermData>('/users/me/permissions')
      .then((r) => setData(r.data))
      .catch(() => setData({ all: false, permissions: {} }))
      .finally(() => setLoading(false));
  }, [user?.id, user?.role]);

  function can(resource: string, action: PermAction = 'read'): boolean {
    if (!data) return false; // deny until resolved
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
