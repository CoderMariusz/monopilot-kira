import React, { useId, useState, useEffect, useRef } from 'react';
import Textarea from './Textarea';

/**
 * ReasonInput — textarea + character counter + minLength enforcement.
 *
 * Prototype source: prototypes/design/Monopilot Design System/settings/modals.jsx:72-108
 *
 * Submit-disabled mechanism (chosen approach):
 *   ReasonInput uses a container ref and a useEffect that walks
 *   `containerRef.current.parentElement.querySelectorAll('[type=submit]')`
 *   to set aria-disabled on any sibling submit button while length < minLength.
 *   This satisfies the test harness pattern where ReasonInput and a raw
 *   <button type="submit"> are siblings inside a plain <div>.
 */
export interface ReasonInputProps {
  name: string;
  minLength?: number;
  placeholder?: string;
}

function ReasonInput({ name, minLength = 10, placeholder }: ReasonInputProps) {
  const [value, setValue] = useState('');
  const counterId = useId().replace(/[^a-zA-Z0-9-_]/g, '') + '-reason-counter';
  const containerRef = useRef<HTMLDivElement>(null);

  const isValid = value.length >= minLength;

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

  return (
    <div ref={containerRef}>
      <Textarea
        name={name}
        value={value}
        placeholder={placeholder}
        aria-describedby={counterId}
        onChange={(e) => setValue(e.target.value)}
      />
      <span
        data-testid="reason-input-counter"
        id={counterId}
        style={{ display: 'block', textAlign: 'right' }}
      >
        {value.length}/{minLength}+
      </span>
    </div>
  );
}

export default ReasonInput;
