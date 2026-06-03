import React from 'react';

export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
  name?: string;
  value?: string;
  title?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

export function Checkbox({
  checked,
  defaultChecked,
  disabled,
  onCheckedChange,
  id,
  name,
  value,
  title,
  className,
  ...aria
}: CheckboxProps) {
  const [internal, setInternal] = React.useState<boolean>(defaultChecked ?? false);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? Boolean(checked) : internal;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      aria-disabled={disabled || undefined}
      data-slot="checkbox"
      data-state={isChecked ? 'checked' : 'unchecked'}
      data-disabled={disabled || undefined}
      data-value={value}
      id={id}
      name={name}
      title={title}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        const next = !isChecked;
        if (!isControlled) setInternal(next);
        onCheckedChange?.(next);
      }}
      className={['checkbox', className].filter(Boolean).join(' ')}
      {...aria}
    >
      <span
        data-slot="checkbox-indicator"
        className="checkbox__indicator"
        aria-hidden="true"
      >
        {isChecked ? '✓' : ''}
      </span>
    </button>
  );
}
