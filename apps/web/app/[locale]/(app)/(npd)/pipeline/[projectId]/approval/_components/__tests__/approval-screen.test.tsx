/**
 * @vitest-environment jsdom
 * T-079 — ApprovalScreen (approval_screen prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:412-475 (ApprovalScreen)
 *
 * RED → GREEN. Asserts the parity checklist (two cards: the 7-criteria gates
 * summary card with pass/warn/pending status circles + count badges, and the
 * approval-chain card carrying the Submit-for-approval CTA), the criteria card's
 * C1-C7 badge grid driven by the T-078 evaluateApprovalCriteria result, the
 * Submit gating (disabled unless every criterion is pass/not_required — one
 * `pending` keeps it disabled per §17.11.5), the e-sign flow (Submit opens the
 * GateApprovalModal, modal confirm invokes approveProjectGate with the password
 * per §17.6), the four required UI states (loading / empty / ready / error),
 * permission-denied, and that every visible string comes from the injected i18n
 * labels (no DEFAULT_LABELS leak).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApprovalScreen,
  CRITERIA_ORDER,
  type ApprovalCriterionKey,
  type ApprovalCriterionStatus,
  type ApprovalScreenData,
  type ApprovalLabels,
  type ApproveGateCall,
  type ApproveGateOutcome,
} from '../approval-screen';

afterEach(() => cleanup());

const LABELS: ApprovalLabels = {
  title: 'Approval gates',
  subtitle: 'Seven approval criteria for this project',
  countPass: '{count} pass',
  countWarn: '{count} warn',
  countPending: '{count} pending',
  chainTitle: 'Approval chain',
  chainSingle: '(single approver)',
  chainMulti: '(multi-step)',
  submit: 'Submit for approval',
  submitBlocked: 'All criteria must pass before you can submit.',
  view: 'View',
  statusPass: 'Pass',
  statusWarn: 'Warning',
  statusPending: 'Pending',
  statusNotRequired: 'Not required',
  c1Name: 'Recipe locked',
  c2Name: 'Nutrition targets met',
  c3Name: 'Cost within target',
  c4Name: 'Sensory ≥ 7.0 overall',
  c5Name: 'Allergens declared',
  c6Name: 'No open high risks',
  c7Name: 'Compliance docs reviewed',
  c1Detail: 'Formulation version is locked.',
  c2Detail: 'NutriScore grade within spec.',
  c3Detail: 'Target margin meets the NPD minimum.',
  c4Detail: 'Technical sensory panel mean score.',
  c5Detail: 'All allergens audited and declared.',
  c6Detail: 'No open high-severity risks remain.',
  c7Detail: 'All compliance documents valid.',
  c1Hint: 'Lock the formulation version on the Formulation stage.',
  c2Hint: 'Compute a passing NutriScore on the Nutrition stage.',
  c3Hint: 'Reach the target-scenario margin on the Costing stage.',
  c4Hint: 'Sensory is owned by Technical — no action needed.',
  c5Hint: 'Audit and declare every allergen.',
  c6Hint: 'Close every open high-severity risk.',
  c7Hint: 'Add valid compliance documents.',
  fixLink: 'Go fix →',
  stepDone: 'Approved',
  stepCurrent: 'Awaiting',
  stepPending: 'Pending',
  modalTitle: 'Submit for approval',
  modalSubtitle: 'E-signature required to submit.',
  fieldPassword: 'Password',
  fieldNotes: 'Notes',
  cancel: 'Cancel',
  confirm: 'Confirm submission',
  signing: 'Submitting…',
  modalError: 'Submission failed. Check your password and try again.',
  loading: 'Loading approval criteria…',
  empty: 'No approval criteria yet',
  emptyBody: 'Approval criteria appear once the project reaches the approval gate.',
  error: 'Unable to load the approval criteria.',
  forbidden: 'You do not have permission to view this approval.',
};

function makeData(
  overrides?: Partial<Record<ApprovalCriterionKey, ApprovalCriterionStatus>>,
  criterionLinks?: ApprovalScreenData['criterionLinks'],
): ApprovalScreenData {
  const base: Record<ApprovalCriterionKey, ApprovalCriterionStatus> = {
    C1: 'pass',
    C2: 'pass',
    C3: 'pass',
    C4: 'pass',
    C5: 'pass',
    C6: 'pass',
    C7: 'pass',
  };
  return {
    projectId: '11111111-1111-4111-8111-111111111111',
    projectCode: 'NPD-024',
    projectName: 'Sliced Ham 200g',
    gateCode: 'G4',
    approvalMode: 'single',
    criteria: { ...base, ...overrides },
    steps: [{ who: 'NPD Manager', name: 'A. Davis', status: 'current', when: 'pending' }],
    criterionLinks,
  };
}

describe('ApprovalScreen — parity + gating + e-sign', () => {
  it('renders the two cards (gates summary + chain status) per prototype 412-475', () => {
    render(<ApprovalScreen state="ready" data={makeData()} labels={LABELS} canApprove />);
    expect(screen.getByRole('heading', { name: LABELS.title })).toBeInTheDocument();
    expect(screen.getByTestId('approval-gates-card')).toBeInTheDocument();
    expect(screen.getByTestId('approval-chain-card')).toBeInTheDocument();
  });

  it('renders a C1-C7 badge grid in canonical order', () => {
    render(<ApprovalScreen state="ready" data={makeData()} labels={LABELS} canApprove />);
    const rows = screen.getAllByTestId(/^criterion-row-/);
    expect(rows).toHaveLength(7);
    const keys = rows.map((r) => r.getAttribute('data-criterion'));
    expect(keys).toEqual([...CRITERIA_ORDER]);
    expect(screen.getByText(LABELS.c1Name)).toBeInTheDocument();
    expect(screen.getByText(LABELS.c7Name)).toBeInTheDocument();
  });

  it('shows pass/warn/pending count badges (prototype summary)', () => {
    render(
      <ApprovalScreen
        state="ready"
        data={makeData({ C3: 'warn', C6: 'pending', C7: 'pending' })}
        labels={LABELS}
        canApprove
      />,
    );
    expect(screen.getByTestId('count-pass')).toHaveTextContent('4');
    expect(screen.getByTestId('count-warn')).toHaveTextContent('1');
    expect(screen.getByTestId('count-pending')).toHaveTextContent('2');
  });

  it('enables Submit only when all 7 criteria are pass (§17.11.5)', () => {
    render(<ApprovalScreen state="ready" data={makeData()} labels={LABELS} canApprove />);
    expect(screen.getByTestId('submit-for-approval')).toBeEnabled();
  });

  it('DISABLES Submit when any criterion is pending (AC#2)', () => {
    render(<ApprovalScreen state="ready" data={makeData({ C6: 'pending' })} labels={LABELS} canApprove />);
    expect(screen.getByTestId('submit-for-approval')).toBeDisabled();
  });

  it('disables Submit when a criterion is warn', () => {
    render(<ApprovalScreen state="ready" data={makeData({ C3: 'warn' })} labels={LABELS} canApprove />);
    expect(screen.getByTestId('submit-for-approval')).toBeDisabled();
  });

  it('treats not_required criteria as satisfied for gating', () => {
    render(<ApprovalScreen state="ready" data={makeData({ C4: 'not_required' })} labels={LABELS} canApprove />);
    expect(screen.getByTestId('submit-for-approval')).toBeEnabled();
  });

  it('opens GateApprovalModal and invokes approveProjectGate with the e-sign password (AC#3, §17.6)', async () => {
    const onApprove = vi.fn<[ApproveGateCall], Promise<ApproveGateOutcome>>().mockResolvedValue({ ok: true });
    render(
      <ApprovalScreen
        state="ready"
        data={makeData()}
        labels={LABELS}
        canApprove
        onApprove={onApprove}
      />,
    );
    fireEvent.click(screen.getByTestId('submit-for-approval'));
    const modal = await screen.findByRole('dialog');
    fireEvent.change(within(modal).getByLabelText(LABELS.fieldPassword), { target: { value: 'pin-1234' } });
    fireEvent.change(within(modal).getByLabelText(LABELS.fieldNotes), { target: { value: 'Approved at G4' } });
    fireEvent.click(within(modal).getByTestId('approval-modal-confirm'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove).toHaveBeenCalledWith({
      projectId: '11111111-1111-4111-8111-111111111111',
      gateCode: 'G4',
      decision: 'approved',
      notes: 'Approved at G4',
      password: 'pin-1234',
    });
  });

  it('surfaces a "how to satisfy" hint + remediation link for an unsatisfied (pending) criterion', () => {
    render(
      <ApprovalScreen
        state="ready"
        data={makeData(
          { C1: 'pending' },
          { C1: '/en/pipeline/p1/formulation' },
        )}
        labels={LABELS}
        canApprove
      />,
    );
    const hint = screen.getByTestId('criterion-hint-C1');
    expect(hint).toHaveTextContent(LABELS.c1Hint);
    const link = screen.getByTestId('criterion-fix-link-C1');
    expect(link).toHaveAttribute('href', '/en/pipeline/p1/formulation');
    expect(link).toHaveTextContent(LABELS.fixLink);
  });

  it('shows a hint for a warn criterion too', () => {
    render(
      <ApprovalScreen
        state="ready"
        data={makeData({ C6: 'warn' }, { C6: '/en/fa/PC-1/risks' })}
        labels={LABELS}
        canApprove
      />,
    );
    expect(screen.getByTestId('criterion-hint-C6')).toHaveTextContent(LABELS.c6Hint);
    expect(screen.getByTestId('criterion-fix-link-C6')).toHaveAttribute('href', '/en/fa/PC-1/risks');
  });

  it('does NOT show a hint for a satisfied (pass) criterion', () => {
    render(<ApprovalScreen state="ready" data={makeData()} labels={LABELS} canApprove />);
    expect(screen.queryByTestId('criterion-hint-C1')).not.toBeInTheDocument();
  });

  it('renders the hint without a link when no remediation href is provided', () => {
    render(<ApprovalScreen state="ready" data={makeData({ C4: 'warn' })} labels={LABELS} canApprove />);
    expect(screen.getByTestId('criterion-hint-C4')).toHaveTextContent(LABELS.c4Hint);
    expect(screen.queryByTestId('criterion-fix-link-C4')).not.toBeInTheDocument();
  });

  it('hides the Submit affordance when caller lacks approve permission (no render-then-disable leak)', () => {
    render(<ApprovalScreen state="ready" data={makeData()} labels={LABELS} canApprove={false} />);
    expect(screen.queryByTestId('submit-for-approval')).not.toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<ApprovalScreen state="loading" data={null} labels={LABELS} canApprove />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<ApprovalScreen state="empty" data={null} labels={LABELS} canApprove />);
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<ApprovalScreen state="error" data={null} labels={LABELS} canApprove />);
    expect(screen.getByText(LABELS.error)).toBeInTheDocument();
  });

  it('renders permission-denied state', () => {
    render(<ApprovalScreen state="permission_denied" data={null} labels={LABELS} canApprove={false} />);
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
  });

  it('uses injected i18n labels (no default leak)', () => {
    render(<ApprovalScreen state="ready" data={makeData()} labels={LABELS} canApprove />);
    expect(screen.getByTestId('submit-for-approval')).toHaveTextContent(LABELS.submit);
    // Status text is paired with the icon glyph (a11y: never color-only).
    expect(screen.getAllByText(LABELS.statusPass).length).toBeGreaterThan(0);
  });
});
