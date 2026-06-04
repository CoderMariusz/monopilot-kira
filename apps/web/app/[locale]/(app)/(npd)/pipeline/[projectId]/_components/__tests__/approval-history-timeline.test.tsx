/**
 * @vitest-environment jsdom
 * T-110 RED — ApprovalHistoryTimeline parity + states + e-signature collapsible.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:525-616
 *   (ApprovalHistoryTimeline) — labelled region #approval_history_timeline.
 *
 * Asserts:
 *  - AC1 parity: reverse-chronological vertical timeline; each entry renders a
 *    green ✓ / red ✗ circle, gate label + APPROVED/REJECTED Badge, approver+role
 *    line, comment and a mono date — built from the same regions as the
 *    prototype, using Card + Badge primitives.
 *  - AC1 ordering: entries are rendered in the order provided (producer returns DESC).
 *  - AC2 collapsible: an eSigned entry renders a "View signature details"
 *    disclosure that reveals signer / role / timestamp / certificate id /
 *    verification rows; a NON-eSigned entry renders NO signature disclosure.
 *  - AC3 empty: entries.length === 0 → empty-state notice, no timeline list.
 *  - The five required UI states (loading / empty / ready / error / permission_denied).
 *  - i18n: the component renders LABEL VALUES (props), never inline English literals.
 *  - read-only red line: no edit/delete/approve controls are rendered for any row.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ApprovalHistoryTimeline,
  type ApprovalHistoryEntry,
  type ApprovalHistoryLabels,
} from '../approval-history-timeline';

const LABELS: ApprovalHistoryLabels = {
  title: 'Approval History',
  subtitle: '{count, plural, =0 {No approvals recorded} one {# approval recorded} other {# approvals recorded}}',
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
};

const ENTRIES: ApprovalHistoryEntry[] = [
  {
    id: 'ah-2',
    gate: 'G1',
    gateLabel: 'Feasibility',
    result: 'approved',
    approver: 'J. Lewis',
    role: 'NPD Lead',
    notes: 'Technical feasibility confirmed. Proceed to business case.',
    date: '2025-10-28',
    eSigned: true,
    eSignHash: 'SHA256:a8f3b2c9012',
    eSignedAt: '2025-10-28T10:30:00.000Z',
  },
  {
    id: 'ah-1',
    gate: 'G0',
    gateLabel: 'Idea',
    result: 'rejected',
    approver: 'K. Walker',
    role: 'NPD Manager',
    notes: 'Market opportunity not yet validated by commercial team.',
    date: '2025-10-06',
    eSigned: false,
    eSignHash: null,
    eSignedAt: null,
  },
];

function renderTimeline(
  overrides: Partial<React.ComponentProps<typeof ApprovalHistoryTimeline>> = {},
) {
  return render(
    <ApprovalHistoryTimeline
      projectId="proj-1"
      entries={ENTRIES}
      labels={LABELS}
      state="ready"
      {...overrides}
    />,
  );
}

afterEach(() => cleanup());

describe('T-110 ApprovalHistoryTimeline — parity', () => {
  it('renders a Card with the title and one timeline row per entry, in the given order', () => {
    const { container } = renderTimeline();

    expect(screen.getByText(LABELS.title)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();

    const rows = container.querySelectorAll('[data-testid^="approval-history-row-"]');
    expect(rows.length).toBe(2);
    // order preserved (producer returns reverse-chronological)
    expect(rows[0].getAttribute('data-testid')).toBe('approval-history-row-ah-2');
    expect(rows[1].getAttribute('data-testid')).toBe('approval-history-row-ah-1');
  });

  it('renders a green ✓ circle + APPROVED badge for approved, red ✗ + REJECTED for rejected', () => {
    const { container } = renderTimeline();

    const approvedRow = container.querySelector('[data-testid="approval-history-row-ah-2"]')!;
    const rejectedRow = container.querySelector('[data-testid="approval-history-row-ah-1"]')!;

    expect(approvedRow.getAttribute('data-result')).toBe('approved');
    expect(rejectedRow.getAttribute('data-result')).toBe('rejected');

    expect(within(approvedRow as HTMLElement).getByText(LABELS.statusApproved)).toBeInTheDocument();
    expect(within(rejectedRow as HTMLElement).getByText(LABELS.statusRejected)).toBeInTheDocument();

    // circle icon glyph present and not color-only (has accessible label)
    const approvedIcon = approvedRow.querySelector('[data-testid="approval-history-icon"]')!;
    expect(approvedIcon.textContent).toContain('✓');
    expect(approvedIcon.getAttribute('aria-label')).toBe(LABELS.approvedIconLabel);
    const rejectedIcon = rejectedRow.querySelector('[data-testid="approval-history-icon"]')!;
    expect(rejectedIcon.textContent).toContain('✗');
    expect(rejectedIcon.getAttribute('aria-label')).toBe(LABELS.rejectedIconLabel);
  });

  it('renders gate label + gate code, approver + role, comment and a mono date per entry', () => {
    renderTimeline();

    expect(screen.getByText(/Feasibility/)).toBeInTheDocument();
    expect(screen.getByText('J. Lewis')).toBeInTheDocument();
    expect(screen.getByText(/NPD Lead/)).toBeInTheDocument();
    expect(
      screen.getByText('Technical feasibility confirmed. Proceed to business case.'),
    ).toBeInTheDocument();

    const dateEl = screen.getByText('2025-10-28', { selector: 'time' });
    expect(dateEl).toHaveAttribute('datetime', '2025-10-28');
  });

  it('does not render any edit / delete / approve controls (read-only)', () => {
    renderTimeline();
    expect(screen.queryByRole('button', { name: /edit|delete|approve|reject/i })).toBeNull();
  });
});

describe('T-110 ApprovalHistoryTimeline — e-signature collapsible (AC2)', () => {
  it('shows a signature disclosure only for eSigned entries', () => {
    const { container } = renderTimeline();

    const approvedRow = container.querySelector('[data-testid="approval-history-row-ah-2"]')!;
    const rejectedRow = container.querySelector('[data-testid="approval-history-row-ah-1"]')!;

    expect(approvedRow.querySelector('[data-testid="approval-history-signature"]')).toBeInTheDocument();
    expect(rejectedRow.querySelector('[data-testid="approval-history-signature"]')).toBeNull();
  });

  it('reveals signer / role / timestamp / certificate id / verification when toggled', async () => {
    const user = userEvent.setup();
    renderTimeline();

    const toggle = screen.getByRole('button', { name: LABELS.sigShow });
    await user.click(toggle);

    const panel = screen.getByTestId('approval-history-signature-panel');
    expect(within(panel).getByText(LABELS.sigPanelTitle)).toBeInTheDocument();
    expect(within(panel).getByText(LABELS.sigSigner)).toBeInTheDocument();
    expect(within(panel).getByText(LABELS.sigRole)).toBeInTheDocument();
    expect(within(panel).getByText(LABELS.sigTimestamp)).toBeInTheDocument();
    expect(within(panel).getByText(LABELS.sigCertId)).toBeInTheDocument();
    expect(within(panel).getByText(LABELS.sigVerification)).toBeInTheDocument();
    // real hash from the entry, not a placeholder
    expect(within(panel).getByText(/SHA256:a8f3b2c9012/)).toBeInTheDocument();
  });
});

describe('T-110 ApprovalHistoryTimeline — required UI states', () => {
  it('empty: renders the empty-state notice and NO timeline rows (AC3)', () => {
    const { container } = renderTimeline({ entries: [], state: 'empty' });

    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="approval-history-row-"]').length).toBe(0);
    expect(container.querySelector('[data-testid="approval-history-list"]')).toBeNull();
  });

  it('loading: renders a polite status with the loading label and no rows', () => {
    const { container } = renderTimeline({ entries: [], state: 'loading' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(LABELS.loading);
    expect(container.querySelectorAll('[data-testid^="approval-history-row-"]').length).toBe(0);
  });

  it('error: renders an alert with the error label', () => {
    renderTimeline({ entries: [], state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('permission_denied: renders an alert with the forbidden label and no rows', () => {
    const { container } = renderTimeline({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
    expect(container.querySelectorAll('[data-testid^="approval-history-row-"]').length).toBe(0);
  });
});

describe('T-110 ApprovalHistoryTimeline — i18n', () => {
  it('never renders inline English literals from the prototype (uses label props)', () => {
    // Render with sentinel labels; assert none of the prototype English literals leak.
    const sentinel: ApprovalHistoryLabels = Object.fromEntries(
      Object.entries(LABELS).map(([k]) => [k, `__${k}__`]),
    ) as unknown as ApprovalHistoryLabels;

    const { container } = render(
      <ApprovalHistoryTimeline projectId="p" entries={ENTRIES} labels={sentinel} state="ready" />,
    );

    const html = container.innerHTML;
    expect(html).not.toContain('Approval History');
    expect(html).not.toContain('APPROVED');
    expect(html).not.toContain('View signature details');
    expect(html).toContain('__title__');
  });
});
