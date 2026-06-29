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
  newField: 'New field',
  newDepartment: 'New department',
  editAction: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  create: 'Create',
  fieldCode: 'Field code',
  fieldLabel: 'Field label',
  fieldDepartment: 'Department',
  fieldDataType: 'Data type',
  fieldRequired: 'Required by default',
  fieldHelpText: 'Help text',
  departmentCode: 'Department code',
  departmentName: 'Department name',
  departmentDescription: 'Description',
  newFieldTitle: 'Create NPD field',
  newDepartmentTitle: 'Create NPD department',
  editFieldTitle: 'Edit NPD field',
  editDepartmentTitle: 'Edit NPD department',
  dataTypeText: 'Text',
  dataTypeNumber: 'Number',
  dataTypeDate: 'Date',
  deleteDepartmentUnavailable: 'The core department cannot be deleted.',
  deleteDepartment: 'Delete',
  deleteField: 'Delete from catalog',
  deleteDepartmentConfirm: 'Delete this department permanently? This cannot be undone.',
  deleteFieldConfirm: 'Delete this field from the catalog permanently? This cannot be undone.',
  departmentInUse: 'This department is still in use and cannot be deleted.',
  fieldInUse: 'This field is still assigned. Remove its assignments first, then delete.',
  fieldAuto: 'Auto-derived',
  fieldAutoHint: 'Compute this field automatically from another catalog field.',
  fieldAutoSource: 'Source field',
  fieldAutoSourcePlaceholder: 'Choose the field to derive from',
  autoBadge: 'Auto',
  autoFrom: 'from {source}',
  autoSourceErrors: {
    auto_source_self: 'An auto field cannot derive from itself. Choose a different source field.',
    auto_source_not_found: 'The selected source field was not found. Choose an active catalog field.',
    auto_source_cycle: 'That source field already derives from this field, which would create a loop.',
    auto_source_required: 'Choose a source field when Auto-derived is on.',
  },
  deactivateErrors: {
    cannot_deactivate_core: 'Core department cannot be deactivated.',
    cannot_deactivate_last: 'At least one department must stay active.',
  },
  catalogTitle: 'Field catalog',
  catalogSubtitle: 'Every field defined for this organisation. Delete a field once it is removed from all departments.',
  catalogEmpty: 'No catalog fields are defined.',
  catalogAssignmentCount: '{count} assignments',
  fieldRemoveFromAllFirst: 'Remove this field from all departments first.',
  catalogColumns: {
    field: 'Field',
    dataType: 'Data type',
    assignments: 'Assignments',
    actions: 'Actions',
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
  {
    id: '33333333-3333-3333-3333-333333333333',
    code: 'core',
    name: 'Core',
    display_order: 0,
    active: true,
    fields: [],
  },
];

