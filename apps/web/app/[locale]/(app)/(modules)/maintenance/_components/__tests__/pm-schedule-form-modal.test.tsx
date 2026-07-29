/**
 * PM schedule form modal — create-mode submit must not dereference schedule.id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { EquipmentOption } from '../../_actions/mwo-actions';
import { PmScheduleFormModal, type PmScheduleFormLabels } from '../pm-schedule-form-modal';

const EQUIPMENT: EquipmentOption[] = [
  { id: '99999999-9999-4999-8999-999999999999', code: 'EQ-01', name: 'Mixer 1', equipmentType: 'mixer' },
];

const LABELS: PmScheduleFormLabels = {
  createTitle: 'Create PM schedule',
  editTitle: 'Edit PM schedule',
  equipment: 'Equipment',
  equipmentPlaceholder: 'Select equipment…',
  scheduleType: 'Schedule type',
  intervalValue: 'Repeat every',
  intervalUnit: 'calendar days',
  warningDays: 'Warning window',
  firstDueDate: 'First due date',
  nextDueDate: 'Next due date',
  active: 'Schedule active',
  submit: 'Save schedule',
  submitting: 'Saving…',
  cancel: 'Cancel',
  errorRequired: 'Equipment and interval are required.',
  errorFailed: 'Could not save the PM schedule.',
  errorForbidden: 'Forbidden',
  type: {
    preventive: 'Preventive',
    calibration: 'Calibration',
    sanitation: 'Sanitation',
    inspection: 'Inspection',
  },
};

describe('PmScheduleFormModal — create mode', () => {
  const createPmScheduleAction = vi.fn().mockResolvedValue({ ok: true });
  const updatePmScheduleAction = vi.fn().mockResolvedValue({ ok: true });
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits without schedule prop and calls createPmScheduleAction', async () => {
    render(
      <PmScheduleFormModal
        mode="create"
        equipment={EQUIPMENT}
        labels={LABELS}
        createPmScheduleAction={createPmScheduleAction}
        updatePmScheduleAction={updatePmScheduleAction}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByTestId('pm-schedule-submit'));

    await waitFor(() => {
      expect(createPmScheduleAction).toHaveBeenCalledTimes(1);
    });

    expect(createPmScheduleAction).toHaveBeenCalledWith({
      equipmentId: EQUIPMENT[0].id,
      scheduleType: 'preventive',
      intervalValue: 30,
      warningDays: 7,
      firstDueDate: undefined,
    });
    expect(updatePmScheduleAction).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('pm-schedule-error')).not.toBeInTheDocument();
  });
});
