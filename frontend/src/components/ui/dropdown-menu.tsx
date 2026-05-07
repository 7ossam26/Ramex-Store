import * as React from 'react';
import * as Primitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <Primitive.Portal>
    <Primitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded border border-border bg-canvas p-1 shadow-md',
        className,
      )}
      {...props}
    />
  </Primitive.Portal>
));
DropdownMenuContent.displayName = Primitive.Content.displayName;

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof Primitive.Item>,
  React.ComponentPropsWithoutRef<typeof Primitive.Item>
>(({ className, ...props }, ref) => (
  <Primitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-tight px-2 py-1.5 text-sm outline-none hover:bg-muted',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = Primitive.Item.displayName;
