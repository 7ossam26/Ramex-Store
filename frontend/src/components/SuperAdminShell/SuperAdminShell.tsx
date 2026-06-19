import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShieldAlert,
  Users,
  Key,
  Grid3X3,
  History,
  Download,
  Home,
  LogOut,
  ChevronLeft,
  User,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type NavItem = { label: string; icon: React.ElementType; to: string };

const NAV_ITEMS: NavItem[] = [
  { label: 'لوحة التحكم', icon: Home, to: '/superadmin' },
  { label: 'المستخدمون', icon: Users, to: '/superadmin/users' },
  { label: 'الصلاحيات', icon: Key, to: '/superadmin/roles' },
  { label: 'مصفوفة الوصول', icon: Grid3X3, to: '/superadmin/access-matrix' },
  { label: 'سجل المراجعة', icon: History, to: '/superadmin/audit-log' },
  { label: 'النسخ الاحتياطي', icon: Download, to: '/superadmin/backup' },
];

function SuperAdminSideNav() {
  const location = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-52 shrink-0 bg-amber-900/10 border-l border-amber-800/20 min-h-screen">
      <div className="flex flex-col flex-1 p-3 gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === '/superadmin'
              ? location.pathname === '/superadmin'
              : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150',
                isActive
                  ? 'bg-amber-700 text-white font-semibold'
                  : 'text-amber-900 hover:bg-amber-100 hover:text-amber-900',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="p-3 border-t border-amber-800/20">
        <Link
          to="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          العودة للنظام
        </Link>
      </div>
    </aside>
  );
}

export function SuperAdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isDetailPage = /^\/superadmin\/users\/\d+/.test(location.pathname);

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-amber-50/30">
      {/* Amber top bar */}
      <header className="bg-amber-700 text-white sticky top-0 z-40 h-14 flex items-center px-4 gap-3 shadow-md">
        <Link to="/superadmin" className="flex items-center gap-2 font-bold text-white/90 hover:text-white">
          <ShieldAlert className="size-5" />
          <span className="text-sm">المشرف العام</span>
        </Link>

        <span className="h-5 w-px bg-white/20" />
        <span className="text-sm text-white/70">رامكس ستور</span>

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger className="size-9 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center transition-colors">
            <User className="size-4 text-white" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{user?.full_name_ar}</div>
            <DropdownMenuItem asChild>
              <Link to="/">العودة للنظام</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void logout()} className="text-destructive">
              <LogOut className="size-4 me-2" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex flex-1">
        {!isDetailPage && <SuperAdminSideNav />}
        <main className="flex-1 min-w-0 p-6">{children}</main>
      </div>
    </div>
  );
}
