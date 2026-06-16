/* =============================================================
 * Settings (الإعدادات) — Phase 6 re-skin.
 *
 * 3-column island layout (right→left in RTL):
 *   Rail (global, from AppShell) │ Settings sub-nav │ Form content
 *
 * Sub-nav source of truth: src/navigation/settings.config.ts.
 * Form behavior, CRUD logic, and permission gating are preserved verbatim.
 * Tokens only — no hex literals, no legacy palette utilities.
 * ============================================================= */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ar } from '@/i18n/ar';
import { settingsApi, permissionsApi, usersApi, adminApi } from '@/lib/settings-api';
import { codesApi, type CodeGrade, type CodeComposition, type CodeBrand, type CodeSupplier } from '@/lib/codes-api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { isOwnerOrAbove, isSuperAdmin } from '@/lib/roles';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { PageHeader } from '@/components/PageHeader';
import { Toggle as SharedToggle } from '@/components/Toggle';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Toast } from '@/components/Toast';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import {
  SETTINGS_SECTION_IDS,
  settingsSectionById,
  visibleSettingsSections,
  type SettingsSection,
  type SettingsSectionId,
} from '@/navigation/settings.config';
import { EditUserDialog } from './EditUserDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { EditUserPermissionsDialog } from './EditUserPermissionsDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import type { UserRow } from '@/lib/settings-api';
import { RESOURCE_GROUPS } from '@/lib/permissions-config';

/**
 * Exact phrase the super admin must type to confirm a database reset.
 * Must match the backend constant `RESET_CONFIRM_PHRASE`
 * (backend/src/domain/admin/databaseReset.service.ts). The backend is
 * authoritative; this copy only gates the button for UX.
 */
const RESET_CONFIRM_PHRASE = 'تصفير قاعدة البيانات';


type Section = SettingsSectionId;

