'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Toggle } from '../../_components';
import { upsertCriterionConfig as upsertCriterionConfigAction } from '../_actions/upsert-criterion-config';

type UpsertCriterionConfigAction = (input: {
  criterionKey: string;
  required: boolean;
}) => Promise<{ ok: true } | { ok: false; code: string }>;

export type CriterionToggleProps = {
  /** Criterion key, e.g. "C1". */
  criterionKey: string;
  /** Human label used to derive the toggle aria-label. */
  label: string;
  /** Current required state from the server loader. */
  required: boolean;
  /** Aria-label suffix (e.g. "Required") so each row toggle is uniquely named. */
  toggleLabel: string;
  /** Inline error message shown on a failed save. */
  errorMessage: string;
  /** Saving label announced while the mutation is in flight. */
  savingLabel: string;
  /** Injectable action for tests; defaults to the reviewed server action. */
  action?: UpsertCriterionConfigAction;
};

/**
 * Required toggle island for a single NPD approval criterion.
 *
 * On change it optimistically flips local state, calls
 * {@link upsertCriterionConfig}, shows a pending state, and `router.refresh()`
 * on `{ ok: true }`. On `{ ok: false }` (or a thrown error) it reverts the
 * optimistic state and renders an inline `role="alert"`. Never throws.
 */
export function CriterionToggle({
  criterionKey,
  label,
  required,
  toggleLabel,
  errorMessage,
  savingLabel,
  action = upsertCriterionConfigAction as unknown as UpsertCriterionConfigAction,
}: CriterionToggleProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(required);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleChange(next: boolean) {
    if (isPending) return;
    const previous = checked;
    setChecked(next); // optimistic
    setError(null);
    try {
      const result = await action({ criterionKey, required: next });
      if (result.ok) {
        startTransition(() => {
          router.refresh();
        });
        return;
      }
      setChecked(previous);
      setError(errorMessage);
    } catch {
      setChecked(previous);
      setError(errorMessage);
    }
  }

  return (
    <div
      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
      data-testid={`criterion-toggle-${criterionKey}`}
    >
      <Toggle
        aria-label={`${label} ${toggleLabel}`}
        checked={checked}
        disabled={isPending}
        onChange={(value) => void handleChange(value)}
      />
      {isPending ? (
        <span className="muted" role="status" data-testid={`criterion-saving-${criterionKey}`}>
          {savingLabel}
        </span>
      ) : null}
      {error ? (
        <span className="alert alert-red" role="alert" data-testid={`criterion-error-${criterionKey}`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default CriterionToggle;
