'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { PageHead, Section, SelectField, Toggle } from '../_components';
import {
  assignFieldToDepartment,
  removeAssignment,
  setDepartmentActive,
  updateAssignment,
} from './_actions/npd-field-config';

const STAGE_CODES = ['brief', 'recipe', 'packaging', 'trial', 'sensory', 'pilot', 'approval', 'handoff'] as const;

type StageCode = (typeof STAGE_CODES)[number];

export type NpdFieldCatalogRow = {
  id: string;
  code: string;
  label: string;
  data_type: string;
  active: boolean;
};

export type NpdDepartmentFieldRow = {
  assignment_id: string;
  field_id: string;
  code: string;
  label: string;
  data_type: string;
  required: boolean;
  visible: boolean;
  stage_code: string;
  display_order: number;
};

export type NpdDepartmentConfigRow = {
  id: string;
  code: string;
  name: string;
  display_order: number;
  active: boolean;
  fields: NpdDepartmentFieldRow[];
};

export type NpdFieldsScreenLabels = {
  title: string;
  subtitle: string;
  departmentsTitle: string;
  departmentsSubtitle: string;
  selectedDepartment: string;
  assignedFieldsTitle: string;
  assignedFieldsSubtitle: string;
  assignField: string;
  assignFieldPlaceholder: string;
  assign: string;
  emptyDepartments: string;
  emptyFields: string;
  readOnlyNotice: string;
  active: string;
  inactive: string;
  remove: string;
  saving: string;
  error: string;
  columns: {
    field: string;
    dataType: string;
    required: string;
    visible: string;
    stage: string;
    order: string;
    actions: string;
  };
  stages: Record<StageCode, string>;
};

type UpdateAssignmentAction = typeof updateAssignment;
type AssignFieldAction = typeof assignFieldToDepartment;
type RemoveAssignmentAction = typeof removeAssignment;
type SetDepartmentActiveAction = typeof setDepartmentActive;

export type NpdFieldsScreenProps = {
  departments: NpdDepartmentConfigRow[];
  fieldCatalog: NpdFieldCatalogRow[];
  canEdit?: boolean;
  labels: NpdFieldsScreenLabels;
  setDepartmentActiveAction?: SetDepartmentActiveAction;
  assignFieldAction?: AssignFieldAction;
  updateAssignmentAction?: UpdateAssignmentAction;
  removeAssignmentAction?: RemoveAssignmentAction;
};

type PendingTarget = { kind: 'department' | 'assignment' | 'assign'; id: string } | null;

function normalizeStage(value: string): StageCode {
  return STAGE_CODES.includes(value as StageCode) ? (value as StageCode) : 'brief';
}

function statusBadge(active: boolean, labels: NpdFieldsScreenLabels) {
  return active ? (
    <span className="badge badge-green">● {labels.active}</span>
  ) : (
    <span className="badge badge-gray">✕ {labels.inactive}</span>
  );
}

function InlineSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select id={id} name={label} value={value} options={options} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger id={`${id}-trigger`} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function NpdFieldsScreen({
  departments,
  fieldCatalog,
  canEdit = false,
  labels,
  setDepartmentActiveAction = setDepartmentActive,
  assignFieldAction = assignFieldToDepartment,
  updateAssignmentAction = updateAssignment,
  removeAssignmentAction = removeAssignment,
}: NpdFieldsScreenProps) {
  const router = useRouter();
  const [departmentRows, setDepartmentRows] = useState(departments);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departments[0]?.id ?? '');
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [pendingTarget, setPendingTarget] = useState<PendingTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const selectedDepartment = useMemo(
    () => departmentRows.find((department) => department.id === selectedDepartmentId) ?? departmentRows[0],
    [departmentRows, selectedDepartmentId],
  );

  const assignedFieldIds = useMemo(
    () => new Set(selectedDepartment?.fields.map((field) => field.field_id) ?? []),
    [selectedDepartment],
  );

  const departmentOptions = departmentRows.map((department) => ({
    value: department.id,
    label: department.name,
  }));
  const assignableFields = fieldCatalog
    .filter((field) => field.active && !assignedFieldIds.has(field.id))
    .map((field) => ({
      value: field.id,
      label: `${field.label} (${field.data_type})`,
    }));
  const stageOptions = STAGE_CODES.map((stage) => ({ value: stage, label: labels.stages[stage] }));
  const editDisabled = !canEdit || pendingTarget !== null;

  function refreshAfterMutation() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function runMutation(target: PendingTarget, mutate: () => Promise<void>) {
    if (!canEdit || !target) return;
    setPendingTarget(target);
    setError(null);
    try {
      await mutate();
      refreshAfterMutation();
    } catch {
      setError(labels.error);
    } finally {
      setPendingTarget(null);
    }
  }

  function patchAssignment(assignmentId: string, patch: Partial<NpdDepartmentFieldRow>) {
    setDepartmentRows((current) =>
      current.map((department) => ({
        ...department,
        fields: department.fields.map((field) =>
          field.assignment_id === assignmentId ? { ...field, ...patch } : field,
        ),
      })),
    );
  }

  function handleAssignmentPatch(assignment: NpdDepartmentFieldRow, patch: Record<string, boolean | number | string>) {
    const previous = { ...assignment };
    patchAssignment(assignment.assignment_id, patch);
    void runMutation({ kind: 'assignment', id: assignment.assignment_id }, async () => {
      try {
        await updateAssignmentAction(assignment.assignment_id, patch);
      } catch (caught) {
        patchAssignment(assignment.assignment_id, previous);
        throw caught;
      }
    });
  }

  function handleDepartmentActive(department: NpdDepartmentConfigRow, active: boolean) {
    setDepartmentRows((current) =>
      current.map((row) => (row.id === department.id ? { ...row, active } : row)),
    );
    void runMutation({ kind: 'department', id: department.id }, async () => {
      try {
        await setDepartmentActiveAction(department.id, active);
      } catch (caught) {
        setDepartmentRows((current) =>
          current.map((row) => (row.id === department.id ? { ...row, active: department.active } : row)),
        );
        throw caught;
      }
    });
  }

  function handleAssignField() {
    if (!selectedDepartment || !selectedFieldId) return;
    const nextOrder =
      selectedDepartment.fields.reduce((max, field) => Math.max(max, field.display_order), 0) + 10;
    void runMutation({ kind: 'assign', id: selectedDepartment.id }, async () => {
      const row = await assignFieldAction({
        department_id: selectedDepartment.id,
        field_id: selectedFieldId,
        required: false,
        visible: true,
        stage_code: 'brief',
        display_order: nextOrder,
      });
      const catalogField = fieldCatalog.find((field) => field.id === selectedFieldId);
      if (catalogField) {
        setDepartmentRows((current) =>
          current.map((department) =>
            department.id === selectedDepartment.id
              ? {
                  ...department,
                  fields: [
                    ...department.fields,
                    {
                      assignment_id: row.id,
                      field_id: row.field_id,
                      code: catalogField.code,
                      label: catalogField.label,
                      data_type: catalogField.data_type,
                      required: row.required,
                      visible: row.visible,
                      stage_code: row.stage_code,
                      display_order: row.display_order,
                    },
                  ].sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label)),
                }
              : department,
          ),
        );
      }
      setSelectedFieldId('');
    });
  }

  function handleRemoveAssignment(assignment: NpdDepartmentFieldRow) {
    const departmentId = selectedDepartment?.id;
    if (!departmentId) return;
    setDepartmentRows((current) =>
      current.map((department) =>
        department.id === departmentId
          ? {
              ...department,
              fields: department.fields.filter((field) => field.assignment_id !== assignment.assignment_id),
            }
          : department,
      ),
    );
    void runMutation({ kind: 'assignment', id: assignment.assignment_id }, async () => {
      try {
        await removeAssignmentAction(assignment.assignment_id);
      } catch (caught) {
        setDepartmentRows((current) =>
          current.map((department) =>
            department.id === departmentId
              ? {
                  ...department,
                  fields: [...department.fields, assignment].sort(
                    (a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label),
                  ),
                }
              : department,
          ),
        );
        throw caught;
      }
    });
  }

  return (
    <main aria-label={labels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
      <PageHead title={labels.title} sub={labels.subtitle} />

      {!canEdit ? (
        <div className="alert alert-amber" role="status" data-testid="npd-fields-read-only">
          {labels.readOnlyNotice}
        </div>
      ) : null}

      {error ? (
        <div className="alert alert-red" role="alert" data-testid="npd-fields-error">
          {error}
        </div>
      ) : null}

      <Section title={labels.departmentsTitle} sub={labels.departmentsSubtitle}>
        {departmentRows.length === 0 ? (
          <div className="muted" role="status" data-testid="npd-fields-empty-departments">
            {labels.emptyDepartments}
          </div>
        ) : (
          <>
            <SelectField
              id="npd-fields-selected-department"
              label={labels.selectedDepartment}
              options={departmentOptions}
              value={selectedDepartment?.id ?? ''}
              disabled={pendingTarget !== null}
              onChange={setSelectedDepartmentId}
            />

            <table data-testid="npd-departments-table">
              <thead>
                <tr>
                  <th>{labels.selectedDepartment}</th>
                  <th>{labels.active}</th>
                </tr>
              </thead>
              <tbody>
                {departmentRows.map((department) => (
                  <tr key={department.id}>
                    <td>
                      <button
                        type="button"
                        className={`pill ${selectedDepartment?.id === department.id ? 'on' : ''}`}
                        aria-pressed={selectedDepartment?.id === department.id}
                        onClick={() => setSelectedDepartmentId(department.id)}
                      >
                        {department.name}
                      </button>
                      <span className="muted mono" style={{ marginLeft: 8 }}>
                        {department.code}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Toggle
                          aria-label={`${department.name} ${labels.active}`}
                          checked={department.active}
                          disabled={editDisabled}
                          onChange={(active) => handleDepartmentActive(department, active)}
                        />
                        {statusBadge(department.active, labels)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {selectedDepartment ? (
        <Section
          title={labels.assignedFieldsTitle.replace('{department}', selectedDepartment.name)}
          sub={labels.assignedFieldsSubtitle}
        >
          <div
            className="sg-section-head"
            data-testid="npd-fields-assign-toolbar"
            style={{ padding: 0, border: 0, marginBottom: 12 }}
          >
            <div style={{ width: 340, maxWidth: '100%' }}>
              <SelectField
                id="npd-fields-catalog-field"
                label={labels.assignField}
                hint={labels.assignFieldPlaceholder}
                options={assignableFields}
                value={selectedFieldId}
                disabled={editDisabled || assignableFields.length === 0}
                onChange={setSelectedFieldId}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={editDisabled || !selectedFieldId}
              onClick={handleAssignField}
            >
              {pendingTarget?.kind === 'assign' ? labels.saving : labels.assign}
            </button>
          </div>

          {selectedDepartment.fields.length === 0 ? (
            <div className="muted" role="status" data-testid="npd-fields-empty-fields">
              {labels.emptyFields}
            </div>
          ) : (
            <table data-testid="npd-fields-table">
              <thead>
                <tr>
                  <th>{labels.columns.field}</th>
                  <th>{labels.columns.dataType}</th>
                  <th>{labels.columns.required}</th>
                  <th>{labels.columns.visible}</th>
                  <th>{labels.columns.stage}</th>
                  <th>{labels.columns.order}</th>
                  <th>{labels.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {selectedDepartment.fields.map((field) => {
                  const rowDisabled = editDisabled;
                  return (
                    <tr key={field.assignment_id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{field.label}</div>
                        <div className="muted mono">{field.code}</div>
                      </td>
                      <td>
                        <span className="badge badge-blue">{field.data_type}</span>
                      </td>
                      <td>
                        <Toggle
                          aria-label={`${field.label} ${labels.columns.required}`}
                          checked={field.required}
                          disabled={rowDisabled}
                          onChange={(required) => handleAssignmentPatch(field, { required })}
                        />
                      </td>
                      <td>
                        <Toggle
                          aria-label={`${field.label} ${labels.columns.visible}`}
                          checked={field.visible}
                          disabled={rowDisabled}
                          onChange={(visible) => handleAssignmentPatch(field, { visible })}
                        />
                      </td>
                      <td style={{ minWidth: 150 }}>
                        <InlineSelect
                          id={`npd-field-stage-${field.assignment_id}`}
                          label={`${field.label} ${labels.columns.stage}`}
                          value={normalizeStage(field.stage_code)}
                          options={stageOptions}
                          disabled={rowDisabled}
                          onChange={(stage_code) => handleAssignmentPatch(field, { stage_code })}
                        />
                      </td>
                      <td style={{ width: 110 }}>
                        <input
                          type="number"
                          aria-label={`${field.label} ${labels.columns.order}`}
                          value={field.display_order}
                          disabled={rowDisabled}
                          onChange={(event) =>
                            patchAssignment(field.assignment_id, {
                              display_order: Number.parseInt(event.currentTarget.value || '0', 10),
                            })
                          }
                          onBlur={(event) =>
                            handleAssignmentPatch(field, {
                              display_order: Number.parseInt(event.currentTarget.value || '0', 10),
                            })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={rowDisabled}
                          onClick={() => handleRemoveAssignment(field)}
                        >
                          {labels.remove}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>
      ) : null}
    </main>
  );
}
