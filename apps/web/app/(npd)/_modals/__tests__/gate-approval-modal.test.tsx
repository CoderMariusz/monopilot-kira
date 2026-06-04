/**
 * @vitest-environment jsdom
 *
 * T-109 — GateApprovalModal RED tests.
 *
 * Prototype source (literal anchor, verified with `wc -l`: gate-screens.jsx = 616 lines):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:378-522 (GateApprovalModal)
 *
 * Parity checklist (structural + visual + interaction):
 *   - project header card (code mono + name)
 *   - gate-transition card (current gate badge → next gate; red/dashed visual on reject)
 *   - checklist-completion Progress bar (role=progressbar) + "{done} of {total} required complete"
 *   - decision radios (approve default / reject) — accessible radio group
 *   - notes Textarea, required min 10 trimmed chars, label switches approve/reject
 *   - e-signature overlay shown ONLY on approve submit: password Input (type=password) +
 *     confirmation Checkbox + Confirm&Sign disabled until both filled
 *   - reject path NEVER renders the password field and calls the action once with decision=rejected
 *
 * Real-data wiring: the modal calls the merged `approveProjectGate` Server Action
 * (T-058) which handles BOTH approve and reject via the `decision` discriminator.
 * There is no separate `rejectProjectGate` action (see deviation log in closeout).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── i18n stub (repo convention: mock next-intl useTranslations) ──
const labels: Record<string, string> = {
  title: 'Gate Approval',
  projectHeaderEyebrow: 'Project',
  gateTransition: 'Gate Transition',
  checklistCompletion: 'Checklist Completion',
  requiredComplete: '{done} of {total} required items complete',
  decision: 'Decision',
  approveOption: 'Approve Gate Advancement',
  rejectOption: 'Reject Gate Advancement',
  rejectWarning: 'Rejection — project remains at {gate}: {label}',
  approvalNotes: 'Approval Notes',
  rejectionReason: 'Rejection Reason',
  approvalNotesPlaceholder: 'Basis for approval (min 10 chars)…',
  rejectionReasonPlaceholder: 'Explain why this gate is being rejected…',
  notesTooShort: 'Minimum 10 characters required',
  notesHelp: 'Required for audit trail',
  submitApproval: 'Submit Approval',
  submitRejection: 'Submit Rejection',
  processing: 'Processing…',
  cancel: 'Cancel',
  esignTitle: 'E-Signature Required',
  esignSubtitle: 'Confirm your identity. This creates a legally-binding audit record.',
  passwordLabel: 'Password',
  passwordPlaceholder: 'Enter your password',
  esignConfirm: 'I confirm this gate approval and understand it creates an auditable signature record.',
  back: 'Back',
  confirmSign: 'Confirm & Sign',
  doneApproved: 'Gate advancement approved',
  doneRejected: 'Gate advancement rejected',
  doneDetail: 'Notification sent · Audit log updated',
  errorEsign: 'Signature verification failed. Check your password and try again.',
  errorBlockers: 'Required checklist items are incomplete — resolve blockers before approving.',
  errorGeneric: 'Could not record the gate decision. Try again.',
  forbidden: 'You do not have permission to approve gates.',
  loading: 'Loading gate details…',
  empty: 'No gate is awaiting approval for this project.',
  gateLabelG3: 'Development',
  gateLabelG4: 'Testing',
  nextLabelG3: 'Testing',
  nextLabelG4: 'Launched',
};

function t(key: string, values?: Record<string, string | number>) {
  return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
}

vi.mock('next-intl', () => ({ useTranslations: () => t }));

// Mock the @monopilot/ui Modal so footer + body render directly in the container.
vi.mock('@monopilot/ui/Modal', async () => {
  function Modal({ children, open }: { children: React.ReactNode; open: boolean }) {
    if (!open) return null;
    return (
      <div role="dialog" aria-modal="true">
        {children}
      </div>
    );
  }
  Modal.Header = ({ title }: { title: string }) => <h2>{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-body">{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-footer">{children}</div>;
  return { default: Modal };
});

import { GateApprovalModal, type GateApprovalProject } from '../gate-approval-modal';

const project: GateApprovalProject = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'NPD-2025-014',
  name: 'Smoked Applewood Cheddar',
  gateCode: 'G3',
  requiredDone: 6,
  requiredTotal: 8,
  pct: 75,
};

function renderModal(overrides: Partial<React.ComponentProps<typeof GateApprovalModal>> = {}) {
  const onApprove = vi.fn(async () => ({ ok: true as const }));
  const onClose = vi.fn();
  render(
    <GateApprovalModal
      open
      project={project}
      status="ready"
      onApprove={onApprove}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onApprove, onClose };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GateApprovalModal — parity (gate-screens.jsx:378-522)', () => {
  it('renders project header, gate-transition, checklist progress, decision radios and notes', () => {
    renderModal();
    // project header
    expect(screen.getByText('NPD-2025-014')).toBeInTheDocument();
    expect(screen.getByText('Smoked Applewood Cheddar')).toBeInTheDocument();
    // gate transition region
    expect(screen.getByText('Gate Transition')).toBeInTheDocument();
    // checklist progress
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('6 of 8 required items complete')).toBeInTheDocument();
    // decision radios (approve default)
    const approve = screen.getByRole('radio', { name: /Approve Gate Advancement/i });
    const reject = screen.getByRole('radio', { name: /Reject Gate Advancement/i });
    expect(approve).toBeChecked();
    expect(reject).not.toBeChecked();
    // notes
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('Submit Approval is disabled until notes have >= 10 trimmed chars', async () => {
    const user = userEvent.setup();
    renderModal();
    const submit = screen.getByRole('button', { name: /Submit Approval/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole('textbox'), '   short  ');
    expect(submit).toBeDisabled();
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'Looks great, approved.');
    expect(submit).toBeEnabled();
  });
});

describe('GateApprovalModal — approve e-signature gate', () => {
  it('shows e-sign overlay (password + checkbox) on approve submit; Confirm&Sign gated; invokes onApprove', async () => {
    const user = userEvent.setup();
    const { onApprove } = renderModal();
    await user.type(screen.getByRole('textbox'), 'Cost within target, proceed.');
    await user.click(screen.getByRole('button', { name: /Submit Approval/i }));

    // overlay present
    expect(screen.getByText(/E-Signature Required/i)).toBeInTheDocument();
    const pwd = screen.getByLabelText(/Password/i);
    expect(pwd).toHaveAttribute('type', 'password');
    const confirmCheckbox = screen.getByRole('checkbox');
    const sign = screen.getByRole('button', { name: /Confirm & Sign/i });
    expect(sign).toBeDisabled();

    await user.type(pwd, 'Sup3r-Secret');
    expect(sign).toBeDisabled(); // checkbox still unchecked
    await user.click(confirmCheckbox);
    expect(sign).toBeEnabled();

    await user.click(sign);
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith({
      projectId: project.id,
      gateCode: 'G3',
      decision: 'approved',
      notes: 'Cost within target, proceed.',
      password: 'Sup3r-Secret',
    });
  });
});

describe('GateApprovalModal — reject path (no password)', () => {
  it('rejects via decision=rejected without ever rendering a password field', async () => {
    const user = userEvent.setup();
    const { onApprove } = renderModal();
    await user.click(screen.getByRole('radio', { name: /Reject Gate Advancement/i }));
    await user.type(screen.getByRole('textbox'), 'Allergen validation incomplete.');
    await user.click(screen.getByRole('button', { name: /Submit Rejection/i }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith({
      projectId: project.id,
      gateCode: 'G3',
      decision: 'rejected',
      notes: 'Allergen validation incomplete.',
    });
    // password field NEVER rendered on the reject path
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();
  });
});

describe('GateApprovalModal — states + a11y', () => {
  it('renders loading state', () => {
    renderModal({ status: 'loading' });
    expect(screen.getByText('Loading gate details…')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    renderModal({ status: 'empty' });
    expect(screen.getByText('No gate is awaiting approval for this project.')).toBeInTheDocument();
  });

  it('renders permission-denied state and hides the submit action', () => {
    renderModal({ status: 'forbidden' });
    expect(screen.getByText('You do not have permission to approve gates.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit Approval/i })).not.toBeInTheDocument();
  });

  it('surfaces a mutation error code as an i18n message (never the raw error)', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn(async () => ({ ok: false as const, error: 'ESIGN_FAILED' }));
    renderModal({ onApprove });
    await user.type(screen.getByRole('textbox'), 'Approved with confidence.');
    await user.click(screen.getByRole('button', { name: /Submit Approval/i }));
    await user.type(screen.getByLabelText(/Password/i), 'wrong-pin');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Confirm & Sign/i }));
    expect(await screen.findByText('Signature verification failed. Check your password and try again.')).toBeInTheDocument();
    expect(screen.queryByText('ESIGN_FAILED')).not.toBeInTheDocument();
  });

  it('shows optimistic processing feedback then a success confirmation on approve', async () => {
    const user = userEvent.setup();
    let resolveApprove: (v: { ok: true }) => void = () => {};
    const onApprove = vi.fn(
      () => new Promise<{ ok: true }>((res) => { resolveApprove = res; }),
    );
    renderModal({ onApprove });
    await user.type(screen.getByRole('textbox'), 'Approved with confidence.');
    await user.click(screen.getByRole('button', { name: /Submit Approval/i }));
    await user.type(screen.getByLabelText(/Password/i), 'good-pin');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Confirm & Sign/i }));
    // optimistic processing label
    expect(screen.getByText('Processing…')).toBeInTheDocument();
    resolveApprove({ ok: true });
    expect(await screen.findByText('Gate advancement approved')).toBeInTheDocument();
  });
});

describe('GateApprovalModal — reject visual', () => {
  it('marks the gate-transition card as a rejection when reject is selected', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('radio', { name: /Reject Gate Advancement/i }));
    const card = screen.getByTestId('gate-transition-card');
    expect(card).toHaveAttribute('data-decision', 'reject');
    const region = within(screen.getByTestId('modal-body'));
    expect(region.getByText(/Rejection — project remains at G3/i)).toBeInTheDocument();
  });
});
