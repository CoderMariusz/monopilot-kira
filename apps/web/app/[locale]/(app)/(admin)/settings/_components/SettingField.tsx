import React from 'react';

import { SRow } from './SRow';

export type SettingFieldProps = {
  /** Control id; the row label is associated to it via `htmlFor`. */
  id: string;
  /** Left-column label. */
  label: string;
  /** Optional hint under the label. */
  hint?: string;
  /** Current value (controlled). */
  value: string;
  /** Native input type (text/email/number/...). Defaults to `text`. */
  type?: React.InputHTMLAttributes<HTMLInputElement>['type'];
  /** Disables the input. */
  disabled?: boolean;
  /** Renders the input read-only. */
  readOnly?: boolean;
  /** Optional placeholder. */
  placeholder?: string;
  /** Fired with the new string value on input. */
  onChange?: (value: string) => void;
};

/**
 * Convenience text field = `SRow` + a label-associated native `<input>`.
 *
 * The input is a real native control (not shadcn) so the design-system rule
 * `.sg-field input { max-width: 420px }` (ported in A1) caps its width. The
 * label is wired to the input via `htmlFor`/`id` for accessibility.
 */
export function SettingField({
  id,
  label,
  hint,
  value,
  type = 'text',
  disabled,
  readOnly,
  placeholder,
  onChange,
}: SettingFieldProps) {
  return (
    <SRow label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        name={label}
        type={type}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    </SRow>
  );
}

export default SettingField;
