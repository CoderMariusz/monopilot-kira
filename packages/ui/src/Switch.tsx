'use client';

import React from 'react';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

export function Switch({
  checked,
  defaultChecked,
  disabled,
  onCheckedChange,
  id,
  name,
  className,
  ...aria
}: SwitchProps) {
  const [internal, setInternal] = React.useState<boolean>(defaultChecked ?? false);
  const isControlled = checked !== undefined;
  const value = isControlled ? Boolean(checked) : internal;

  const toggle = () => {
    if (disabled) return;
    const next = !value;
    if (!isControlled) setInternal(next);
    onCheckedChange?.(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-disabled={disabled || undefined}
      data-slot="switch"
      data-state={value ? 'checked' : 'unchecked'}
      data-disabled={disabled || undefined}
      id={id}
      name={name}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          toggle();
        }
      }}
      className={['switch', className].filter(Boolean).join(' ')}
      {...aria}
    >
      <span data-slot="switch-thumb" className="switch__thumb" aria-hidden="true" />
    </button>
  );
}
