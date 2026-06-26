/**
 * @vitest-environment jsdom
 * NPD approval criterion Required-toggle island RTL test.
 *
 * Net-new admin settings island: a per-criterion Required toggle that calls the
 * reviewed `upsertCriterionConfig` server action via an injectable `action`
 * prop, shows pending, refreshes on `{ ok: true }`, and renders an inline
 * `role="alert"` on `{ ok: false }` without ever throwing.
 *
 * Parity checklist coverage:
 *  - renders the design-system `.sg-toggle` (Toggle primitive) with the seeded state
 *  - optimistic state + server-action call on change (write path / RBAC surface)
 *  - error state: `{ ok: false }` reverts + shows role="alert"
 *  - never throws when the action rejects
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The action is injected per-test, but the module still imports the real server
// action at top level — stub it so the jsdom test never pulls the DB context.
vi.mock('../_actions/upsert-criterion-config', () => ({
  upsertCriterionConfig: vi.fn(async () => ({ ok: true as const })),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import { CriterionToggle } from './criterion-toggle.client';

const baseProps = {
  criterionKey: 'C7',
  label: 'Microbiological testing',
  required: true,
  toggleLabel: 'Required',
  errorMessage: 'Could not update this criterion. Try again.',
  savingLabel: 'Saving…',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CriterionToggle', () => {
  it('renders the toggle seeded from the required prop', () => {
    render(<CriterionToggle {...baseProps} />);
    expect(screen.getByLabelText('Microbiological testing Required')).toBeChecked();
  });

  it('calls upsertCriterionConfig with the criterion key + new required value on change', async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(<CriterionToggle {...baseProps} action={action} />);

    fireEvent.click(screen.getByLabelText('Microbiological testing Required'));

    await waitFor(() => {
      expect(action).toHaveBeenCalledWith({ criterionKey: 'C7', required: false });
    });
    // optimistic flip
    expect(screen.getByLabelText('Microbiological testing Required')).not.toBeChecked();
  });

  it('refreshes the route on { ok: true }', async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(<CriterionToggle {...baseProps} action={action} />);

    fireEvent.click(screen.getByLabelText('Microbiological testing Required'));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('criterion-error-C7')).not.toBeInTheDocument();
  });

  it('reverts and shows an inline role="alert" on { ok: false } without throwing', async () => {
    const action = vi.fn(async () => ({ ok: false as const, code: 'forbidden' }));
    render(<CriterionToggle {...baseProps} action={action} />);

    fireEvent.click(screen.getByLabelText('Microbiological testing Required'));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Could not update this criterion. Try again.');
    });
    // reverted to original checked state
    expect(screen.getByLabelText('Microbiological testing Required')).toBeChecked();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('never throws when the action rejects', async () => {
    const action = vi.fn(async () => {
      throw new Error('network down');
    });
    render(<CriterionToggle {...baseProps} action={action} />);

    fireEvent.click(screen.getByLabelText('Microbiological testing Required'));

    await waitFor(() => {
      expect(screen.getByTestId('criterion-error-C7')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Microbiological testing Required')).toBeChecked();
  });
});
