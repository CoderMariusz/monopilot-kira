/**
 * @vitest-environment jsdom
 * T-109 — GateApprovalModal PARITY EVIDENCE capture.
 *
 * Writes per-state DOM snapshots to _meta/parity-evidence/T-109/<state>.html so the closeout has
 * structural-parity artifacts (the project convention; see _meta/parity-evidence/T-021/*, T-107/*).
 * Playwright route-level capture is owned by T-112 (out of scope here) — this is the RTL/DOM fallback
 * documented in _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Prototype parity source: prototypes/design/Monopilot Design System/npd/gate-screens.jsx:378-522.
 */

import React from 'react';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const labels: Record<string, string> = {
  title: 'Gate Approval',
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

const OUT_DIR = resolve(__dirname, '../../../../../../_meta/parity-evidence/T-109');

const PROJECT: GateApprovalProject = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'NPD-2025-014',
  name: 'Smoked Applewood Cheddar',
  gateCode: 'G3',
  requiredDone: 6,
  requiredTotal: 8,
  pct: 75,
};

function write(state: string, html: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${state}.html`), `<!-- T-109 GateApprovalModal · state=${state} · prototype gate-screens.jsx:378-522 -->\n${html}\n`);
}

const noop = async () => ({ ok: true as const });

afterEach(() => cleanup());

describe('T-109 parity evidence — per-state DOM snapshots', () => {
  it('captures ready (decision step, approve default)', () => {
    const { container } = render(<GateApprovalModal open project={PROJECT} status="ready" onApprove={noop} onClose={() => {}} />);
    write('ready-decision', container.innerHTML);
    expect(container.querySelector('[data-testid="gate-transition-card"]')).not.toBeNull();
  });

  it('captures reject decision (red/dashed transition)', async () => {
    const user = userEvent.setup();
    const { container } = render(<GateApprovalModal open project={PROJECT} status="ready" onApprove={noop} onClose={() => {}} />);
    await user.click(screen.getByRole('radio', { name: /Reject Gate Advancement/i }));
    write('reject-decision', container.innerHTML);
    expect(container.querySelector('[data-decision="reject"]')).not.toBeNull();
  });

  it('captures e-signature overlay (approve path)', async () => {
    const user = userEvent.setup();
    const { container } = render(<GateApprovalModal open project={PROJECT} status="ready" onApprove={noop} onClose={() => {}} />);
    await user.type(screen.getByRole('textbox'), 'Cost within target, proceed.');
    await user.click(screen.getByRole('button', { name: /Submit Approval/i }));
    write('esign-overlay', container.innerHTML);
    expect(container.querySelector('[data-testid="gate-approval-esign"]')).not.toBeNull();
  });

  it('captures submitted confirmation', async () => {
    const user = userEvent.setup();
    const { container } = render(<GateApprovalModal open project={PROJECT} status="ready" onApprove={noop} onClose={() => {}} />);
    await user.type(screen.getByRole('textbox'), 'Cost within target, proceed.');
    await user.click(screen.getByRole('button', { name: /Submit Approval/i }));
    await user.type(screen.getByLabelText(/Password/i), 'good-pin');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Confirm & Sign/i }));
    await screen.findByText('Gate advancement approved');
    write('submitted', container.innerHTML);
  });

  it('captures loading', () => {
    const { container } = render(<GateApprovalModal open project={PROJECT} status="loading" onApprove={noop} onClose={() => {}} />);
    write('loading', container.innerHTML);
    expect(container.querySelector('[data-testid="gate-approval-loading"]')).not.toBeNull();
  });

  it('captures empty', () => {
    const { container } = render(<GateApprovalModal open project={PROJECT} status="empty" onApprove={noop} onClose={() => {}} />);
    write('empty', container.innerHTML);
    expect(container.querySelector('[data-testid="gate-approval-empty"]')).not.toBeNull();
  });

  it('captures error', () => {
    const { container } = render(<GateApprovalModal open project={PROJECT} status="error" onApprove={noop} onClose={() => {}} />);
    write('error', container.innerHTML);
  });

  it('captures permission-denied', () => {
    const { container } = render(<GateApprovalModal open project={PROJECT} status="forbidden" onApprove={noop} onClose={() => {}} />);
    write('permission-denied', container.innerHTML);
    expect(container.querySelector('[data-testid="gate-approval-forbidden"]')).not.toBeNull();
  });
});
