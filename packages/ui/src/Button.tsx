import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'dry-run';
}

export function Button({ variant = 'default', className, ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      className={['btn', variant !== 'default' ? `btn--${variant}` : '', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
