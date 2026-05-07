import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import { User } from 'lucide-react';

export function UserMenu() {
  const { user, logout } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="size-9 rounded-full bg-primary/10 inline-flex items-center justify-center text-primary">
        <User className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">{user?.full_name_ar}</div>
        <DropdownMenuItem>{ar.topbar.profile}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logout()}>{ar.topbar.logout}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
