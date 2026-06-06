import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ar } from '@/i18n/ar';
import { usersApi, type UserRow } from '@/lib/settings-api';
import { extractApiError } from '@/lib/api-error';
import { Toast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { RESOURCE_GROUPS, type ResourceDef, type ResourceGroup } from '@/lib/permissions-config';

type Props = {
  user: UserRow | null;
  onClose: () => void;
};

type CellState = 'default' | 'allow' | 'deny';

const resourceLabel = (key: string) =>
  (ar.settings.permissions.resources as Record<string, string>)[key] ?? key;

const actionLabel = (key: string) =>
  (ar.settings.permissions.actions as Record<string, string>)[key] ?? key;

const descriptionLabel = (key: string | undefined) =>
  key ? (ar.settings.permissions.descriptions as Record<string, string>)[key] : undefined;

const groupLabel = (key: string) =>
  (ar.settings.permissions.groups as Record<string, string>)[key] ?? key;

export function EditUserPermissionsDialog({ user, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState<Map<string, boolean | null>>(new Map());
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ['user-permissions', user?.id] });
    },
    onError: (e) => setError(extractApiError(e)),
  });

  function getState(resource: string, action: string): CellState {
    const key = `${resource}:${action}`;
    if (dirty.has(key)) {
      const v = dirty.get(key);
      return v === null ? 'default' : v ? 'allow' : 'deny';
    }
    const override = data?.overrides.find((o) => o.resource === resource && o.action === action);
    if (override === undefined) return 'default';
    return override.is_allowed ? 'allow' : 'deny';
  }

  function getRoleDefault(resource: string, action: string): boolean {
    if (!data) return false;
    const row = data.roleMatrix.find(
      (r) => r.role === data.role && r.resource === resource && r.action === action,
    );
    return row ? row.is_allowed : false;
  }

  function toggle(resource: string, action: string, next: CellState) {
    const key = `${resource}:${action}`;
    setDirty((prev) => {
      const m = new Map(prev);
      m.set(key, next === 'default' ? null : next === 'allow');
      return m;
    });
  }

  function resetGroupToDefault(group: ResourceGroup) {
    setDirty((prev) => {
      const m = new Map(prev);
      for (const res of group.resources) {
        for (const act of res.actions) {
          m.set(`${res.key}:${act}`, null);
        }
      }
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

  if (!user) return null;

  const roleLabel = data
    ? (ar.settings.users.roles[data.role as keyof typeof ar.settings.users.roles] ?? data.role)
    : '';

  return (
    <>
      <Dialog open={!!user} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent
          className="max-w-5xl max-h-[92vh] p-0 gap-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
          dir="rtl"
        >
          {/* Sticky header */}
          <div className="px-5 pt-5 pb-3 border-b border-border-subtle bg-surface-elevated">
            <DialogHeader>
              <DialogTitle className="text-base">
                {ar.settings.users.editPermissions} — <span className="font-mono text-foreground-muted">{user.username}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-0.5">
              <p className="text-xs text-foreground-muted">{ar.settings.users.permissionsHint}</p>
              {data && (
                <p className="text-xs text-foreground-muted">
                  الدور: <span className="font-medium text-foreground">{roleLabel}</span>
                  {' '}— التعديلات أدناه تتجاوز افتراضي الدور
                </p>
              )}
            </div>
          </div>

          {/* Scrollable body — grid's middle row (minmax(0,1fr)) sizes it; min-h-0 lets it shrink so overflow-y kicks in */}
          <div className="overflow-y-auto min-h-0 px-5 py-4 space-y-6">
            {isLoading && (
              <div className="py-12 text-center text-sm text-foreground-muted">جارٍ التحميل...</div>
            )}

            {!isLoading && data && RESOURCE_GROUPS.map((group) => (
              <section key={group.groupKey}>
                {/* Group header */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-border-subtle">
                  <h3 className="text-sm font-bold text-foreground">{groupLabel(group.groupKey)}</h3>
                  <button
                    type="button"
                    onClick={() => resetGroupToDefault(group)}
                    className="text-xs text-accent hover:underline cursor-pointer"
                  >
                    استعادة الافتراضي
                  </button>
                </div>

                {/* Resource cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.resources.map((def) => (
                    <ResourceCard
                      key={def.key}
                      def={def}
                      role={data.role}
                      getState={getState}
                      getRoleDefault={getRoleDefault}
                      onToggle={toggle}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Sticky footer */}
          <div className="px-5 py-3 border-t border-border-subtle bg-surface-elevated flex items-center justify-between gap-3">
            <div className="text-xs text-foreground-muted">
              {dirty.size > 0 ? (
                <span><span className="font-semibold text-foreground tabular-num">{dirty.size}</span> تغيير غير محفوظ</span>
              ) : (
                <span>لا توجد تعديلات</span>
              )}
            </div>
            <div className="flex gap-2">
              {error && <span className="text-xs text-destructive self-center">{error}</span>}
              <Button variant="outline" size="sm" onClick={onClose}>{ar.common.cancel}</Button>
              <Button size="sm" onClick={handleSave} disabled={saveMut.isPending}>
                {saveMut.isPending ? ar.loading : ar.common.save}
              </Button>
            </div>
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

// ─── Resource card ───────────────────────────────────────────────────────────

function ResourceCard({
  def,
  role,
  getState,
  getRoleDefault,
  onToggle,
}: {
  def: ResourceDef;
  role: string;
  getState: (resource: string, action: string) => CellState;
  getRoleDefault: (resource: string, action: string) => boolean;
  onToggle: (resource: string, action: string, next: CellState) => void;
}) {
  const desc = descriptionLabel(def.descriptionKey ?? def.key);
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden flex flex-col">
      <header className="px-4 py-3 border-b border-border-subtle bg-surface">
        <h4 className="text-sm font-semibold text-foreground">{resourceLabel(def.key)}</h4>
        {desc && <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">{desc}</p>}
      </header>
      <div className="p-3 space-y-2 flex-1">
        {def.actions.map((action) => {
          // Hard invariant: factory_sender users can never be granted shipments.approve.
          const isHardLocked =
            role === 'factory_sender' && def.key === 'shipments' && action === 'approve';
          return (
            <div key={action} className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">{actionLabel(action)}</span>
              {isHardLocked ? (
                <span
                  className="inline-flex rounded-md border border-border-subtle px-2 py-1 text-[10px] font-medium bg-danger/15 text-danger-foreground opacity-70 cursor-not-allowed"
                  title="لا يمكن منح هذه الصلاحية لدور مرسل المصنع"
                >
                  {ar.settings.users.deny}
                </span>
              ) : (
                <TriStateControl
                  state={getState(def.key, action)}
                  roleDefault={getRoleDefault(def.key, action)}
                  onChange={(next) => onToggle(def.key, action, next)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tri-state segmented control ─────────────────────────────────────────────

function TriStateControl({
  state,
  roleDefault,
  onChange,
}: {
  state: CellState;
  roleDefault: boolean;
  onChange: (next: CellState) => void;
}) {
  const options: Array<{ value: CellState; label: string; activeCls: string }> = [
    {
      value: 'default',
      label: `${ar.settings.users.useRoleDefault} (${roleDefault ? ar.settings.users.allow : ar.settings.users.deny})`,
      activeCls: 'bg-accent/15 text-accent border-accent/40',
    },
    {
      value: 'allow',
      label: ar.settings.users.allow,
      activeCls: 'bg-success/15 text-success-foreground border-success/40',
    },
    {
      value: 'deny',
      label: ar.settings.users.deny,
      activeCls: 'bg-danger/15 text-danger-foreground border-danger/40',
    },
  ];

  return (
    <div className="inline-flex rounded-md border border-border-subtle overflow-hidden bg-surface">
      {options.map(({ value, label, activeCls }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            'px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer border-s border-border-subtle first:border-s-0 whitespace-nowrap',
            state === value
              ? `${activeCls} font-semibold`
              : 'bg-surface text-foreground-muted hover:bg-surface-hover',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
