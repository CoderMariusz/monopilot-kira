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

// TrialScreen calls useRouter().refresh() after a successful edit.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

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
  colActions: 'Actions',
  resultPass: 'Pass',
  resultFail: 'Fail',
  resultPending: 'In progress',
  editTrial: 'Edit',
  deleteTrial: 'Delete',
  confirmDelete: 'Delete this trial?',
  deleteError: 'Could not delete the trial. Try again.',
  deleteHasProgressed: 'This trial already has a result and cannot be deleted.',
  modalTitle: 'Log new trial',
  editModalTitle: 'Edit trial',
  fieldTrialNo: 'Trial #',
  fieldDate: 'Trial date',
  fieldBatch: 'Batch size (kg)',
  fieldYield: 'Yield %',
  fieldTechnologist: 'Technologist',
  fieldResult: 'Result',
  fieldNotes: 'Notes',
  technologistNone: 'Unassigned',
  save: 'Save trial',
  saveEdit: 'Save changes',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save the trial. Try again.',
  duplicateError: 'A trial with this number already exists for this project.',
  colLineTime: 'Line time',
  lineTimeNotBooked: 'Not booked',
  bookLineTime: 'Book line time',
  rebookLineTime: 'Re-book',
  bookLineTimeModalTitle: 'Book line time',
  rebookLineTimeModalTitle: 'Re-book line time',
  fieldLine: 'Production line',
  linePlaceholder: 'Select a line…',
  noLines: 'No production lines configured.',
  fieldBlockDate: 'Date',
  fieldStartTime: 'Start time',
  fieldEndTime: 'End time',
  bookLineTimeSaving: 'Saving…',
  bookLineTimeError: 'Could not book line time. Try again.',
  bookLineTimeErrorInvalidInput: 'Check the line, date, and time fields.',
  bookLineTimeErrorInvalidRange: 'End time must be after start time.',
  bookLineTimeErrorForbidden: 'You do not have permission to book line time.',
  bookLineTimeErrorInvalidLine: 'The selected line is not available.',
  bookLineTimeErrorTrialNotFound: 'This trial could not be found.',
  bookLineTimeErrorPersistence: 'Could not save the booking. Try again.',
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
  canBookLineTime: true,
  lines: [{ id: 'line-1', code: 'LINE-01', name: 'Line One' }],
  capacityBookings: {},
  defaultProductionLineId: null,
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

  it('renders the 7 prototype data columns in order (Line time + Actions are additive)', () => {
    // canWrite=false, canBookLineTime=false → additive Line time column only.
    render(
      <TrialScreen
        state="ready"
        data={{ ...DATA, canWrite: false, canBookLineTime: false }}
        labels={LABELS}
      />,
    );
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
      LABELS.colLineTime,
    ]);
  });

  it('keeps the 7 prototype data columns first when additive Line time + Actions columns are shown', () => {
    renderReady({ onUpdateTrial: vi.fn() });
    const heads = within(screen.getByTestId('trial-table'))
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    // First 7 columns unchanged; Line time + sr-only Actions are appended.
    expect(heads.slice(0, 7)).toEqual([
      LABELS.colTrialNo,
      LABELS.colDate,
      LABELS.colBatch,
      LABELS.colYield,
      LABELS.colTechnologist,
      LABELS.colResult,
      LABELS.colNotes,
    ]);
    expect(heads).toHaveLength(9);
    expect(heads[7]).toBe(LABELS.colLineTime);
    expect(screen.getByTestId('trial-actions-head')).toHaveTextContent(LABELS.colActions);
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
      <TrialScreen
        state="ready"
        data={{ ...DATA, canWrite: false, canBookLineTime: false }}
        labels={LABELS}
      />,
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

  it('shows an optimistic row while create is in flight, then clears it (no duplicate after server data arrives)', async () => {
    let resolveLog!: (v: { ok: boolean }) => void;
    const onLogTrial = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveLog = resolve;
        }),
    );
    const { rerender } = renderReady({ onLogTrial });
    fireEvent.click(screen.getByTestId('log-new-trial-button'));
    fireEvent.change(screen.getByLabelText(LABELS.fieldTrialNo), {
      target: { value: 'T-099' },
    });
    fireEvent.submit(screen.getByTestId('log-trial-form'));

    // While the action is pending the optimistic placeholder is visible.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('trial-table')).getAllByTestId('trial-row'),
      ).toHaveLength(4),
    );

    resolveLog({ ok: true });
    await waitFor(() => expect(onLogTrial).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // Placeholder dropped — back to the 3 server rows until RSC re-supplies data.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('trial-table')).getAllByTestId('trial-row'),
      ).toHaveLength(3),
    );

    // Simulate the refreshed RSC payload that includes the new trial.
    const nextBatches = [
      {
        id: 't-new',
        trialNo: 'T-099',
        trialDate: null,
        batchSizeKg: null,
        yieldPct: null,
        technologistUserId: null,
        technologistName: null,
        result: 'pending' as const,
        notes: null,
      },
      ...DATA.batches,
    ];
    rerender(
      <TrialScreen
        state="ready"
        data={{ ...DATA, batches: nextBatches }}
        labels={LABELS}
        onLogTrial={onLogTrial}
      />,
    );
    const rows = within(screen.getByTestId('trial-table')).getAllByTestId('trial-row');
    expect(rows).toHaveLength(4);
    const trialNos = rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent);
    expect(trialNos.filter((n) => n === 'T-099')).toHaveLength(1);
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

