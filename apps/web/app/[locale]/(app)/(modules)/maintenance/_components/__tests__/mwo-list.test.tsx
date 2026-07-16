/**
 * 13-MAINTENANCE — RTL tests for the /maintenance MWO list client island
 * (Wave-8 lane CL1). Covers: list rendering with equipment join, status-tab
 * filtering, honest empty states, the create modal payload, per-status
 * transition buttons + RBAC-gated visibility, and the PM schedule view.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MwoListScreen, type MwoListLabels } from '../mwo-list.client';
import type { EquipmentOption, MwoListRow, MwoState, PmScheduleRow } from '../../_actions/mwo-actions';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  useParams: () => ({ locale: 'en' }),
}));

const LABELS: MwoListLabels = {
  countLine: '2 total · 1 open · 1 in progress',
  searchPlaceholder: 'Search MWO #, equipment, title…',
  rowsLabel: '{count} rows',
  emptyAll: 'No maintenance work orders yet.',
  emptyFiltered: 'No work orders match the current tab or search.',
  viewWorkOrders: 'Work orders',
  viewPmSchedules: 'PM schedules',
  tab: {
    all: 'All',
    requested: 'Requested',
    approved: 'Approved',
    open: 'Open',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  },
  status: {
    requested: 'Requested',
    approved: 'Approved',
    open: 'Open',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  },
  priority: { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' },
  source: {
    manual_request: 'Manual',
    auto_downtime: 'Auto-downtime',
    pm_schedule: 'PM schedule',
    oee_trigger: 'OEE trigger',
    calibration_alert: 'Calibration alert',
  },
  overdue: 'Overdue',
  col: {
    mwo: 'MWO #',
    equipment: 'Equipment',
    title: 'Title',
    priority: 'Priority',
    status: 'Status',
    source: 'Source',
    due: 'Due',
    created: 'Created',
    actions: 'Actions',
  },
  action: { start: 'Start', complete: 'Complete', cancel: 'Cancel' },
  create: {
    button: '+ New MWO',
    title: 'Create maintenance work order',
    equipment: 'Equipment',
    equipmentPlaceholder: 'Select equipment…',
    noEquipment: 'No equipment registered.',
    titleField: 'Title',
    titlePlaceholder: 'Short summary',
    description: 'Problem description',
    descriptionPlaceholder: 'Describe…',
    priority: 'Priority',
    dueDate: 'Due date',
    submit: 'Create MWO',
    submitting: 'Creating…',
    cancel: 'Cancel',
    errorRequired: 'Equipment and title are required.',
    errorFailed: 'Could not create the work order.',
  },
  edit: {
    button: 'Edit',
    title: 'Edit maintenance work order',
    submit: 'Save changes',
    submitting: 'Saving…',
    cancel: 'Cancel',
    errorRequired: 'Equipment and title are required.',
    errorFailed: 'Could not update the work order.',
    errorForbidden: 'No permission to edit.',
    errorLocked: 'Work order is locked.',
  },
  transition: {
    startTitle: 'Start work order',
    completeTitle: 'Complete work order',
    cancelTitle: 'Cancel work order',
    noteComplete: 'Completion notes (optional)',
    noteCancel: 'Cancellation reason',
    confirmStart: 'Start',
    confirmComplete: 'Complete',
    confirmCancel: 'Cancel MWO',
    dismiss: 'Back',
    errorFailed: 'The transition failed.',
    errorIllegal: 'Not allowed from the current state.',
    errorForbidden: 'No permission for this transition.',
  },
  pm: {
    title: 'PM schedules',
    subtitle: 'List and generate-from-due only — schedule create/edit is not available yet.',
    empty: 'No PM schedules yet.',
    col: {
      equipment: 'Equipment',
      type: 'Type',
      interval: 'Interval',
      nextDue: 'Next due',
      lastCompleted: 'Last completed',
      active: 'Active',
    },
    type: {
      preventive: 'Preventive',
      calibration: 'Calibration',
      sanitation: 'Sanitation',
      inspection: 'Inspection',
    },
    intervalUnit: { calendar_days: 'days', usage_hours: 'usage hours', usage_cycles: 'cycles' },
    activeYes: 'Active',
    activeNo: 'Inactive',
    generateMwo: 'Generate MWO',
    generating: 'Generating…',
    generateFailed: 'Could not generate the MWO from this schedule.',
    colActions: 'Actions',
  },
};

const OPEN_ROW: MwoListRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  mwoNumber: 'MWO-2026-00001',
  title: 'Mixer bearing noise',
  state: 'open',
  priority: 'high',
  source: 'manual_request',
  equipmentId: 'eeeeeee1',
  equipmentCode: 'EQ-01',
  equipmentName: 'Mixer 1',
  dueDate: '2026-06-20',
  createdAt: '2026-06-11T08:00:00.000Z',
  startedAt: null,
  completedAt: null,
};

const IN_PROGRESS_ROW: MwoListRow = {
  ...OPEN_ROW,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  mwoNumber: 'MWO-2026-00002',
  title: 'Oven belt slipping',
  state: 'in_progress',
  priority: 'critical',
  equipmentCode: 'EQ-02',
  equipmentName: 'Oven 2',
  startedAt: '2026-06-11T09:00:00.000Z',
};

const STATUS_COUNTS: Record<MwoState, number> = {
  requested: 0,
  approved: 0,
  open: 1,
  in_progress: 1,
  completed: 0,
  cancelled: 0,
};

const EQUIPMENT: EquipmentOption[] = [
  { id: '99999999-9999-4999-8999-999999999999', code: 'EQ-01', name: 'Mixer 1', equipmentType: 'mixer' },
];

const PM_ROWS: PmScheduleRow[] = [
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    scheduleType: 'preventive',
    intervalBasis: 'calendar_days',
    intervalValue: 30,
    nextDueDate: '2026-07-01',
    lastCompletedAt: null,
    active: true,
    equipmentCode: 'EQ-01',
    equipmentName: 'Mixer line equipment',
  },
];

const PERMS = { canCreate: true, canExecute: true, canCancel: true };

function renderScreen(overrides: Partial<Parameters<typeof MwoListScreen>[0]> = {}) {
  const createMwoAction = vi.fn().mockResolvedValue({ ok: true, data: OPEN_ROW });
  const generateMwoFromPmScheduleAction = vi.fn().mockResolvedValue({ ok: true, data: OPEN_ROW });
  const transitionMwoAction = vi.fn().mockResolvedValue({ ok: true, data: { ...OPEN_ROW, state: 'in_progress' } });
  const utils = render(
    <MwoListScreen
      rows={[OPEN_ROW, IN_PROGRESS_ROW]}
      statusCounts={STATUS_COUNTS}
      pmSchedules={PM_ROWS}
      equipment={EQUIPMENT}
      labels={LABELS}
      permissions={PERMS}
      createMwoAction={createMwoAction}
      generateMwoFromPmScheduleAction={generateMwoFromPmScheduleAction}
      transitionMwoAction={transitionMwoAction}
      {...overrides}
    />,
  );
  return { ...utils, createMwoAction, generateMwoFromPmScheduleAction, transitionMwoAction };
}

beforeEach(() => {
  refresh.mockClear();
});

describe('MwoListScreen — list + tabs', () => {
  it('renders MWO rows with the equipment join (code + name)', () => {
    renderScreen();

    expect(screen.getByText('MWO-2026-00001')).toBeInTheDocument();
    expect(screen.getByText('EQ-01')).toBeInTheDocument();
    expect(screen.getByText('Mixer 1')).toBeInTheDocument();
    expect(screen.getByText('Oven belt slipping')).toBeInTheDocument();
  });

  it('filters rows by the status tab and shows the filtered-empty state', () => {
    renderScreen();

    fireEvent.click(screen.getByTestId('mwo-tab-in_progress'));
    expect(screen.queryByText('MWO-2026-00001')).not.toBeInTheDocument();
    expect(screen.getByText('MWO-2026-00002')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mwo-tab-completed'));
    expect(screen.getByTestId('mwo-empty-filtered')).toBeInTheDocument();
  });

  it('renders the honest all-empty state when there are no rows', () => {
    renderScreen({
      rows: [],
      statusCounts: { ...STATUS_COUNTS, open: 0, in_progress: 0 },
    });

    expect(screen.getByTestId('mwo-empty')).toBeInTheDocument();
  });

  it('shows per-status transition buttons: Start on open, Complete on in_progress', () => {
    renderScreen();

    expect(screen.getByTestId(`mwo-start-${OPEN_ROW.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`mwo-complete-${OPEN_ROW.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`mwo-complete-${IN_PROGRESS_ROW.id}`)).toBeInTheDocument();
  });

  it('hides create + transition controls when RBAC flags are off', () => {
    renderScreen({ permissions: { canCreate: false, canExecute: false, canCancel: false } });

    expect(screen.queryByTestId('mwo-create-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId(`mwo-start-${OPEN_ROW.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`mwo-cancel-${OPEN_ROW.id}`)).not.toBeInTheDocument();
  });
});

describe('MwoListScreen — create modal', () => {
  it('submits the typed payload to createMwo and refreshes on success', async () => {
    const { createMwoAction } = renderScreen();

    fireEvent.click(screen.getByTestId('mwo-create-open'));
    expect(screen.getByTestId('mwo-create-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mwo-create-equipment'), {
      target: { value: EQUIPMENT[0].id },
    });
    fireEvent.change(screen.getByTestId('mwo-create-title'), {
      target: { value: 'Belt tension check' },
    });
    fireEvent.change(screen.getByTestId('mwo-create-description'), {
      target: { value: 'Belt slips under load' },
    });
    fireEvent.change(screen.getByTestId('mwo-create-priority'), { target: { value: 'critical' } });
    fireEvent.change(screen.getByTestId('mwo-create-due-date'), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByTestId('mwo-create-submit'));

    await waitFor(() => {
      expect(createMwoAction).toHaveBeenCalledWith({
        equipmentId: EQUIPMENT[0].id,
        title: 'Belt tension check',
        description: 'Belt slips under load',
        priority: 'critical',
        dueDate: '2026-06-30',
      });
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByTestId('mwo-create-modal')).not.toBeInTheDocument();
  });

  it('blocks submit without equipment/title and never calls the action', async () => {
    const { createMwoAction } = renderScreen();

    fireEvent.click(screen.getByTestId('mwo-create-open'));
    fireEvent.click(screen.getByTestId('mwo-create-submit'));

    expect(await screen.findByTestId('mwo-create-error')).toHaveTextContent(
      LABELS.create.errorRequired,
    );
    expect(createMwoAction).not.toHaveBeenCalled();
  });

  it('shows the honest no-equipment notice and disables submit', () => {
    renderScreen({ equipment: [] });

    fireEvent.click(screen.getByTestId('mwo-create-open'));
    expect(screen.getByTestId('mwo-create-no-equipment')).toBeInTheDocument();
    expect(screen.getByTestId('mwo-create-submit')).toBeDisabled();
  });
});

describe('MwoListScreen — transitions', () => {
  it('starts an open MWO via the confirm modal', async () => {
    const { transitionMwoAction } = renderScreen();

    fireEvent.click(screen.getByTestId(`mwo-start-${OPEN_ROW.id}`));
    expect(screen.getByTestId('mwo-transition-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mwo-transition-confirm'));

    await waitFor(() => {
      expect(transitionMwoAction).toHaveBeenCalledWith({
        mwoId: OPEN_ROW.id,
        to: 'in_progress',
        note: undefined,
      });
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('completes an in_progress MWO with a note', async () => {
    const { transitionMwoAction } = renderScreen();

    fireEvent.click(screen.getByTestId(`mwo-complete-${IN_PROGRESS_ROW.id}`));
    fireEvent.change(screen.getByTestId('mwo-transition-note'), {
      target: { value: 'belt replaced' },
    });
    fireEvent.click(screen.getByTestId('mwo-transition-confirm'));

    await waitFor(() => {
      expect(transitionMwoAction).toHaveBeenCalledWith({
        mwoId: IN_PROGRESS_ROW.id,
        to: 'completed',
        note: 'belt replaced',
      });
    });
  });

  it('surfaces the illegal-transition error inside the modal', async () => {
    const { transitionMwoAction } = renderScreen();
    transitionMwoAction.mockResolvedValueOnce({ ok: false, reason: 'invalid_transition' });

    fireEvent.click(screen.getByTestId(`mwo-start-${OPEN_ROW.id}`));
    fireEvent.click(screen.getByTestId('mwo-transition-confirm'));

    expect(await screen.findByTestId('mwo-transition-error')).toHaveTextContent(
      LABELS.transition.errorIllegal,
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('MwoListScreen — PM schedules view', () => {
  it('switches to the PM schedule list and renders equipment-joined rows', () => {
    renderScreen();

    fireEvent.click(screen.getByTestId('mwo-view-pm'));
    expect(screen.getByTestId('pm-schedule-card')).toBeInTheDocument();
    expect(screen.getByTestId('pm-scope-notice')).toHaveTextContent(/not available yet/i);
    expect(screen.getByText('EQ-01')).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
  });

  it('renders the honest PM empty state', () => {
    renderScreen({ pmSchedules: [] });

    fireEvent.click(screen.getByTestId('mwo-view-pm'));
    expect(screen.getByTestId('pm-empty')).toBeInTheDocument();
  });
});
