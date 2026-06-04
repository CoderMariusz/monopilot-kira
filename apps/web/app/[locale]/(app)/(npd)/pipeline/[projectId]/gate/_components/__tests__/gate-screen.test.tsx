/**
 * @vitest-environment jsdom
 *
 * T-111 — Gate screen wiring (RED → GREEN).
 *
 * Integration test for the route-level GateScreen orchestrator that composes the four
 * MERGED slice components and dispatches the modals + post-action revalidation.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:106-616
 *
 * Asserts the T-111 acceptance criteria:
 *  - AC1: on mount, GateChecklistPanel + ApprovalHistoryTimeline render and BOTH modals
 *         are mounted but initially CLOSED.
 *  - AC2: clicking the panel advance CTA on a non-requiresApproval gate opens AdvanceGateModal;
 *         on a requiresApproval gate it opens GateApprovalModal (panel keys the modal off
 *         the gate's requiresApproval flag → openModal dispatches the right one).
 *  - AC3: after approveProjectGate (reject path — NO password) resolves ok, router.refresh()
 *         is called so the timeline revalidates.
 *  - i18n: only LABEL VALUES render (no inline English literals from the orchestrator).
 *  - RBAC: when the caller lacks approve permission the GateApprovalModal renders the
 *         server-resolved forbidden shell (never render-then-disable).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── next/navigation: capture router.refresh for the revalidation assertion. ──
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline/p1/gate',
  useSearchParams: () => new URLSearchParams(),
}));

// ── next-intl: GateApprovalModal calls useTranslations; echo the key. ──
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

import {
  GateScreen,
  type GateScreenData,
  type GateScreenLabels,
  type GateScreenProps,
} from '../gate-screen';

const CHECKLIST_LABELS: GateScreenLabels['checklist'] = {
  title: 'cl.title',
  currentGate: 'cl.currentGate',
  overallProgress: 'cl.overallProgress',
  current: 'cl.current',
  blockingBadge: '{count} blocking',
  notStarted: 'cl.notStarted',
  completedBy: 'Completed by {by} · {at}',
  required: 'cl.required',
  optional: 'cl.optional',
  blocking: 'cl.blocking',
  attach: 'cl.attach',
  catTechnical: 'TECHNICAL',
  catBusiness: 'BUSINESS',
  catCompliance: 'COMPLIANCE',
  blockerAlert: '{count} blocking before {gate}: {gateLabel}',
  readyAlert: 'Ready {gate} → {nextLabel}',
  advance: 'cl.advance {gate} {nextLabel}',
  requestApproval: 'cl.requestApproval',
  markLaunched: 'cl.markLaunched',
  expand: 'cl.expand',
  collapse: 'cl.collapse',
  loading: 'cl.loading',
  empty: 'cl.empty',
  emptyBody: 'cl.emptyBody',
  error: 'cl.error',
  forbidden: 'cl.forbidden',
};

const ADVANCE_LABELS: GateScreenLabels['advance'] = {
  title: 'adv.title',
  gateTransition: 'adv.gateTransition',
  currentTag: 'adv.currentTag',
  targetTag: 'adv.targetTag',
  approvalRequired: 'adv.approvalRequired',
  checklistSummary: '{gate} {label}',
  done: 'adv.done',
  blocking: 'adv.blocking',
  optional: 'adv.optional',
  requiredComplete: '{done} of {total}',
  blockersTitle: '{count} blockers',
  readyAlert: 'adv.readyAlert',
  notesLabel: 'adv.notesLabel',
  notesPlaceholder: 'adv.notesPlaceholder',
  notesHint: 'adv.notesHint',
  cancel: 'adv.cancel',
  advance: 'adv.advance {gate} {nextLabel}',
  advancing: 'adv.advancing',
  successTitle: 'adv.successTitle {gate} {nextLabel}',
  successBody: 'adv.successBody',
  loading: 'adv.loading',
  empty: 'adv.empty',
  error: 'adv.error',
  forbidden: 'adv.forbidden',
};

const HISTORY_LABELS: GateScreenLabels['approvalHistory'] = {
  title: 'hist.title',
  subtitle: '{count} approvals',
  statusApproved: 'APPROVED',
  statusRejected: 'REJECTED',
  eSignedTag: 'hist.eSignedTag',
  eSignedIconLabel: 'hist.eSignedIconLabel',
  sigShow: 'hist.sigShow',
  sigHide: 'hist.sigHide',
  sigPanelTitle: 'hist.sigPanelTitle',
  sigSigner: 'hist.sigSigner',
  sigRole: 'hist.sigRole',
  sigTimestamp: 'hist.sigTimestamp',
  sigCertId: 'hist.sigCertId',
  sigVerification: 'hist.sigVerification',
  sigValid: 'hist.sigValid',
  approvedIconLabel: 'hist.approvedIconLabel',
  rejectedIconLabel: 'hist.rejectedIconLabel',
  loading: 'hist.loading',
  empty: 'hist.empty',
  emptyBody: 'hist.emptyBody',
  error: 'hist.error',
  forbidden: 'hist.forbidden',
};

const LABELS: GateScreenLabels = {
  checklist: CHECKLIST_LABELS,
  advance: ADVANCE_LABELS,
  approvalHistory: HISTORY_LABELS,
};

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

/** Build a data object whose current gate is configurable (G2 self-advance / G3 approval). */
function makeData(currentGate: 'G2' | 'G3'): GateScreenData {
  const g2Items = [
    { id: 'g2-t1', text: 'Detailed ingredient spec', required: true, done: true, category: 'TECHNICAL', by: 'J. Lewis', at: '2025-11-05', file: null },
    { id: 'g2-b1', text: 'Target margin confirmed', required: true, done: true, category: 'BUSINESS', by: 'A. Owner', at: '2025-11-06', file: null },
  ];
  const g3Items = [
    { id: 'g3-t1', text: 'Trial run complete', required: true, done: true, category: 'TECHNICAL', by: 'J. Lewis', at: '2025-12-01', file: null },
  ];
  const gates = [
    { key: 'G0' as const, label: 'Idea', items: [], pct: 0, blockers: [], isCurrent: false, next: 'G1' as const, nextLabel: 'Feasibility', requiresApproval: false },
    { key: 'G1' as const, label: 'Feasibility', items: [], pct: 0, blockers: [], isCurrent: false, next: 'G2' as const, nextLabel: 'Business Case', requiresApproval: false },
    {
      key: 'G2' as const,
      label: 'Business Case',
      items: g2Items,
      pct: 100,
      blockers: [],
      isCurrent: currentGate === 'G2',
      next: 'G3' as const,
      nextLabel: 'Development',
      requiresApproval: false,
    },
    {
      key: 'G3' as const,
      label: 'Development',
      items: currentGate === 'G3' ? g3Items : [],
      pct: 100,
      blockers: [],
      isCurrent: currentGate === 'G3',
      next: 'G4' as const,
      nextLabel: 'Testing',
      requiresApproval: true,
    },
    { key: 'G4' as const, label: 'Testing', items: [], pct: 0, blockers: [], isCurrent: false, next: null, nextLabel: 'Launched', requiresApproval: true },
  ];
  return {
    panelProject: { id: PROJECT_ID, code: 'DEV-123', name: 'Apex sausage roll', currentGate },
    gates,
    advanceProject: { id: PROJECT_ID, code: 'DEV-123', name: 'Apex sausage roll', currentGate },
    advanceGateInfo: {
      current: currentGate,
      currentLabel: currentGate === 'G2' ? 'Business Case' : 'Development',
      next: currentGate === 'G2' ? 'G3' : 'G4',
      nextLabel: currentGate === 'G2' ? 'Development' : 'Testing',
      requiresApproval: currentGate === 'G3',
    },
    advanceItems: (currentGate === 'G2' ? g2Items : g3Items).map((i) => ({ id: i.id, text: i.text, required: i.required, done: i.done })),
    approvalProject: { id: PROJECT_ID, code: 'DEV-123', name: 'Apex sausage roll', gateCode: currentGate === 'G3' ? 'G3' : 'G3', requiredDone: 1, requiredTotal: 1, pct: 100 },
    approvals: [
      {
        id: 'appr-1',
        gate: 'G2',
        gateLabel: 'Business Case',
        result: 'approved',
        approver: 'A. Owner',
        role: 'Approver',
        notes: 'Business case approved.',
        date: '2025-11-10',
        eSigned: false,
        eSignHash: null,
        eSignedAt: null,
      },
    ],
  };
}