// ─── Shared form primitives (token-aware) ────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder = '',
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      className={cn(
        'h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground',
        'placeholder:text-foreground-tertiary transition-colors duration-75 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      )}
      dir="rtl"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

function NumInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  width = 'w-32',
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  width?: string;
}) {
  return (
    <input
      type="number"
      className={cn(
        'h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground tabular-num',
        'placeholder:text-foreground-tertiary transition-colors duration-75 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent',
        width,
      )}
      style={{ unicodeBidi: 'plaintext' }}
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

// Toggle is imported from @/components/Toggle
// This local stub keeps existing call-sites working without touching them.
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return <SharedToggle checked={checked} onChange={onChange} disabled={disabled} />;
}

function SelectInput({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      className={cn(
        'h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground',
        'transition-colors duration-75 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent',
        className,
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}

/** Sticky bar at the bottom of long forms. Wraps a primary action. */
function StickySaveBar({
  onSave,
  saving,
  disabled,
  label = ar.common.save,
}: {
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-6 mt-6 px-6 py-4 bg-surface-elevated border-t border-border-subtle flex items-center justify-start gap-3">
      <Button onClick={onSave} disabled={saving || disabled} className="gap-2 min-w-28">
        {saving && (
          <span
            className="inline-block size-4 rounded-full border-2 border-foreground-on-accent/40 border-t-foreground-on-accent animate-spin"
            aria-hidden
          />
        )}
        {saving ? ar.loading : label}
      </Button>
    </div>
  );
}

/** Per-section form-level error banner — surfaces save failures inline at the top. */
function SaveErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <ErrorBanner
      title={ar.common.error}
      description={message}
      onRetry={onDismiss}
      retryLabel={ar.mobile.close}
      className="mb-4"
    />
  );
}

// ─── Section: General ────────────────────────────────────────────────────────

type SectionProps = {
  settings: Record<string, unknown>;
  onSave: (key: string, value: unknown) => Promise<void>;
  notifySaved: () => void;
};

function GeneralSection({ settings, onSave, notifySaved }: SectionProps) {
  const [form, setForm] = useState({
    logoPath: String(settings['shop.logo_path'] ?? ''),
    addressAr: String(settings['shop.address_ar'] ?? ''),
    phone: String(settings['shop.phone'] ?? ''),
    warningTextAr: String(settings['receipt.warning_text_ar'] ?? ''),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await Promise.all([
        onSave('shop.logo_path', form.logoPath || null),
        onSave('shop.address_ar', form.addressAr),
        onSave('shop.phone', form.phone),
        onSave('receipt.warning_text_ar', form.warningTextAr),
      ]);
      notifySaved();
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn('space-y-5', saving && 'opacity-70 pointer-events-none')}>
      {error && <SaveErrorBanner message={error} onDismiss={() => setError(null)} />}
      <FieldRow label={ar.settings.general.logoPath}>
        <TextInput value={form.logoPath} onChange={(v) => setForm({ ...form, logoPath: v })} placeholder="/images/logo.png" />
      </FieldRow>
      <FieldRow label={ar.settings.general.addressAr}>
        <TextInput value={form.addressAr} onChange={(v) => setForm({ ...form, addressAr: v })} />
      </FieldRow>
      <FieldRow label={ar.settings.general.phone}>
        <TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="01XXXXXXXXX" />
      </FieldRow>
      <FieldRow label={ar.settings.general.warningTextAr}>
        <textarea
          dir="rtl"
          className={cn(
            'min-h-24 rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm text-foreground',
            'placeholder:text-foreground-tertiary transition-colors duration-75 ease-standard resize-y',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent',
          )}
          value={form.warningTextAr}
          onChange={(e) => setForm({ ...form, warningTextAr: e.target.value })}
        />
      </FieldRow>
      <StickySaveBar onSave={save} saving={saving} />
    </div>
  );
}

// ─── Section: Users & Permissions ───────────────────────────────────────────

// RESOURCE_GROUPS is the single source of truth — imported from @/lib/permissions-config

const MATRIX_ROLES = ['owner', 'shop_seller', 'factory_sender', 'accountant'] as const;
type MatrixRole = (typeof MATRIX_ROLES)[number];

function UsersPermissionsSection({ notifySaved }: { notifySaved: () => void }) {
  const qc = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ['settings-users'], queryFn: usersApi.list });
  const { data: matrix = [] } = useQuery({ queryKey: ['settings-permissions'], queryFn: permissionsApi.getMatrix });

  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', full_name_ar: '', role: 'shop_seller', password: '' });
  const [matrixDirty, setMatrixDirty] = useState<Map<string, boolean>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [resettingUser, setResettingUser] = useState<UserRow | null>(null);
  const [permsUser, setPermsUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteUserMut = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-users'] });
      setDeletingUser(null);
      notifySaved();
    },
    onError: (e) => { setDeleteError(extractApiError(e)); setDeletingUser(null); },
  });

  const createUser = useMutation({
    mutationFn: () => usersApi.create(userForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-users'] });
      setShowAddUser(false);
      setUserForm({ username: '', full_name_ar: '', role: 'shop_seller', password: '' });
      notifySaved();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const toggleUser = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => usersApi.update(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-users'] });
      notifySaved();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const savePermsMut = useMutation({
    mutationFn: (updates: Array<{ role: string; resource: string; action: string; is_allowed: boolean }>) =>
      permissionsApi.bulkUpdate(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-permissions'] });
      setMatrixDirty(new Map());
      notifySaved();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  function matrixKey(role: string, resource: string, action: string) {
    return `${role}:${resource}:${action}`;
  }

  function isAllowed(role: string, resource: string, action: string): boolean {
    const k = matrixKey(role, resource, action);
    if (matrixDirty.has(k)) return matrixDirty.get(k)!;
    const row = matrix.find((r) => r.role === role && r.resource === resource && r.action === action);
    return row ? row.is_allowed : false;
  }

  function togglePerm(role: string, resource: string, action: string) {
    const k = matrixKey(role, resource, action);
    const current = isAllowed(role, resource, action);
    setMatrixDirty((prev) => new Map(prev).set(k, !current));
  }

  function bulkSetPerms(
    role: string,
    updates: Array<{ resource: string; action: string }>,
    allowed: boolean,
  ) {
    setMatrixDirty((prev) => {
      const next = new Map(prev);
      for (const { resource, action } of updates) {
        next.set(matrixKey(role, resource, action), allowed);
      }
      return next;
    });
  }

  function savePerms() {
    const updates: Array<{ role: string; resource: string; action: string; is_allowed: boolean }> = [];
    for (const [k, v] of matrixDirty.entries()) {
      const [role, resource, action] = k.split(':');
      if (role && resource && action) updates.push({ role, resource, action, is_allowed: v });
    }
    if (updates.length > 0) savePermsMut.mutate(updates);
  }

  return (
    <div className="space-y-8">
      {error && <SaveErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Users block */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">{ar.settings.users.title}</h3>
          <Button size="sm" variant="outline" onClick={() => setShowAddUser(!showAddUser)}>
            {ar.settings.users.addUser}
          </Button>
        </div>
        {showAddUser && (
          <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-3">
            <FieldRow label={ar.settings.users.username}>
              <TextInput value={userForm.username} onChange={(v) => setUserForm({ ...userForm, username: v })} />
            </FieldRow>
            <FieldRow label={ar.settings.users.fullNameAr}>
              <TextInput value={userForm.full_name_ar} onChange={(v) => setUserForm({ ...userForm, full_name_ar: v })} />
            </FieldRow>
            <FieldRow label={ar.settings.users.role}>
              <SelectInput
                value={userForm.role}
                onChange={(v) => setUserForm({ ...userForm, role: v })}
                className="w-44"
              >
                <option value="owner">{ar.settings.users.roles.owner}</option>
                <option value="shop_seller">{ar.settings.users.roles.shop_seller}</option>
                <option value="factory_sender">{ar.settings.users.roles.factory_sender}</option>
                <option value="accountant">{ar.settings.users.roles.accountant}</option>
              </SelectInput>
            </FieldRow>
            <FieldRow label={ar.settings.users.password}>
              <TextInput value={userForm.password} onChange={(v) => setUserForm({ ...userForm, password: v })} />
            </FieldRow>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => createUser.mutate()}
                disabled={!userForm.username || !userForm.password || createUser.isPending}
              >
                {ar.common.save}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddUser(false)}>
                {ar.common.cancel}
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-border-subtle overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-row-alt text-foreground-muted">
              <tr>
                <th className="py-2.5 px-3 text-start font-medium">{ar.settings.users.username}</th>
                <th className="py-2.5 px-3 text-start font-medium">{ar.settings.users.fullNameAr}</th>
                <th className="py-2.5 px-3 text-start font-medium">{ar.settings.users.role}</th>
                <th className="py-2.5 px-3 text-start font-medium">{ar.settings.users.isActive}</th>
                <th className="py-2.5 px-3 text-start font-medium">{ar.settings.users.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-surface-elevated">
              {users.map((u, i) => (
                <tr key={u.id} className={cn('hover:bg-surface-hover transition-colors duration-150', i % 2 === 1 && 'bg-surface-row-alt/40')}>
                  <td className="py-2.5 px-3 text-foreground">{u.username}</td>
                  <td className="py-2.5 px-3 text-foreground">{u.full_name_ar}</td>
                  <td className="py-2.5 px-3 text-foreground-muted">
                    {ar.settings.users.roles[u.role as keyof typeof ar.settings.users.roles] ?? u.role}
                  </td>
                  <td className="py-2.5 px-3">
                    <Toggle checked={u.is_active} onChange={(v) => toggleUser.mutate({ id: u.id, is_active: v })} />
                  </td>
                  <td className="py-2.5 px-3">
                    {u.role !== 'super_admin' && (
                      <div className="flex gap-1.5 flex-wrap">
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setEditingUser(u)}>
                          {ar.settings.users.edit}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setPermsUser(u)}>
                          {ar.settings.users.editPermissions}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setResettingUser(u)}>
                          {ar.settings.users.resetPassword}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-red-400 text-red-600 hover:bg-red-50" onClick={() => setDeletingUser(u)}>
                          {ar.settings.users.deleteUser}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} />
        <ResetPasswordDialog user={resettingUser} onClose={() => setResettingUser(null)} />
        <EditUserPermissionsDialog user={permsUser} onClose={() => setPermsUser(null)} />
        <ConfirmDialog
          open={!!deletingUser}
          title={ar.settings.users.deleteUser}
          message={ar.settings.users.deleteUserConfirm}
          onConfirm={() => deletingUser && deleteUserMut.mutate(deletingUser.id)}
          onCancel={() => setDeletingUser(null)}
        />
        {deleteError && <p className="text-xs text-red-600 mt-1">{deleteError}</p>}
      </section>

      {/* Role Permissions */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">{ar.settings.permissions.title}</h3>
        <RolePermissionsPanel
          isAllowed={isAllowed}
          onToggle={togglePerm}
          onBulkSet={bulkSetPerms}
          dirty={matrixDirty}
          onSave={savePerms}
          saving={savePermsMut.isPending}
        />
      </section>
    </div>
  );
}

// ─── Role Permissions Panel ──────────────────────────────────────────────────

// Owner/super_admin short-circuit to allow — show only the configurable roles.
const DISPLAY_ROLES: Array<'shop_seller' | 'factory_sender' | 'accountant'> = ['shop_seller', 'factory_sender', 'accountant'];

const DISPLAY_ROLE_LABELS: Record<string, string> = {
  shop_seller:    ar.settings.permissions.shopSeller,
  factory_sender: ar.settings.permissions.factorySender,
  accountant:     ar.settings.permissions.accountant,
};

function RolePermissionsPanel({
  isAllowed,
  onToggle,
  onBulkSet,
  dirty,
  onSave,
  saving,
}: {
  isAllowed: (role: string, resource: string, action: string) => boolean;
  onToggle: (role: string, resource: string, action: string) => void;
  onBulkSet: (role: string, updates: Array<{ resource: string; action: string }>, allowed: boolean) => void;
  dirty: Map<string, boolean>;
  onSave: () => void;
  saving: boolean;
}) {
  const [activeRole, setActiveRole] = useState<'shop_seller' | 'factory_sender' | 'accountant'>('shop_seller');
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
      {/* Role tabs */}
      <div className="relative flex border-b border-border-subtle">
        {DISPLAY_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setActiveRole(role)}
            className={cn(
              'relative px-4 py-2.5 text-sm transition-colors duration-150 ease-standard',
              activeRole === role
                ? 'text-foreground font-semibold'
                : 'text-foreground-muted hover:text-foreground',
            )}
          >
            {activeRole === role && (
              <motion.span
                layoutId="role-permissions-tab"
                className="absolute -bottom-px inset-x-2 h-0.5 bg-accent rounded-full"
                transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              />
            )}
            <span className="relative">{DISPLAY_ROLE_LABELS[role]}</span>
          </button>
        ))}

        {/* Bulk actions aligned to the opposite end */}
        {allVisibleResources.length > 0 && (
          <div className="me-auto flex items-center gap-2 px-4">
            <button
              type="button"
              onClick={() => onBulkSet(activeRole, allVisibleResources, true)}
              className="text-xs px-2.5 py-1 rounded-full border border-success/40 text-success-foreground bg-success/10 hover:bg-success/20 transition-colors"
            >
              سماح للكل
            </button>
            <button
              type="button"
              onClick={() => onBulkSet(activeRole, allVisibleResources, false)}
              className="text-xs px-2.5 py-1 rounded-full border border-danger/40 text-danger-foreground bg-danger/10 hover:bg-danger/20 transition-colors"
            >
              منع الكل
            </button>
          </div>
        )}
      </div>

      {/* Group filter chips + search in one row */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveGroup(null)}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors duration-150',
            !activeGroup
              ? 'bg-accent/10 text-accent border-accent/30'
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
                ? 'bg-accent/10 text-accent border-accent/30'
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
          className="h-8 w-36 rounded-md border border-border-subtle bg-surface-elevated px-2.5 text-xs text-foreground placeholder:text-foreground-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent transition-colors ms-auto"
        />
      </div>

      {/* Card grid sections */}
      {filteredGroups.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-tertiary">لا توجد نتائج</p>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
            <section key={group.groupKey}>
              {/* Section header */}
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">
                  {(ar.settings.permissions.groups as Record<string, string>)[group.groupKey] ?? group.groupKey}
                </h4>
              </div>

              {/* Resource cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.resources.map((def) => {
                  const desc = (ar.settings.permissions.descriptions as Record<string, string>)[
                    def.descriptionKey ?? def.key
                  ];
                  return (
                    <div
                      key={def.key}
                      className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-3 hover:border-border-default transition-colors duration-150"
                    >
                      {/* Card header */}
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {(ar.settings.permissions.resources as Record<string, string>)[def.key] ?? def.key}
                        </p>
                        {desc && (
                          <p className="text-xs text-foreground-muted mt-0.5">{desc}</p>
                        )}
                      </div>

                      {/* Action toggles */}
                      <div className="space-y-2 pt-1 border-t border-border-subtle">
                        {def.actions.map((action) => {
                          const isHardLocked =
                            activeRole === 'factory_sender' &&
                            def.key === 'shipments' &&
                            action === 'approve';
                          const allowed = isAllowed(activeRole, def.key, action);
                          return (
                            <div key={action} className="flex items-center justify-between gap-3">
                              <span className="text-xs text-foreground-muted">
                                {(ar.settings.permissions.actions as Record<string, string>)[action] ?? action}
                              </span>
                              {isHardLocked ? (
                                <span
                                  title="لا يمكن منح هذه الصلاحية لمرسل المصنع"
                                  className="cursor-not-allowed opacity-40"
                                >
                                  <Toggle checked={false} onChange={() => {}} disabled />
                                </span>
                              ) : (
                                <Toggle
                                  checked={allowed}
                                  onChange={() => onToggle(activeRole, def.key, action)}
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

      <StickySaveBar onSave={onSave} saving={saving} disabled={dirty.size === 0} />
    </div>
  );
}

// ─── Section: Reason codes ──────────────────────────────────────────────────

type ReasonCode = { code: string; name_ar: string; default_disposition?: string };

function ReasonCodeList({ items, onChange }: { items: ReasonCode[]; onChange: (v: ReasonCode[]) => void }) {
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  function addCode() {
    if (!newCode || !newName) return;
    onChange([...items, { code: newCode, name_ar: newName }]);
    setNewCode('');
    setNewName('');
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-row-alt text-foreground-muted">
            <tr>
              <th className="py-2 px-3 text-start font-medium w-40">{ar.settings.reasonCodes.code}</th>
              <th className="py-2 px-3 text-start font-medium">{ar.settings.reasonCodes.nameAr}</th>
              <th className="py-2 px-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-surface-elevated">
            {items.map((item, idx) => (
              <tr key={item.code} className="hover:bg-surface-hover transition-colors duration-150">
                <td className="py-2 px-3 font-mono text-foreground-muted">{item.code}</td>
                <td className="py-2 px-3">
                  <input
                    className={cn(
                      'h-9 w-full rounded-md border border-border-default bg-surface-elevated px-2 text-sm text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent transition-colors duration-75',
                    )}
                    dir="rtl"
                    value={item.name_ar}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...item, name_ar: e.target.value };
                      onChange(next);
                    }}
                  />
                </td>
                <td className="py-2 px-3 text-center">
                  <button
                    type="button"
                    className="text-xs text-danger hover:text-danger-foreground transition-colors duration-150 underline-offset-2 hover:underline"
                    onClick={() => onChange(items.filter((_, i) => i !== idx))}
                  >
                    {ar.settings.reasonCodes.remove}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 px-3 text-center text-foreground-tertiary">
                  {ar.codes.noResults}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 flex-wrap items-end">
        <FieldRow label={ar.settings.reasonCodes.code}>
          <TextInput value={newCode} onChange={setNewCode} placeholder="code_key" />
        </FieldRow>
        <FieldRow label={ar.settings.reasonCodes.nameAr}>
          <TextInput value={newName} onChange={setNewName} placeholder="الاسم" />
        </FieldRow>
        <Button size="sm" variant="outline" onClick={addCode}>
          {ar.settings.reasonCodes.addCode}
        </Button>
      </div>
    </div>
  );
}

function ReasonCodesSection({ settings, onSave, notifySaved }: SectionProps) {
  const raw = (key: string, def: ReasonCode[]) =>
    Array.isArray(settings[key]) ? (settings[key] as ReasonCode[]) : def;

  const [damage, setDamage] = useState<ReasonCode[]>(raw('reason_codes.damage', []));
  const [expense, setExpense] = useState<ReasonCode[]>(raw('reason_codes.expense', []));
  const [cancel, setCancel] = useState<ReasonCode[]>(raw('reason_codes.cancellation', []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await Promise.all([
        onSave('reason_codes.damage', damage),
        onSave('reason_codes.expense', expense),
        onSave('reason_codes.cancellation', cancel),
      ]);
      notifySaved();
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn('space-y-8', saving && 'opacity-70 pointer-events-none')}>
      {error && <SaveErrorBanner message={error} onDismiss={() => setError(null)} />}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">{ar.settings.reasonCodes.damage}</h3>
        <ReasonCodeList items={damage} onChange={setDamage} />
      </section>
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">{ar.settings.reasonCodes.expense}</h3>
        <ReasonCodeList items={expense} onChange={setExpense} />
      </section>
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">{ar.settings.reasonCodes.cancellation}</h3>
        <ReasonCodeList items={cancel} onChange={setCancel} />
      </section>
      <StickySaveBar onSave={save} saving={saving} />
    </div>
  );
}

// ─── Section: Fabric Codes ──────────────────────────────────────────────────

type CodeTab = 'grades' | 'compositions' | 'brands' | 'suppliers';

function TabsBar({ tab, onChange }: { tab: CodeTab; onChange: (v: CodeTab) => void }) {
  const tabs: CodeTab[] = ['grades', 'compositions', 'brands', 'suppliers'];
  return (
    <div className="relative flex gap-1 border-b border-border-subtle">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            'relative px-4 py-2 text-sm transition-colors duration-150 ease-standard',
            tab === t ? 'text-foreground font-semibold' : 'text-foreground-muted hover:text-foreground',
          )}
        >
          {tab === t && (
            <motion.span
              layoutId="fabric-codes-tab"
              className="absolute -bottom-px inset-x-2 h-0.5 bg-accent rounded-full"
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            />
          )}
          <span className="relative">{ar.settings.fabricCodes.tabs[t]}</span>
        </button>
      ))}
    </div>
  );
}

function CodesTableSkeleton() {
  return (
    <div className="rounded-lg border border-border-subtle overflow-hidden" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-3 py-3 border-b border-border-subtle last:border-b-0 flex gap-3">
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

function GradesTab({ notifySaved }: { notifySaved: () => void }) {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['codes-grades-all'],
    queryFn: codesApi.listAllGrades,
  });
  const [form, setForm] = useState({ arabic_name: '', english_name: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      codesApi.create('grades', {
        arabic_name: form.arabic_name.trim(),
        english_name: form.english_name.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['codes-grades-all'] });
      qc.invalidateQueries({ queryKey: ['codes-grades'] });
      setForm({ arabic_name: '', english_name: '' });
      setAddOpen(false);
      setErr(null);
      notifySaved();
    },
    onError: (e) => setErr(extractApiError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (item: CodeGrade) =>
      item.is_active ? codesApi.deactivate('grades', item.id) : codesApi.restore('grades', item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['codes-grades-all'] });
      qc.invalidateQueries({ queryKey: ['codes-grades'] });
      setErr(null);
      notifySaved();
    },
    onError: (e) => setErr(extractApiError(e)),
  });

  if (isLoading) return <CodesTableSkeleton />;
  return (
    <div className="space-y-4">
      {err && <SaveErrorBanner message={err} onDismiss={() => setErr(null)} />}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-row-alt text-foreground-muted">
            <tr>
              <th className="py-2.5 px-3 text-start font-medium">{ar.settings.fabricCodes.arabicName}</th>
              <th className="py-2.5 px-3 text-start font-medium">{ar.settings.fabricCodes.englishName}</th>
              <th className="py-2.5 px-3 text-center font-medium w-20">{ar.settings.fabricCodes.isActive}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-surface-elevated">
            {items.map((item, i) => (
              <tr key={item.id} className={cn('hover:bg-surface-hover transition-colors duration-150', i % 2 === 1 && 'bg-surface-row-alt/40')}>
                <td className="py-2 px-3 text-foreground">{item.arabic_name}</td>
                <td className="py-2 px-3 text-foreground-muted">{item.english_name ?? '—'}</td>
                <td className="py-2 px-3 text-center">
                  <Toggle checked={item.is_active} onChange={() => toggleMut.mutate(item)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {addOpen ? (
        <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-3">
          <FieldRow label={ar.settings.fabricCodes.arabicName}>
            <TextInput value={form.arabic_name} onChange={(v) => setForm({ ...form, arabic_name: v })} />
          </FieldRow>
          <FieldRow label={ar.settings.fabricCodes.englishName}>
            <TextInput value={form.english_name} onChange={(v) => setForm({ ...form, english_name: v })} />
          </FieldRow>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.arabic_name || createMut.isPending}>
              {ar.common.save}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAddOpen(false); setErr(null); }}>
              {ar.common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>{ar.settings.fabricCodes.add}</Button>
      )}
    </div>
  );
}

function CompositionsTab({ notifySaved }: { notifySaved: () => void }) {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['codes-compositions-all'],
    queryFn: codesApi.listAllCompositions,
  });
  const [form, setForm] = useState({ arabic_name: '', description: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      codesApi.create('compositions', {
        arabic_name: form.arabic_name.trim(),
        description: form.description.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['codes-compositions-all'] });
      qc.invalidateQueries({ queryKey: ['codes-compositions'] });
      setForm({ arabic_name: '', description: '' });
      setAddOpen(false);
      setErr(null);
      notifySaved();
    },
    onError: (e) => setErr(extractApiError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (item: CodeComposition) =>
      item.is_active
        ? codesApi.deactivate('compositions', item.id)
        : codesApi.restore('compositions', item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['codes-compositions-all'] });
      qc.invalidateQueries({ queryKey: ['codes-compositions'] });
      setErr(null);
      notifySaved();
    },
    onError: (e) => setErr(extractApiError(e)),
  });

  if (isLoading) return <CodesTableSkeleton />;
  return (
    <div className="space-y-4">
      {err && <SaveErrorBanner message={err} onDismiss={() => setErr(null)} />}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-row-alt text-foreground-muted">
            <tr>
              <th className="py-2.5 px-3 text-start font-medium">{ar.settings.fabricCodes.arabicName}</th>
              <th className="py-2.5 px-3 text-start font-medium">{ar.settings.fabricCodes.description}</th>
              <th className="py-2.5 px-3 text-center font-medium w-20">{ar.settings.fabricCodes.isActive}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-surface-elevated">
            {items.map((item, i) => (
              <tr key={item.id} className={cn('hover:bg-surface-hover transition-colors duration-150', i % 2 === 1 && 'bg-surface-row-alt/40')}>
                <td className="py-2 px-3 text-foreground">{item.arabic_name}</td>
                <td className="py-2 px-3 text-foreground-muted text-xs max-w-64 truncate">{item.description ?? '—'}</td>
                <td className="py-2 px-3 text-center">
                  <Toggle checked={item.is_active} onChange={() => toggleMut.mutate(item)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {addOpen ? (
        <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-3">
          <FieldRow label={ar.settings.fabricCodes.arabicName}>
            <TextInput value={form.arabic_name} onChange={(v) => setForm({ ...form, arabic_name: v })} />
          </FieldRow>
          <FieldRow label={ar.settings.fabricCodes.description}>
            <TextInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
          </FieldRow>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.arabic_name || createMut.isPending}>
              {ar.common.save}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAddOpen(false); setErr(null); }}>
              {ar.common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>{ar.settings.fabricCodes.add}</Button>
      )}
    </div>
  );
}

function SuppliersTab({ notifySaved }: { notifySaved: () => void }) {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['codes-suppliers-all'],
    queryFn: codesApi.listAllSuppliers,
  });
  const [form, setForm] = useState({ arabic_name: '', arabic_warning_text: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      codesApi.create('suppliers', {
        arabic_name: form.arabic_name.trim(),
        arabic_warning_text: form.arabic_warning_text.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['codes-suppliers-all'] });
      qc.invalidateQueries({ queryKey: ['codes-suppliers'] });
      setForm({ arabic_name: '', arabic_warning_text: '' });
      setAddOpen(false);
      setErr(null);
      notifySaved();
    },
    onError: (e) => setErr(extractApiError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (item: CodeSupplier) =>
      item.is_active ? codesApi.deactivate('suppliers', item.id) : codesApi.restore('suppliers', item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['codes-suppliers-all'] });
      qc.invalidateQueries({ queryKey: ['codes-suppliers'] });
      setErr(null);
      notifySaved();
    },
    onError: (e) => setErr(extractApiError(e)),
  });

  if (isLoading) return <CodesTableSkeleton />;
  return (
    <div className="space-y-4">
      {err && <SaveErrorBanner message={err} onDismiss={() => setErr(null)} />}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-row-alt text-foreground-muted">
            <tr>
              <th className="py-2.5 px-3 text-start font-medium">{ar.settings.fabricCodes.arabicName}</th>
              <th className="py-2.5 px-3 text-start font-medium">{ar.settings.fabricCodes.warningText}</th>
              <th className="py-2.5 px-3 text-center font-medium w-20">{ar.settings.fabricCodes.isActive}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-surface-elevated">
            {items.map((item, i) => (
              <tr key={item.id} className={cn('hover:bg-surface-hover transition-colors duration-150', i % 2 === 1 && 'bg-surface-row-alt/40')}>
                <td className="py-2 px-3 text-foreground">{item.arabic_name}</td>
                <td className="py-2 px-3 text-foreground-muted text-xs max-w-64 truncate">{item.arabic_warning_text ?? '—'}</td>
                <td className="py-2 px-3 text-center">
                  <Toggle checked={item.is_active} onChange={() => toggleMut.mutate(item)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {addOpen ? (
        <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-3">
          <FieldRow label={ar.settings.fabricCodes.arabicName}>
            <TextInput value={form.arabic_name} onChange={(v) => setForm({ ...form, arabic_name: v })} />
          </FieldRow>
          <FieldRow label={ar.settings.fabricCodes.warningText}>
            <TextInput value={form.arabic_warning_text} onChange={(v) => setForm({ ...form, arabic_warning_text: v })} />
          </FieldRow>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.arabic_name || createMut.isPending}>
              {ar.common.save}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAddOpen(false); setErr(null); }}>
              {ar.common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>{ar.settings.fabricCodes.add}</Button>
      )}
    </div>
  );
}

function BrandsTab({ notifySaved }: { notifySaved: () => void }) {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['codes-brands-all'],
    queryFn: codesApi.listAllBrands,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['codes-suppliers'],
    queryFn: codesApi.listSuppliers,
  });
  const [form, setForm] = useState({ arabic_name: '', product_line: '', supplier_id: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      codesApi.create('brands', {
        arabic_name: form.arabic_name.trim(),
        product_line: form.product_line.trim() || null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['codes-brands-all'] });
      qc.invalidateQueries({ queryKey: ['codes-brands'] });
      setForm({ arabic_name: '', product_line: '', supplier_id: '' });
      setAddOpen(false);
      setErr(null);
      notifySaved();
    },
    onError: (e) => setErr(extractApiError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (item: CodeBrand) =>
      item.is_active ? codesApi.deactivate('brands', item.id) : codesApi.restore('brands', item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['codes-brands-all'] });
      qc.invalidateQueries({ queryKey: ['codes-brands'] });
      setErr(null);
      notifySaved();
    },
    onError: (e) => setErr(extractApiError(e)),
  });

  const supplierName = (id: number | null) =>
    suppliers.find((s) => s.id === id)?.arabic_name ?? '—';

  if (isLoading) return <CodesTableSkeleton />;
  return (
    <div className="space-y-4">
      {err && <SaveErrorBanner message={err} onDismiss={() => setErr(null)} />}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-row-alt text-foreground-muted">
            <tr>
              <th className="py-2.5 px-3 text-start font-medium">{ar.settings.fabricCodes.arabicName}</th>
              <th className="py-2.5 px-3 text-start font-medium">{ar.settings.fabricCodes.productLine}</th>
              <th className="py-2.5 px-3 text-start font-medium">{ar.settings.fabricCodes.supplierRef}</th>
              <th className="py-2.5 px-3 text-center font-medium w-20">{ar.settings.fabricCodes.isActive}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-surface-elevated">
            {items.map((item, i) => (
              <tr key={item.id} className={cn('hover:bg-surface-hover transition-colors duration-150', i % 2 === 1 && 'bg-surface-row-alt/40')}>
                <td className="py-2 px-3 text-foreground">{item.arabic_name}</td>
                <td className="py-2 px-3 text-foreground-muted">{item.product_line ?? '—'}</td>
                <td className="py-2 px-3 text-foreground-muted">{supplierName(item.supplier_id)}</td>
                <td className="py-2 px-3 text-center">
                  <Toggle checked={item.is_active} onChange={() => toggleMut.mutate(item)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {addOpen ? (
        <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-3">
          <FieldRow label={ar.settings.fabricCodes.arabicName}>
            <TextInput value={form.arabic_name} onChange={(v) => setForm({ ...form, arabic_name: v })} />
          </FieldRow>
          <FieldRow label={ar.settings.fabricCodes.productLine}>
            <TextInput value={form.product_line} onChange={(v) => setForm({ ...form, product_line: v })} />
          </FieldRow>
          <FieldRow label={ar.settings.fabricCodes.supplierRef}>
            <SelectInput
              value={form.supplier_id}
              onChange={(v) => setForm({ ...form, supplier_id: v })}
              className="w-56"
            >
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.arabic_name}
                </option>
              ))}
            </SelectInput>
          </FieldRow>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.arabic_name || createMut.isPending}>
              {ar.common.save}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAddOpen(false); setErr(null); }}>
              {ar.common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>{ar.settings.fabricCodes.add}</Button>
      )}
    </div>
  );
}

