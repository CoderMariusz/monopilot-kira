import React, { useId, useState, useEffect, useRef } from 'react';
import Textarea from './Textarea.js';
import './ReasonInput.module.css';

/**
 * ReasonInput — textarea + character counter + minLength enforcement.
 *
 * Prototype source: prototypes/design/Monopilot Design System/settings/modals.jsx:72-108
 *   (FlagEditModal — "Audit reason" field) and the shared ReasonInput definition at
 *   prototypes/design/Monopilot Design System/_shared/modals.jsx:73-85.
 *
 * Submit-disabled mechanism (chosen approach):
 *   ReasonInput uses a container ref and a useEffect that walks
 *   `containerRef.current.parentElement.querySelectorAll('[type=submit]')`
 *   to set aria-disabled on any sibling submit button while length < minLength.
 *   This satisfies the test harness pattern where ReasonInput and a raw
 *   <button type="submit"> are siblings inside a plain <div>.
 *
 * T-067 (FT-007) additions:
 *   - `aria-label` prop forwarded to the underlying textarea (for cases where the
 *     label lives outside the component, e.g. a Field primitive wrap).
 *   - `label` prop renders a visible <label> wired to the textarea; when both
 *     `label` and `aria-label` are supplied the visible label wins and a dev-only
 *     console.warn fires once.
 *   - Component is `React.forwardRef`; the ref is forwarded to the underlying
 *     <textarea> (the focusable element) so callers can manage focus restoration.
 */
export interface ReasonInputProps {
  name: string;
  minLength?: number;
  placeholder?: string;
  /** Visible label rendered above the textarea and wired via htmlFor/id. */
  label?: string;
  /**
   * Accessible name applied directly to the textarea when no visible `label`
   * is rendered. If both `label` and `aria-label` are provided the visible
   * label takes precedence and a dev-only warning is emitted.
   */
  'aria-label'?: string;
}

const ReasonInput = React.forwardRef<HTMLTextAreaElement, ReasonInputProps>(
  function ReasonInput(
    { name, minLength = 10, placeholder, label, 'aria-label': ariaLabel },
    ref,
  ) {
    const [value, setValue] = useState('');
    const reactId = useId().replace(/[^a-zA-Z0-9-_]/g, '');
    const counterId = reactId + '-reason-counter';
    const labelId = reactId + '-reason-label';
    const containerRef = useRef<HTMLDivElement>(null);

    const isValid = value.length >= minLength;
    const hasVisibleLabel = typeof label === 'string' && label.length > 0;

    // Dev-only: warn once if both a visible label and aria-label are supplied.
    useEffect(() => {
      if (
        process.env.NODE_ENV !== 'production' &&
        hasVisibleLabel &&
        typeof ariaLabel === 'string' &&
        ariaLabel.length > 0
      ) {
        console.warn(
          'ReasonInput: both `label` and `aria-label` were provided. ' +
            'The visible `label` takes precedence and `aria-label` is ignored.',
        );
      }
    }, [hasVisibleLabel, ariaLabel]);

    // Walk sibling submit buttons and set aria-disabled accordingly.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const parent = container.parentElement;
      if (!parent) return;

      const submitButtons = parent.querySelectorAll<HTMLButtonElement>('[type=submit]');
      submitButtons.forEach((btn) => {
        if (!isValid) {
          btn.setAttribute('aria-disabled', 'true');
        } else {
          btn.setAttribute('aria-disabled', 'false');
        }
      });
    }, [isValid]);

    // Accessible-name resolution: a visible label wins; otherwise fall back to
    // the aria-label (so the textarea always has an accessible name).
    const textareaProps: React.TextareaHTMLAttributes<HTMLTextAreaElement> = {
      name,
      value,
      placeholder,
      'aria-describedby': counterId,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value),
    };

    if (hasVisibleLabel) {
      textareaProps.id = name;
      textareaProps['aria-labelledby'] = labelId;
    } else if (typeof ariaLabel === 'string' && ariaLabel.length > 0) {
      textareaProps['aria-label'] = ariaLabel;
    }

    return (
      <div ref={containerRef}>
        {hasVisibleLabel ? (
          <label id={labelId} htmlFor={name} data-testid="reason-input-label">
            {label}
          </label>
        ) : null}
        <Textarea ref={ref} {...textareaProps} />
        <span
          data-testid="reason-input-counter"
          id={counterId}
          className="reason-input-counter"
        >
          {value.length}/{minLength}+
        </span>
      </div>
    );
  },
);

ReasonInput.displayName = 'ReasonInput';

export default ReasonInput;