function renderScreen(overrides: Partial<GateScreenProps> = {}, currentGate: 'G2' | 'G3' = 'G2') {
  return render(
    <GateScreen
      projectId={PROJECT_ID}
      data={makeData(currentGate)}
      labels={LABELS}
      state="ready"
      canWrite
      canAdvance
      canApprove
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  refreshMock.mockReset();
});

describe('T-111 GateScreen wiring', () => {
  it('AC1: renders the checklist panel + approval timeline with BOTH modals mounted and closed', () => {
    renderScreen();
    expect(screen.getByTestId('gate-checklist-panel')).toBeInTheDocument();
    expect(screen.getByTestId('approval-history-timeline')).toBeInTheDocument();
    // No modal dialog open initially.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC2: advancing a non-requiresApproval gate (G2) opens AdvanceGateModal', async () => {
    const user = userEvent.setup();
    renderScreen({}, 'G2');
    await user.click(screen.getByTestId('gate-advance-button'));
    expect(await screen.findByTestId('advance-gate-transition')).toBeInTheDocument();
    // The approval modal's project header is NOT shown.
    expect(screen.queryByTestId('gate-approval-project')).not.toBeInTheDocument();
  });

  it('AC2: advancing a requiresApproval gate (G3) opens GateApprovalModal instead', async () => {
    const user = userEvent.setup();
    renderScreen({}, 'G3');
    await user.click(screen.getByTestId('gate-advance-button'));
    expect(await screen.findByTestId('gate-approval-project')).toBeInTheDocument();
    expect(screen.queryByTestId('advance-gate-transition')).not.toBeInTheDocument();
  });

  it('AC3: a successful REJECT (no password) triggers router.refresh for timeline revalidation', async () => {
    const user = userEvent.setup();
    const approveProjectGate = vi.fn(async () => ({ ok: true as const }));
    renderScreen({ approveProjectGate }, 'G3');

    await user.click(screen.getByTestId('gate-advance-button'));
    // Switch decision to reject.
    await user.click(screen.getByRole('radio', { name: /reject/i }));
    // Fill the rejection reason (>=10 chars).
    await user.type(screen.getByTestId('modal-body').querySelector('#gate-approval-notes')!, 'Trial outcomes failed criteria.');
    await user.click(screen.getByRole('button', { name: /submitRejection/i }));

    expect(approveProjectGate).toHaveBeenCalledTimes(1);
    const call = approveProjectGate.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.decision).toBe('rejected');
    // Reject path must NOT carry a password (T-111 reconciliation contract).
    expect(call).not.toHaveProperty('password');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('RBAC: without approve permission the GateApprovalModal renders the forbidden shell', async () => {
    const user = userEvent.setup();
    renderScreen({ canApprove: false }, 'G3');
    await user.click(screen.getByTestId('gate-advance-button'));
    expect(await screen.findByTestId('gate-approval-forbidden')).toBeInTheDocument();
  });

  it('i18n: the orchestrator renders only label VALUES (no inline English literals)', () => {
    renderScreen();
    // The panel title is the provided label value, not a hard-coded string.
    expect(screen.getByText('cl.title')).toBeInTheDocument();
    expect(screen.getByText('hist.title')).toBeInTheDocument();
  });
});
