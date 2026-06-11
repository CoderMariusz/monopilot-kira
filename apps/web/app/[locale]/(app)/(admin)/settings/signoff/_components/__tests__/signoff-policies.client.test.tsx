import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SignoffPoliciesScreen, { type SignoffLabels } from '../signoff-policies.client';

const LABELS: SignoffLabels = {
  title: 'Sign-off policies',
  description: 'Configure e-signatures.',
  colType: 'Sign-off type',
  colRequired: 'Required signatures',
  colFirstSigner: 'First signer role',
  colSecondSigner: 'Second signer role',
  colSameUser: 'Allow same user',
  colActive: 'Active',
  colActions: 'Actions',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  unassigned: 'Any role',
  allowSameUserOn: 'Same user allowed',
  allowSameUserOff: 'Distinct users',
  activeOn: 'Active',
  activeOff: 'Inactive',
  saved: 'Saved.',
  readOnly: 'Admin only.',
  permissionDenied: 'Org admin access required.',
  empty: 'No policies.',
  typeLabels: { 'production.changeover.allergen': 'Allergen machine changeover' },
  productionApprovalsTitle: 'Production approvals',
  thresholdLabel: 'Over-consumption tolerance (%)',
  thresholdHelp: 'Above this tolerance requires supervisor PIN approval.',
  warnThresholdLabel: 'Warning threshold (%)',
  warnThresholdHelp: 'Above this threshold is recorded with a warning.',
  warnAboveApprove: 'Warning threshold must be less than or equal to the approval tolerance.',
  thresholdSave: 'Save tolerance',
  thresholdSaved: 'Tolerance saved.',
};

const POLICY = {
  id: 'p1',
  signoffType: 'production.changeover.allergen',
  requiredSignatures: 2,
  firstSignerRoleId: null,
  secondSignerRoleId: null,
  allowSameUser: false,
  isActive: true,
};

const ROLES = [{ id: 'r1', label: 'QA Manager' }];

describe('SignoffPoliciesScreen', () => {
  it('parity: renders the policy table with the translated sign-off type label and threshold card', () => {
    render(
      <SignoffPoliciesScreen
        policies={[POLICY]}
        roles={ROLES}
        canEdit
        initialThresholdPct={5}
        initialWarnPct={2}
        labels={LABELS}
        upsertSignoffPolicy={vi.fn()}
        setOverconsumeThresholds={vi.fn()}
      />,
    );
    expect(screen.getByText('Allergen machine changeover')).toBeInTheDocument();
    expect(screen.getByText('Distinct users')).toBeInTheDocument();
    expect(screen.getByText('Over-consumption tolerance (%)')).toBeInTheDocument();
    expect(screen.getByText('Above this tolerance requires supervisor PIN approval.')).toBeInTheDocument();
  });

  it('RBAC: read-only when canEdit is false (edit disabled, read-only notice shown)', () => {
    render(
      <SignoffPoliciesScreen
        policies={[POLICY]}
        roles={ROLES}
        canEdit={false}
        initialThresholdPct={0}
        initialWarnPct={0}
        labels={LABELS}
        upsertSignoffPolicy={vi.fn()}
        setOverconsumeThresholds={vi.fn()}
      />,
    );
    expect(screen.getByText('Admin only.')).toBeInTheDocument();
    expect(screen.getByTestId('signoff-edit-production.changeover.allergen')).toBeDisabled();
  });

  it('empty state: renders the empty notice when no policies', () => {
    render(
      <SignoffPoliciesScreen
        policies={[]}
        roles={ROLES}
        canEdit
        initialThresholdPct={0}
        initialWarnPct={0}
        labels={LABELS}
        upsertSignoffPolicy={vi.fn()}
        setOverconsumeThresholds={vi.fn()}
      />,
    );
    expect(screen.getByTestId('signoff-empty')).toHaveTextContent('No policies.');
  });

  it('saves BOTH over-consumption thresholds (warn + approve) through the action', async () => {
    const setThresholds = vi.fn(async () => ({ ok: true as const, warnPct: 5, approvePct: 10 }));
    render(
      <SignoffPoliciesScreen
        policies={[POLICY]}
        roles={ROLES}
        canEdit
        initialThresholdPct={0}
        initialWarnPct={0}
        labels={LABELS}
        upsertSignoffPolicy={vi.fn()}
        setOverconsumeThresholds={setThresholds}
      />,
    );
    fireEvent.change(screen.getByLabelText('Warning threshold (%)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Over-consumption tolerance (%)'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Save tolerance'));
    await waitFor(() => expect(setThresholds).toHaveBeenCalledWith({ warnPct: 5, approvePct: 10 }));
    expect(await screen.findByText('Tolerance saved.')).toBeInTheDocument();
  });

  it('rejects warn > approve client-side with the validation message (action NOT called)', async () => {
    const setThresholds = vi.fn(async () => ({ ok: true as const, warnPct: 0, approvePct: 0 }));
    render(
      <SignoffPoliciesScreen
        policies={[POLICY]}
        roles={ROLES}
        canEdit
        initialThresholdPct={0}
        initialWarnPct={0}
        labels={LABELS}
        upsertSignoffPolicy={vi.fn()}
        setOverconsumeThresholds={setThresholds}
      />,
    );
    fireEvent.change(screen.getByLabelText('Warning threshold (%)'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Over-consumption tolerance (%)'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Save tolerance'));
    expect(
      await screen.findByText('Warning threshold must be less than or equal to the approval tolerance.'),
    ).toBeInTheDocument();
    expect(setThresholds).not.toHaveBeenCalled();
  });
});
