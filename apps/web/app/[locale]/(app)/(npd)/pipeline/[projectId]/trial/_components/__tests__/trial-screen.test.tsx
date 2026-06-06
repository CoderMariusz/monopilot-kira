/**
 * @vitest-environment jsdom
 * 01-NPD TRIAL stage — TrialScreen component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:222-257 (TrialScreen)
 *
 * RED → GREEN: asserts the parity checklist (Lab & kitchen trials card + subtitle,
 * "+ Log new trial" CTA, the 7-column table Trial # / Date / Batch / Yield /
 * Technologist / Result / Notes, the result badges pass=green / fail=red /
 * pending=amber), the five required UI states (loading / empty / populated /
 * error / permission-denied), that visible strings come from injected i18n
 * labels (no inline-string leak), that the modal uses NO raw <select>, and the
 * optimistic insert on a successful log.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TrialScreen, type TrialLabels, type TrialScreenData } from '../trial-screen';
import type { TrialBatchView } from '../../_actions/errors';

afterEach(() => cleanup());

const LABELS: TrialLabels = {
  title: 'Lab & kitchen trials',
  subtitle: 'Small-batch runs to validate recipe before pilot.',
  logNewTrial: '+ Log new trial',
  colTrialNo: 'Trial #',
  colDate: 'Date',
  colBatch: 'Batch',
  colYield: 'Yield',
  colTechnologist: 'Technologist',
  colResult: 'Result',
  colNotes: 'Notes',
  resultPass: 'Pass',
  resultFail: 'Fail',
  resultPending: 'In progress',
  modalTitle: 'Log new trial',
  fieldTrialNo: 'Trial #',
  fieldDate: 'Trial date',
  fieldBatch: 'Batch size (kg)',
  fieldYield: 'Yield %',
  fieldTechnologist: 'Technologist',
  fieldResult: 'Result',
  fieldNotes: 'Notes',
  technologistNone: 'Unassigned',
  save: 'Save trial',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save the trial. Try again.',
  duplicateError: 'A trial with this number already exists for this project.',
  loading: 'Loading trials…',
  empty: 'No trials logged yet',
  emptyBody: 'Log a small-batch run to validate the recipe before pilot.',
  error: 'Unable to load trial data.',
  forbidden: 'You do not have permission to view trials.',
};

const BATCHES: TrialBatchView[] = [
  {
    id: 't1',
    trialNo: 'T-012',
    trialDate: '2025-12-01',
    batchSizeKg: '500.0000',
    yieldPct: '78.00',
    technologistUserId: 'u1',
    technologistName: 'A. Tech',
    result: 'pass',
    notes: 'Good texture',
  },
  {
    id: 't2',
    trialNo: 'T-013',
    trialDate: '2025-12-03',
    batchSizeKg: '450.0000',
    yieldPct: '64.50',
    technologistUserId: 'u2',
    technologistName: 'B. Tech',
    result: 'fail',
    notes: 'Too dry',
  },
  {
    id: 't3',
    trialNo: 'T-014',
    trialDate: null,
    batchSizeKg: null,
    yieldPct: null,
    technologistUserId: null,
    technologistName: null,
    result: 'pending',
    notes: null,
  },
];

const DATA: TrialScreenData = {
  projectId: 'project-1',
  productName: 'Sliced Ham 200g',
  batches: BATCHES,
  technologists: [
    { id: 'u1', name: 'A. Tech' },
    { id: 'u2', name: 'B. Tech' },
  ],
  canWrite: true,
};

function renderReady(extra?: Partial<React.ComponentProps<typeof TrialScreen>>) {
  return render(<TrialScreen state="ready" data={DATA} labels={LABELS} {...extra} />);
}

describe('TrialScreen — parity', () => {
  it('renders the Lab & kitchen trials card + subtitle from i18n labels', () => {
    renderReady();
    expect(screen.getByTestId('trial-card')).toBeInTheDocument();
    expect(screen.getAllByText(LABELS.title).length).toBeGreaterThan(0);
    expect(screen.getByText(LABELS.subtitle)).toBeInTheDocument();
  });

  it('renders the 7-column table header in prototype order', () => {
    renderReady();
    const heads = within(screen.getByTestId('trial-table'))
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(heads).toEqual([
      LABELS.colTrialNo,
      LABELS.colDate,
      LABELS.colBatch,
      LABELS.colYield,
      LABELS.colTechnologist,
      LABELS.colResult,
      LABELS.colNotes,
    ]);
  });

  it('renders a row per trial with NUMERIC strings (never float math)', () => {
    renderReady();
    const rows = within(screen.getByTestId('trial-table')).getAllByTestId('trial-row');
    expect(rows).toHaveLength(3);
    const first = rows[0]!;
    expect(within(first).getByText('T-012')).toBeInTheDocument();
    // yield 78.00 → "78%"; batch 500.0000 → "500 kg"
    expect(within(first).getByText('78%')).toBeInTheDocument();
    expect(within(first).getByText('500 kg')).toBeInTheDocument();
  });

  it('renders result badges: pass=green, fail=red, pending=amber', () => {
    renderReady();
    const pass = screen.getByTestId('trial-result-pass');
    const fail = screen.getByTestId('trial-result-fail');
    const pending = screen.getByTestId('trial-result-pending');
    expect(pass).toHaveClass('badge-green');
    expect(pass.textContent).toContain(LABELS.resultPass);
    expect(fail).toHaveClass('badge-red');
    expect(fail.textContent).toContain(LABELS.resultFail);
    expect(pending).toHaveClass('badge-amber');
    expect(pending.textContent).toContain(LABELS.resultPending);
  });

  it('renders the "+ Log new trial" CTA when the caller can write', () => {
    renderReady();
    expect(
      screen.getByRole('button', { name: LABELS.logNewTrial }),
    ).toBeInTheDocument();
  });

  it('hides the write CTA when the caller cannot write (RBAC, server-resolved)', () => {
    render(
      <TrialScreen state="ready" data={{ ...DATA, canWrite: false }} labels={LABELS} />,
    );
    expect(screen.queryByTestId('log-new-trial-button')).toBeNull();
  });
});

describe('TrialScreen — states', () => {
  it('loading', () => {
    render(<TrialScreen state="loading" data={null} labels={LABELS} />);
    expect(screen.getByRole('status')).toHaveTextContent(LABELS.loading);
  });
  it('empty', () => {
    render(<TrialScreen state="empty" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
    expect(screen.getByText(LABELS.emptyBody)).toBeInTheDocument();
  });
  it('error', () => {
    render(<TrialScreen state="error" data={null} labels={LABELS} />);
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });
  it('permission_denied', () => {
    render(<TrialScreen state="permission_denied" data={null} labels={LABELS} />);
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
  });
});

describe('TrialScreen — modal + optimistic', () => {
  it('opens the modal with NO raw <select> (shadcn Select only)', () => {
    const { container } = renderReady();
    fireEvent.click(screen.getByTestId('log-new-trial-button'));
    expect(screen.getByTestId('log-trial-form')).toBeInTheDocument();
    expect(container.querySelector('select')).toBeNull();
  });

  it('optimistically inserts a row on a successful log', async () => {
    const onLogTrial = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ onLogTrial });
    fireEvent.click(screen.getByTestId('log-new-trial-button'));
    fireEvent.change(screen.getByLabelText(LABELS.fieldTrialNo), {
      target: { value: 'T-099' },
    });
    fireEvent.submit(screen.getByTestId('log-trial-form'));
    await waitFor(() => expect(onLogTrial).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('trial-table')).getAllByTestId('trial-row'),
      ).toHaveLength(4),
    );
    expect(onLogTrial).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', trialNo: 'T-099' }),
    );
  });

  it('surfaces the friendly duplicate_trial_no error and rolls back optimistic row', async () => {
    const onLogTrial = vi.fn().mockResolvedValue({ ok: false, error: 'duplicate_trial_no' });
    renderReady({ onLogTrial });
    fireEvent.click(screen.getByTestId('log-new-trial-button'));
    fireEvent.change(screen.getByLabelText(LABELS.fieldTrialNo), {
      target: { value: 'T-012' },
    });
    fireEvent.submit(screen.getByTestId('log-trial-form'));
    await waitFor(() =>
      expect(screen.getByTestId('log-trial-error')).toHaveTextContent(LABELS.duplicateError),
    );
    // Optimistic row rolled back → back to 3 rows.
    expect(
      within(screen.getByTestId('trial-table')).getAllByTestId('trial-row'),
    ).toHaveLength(3);
  });
});
