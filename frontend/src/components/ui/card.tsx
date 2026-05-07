import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...p }, ref) => (
    <div ref={ref} className={cn('rounded border border-border bg-canvas shadow-sm', className)} {...p} />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...p }, ref) => <div ref={ref} className={cn('p-6 pb-3', className)} {...p} />,
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...p }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-semibold text-ink', className)} {...p} />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...p }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...p} />,
);
CardContent.displayName = 'CardContent';
