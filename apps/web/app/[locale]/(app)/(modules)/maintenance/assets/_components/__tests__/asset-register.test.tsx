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
}));

const labels = {
  searchPlaceholder: 'Search by code or name…',
  countLine: '{total} assets · {loto} require LOTO',
  addAsset: '+ Add asset',
  exportCsv: 'Export CSV',
  emptyTitle: 'No assets registered yet',
  emptyBody: 'Add the first machine.',
  col: {
    code: 'Code',
    name: 'Name',
    type: 'Type',
    loto: 'LOTO',
    calibration: 'Calibration',
    status: 'Status',
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
    errorRequired: 'Code and name are required.',
    errorFailed: 'Could not save the asset.',
    errorForbidden: 'Forbidden',
    errorConflict: 'Duplicate code',
    types: { mixer: 'Mixer' },
  },
};

describe('AssetRegisterClient', () => {
  it('renders equipment rows and opens create modal', () => {
    render(
      <AssetRegisterClient
        canEdit
        labels={labels}
        rows={[
          {
            id: '1',
            equipmentCode: 'MIX-01',
            name: 'Main mixer',
            equipmentType: 'mixer',
            requiresLoto: true,
            requiresCalibration: false,
            active: true,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('asset-register-table')).toBeInTheDocument();
    expect(screen.getByTestId('asset-row-MIX-01')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('asset-register-add'));
    expect(screen.getByTestId('asset-create-modal')).toBeInTheDocument();
  });
});
