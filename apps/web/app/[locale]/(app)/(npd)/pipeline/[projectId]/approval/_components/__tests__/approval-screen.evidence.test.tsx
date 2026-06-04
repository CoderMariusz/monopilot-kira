/**
 * @vitest-environment jsdom
 * T-079 — ApprovalScreen parity evidence harness (RTL/DOM-snapshot fallback).
 *
 * Playwright happy-path capture needs a running Next server + Supabase auth +
 * a seeded npd_project at the approval gate with a linked FA product_code and
 * evaluated C1-C7 criteria (the module-level Gate-5 live-deploy verification).
 * At the component-task layer that stack is unavailable, so — per T-079 AC4 ("if
 * Playwright is unavailable, document the blocker and provide RTL/snapshot
 * fallback evidence") — this harness renders every required UI state (plus the
 * gated/blocked + all-pass + e-sign-modal variants) and writes the resulting DOM
 * to apps/web/e2e/parity-evidence/npd/T-079/<state>.html.
 *
 * These artifacts are the parity-diff source (prototype other-stages.jsx:412-475
 * → production DOM) and the per-state evidence (loading / empty / populated /
 * error / permission-denied + blocked + modal).
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ApprovalScreen,
  type ApprovalCriterionKey,
  type ApprovalCriterionStatus,
  type ApprovalLabels,
  type ApprovalScreenData,
  type PageState,
} from '../approval-screen';

afterEach(() => cleanup());

const OUT_DIR = path.resolve(__dirname, '../../../../../../../../../e2e/parity-evidence/npd/T-079');

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
  c1Detail: 'The formulation version is locked.',
  c2Detail: 'NutriScore grade is within the approval spec.',
  c3Detail: 'Target-scenario margin meets the NPD minimum.',
  c4Detail: 'Technical-owned sensory panel status.',
  c5Detail: 'All allergens are audited and declared.',
  c6Detail: 'No open high-severity risks remain.',
  c7Detail: 'All compliance documents are valid.',
  stepDone: 'Approved',
  stepCurrent: 'Awaiting',
  stepPending: 'Pending',
  modalTitle: 'Submit for approval',
  modalSubtitle: 'An e-signature is required to submit this gate for approval.',
  fieldPassword: 'Password',
  fieldNotes: 'Approval notes',
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

function data(overrides?: Partial<Record<ApprovalCriterionKey, ApprovalCriterionStatus>>): ApprovalScreenData {
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
  };
}

function write(state: string, html: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${state}.html`), html, 'utf8');
}

describe('ApprovalScreen — parity evidence capture', () => {
  const cases: Array<{ state: PageState; d: ApprovalScreenData | null; canApprove: boolean }> = [
    { state: 'loading', d: null, canApprove: true },
    { state: 'empty', d: null, canApprove: true },
    { state: 'ready', d: data(), canApprove: true },
    { state: 'error', d: null, canApprove: true },
    { state: 'permission_denied', d: null, canApprove: false },
  ];

  it.each(cases)('captures DOM for state=$state', ({ state, d, canApprove }) => {
    const { container } = render(<ApprovalScreen state={state} data={d} labels={LABELS} canApprove={canApprove} />);
    write(state === 'ready' ? 'populated' : state, container.innerHTML);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('captures the Submit-gated (pending criterion) variant', () => {
    const { container } = render(
      <ApprovalScreen state="ready" data={data({ C6: 'pending', C7: 'pending' })} labels={LABELS} canApprove />,
    );
    write('blocked', container.innerHTML);
    expect(container.querySelector('[data-testid="submit-for-approval"]')).toBeDisabled();
  });

  it('captures the e-sign modal (optimistic submit) variant', async () => {
    const { container } = render(<ApprovalScreen state="ready" data={data()} labels={LABELS} canApprove />);
    fireEvent.click(screen.getByTestId('submit-for-approval'));
    await screen.findByRole('dialog');
    write('modal', container.ownerDocument.body.innerHTML);
    expect(screen.getByTestId('approval-modal-confirm')).toBeInTheDocument();
  });
});