describe('TrialScreen — edit logged trial', () => {
  it('renders a per-row Edit button when the caller can write', () => {
    renderReady({ onUpdateTrial: vi.fn() });
    // one Edit button per persisted row
    expect(screen.getByTestId('edit-trial-button-t1')).toBeInTheDocument();
    expect(screen.getByTestId('edit-trial-button-t2')).toBeInTheDocument();
    expect(screen.getByTestId('edit-trial-button-t3')).toBeInTheDocument();
  });

  it('hides the Edit affordance entirely when the caller cannot write (RBAC)', () => {
    render(
      <TrialScreen
        state="ready"
        data={{ ...DATA, canWrite: false, canBookLineTime: false }}
        labels={LABELS}
        onUpdateTrial={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('edit-trial-button-t1')).toBeNull();
    expect(screen.queryByTestId('trial-actions-head')).toBeNull();
  });

  it('opens the edit modal PRE-FILLED with the row values', () => {
    renderReady({ onUpdateTrial: vi.fn() });
    fireEvent.click(screen.getByTestId('edit-trial-button-t1'));
    const form = screen.getByTestId('edit-trial-form');
    expect(form).toBeInTheDocument();
    // Pre-filled from BATCHES[0] = T-012.
    expect(screen.getByLabelText(LABELS.fieldTrialNo)).toHaveValue('T-012');
    expect(screen.getByLabelText(LABELS.fieldDate)).toHaveValue('2025-12-01');
    // NUMERIC strings carried verbatim (no float reformat).
    expect(screen.getByLabelText(LABELS.fieldBatch)).toHaveValue('500.0000');
    expect(screen.getByLabelText(LABELS.fieldYield)).toHaveValue('78.00');
    expect(screen.getByLabelText(LABELS.fieldNotes)).toHaveValue('Good texture');
    // Edit-mode submit label.
    expect(within(form).getByTestId('edit-trial-submit')).toHaveTextContent(LABELS.saveEdit);
  });

  it('submits the update with the row batch id + edited values, then refreshes', async () => {
    const onUpdateTrial = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ onUpdateTrial });
    fireEvent.click(screen.getByTestId('edit-trial-button-t1'));
    fireEvent.change(screen.getByLabelText(LABELS.fieldTrialNo), {
      target: { value: 'T-012-rev' },
    });
    fireEvent.submit(screen.getByTestId('edit-trial-form'));
    await waitFor(() => expect(onUpdateTrial).toHaveBeenCalledTimes(1));
    expect(onUpdateTrial).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 't1',
        projectId: 'project-1',
        trialNo: 'T-012-rev',
        result: 'pass',
      }),
    );
    // On success the RSC tree is refreshed (no client-trusted optimistic edit).
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // Modal closes on success.
    await waitFor(() => expect(screen.queryByTestId('edit-trial-form')).toBeNull());
  });

  it('surfaces the friendly duplicate_trial_no error on edit and keeps the modal open', async () => {
    const onUpdateTrial = vi.fn().mockResolvedValue({ ok: false, error: 'duplicate_trial_no' });
    renderReady({ onUpdateTrial });
    fireEvent.click(screen.getByTestId('edit-trial-button-t2'));
    fireEvent.change(screen.getByLabelText(LABELS.fieldTrialNo), {
      target: { value: 'T-012' },
    });
    fireEvent.submit(screen.getByTestId('edit-trial-form'));
    await waitFor(() =>
      expect(screen.getByTestId('edit-trial-error')).toHaveTextContent(LABELS.duplicateError),
    );
    // No refresh on failure; modal stays open for correction.
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId('edit-trial-form')).toBeInTheDocument();
  });
});

