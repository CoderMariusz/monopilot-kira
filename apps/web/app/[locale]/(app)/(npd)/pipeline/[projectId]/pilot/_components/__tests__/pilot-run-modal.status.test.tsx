/**
 * @vitest-environment jsdom
 *
 * FINAL-NIGHT gap 1 — the pilot run-plan modal must carry a Status control so a
 * planned run can be marked `completed` from the UI (the launch gate
 * PILOT_WO_NOT_LINKED requires a completed pilot_runs row, but the Edit-plan
 * modal previously had no status control).
 *
 * Allowed status values come from the pilot_runs CHECK constraint (migration 234:
 * 'planned' | 'in_progress' | 'completed') and the upsertPilotRun zod enum.
 *
 * RED → GREEN asserts:
 *   - the modal renders a Status select in edit mode (no raw <select>);
 *   - changing it to "completed" submits `status: 'completed'` in the payload;
 *   - the pre-fill reflects the existing run's status.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PilotRunModal } from '../pilot-run-modal';
import type { PilotLabels, PilotRunView } from '../pilot-screen';

afterEach(cleanup);

const LABELS = {
  // only the keys the modal reads are needed; sentinel strings prove i18n wiring
  editPlan: 'lbl.editPlan',
  planPilotRun: 'lbl.planPilotRun',
  fieldPlannedDate: 'lbl.fieldPlannedDate',
  fieldLine: 'lbl.fieldLine',
  linePlaceholder: 'lbl.linePlaceholder',
  noLines: 'lbl.noLines',
  fieldBatchSize: 'lbl.fieldBatchSize',
  fieldExpectedYield: 'lbl.fieldExpectedYield',
  fieldDuration: 'lbl.fieldDuration',
  fieldSupervisor: 'lbl.fieldSupervisor',
  fieldStatus: 'lbl.fieldStatus',
  statusPlanned: 'lbl.statusPlanned',
  statusInProgress: 'lbl.statusInProgress',
  statusCompleted: 'lbl.statusCompleted',
  noSupervisor: 'lbl.noSupervisor',
  save: 'lbl.save',
  saving: 'lbl.saving',
  cancel: 'lbl.cancel',
  saveError: 'lbl.saveError',
} as unknown as PilotLabels;

const RUN: PilotRunView = {
  id: 'run-1',
  projectId: 'proj-1',
  plannedDate: '2026-09-01',
  line: 'L1',
  batchSizeKg: '120',
  expectedYieldPct: '92',
  durationHours: '6',
  supervisorUserId: null,
  supervisorName: null,
  status: 'planned',
};

describe('PilotRunModal — status control (gap 1)', () => {
  it('renders a Status select in edit mode (no raw <select>)', () => {
    const { container } = render(
      <PilotRunModal
        open
        onOpenChange={() => {}}
        labels={LABELS}
        run={RUN}
        supervisors={[]}
        lines={[]}
        onSubmit={async () => ({ ok: true })}
      />,
    );
    expect(container.querySelector('select')).toBeNull();
    const field = screen.getByTestId('pilot-status-field');
    expect(within(field).getByText(LABELS.fieldStatus)).toBeInTheDocument();
    expect(within(field).getByRole('combobox')).toBeInTheDocument();
  });

  it('submits the chosen status (completed) in the payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => ({ ok: true as const }));
    render(
      <PilotRunModal
        open
        onOpenChange={() => {}}
        labels={LABELS}
        run={RUN}
        supervisors={[]}
        lines={[]}
        onSubmit={onSubmit}
      />,
    );

    const field = screen.getByTestId('pilot-status-field');
    await user.click(within(field).getByRole('combobox'));
    // The listbox is portaled to <body>; jsdom flags its options pointer-events:none,
    // so dispatch a plain click to select the option.
    fireEvent.click(screen.getByRole('option', { name: LABELS.statusCompleted }));

    await user.click(screen.getByTestId('pilot-run-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('pre-fills the status from the existing run', () => {
    render(
      <PilotRunModal
        open
        onOpenChange={() => {}}
        labels={LABELS}
        run={{ ...RUN, status: 'in_progress' }}
        supervisors={[]}
        lines={[]}
        onSubmit={async () => ({ ok: true })}
      />,
    );
    const field = screen.getByTestId('pilot-status-field');
    expect(within(field).getByRole('combobox')).toHaveTextContent(LABELS.statusInProgress);
  });
});
