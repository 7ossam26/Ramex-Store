import { useQuery } from '@tanstack/react-query';
import { Check, Minus, Lock } from 'lucide-react';
import { permissionsApi } from '@/lib/settings-api';
import { RESOURCE_GROUPS } from '@/lib/permissions-config';
import { ar } from '@/i18n/ar';
import { cn } from '@/lib/utils';

const ROLES = ['super_admin', 'owner', 'shop_seller', 'factory_sender', 'accountant'] as const;

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'مشرف عام',
  owner: 'مالك',
  shop_seller: 'بائع',
  factory_sender: 'مرسل',
  accountant: 'محاسب',
};

const HARD_DENY_MAP: Record<string, Record<string, string[]>> = {
  factory_sender: { shipments: ['approve'] },
};

function isHardDenied(role: string, resource: string, action: string): boolean {
  return HARD_DENY_MAP[role]?.[resource]?.includes(action) ?? false;
}

function CellIcon({ role, resource, action, allowed }: { role: string; resource: string; action: string; allowed: boolean }) {
  if (role === 'super_admin') {
    return <Check className="size-3.5 text-success-foreground mx-auto" />;
  }
  if (isHardDenied(role, resource, action)) {
    return <Lock className="size-3 text-foreground-tertiary mx-auto" />;
  }
  if (allowed) {
    return <Check className="size-3.5 text-success-foreground mx-auto" />;
  }
  return <Minus className="size-3 text-foreground-tertiary mx-auto" />;
}

export function SuperAdminAccessMatrixPage() {
  const { data: matrix = [], isLoading } = useQuery({
    queryKey: ['settings-permissions'],
    queryFn: permissionsApi.getMatrix,
  });

  function isAllowed(role: string, resource: string, action: string): boolean {
    if (role === 'super_admin') return true;
    const row = matrix.find((r) => r.role === role && r.resource === resource && r.action === action);
    return row ? row.is_allowed : false;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">مصفوفة الوصول</h1>
        <p className="text-sm text-foreground-muted">عرض شامل لصلاحيات جميع الأدوار — للقراءة فقط</p>
      </div>

      <div className="flex items-center gap-4 text-xs text-foreground-muted">
        <span className="flex items-center gap-1"><Check className="size-3.5 text-success-foreground" /> مسموح</span>
        <span className="flex items-center gap-1"><Minus className="size-3 text-foreground-tertiary" /> غير مسموح</span>
        <span className="flex items-center gap-1"><Lock className="size-3 text-foreground-tertiary" /> قيد دائم</span>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-foreground-tertiary text-sm">جاري التحميل…</div>
      ) : (
        <div className="space-y-8">
          {RESOURCE_GROUPS.map((group) => (
            <section key={group.groupKey}>
              <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide mb-3">
                {(ar.settings.permissions.groups as Record<string, string>)[group.groupKey] ?? group.groupKey}
              </h2>
              <div className="rounded-xl border border-border-subtle overflow-hidden shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-surface-row-alt">
                    <tr>
                      <th className="py-2.5 px-3 text-start font-medium text-foreground-muted w-40">المورد</th>
                      <th className="py-2 px-2 text-center font-medium text-foreground-muted w-20">الإجراء</th>
                      {ROLES.map((role) => (
                        <th key={role} className={cn('py-2 px-3 text-center font-semibold w-24', role === 'super_admin' ? 'text-amber-700' : 'text-foreground-muted')}>
                          {ROLE_LABELS[role]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle bg-surface-elevated">
                    {group.resources.map((def) =>
                      def.actions.map((action, ai) => (
                        <tr key={`${def.key}:${action}`} className="hover:bg-surface-hover transition-colors duration-100">
                          {ai === 0 && (
                            <td
                              rowSpan={def.actions.length}
                              className="py-2.5 px-3 font-medium text-foreground align-top border-e border-border-subtle"
                            >
                              {(ar.settings.permissions.resources as Record<string, string>)[def.key] ?? def.key}
                            </td>
                          )}
                          <td className="py-2 px-2 text-center text-foreground-muted">
                            {(ar.settings.permissions.actions as Record<string, string>)[action] ?? action}
                          </td>
                          {ROLES.map((role) => (
                            <td key={role} className="py-2 px-3 text-center">
                              <CellIcon
                                role={role}
                                resource={def.key}
                                action={action}
                                allowed={isAllowed(role, def.key, action)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
