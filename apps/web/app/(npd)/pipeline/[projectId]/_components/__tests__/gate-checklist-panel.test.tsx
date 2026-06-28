/**
 * @vitest-environment jsdom
 * T-107 — GateChecklistPanel component test (RED → GREEN).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:106-258 (GateChecklistPanel)
 *
 * Asserts:
 *  - Parity structure: per-gate Collapsible (aria-expanded trigger + controlled region),
 *    category sub-headers (TECHNICAL/BUSINESS/COMPLIANCE) with counts, per-item Checkbox +
 *    Required/Optional/Blocking badges, top overall progress bar, footer alert + advance CTA.
 *  - shadcn/@monopilot-ui primitives (Card/Checkbox/Badge/Button) — no raw <select>, no raw <input>.
 *  - a11y: status is never color-only (badges/alerts carry glyph + text); progressbar role + aria values;
 *    done items get line-through but also accessible meta text.
 *  - Blocker gating: footer advance button disabled when blockers > 0; red alert lists blocker item texts.
 *  - requiresApproval: primary footer button label switches to "Request Approval" and clicking it
 *    invokes openModal('gateApproval', { project }).
 *  - The five required UI states (ready / loading / empty / error / permission_denied).
 *  - Optimistic toggle: clicking a checkbox calls toggleGateChecklistItem(itemId, !done) and reflects
 *    the new state immediately; rollback on failure.
 *  - i18n: component renders LABELS (message values), never inline English literals.
 *  - RBAC: checkboxes/attach disabled/omitted when canWrite is false (server-resolved gate).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GateChecklistPanel,
  type GateView,
  type GateChecklistLabels,
  type GateChecklistProject,
} from '../gate-checklist-panel';

const LABELS: GateChecklistLabels = {
  title: 'lbl.title',
  currentGate: 'lbl.currentGate',
  overallProgress: 'lbl.overallProgress',
  current: 'lbl.current',
  blockingBadge: '{count} blocking',
  notStarted: 'lbl.notStarted',
  completedBy: 'Completed by {by} · {at}',
  required: 'lbl.required',
  optional: 'lbl.optional',
  blocking: 'lbl.blocking',
  attach: 'lbl.attach',
  catTechnical: 'TECHNICAL',
  catBusiness: 'BUSINESS',
  catCompliance: 'COMPLIANCE',
  blockerAlert: '{count} blocking before {gate}: {gateLabel}',
  readyAlert: 'Ready {gate} → {nextLabel}',
  advance: 'Advance to {gate}: {nextLabel} →',
  requestApproval: 'Request Approval →',
  markLaunched: 'lbl.markLaunched',
  advanceTerminalHint: 'lbl.advanceTerminalHint',
  expand: 'lbl.expand',
  collapse: 'lbl.collapse',
  loading: 'lbl.loading',
  empty: 'lbl.empty',
  emptyBody: 'lbl.emptyBody',
  error: 'lbl.error',
  forbidden: 'lbl.forbidden',
  faDerivedHint: 'lbl.faDerivedHint',
  faDerivedLocked: 'lbl.faDerivedLocked',
  revertGate: 'lbl.revertGate',
};

const PROJECT: GateChecklistProject = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'DEV-123',
  name: 'Apex sausage roll',
  currentGate: 'G2',
};

// G2 is the CURRENT gate, with one BUSINESS required item not done (a blocker).
function makeGates(): GateView[] {
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
        { id: 'g0-b1', text: 'Concept documented', required: true, done: true, category: 'BUSINESS', by: 'K. Walker', at: '2025-10-01', file: null },
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
        { id: 'g2-t1', text: 'Detailed ingredient spec', required: true, done: true, category: 'TECHNICAL', by: 'J. Lewis', at: '2025-11-05', file: 'spec.pdf' },
        { id: 'g2-b3', text: 'Target margin confirmed', required: true, done: false, category: 'BUSINESS', by: null, at: null, file: null },
        { id: 'g2-c2', text: 'Initial label requirements', required: false, done: true, category: 'COMPLIANCE', by: 'A. Davis', at: '2025-11-09', file: null },
      ],
    },
  ];
}

// All G2 required items done → no blockers, ready to advance.
function makeReadyGates(): GateView[] {
  const gates = makeGates();
  const g2 = gates.find((g) => g.key === 'G2')!;
  g2.items = g2.items.map((i) => ({ ...i, done: true }));
  return gates;
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof GateChecklistPanel>> = {}) {
  return render(React.createElement(GateChecklistPanel, { project: PROJECT, gates: makeGates(), labels: LABELS, canWrite: true, state: 'ready', ...overrides }));
}

afterEach(() => cleanup());

describe('GateChecklistPanel — prototype parity (gate-screens.jsx:106-258)', () => {
  it('renders the top card with overall progress bar (role=progressbar + aria values)', () => {
    renderPanel();
    expect(screen.getByTestId('gate-checklist-header')).toBeInTheDocument();
    const overall = screen.getByTestId('gate-overall-progress');
    expect(overall).toHaveAttribute('role', 'progressbar');
    expect(overall).toHaveAttribute('aria-valuemin', '0');
    expect(overall).toHaveAttribute('aria-valuemax', '100');
    // 2 of 4 items done across G0 (1/1) + G2 (1/3 initially... but pct recomputed) → just assert numeric.
    expect(overall.getAttribute('aria-valuenow')).toMatch(/^\d+$/);
  });

  it('renders a Collapsible per current+past gate with an accessible trigger (aria-expanded + aria-controls)', () => {
    renderPanel();
    const triggers = screen.getAllByTestId('gate-collapsible-trigger');
    expect(triggers.length).toBe(2); // G0 + G2 (current + past), newest first
    const currentTrigger = within(screen.getByTestId('gate-checklist-panel')).getAllByRole('button', { expanded: true });
    expect(currentTrigger.length).toBeGreaterThanOrEqual(1);
    // Every gate trigger wires aria-controls to its region; the current gate (G2) is expanded by default.
    for (const trigger of triggers) {
      expect(trigger).toHaveAttribute('aria-controls');
    }
  });

  it('renders the current gate region first (newest-first ordering)', () => {
    renderPanel();
    const collapsibles = screen.getAllByTestId('gate-collapsible');
    expect(collapsibles[0]).toHaveAttribute('data-gate', 'G2');
    expect(collapsibles[0]).toHaveAttribute('data-current');
  });

  it('renders category sub-headers (TECHNICAL/BUSINESS/COMPLIANCE) with done/total counts for the open gate', () => {
    renderPanel();
    const cats = screen.getAllByTestId('gate-category');
    const codes = cats.map((c) => c.getAttribute('data-category'));
    expect(codes).toContain('TECHNICAL');
    expect(codes).toContain('BUSINESS');
    expect(codes).toContain('COMPLIANCE');
    // TECHNICAL has 1/1 done.
    const tech = cats.find((c) => c.getAttribute('data-category') === 'TECHNICAL')!;
    expect(within(tech).getByText(/TECHNICAL \(1\/1\)/)).toBeInTheDocument();
  });

  it('renders per-item Checkbox (role=checkbox) + Required/Optional badge; blocking item gets a Blocking badge', () => {
    renderPanel();
    const items = screen.getAllByTestId('gate-checklist-item');
    expect(items.length).toBeGreaterThanOrEqual(3);
    // every item has a checkbox primitive (role=checkbox), not a raw <input>.
    expect(screen.getAllByRole('checkbox').length).toBe(items.length);
    // the not-done required item is blocking.
    const blocker = items.find((i) => i.getAttribute('data-item-id') === 'g2-b3')!;
    expect(blocker).toHaveAttribute('data-blocking');
    expect(within(blocker).getByTestId('gate-item-blocking-badge')).toHaveTextContent('lbl.blocking');
  });

  it('uses no raw <select> and no raw <input> (shadcn primitives only)', () => {
    const { container } = renderPanel();
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('renders future gates grayed-out / not started', () => {
    renderPanel();
    const future = screen.getAllByTestId('gate-future');
    const futureKeys = future.map((f) => f.getAttribute('data-gate'));
    expect(futureKeys).toEqual(expect.arrayContaining(['G3', 'G4']));
  });
});

describe('GateChecklistPanel — blocker gating', () => {
  it('disables the footer advance button and lists blocker item texts when blockers > 0', () => {
    renderPanel();
    const advance = screen.getByTestId('gate-advance-button');
    expect(advance).toBeDisabled();
    const alert = screen.getByTestId('gate-blocker-alert');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(within(alert).getByText('Target margin confirmed')).toBeInTheDocument();
  });

  it('renders the blocker target as "{gate}: {gateLabel}" for a normal (non-terminal) gate', () => {
    // G2 is current with next:G3 / nextLabel:Development → "...before G3: Development".
    renderPanel();
    const alert = screen.getByTestId('gate-blocker-alert');
    expect(alert).toHaveTextContent('1 blocking before G3: Development');
  });

  it('enables the advance button and shows the green ready alert when no blockers', () => {
    renderPanel({ gates: makeReadyGates() });
    const advance = screen.getByTestId('gate-advance-button');
    expect(advance).toBeEnabled();
    expect(screen.queryByTestId('gate-blocker-alert')).toBeNull();
    expect(screen.getByTestId('gate-ready-alert')).toBeInTheDocument();
  });
});

describe('GateChecklistPanel — requiresApproval', () => {
  function makeApprovalGates(): GateView[] {
    const gates = makeReadyGates();
    const g2 = gates.find((g) => g.key === 'G2')!;
    g2.requiresApproval = true;
    return gates;
  }

  it('switches the primary button label to Request Approval and invokes openModal(gateApproval, {project})', async () => {
    const user = userEvent.setup();
    const openModal = vi.fn();
    renderPanel({ gates: makeApprovalGates(), openModal });
    const advance = screen.getByTestId('gate-advance-button');
    expect(advance).toHaveTextContent('Request Approval →');
    await user.click(advance);
    expect(openModal).toHaveBeenCalledWith('gateApproval', { project: PROJECT });
  });
});

describe('GateChecklistPanel — terminal G4 / Mark as Launched', () => {
  // G4 is the CURRENT (terminal) gate with every required item done: no `next`,
  // no blockers → the panel renders the "Mark as launched" CTA instead of advance.
  function makeTerminalGates(): GateView[] {
    return [
      {
        key: 'G4',
        label: 'Testing',
        isCurrent: true,
        next: null,
        nextLabel: null,
        requiresApproval: true,
        pct: 100,
        blockers: [],
        items: [
          { id: 'g4-t1', text: 'Pilot run validated', required: true, done: true, category: 'TECHNICAL', by: 'J. Lewis', at: '2026-01-05', file: null },
        ],
      },
    ];
  }

  const TERMINAL_PROJECT: GateChecklistProject = { ...PROJECT, currentGate: 'G4' };

  it('renders the Mark as Launched CTA at the terminal gate (no advance button)', () => {
    render(
      React.createElement(GateChecklistPanel, {
        project: TERMINAL_PROJECT,
        gates: makeTerminalGates(),
        labels: LABELS,
        canWrite: true,
        state: 'ready',
      }),
    );
    expect(screen.getByTestId('gate-mark-launched')).toHaveTextContent('lbl.markLaunched');
    expect(screen.queryByTestId('gate-advance-button')).toBeNull();
  });

  it('wires Mark as Launched to openModal(advanceGate, {project}) — the launch confirm + error surface', async () => {
    const user = userEvent.setup();
    const openModal = vi.fn();
    render(
      React.createElement(GateChecklistPanel, {
        project: TERMINAL_PROJECT,
        gates: makeTerminalGates(),
        labels: LABELS,
        canWrite: true,
        state: 'ready',
        openModal,
      }),
    );
    await user.click(screen.getByTestId('gate-mark-launched'));
    expect(openModal).toHaveBeenCalledWith('advanceGate', { project: TERMINAL_PROJECT });
  });

  it('renders the terminal launched hint instead of an enabled Mark as Launched CTA', () => {
    render(
      React.createElement(GateChecklistPanel, {
        project: TERMINAL_PROJECT,
        gates: makeTerminalGates(),
        labels: LABELS,
        canWrite: true,
        state: 'ready',
        isTerminal: true,
      }),
    );

    expect(screen.queryByTestId('gate-mark-launched')).toBeNull();
    expect(screen.getByTestId('gate-advance-terminal')).toHaveTextContent('lbl.advanceTerminalHint');
  });

  // F-2 regression: at the terminal gate (G4 advancing to "Launched") `next` is
  // null while `nextLabel` is "Launched". The blocker alert must NOT render the
  // empty "{gate}: " prefix as a stray leading colon — it must read cleanly as
  // "...before Launched", not "...before : Launched".
  it('renders the blocker alert with no empty "{gate}:" prefix at the terminal gate (just the stage label)', () => {
    // G4 current, advancing to the terminal "Launched", with one required item NOT
    // done (a real blocker). Mirrors GATE_META.G4 = { next:null, nextLabel:'Launched' }.
    const terminalBlocked: GateView[] = [
      {
        key: 'G4',
        label: 'Testing',
        isCurrent: true,
        next: null,
        nextLabel: 'Launched',
        requiresApproval: true,
        pct: 0,
        blockers: [],
        items: [
          { id: 'g4-t1', text: 'Pilot run validated', required: true, done: false, category: 'TECHNICAL', by: null, at: null, file: null },
        ],
      },
    ];
    render(
      React.createElement(GateChecklistPanel, {
        project: TERMINAL_PROJECT,
        gates: terminalBlocked,
        labels: LABELS,
        canWrite: true,
        state: 'ready',
      }),
    );
    const alert = screen.getByTestId('gate-blocker-alert');
    // Clean: "1 blocking before Launched" — the empty gate code + its literal ": " are gone.
    expect(alert).toHaveTextContent('1 blocking before Launched');
    expect(alert.textContent).not.toMatch(/before\s*:/);
    expect(alert.textContent).not.toContain('{gate}');
    expect(alert.textContent).not.toContain('{gateLabel}');
  });
});

describe('GateChecklistPanel — optimistic toggle + RBAC', () => {
  it('calls toggleGateChecklistItem(itemId, !done) and reflects new state optimistically', async () => {
    const user = userEvent.setup();
    const toggle = vi.fn().mockResolvedValue({ ok: true });
    renderPanel({ toggleGateChecklistItem: toggle });
    const blocker = screen
      .getAllByTestId('gate-checklist-item')
      .find((i) => i.getAttribute('data-item-id') === 'g2-b3')!;
    const cb = within(blocker).getByRole('checkbox');
    expect(cb).toHaveAttribute('aria-checked', 'false');
    await user.click(cb);
    expect(toggle).toHaveBeenCalledWith('g2-b3', true);
    // Optimistically marked done → blocker badge gone, advance button enabled.
    expect(screen.queryByTestId('gate-blocker-alert')).toBeNull();
  });

  it('rolls back the optimistic toggle when the Server Action fails', async () => {
    const user = userEvent.setup();
    const toggle = vi.fn().mockResolvedValue({ ok: false, code: 'PERSISTENCE_FAILED' });
    renderPanel({ toggleGateChecklistItem: toggle });
    const blocker = screen
      .getAllByTestId('gate-checklist-item')
      .find((i) => i.getAttribute('data-item-id') === 'g2-b3')!;
    await user.click(within(blocker).getByRole('checkbox'));
    // After rejection the blocker reappears (rolled back).
    expect(await screen.findByTestId('gate-blocker-alert')).toBeInTheDocument();
  });

  it('disables checkboxes when canWrite is false (RBAC server-resolved)', () => {
    renderPanel({ canWrite: false });
    for (const cb of screen.getAllByRole('checkbox')) {
      expect(cb).toBeDisabled();
    }
  });

  it('never renders the per-item Attach button (no upload backend — honest UI, attachments backlogged)', () => {
    // canWrite true would previously render an "+ Attach" no-op; the modal-fix
    // lane removed it. Assert it is absent for a writable, incomplete item too.
    renderPanel({ canWrite: true });
    expect(screen.queryByTestId('gate-item-attach')).toBeNull();
    expect(screen.queryByRole('button', { name: /Attach/i })).toBeNull();
  });

  it('renders FA-derived Done rows as read-only with an FA department link and no toggle call', async () => {
    const user = userEvent.setup();
    const toggle = vi.fn().mockResolvedValue({ ok: true });
    const gates = makeReadyGates();
    const g2 = gates.find((g) => g.key === 'G2')!;
    g2.items = [
      {
        id: 'g2-done-technical',
        text: 'Done_Technical: Technical department NPD data closed',
        required: true,
        done: true,
        category: 'TECHNICAL',
        by: null,
        at: null,
        file: null,
        faDept: 'Technical',
        faHref: '/fg/FG-NPD-001?dept=Technical',
      },
    ];

    renderPanel({ gates, toggleGateChecklistItem: toggle });
    const row = screen.getByTestId('gate-checklist-item');
    const checkbox = within(row).getByRole('checkbox');

    expect(checkbox).toBeDisabled();
    expect(within(row).getByTestId('gate-item-fa-derived-badge')).toHaveTextContent('lbl.faDerivedLocked');
    expect(within(row).getByText('lbl.faDerivedHint')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Technical' })).toHaveAttribute(
      'href',
      '/fg/FG-NPD-001?dept=Technical',
    );

    await user.click(checkbox);
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('GateChecklistPanel — required UI states', () => {
  it('renders the loading state', () => {
    renderPanel({ state: 'loading' });
    expect(screen.getByTestId('gate-checklist-loading')).toHaveTextContent('lbl.loading');
  });

  it('renders the error state with role=alert', () => {
    renderPanel({ state: 'error' });
    const err = screen.getByTestId('gate-checklist-error');
    expect(err).toHaveAttribute('role', 'alert');
    expect(err).toHaveTextContent('lbl.error');
  });

  it('renders the permission-denied state', () => {
    renderPanel({ state: 'permission_denied' });
    expect(screen.getByTestId('gate-checklist-forbidden')).toHaveTextContent('lbl.forbidden');
  });

  it('renders the empty state when there are no checklist items', () => {
    renderPanel({ gates: [] });
    expect(screen.getByText('lbl.empty')).toBeInTheDocument();
  });
});

describe('GateChecklistPanel — i18n (no inline English literals)', () => {
  it('renders only label values for visible UI strings', () => {
    renderPanel();
    expect(screen.getByText('lbl.title')).toBeInTheDocument();
    expect(screen.getByTestId('gate-current-badge')).toHaveTextContent('lbl.current');
    // requirement badges resolve from labels (not hardcoded "Required"/"Optional")
    const reqBadges = screen.getAllByTestId('gate-item-requirement-badge');
    expect(reqBadges.some((b) => b.textContent === 'lbl.required')).toBe(true);
    expect(reqBadges.some((b) => b.textContent === 'lbl.optional')).toBe(true);
  });
});
