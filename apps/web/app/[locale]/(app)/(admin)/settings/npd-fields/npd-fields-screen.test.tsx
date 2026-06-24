/**
 * @vitest-environment jsdom
 * NPD fields settings screen RTL test.
 *
 * Net-new admin screen: mirrors the settings/products PageHead + Section pattern,
 * renders server-loader-shaped NPD department/field config, and wires mutations to
 * the reviewed server-action surface via injectable action props. No mocks of the
 * backend implementation are needed here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NpdFieldsScreen, {
  type NpdDepartmentConfigRow,
  type NpdFieldCatalogRow,
  type NpdFieldsScreenLabels,
} from './npd-fields-screen.client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const labels: NpdFieldsScreenLabels = {
  title: 'NPD fields',
  subtitle: 'Manage department-specific fields for the NPD workflow.',
  departmentsTitle: 'Departments',
  departmentsSubtitle: 'Choose the NPD department whose schema should be configured.',
  selectedDepartment: 'Department',
  assignedFieldsTitle: '{department} fields',
  assignedFieldsSubtitle: 'Visible fields assigned to this department.',
  assignField: 'Catalog field',
  assignFieldPlaceholder: 'Choose a field to assign',
  assign: 'Assign field',
  emptyDepartments: 'No NPD departments are configured.',
  emptyFields: 'No fields are assigned to this department.',
  readOnlyNotice: 'You need npd.schema.edit to change NPD field settings.',
  active: 'Active',
  inactive: 'Inactive',
  remove: 'Remove',
  saving: 'Saving…',
  error: 'Unable to save NPD field settings.',
  columns: {
    field: 'Field',
    dataType: 'Data type',
    required: 'Required',
    visible: 'Visible',
    stage: 'Stage',
    order: 'Order',
    actions: 'Actions',
  },
  stages: {
    brief: 'Brief',
    recipe: 'Recipe',
    packaging: 'Packaging',
    trial: 'Trial',
    sensory: 'Sensory',
    pilot: 'Pilot',
    approval: 'Approval',
    handoff: 'Handoff',
  },
};

const departments: NpdDepartmentConfigRow[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    code: 'technical',
    name: 'Technical',
    display_order: 10,
    active: true,
    fields: [
      {
        assignment_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        field_id: 'field-1',
        code: 'target_ph',
        label: 'Target pH',
        data_type: 'number',
        required: true,
        visible: true,
        stage_code: 'recipe',
        display_order: 20,
      },
      {
        assignment_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        field_id: 'field-2',
        code: 'shelf_life_days',
        label: 'Shelf life days',
        data_type: 'integer',
        required: false,
        visible: true,
        stage_code: 'approval',
        display_order: 30,
      },
    ],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    code: 'packaging',
    name: 'Packaging',
    display_order: 20,
    active: false,
    fields: [
      {
        assignment_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        field_id: 'field-3',
        code: 'label_claim',
        label: 'Label claim',
        data_type: 'text',
        required: false,
        visible: true,
        stage_code: 'packaging',
        display_order: 10,
      },
    ],
  },
];

const fieldCatalog: NpdFieldCatalogRow[] = [
  { id: 'field-1', code: 'target_ph', label: 'Target pH', data_type: 'number', active: true },
  { id: 'field-2', code: 'shelf_life_days', label: 'Shelf life days', data_type: 'integer', active: true },
  { id: 'field-3', code: 'label_claim', label: 'Label claim', data_type: 'text', active: true },
  { id: 'field-4', code: 'trial_notes', label: 'Trial notes', data_type: 'text', active: true },
];

function renderScreen(overrides: Partial<React.ComponentProps<typeof NpdFieldsScreen>> = {}) {
  return render(
    <NpdFieldsScreen
      departments={departments}
      fieldCatalog={fieldCatalog}
      canEdit
      labels={labels}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NpdFieldsScreen', () => {
  it('renders departments and their active state', () => {
    renderScreen();

    expect(document.querySelector('.sg-title')).toHaveTextContent('NPD fields');
    const table = screen.getByTestId('npd-departments-table');
    expect(within(table).getByText('Technical')).toBeInTheDocument();
    expect(within(table).getByText('Packaging')).toBeInTheDocument();
    expect(within(table).getByText('● Active')).toHaveClass('badge', 'badge-green');
    expect(within(table).getByText('✕ Inactive')).toHaveClass('badge', 'badge-gray');
  });

  it('renders the selected department fields', () => {
    renderScreen();

    const table = screen.getByTestId('npd-fields-table');
    expect(within(table).getByText('Target pH')).toBeInTheDocument();
    expect(within(table).getByText('Shelf life days')).toBeInTheDocument();
    expect(within(table).getByText('number')).toHaveClass('badge', 'badge-blue');
    expect(within(table).getByLabelText('Target pH Required')).toBeChecked();
    expect(within(table).getByLabelText('Shelf life days Required')).not.toBeChecked();
  });

  it('calls the server action when an assignment toggle changes', async () => {
    const updateAssignmentAction = vi.fn(async () => ({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      org_id: 'org',
      department_id: departments[0].id,
      field_id: 'field-1',
      required: false,
      visible: true,
      stage_code: 'recipe',
      display_order: 20,
    }));
    renderScreen({ updateAssignmentAction });

    fireEvent.click(screen.getByLabelText('Target pH Required'));

    await waitFor(() => {
      expect(updateAssignmentAction).toHaveBeenCalledWith('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
        required: false,
      });
    });
  });

  it('calls the server action when the department active toggle changes', async () => {
    const setDepartmentActiveAction = vi.fn(async () => ({
      id: departments[0].id,
      org_id: 'org',
      code: 'technical',
      name: 'Technical',
      display_order: 10,
      active: false,
      created_at: '2026-06-24T00:00:00.000Z',
    }));
    renderScreen({ setDepartmentActiveAction });

    fireEvent.click(screen.getByLabelText('Technical Active'));

    await waitFor(() => {
      expect(setDepartmentActiveAction).toHaveBeenCalledWith(departments[0].id, false);
    });
  });

  it('disables edit controls when canEdit is false', () => {
    renderScreen({ canEdit: false });

    expect(screen.getByTestId('npd-fields-read-only')).toHaveTextContent('npd.schema.edit');
    expect(screen.getByLabelText('Technical Active')).toBeDisabled();
    expect(screen.getByLabelText('Target pH Required')).toBeDisabled();
    expect(screen.getByLabelText('Target pH Visible')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Assign field' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Remove' })[0]).toBeDisabled();
  });
});
