/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AssetRegisterClient } from '../asset-register.client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('../_actions/asset-actions', () => ({
  createEquipment: vi.fn(async () => ({ ok: true })),
  updateEquipment: vi.fn(async () => ({ ok: true })),
  deactivateEquipment: vi.fn(async () => ({ ok: true })),
  reactivateEquipment: vi.fn(async () => ({ ok: true })),
}));

const labels = {
  searchPlaceholder: 'Search by code or name…',
  countLine: '{total} assets · {loto} require LOTO',
  addAsset: '+ Add asset',
  exportCsv: 'Export CSV',
  editAsset: 'Edit',
  emptyTitle: 'No assets registered yet',
  emptyBody: 'Add the first machine.',
  col: {
    code: 'Code',
    name: 'Name',
    type: 'Type',
    loto: 'LOTO',
    calibration: 'Calibration',
    status: 'Status',
    actions: 'Actions',
  },
  lotoYes: 'Required',
  lotoNo: '—',
  calYes: 'Required',
  calNo: '—',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  types: { mixer: 'Mixer' },
  form: {
    createTitle: 'Add maintenance asset',
    editTitle: 'Edit maintenance asset',
    code: 'Asset code',
    codePlaceholder: 'e.g. MIX-01',
    name: 'Name',
    namePlaceholder: 'e.g. Main mixer',
    type: 'Equipment type',
    requiresLoto: 'Requires LOTO before maintenance',
    requiresCalibration: 'Requires calibration',
    submit: 'Save asset',
    submitting: 'Saving…',
    cancel: 'Cancel',
    withdraw: 'Withdraw from service',
    withdrawing: 'Withdrawing…',
    withdrawReason: 'Withdrawal reason',
    withdrawReasonPlaceholder: 'Why is this asset being withdrawn?',
    reactivate: 'Return to service',
    reactivating: 'Reactivating…',
    errorRequired: 'Code and name are required.',
    errorWithdrawReason: 'A withdrawal reason is required.',
    errorFailed: 'Could not save the asset.',
    errorForbidden: 'Forbidden',
    errorConflict: 'Duplicate code',
    types: { mixer: 'Mixer' },
  },
};

const row = {
  id: '1',
  equipmentCode: 'MIX-01',
  name: 'Main mixer',
  equipmentType: 'mixer',
  requiresLoto: true,
  requiresCalibration: false,
  active: true,
  deactivatedAt: null,
  deactivationReason: null,
};

describe('AssetRegisterClient', () => {
  it('renders equipment rows and opens create modal', () => {
    render(<AssetRegisterClient canEdit canDeactivate labels={labels} rows={[row]} />);

    expect(screen.getByTestId('asset-register-table')).toBeInTheDocument();
    expect(screen.getByTestId('asset-row-MIX-01')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('asset-register-add'));
    expect(screen.getByTestId('asset-create-modal')).toBeInTheDocument();
  });

  it('opens the edit modal from the row action', () => {
    render(<AssetRegisterClient canEdit canDeactivate labels={labels} rows={[row]} />);

    fireEvent.click(screen.getByTestId('asset-edit-MIX-01'));
    expect(screen.getByTestId('asset-edit-modal')).toBeInTheDocument();
    expect(screen.getByTestId('asset-edit-code')).not.toHaveAttribute('readonly');
  });
});
