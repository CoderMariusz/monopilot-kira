/**
 * W9-L7 — RTL tests for the "E-sign & scanner PIN" settings screen (jsdom).
 * Status display (never the PIN), honest shared-PIN copy, set/change form
 * submit wiring, error + success surfaces, lockout display.
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import PinScreen, { type PinScreenLabels } from '../pin-screen.client';
import type { PinStatus } from '../pin-data';

const LABELS: PinScreenLabels = {
  title: 'E-sign & scanner PIN',
  subtitle: 'Manage the PIN used for scanner login and electronic signatures.',
  sharedNotice:
    'One shared PIN: this same PIN is used for BOTH scanner login and e-signatures (CFR 21 Part 11).',
  statusTitle: 'PIN status',
  statusSet: 'PIN is set',
  statusNotSet: 'No PIN set',
  statusError: 'PIN status could not be loaded.',
  lockedUntilText: null,
  failedAttemptsText: null,
  formTitleSet: 'Change PIN',
  formTitleNotSet: 'Set PIN',
  authMethod: 'Authorize with',
  authPassword: 'Account password',
  authPin: 'Current PIN',
  currentPassword: 'Current account password',
  currentPin: 'Current PIN',
  newPin: 'New PIN (4–6 digits)',
  confirmPin: 'Repeat new PIN',
  submit: 'Save PIN',
  submitting: 'Saving…',
  success: 'PIN saved. It now applies to scanner login and e-signatures.',
  errors: {
    invalid_pin_format: 'The PIN must be 4–6 digits.',
    invalid_credentials: 'Invalid password or PIN',
    pin_locked: 'The PIN is temporarily locked.',
  },
  errorFallback: 'Saving the PIN failed. Try again.',
};

const NO_PIN: PinStatus = { state: 'ready', pinSet: false, lockedUntil: null, failedAttempts: 0, updatedAt: null };
const WITH_PIN: PinStatus = { state: 'ready', pinSet: true, lockedUntil: null, failedAttempts: 0, updatedAt: '2026-06-11T08:00:00.000Z' };

describe('PinScreen', () => {
  it('shows "No PIN set", the honest shared-PIN copy, and disables PIN-based auth when no PIN exists', () => {
    render(<PinScreen labels={LABELS} status={NO_PIN} setEsignPin={vi.fn()} />);

    expect(screen.getByTestId('account-pin-status-badge')).toHaveTextContent('No PIN set');
    expect(screen.getByTestId('account-pin-shared-notice')).toHaveTextContent(
      /BOTH scanner login and e-signatures/,
    );
    expect(screen.getByText('Set PIN')).toBeInTheDocument();
    expect(screen.getByTestId('account-pin-auth-pin')).toBeDisabled();
    expect(screen.getByTestId('account-pin-auth-password')).toBeChecked();
  });

  it('shows "PIN is set" + Change PIN and enables current-PIN authorization', () => {
    render(<PinScreen labels={LABELS} status={WITH_PIN} setEsignPin={vi.fn()} />);

    expect(screen.getByTestId('account-pin-status-badge')).toHaveTextContent('PIN is set');
    expect(screen.getByText('Change PIN')).toBeInTheDocument();
    expect(screen.getByTestId('account-pin-auth-pin')).toBeEnabled();
  });

  it('renders the lockout line when the server reports an active lock', () => {
    render(
      <PinScreen
        labels={{ ...LABELS, lockedUntilText: 'Locked until 2026-06-11 09:00 (UTC).', failedAttemptsText: 'Failed attempts in the current window: 6' }}
        status={{ ...WITH_PIN, lockedUntil: '2026-06-11T09:00:00.000Z', failedAttempts: 6 }}
        setEsignPin={vi.fn()}
      />,
    );

    expect(screen.getByTestId('account-pin-locked')).toHaveTextContent('Locked until 2026-06-11 09:00');
    expect(screen.getByTestId('account-pin-attempts')).toHaveTextContent('6');
  });

  it('submits the password-authorized payload and shows success + flips status to set', async () => {
    const user = userEvent.setup();
    const setEsignPin = vi.fn().mockResolvedValue({ ok: true, pinSet: true });
    render(<PinScreen labels={LABELS} status={NO_PIN} setEsignPin={setEsignPin} />);

    await user.type(screen.getByTestId('account-pin-current-secret'), 'Admin2026!!!');
    await user.type(screen.getByTestId('account-pin-new'), '4711');
    await user.type(screen.getByTestId('account-pin-confirm'), '4711');
    await user.click(screen.getByTestId('account-pin-submit'));

    await waitFor(() =>
      expect(setEsignPin).toHaveBeenCalledWith({
        authMethod: 'password',
        currentSecret: 'Admin2026!!!',
        newPin: '4711',
        confirmPin: '4711',
      }),
    );
    expect(await screen.findByTestId('account-pin-success')).toHaveTextContent(/PIN saved/);
    expect(screen.getByTestId('account-pin-status-badge')).toHaveTextContent('PIN is set');
  });

  it('maps a server error code to its inline i18n copy (role=alert)', async () => {
    const user = userEvent.setup();
    const setEsignPin = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_credentials' });
    render(<PinScreen labels={LABELS} status={WITH_PIN} setEsignPin={setEsignPin} />);

    await user.type(screen.getByTestId('account-pin-current-secret'), 'wrong');
    await user.type(screen.getByTestId('account-pin-new'), '4711');
    await user.type(screen.getByTestId('account-pin-confirm'), '4711');
    await user.click(screen.getByTestId('account-pin-submit'));

    const alert = await screen.findByTestId('account-pin-error');
    expect(alert).toHaveTextContent('Invalid password or PIN');
    expect(alert).toHaveAttribute('role', 'alert');
  });

  it('renders the status-error shell when the server read failed', () => {
    render(
      <PinScreen
        labels={LABELS}
        status={{ state: 'error', pinSet: false, lockedUntil: null, failedAttempts: 0, updatedAt: null }}
        setEsignPin={vi.fn()}
      />,
    );

    expect(screen.getByTestId('account-pin-status-error')).toHaveTextContent(
      'PIN status could not be loaded.',
    );
  });
});
