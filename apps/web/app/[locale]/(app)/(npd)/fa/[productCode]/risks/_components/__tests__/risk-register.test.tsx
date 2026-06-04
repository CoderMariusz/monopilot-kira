/**
 * @vitest-environment jsdom
 * T-082 — RiskRegisterScreen + RiskAddModal component test (RED → GREEN).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/docs-screens.jsx:56-106 (RiskRegisterScreen)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:297-346    (RiskAddModal)
 *
 * Asserts:
 *  - Parity column order (Score/Description/Likelihood/Impact/Status/Owner/Mitigation/Actions).
 *  - Bucket badge mapping (High≥6 red / Med 3-5 amber / Low<3 gray) — color NOT the sole signal.
 *  - State badge (Open / Mitigated / Closed) via shadcn Badge primitive.
 *  - The five required UI states (loading / empty / ready / error / permission_denied).
 *  - i18n: component renders LABELS (message values), never inline English literals.
 *  - RBAC: the Add-risk control is omitted when canCreate is false (server-resolved gate).
 *  - V18 built-blocker indicator surfaces when a High+Open risk exists.
 *  - RiskAddModal RHF fields (description, likelihood, impact, mitigation) via shadcn primitives,
 *    no raw <select>, and reason gating (<10 chars) blocks the lifecycle Save / Server Action.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RiskRegisterScreen,
  type RiskRow,
  type RiskRegisterLabels,
} from '../risk-register-screen';
import { RiskAddModal } from '../risk-add-modal';

afterEach(() => cleanup());

// Distinct sentinel strings prove the component renders LABELS (i18n message
// values), never inline English literals.
const LABELS: RiskRegisterLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  addRisk: 'lbl.addRisk',
  filterState: 'lbl.filterState',
  filterBucket: 'lbl.filterBucket',
  clearFilters: 'lbl.clearFilters',
  stateAll: 'lbl.stateAll',
  bucketAll: 'lbl.bucketAll',
  colScore: 'lbl.colScore',
  colDescription: 'lbl.colDescription',
  colLikelihood: 'lbl.colLikelihood',
  colImpact: 'lbl.colImpact',
  colStatus: 'lbl.colStatus',
  colOwner: 'lbl.colOwner',
  colMitigation: 'lbl.colMitigation',
  colActions: 'lbl.colActions',
  edit: 'lbl.edit',
  bucketHigh: 'lbl.bucketHigh',
  bucketMed: 'lbl.bucketMed',
  bucketLow: 'lbl.bucketLow',
  stateOpen: 'lbl.stateOpen',
  stateMitigated: 'lbl.stateMitigated',
  stateClosed: 'lbl.stateClosed',
  builtBlocked: 'lbl.builtBlocked',
  builtBlockedBody: 'lbl.builtBlockedBody',
  loading: 'lbl.loading',
  empty: 'lbl.empty',
  emptyBody: 'lbl.emptyBody',
  error: 'lbl.error',
  forbidden: 'lbl.forbidden',
  // modal labels
  modalTitleAdd: 'lbl.modalTitleAdd',
  modalTitleEdit: 'lbl.modalTitleEdit',
  fieldDescription: 'lbl.fieldDescription',
  fieldDescriptionHint: 'lbl.fieldDescriptionHint',
  fieldLikelihood: 'lbl.fieldLikelihood',
  fieldImpact: 'lbl.fieldImpact',
  fieldMitigation: 'lbl.fieldMitigation',
  fieldMitigationHint: 'lbl.fieldMitigationHint',
  fieldOwner: 'lbl.fieldOwner',
  fieldStatus: 'lbl.fieldStatus',
  fieldReason: 'lbl.fieldReason',
  fieldReasonHint: 'lbl.fieldReasonHint',
  scoreLabel: 'lbl.scoreLabel',
  likelihoodLow: 'lbl.likelihoodLow',
  likelihoodMed: 'lbl.likelihoodMed',
  likelihoodHigh: 'lbl.likelihoodHigh',
  impactLow: 'lbl.impactLow',
  impactMed: 'lbl.impactMed',
  impactHigh: 'lbl.impactHigh',
  cancel: 'lbl.cancel',
  save: 'lbl.save',
  create: 'lbl.create',
  mitigate: 'lbl.mitigate',
  close: 'lbl.close',
  reopen: 'lbl.reopen',
  errorRequired: 'lbl.errorRequired',
  errorTooLong: 'lbl.errorTooLong',
  errorReasonShort: 'lbl.errorReasonShort',
};

const ROWS: RiskRow[] = [
  {
    id: 'r-high',
    productCode: 'FA5601',
    title: 'Supplier single-source risk',
    description: 'Single-source RM with 12-week lead time',
    likelihood: 3,
    impact: 3,
    score: 9,
    bucket: 'High',
    state: 'Open',
    mitigation: 'Qualify second supplier',
    owner: 'K. Nowak',
  },
  {
    id: 'r-med',
    productCode: 'FA5601',
    title: 'Label artwork slip',
    description: 'Artwork approval may slip past gate',
    likelihood: 2,
    impact: 2,
    score: 4,
    bucket: 'Med',
    state: 'Mitigated',
    mitigation: 'Lock artwork at G3',
    owner: 'A. Kowalska',
  },
  {
    id: 'r-low',
    productCode: 'FA5601',
    title: 'Minor copy tweak',
    description: 'Marketing copy minor change',
    likelihood: 1,
    impact: 1,
    score: 1,
    bucket: 'Low',
    state: 'Closed',
    mitigation: null,
    owner: null,
  },
];

function renderScreen(overrides: Partial<React.ComponentProps<typeof RiskRegisterScreen>> = {}) {
  return render(
    <RiskRegisterScreen
      productCode="FA5601"
      rows={ROWS}
      labels={LABELS}
      canWrite
      state="ready"
      {...overrides}
    />,
  );
}

describe('RiskRegisterScreen — prototype parity (docs-screens.jsx:56-106)', () => {
  it('renders the parity columns in prototype order (Score→Description→Likelihood→Impact→Status→Owner→Mitigation→Actions)', () => {
    renderScreen();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const idx = (l: string) => headers.findIndex((h) => h.includes(l));
    expect(idx(LABELS.colScore)).toBeGreaterThanOrEqual(0);
    expect(idx(LABELS.colScore)).toBeLessThan(idx(LABELS.colDescription));
    expect(idx(LABELS.colDescription)).toBeLessThan(idx(LABELS.colLikelihood));
    expect(idx(LABELS.colLikelihood)).toBeLessThan(idx(LABELS.colImpact));
    expect(idx(LABELS.colImpact)).toBeLessThan(idx(LABELS.colStatus));
    expect(idx(LABELS.colStatus)).toBeLessThan(idx(LABELS.colOwner));
    expect(idx(LABELS.colOwner)).toBeLessThan(idx(LABELS.colMitigation));
    expect(idx(LABELS.colMitigation)).toBeLessThan(idx(LABELS.colActions));
  });

  it('uses shadcn Table + Badge primitives, no raw <select>', () => {
    renderScreen();
    expect(document.querySelector('[data-slot="table"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="badge"]')).not.toBeNull();
    expect(document.querySelector('select')).toBeNull();
  });

  it('maps bucket badge tone High=danger/red, Med=warning/amber, Low=muted/gray and includes a text label (not color alone)', () => {
    renderScreen();
    const high = screen.getByTestId('risk-row-r-high');
    const med = screen.getByTestId('risk-row-r-med');
    const low = screen.getByTestId('risk-row-r-low');

    const highBadge = within(high).getByTestId('risk-bucket-badge');
    const medBadge = within(med).getByTestId('risk-bucket-badge');
    const lowBadge = within(low).getByTestId('risk-bucket-badge');

    expect(highBadge).toHaveAttribute('data-variant', 'danger');
    expect(medBadge).toHaveAttribute('data-variant', 'warning');
    expect(lowBadge).toHaveAttribute('data-variant', 'muted');

    // a11y: severity conveyed by text, not color alone
    expect(highBadge).toHaveTextContent(LABELS.bucketHigh);
    expect(medBadge).toHaveTextContent(LABELS.bucketMed);
    expect(lowBadge).toHaveTextContent(LABELS.bucketLow);
  });

  it('renders the state badge per row (Open / Mitigated / Closed)', () => {
    renderScreen();
    expect(within(screen.getByTestId('risk-row-r-high')).getByText(LABELS.stateOpen)).toBeInTheDocument();
    expect(within(screen.getByTestId('risk-row-r-med')).getByText(LABELS.stateMitigated)).toBeInTheDocument();
    expect(within(screen.getByTestId('risk-row-r-low')).getByText(LABELS.stateClosed)).toBeInTheDocument();
  });

  it('surfaces the V18 built-blocker indicator when a High+Open risk exists', () => {
    renderScreen();
    expect(screen.getByTestId('risk-built-blocker')).toHaveTextContent(LABELS.builtBlocked);
  });

  it('hides the V18 built-blocker indicator when no High+Open risk exists', () => {
    renderScreen({ rows: [ROWS[1], ROWS[2]] });
    expect(screen.queryByTestId('risk-built-blocker')).toBeNull();
  });
});

describe('RiskRegisterScreen — required UI states', () => {
  it('loading: polite status with the loading label', () => {
    renderScreen({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty: prototype EmptyState copy', () => {
    renderScreen({ rows: [], state: 'empty' });
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
    expect(screen.getByText(LABELS.emptyBody)).toBeInTheDocument();
  });

  it('error: alert with the error label', () => {
    renderScreen({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('permission_denied: alert with the forbidden label', () => {
    renderScreen({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
  });
});

describe('RiskRegisterScreen — RBAC', () => {
  it('renders the Add-risk control when canWrite is true', () => {
    renderScreen({ canWrite: true });
    expect(screen.getByRole('button', { name: LABELS.addRisk })).toBeInTheDocument();
  });

  it('omits the Add-risk control entirely when canWrite is false (no render-then-disable)', () => {
    renderScreen({ canWrite: false });
    expect(screen.queryByRole('button', { name: LABELS.addRisk })).toBeNull();
  });
});

describe('RiskAddModal — prototype parity (modals.jsx:297-346) + reason gating', () => {
  it('renders RHF fields (description, likelihood, impact, mitigation) via shadcn primitives, no raw <select>', () => {
    render(
      <RiskAddModal
        open
        mode="create"
        productCode="FA5601"
        labels={LABELS}
        onClose={() => {}}
        createRiskAction={vi.fn()}
        updateRiskAction={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(new RegExp(LABELS.fieldDescription))).toBeInTheDocument();
    expect(screen.getByText(LABELS.fieldLikelihood)).toBeInTheDocument();
    expect(screen.getByText(LABELS.fieldImpact)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(LABELS.fieldMitigation))).toBeInTheDocument();
    // likelihood/impact use shadcn Select (combobox) — never raw <select>
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('select')).toBeNull();
  });

  it('does NOT call updateRiskAction when a lifecycle reason is shorter than 10 chars (§18 reason contract)', async () => {
    const user = userEvent.setup();
    const updateRiskAction = vi.fn().mockResolvedValue({ ok: true });
    render(
      <RiskAddModal
        open
        mode="edit"
        productCode="FA5601"
        risk={ROWS[0]}
        labels={LABELS}
        onClose={() => {}}
        createRiskAction={vi.fn()}
        updateRiskAction={updateRiskAction}
      />,
    );

    // Trigger a lifecycle transition (Mitigate) → reason textarea appears.
    await user.click(screen.getByRole('button', { name: LABELS.mitigate }));
    const reason = screen.getByLabelText(new RegExp(LABELS.fieldReason));
    fireEvent.change(reason, { target: { value: 'short' } });
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    // Inline Zod error shown; the Server Action must NOT be invoked.
    expect(await screen.findByText(LABELS.errorReasonShort)).toBeInTheDocument();
    expect(updateRiskAction).not.toHaveBeenCalled();
  });

  it('DOES call updateRiskAction when the lifecycle reason is ≥10 chars', async () => {
    const user = userEvent.setup();
    const updateRiskAction = vi.fn().mockResolvedValue({ ok: true });
    render(
      <RiskAddModal
        open
        mode="edit"
        productCode="FA5601"
        risk={ROWS[0]}
        labels={LABELS}
        onClose={() => {}}
        createRiskAction={vi.fn()}
        updateRiskAction={updateRiskAction}
      />,
    );

    await user.click(screen.getByRole('button', { name: LABELS.mitigate }));
    const reason = screen.getByLabelText(new RegExp(LABELS.fieldReason));
    fireEvent.change(reason, { target: { value: 'Second supplier qualified and approved' } });
    await user.click(screen.getByRole('button', { name: LABELS.save }));

    await vi.waitFor(() => expect(updateRiskAction).toHaveBeenCalledTimes(1));
    expect(updateRiskAction).toHaveBeenCalledWith(
      expect.objectContaining({
        productCode: 'FA5601',
        riskId: 'r-high',
        transition: expect.objectContaining({ toState: 'Mitigated' }),
      }),
    );
  });
});
