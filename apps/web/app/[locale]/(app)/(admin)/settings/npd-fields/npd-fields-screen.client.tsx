'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { PageHead, Section, SelectField, SettingField, SRow, Toggle } from '../_components';
import {
  assignFieldToDepartment,
  createDepartment,
  createField,
  removeAssignment,
  setDepartmentActive,
  updateAssignment,
  updateDepartment,
  updateField,
} from './_actions/npd-field-config';

const STAGE_CODES = ['brief', 'recipe', 'packaging', 'trial', 'sensory', 'pilot', 'approval', 'handoff'] as const;

/**
 * Data types exposed in the management UI. The catalog action accepts a wider
 * union, but this slice deliberately limits the picker to {text, number, date}
 * — the dynamic 'auto'/formula source is a later slice (do not expose here).
 */
const UI_DATA_TYPES = ['text', 'number', 'date'] as const;

type StageCode = (typeof STAGE_CODES)[number];
type UiDataType = (typeof UI_DATA_TYPES)[number];

export type NpdFieldCatalogRow = {
  id: string;
  code: string;
  label: string;
  data_type: string;
  active: boolean;
  help_text?: string | null;
  is_auto?: boolean;
  auto_source_field?: string | null;
};

/**
 * Error codes the `updateField` union may return for auto-derived config.
 * Mirrors the server action's `{ ok:false, error }` branch.
 */
export const AUTO_SOURCE_ERROR_CODES = [
  'auto_source_self',
  'auto_source_not_found',
  'auto_source_cycle',
  'auto_source_required',
] as const;

export type AutoSourceErrorCode = (typeof AUTO_SOURCE_ERROR_CODES)[number];

/**
 * Error codes the `setDepartmentActive` action surfaces when a deactivation is
 * refused server-side. The backend may report these either as a discriminated
 * union (`{ ok:false, error }`, the convention used by `updateField`) or as a
 * thrown `Error` whose message contains the code — `handleDepartmentActive`
 * tolerates both. When refused, the optimistic toggle is rolled back to ON.
 */
export const DEACTIVATE_ERROR_CODES = [
  'cannot_deactivate_core',
  'cannot_deactivate_last',
] as const;

export type DeactivateErrorCode = (typeof DEACTIVATE_ERROR_CODES)[number];

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
  newField: string;
  newDepartment: string;
  editAction: string;
  save: string;
  cancel: string;
  create: string;
  fieldCode: string;
  fieldLabel: string;
  fieldDepartment: string;
  fieldDataType: string;
  fieldRequired: string;
  fieldHelpText: string;
  departmentCode: string;
  departmentName: string;
  departmentDescription: string;
  newFieldTitle: string;
  newDepartmentTitle: string;
  editFieldTitle: string;
  editDepartmentTitle: string;
  dataTypeText: string;
  dataTypeNumber: string;
  dataTypeDate: string;
  deleteDepartmentUnavailable: string;
  fieldAuto: string;
  fieldAutoHint: string;
  fieldAutoSource: string;
  fieldAutoSourcePlaceholder: string;
  autoBadge: string;
  autoFrom: string;
  autoSourceErrors: Record<AutoSourceErrorCode, string>;
  deactivateErrors: Record<DeactivateErrorCode, string>;
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
/**
 * The screen tolerates either return shape from the deactivation action:
 *  - the resolved row (success / current behaviour), or
 *  - a `{ ok:false, error }` refusal union (forward-compatible with the backend
 *    lane that adds `cannot_deactivate_core` / `cannot_deactivate_last`).
 * A thrown rejection carrying the code is also handled at runtime. Widening here
 * (rather than `typeof setDepartmentActive`) keeps the screen the source of
 * truth for the shapes it consumes without editing the backend action.
 */
type SetDepartmentActiveResult =
  | Awaited<ReturnType<typeof setDepartmentActive>>
  | { ok: false; error: DeactivateErrorCode | string };
type SetDepartmentActiveAction = (id: string, active: boolean) => Promise<SetDepartmentActiveResult>;
type CreateFieldAction = typeof createField;
type CreateDepartmentAction = typeof createDepartment;
type UpdateFieldAction = typeof updateField;
type UpdateDepartmentAction = typeof updateDepartment;

