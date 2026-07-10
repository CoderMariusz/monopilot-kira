/**
 * MWO detail client — RTL smoke (PM source card + operator actions).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MwoDetailClient, type MwoDetailLabels } from '../../mwos/[id]/_components/mwo-detail.client';
import type { MwoDetailRow } from '../../_actions/mwo-actions';

const MWO: MwoDetailRow = {
  id: '44444444-4444-4444-8444-444444444444',
  mwoNumber: 'MWO-2026-00042',
  title: 'PM: EQ-01 — preventive',
  state: 'open',
  priority: 'medium',
  source: 'pm_schedule',
  equipmentId: '33333333-3333-4333-8333-333333333333',
  equipmentCode: 'EQ-01',
  equipmentName: 'Mixer 1',
  dueDate: '2026-07-01',
  createdAt: '2026-06-11T08:00:00Z',
  startedAt: null,
  completedAt: null,
  description: 'Generated from PM schedule',
  scheduleId: '55555555-5555-4555-8555-555555555555',
  pmSource: {
    scheduleId: '55555555-5555-4555-8555-555555555555',
    scheduleType: 'preventive',
    nextDueDate: '2026-07-01',
    intervalBasis: 'calendar_days',
    intervalValue: 30,
    equipmentCode: 'EQ-01',
    equipmentName: 'Mixer 1',
  },
  loto: {
    requiresLoto: false,
    lockoutVerified: false,
    lockoutActive: false,
    releaseVerified: false,
  },
};

const LABELS: MwoDetailLabels = {
  countLine: '',
  searchPlaceholder: '',
  rowsLabel: '',
  emptyAll: '',
  emptyFiltered: '',
  viewWorkOrders: '',
  viewPmSchedules: '',
  tab: { all: 'All', requested: '', approved: '', open: 'Open', in_progress: '', completed: '', cancelled: '' },
  status: { requested: '', approved: '', open: 'Open', in_progress: 'In progress', completed: 'Done', cancelled: '' },
  priority: { low: '', medium: 'Medium', high: '', critical: '' },
  source: { manual_request: '', auto_downtime: '', pm_schedule: 'PM schedule', oee_trigger: '', calibration_alert: '' },
  overdue: '',
  col: { mwo: 'MWO', equipment: 'Equipment', title: 'Title', priority: 'Priority', status: 'Status', source: 'Source', due: 'Due', created: 'Created', actions: 'Actions' },
  action: { start: 'Start', complete: 'Complete', cancel: 'Cancel' },
  create: {
    button: '', title: '', equipment: '', equipmentPlaceholder: '', noEquipment: '', titleField: '', titlePlaceholder: '',
    description: '', descriptionPlaceholder: '', priority: '', dueDate: '', submit: '', submitting: '', cancel: '', errorRequired: '', errorFailed: '',
  },
  transition: {
    startTitle: 'Start', completeTitle: 'Complete', cancelTitle: 'Cancel', noteComplete: '', noteCancel: '',
    confirmStart: 'Start', confirmComplete: 'Complete', confirmCancel: 'Cancel', dismiss: 'Back',
    errorFailed: '', errorIllegal: '', errorForbidden: '',
  },
  pm: {
    title: '', empty: '', col: { equipment: '', type: '', interval: '', nextDue: '', lastCompleted: '', active: '', actions: '' },
    type: { preventive: 'Preventive', calibration: '', sanitation: '', inspection: '' },
    intervalUnit: { calendar_days: 'days', usage_hours: '', usage_cycles: '' },
    activeYes: '', activeNo: '', generateMwo: '', generating: '', generateFailed: '', colActions: '',
  },
  detail: {
    breadcrumbList: 'Work orders',
    backToList: 'Back to work orders',
    overviewTitle: 'Overview',
    pmSourceTitle: 'Source PM schedule',
    pmSourceEmpty: 'No PM source',
    pmScheduleType: 'Type',
    pmNextDue: 'Next due',
    pmInterval: 'Interval',
    description: 'Description',
    denied: '', error: '', notFound: '',
    lotoActiveBanner: 'LOTO active',
    lotoPendingBanner: 'LOTO required',
    lotoApply: 'Apply LOTO',
    lotoClear: 'Clear LOTO',
  },
  loto: {
    lockoutTitle: 'Apply LOTO',
    releaseTitle: 'Clear LOTO',
    signaturePassword: 'PIN',
    submitLockout: 'Verify',
    submitRelease: 'Verify',
    submitting: '…',
    cancel: 'Cancel',
    errorRequired: 'Required',
    errorFailed: 'Failed',
    errorForbidden: 'Forbidden',
    errorEsign: 'E-sign failed',
    errorSameActor: 'Same actor',
    errorInvalidTransition: 'Invalid state',
  },
};

describe('MwoDetailClient', () => {
  it('renders PM source card for schedule-linked MWOs', () => {
    render(
      <MwoDetailClient
        locale="en"
        mwo={MWO}
        labels={LABELS}
        permissions={{ canExecute: true, canCancel: false, canLotoApply: false, canLotoClear: false }}
        transitionMwoAction={vi.fn()}
        verifyLotoLockoutAction={vi.fn()}
        verifyLotoReleaseAction={vi.fn()}
      />,
    );

    expect(screen.getByTestId('mwo-pm-source')).toBeInTheDocument();
    expect(screen.getByText('Source PM schedule')).toBeInTheDocument();
    expect(screen.getByText('Preventive')).toBeInTheDocument();
    expect(screen.getByTestId('mwo-detail-start')).toBeInTheDocument();
  });

  it('opens the transition modal when Start is clicked', () => {
    render(
      <MwoDetailClient
        locale="en"
        mwo={MWO}
        labels={LABELS}
        permissions={{ canExecute: true, canCancel: false, canLotoApply: false, canLotoClear: false }}
        transitionMwoAction={vi.fn()}
        verifyLotoLockoutAction={vi.fn()}
        verifyLotoReleaseAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('mwo-detail-start'));
    expect(screen.getByTestId('mwo-transition-modal')).toBeInTheDocument();
  });
});
