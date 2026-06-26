/**
 * @vitest-environment jsdom
 *
 * GateRevertModal — revert-one-gate e-sign control (RED → GREEN).
 *
 * There is NO prototype for this control; parity is achieved by REUSING the existing
 * in-app e-sign modal pattern (GateApprovalModal — apps/web/app/(npd)/_modals/
 * gate-approval-modal.tsx): a required reason Textarea + a password/PIN Input + a
 * confirmation Checkbox, with per-code error mapping and an optimistic submit label.
 *
 * Asserts:
 *  - parity checklist: project header + reason textarea + PIN input + confirm checkbox render.
 *  - submit is gated until reason (≥5 chars) + PIN + confirm are all provided (a clean
 *    disabled state, not a thrown error).
 *  - a successful revert calls revertNpdGate with { projectId, reason, pin } and fires
 *    onReverted (the host maps this to close + router.refresh).
 *  - error state: the action's NPD_RELEASE_LOCKED code maps to the friendly i18n message
 *    (mirrors the action guard so the user gets a clear state, not a raw code).
 *  - RBAC: status='forbidden' renders the server-resolved permission-denied shell.
 *  - i18n: every visible string is a LABEL key (no inline English literals).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── next-intl: echo the key (+ values) so we assert on label KEYS, never literals. ──
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(',')})`
      : key,
}));

// ── @monopilot/ui/Modal: render body/footer inline when open (jsdom-friendly). ──
vi.mock('@monopilot/ui/Modal', () => {
  function Modal({ children, open, modalId }: { children: React.ReactNode; open: boolean; modalId?: string }) {
    if (!open) return null;
    return (
      <div role="dialog" aria-modal="true" data-modal-id={modalId}>
        {children}
      </div>
    );
  }
  Modal.Header = ({ title }: { title: string }) => <h2>{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-body">{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-footer">{children}</div>;
  return { __esModule: true, default: Modal };
});

import { GateRevertModal, type RevertProjectGateAction } from '../gate-revert-modal';

const PROJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'DEV-123',
  name: 'Apex sausage roll',
  currentGateLabel: 'G3 — Development',
};

function renderModal(overrides: Partial<React.ComponentProps<typeof GateRevertModal>> = {}) {
  const onReverted = vi.fn();
  const onClose = vi.fn();
  const revertProjectGate: RevertProjectGateAction =
    (overrides.revertProjectGate as RevertProjectGateAction) ?? vi.fn(async () => ({ success: true as const }));
  render(
    <GateRevertModal
      open
      project={PROJECT}
      status="ready"
      revertProjectGate={revertProjectGate}
      onReverted={onReverted}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onReverted, onClose, revertProjectGate };
}

afterEach(() => cleanup());

describe('GateRevertModal', () => {
  it('parity: renders the project header, reason textarea, PIN input and confirm checkbox', () => {
    renderModal();
    expect(screen.getByTestId('gate-revert-project')).toHaveTextContent('DEV-123');
    expect(screen.getByTestId('gate-revert-project')).toHaveTextContent('Apex sausage roll');
    expect(document.getElementById('gate-revert-reason')).toBeInTheDocument();
    const pin = document.getElementById('gate-revert-pin') as HTMLInputElement;
    expect(pin).toBeInTheDocument();
    expect(pin.type).toBe('password'); // PIN never rendered as text
    expect(screen.getByLabelText('confirm')).toBeInTheDocument();
  });

  it('gates submit until reason + PIN + confirm are all provided (clean disabled state)', async () => {
    const user = userEvent.setup();
    renderModal();
    const submit = screen.getByTestId('gate-revert-submit');
    expect(submit).toBeDisabled();

    await user.type(document.getElementById('gate-revert-reason')!, 'Wrong gate advance');
    expect(submit).toBeDisabled(); // still need PIN + confirm
    await user.type(document.getElementById('gate-revert-pin')!, '1234');
    expect(submit).toBeDisabled(); // still need confirm
    await user.click(screen.getByLabelText('confirm'));
    expect(submit).toBeEnabled();
  });

  it('calls revertNpdGate with { projectId, reason, pin } and fires onReverted on success', async () => {
    const user = userEvent.setup();
    const revertProjectGate = vi.fn(async () => ({ success: true as const }));
    const { onReverted } = renderModal({ revertProjectGate });

    await user.type(document.getElementById('gate-revert-reason')!, 'Reverting — wrong gate');
    await user.type(document.getElementById('gate-revert-pin')!, '4321');
    await user.click(screen.getByLabelText('confirm'));
    await user.click(screen.getByTestId('gate-revert-submit'));

    expect(revertProjectGate).toHaveBeenCalledTimes(1);
    expect(revertProjectGate).toHaveBeenCalledWith({
      projectId: PROJECT.id,
      reason: 'Reverting — wrong gate',
      pin: '4321',
    });
    expect(onReverted).toHaveBeenCalled();
    expect(screen.getByTestId('gate-revert-done')).toBeInTheDocument();
  });

  it('maps NPD_RELEASE_LOCKED to the friendly error and keeps the modal open', async () => {
    const user = userEvent.setup();
    const revertProjectGate = vi.fn(async () => ({
      success: false as const,
      error: 'NPD_RELEASE_LOCKED',
      status: 409,
    }));
    const { onReverted } = renderModal({ revertProjectGate });

    await user.type(document.getElementById('gate-revert-reason')!, 'Reverting locked project');
    await user.type(document.getElementById('gate-revert-pin')!, '4321');
    await user.click(screen.getByLabelText('confirm'));
    await user.click(screen.getByTestId('gate-revert-submit'));

    const err = await screen.findByTestId('gate-revert-error');
    expect(err).toHaveTextContent('errorReleaseLocked');
    expect(onReverted).not.toHaveBeenCalled();
    expect(screen.queryByTestId('gate-revert-done')).not.toBeInTheDocument();
  });

  it('RBAC: status=forbidden renders the permission-denied shell (no form)', () => {
    renderModal({ status: 'forbidden', revertProjectGate: undefined });
    expect(screen.getByTestId('gate-revert-forbidden')).toBeInTheDocument();
    expect(document.getElementById('gate-revert-pin')).not.toBeInTheDocument();
  });
});
