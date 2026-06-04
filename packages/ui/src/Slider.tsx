'use client';

import React from 'react';

/**
 * Slider — accessible single-thumb range control (shadcn-equivalent primitive).
 *
 * This is the production replacement for the prototype's raw `<input type="range">`
 * (a T3 red-line). It is a self-contained, keyboard-operable `role="slider"`
 * widget (no `@radix-ui/*` runtime added). Lives in `packages/ui` so the
 * `@radix-ui` / app-layer boundary is respected.
 *
 * Controlled or uncontrolled; emits numeric values. The value is always clamped
 * and step-snapped. Callers that need decimal-string money should format the
 * emitted number at the call site (the prototype sliders drive what-if params,
 * which are re-serialised to decimal strings before they touch the DB).
 */
export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number, min: number, step: number): number {
  if (step <= 0) return value;
  const steps = Math.round((value - min) / step);
  // Avoid binary-float drift on the snapped result.
  const snapped = min + steps * step;
  const decimals = (String(step).split('.')[1] ?? '').length;
  return decimals > 0 ? Number(snapped.toFixed(decimals)) : snapped;
}

export function Slider({
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  disabled,
  onValueChange,
  id,
  name,
  className,
  ...aria
}: SliderProps) {
  const [internal, setInternal] = React.useState<number>(
    snap(clamp(defaultValue ?? min, min, max), min, step),
  );
  const isControlled = value !== undefined;
  const current = isControlled ? snap(clamp(value, min, max), min, step) : internal;

  const commit = (next: number) => {
    if (disabled) return;
    const snapped = snap(clamp(next, min, max), min, step);
    if (snapped === current) return;
    if (!isControlled) setInternal(snapped);
    onValueChange?.(snapped);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = current - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = current + step;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      case 'PageDown':
        next = current - step * 10;
        break;
      case 'PageUp':
        next = current + step * 10;
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  };

  const pct = max > min ? ((current - min) / (max - min)) * 100 : 0;

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={current}
      aria-disabled={disabled || undefined}
      aria-orientation="horizontal"
      data-slot="slider"
      data-disabled={disabled || undefined}
      id={id}
      data-name={name}
      onKeyDown={onKeyDown}
      className={['slider', className].filter(Boolean).join(' ')}
      style={{ ['--slider-pct' as string]: `${pct}%` }}
      {...aria}
    >
      <span data-slot="slider-track" className="slider__track" aria-hidden="true">
        <span data-slot="slider-range" className="slider__range" style={{ width: `${pct}%` }} />
      </span>
      <span data-slot="slider-thumb" className="slider__thumb" style={{ left: `${pct}%` }} aria-hidden="true" />
    </div>
  );
}

export default Slider;
