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
  /** True while the initial permissions fetch is in-flight. */
  loading: boolean;
};

const PermContext = createContext<PermCtx>({ can: () => true, loading: false });

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
    if (!data) return true; // optimistic while loading
    if (data.all) return true;
    return Boolean(data.permissions[resource]?.[action]);
  }

  return (
    <PermContext.Provider value={{ can, loading }}>
      {children}
    </PermContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermContext);
}