export type NpdFieldsScreenProps = {
  departments: NpdDepartmentConfigRow[];
  fieldCatalog: NpdFieldCatalogRow[];
  canEdit?: boolean;
  labels: NpdFieldsScreenLabels;
  setDepartmentActiveAction?: SetDepartmentActiveAction;
  assignFieldAction?: AssignFieldAction;
  updateAssignmentAction?: UpdateAssignmentAction;
  removeAssignmentAction?: RemoveAssignmentAction;
  createFieldAction?: CreateFieldAction;
  createDepartmentAction?: CreateDepartmentAction;
  updateFieldAction?: UpdateFieldAction;
  updateDepartmentAction?: UpdateDepartmentAction;
};

type PendingTarget = { kind: 'department' | 'assignment' | 'assign'; id: string } | null;

type DialogState =
  | { kind: 'new-field' }
  | { kind: 'new-department' }
  | { kind: 'edit-field'; field: NpdFieldCatalogRow }
  | { kind: 'edit-department'; department: NpdDepartmentConfigRow }
  | null;

function isAutoSourceError(
  result: unknown,
): result is { ok: false; error: AutoSourceErrorCode | string } {
  return (
    typeof result === 'object' &&
    result !== null &&
    'ok' in result &&
    (result as { ok: unknown }).ok === false
  );
}

function isDeactivateErrorCode(value: unknown): value is DeactivateErrorCode {
  return (
    typeof value === 'string' && DEACTIVATE_ERROR_CODES.includes(value as DeactivateErrorCode)
  );
}

/**
 * Resolve a refused-deactivation code from whatever `setDepartmentActive`
 * surfaces. Two mechanisms are tolerated:
 *  - a discriminated union `{ ok:false, error:'cannot_deactivate_*' }`
 *    (the `updateField` convention), and
 *  - a thrown `Error`/string whose message *contains* the code (e.g. a Postgres
 *    constraint/trigger raising `cannot_deactivate_core`).
 * Returns the matched code, or `null` for any other (generic) failure.
 */
function resolveDeactivateError(source: unknown): DeactivateErrorCode | null {
  if (typeof source === 'object' && source !== null && 'ok' in source) {
    const candidate = source as { ok: unknown; error?: unknown };
    if (candidate.ok === false && isDeactivateErrorCode(candidate.error)) {
      return candidate.error;
    }
  }
  const message =
    source instanceof Error
      ? source.message
      : typeof source === 'string'
        ? source
        : '';
  return DEACTIVATE_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}

function slugifyCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeUiDataType(value: string): UiDataType {
  return UI_DATA_TYPES.includes(value as UiDataType) ? (value as UiDataType) : 'text';
}

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
  createFieldAction = createField,
  createDepartmentAction = createDepartment,
  updateFieldAction = updateField,
  updateDepartmentAction = updateDepartment,
}: NpdFieldsScreenProps) {
  const router = useRouter();
  const [departmentRows, setDepartmentRows] = useState(departments);
  const [fieldCatalogRows, setFieldCatalogRows] = useState(fieldCatalog);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departments[0]?.id ?? '');
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [pendingTarget, setPendingTarget] = useState<PendingTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
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
  const assignableFields = fieldCatalogRows
    .filter((field) => field.active && !assignedFieldIds.has(field.id))
    .map((field) => ({
      value: field.id,
      label: `${field.label} (${field.data_type})`,
    }));
  const stageOptions = STAGE_CODES.map((stage) => ({ value: stage, label: labels.stages[stage] }));
  const dataTypeOptions: Array<{ value: UiDataType; label: string }> = [
    { value: 'text', label: labels.dataTypeText },
    { value: 'number', label: labels.dataTypeNumber },
    { value: 'date', label: labels.dataTypeDate },
  ];
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
    if (!canEdit) return;
    // Optimistic flip of the toggle + badge.
    setDepartmentRows((current) =>
      current.map((row) => (row.id === department.id ? { ...row, active } : row)),
    );
    setPendingTarget({ kind: 'department', id: department.id });
    setError(null);

    const rollback = () => {
      setDepartmentRows((current) =>
        current.map((row) =>
          row.id === department.id ? { ...row, active: department.active } : row,
        ),
      );
    };

    void (async () => {
      try {
        const result = await setDepartmentActiveAction(department.id, active);
        // Union mechanism: the action resolved with { ok:false, error }. No throw.
        const unionCode = resolveDeactivateError(result);
        if (unionCode) {
          // Refused: revert the optimistic toggle to its prior state and show the
          // specific localized reason instead of the generic error.
          rollback();
          setError(labels.deactivateErrors[unionCode]);
          return;
        }
        refreshAfterMutation();
      } catch (caught) {
        // Thrown mechanism: a rejected promise (e.g. a DB constraint/trigger).
        rollback();
        const thrownCode = resolveDeactivateError(caught);
        setError(thrownCode ? labels.deactivateErrors[thrownCode] : labels.error);
      } finally {
        setPendingTarget(null);
      }
    })();
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
      const catalogField = fieldCatalogRows.find((field) => field.id === selectedFieldId);
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

  function openDialog(next: DialogState) {
    if (!canEdit) return;
    setDialogError(null);
    setDialog(next);
  }

  function closeDialog() {
    if (dialogPending) return;
    setDialog(null);
    setDialogError(null);
  }

  async function runDialogMutation(mutate: () => Promise<void>) {
    if (!canEdit || dialogPending) return;
    setDialogPending(true);
    setDialogError(null);
    try {
      await mutate();
      setDialog(null);
      refreshAfterMutation();
    } catch {
      setDialogError(labels.error);
    } finally {
      setDialogPending(false);
    }
  }

  function handleCreateField(input: {
    code: string;
    label: string;
    department_id: string;
    data_type: UiDataType;
    required: boolean;
    help_text: string;
  }) {
    void runDialogMutation(async () => {
      const created = await createFieldAction({
        code: input.code,
        label: input.label,
        data_type: input.data_type,
        help_text: input.help_text.trim() ? input.help_text.trim() : null,
      });
      // Optional: if a department was chosen, immediately assign the new field there.
      if (input.department_id) {
        const target = departmentRows.find((department) => department.id === input.department_id);
        const nextOrder = (target?.fields.reduce((max, f) => Math.max(max, f.display_order), 0) ?? 0) + 10;
        await assignFieldAction({
          department_id: input.department_id,
          field_id: created.id,
          required: input.required,
          visible: true,
          stage_code: 'brief',
          display_order: nextOrder,
        });
      }
    });
  }

  function handleCreateDepartment(input: { code: string; name: string; description: string }) {
    void runDialogMutation(async () => {
      const nextOrder = departmentRows.reduce((max, d) => Math.max(max, d.display_order), 0) + 10;
      await createDepartmentAction({
        code: input.code,
        name: input.name,
        display_order: nextOrder,
      });
    });
  }

  function handleUpdateField(
    fieldId: string,
    patch: {
      label: string;
      data_type: UiDataType;
      help_text: string;
      is_auto: boolean;
      auto_source_field: string | null;
    },
  ) {
    if (!canEdit || dialogPending) return;
    setDialogPending(true);
    setDialogError(null);
    void (async () => {
      try {
        const result = await updateFieldAction(fieldId, {
          label: patch.label,
          data_type: patch.data_type,
          help_text: patch.help_text.trim() ? patch.help_text.trim() : null,
          is_auto: patch.is_auto,
          // When Auto is off the source is ignored/cleared (the backend also
          // nulls it server-side, but we don't send a stale value).
          auto_source_field: patch.is_auto ? patch.auto_source_field : null,
        });
        if (isAutoSourceError(result)) {
          setDialogError(
            labels.autoSourceErrors[result.error as AutoSourceErrorCode] ?? labels.error,
          );
          return;
        }
        // Success: reflect the saved auto config on the held catalog row so the
        // list badge updates in place without a full refetch.
        const saved = result;
        setFieldCatalogRows((current) =>
          current.map((row) =>
            row.id === fieldId
              ? {
                  ...row,
                  label: saved.label,
                  data_type: saved.data_type,
                  help_text: saved.help_text,
                  is_auto: saved.is_auto,
                  auto_source_field: saved.auto_source_field,
                }
              : row,
          ),
        );
        setDialog(null);
        refreshAfterMutation();
      } catch {
        setDialogError(labels.error);
      } finally {
        setDialogPending(false);
      }
    })();
  }

  function handleUpdateDepartment(departmentId: string, patch: { name: string }) {
    void runDialogMutation(async () => {
      await updateDepartmentAction(departmentId, { name: patch.name });
      setDepartmentRows((current) =>
        current.map((row) => (row.id === departmentId ? { ...row, name: patch.name } : row)),
      );
    });
  }

  return (
    <main aria-label={labels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
      <PageHead
        title={labels.title}
        sub={labels.subtitle}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label={labels.newDepartment}
              disabled={editDisabled}
              onClick={() => openDialog({ kind: 'new-department' })}
            >
              + {labels.newDepartment}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              aria-label={labels.newField}
              disabled={editDisabled}
              onClick={() => openDialog({ kind: 'new-field' })}
            >
              + {labels.newField}
            </button>
          </div>
        }
      />

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
                  <th>{labels.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {departmentRows.map((department) => (
                  <tr
                    key={department.id}
                    data-testid={`npd-department-row-${department.id}`}
                    data-inactive={department.active ? undefined : 'true'}
                    style={department.active ? undefined : { opacity: 0.55 }}
                  >
                    <td>
                      <button
                        type="button"
                        className={`pill ${selectedDepartment?.id === department.id ? 'on' : ''}`}
                        aria-pressed={selectedDepartment?.id === department.id}
                        style={department.active ? undefined : { opacity: 0.6 }}
                        onClick={() => setSelectedDepartmentId(department.id)}
                      >
                        {department.name}
                      </button>
                      <span className="muted mono" style={{ marginLeft: 8 }}>
                        {department.code}
                      </span>
                      {department.active ? null : (
                        <span
                          className="badge badge-gray"
                          data-testid={`npd-department-inactive-tag-${department.id}`}
                          style={{ marginLeft: 8 }}
                        >
                          {labels.inactive}
                        </span>
                      )}
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
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        aria-label={`${labels.editAction} ${department.name}`}
                        disabled={editDisabled}
                        onClick={() => openDialog({ kind: 'edit-department', department })}
                      >
                        {labels.editAction}
                      </button>
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
                  const catalogRow = fieldCatalogRows.find((entry) => entry.id === field.field_id);
                  const isAuto = catalogRow?.is_auto ?? false;
                  const autoSource = catalogRow?.auto_source_field ?? null;
                  return (
                    <tr key={field.assignment_id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                          {field.label}
                          {isAuto ? (
                            <span className="badge badge-purple" data-testid={`npd-field-auto-badge-${field.field_id}`}>
                              ⚙ {labels.autoBadge}
                            </span>
                          ) : null}
                        </div>
                        <div className="muted mono">{field.code}</div>
                        {isAuto && autoSource ? (
                          <div className="muted" data-testid={`npd-field-auto-from-${field.field_id}`}>
                            {labels.autoFrom.replace('{source}', autoSource)}
                          </div>
                        ) : null}
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
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            aria-label={`${labels.editAction} ${field.label}`}
                            disabled={rowDisabled}
                            onClick={() => {
                              const catalogField =
                                catalogRow ?? {
                                  id: field.field_id,
                                  code: field.code,
                                  label: field.label,
                                  data_type: field.data_type,
                                  active: true,
                                  is_auto: false,
                                  auto_source_field: null,
                                };
                              openDialog({ kind: 'edit-field', field: catalogField });
                            }}
                          >
                            {labels.editAction}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={rowDisabled}
                            onClick={() => handleRemoveAssignment(field)}
                          >
                            {labels.remove}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>
      ) : null}

      {dialog?.kind === 'new-field' ? (
        <FieldDialog
          mode="create"
          title={labels.newFieldTitle}
          labels={labels}
          departmentOptions={departmentOptions}
          dataTypeOptions={dataTypeOptions}
          pending={dialogPending}
          error={dialogError}
          formTestId="npd-new-field-form"
          submitLabel={labels.create}
          onCancel={closeDialog}
          onSubmit={(values) =>
            handleCreateField({
              code: values.code,
              label: values.label,
              department_id: values.department_id,
              data_type: values.data_type,
              required: values.required,
              help_text: values.help_text,
            })
          }
        />
      ) : null}

      {dialog?.kind === 'edit-field' ? (
        <FieldDialog
          mode="edit"
          title={labels.editFieldTitle}
          labels={labels}
          departmentOptions={departmentOptions}
          dataTypeOptions={dataTypeOptions}
          autoSourceOptions={fieldCatalogRows
            .filter((entry) => entry.code !== dialog.field.code)
            .map((entry) => ({ value: entry.code, label: `${entry.label} (${entry.code})` }))}
          initial={{
            code: dialog.field.code,
            label: dialog.field.label,
            data_type: normalizeUiDataType(dialog.field.data_type),
            help_text: dialog.field.help_text ?? '',
            is_auto: dialog.field.is_auto ?? false,
            auto_source_field: dialog.field.auto_source_field ?? '',
          }}
          pending={dialogPending}
          error={dialogError}
          formTestId="npd-edit-field-form"
          submitLabel={labels.save}
          onCancel={closeDialog}
          onSubmit={(values) =>
            handleUpdateField(dialog.field.id, {
              label: values.label,
              data_type: values.data_type,
              help_text: values.help_text,
              is_auto: values.is_auto,
              auto_source_field: values.auto_source_field.trim() ? values.auto_source_field : null,
            })
          }
        />
      ) : null}

      {dialog?.kind === 'new-department' ? (
        <DepartmentDialog
          title={labels.newDepartmentTitle}
          labels={labels}
          pending={dialogPending}
          error={dialogError}
          formTestId="npd-new-department-form"
          submitLabel={labels.create}
          mode="create"
          onCancel={closeDialog}
          onSubmit={(values) =>
            handleCreateDepartment({ code: values.code, name: values.name, description: values.description })
          }
        />
      ) : null}

      {dialog?.kind === 'edit-department' ? (
        <DepartmentDialog
          title={labels.editDepartmentTitle}
          labels={labels}
          initial={{ code: dialog.department.code, name: dialog.department.name, description: '' }}
          pending={dialogPending}
          error={dialogError}
          formTestId="npd-edit-department-form"
          submitLabel={labels.save}
          mode="edit"
          onCancel={closeDialog}
          onSubmit={(values) => handleUpdateDepartment(dialog.department.id, { name: values.name })}
        />
      ) : null}
    </main>
  );
}

function DialogShell({
  titleId,
  title,
  children,
  onCancel,
}: {
  titleId: string;
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-950">
            {title}
          </h2>
          <button type="button" className="btn btn-secondary" aria-label="×" onClick={onCancel}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type FieldDialogValues = {
  code: string;
  label: string;
  department_id: string;
  data_type: UiDataType;
  required: boolean;
  help_text: string;
  is_auto: boolean;
  auto_source_field: string;
};

function FieldDialog({
  mode,
  title,
  labels,
  departmentOptions,
  dataTypeOptions,
  autoSourceOptions = [],
  initial,
  pending,
  error,
  formTestId,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  title: string;
  labels: NpdFieldsScreenLabels;
  departmentOptions: Array<{ value: string; label: string }>;
  dataTypeOptions: Array<{ value: UiDataType; label: string }>;
  autoSourceOptions?: Array<{ value: string; label: string }>;
  initial?: {
    code: string;
    label: string;
    data_type: UiDataType;
    help_text: string;
    is_auto?: boolean;
    auto_source_field?: string;
  };
  pending: boolean;
  error: string | null;
  formTestId: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: FieldDialogValues) => void;
}) {
  const titleId = React.useId();
  const [code, setCode] = useState(initial?.code ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [departmentId, setDepartmentId] = useState('');
  const [dataType, setDataType] = useState<UiDataType>(initial?.data_type ?? 'text');
  const [required, setRequired] = useState(false);
  const [helpText, setHelpText] = useState(initial?.help_text ?? '');
  const [isAuto, setIsAuto] = useState(initial?.is_auto ?? false);
  const [autoSourceField, setAutoSourceField] = useState(initial?.auto_source_field ?? '');
  const [codeTouched, setCodeTouched] = useState(mode === 'edit');

  const effectiveCode = mode === 'create' && !codeTouched ? slugifyCode(label) : code;
  const canSubmit = !pending && effectiveCode.trim().length > 0 && label.trim().length > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      code: slugifyCode(effectiveCode),
      label: label.trim(),
      department_id: departmentId,
      data_type: dataType,
      required,
      help_text: helpText,
      is_auto: isAuto,
      // When Auto is off the source is cleared/ignored.
      auto_source_field: isAuto ? autoSourceField : '',
    });
  }

  return (
    <DialogShell titleId={titleId} title={title} onCancel={onCancel}>
      <form data-testid={formTestId} onSubmit={submit} className="mt-4">
        <SettingField
          id={`${formTestId}-label`}
          label={labels.fieldLabel}
          value={label}
          disabled={pending}
          onChange={setLabel}
        />
        <SettingField
          id={`${formTestId}-code`}
          label={labels.fieldCode}
          hint={mode === 'create' ? labels.fieldCode : undefined}
          value={mode === 'create' ? effectiveCode : code}
          disabled={pending || mode === 'edit'}
          readOnly={mode === 'edit'}
          onChange={(value) => {
            setCodeTouched(true);
            setCode(value);
          }}
        />
        <SelectField
          id={`${formTestId}-data-type`}
          label={labels.fieldDataType}
          options={dataTypeOptions}
          value={dataType}
          disabled={pending}
          onChange={(value) => setDataType(normalizeUiDataType(value))}
        />
        <SettingField
          id={`${formTestId}-help-text`}
          label={labels.fieldHelpText}
          value={helpText}
          disabled={pending}
          onChange={setHelpText}
        />
        {mode === 'create' ? (
          <>
            <SelectField
              id={`${formTestId}-department`}
              label={labels.fieldDepartment}
              hint={labels.assignFieldPlaceholder}
              options={[{ value: '', label: '—' }, ...departmentOptions]}
              value={departmentId}
              disabled={pending}
              onChange={setDepartmentId}
            />
            <SRow label={labels.fieldRequired}>
              <Toggle
                aria-label={labels.fieldRequired}
                checked={required}
                disabled={pending || departmentId === ''}
                onChange={setRequired}
              />
            </SRow>
          </>
        ) : null}

        {mode === 'edit' ? (
          <>
            <SRow label={labels.fieldAuto} hint={labels.fieldAutoHint}>
              <Toggle
                aria-label={labels.fieldAuto}
                checked={isAuto}
                disabled={pending}
                onChange={(next) => {
                  setIsAuto(next);
                  if (!next) setAutoSourceField('');
                }}
              />
            </SRow>
            {isAuto ? (
              <SelectField
                id={`${formTestId}-auto-source`}
                label={labels.fieldAutoSource}
                hint={labels.fieldAutoSourcePlaceholder}
                options={[{ value: '', label: '—' }, ...autoSourceOptions]}
                value={autoSourceField}
                disabled={pending}
                onChange={setAutoSourceField}
              />
            ) : null}
          </>
        ) : null}

        {error ? (
          <div className="alert alert-red" role="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={onCancel}>
            {labels.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {pending ? labels.saving : submitLabel}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

type DepartmentDialogValues = { code: string; name: string; description: string };

function DepartmentDialog({
  mode,
  title,
  labels,
  initial,
  pending,
  error,
  formTestId,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  title: string;
  labels: NpdFieldsScreenLabels;
  initial?: DepartmentDialogValues;
  pending: boolean;
  error: string | null;
  formTestId: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: DepartmentDialogValues) => void;
}) {
  const titleId = React.useId();
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [codeTouched, setCodeTouched] = useState(mode === 'edit');

  const effectiveCode = mode === 'create' && !codeTouched ? slugifyCode(name) : code;
  const canSubmit = !pending && effectiveCode.trim().length > 0 && name.trim().length > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    // NOTE: npd_departments has no description column (mig 333) and the
    // createDepartment/updateDepartment actions do not accept one, so we only
    // submit { code, name }. Description is intentionally not collected to avoid
    // a silent no-op; a backing column + action change is a separate slice.
    onSubmit({ code: slugifyCode(effectiveCode), name: name.trim(), description: '' });
  }

  return (
    <DialogShell titleId={titleId} title={title} onCancel={onCancel}>
      <form data-testid={formTestId} onSubmit={submit} className="mt-4">
        <SettingField
          id={`${formTestId}-name`}
          label={labels.departmentName}
          value={name}
          disabled={pending}
          onChange={setName}
        />
        <SettingField
          id={`${formTestId}-code`}
          label={labels.departmentCode}
          value={mode === 'create' ? effectiveCode : code}
          disabled={pending || mode === 'edit'}
          readOnly={mode === 'edit'}
          onChange={(value) => {
            setCodeTouched(true);
            setCode(value);
          }}
        />

        {error ? (
          <div className="alert alert-red" role="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={onCancel}>
            {labels.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {pending ? labels.saving : submitLabel}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