function FabricCodesSection({ notifySaved }: { notifySaved: () => void }) {
  const [tab, setTab] = useState<CodeTab>('grades');
  return (
    <div className="space-y-5">
      <TabsBar tab={tab} onChange={setTab} />
      {tab === 'grades' && <GradesTab notifySaved={notifySaved} />}
      {tab === 'compositions' && <CompositionsTab notifySaved={notifySaved} />}
      {tab === 'brands' && <BrandsTab notifySaved={notifySaved} />}
      {tab === 'suppliers' && <SuppliersTab notifySaved={notifySaved} />}
    </div>
  );
}

// ─── Section: System (super admin only) ─────────────────────────────────────

function ResetDatabaseDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (wipedTables: number) => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetMut = useMutation({
    mutationFn: () => adminApi.resetDatabase({ confirmPhrase: phrase.trim(), password }),
    onSuccess: (r) => {
      setPhrase('');
      setPassword('');
      setError(null);
      onDone(r.wipedTables);
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const phraseOk = phrase.trim() === RESET_CONFIRM_PHRASE;
  const canSubmit = phraseOk && password.length > 0 && !resetMut.isPending;

  function handleClose() {
    if (resetMut.isPending) return;
    setPhrase('');
    setPassword('');
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" aria-hidden />
            {ar.settings.system.confirmTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-sm text-foreground">{ar.settings.system.confirmWarning}</p>
          </div>

          {error && <SaveErrorBanner message={error} onDismiss={() => setError(null)} />}

          <FieldRow label={ar.settings.system.phraseLabel}>
            <TextInput value={phrase} onChange={setPhrase} placeholder={RESET_CONFIRM_PHRASE} />
          </FieldRow>

          <FieldRow label={ar.settings.system.passwordLabel}>
            <input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              className={cn(
                'h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground text-start',
                'transition-colors duration-75 ease-standard',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent',
              )}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FieldRow>

          <div className="flex justify-start gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => resetMut.mutate()}
              disabled={!canSubmit}
              className="gap-2 bg-destructive text-foreground-on-accent hover:bg-destructive/90"
            >
              {resetMut.isPending && (
                <span
                  className="inline-block size-4 rounded-full border-2 border-foreground-on-accent/40 border-t-foreground-on-accent animate-spin"
                  aria-hidden
                />
              )}
              {resetMut.isPending ? ar.loading : ar.settings.system.confirmButton}
            </Button>
            <Button size="sm" variant="outline" onClick={handleClose} disabled={resetMut.isPending}>
              {ar.common.cancel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SystemSection({ notifySaved }: { notifySaved: () => void }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-8">
      {/* Read-only system info */}
      <section className="space-y-3">
        <FieldRow label={ar.settings.system.auditRetentionLabel}>
          <p className="text-sm text-foreground-muted">{ar.settings.system.auditRetentionValue}</p>
        </FieldRow>
      </section>

      {/* Danger zone */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-destructive">{ar.settings.system.dangerZone}</h3>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 shrink-0 text-destructive mt-0.5" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{ar.settings.system.resetTitle}</p>
              <p className="text-sm text-foreground-muted">{ar.settings.system.resetDescription}</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="bg-destructive text-foreground-on-accent hover:bg-destructive/90"
          >
            {ar.settings.system.resetButton}
          </Button>
        </div>
      </section>

      <ResetDatabaseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onDone={() => {
          setDialogOpen(false);
          // Wipe of operational data invalidates effectively every cached query.
          qc.invalidateQueries();
          notifySaved();
        }}
      />
    </div>
  );
}

// ─── Sub-nav (desktop) ──────────────────────────────────────────────────────

function DesktopSubNav({
  active,
  onChange,
  sections,
}: {
  active: Section;
  onChange: (s: Section) => void;
  sections: SettingsSection[];
}) {
  return (
    <aside
      className="hidden md:block w-60 shrink-0 self-start sticky top-20"
      aria-label="Settings sections"
    >
      <nav className="rounded-lg border border-border-subtle bg-surface-elevated p-2 space-y-0.5 shadow-sm">
        {sections.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative w-full text-start px-3 py-2.5 rounded-md text-sm transition-colors duration-150 ease-standard',
                'flex items-center gap-3',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated',
                isActive ? 'text-foreground' : 'text-foreground-muted hover:text-foreground hover:bg-surface-hover',
              )}
            >
              {isActive && (
                <>
                  <motion.span
                    layoutId="settings-active-bg"
                    className="absolute inset-0 bg-surface-active rounded-md"
                    transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                    aria-hidden
                  />
                  <motion.span
                    layoutId="settings-active-indicator"
                    className="absolute inset-y-1.5 start-0 w-0.5 bg-accent rounded-full"
                    transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                    aria-hidden
                  />
                </>
              )}
              <Icon className={cn('size-4 relative shrink-0', isActive ? 'text-accent' : 'text-foreground-tertiary')} aria-hidden />
              <span className={cn('relative truncate', isActive && 'font-medium')}>{s.labelAr}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ─── Sub-nav (mobile chip row) ──────────────────────────────────────────────

function MobileChipRow({
  active,
  onChange,
  sections,
}: {
  active: Section;
  onChange: (s: Section) => void;
  sections: SettingsSection[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active chip into view when section changes.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLButtonElement>(`[data-chip="${active}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [active]);

  return (
    <div className="md:hidden sticky top-[52px] z-sticky -mx-3 px-3 py-2 bg-surface/95 backdrop-blur border-b border-border-subtle">
      <div ref={scrollerRef} className="overflow-x-auto -mx-1 px-1 no-scrollbar">
        <div className="flex gap-2 w-max">
          {sections.map((s) => {
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                type="button"
                data-chip={s.id}
                onClick={() => onChange(s.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap rounded-pill border px-3 py-1.5 text-xs transition-colors duration-150 ease-standard',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  isActive
                    ? 'bg-accent text-foreground-on-accent border-accent font-medium'
                    : 'bg-surface-elevated text-foreground-muted border-border-subtle hover:text-foreground hover:bg-surface-hover',
                )}
              >
                {s.labelAr}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Form skeleton (initial settings load) ──────────────────────────────────

function FormSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ─── Success toast (3s auto-dismiss, bottom of viewport) ────────────────────
// Thin wrapper around the shared <Toast> primitive for the canonical success
// message; per Re-Skin Standard "تم الحفظ بنجاح" is the single string used.

function SavedToast({ open, onDone }: { open: boolean; onDone: () => void }) {
  return (
    <Toast
      open={open}
      message="تم الحفظ بنجاح"
      tone="success"
      autoDismissMs={3000}
      onClose={onDone}
    />
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuth();
  const isDesktop = useIsDesktop();
  const [activeSection, setActiveSection] = useState<Section>('general');
  const [toastOpen, setToastOpen] = useState(false);

  const { data: settings, isLoading, error, refetch } = useQuery({
    queryKey: ['settings-all'],
    queryFn: settingsApi.getAll,
  });

  const qc = useQueryClient();

  async function handleSave(key: string, value: unknown) {
    await settingsApi.set(key, value);
    qc.invalidateQueries({ queryKey: ['settings-all'] });
  }

  function notifySaved() {
    setToastOpen(false);
    // Re-mount the toast on the next tick so animation replays on rapid saves.
    requestAnimationFrame(() => setToastOpen(true));
  }

  if (!isOwnerOrAbove(user?.role)) {
    return (
      <div dir="rtl" className="max-w-2xl mx-auto py-12">
        <ErrorBanner title={ar.common.error} description={ar.common.error} />
      </div>
    );
  }

  const sections = visibleSettingsSections(user?.role);
  const sectionMeta = settingsSectionById(activeSection);

  function renderSection() {
    if (isLoading) return <FormSkeleton />;
    if (error || !settings) {
      return (
        <ErrorBanner
          title={ar.common.error}
          description={ar.common.error}
          onRetry={() => refetch()}
        />
      );
    }
    switch (activeSection) {
      case 'general':
        return <GeneralSection settings={settings} onSave={handleSave} notifySaved={notifySaved} />;
      case 'usersPermissions':
        if (!isSuperAdmin(user?.role)) return null;
        return <UsersPermissionsSection notifySaved={notifySaved} />;
      case 'reasonCodes':
        return <ReasonCodesSection settings={settings} onSave={handleSave} notifySaved={notifySaved} />;
      case 'fabricCodes':
        return <FabricCodesSection notifySaved={notifySaved} />;
      case 'system':
        if (!isSuperAdmin(user?.role)) return null;
        return <SystemSection notifySaved={notifySaved} />;
    }
  }

  // Ensure active section is within the visible set for this user.
  if (!SETTINGS_SECTION_IDS.includes(activeSection) || !sections.some((s) => s.id === activeSection)) {
    return null;
  }

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader title={ar.settings.title} description={sectionMeta.descAr} />

      {/* Mobile sub-nav: horizontal scroll chip row sticky under the TopBar. */}
      <MobileChipRow active={activeSection} onChange={setActiveSection} sections={sections} />

      <div className="flex gap-6 items-start">
        {isDesktop && <DesktopSubNav active={activeSection} onChange={setActiveSection} sections={sections} />}

        <main className="flex-1 min-w-0">
          <div className="rounded-lg border border-border-subtle bg-surface-elevated shadow-sm">
            <header className="px-6 pt-5 pb-3 border-b border-border-subtle">
              <h2 className="text-xl font-semibold text-foreground">{sectionMeta.labelAr}</h2>
              <p className="text-sm text-foreground-muted mt-1">{sectionMeta.descAr}</p>
            </header>
            <div className="p-6">{renderSection()}</div>
          </div>
        </main>
      </div>

      <SavedToast open={toastOpen} onDone={() => setToastOpen(false)} />
    </div>
  );
}
