import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ar } from '@/i18n/ar';
import { usersApi, type UserRow } from '@/lib/settings-api';
import { extractApiError } from '@/lib/api-error';
import { Toast } from '@/components/Toast';
import { cn } from '@/lib/utils';

type Props = {
  user: UserRow | null;
  onClose: () => void;
};

// Effective state for one (resource, action) cell
type CellState = 'default' | 'allow' | 'deny';

function stateFromOverride(isAllowed: boolean | undefined): CellState {
  if (isAllowed === undefined) return 'default';
  return isAllowed ? 'allow' : 'deny';
}

export function EditUserPermissionsDialog({ user, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // dirty map: `${resource}:${action}` → boolean | null (null = revert to default)
  const [dirty, setDirty] = useState<Map<string, boolean | null>>(new Map());

  const { data, isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: () => usersApi.getPermissions(user!.id),
    enabled: !!user,
  });

  const saveMut = useMutation({
    mutationFn: (updates: Array<{ resource: string; action: string; is_allowed: boolean | null }>) =>
      usersApi.updatePermissions(user!.id, updates),
    onSuccess: () => {
      setSaved(true);
      setDirty(new Map());
    },
    onError: (e) => setError(extractApiError(e)),
  });

  // All unique (resource, action) pairs from the role matrix, filtered to the user's role
  const entries = useMemo(() => {
    if (!data) return [];
    const role = data.role;
    return data.roleMatrix
      .filter((r) => r.role === role)
      .sort((a, b) => a.resource.localeCompare(b.resource) || a.action.localeCompare(b.action));
  }, [data]);

  function getState(resource: string, action: string): CellState {
    const key = `${resource}:${action}`;
    if (dirty.has(key)) {
      const v = dirty.get(key);
      if (v === null) return 'default';
      return v ? 'allow' : 'deny';
    }
    const override = data?.overrides.find((o) => o.resource === resource && o.action === action);
    return stateFromOverride(override?.is_allowed);
  }

  function toggle(resource: string, action: string, next: CellState) {
    const key = `${resource}:${action}`;
    setDirty((prev) => {
      const m = new Map(prev);
      if (next === 'default') m.set(key, null);
      else m.set(key, next === 'allow');
      return m;
    });
  }

  function handleSave() {
    if (dirty.size === 0) { onClose(); return; }
    const updates: Array<{ resource: string; action: string; is_allowed: boolean | null }> = [];
    for (const [key, val] of dirty.entries()) {
      const [resource, action] = key.split(':');
      if (resource && action) updates.push({ resource, action, is_allowed: val });
    }
    saveMut.mutate(updates);
  }

  const actionLabels: Record<string, string> = {
    read: ar.settings.permissions.read,
    write: ar.settings.permissions.write,
    approve: ar.settings.permissions.approve,
  };

  if (!user) return null;

  return (
    <>
      <Dialog open={!!user} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{ar.settings.users.editPermissions} — {user.username}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground pb-1">{ar.settings.users.permissionsHint}</p>

          {isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>
          )}

          {!isLoading && entries.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="py-2 px-3 text-start font-medium min-w-40 sticky start-0 bg-muted z-10 border-e border-border">
                      {ar.settings.permissions.resource}
                    </th>
                    <th className="py-2 px-3 text-center font-medium whitespace-nowrap">{ar.settings.permissions.read}</th>
                    <th className="py-2 px-3 text-center font-medium whitespace-nowrap">{ar.settings.permissions.write}</th>
                    <th className="py-2 px-3 text-center font-medium whitespace-nowrap">{ar.settings.permissions.approve}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {/* Group by resource */}
                  {Array.from(new Set(entries.map((e) => e.resource))).map((resource) => (
                    <tr key={resource} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-medium sticky start-0 bg-background border-e border-border">
                        {ar.settings.permissions.resources[resource] ?? resource}
                      </td>
                      {(['read', 'write', 'approve'] as const).map((action) => {
                        const entry = entries.find((e) => e.resource === resource && e.action === action);
                        if (!entry) {
                          return <td key={action} className="py-2 px-3 text-center text-muted-foreground">—</td>;
                        }
                        const state = getState(resource, action);
                        return (
                          <td key={action} className="py-2 px-3 text-center">
                            <TriStateControl
                              state={state}
                              roleDefault={entry.is_allowed}
                              onChange={(next) => toggle(resource, action, next)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && <p className="text-xs text-destructive mt-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" size="sm" onClick={onClose}>{ar.common.cancel}</Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMut.isPending}
            >
              {ar.common.save}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Toast
        open={saved}
        message={ar.settings.users.permissionsSaved}
        tone="success"
        autoDismissMs={2500}
        onClose={() => setSaved(false)}
      />
    </>
  );
}

// 3-way control: Default (inherits role) / Allow / Deny
function TriStateControl({
  state,
  roleDefault,
  onChange,
}: {
  state: CellState;
  roleDefault: boolean;
  onChange: (next: CellState) => void;
}) {
  const options: Array<{ value: CellState; label: string }> = [
    { value: 'default', label: ar.settings.users.useRoleDefault },
    { value: 'allow', label: ar.settings.users.allow },
    { value: 'deny', label: ar.settings.users.deny },
  ];

  return (
    <div className="inline-flex rounded border border-border overflow-hidden text-[10px] font-medium">
      {options.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={cn(
            'px-1.5 py-0.5 transition-colors',
            state === value
              ? value === 'allow'
                ? 'bg-success/20 text-success-foreground font-semibold'
                : value === 'deny'
                  ? 'bg-danger/20 text-danger-foreground font-semibold'
                  : 'bg-accent/20 text-accent-foreground font-semibold'
              : 'bg-background text-muted-foreground hover:bg-muted',
          )}
        >
          {value === 'default'
            ? `${label} (${roleDefault ? ar.settings.users.allow : ar.settings.users.deny})`
            : label}
        </button>
      ))}
    </div>
  );
}
