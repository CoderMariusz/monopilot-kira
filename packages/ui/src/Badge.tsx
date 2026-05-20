import React from 'react';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'danger' | 'muted';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  tone?: BadgeVariant;
}

export function Badge({ variant, tone, className, ...props }: BadgeProps) {
  const v = variant ?? tone ?? 'default';
  return (
    <span
      data-slot="badge"
      data-variant={v}
      data-tone={v}
      className={['badge', `badge--${v}`, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
