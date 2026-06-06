import React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { SRow } from './SRow';

export type SelectFieldOption = {
  value: string;
  label: string;
};

export type SelectFieldProps = {
  /** Control id; the row label is associated to the Select trigger via `htmlFor`. */
  id: string;
  /** Left-column label. */
  label: string;
  /** Optional hint under the label. */
  hint?: string;
  /** Dropdown options. */
  options: SelectFieldOption[];
  /** Current value (controlled). */
  value: string;
  /** Disables the select. */
  disabled?: boolean;
  /** Fired with the newly-selected value. */
  onChange?: (value: string) => void;
};

/**
 * Convenience select field = `SRow` + the shared `@monopilot/ui/Select`.
 *
 * Uses the fixed shadcn-style Select component (NOT a native `<select>`) so all
 * settings dropdowns stay on the one component a sibling agent is hardening for
 * production readability (A4). The trigger id is set to `id` and the row label
 * is wired to it via `htmlFor`.
 */
export function SelectField({ id, label, hint, options, value, disabled, onChange }: SelectFieldProps) {
  return (
    <SRow label={label} hint={hint} htmlFor={id}>
      <Select
        id={id}
        name={label}
        value={value}
        options={options}
        disabled={disabled}
        onValueChange={onChange}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SRow>
  );
}

export default SelectField;
