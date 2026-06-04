/**
 * @vitest-environment jsdom
 * T-111 — Gate screen WIRING parity evidence capture (RTL/DOM fallback for T-112).
 *
 * Writes per-state DOM snapshots of the COMPOSED gate screen (GateChecklistPanel +
 * AdvanceGateModal + GateApprovalModal + ApprovalHistoryTimeline) to
 * _meta/parity-evidence/T-111/<state>.html. This is the accepted fallback evidence per
 * _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md when the live Playwright capture
 * (T-112, requires PLAYWRIGHT_BASE_URL + an authenticated preview) is unavailable in
 * this isolated worktree. The Playwright harness lives at apps/web/e2e/npd-gate-screen.spec.ts.
 *
 * Prototype parity source: prototypes/design/Monopilot Design System/npd/gate-screens.jsx:106-616.
 */

import React from 'react';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline/p1/gate',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? key.replace(/\{(\w+)\}/g, (_m, n: string) => String(values[n] ?? `{${n}}`))
      : key,
}));

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

import { GateScreen, type GateScreenData, type GateScreenLabels } from '../gate-screen';

const OUT_DIR = resolve(__dirname, '../../../../../../../../../../../_meta/parity-evidence/T-111');

const LABELS: GateScreenLabels = {
  checklist: {
    title: 'Stage-Gate checklist',
    currentGate: 'Current gate:',
    overallProgress: 'Overall progress',
    current: 'Current',
    blockingBadge: '{count} blocking',
    notStarted: 'Not started',
    completedBy: 'Completed by {by} · {at}',
    required: 'Required',
    optional: 'Optional',
    blocking: 'Blocking',
    attach: 'Attach',
    catTechnical: 'Technical',
    catBusiness: 'Business',
    catCompliance: 'Compliance',
    blockerAlert: '{count} blocking item(s) before advancing to {gate}: {gateLabel}',
    readyAlert: 'Ready to advance from {gate} to {nextLabel}',
    advance: 'Advance to {gate}: {nextLabel} →',
    requestApproval: 'Request approval →',
    markLaunched: 'Mark launched',
    expand: 'Expand',
    collapse: 'Collapse',
    loading: 'Loading gate checklist…',
    empty: 'No checklist items yet',
    emptyBody: 'Checklist items appear once the project gate is configured.',
    error: 'Unable to load the gate checklist.',
    forbidden: 'You do not have permission to view this gate.',
  },
  advance: {
    title: 'Advance gate',
    gateTransition: 'Gate transition',
    currentTag: 'Current',
    targetTag: 'Target',
    approvalRequired: 'This transition requires gate approval.',
    checklistSummary: '{gate} checklist — {label}',
    done: 'Done',
    blocking: 'Blocking',
    optional: 'Optional',
    requiredComplete: '{done} of {total} required items complete',
    blockersTitle: '{count} blocker(s) must be resolved first',
    readyAlert: 'All required items complete — ready to advance.',
    notesLabel: 'Advance notes',
    notesPlaceholder: 'Add a note for this gate transition…',
    notesHint: 'A short note is recorded with this gate transition.',
    cancel: 'Cancel',
    advance: 'Advance to {gate}: {nextLabel}',
    advancing: 'Advancing…',
    successTitle: 'Gate advanced to {gate}: {nextLabel}',
    successBody: 'The project has moved to the next gate.',
    loading: 'Loading gate summary…',
    empty: 'No checklist items to summarise.',
    error: 'Could not advance the gate. Try again.',
    forbidden: 'You do not have permission to advance this gate.',
  },
  approvalHistory: {
    title: 'Approval History',
    subtitle: '{count} approvals recorded',
    statusApproved: 'APPROVED',
    statusRejected: 'REJECTED',
    eSignedTag: 'E-signed',
    eSignedIconLabel: 'E-signed entry',
    sigShow: 'View signature details',
    sigHide: 'Hide signature details',
    sigPanelTitle: 'E-Signature Details',
    sigSigner: 'Signer',
    sigRole: 'Role',
    sigTimestamp: 'Timestamp',
    sigCertId: 'Certificate ID',
    sigVerification: 'Verification',
    sigValid: 'Valid — Signature verified',
    approvedIconLabel: 'Approved',
    rejectedIconLabel: 'Rejected',
    loading: 'Loading approval history…',
    empty: 'No approvals recorded yet for this project',
    emptyBody: 'Gate approvals will appear here as the project advances.',
    error: 'Unable to load approval history.',
    forbidden: 'You do not have permission to view this approval history.',
  },
};

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function makeData(currentGate: 'G2' | 'G3', withBlocker = false): GateScreenData {
  const g2Items = [
    { id: 'g2-t1', text: 'Detailed ingredient spec', required: true, done: true, category: 'TECHNICAL', by: 'J. Lewis', at: '2025-11-05', file: 'spec.pdf' },
    { id: 'g2-b1', text: 'Target margin confirmed', required: true, done: !withBlocker, category: 'BUSINESS', by: withBlocker ? null : 'A. Owner', at: withBlocker ? null : '2025-11-06', file: null },
  ];
  const g3Items = [
    { id: 'g3-t1', text: 'Trial run complete', required: true, done: true, category: 'TECHNICAL', by: 'J. Lewis', at: '2025-12-01', file: null },
  ];
  const items = currentGate === 'G2' ? g2Items : g3Items;
  const blockers = items.filter((i) => i.required && !i.done);
  const gates = [
    { key: 'G0' as const, label: 'Idea', items: [], pct: 100, blockers: [], isCurrent: false, next: 'G1' as const, nextLabel: 'Feasibility', requiresApproval: false },
    { key: 'G1' as const, label: 'Feasibility', items: [], pct: 100, blockers: [], isCurrent: false, next: 'G2' as const, nextLabel: 'Business Case', requiresApproval: false },
    { key: 'G2' as const, label: 'Business Case', items: g2Items, pct: withBlocker ? 50 : 100, blockers: currentGate === 'G2' ? blockers : [], isCurrent: currentGate === 'G2', next: 'G3' as const, nextLabel: 'Development', requiresApproval: false },
    { key: 'G3' as const, label: 'Development', items: currentGate === 'G3' ? g3Items : [], pct: 100, blockers: currentGate === 'G3' ? blockers : [], isCurrent: currentGate === 'G3', next: 'G4' as const, nextLabel: 'Testing', requiresApproval: true },
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
    advanceItems: items.map((i) => ({ id: i.id, text: i.text, required: i.required, done: i.done })),
    approvalProject: { id: PROJECT_ID, code: 'DEV-123', name: 'Apex sausage roll', gateCode: 'G3', requiredDone: 1, requiredTotal: 1, pct: 100 },
    approvals: [
      { id: 'appr-2', gate: 'G3', gateLabel: 'Development', result: 'approved', approver: 'Quality Lead', role: 'Approver', notes: 'Development gate approved.', date: '2025-12-02', eSigned: true, eSignHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6abcd', eSignedAt: '2025-12-02T10:15:00.000Z' },
      { id: 'appr-1', gate: 'G2', gateLabel: 'Business Case', result: 'approved', approver: 'A. Owner', role: 'Approver', notes: 'Business case approved.', date: '2025-11-10', eSigned: false, eSignHash: null, eSignedAt: null },
    ],
  };
}

function write(state: string, html: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${state}.html`), `<!-- T-111 GateScreen composed · state=${state} -->\n${html}\n`);
}

afterEach(() => {
  cleanup();
  refreshMock.mockReset();
});

describe('T-111 parity evidence — composed gate-screen DOM snapshots', () => {
  it('captures panel-default (checklist + approval timeline, no modal open)', () => {
    const { container } = render(
      <GateScreen projectId={PROJECT_ID} data={makeData('G2')} labels={LABELS} state="ready" canWrite canAdvance canApprove />,
    );
    expect(screen.getByTestId('gate-checklist-panel')).toBeTruthy();
    expect(screen.getByTestId('approval-history-timeline')).toBeTruthy();
    write('panel-default', container.innerHTML);
  });

  it('captures panel-with-blockers', () => {
    const { container } = render(
      <GateScreen projectId={PROJECT_ID} data={makeData('G2', true)} labels={LABELS} state="ready" canWrite canAdvance canApprove />,
    );
    write('panel-with-blockers', container.innerHTML);
  });

  it('captures advance-gate-modal open (self-advance gate G2)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <GateScreen projectId={PROJECT_ID} data={makeData('G2')} labels={LABELS} state="ready" canWrite canAdvance canApprove />,
    );
    await user.click(screen.getByTestId('gate-advance-button'));
    expect(await screen.findByTestId('advance-gate-transition')).toBeTruthy();
    write('advance-gate-modal', container.innerHTML);
  });

  it('captures gate-approval-modal decision step (e-sign gate G3)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <GateScreen projectId={PROJECT_ID} data={makeData('G3')} labels={LABELS} state="ready" canWrite canAdvance canApprove />,
    );
    await user.click(screen.getByTestId('gate-advance-button'));
    expect(await screen.findByTestId('gate-approval-project')).toBeTruthy();
    write('gate-approval-decision', container.innerHTML);
  });

  it('captures gate-approval-modal e-signature overlay (approve path)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <GateScreen projectId={PROJECT_ID} data={makeData('G3')} labels={LABELS} state="ready" canWrite canAdvance canApprove approveProjectGate={async () => ({ ok: true })} />,
    );
    await user.click(screen.getByTestId('gate-advance-button'));
    await screen.findByTestId('gate-approval-project');
    await user.type(screen.getByTestId('modal-body').querySelector('#gate-approval-notes')!, 'Approving for parity evidence.');
    await user.click(screen.getByRole('button', { name: /submitApproval/i }));
    expect(await screen.findByTestId('gate-approval-esign')).toBeTruthy();
    write('gate-approval-esig', container.innerHTML);
  });

  it('captures approval-history with an e-signed entry expanded', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <GateScreen projectId={PROJECT_ID} data={makeData('G3')} labels={LABELS} state="ready" canWrite canAdvance canApprove />,
    );
    await user.click(screen.getAllByTestId('approval-history-signature-toggle')[0]!);
    expect(await screen.findByTestId('approval-history-signature-panel')).toBeTruthy();
    write('approval-history-expanded', container.innerHTML);
  });

  it('captures permission_denied state', () => {
    const { container } = render(
      <GateScreen projectId={PROJECT_ID} data={makeData('G2')} labels={LABELS} state="permission_denied" />,
    );
    write('permission_denied', container.innerHTML);
  });

  it('captures empty state', () => {
    const { container } = render(
      <GateScreen
        projectId={PROJECT_ID}
        data={{ ...makeData('G2'), gates: [], approvals: [] }}
        labels={LABELS}
        state="ready"
      />,
    );
    write('empty', container.innerHTML);
  });
});
