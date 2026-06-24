/**
 * @vitest-environment jsdom
 *
 * RED→GREEN — Sign-off & PINs (scanner reverse-consume) settings client.
 * Asserts the parity-checklist surface: the supervisor-PIN toggle renders, the
 * operator-PIN note is always shown, the RBAC read-only state disables editing,
 * the optimistic save commits on success and rolls back on failure, and the
 * helper copy flips with the toggle. i18n labels are injected (no inline copy).
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ScannerAuthPoliciesScreen,
  type ScannerAuthLabels,
} from '../scanner-auth-policies.client';

const labels: ScannerAuthLabels = {
  title: 'Sign-off & PINs',
  description: 'PIN and sign-off requirements for scanner operations.',
  reverseTitle: 'Scanner reverse-consume',
  reverseDescription: 'Supervisor sign-off on top of the operator PIN.',
  toggleLabel: 'Require supervisor PIN for scanner reverse',
  toggleHelpOn: 'Supervisor email + PIN required.',
  toggleHelpOff: 'Operator PIN only.',
  operatorNote: 'Operator always needs their own PIN + production.consumption.correct.',
  save: 'Save',
  saved: 'Scanner sign-off policy saved.',
  readOnly: 'You need admin rights to change scanner sign-off policies.',
  errorGeneric: 'Could not save. Try again.',
};

afterEach(() => cleanup());

describe('ScannerAuthPoliciesScreen', () => {
  it('renders the supervisor-PIN toggle, the ON help text, and the always-on operator note (no inline copy)', () => {
    render(
      <ScannerAuthPoliciesScreen
        policy={{ requireSupervisorPin: true }}
        canEdit
        labels={labels}
        setScannerReverseAuthPolicy={vi.fn()}
      />,
    );
    const toggle = screen.getByTestId('scanner-reverse-supervisor-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(labels.toggleHelpOn)).toBeInTheDocument();
    expect(screen.getByText(labels.operatorNote)).toBeInTheDocument();
  });

  it('permission-denied: read-only disables the toggle + save and shows the read-only notice', () => {
    render(
      <ScannerAuthPoliciesScreen
        policy={{ requireSupervisorPin: false }}
        canEdit={false}
        labels={labels}
        setScannerReverseAuthPolicy={vi.fn()}
      />,
    );
    expect(screen.getByTestId('scanner-reverse-supervisor-toggle')).toBeDisabled();
    expect(screen.getByRole('button', { name: labels.save })).toBeDisabled();
    expect(screen.getByText(labels.readOnly)).toBeInTheDocument();
    expect(screen.getByText(labels.toggleHelpOff)).toBeInTheDocument();
  });

  it('optimistic save: flipping the toggle then saving persists ON and surfaces the saved message', async () => {
    const setPolicy = vi.fn().mockResolvedValue({ ok: true, requireSupervisorPin: false });
    render(
      <ScannerAuthPoliciesScreen
        policy={{ requireSupervisorPin: true }}
        canEdit
        labels={labels}
        setScannerReverseAuthPolicy={setPolicy}
      />,
    );
    fireEvent.click(screen.getByTestId('scanner-reverse-supervisor-toggle'));
    fireEvent.click(screen.getByRole('button', { name: labels.save }));
    await waitFor(() => expect(setPolicy).toHaveBeenCalledWith({ requireSupervisorPin: false }));
    expect(await screen.findByText(labels.saved)).toBeInTheDocument();
  });

  it('save failure rolls the baseline back and shows the error', async () => {
    const setPolicy = vi.fn().mockResolvedValue({ ok: false, error: 'persistence_failed' });
    render(
      <ScannerAuthPoliciesScreen
        policy={{ requireSupervisorPin: true }}
        canEdit
        labels={labels}
        setScannerReverseAuthPolicy={setPolicy}
      />,
    );
    fireEvent.click(screen.getByTestId('scanner-reverse-supervisor-toggle'));
    fireEvent.click(screen.getByRole('button', { name: labels.save }));
    await waitFor(() => expect(setPolicy).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toHaveTextContent('persistence_failed');
  });
});
