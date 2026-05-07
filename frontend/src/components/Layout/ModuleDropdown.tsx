import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

type Item = { label: string; href: string };

export function ModuleDropdown({ label, items }: { label: string; items: Item[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="px-3 py-2 text-sm font-medium text-ink hover:text-primary inline-flex items-center gap-1">
        {label}
        <ChevronDown className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((i) => (
          <DropdownMenuItem key={i.href} onSelect={() => (location.href = i.href)}>
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
