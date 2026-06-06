'use client';

import React from 'react';
import './Select.module.css';

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

interface SelectContextValue {
  value: string;
  setValue: (v: string) => void;
  disabled: boolean;
  options: SelectOption[];
  open: boolean;
  setOpen: (open: boolean) => void;
  /** id of the trigger button — used for aria-controls / aria-labelledby wiring */
  triggerId: string;
  /** id of the listbox content — used for aria-controls on the trigger */
  contentId: string;
  /** registers/focuses options for roving keyboard navigation */
  registerItem: (el: HTMLDivElement | null, value: string, disabled: boolean) => void;
  /** focus the option at a relative or absolute position */
  moveFocus: (dir: 'next' | 'prev' | 'first' | 'last') => void;
  /** ref to the trigger button so we can restore focus on close */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const SelectCtx = React.createContext<SelectContextValue | null>(null);

function useSelectId(provided?: string): string {
  const reactId = React.useId();
  return provided ?? `select-${reactId}`;
}

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
  const [open, setOpenState] = React.useState(false);
  const isControlled = value !== undefined;
  const current = isControlled ? value! : internal;

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  // Map preserves DOM order of option elements for roving focus.
  const itemsRef = React.useRef<Map<string, { el: HTMLDivElement; disabled: boolean }>>(
    new Map(),
  );

  const baseId = useSelectId(id);
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;

  const setValue = React.useCallback(
    (v: string) => {
      if (!isControlled) setInternal(v);
      onValueChange?.(v);
    },
    [isControlled, onValueChange],
  );

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (disabled) return;
      setOpenState(next);
    },
    [disabled],
  );

  const registerItem = React.useCallback(
    (el: HTMLDivElement | null, v: string, itemDisabled: boolean) => {
      if (el) {
        itemsRef.current.set(v, { el, disabled: itemDisabled });
      } else {
        itemsRef.current.delete(v);
      }
    },
    [],
  );

  // Returns the enabled option elements in DOM order.
  const orderedEnabled = React.useCallback((): HTMLDivElement[] => {
    const root = rootRef.current;
    if (!root) {
      return Array.from(itemsRef.current.values())
        .filter((i) => !i.disabled)
        .map((i) => i.el);
    }
    const all = Array.from(
      root.querySelectorAll<HTMLDivElement>('[data-slot="select-item"]'),
    );
    return all.filter((el) => el.getAttribute('aria-disabled') !== 'true');
  }, []);

  const moveFocus = React.useCallback(
    (dir: 'next' | 'prev' | 'first' | 'last') => {
      const list = orderedEnabled();
      if (list.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const currentIndex = active ? list.indexOf(active as HTMLDivElement) : -1;
      let nextIndex: number;
      switch (dir) {
        case 'first':
          nextIndex = 0;
          break;
        case 'last':
          nextIndex = list.length - 1;
          break;
        case 'next':
          nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, list.length - 1);
          break;
        case 'prev':
          nextIndex = currentIndex < 0 ? list.length - 1 : Math.max(currentIndex - 1, 0);
          break;
      }
      list[nextIndex]?.focus();
    },
    [orderedEnabled],
  );

  // Click-outside closes the popover.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) {
        setOpenState(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  // When opening, move focus to the selected option (or the first enabled one).
  // useLayoutEffect runs synchronously after the listbox is committed to the DOM
  // so focus lands before any subsequent keyboard event is processed.
  React.useLayoutEffect(() => {
    if (!open) return;
    const list = orderedEnabled();
    if (list.length === 0) return;
    const selected = list.find((el) => el.getAttribute('data-value') === current);
    const target = selected ?? list[0];
    target?.focus();
    // Intentionally keyed only on `open`: we want to move focus when the popover
    // opens, not every time the selected value or item set changes.
  }, [open]);

  const ctx: SelectContextValue = {
    value: current,
    setValue,
    disabled,
    options,
    open,
    setOpen,
    triggerId,
    contentId,
    registerItem,
    moveFocus,
    triggerRef,
  };

  return (
    <SelectCtx.Provider value={ctx}>
      <div
        ref={rootRef}
        data-slot="select"
        data-state={open ? 'open' : 'closed'}
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
  /** Optional explicit id (e.g. for an external `<label htmlFor>`); falls back to the auto trigger id. */
  id?: string;
  'aria-label'?: string;
}

export function SelectTrigger({ className, children, id, ...aria }: SelectTriggerProps) {
  const ctx = React.useContext(SelectCtx);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!ctx || ctx.disabled) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!ctx.open) {
          ctx.setOpen(true);
        } else {
          ctx.moveFocus(event.key === 'ArrowUp' ? 'prev' : 'next');
        }
        break;
      case 'Escape':
        if (ctx.open) {
          event.preventDefault();
          ctx.setOpen(false);
        }
        break;
      default:
        break;
    }
  };

  return (
    <button
      ref={ctx?.triggerRef}
      type="button"
      role="combobox"
      id={id ?? ctx?.triggerId}
      aria-expanded={ctx?.open ? 'true' : 'false'}
      aria-haspopup="listbox"
      aria-controls={ctx?.open ? ctx?.contentId : undefined}
      aria-disabled={ctx?.disabled || undefined}
      data-slot="select-trigger"
      data-state={ctx?.open ? 'open' : 'closed'}
      data-value={ctx?.value || undefined}
      value={ctx?.value ?? ''}
      className={['select__trigger', className].filter(Boolean).join(' ')}
      disabled={ctx?.disabled}
      onClick={() => ctx?.setOpen(!ctx.open)}
      onKeyDown={handleKeyDown}
      {...aria}
    >
      {children}
      <span aria-hidden="true" data-slot="select-arrow" className="select__arrow">
        ⌄
      </span>
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(SelectCtx);
  const display =
    ctx?.options.find((o) => o.value === ctx.value)?.label ?? ctx?.value ?? placeholder ?? '';
  return <span data-slot="select-value">{display}</span>;
}

