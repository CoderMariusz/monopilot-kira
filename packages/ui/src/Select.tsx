'use client';

import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  children?: React.ReactNode;
}

const SelectCtx = React.createContext<{
  value: string;
  setValue: (v: string) => void;
  disabled: boolean;
  options: SelectOption[];
} | null>(null);

export function Select({
  value,
  defaultValue,
  onValueChange,
  options = [],
  disabled = false,
  id,
  name,
  className,
  children,
  ...aria
}: SelectProps) {
  const [internal, setInternal] = React.useState<string>(defaultValue ?? '');
  const isControlled = value !== undefined;
  const current = isControlled ? value! : internal;

  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onValueChange?.(v);
  };

  return (
    <SelectCtx.Provider value={{ value: current, setValue, disabled, options }}>
      <div
        data-slot="select"
        data-disabled={disabled || undefined}
        className={['select', className].filter(Boolean).join(' ')}
        id={id}
        data-name={name}
        {...aria}
      >
        {children ?? <SelectNativeFallback options={options} disabled={disabled} />}
      </div>
    </SelectCtx.Provider>
  );
}

function SelectNativeFallback({
  options,
  disabled,
}: {
  options: SelectOption[];
  disabled: boolean;
}) {
  return (
    <>
      <SelectTrigger>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled || disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </>
  );
}

export interface SelectTriggerProps {
  className?: string;
  children?: React.ReactNode;
  'aria-label'?: string;
}

export function SelectTrigger({ className, children, ...aria }: SelectTriggerProps) {
  const ctx = React.useContext(SelectCtx);
  return (
    <button
      type="button"
      role="combobox"
      aria-expanded="false"
      aria-haspopup="listbox"
      aria-disabled={ctx?.disabled || undefined}
      data-slot="select-trigger"
      data-state="closed"
      className={['select__trigger', className].filter(Boolean).join(' ')}
      disabled={ctx?.disabled}
      {...aria}
    >
      {children}
      <span aria-hidden="true" data-slot="select-arrow">
        ⌄
      </span>
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(SelectCtx);
  const display = ctx?.options.find((o) => o.value === ctx.value)?.label ?? ctx?.value ?? placeholder ?? '';
  return <span data-slot="select-value">{display}</span>;
}

export function SelectContent({ children }: { children?: React.ReactNode }) {
  return (
    <div role="listbox" data-slot="select-content" className="select__content">
      {children}
    </div>
  );
}

export interface SelectItemProps {
  value: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function SelectItem({ value, disabled, children }: SelectItemProps) {
  const ctx = React.useContext(SelectCtx);
  const isSelected = ctx?.value === value;
  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled || undefined}
      data-slot="select-item"
      data-value={value}
      data-state={isSelected ? 'checked' : 'unchecked'}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && ctx?.setValue(value)}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          if (!disabled) ctx?.setValue(value);
        }
      }}
      className="select__item"
    >
      {children}
    </div>
  );
}
