'use client';

import React from 'react';
import ReactDOM from 'react-dom';
// Plain (non-module) stylesheet so class names ship VERBATIM in the production
// bundle. Previously this was `Select.module.css`, which made Next/Turbopack
// hash the selectors (e.g. `.Select-module__xxxx__select__content`) while the
// markup below still used the literal strings (`select__content`). The hashed
// CSS never matched the literal DOM classes, so the popover shipped UNSTYLED in
// the production build (transparent background, no z-index) = the "unreadable
// dropdown on Vercel" report. A plain `.css` import (supported for component
// libraries) emits the BEM-namespaced `select__*` classes unchanged.
import './Select.css';

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
  /** ref to the portaled listbox content (for click-outside detection) */
  contentRef: React.RefObject<HTMLDivElement | null>;
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
  const contentRef = React.useRef<HTMLDivElement | null>(null);
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

  // Returns the enabled option elements in DOM order. The listbox is portaled
  // to <body>, so the options live under `contentRef`, NOT under the trigger
  // root — query the content element first, then fall back to root (legacy /
  // non-portal paths) and finally the registered-items map.
  const orderedEnabled = React.useCallback((): HTMLDivElement[] => {
    const scope = contentRef.current ?? rootRef.current;
    if (!scope) {
      return Array.from(itemsRef.current.values())
        .filter((i) => !i.disabled)
        .map((i) => i.el);
    }
    const all = Array.from(
      scope.querySelectorAll<HTMLDivElement>('[data-slot="select-item"]'),
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
      const content = contentRef.current;
      const target = event.target as Node;
      // The listbox is portaled to document.body, so it is NOT inside `root`.
      // Treat a click inside either the trigger root OR the portaled content as
      // "inside"; only close when the click is genuinely elsewhere.
      const insideRoot = root ? root.contains(target) : false;
      const insideContent = content ? content.contains(target) : false;
      if (!insideRoot && !insideContent) {
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
    contentRef,
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

  // Position the portaled listbox under the trigger using fixed coordinates
  // derived from the trigger's viewport rect. Recomputed on open and on
  // scroll/resize so it tracks the trigger. Portaling to <body> escapes any
  // ancestor `overflow:hidden`/`transform` stacking context (sticky settings
  // headers, transformed cards) that previously clipped or buried the popover.
  const [pos, setPos] = React.useState<{ top: number; left: number; minWidth: number } | null>(
    null,
  );

  const computePosition = React.useCallback(() => {
    const trigger = ctx?.triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
  }, [ctx?.triggerRef]);

  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    computePosition();
    window.addEventListener('scroll', computePosition, true);
    window.addEventListener('resize', computePosition);
    return () => {
      window.removeEventListener('scroll', computePosition, true);
      window.removeEventListener('resize', computePosition);
    };
  }, [open, computePosition]);

  // Closed: render nothing so options are not present in the accessibility tree
  // or visually — fixes the "always expanded inline" bug.
  if (!open) return null;

  const node = (
    <div
      ref={ctx?.contentRef}
      role="listbox"
      id={ctx?.contentId}
      aria-labelledby={ctx?.triggerId}
      data-slot="select-content"
      data-state="open"
      className="select__content"
      // Inline positioning guarantees the popover is fixed, on top, and aligned
      // to the trigger regardless of the host page's CSS. `pos` is null only for
      // the first synchronous paint before useLayoutEffect runs.
      // pointerEvents:'auto' is load-bearing inside a Radix modal Dialog: the
      // dialog sets `pointer-events:none` on <body> while open, and this
      // listbox is portaled to <body> (outside the dialog content), so without
      // the override every option click fell through to the modal beneath it
      // (live E2E: line/machine/waste/pause selects unusable by mouse).
      style={
        pos
          ? { position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth, pointerEvents: 'auto' }
          : { position: 'fixed', visibility: 'hidden', pointerEvents: 'auto' }
      }
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );

  // Portal to <body> when a DOM is available (browser / jsdom); fall back to
  // in-place render otherwise (e.g. SSR) so the markup is still produced.
  if (typeof document !== 'undefined') {
    return ReactDOM.createPortal(node, document.body);
  }
  return node;
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
