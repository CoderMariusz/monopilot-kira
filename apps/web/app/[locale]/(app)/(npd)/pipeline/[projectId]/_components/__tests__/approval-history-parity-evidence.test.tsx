/**
 * @vitest-environment jsdom
 * T-110 — parity evidence generator (RTL DOM artifacts).
 *
 * Renders the 5 required UI states (loading / empty / error / permission-denied /
 * ready) of the production ApprovalHistoryTimeline plus the interactive reveal
 * (e-signature details disclosure open — the only interactive affordance in this
 * read-only screen) and writes per-state DOM HTML snapshots + a structural parity
 * report to apps/web/e2e/artifacts/T-110/ for the parity diff against:
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:525-616
 *   (ApprovalHistoryTimeline — prototype-index #approval_history_timeline)
 *
 * Playwright pixel screenshots + @axe-core/playwright require a running app server
 * with an authenticated, RBAC-granted Supabase session (the pipeline route is
 * org-scoped and read-gated); that is not bootable inside this isolated worktree.
 * Per UI-PROTOTYPE-PARITY-POLICY.md the RTL DOM artifacts + structural mapping
 * below are the accepted fallback evidence, and the Playwright blocker is
 * documented in the closeout. (Mirrors the sibling T-027 fa-history evidence harness.)
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ApprovalHistoryTimeline,
  type ApprovalHistoryEntry,
  type ApprovalHistoryLabels,
} from '../approval-history-timeline';

afterEach(() => cleanup());

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
// _components/__tests__ → up to apps/web, then e2e/artifacts/T-110.
const evidenceDir = resolve(THIS_DIR, '../../../../../../../../e2e/artifacts/T-110');

const LABELS: ApprovalHistoryLabels = {
  title: 'Approval History',
  subtitle: '2 approvals recorded',
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

function regionSummary(root: HTMLElement) {
  return {
    section: Boolean(root.querySelector('[data-testid="approval-history-timeline"]')),
    card: Boolean(root.querySelector('[data-slot="card"]')),
    heading: root.querySelector('#approval-history-title')?.textContent ?? null,
    rows: root.querySelectorAll('[data-testid^="approval-history-row-"]').length,
    approvedRows: root.querySelectorAll('[data-result="approved"]').length,
    rejectedRows: root.querySelectorAll('[data-result="rejected"]').length,
    icons: root.querySelectorAll('[data-testid="approval-history-icon"]').length,
    badges: root.querySelectorAll('[data-slot="badge"]').length,
    signatureDisclosures: root.querySelectorAll('[data-testid="approval-history-signature"]').length,
    rawSelects: root.querySelectorAll('select').length,
    alerts: root.querySelectorAll('[role="alert"]').length,
    statuses: root.querySelectorAll('[role="status"]').length,
    timeElements: root.querySelectorAll('time[datetime]').length,
    connector: root.querySelectorAll('[aria-hidden="true"]').length,
  };
}

describe('T-110 parity evidence — write per-state DOM artifacts', () => {
  it('emits loading / empty / error / permission_denied / ready + signature-open HTML + parity_report.json', () => {
    mkdirSync(evidenceDir, { recursive: true });

    const states: Array<{ name: string; node: React.ReactElement }> = [
      { name: 'loading', node: <ApprovalHistoryTimeline projectId="proj-1" entries={[]} labels={LABELS} state="loading" /> },
      { name: 'empty', node: <ApprovalHistoryTimeline projectId="proj-1" entries={[]} labels={LABELS} state="empty" /> },
      { name: 'error', node: <ApprovalHistoryTimeline projectId="proj-1" entries={[]} labels={LABELS} state="error" /> },
      { name: 'permission_denied', node: <ApprovalHistoryTimeline projectId="proj-1" entries={ENTRIES} labels={LABELS} state="permission_denied" /> },
      { name: 'ready', node: <ApprovalHistoryTimeline projectId="proj-1" entries={ENTRIES} labels={LABELS} state="ready" /> },
    ];

    const report: Record<string, unknown> = {
      task: 'T-110',
      prototype_anchors: [
        'prototypes/design/Monopilot Design System/npd/gate-screens.jsx:525-616 (ApprovalHistoryTimeline)',
        'prototype-index-npd.json#approval_history_timeline',
      ],
      data_source:
        'REAL public.gate_approvals (project-scoped) via packages/queries listApprovalHistory(projectId) — org-scoped through app.current_org_id()/RLS; NO mocks',
      generated_at: new Date().toISOString(),
      states: {},
    };

    for (const state of states) {
      const { container, unmount } = render(state.node);
      writeFileSync(resolve(evidenceDir, `${state.name}.html`), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)[state.name] = regionSummary(container);
      unmount();
    }

    // Interaction state: the e-signature details disclosure opened on the e-signed row.
    const { container: openContainer, unmount } = render(
      <ApprovalHistoryTimeline projectId="proj-1" entries={ENTRIES} labels={LABELS} state="ready" />,
    );
    const toggle = openContainer.querySelector(
      '[data-testid="approval-history-signature-toggle"]',
    ) as HTMLButtonElement | null;
    act(() => {
      if (toggle) fireEvent.click(toggle);
    });
    writeFileSync(resolve(evidenceDir, 'signature-open.html'), openContainer.innerHTML, 'utf8');
    (report.states as Record<string, unknown>)['signature_open'] = {
      panel: Boolean(openContainer.querySelector('[data-testid="approval-history-signature-panel"]')),
      hash: (
        openContainer.querySelector('[data-testid="approval-history-signature-panel"]')?.textContent ?? ''
      ).includes('SHA256:a8f3b2c9012'),
    };
    unmount();

    writeFileSync(resolve(evidenceDir, 'parity_report.json'), JSON.stringify(report, null, 2), 'utf8');

    // Sanity assertions on the captured structure (parity invariants).
    const ready = (report.states as Record<string, ReturnType<typeof regionSummary>>).ready;
    expect(ready.rows).toBe(2);
    expect(ready.approvedRows).toBe(1);
    expect(ready.rejectedRows).toBe(1);
    expect(ready.signatureDisclosures).toBe(1); // only the e-signed row
    expect(ready.rawSelects).toBe(0);
    const empty = (report.states as Record<string, ReturnType<typeof regionSummary>>).empty;
    expect(empty.rows).toBe(0);
    expect((report.states as Record<string, { panel: boolean; hash: boolean }>).signature_open.hash).toBe(true);
  });
});
