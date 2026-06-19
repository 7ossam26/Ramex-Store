import { Link } from 'react-router-dom';
import { Users, Key, Grid3X3, History, Download, ShieldAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/settings-api';

type HubCard = { label: string; desc: string; icon: React.ElementType; to: string; accent: string };

const CARDS: HubCard[] = [
  { label: 'المستخدمون', desc: 'إنشاء وتعديل وحذف حسابات المستخدمين', icon: Users, to: '/superadmin/users', accent: 'text-blue-700 bg-blue-50 border-blue-200' },
  { label: 'الصلاحيات', desc: 'تعديل صلاحيات الأدوار لكل مورد', icon: Key, to: '/superadmin/roles', accent: 'text-amber-700 bg-amber-50 border-amber-200' },
  { label: 'مصفوفة الوصول', desc: 'عرض شامل لصلاحيات كل الأدوار', icon: Grid3X3, to: '/superadmin/access-matrix', accent: 'text-purple-700 bg-purple-50 border-purple-200' },
  { label: 'سجل المراجعة', desc: 'كل العمليات الحساسة مع تفاصيل كاملة', icon: History, to: '/superadmin/audit-log', accent: 'text-slate-700 bg-slate-50 border-slate-200' },
  { label: 'النسخ الاحتياطي', desc: 'تنزيل نسخة احتياطية من قاعدة البيانات', icon: Download, to: '/superadmin/backup', accent: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
];

export function SuperAdminHubPage() {
  const { data: users = [] } = useQuery({ queryKey: ['superadmin-users'], queryFn: usersApi.list });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <span className="p-2 rounded-xl bg-amber-100">
          <ShieldAlert className="size-6 text-amber-700" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-foreground">لوحة تحكم المشرف العام</h1>
          <p className="text-sm text-foreground-muted">إدارة المستخدمين والصلاحيات وأمان النظام</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4">
          <p className="text-2xl font-bold text-foreground">{users.length}</p>
          <p className="text-xs text-foreground-muted mt-1">إجمالي المستخدمين</p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4">
          <p className="text-2xl font-bold text-foreground">{users.filter((u) => u.is_active).length}</p>
          <p className="text-xs text-foreground-muted mt-1">مستخدم نشط</p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4">
          <p className="text-2xl font-bold text-foreground">4</p>
          <p className="text-xs text-foreground-muted mt-1">أدوار في النظام</p>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-xl border bg-surface-elevated p-5 hover:shadow-md transition-all duration-200 hover:border-amber-300"
            >
              <div className={`inline-flex p-2.5 rounded-lg border mb-3 ${card.accent}`}>
                <Icon className="size-5" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{card.label}</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">{card.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
