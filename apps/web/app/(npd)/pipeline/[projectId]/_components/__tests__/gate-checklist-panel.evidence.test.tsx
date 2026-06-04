/**
 * @vitest-environment jsdom
 * T-107 — GateChecklistPanel PARITY EVIDENCE capture.
 *
 * Writes per-state DOM snapshots to _meta/parity-evidence/T-107/<state>.html so the closeout has
 * structural-parity artifacts (the project convention; see _meta/parity-evidence/T-021/*).
 * Playwright route-level capture is owned by T-112 (out of scope here) — this is the RTL/DOM fallback
 * documented in _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Prototype parity source: prototypes/design/Monopilot Design System/npd/gate-screens.jsx:106-258.
 */

import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  GateChecklistPanel,
  type GateView,
  type GateChecklistLabels,
  type GateChecklistProject,
} from '../gate-checklist-panel';

const OUT_DIR = resolve(__dirname, '../../../../../../../../_meta/parity-evidence/T-107');

const LABELS: GateChecklistLabels = {
  title: 'Gate checklist',
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
  blockerAlert: '{count} blocking item(s) must be completed before advancing to {gate}: {gateLabel}.',
  readyAlert: 'All required items for {gate} complete. Ready to advance to {nextLabel}.',
  advance: 'Advance to {gate}: {nextLabel} →',
  requestApproval: 'Request approval →',
  markLaunched: 'Mark as launched ✓',
  expand: 'Expand gate',
  collapse: 'Collapse gate',
  loading: 'Loading gate checklist…',
  empty: 'No checklist items yet',
  emptyBody: 'This project has no gate checklist items configured yet.',
  error: 'Unable to load the gate checklist. Try again.',
  forbidden: 'You do not have permission to view this gate checklist.',
};

const PROJECT: GateChecklistProject = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'DEV-123',
  name: 'Apex sausage roll',
  currentGate: 'G2',
};

function gatesWithBlocker(): GateView[] {
  return [
    {
      key: 'G0',
      label: 'Idea',
      isCurrent: false,
      next: 'G1',
      nextLabel: 'Feasibility',
      requiresApproval: false,
      pct: 100,
      blockers: [],
      items: [
        { id: 'g0-b1', text: 'Product concept documented', required: true, done: true, category: 'BUSINESS', by: 'K. Walker', at: '2025-10-01', file: null },
        { id: 'g0-t1', text: 'Initial feasibility check', required: true, done: true, category: 'TECHNICAL', by: 'J. Lewis', at: '2025-10-05', file: null },
      ],
    },
    {
      key: 'G2',
      label: 'Business Case',
      isCurrent: true,
      next: 'G3',
      nextLabel: 'Development',
      requiresApproval: false,
      pct: 0,
      blockers: [],
      items: [
        { id: 'g2-t1', text: 'Detailed ingredient specification', required: true, done: true, category: 'TECHNICAL', by: 'J. Lewis', at: '2025-11-05', file: 'ingredient_spec_final.pdf' },
        { id: 'g2-b3', text: 'Target margin confirmed', required: true, done: false, category: 'BUSINESS', by: null, at: null, file: null },
        { id: 'g2-c1', text: 'Regulatory pathway identified', required: true, done: true, category: 'COMPLIANCE', by: 'A. Davis', at: '2025-11-06', file: null },
      ],
    },
  ];
}

function write(state: string, html: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${state}.html`), `<!-- T-107 GateChecklistPanel · state=${state} -->\n${html}\n`);
}

afterEach(() => cleanup());

describe('T-107 parity evidence — per-state DOM snapshots', () => {
  it('captures ready (current gate with a blocker)', () => {
    const { container } = render(
      <GateChecklistPanel project={PROJECT} gates={gatesWithBlocker()} labels={LABELS} canWrite state="ready" />,
    );
    write('ready', container.innerHTML);
    expect(container.querySelector('[data-testid="gate-checklist-panel"]')).not.toBeNull();
  });

  it('captures loading', () => {
    const { container } = render(
      <GateChecklistPanel project={PROJECT} gates={gatesWithBlocker()} labels={LABELS} canWrite state="loading" />,
    );
    write('loading', container.innerHTML);
    expect(container.querySelector('[data-testid="gate-checklist-loading"]')).not.toBeNull();
  });

  it('captures empty', () => {
    const { container } = render(
      <GateChecklistPanel project={PROJECT} gates={[]} labels={LABELS} canWrite state="ready" />,
    );
    write('empty', container.innerHTML);
  });

  it('captures error', () => {
    const { container } = render(
      <GateChecklistPanel project={PROJECT} gates={gatesWithBlocker()} labels={LABELS} canWrite state="error" />,
    );
    write('error', container.innerHTML);
  });

  it('captures permission-denied', () => {
    const { container } = render(
      <GateChecklistPanel project={PROJECT} gates={gatesWithBlocker()} labels={LABELS} canWrite={false} state="permission_denied" />,
    );
    write('permission-denied', container.innerHTML);
  });

  it('captures permission-denied-ready (RBAC: ready data but no write — checkboxes disabled, no attach)', () => {
    const { container } = render(
      <GateChecklistPanel project={PROJECT} gates={gatesWithBlocker()} labels={LABELS} canWrite={false} state="ready" />,
    );
    write('rbac-readonly', container.innerHTML);
  });
});
