import React from 'react';

export type ToggleProps = {
  /** Controlled on/off state. */
  checked: boolean;
  /** Fired with the new boolean value when toggled. */
  onChange?: (value: boolean) => void;
  /** Disables the switch. */
  disabled?: boolean;
  /** Accessible label for the switch (no visible text inside). */
  'aria-label'?: string;
};

/**
 * Slider switch. Mirrors the prototype `Toggle`
 * (prototypes/design/Monopilot Design System/settings/shell.jsx:98-103) — a
 * `label.sg-toggle > input[checkbox] + span.slider`. This is the design-system
 * toggle, NOT the shadcn `@monopilot/ui/Switch`.
 *
 * The visual switch is driven entirely by the ported `.sg-toggle` / `.slider`
 * CSS (A1); the native checkbox carries state + accessibility.
 */
export function Toggle({ checked, onChange, disabled, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <label className="sg-toggle">
      <input
        type="checkbox"
        checked={checked || false}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className="slider" />
    </label>
  );
}

export default Toggle;