describe('TrialScreen — book line time', () => {
  it('shows "Not booked" when no capacity block exists', () => {
    renderReady();
    expect(screen.getByTestId('trial-line-time-t1')).toHaveTextContent(LABELS.lineTimeNotBooked);
  });

  it('shows the booked window when a capacity block exists', () => {
    renderReady({
      data: {
        ...DATA,
        capacityBookings: {
          t1: {
            id: 'cb-1',
            trialId: 't1',
            lineId: 'line-1',
            lineCode: 'LINE-01',
            lineName: 'Line One',
            blockDate: '2025-12-10',
            startTime: '09:00',
            endTime: '12:00',
          },
        },
      },
    });
    expect(screen.getByTestId('trial-line-time-t1')).toHaveTextContent(
      '2025-12-10 · Line One · 09:00–12:00',
    );
    expect(screen.getByTestId('book-line-time-button-t1')).toHaveTextContent(LABELS.rebookLineTime);
  });

  it('opens the booking modal with NO raw <select> and submits upsert payload', async () => {
    const onBookLineTime = vi.fn().mockResolvedValue({ ok: true });
    const { container } = renderReady({
      onBookLineTime,
      data: {
        ...DATA,
        capacityBookings: {
          t1: {
            id: 'cb-1',
            trialId: 't1',
            lineId: 'line-1',
            lineCode: 'LINE-01',
            lineName: 'Line One',
            blockDate: '2025-12-10',
            startTime: '09:00',
            endTime: '12:00',
          },
        },
      },
    });
    fireEvent.click(screen.getByTestId('book-line-time-button-t1'));
    expect(screen.getByTestId('book-line-time-form-t1')).toBeInTheDocument();
    expect(container.querySelector('select')).toBeNull();
    fireEvent.change(screen.getByLabelText(LABELS.fieldBlockDate), {
      target: { value: '2025-12-11' },
    });
    fireEvent.change(screen.getByLabelText(LABELS.fieldStartTime), {
      target: { value: '10:00' },
    });
    fireEvent.change(screen.getByLabelText(LABELS.fieldEndTime), {
      target: { value: '13:00' },
    });
    fireEvent.submit(screen.getByTestId('book-line-time-form-t1'));
    await waitFor(() => expect(onBookLineTime).toHaveBeenCalledTimes(1));
    expect(onBookLineTime).toHaveBeenCalledWith(
      expect.objectContaining({
        trialId: 't1',
        lineId: 'line-1',
        blockDate: '2025-12-11',
        startTime: '10:00',
        endTime: '13:00',
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('surfaces forbidden errors loudly in the modal', async () => {
    const onBookLineTime = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    renderReady({
      onBookLineTime,
      data: {
        ...DATA,
        capacityBookings: {
          t1: {
            id: 'cb-1',
            trialId: 't1',
            lineId: 'line-1',
            lineCode: 'LINE-01',
            lineName: 'Line One',
            blockDate: '2025-12-10',
            startTime: '09:00',
            endTime: '12:00',
          },
        },
      },
    });
    fireEvent.click(screen.getByTestId('book-line-time-button-t1'));
    fireEvent.submit(screen.getByTestId('book-line-time-form-t1'));
    await waitFor(() =>
      expect(screen.getByTestId('book-line-time-error-t1')).toHaveTextContent(
        LABELS.bookLineTimeErrorForbidden,
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('hides book affordance when the caller lacks planning write (RBAC)', () => {
    renderReady({ data: { ...DATA, canBookLineTime: false } });
    expect(screen.queryByTestId('book-line-time-button-t1')).toBeNull();
  });
});

describe('TrialScreen — delete pending trial', () => {
  it('deletes a pending trial after confirm and refreshes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleteTrial = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ onDeleteTrial });
    expect(screen.getByTestId('delete-trial-button-t3')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-trial-button-t1')).toBeNull(); // pass — no delete
    fireEvent.click(screen.getByTestId('delete-trial-button-t3'));
    await waitFor(() => expect(onDeleteTrial).toHaveBeenCalledTimes(1));
    expect(onDeleteTrial).toHaveBeenCalledWith({ id: 't3', projectId: 'project-1' });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    confirmSpy.mockRestore();
  });

  it('does not call delete when confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDeleteTrial = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ onDeleteTrial });
    fireEvent.click(screen.getByTestId('delete-trial-button-t3'));
    expect(onDeleteTrial).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
