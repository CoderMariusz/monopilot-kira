import React from 'react';

export type SRowProps = {
  /** Left-column label rendered in `.sg-label`. */
  label: string;
  /** Optional hint rendered below the label in `.sg-hint`. */
  hint?: string;
  /**
   * When provided, the label becomes a real `<label htmlFor>` associated with
   * the field control (whose `id` must match). Otherwise the label renders as a
   * plain `<div>` (matching the prototype).
   */
  htmlFor?: string;
  /** Right-column field content rendered in `.sg-field`. */
  children: React.ReactNode;
};

/**
 * Two-column settings row. Mirrors the prototype `SRow`
 * (prototypes/design/Monopilot Design System/settings/shell.jsx:88-96):
 * label (+optional hint) on the left, field on the right.
 *
 * Presentational + server-safe. The `200px 1fr` grid and the `420px` field cap
 * come from the ported settings design-system CSS (A1). Pass `htmlFor` to wire
 * the label to its control for accessibility.
 */
export function SRow({ label, hint, htmlFor, children }: SRowProps) {
  return (
    <div className="sg-row">
      <div>
        {htmlFor ? (
          <label className="sg-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <div className="sg-label">{label}</div>
        )}
        {hint ? <div className="sg-hint">{hint}</div> : null}
      </div>
      <div className="sg-field">{children}</div>
    </div>
  );
}

export default SRow;