export function SelectContent({ children }: { children?: React.ReactNode }) {
  const ctx = React.useContext(SelectCtx);
  const open = ctx?.open ?? false;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ctx) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        ctx.moveFocus('next');
        break;
      case 'ArrowUp':
        event.preventDefault();
        ctx.moveFocus('prev');
        break;
      case 'Home':
        event.preventDefault();
        ctx.moveFocus('first');
        break;
      case 'End':
        event.preventDefault();
        ctx.moveFocus('last');
        break;
      case 'Escape':
        event.preventDefault();
        ctx.setOpen(false);
        ctx.triggerRef.current?.focus();
        break;
      case 'Tab':
        // Tabbing away from the listbox closes it (standard combobox behavior).
        ctx.setOpen(false);
        break;
      default:
        break;
    }
  };

  // Closed: render nothing so options are not present in the accessibility tree
  // or visually — fixes the "always expanded inline" bug.
  if (!open) return null;

  return (
    <div
      role="listbox"
      id={ctx?.contentId}
      aria-labelledby={ctx?.triggerId}
      data-slot="select-content"
      data-state="open"
      className="select__content"
      onKeyDown={handleKeyDown}
    >
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
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    ctx?.registerItem(ref.current, value, Boolean(disabled));
    return () => ctx?.registerItem(null, value, Boolean(disabled));
    // `ctx.registerItem` is stable (useCallback); re-run only when identity changes.
  }, [value, disabled]);

  const select = () => {
    if (disabled || !ctx) return;
    ctx.setValue(value);
    ctx.setOpen(false);
    ctx.triggerRef.current?.focus();
  };

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled || undefined}
      data-slot="select-item"
      data-value={value}
      data-state={isSelected ? 'checked' : 'unchecked'}
      tabIndex={disabled ? -1 : 0}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          select();
        }
      }}
      className="select__item"
    >
      {children}
    </div>
  );
}
