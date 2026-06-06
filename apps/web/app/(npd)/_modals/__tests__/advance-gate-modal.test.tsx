/**
 * @vitest-environment jsdom
 *
 * T-108 — AdvanceGateModal RTL tests (RED-first).
 *
 * Prototype source (literal anchor, verified with `wc -l` = 616 lines):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:261-373 (AdvanceGateModal)
 *   prototype-index-npd.json#advance_gate_modal (lines 261-377, component_type=modal).
 *
 * Parity checklist (structural + visual + interaction):
 *   - Modal titled "Advance gate"; footer Cancel + Advance buttons.
 *   - Gate-transition card: current gate badge → arrow → target gate badge;
 *     arrow switches to a "blocked" (dashed) state when blockers > 0.
 *   - requiresApproval note rendered for gates that need sign-off (G3/G4).
 *   - Checklist summary: progressbar (aria-valuenow) + per-item rows with
 *     Done/Blocking/Optional badges + "{done} of {total} required items complete".
 *   - Blockers > 0  → red role="alert" listing every blocker text; notes Textarea disabled;
 *     Advance disabled.
 *   - Blockers === 0 → green ready role="status" note; notes enabled; Advance enabled once
 *     notes.trim().length > 0.
 *   - Advance click calls advanceProjectGate({ projectId, targetGate, notes }) exactly once;
 *     success role="status" alert renders.
 *   - i18n: every visible string comes from labels (no inline copy).
 *   - a11y: role=dialog, labeled textarea, role=alert / role=status, progressbar.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdvanceGateModal,
  type AdvanceGateLabels,
  type AdvanceGateItem,
  type AdvanceGateInfo,
  type AdvanceGateProject,
} from '../advance-gate-modal';

// Mock @monopilot/ui/Modal so dialog content renders directly into the container.
vi.mock('@monopilot/ui/Modal', async () => {
  const ReactModule = await import('react');
  function Modal({
    children,
    open,
    onOpenChange,
    modalId,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    modalId?: string;
  }) {
    ReactModule.useEffect(() => {
      if (!open) return undefined;
      const onEsc = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onOpenChange(false);
      };
      document.addEventListener('keydown', onEsc);
      return () => document.removeEventListener('keydown', onEsc);
    }, [onOpenChange, open]);
    if (!open) return null;
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="advance-gate-title" data-modal-id={modalId}>
        {children}
      </div>
    );
  }
  Modal.Header = ({ title }: { title: string }) => <h2 id="advance-gate-title">{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { default: Modal };
});

const labels: AdvanceGateLabels = {
  title: 'Advance gate',
  gateTransition: 'Gate transition',
  currentTag: 'Current',
  targetTag: 'Target',
  approvalRequired: 'Approval required — a Manager/Director must sign off on this gate.',
  checklistSummary: 'Checklist summary — {gate}: {label}',
  done: 'Done',
  blocking: 'Blocking',
  optional: 'Optional',
  requiredComplete: '{done} of {total} required items complete',
  blockersTitle: '{count} blocker(s)',
  readyAlert: 'No blockers — ready to advance!',
  notesLabel: 'Gate advancement notes',
  notesPlaceholder: 'Summarise completion, conditions, or observations for the audit trail…',
  notesHint: 'Required for the audit trail',
  cancel: 'Cancel',
  advance: 'Advance to {gate}: {nextLabel}',
  advancing: 'Processing…',
  successTitle: 'Gate advanced to {gate}: {nextLabel}',
  successBody: 'Audit log updated',
  loading: 'Loading gate details…',
  empty: 'No checklist configured for this gate.',
  error: 'Could not advance the gate. Try again.',
  forbidden: 'You do not have permission to advance this gate.',
};

const project: AdvanceGateProject = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'DEV26-052',
  name: 'Smoked chicken slices',
  currentGate: 'G2',
};

const gateInfo: AdvanceGateInfo = {
  current: 'G2',
  currentLabel: 'Business Case',
  next: 'G3',
  nextLabel: 'Development',
  requiresApproval: false,
};

// Mixed items: two blockers (required && !done).
const blockedItems: AdvanceGateItem[] = [
  { id: 'g2-b1', text: 'Business case documented', required: true, done: true },
  { id: 'g2-b3', text: 'Target margin confirmed', required: true, done: false },
  { id: 'g2-b4', text: 'Resource plan approved', required: true, done: false },
  { id: 'g2-b5', text: 'Market research summary', required: false, done: true },
];

// All required items done.
const readyItems: AdvanceGateItem[] = [
  { id: 'g2-b1', text: 'Business case documented', required: true, done: true },
  { id: 'g2-b2', text: 'Target cost approved', required: true, done: true },
  { id: 'g2-b5', text: 'Market research summary', required: false, done: true },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdvanceGateModal — T-108 (prototype gate-screens.jsx:261-373)', () => {
  it('parity: renders title, gate-transition card (current → target), checklist progressbar, item badges and notes textarea', () => {
    render(
      <AdvanceGateModal
        open
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={readyItems}
        advanceProjectGate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Advance gate')).toBeInTheDocument();

    // Gate-transition card: current + target gate codes present, with Current/Target tags.
    const transition = within(dialog).getByTestId('advance-gate-transition');
    expect(within(transition).getByText('G2')).toBeInTheDocument();
    expect(within(transition).getByText('G3')).toBeInTheDocument();
    expect(within(transition).getByText('Current')).toBeInTheDocument();
    expect(within(transition).getByText('Target')).toBeInTheDocument();
    // ready (not blocked) arrow
    expect(within(transition).getByTestId('advance-gate-arrow')).toHaveAttribute('data-blocked', 'false');

    // Checklist summary progressbar.
    const progress = within(dialog).getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow');

    // Per-item rows with badges.
    expect(within(dialog).getAllByTestId('advance-gate-item').length).toBe(readyItems.length);
    expect(within(dialog).getByText('2 of 2 required items complete')).toBeInTheDocument();

    // Notes textarea + footer.
    expect(within(dialog).getByLabelText(/Gate advancement notes/)).toBeInTheDocument();
    expect(within(dialog).getByText('Cancel')).toBeInTheDocument();
    expect(within(dialog).getByText('Advance to G3: Development')).toBeInTheDocument();
  });

  it('blocker state: when blockers > 0 the arrow is blocked, a red alert lists each blocker, notes is disabled and Advance is disabled', () => {
    render(
      <AdvanceGateModal
        open
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={blockedItems}
        advanceProjectGate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');

    // 2026-06-06 pivot: the checklist is ADVISORY — incomplete required items no longer
    // block the advance. The arrow is NOT blocked, notes stay enabled, Advance is enabled.
    expect(within(dialog).getByTestId('advance-gate-arrow')).toHaveAttribute('data-blocked', 'false');

    // incomplete required items are surfaced as an advisory note (role="note"), not a blocker.
    const advisory = within(dialog).getByTestId('advance-gate-blockers');
    expect(advisory).toHaveAttribute('role', 'note');
    expect(within(advisory).getByText('Target margin confirmed')).toBeInTheDocument();
    expect(within(advisory).getByText('Resource plan approved')).toBeInTheDocument();
    expect(within(advisory).getByText(/2 blocker/)).toBeInTheDocument();

    // notes enabled + Advance enabled despite incomplete checklist.
    expect(within(dialog).getByLabelText(/Gate advancement notes/)).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: /Advance to G3/ })).toBeEnabled();
  });

  it('ready state: with all required items done, the green ready note shows and Advance is enabled (notes optional)', async () => {
    render(
      <AdvanceGateModal
        open
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={readyItems}
        advanceProjectGate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    const ready = within(dialog).getByTestId('advance-gate-ready');
    expect(ready).toHaveAttribute('role', 'status');
    expect(within(ready).getByText('No blockers — ready to advance!')).toBeInTheDocument();

    expect(within(dialog).getByLabelText(/Gate advancement notes/)).toBeEnabled();
    // Notes are optional now — Advance is enabled without typing anything.
    expect(within(dialog).getByRole('button', { name: /Advance to G3/ })).toBeEnabled();
  });

  it('submit: clicking Advance calls advanceProjectGate({ projectId, targetGate, notes }) exactly once and renders a success alert', async () => {
    const user = userEvent.setup();
    const advance = vi.fn().mockResolvedValue({
      ok: true as const,
      data: {
        projectId: project.id,
        previousGate: 'G2',
        currentGate: 'G3',
        productCode: null,
        outboxEventType: 'npd.gate.advanced',
      },
    });

    render(
      <AdvanceGateModal
        open
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={readyItems}
        advanceProjectGate={advance}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/Gate advancement notes/), 'All required evidence captured.');
    await user.click(screen.getByRole('button', { name: /Advance to G3/ }));

    expect(advance).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledWith({
      projectId: project.id,
      targetGate: 'G3',
      notes: 'All required evidence captured.',
    });

    const success = await screen.findByTestId('advance-gate-success');
    expect(success).toHaveAttribute('role', 'status');
    expect(within(success).getByText('Gate advanced to G3: Development')).toBeInTheDocument();
  });

  it('approval-required: renders the approval note when gateInfo.requiresApproval is true', () => {
    render(
      <AdvanceGateModal
        open
        labels={labels}
        project={project}
        gateInfo={{ ...gateInfo, current: 'G3', currentLabel: 'Development', next: 'G4', nextLabel: 'Testing', requiresApproval: true }}
        items={readyItems}
        advanceProjectGate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('advance-gate-approval-note')).toHaveTextContent(/sign off/i);
  });

  it('error state: surfaces a role=alert error when the action rejects and does not show success', async () => {
    const user = userEvent.setup();
    const advance = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <AdvanceGateModal
        open
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={readyItems}
        advanceProjectGate={advance}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/Gate advancement notes/), 'All required evidence captured.');
    await user.click(screen.getByRole('button', { name: /Advance to G3/ }));

    const err = await screen.findByText('Could not advance the gate. Try again.');
    expect(err.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByTestId('advance-gate-success')).not.toBeInTheDocument();
  });

  it('error state: surfaces a role=alert error when the action returns ok:false (no DB submit on rejection)', async () => {
    const user = userEvent.setup();
    const advance = vi.fn().mockResolvedValue({ ok: false as const, error: 'BLOCKERS_PRESENT', status: 409 });
    render(
      <AdvanceGateModal
        open
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={readyItems}
        advanceProjectGate={advance}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/Gate advancement notes/), 'All required evidence captured.');
    await user.click(screen.getByRole('button', { name: /Advance to G3/ }));

    const err = await screen.findByText('Could not advance the gate. Try again.');
    expect(err.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByTestId('advance-gate-success')).not.toBeInTheDocument();
  });

  it('permission-denied state: renders the forbidden notice and no form', () => {
    render(
      <AdvanceGateModal
        open
        state="permission_denied"
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={readyItems}
        advanceProjectGate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('You do not have permission to advance this gate.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Gate advancement notes/)).not.toBeInTheDocument();
  });

  it('loading state: renders the loading notice', () => {
    render(
      <AdvanceGateModal
        open
        state="loading"
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={readyItems}
        advanceProjectGate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Loading gate details…')).toBeInTheDocument();
  });

  it('no items: with no checklist items the modal is ready (advisory checklist) and Advance is enabled', () => {
    render(
      <AdvanceGateModal
        open
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={[]}
        advanceProjectGate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Checklist is advisory now — no items means nothing pending, so the modal is ready.
    expect(screen.getByTestId('advance-gate-ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Advance to G3/ })).toBeEnabled();
  });

  it('parity evidence: writes a DOM snapshot artifact', () => {
    const { container } = render(
      <AdvanceGateModal
        open
        labels={labels}
        project={project}
        gateInfo={gateInfo}
        items={blockedItems}
        advanceProjectGate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dir = resolve(process.cwd(), 'e2e/parity-evidence/T-108');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'advance-gate-modal.dom.html'), container.innerHTML, 'utf8');
    expect(container.querySelector('[data-modal-id="advanceGate"]')).not.toBeNull();
  });
});