const fieldCatalog: NpdFieldCatalogRow[] = [
  { id: 'field-1', code: 'target_ph', label: 'Target pH', data_type: 'number', active: true, is_auto: false, auto_source_field: null, assignment_count: 1 },
  {
    id: 'field-2',
    code: 'shelf_life_days',
    label: 'Shelf life days',
    data_type: 'integer',
    active: true,
    is_auto: true,
    auto_source_field: 'target_ph',
    assignment_count: 1,
  },
  { id: 'field-3', code: 'label_claim', label: 'Label claim', data_type: 'text', active: true, is_auto: false, auto_source_field: null, assignment_count: 1 },
  { id: 'field-4', code: 'trial_notes', label: 'Trial notes', data_type: 'text', active: true, is_auto: false, auto_source_field: null, assignment_count: 0 },
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
    // Technical is active, Packaging is inactive in the fixture (Core is also
    // active, so scope the badge assertions to the specific department rows).
    const technicalRow = screen.getByTestId(
      'npd-department-row-11111111-1111-1111-1111-111111111111',
    );
    const packagingRow = screen.getByTestId(
      'npd-department-row-22222222-2222-2222-2222-222222222222',
    );
    expect(within(technicalRow).getByText('● Active')).toHaveClass('badge', 'badge-green');
    expect(within(packagingRow).getByText('✕ Inactive')).toHaveClass('badge', 'badge-gray');
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

  it('shows the core-department message and rolls the toggle back when deactivation is refused via the error union', async () => {
    // Union mechanism: the action RESOLVES with { ok:false, error } (no throw),
    // mirroring the updateField convention used elsewhere in this screen.
    const setDepartmentActiveAction = vi.fn(async () => ({
      ok: false as const,
      error: 'cannot_deactivate_core',
    }));
    renderScreen({ setDepartmentActiveAction });

    const toggle = screen.getByLabelText('Technical Active');
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setDepartmentActiveAction).toHaveBeenCalledWith(departments[0].id, false);
    });

    // The specific localized message is shown (NOT the generic error string).
    await waitFor(() => {
      expect(screen.getByTestId('npd-fields-error')).toHaveTextContent(
        'Core department cannot be deactivated.',
      );
    });
    expect(screen.queryByText('Unable to save NPD field settings.')).not.toBeInTheDocument();

    // The optimistic toggle reverts to ON since the deactivation was refused.
    await waitFor(() => {
      expect(screen.getByLabelText('Technical Active')).toBeChecked();
    });
    const technicalRow = screen.getByTestId(
      'npd-department-row-11111111-1111-1111-1111-111111111111',
    );
    expect(within(technicalRow).getByText('● Active')).toBeInTheDocument();
  });

  it('maps the last-department message and rolls back when the action throws the code', async () => {
    // Thrown mechanism: a rejected promise (e.g. a DB constraint/trigger) whose
    // message contains the code. handleDepartmentActive tolerates both shapes.
    const setDepartmentActiveAction = vi.fn(async () => {
      throw new Error('npd_departments_active_check: cannot_deactivate_last');
    });
    renderScreen({ setDepartmentActiveAction });

    const toggle = screen.getByLabelText('Technical Active');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByTestId('npd-fields-error')).toHaveTextContent(
        'At least one department must stay active.',
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Technical Active')).toBeChecked();
    });
  });

  it('renders inactive departments with a dimmed row and an Inactive tag', () => {
    renderScreen();

    // Packaging is inactive in the fixture.
    const inactiveRow = screen.getByTestId(
      'npd-department-row-22222222-2222-2222-2222-222222222222',
    );
    expect(inactiveRow).toHaveAttribute('data-inactive', 'true');
    expect(inactiveRow).toHaveStyle({ opacity: '0.55' });
    expect(
      within(inactiveRow).getByTestId(
        'npd-department-inactive-tag-22222222-2222-2222-2222-222222222222',
      ),
    ).toHaveTextContent('Inactive');

    // The active Technical row is NOT dimmed and has no inactive tag.
    const activeRow = screen.getByTestId(
      'npd-department-row-11111111-1111-1111-1111-111111111111',
    );
    expect(activeRow).not.toHaveAttribute('data-inactive');
    expect(
      within(activeRow).queryByTestId(
        'npd-department-inactive-tag-11111111-1111-1111-1111-111111111111',
      ),
    ).not.toBeInTheDocument();
  });

  it('disables edit controls when canEdit is false', () => {
    renderScreen({ canEdit: false });

    expect(screen.getByTestId('npd-fields-read-only')).toHaveTextContent('npd.schema.edit');
    expect(screen.getByLabelText('Technical Active')).toBeDisabled();
    expect(screen.getByLabelText('Target pH Required')).toBeDisabled();
    expect(screen.getByLabelText('Target pH Visible')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Assign field' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Remove' })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New field' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New department' })).toBeDisabled();
  });

  it('creates a new field via the createField action', async () => {
    const createFieldAction = vi.fn(async () => ({
      id: 'field-new',
      org_id: 'org',
      code: 'brix',
      label: 'Brix',
      data_type: 'text' as const,
      validation_json: {},
      help_text: null,
      active: true,
    }));
    renderScreen({ createFieldAction });

    fireEvent.click(screen.getByRole('button', { name: 'New field' }));
    const dialog = screen.getByRole('dialog', { name: 'Create NPD field' });
    fireEvent.change(within(dialog).getByLabelText('Field code'), { target: { value: 'brix' } });
    fireEvent.change(within(dialog).getByLabelText('Field label'), { target: { value: 'Brix' } });
    fireEvent.submit(within(dialog).getByTestId('npd-new-field-form'));

    await waitFor(() => {
      // data_type defaults to the first picker option ('text'); the picker is the
      // shadcn Select and is exercised in E2E rather than jsdom.
      expect(createFieldAction).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'brix', label: 'Brix', data_type: 'text' }),
      );
    });
  });

  it('creates a new department via the createDepartment action', async () => {
    const createDepartmentAction = vi.fn(async () => ({
      id: 'dept-new',
      org_id: 'org',
      code: 'quality',
      name: 'Quality',
      display_order: 30,
      active: true,
      created_at: '2026-06-27T00:00:00.000Z',
    }));
    renderScreen({ createDepartmentAction });

    fireEvent.click(screen.getByRole('button', { name: 'New department' }));
    const dialog = screen.getByRole('dialog', { name: 'Create NPD department' });
    fireEvent.change(within(dialog).getByLabelText('Department code'), { target: { value: 'quality' } });
    fireEvent.change(within(dialog).getByLabelText('Department name'), { target: { value: 'Quality' } });
    fireEvent.submit(within(dialog).getByTestId('npd-new-department-form'));

    await waitFor(() => {
      expect(createDepartmentAction).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'quality', name: 'Quality' }),
      );
    });
  });

  it('edits a department via the updateDepartment action', async () => {
    const updateDepartmentAction = vi.fn(async () => ({
      id: departments[0].id,
      org_id: 'org',
      code: 'technical',
      name: 'Technical (renamed)',
      display_order: 10,
      active: true,
      created_at: '2026-06-27T00:00:00.000Z',
    }));
    renderScreen({ updateDepartmentAction });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Technical' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Edit NPD department' });
    fireEvent.change(within(dialog).getByLabelText('Department name'), {
      target: { value: 'Technical (renamed)' },
    });
    fireEvent.submit(within(dialog).getByTestId('npd-edit-department-form'));

    await waitFor(() => {
      expect(updateDepartmentAction).toHaveBeenCalledWith(
        departments[0].id,
        expect.objectContaining({ name: 'Technical (renamed)' }),
      );
    });
  });

  it('edits a field via the updateField action', async () => {
    const updateFieldAction = vi.fn(async () => ({
      id: 'field-1',
      org_id: 'org',
      code: 'target_ph',
      label: 'Target pH (v2)',
      data_type: 'number' as const,
      validation_json: {},
      help_text: null,
      active: true,
    }));
    renderScreen({ updateFieldAction });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Target pH' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit NPD field' });
    fireEvent.change(within(dialog).getByLabelText('Field label'), {
      target: { value: 'Target pH (v2)' },
    });
    fireEvent.submit(within(dialog).getByTestId('npd-edit-field-form'));

    await waitFor(() => {
      expect(updateFieldAction).toHaveBeenCalledWith(
        'field-1',
        expect.objectContaining({ label: 'Target pH (v2)' }),
      );
    });
  });

  it('shows the Auto toggle and reveals the Source field dropdown only when Auto is on', () => {
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Target pH' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit NPD field' });

    // The Auto-derived toggle is always present in the edit dialog.
    const autoToggle = within(dialog).getByLabelText('Auto-derived');
    expect(autoToggle).toBeInTheDocument();
    expect(autoToggle).not.toBeChecked();

    // The Source field dropdown is hidden while Auto is off.
    expect(within(dialog).queryByLabelText('Source field')).not.toBeInTheDocument();

    // Turning Auto on reveals the Source field dropdown.
    fireEvent.click(autoToggle);
    expect(within(dialog).getByLabelText('Source field')).toBeInTheDocument();
  });

  it('excludes the edited field from the Source field options (no self-reference)', () => {
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Target pH' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit NPD field' });
    fireEvent.click(within(dialog).getByLabelText('Auto-derived'));

    // Open the source dropdown and assert the field's own code is not an option.
    fireEvent.click(within(dialog).getByLabelText('Source field'));
    const options = screen.getAllByRole('option').map((node) => node.getAttribute('data-value'));
    expect(options).not.toContain('target_ph');
    expect(options).toContain('shelf_life_days');
  });

  it('sends is_auto + auto_source_field in the updateField patch', async () => {
    const updateFieldAction = vi.fn(async () => ({
      id: 'field-1',
      org_id: 'org',
      code: 'target_ph',
      label: 'Target pH',
      data_type: 'number' as const,
      validation_json: {},
      help_text: null,
      active: true,
      is_auto: true,
      auto_source_field: 'shelf_life_days',
    }));
    renderScreen({ updateFieldAction });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Target pH' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit NPD field' });

    fireEvent.click(within(dialog).getByLabelText('Auto-derived'));
    // Open the source picker and choose another field.
    fireEvent.click(within(dialog).getByLabelText('Source field'));
    fireEvent.click(screen.getByRole('option', { name: /Shelf life days/ }));

    fireEvent.submit(within(dialog).getByTestId('npd-edit-field-form'));

    await waitFor(() => {
      expect(updateFieldAction).toHaveBeenCalledWith(
        'field-1',
        expect.objectContaining({ is_auto: true, auto_source_field: 'shelf_life_days' }),
      );
    });
  });

  it('renders the inline error message when updateField returns an error union', async () => {
    const updateFieldAction = vi.fn(async () => ({
      ok: false as const,
      error: 'auto_source_required',
    }));
    renderScreen({ updateFieldAction });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Target pH' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit NPD field' });

    // Turn Auto on but leave the source empty, then save → backend rejects with
    // the union. The dialog must STAY open and show the mapped message.
    fireEvent.click(within(dialog).getByLabelText('Auto-derived'));
    fireEvent.submit(within(dialog).getByTestId('npd-edit-field-form'));

    await waitFor(() => {
      expect(updateFieldAction).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit NPD field' })).toBeInTheDocument();
      expect(
        screen.getByText('Choose a source field when Auto-derived is on.'),
      ).toBeInTheDocument();
    });
  });

  it('shows the Auto badge and "from {source}" hint on an auto-derived field row', () => {
    renderScreen();

    const table = screen.getByTestId('npd-fields-table');
    // field-2 (shelf_life_days) is auto-derived from target_ph in the fixture.
    expect(within(table).getByTestId('npd-field-auto-badge-field-2')).toHaveTextContent('Auto');
    expect(within(table).getByTestId('npd-field-auto-from-field-2')).toHaveTextContent(
      'from target_ph',
    );
    // field-1 (target_ph) is NOT auto — no badge.
    expect(within(table).queryByTestId('npd-field-auto-badge-field-1')).not.toBeInTheDocument();
  });

  it('renders a Delete button for a non-core department and hides it for the core department', () => {
    renderScreen();

    const deptTable = screen.getByTestId('npd-departments-table');
    // Technical / Packaging are non-core → a Delete affordance is present.
    expect(within(deptTable).getByRole('button', { name: 'Delete Technical' })).toBeInTheDocument();
    expect(within(deptTable).getByRole('button', { name: 'Delete Packaging' })).toBeInTheDocument();
    // The immutable Core department exposes NO delete affordance.
    expect(
      within(deptTable).queryByRole('button', { name: 'Delete Core' }),
    ).not.toBeInTheDocument();
  });

  it('confirms then calls deleteDepartmentAction and removes the row on success', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteDepartmentAction = vi.fn(async (id: string) => ({ ok: true as const, id }));
    renderScreen({ deleteDepartmentAction });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Packaging' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete this department permanently? This cannot be undone.',
    );
    await waitFor(() => {
      expect(deleteDepartmentAction).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
    });
    // The deleted department row disappears from the table.
    const deptTable = screen.getByTestId('npd-departments-table');
    await waitFor(() => {
      expect(within(deptTable).queryByText('Packaging')).not.toBeInTheDocument();
    });
    confirmSpy.mockRestore();
  });

  it('does NOT call deleteDepartmentAction when the confirm dialog is cancelled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleteDepartmentAction = vi.fn(async (id: string) => ({ ok: true as const, id }));
    renderScreen({ deleteDepartmentAction });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Technical' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteDepartmentAction).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('surfaces the in-use message when deleteDepartmentAction refuses with department_in_use', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteDepartmentAction = vi.fn(async () => ({
      ok: false as const,
      error: 'department_in_use' as const,
    }));
    renderScreen({ deleteDepartmentAction });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Technical' }));

    await waitFor(() => {
      expect(deleteDepartmentAction).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    });
    await waitFor(() => {
      expect(screen.getByTestId('npd-fields-error')).toHaveTextContent(
        'This department is still in use and cannot be deleted.',
      );
    });
    // The row stays put since the delete was refused.
    const deptTable = screen.getByTestId('npd-departments-table');
    expect(within(deptTable).getByText('Technical')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('maps cannot_delete_core to the core-delete message via the deleteDepartmentUnavailable slot', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteDepartmentAction = vi.fn(async () => ({
      ok: false as const,
      error: 'cannot_delete_core' as const,
    }));
    renderScreen({ deleteDepartmentAction });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Technical' }));

    await waitFor(() => {
      expect(screen.getByTestId('npd-fields-error')).toHaveTextContent(
        'The core department cannot be deleted.',
      );
    });
    confirmSpy.mockRestore();
  });

  // ── Field catalog section (S1b: reachable hard-delete) ──────────────────────

  it('does NOT render a per-assigned-row Delete-from-catalog button (only Remove)', () => {
    renderScreen();

    // The assigned-fields table row for Target pH keeps Edit + Remove but no
    // catalog-delete affordance — that lives in the dedicated catalog section.
    const fieldsTable = screen.getByTestId('npd-fields-table');
    expect(within(fieldsTable).getByRole('button', { name: 'Edit Target pH' })).toBeInTheDocument();
    expect(within(fieldsTable).getAllByRole('button', { name: 'Remove' }).length).toBeGreaterThan(0);
    expect(
      within(fieldsTable).queryByRole('button', { name: 'Delete from catalog Target pH' }),
    ).not.toBeInTheDocument();
  });

  it('renders the field-catalog section listing every catalog field with its assignment count', () => {
    renderScreen();

    const catalogTable = screen.getByTestId('npd-field-catalog-table');
    // All four catalog fields appear, including the unassigned trial_notes.
    expect(within(catalogTable).getByText('Target pH')).toBeInTheDocument();
    expect(within(catalogTable).getByText('Trial notes')).toBeInTheDocument();
    // Assignment counts are surfaced per row.
    const trialRow = within(catalogTable).getByTestId('npd-catalog-row-field-4');
    expect(trialRow).toHaveTextContent('0 assignments');
    const targetRow = within(catalogTable).getByTestId('npd-catalog-row-field-1');
    expect(targetRow).toHaveTextContent('1 assignments');
  });

  it('enables Delete for a catalog field with 0 assignments and calls deleteFieldAction', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteFieldAction = vi.fn(async (id: string) => ({ ok: true as const, id }));
    renderScreen({ deleteFieldAction });

    // trial_notes (field-4) has 0 assignments → its catalog Delete is enabled.
    const deleteButton = screen.getByRole('button', { name: 'Delete from catalog Trial notes' });
    expect(deleteButton).toBeEnabled();

    fireEvent.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete this field from the catalog permanently? This cannot be undone.',
    );
    await waitFor(() => {
      expect(deleteFieldAction).toHaveBeenCalledWith('field-4');
    });
    // The deleted field disappears from the catalog table.
    const catalogTable = screen.getByTestId('npd-field-catalog-table');
    await waitFor(() => {
      expect(within(catalogTable).queryByText('Trial notes')).not.toBeInTheDocument();
    });
    confirmSpy.mockRestore();
  });

  it('disables Delete for a catalog field with >0 assignments and never calls deleteFieldAction', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteFieldAction = vi.fn(async (id: string) => ({ ok: true as const, id }));
    renderScreen({ deleteFieldAction });

    // Target pH (field-1) has 1 assignment → its catalog Delete is disabled.
    const deleteButton = screen.getByRole('button', { name: 'Delete from catalog Target pH' });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute('title', 'Remove this field from all departments first.');

    fireEvent.click(deleteButton);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(deleteFieldAction).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('surfaces the in-use message when deleteFieldAction refuses with field_in_use', async () => {
    // Defensive path: even from the catalog section (count===0 guard), if the
    // backend still reports the field as assigned, the existing message shows.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteFieldAction = vi.fn(async () => ({
      ok: false as const,
      error: 'field_in_use' as const,
    }));
    renderScreen({ deleteFieldAction });

    fireEvent.click(screen.getByRole('button', { name: 'Delete from catalog Trial notes' }));

    await waitFor(() => {
      expect(deleteFieldAction).toHaveBeenCalledWith('field-4');
    });
    await waitFor(() => {
      expect(
        screen.getByText('This field is still assigned. Remove its assignments first, then delete.'),
      ).toBeInTheDocument();
    });
    // The field row remains since the delete was refused.
    const catalogTable = screen.getByTestId('npd-field-catalog-table');
    expect(within(catalogTable).getByText('Trial notes')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
