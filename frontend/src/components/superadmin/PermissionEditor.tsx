/**
 * Full-page permission editor for a single role.
 * Extracted from SettingsPage.tsx RolePermissionsPanel —
 * adapted for single-role use and amber accent.
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RESOURCE_GROUPS } from '@/lib/permissions-config';
import { ar } from '@/i18n/ar';
import { Toggle } from '@/components/Toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  role: string;
  isAllowed: (role: string, resource: string, action: string) => boolean;
  onToggle: (role: string, resource: string, action: string) => void;
  onBulkSet: (role: string, updates: Array<{ resource: string; action: string }>, allowed: boolean) => void;
  dirty: Map<string, boolean>;
  onSave: () => void;
  saving: boolean;
};

const HARD_DENY_MAP: Record<string, Record<string, string[]>> = {
  factory_sender: { shipments: ['approve'] },
};

function isHardDenied(role: string, resource: string, action: string): boolean {
  return HARD_DENY_MAP[role]?.[resource]?.includes(action) ?? false;
}

export function PermissionEditor({ role, isAllowed, onToggle, onBulkSet, dirty, onSave, saving }: Props) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return RESOURCE_GROUPS
      .filter((g) => !activeGroup || g.groupKey === activeGroup)
      .map((g) => ({
        ...g,
        resources: g.resources.filter((def) => {
          if (!q) return true;
          const resLabel = ((ar.settings.permissions.resources as Record<string, string>)[def.key] ?? def.key).toLowerCase();
          const desc = ((ar.settings.permissions.descriptions as Record<string, string>)[def.descriptionKey ?? def.key] ?? '').toLowerCase();
          return resLabel.includes(q) || def.key.includes(q) || desc.includes(q);
        }),
      }))
      .filter((g) => g.resources.length > 0);
  }, [activeGroup, search]);

  const allVisibleResources = useMemo(
    () => filteredGroups.flatMap((g) =>
      g.resources.flatMap((def) => def.actions.map((action) => ({ resource: def.key, action }))),
    ),
    [filteredGroups],
  );

  return (
    <div className="space-y-5">
      {/* Group filter chips + search */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveGroup(null)}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors duration-150',
            !activeGroup
              ? 'bg-amber-100 text-amber-800 border-amber-300'
              : 'bg-surface-elevated text-foreground-muted border-border-subtle hover:border-foreground-muted/40',
          )}
        >
          الكل
        </button>
        {RESOURCE_GROUPS.map((g) => (
          <button
            key={g.groupKey}
            type="button"
            onClick={() => setActiveGroup(activeGroup === g.groupKey ? null : g.groupKey)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors duration-150',
              activeGroup === g.groupKey
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-surface-elevated text-foreground-muted border-border-subtle hover:border-foreground-muted/40',
            )}
          >
            {(ar.settings.permissions.groups as Record<string, string>)[g.groupKey] ?? g.groupKey}
          </button>
        ))}
        <input
          type="search"
          placeholder="بحث…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          dir="rtl"
          className="h-8 w-36 rounded-md border border-border-subtle bg-surface-elevated px-2.5 text-xs text-foreground placeholder:text-foreground-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ms-auto"
        />
      </div>

      {/* Bulk actions */}
      {allVisibleResources.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onBulkSet(role, allVisibleResources, true)}
            className="text-xs px-2.5 py-1 rounded-full border border-success/40 text-success-foreground bg-success/10 hover:bg-success/20 transition-colors"
          >
            سماح للكل
          </button>
          <button
            type="button"
            onClick={() => onBulkSet(role, allVisibleResources, false)}
            className="text-xs px-2.5 py-1 rounded-full border border-danger/40 text-danger-foreground bg-danger/10 hover:bg-danger/20 transition-colors"
          >
            منع الكل
          </button>
        </div>
      )}

      {/* Permission card grid */}
      {filteredGroups.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-tertiary">لا توجد نتائج</p>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
            <section key={group.groupKey}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">
                  {(ar.settings.permissions.groups as Record<string, string>)[group.groupKey] ?? group.groupKey}
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.resources.map((def) => {
                  const desc = (ar.settings.permissions.descriptions as Record<string, string>)[
                    def.descriptionKey ?? def.key
                  ];
                  return (
                    <div
                      key={def.key}
                      className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-3 hover:border-amber-300 transition-colors duration-150"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {(ar.settings.permissions.resources as Record<string, string>)[def.key] ?? def.key}
                        </p>
                        {desc && (
                          <p className="text-xs text-foreground-muted mt-0.5">{desc}</p>
                        )}
                      </div>
                      <div className="space-y-2 pt-1 border-t border-border-subtle">
                        {def.actions.map((action) => {
                          const hardLocked = isHardDenied(role, def.key, action);
                          const allowed = isAllowed(role, def.key, action);
                          return (
                            <div key={action} className="flex items-center justify-between gap-3">
                              <span className="text-xs text-foreground-muted">
                                {(ar.settings.permissions.actions as Record<string, string>)[action] ?? action}
                              </span>
                              {hardLocked ? (
                                <span title="قيد دائم — لا يمكن تغييره" className="cursor-not-allowed opacity-40">
                                  <Toggle checked={false} onChange={() => {}} disabled />
                                </span>
                              ) : (
                                <Toggle
                                  checked={allowed}
                                  onChange={() => onToggle(role, def.key, action)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Sticky save bar */}
      <div className="sticky bottom-0 -mx-6 mt-6 px-6 py-4 bg-amber-700 border-t border-amber-600 flex items-center justify-start gap-3">
        <Button
          onClick={onSave}
          disabled={saving || dirty.size === 0}
          className="gap-2 min-w-28 bg-white text-amber-800 hover:bg-amber-50"
        >
          {saving && (
            <span className="inline-block size-4 rounded-full border-2 border-amber-300 border-t-amber-700 animate-spin" aria-hidden />
          )}
          {saving ? 'جارٍ الحفظ…' : `حفظ (${dirty.size} تغيير)`}
        </Button>
        {dirty.size > 0 && (
          <span className="text-xs text-amber-200">{dirty.size} تغيير غير محفوظ</span>
        )}
      </div>
    </div>
  );
}
