'use client';

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { PageHead, Section, SelectField, Toggle } from '../_components';
import { CascadeDeleteDialog } from './_components/cascade-delete-dialog';
import { DepartmentDialog } from './_components/department-dialog';
import { FieldDialog } from './_components/field-dialog';
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

export const STAGE_CODES = [
  'brief',
  'recipe',
  'packaging',
  'costing_nutrition',
  'trial',
  'sensory',
  'pilot',
  'approval',
  'handoff',
] as const;

const UI_DATA_TYPES = ['text', 'integer', 'number', 'date', 'datetime', 'boolean', 'dropdown', 'formula'] as const;

type StageCode = (typeof STAGE_CODES)[number];
export type UiDataType = (typeof UI_DATA_TYPES)[number];

export type NpdFieldCatalogRow = {
  id: string;
  code: string;
  label: string;
  data_type: string;
  active: boolean;
  help_text?: string | null;
  is_auto?: boolean;
  auto_source_field?: string | null;
  /** Cross-department assignment count; shown for context only (hard-delete cascades). */
  assignment_count?: number;
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

export const FIELD_DUPLICATE_ERROR_CODES = [
  'duplicate_code',
  'duplicate_label',
  'semantic_duplicate_label',
] as const;

export type AutoSourceErrorCode = (typeof AUTO_SOURCE_ERROR_CODES)[number];
export type FieldDuplicateErrorCode = (typeof FIELD_DUPLICATE_ERROR_CODES)[number];

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

/** Error codes the `deleteDepartment` action returns when a delete is refused. */
export const DELETE_DEPARTMENT_ERROR_CODES = ['cannot_delete_core'] as const;

export type DeleteDepartmentErrorCode = (typeof DELETE_DEPARTMENT_ERROR_CODES)[number];

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
  stage_code: string;
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
  departmentStage: string;
  departmentDescription: string;
  newFieldTitle: string;
  newDepartmentTitle: string;
  editFieldTitle: string;
  editDepartmentTitle: string;
  dataTypeText: string;
  dataTypeNumber: string;
  dataTypeDate: string;
  // Repurposed: the message shown when a department delete is refused because it
  // is the immutable core department (`cannot_delete_core`).
  deleteDepartmentUnavailable: string;
  deleteDepartment: string;
  deleteField: string;
  deleteDepartmentTitle: string;
  deleteDepartmentBody: string;
  deleteFieldTitle: string;
  deleteFieldBody: string;
  deleteTypeToConfirm: string;
  deleteConfirmButton: string;
  deleteDeleting: string;
  fieldAuto: string;
  fieldAutoHint: string;
  fieldAutoSource: string;
  fieldAutoSourcePlaceholder: string;
  autoBadge: string;
  autoFrom: string;
  autoSourceErrors: Record<AutoSourceErrorCode, string>;
  duplicateFieldErrors: Record<FieldDuplicateErrorCode, string>;
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
  // Field-catalog section (S1b: reachable hard-delete). Lists every org catalog
  // field with its cross-department assignment count and a Delete that only
  // enables once the field is unassigned everywhere.
  catalogTitle: string;
  catalogSubtitle: string;
  catalogEmpty: string;
  /** `{count}` placeholder → assignment count, e.g. "3 assignments". */
  catalogAssignmentCount: string;
  catalogColumns: {
    field: string;
    dataType: string;
    assignments: string;
    actions: string;
  };
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
/**
 * The delete actions are owned by the backend lane and follow the same
 * discriminated-union refusal convention as `updateField`. Declared here as the
 * fixed contract the screen consumes (rather than `typeof`), so the screen stays
 * the source of truth for the shapes it renders without editing the action file.
 */
type DeleteDepartmentAction = (
  id: string,
) => Promise<{ ok: true; id: string } | { ok: false; error: DeleteDepartmentErrorCode }>;
type DeleteFieldAction = (id: string) => Promise<{ ok: true; id: string }>;

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
  deleteDepartmentAction?: DeleteDepartmentAction;
  deleteFieldAction?: DeleteFieldAction;
};

type PendingTarget = { kind: 'department' | 'assignment' | 'assign'; id: string } | null;

type DialogState =
  | { kind: 'new-field' }
  | { kind: 'new-department' }
  | { kind: 'edit-field'; field: NpdFieldCatalogRow }
  | { kind: 'edit-department'; department: NpdDepartmentConfigRow }
  | null;

type DeleteDialogState =
  | { kind: 'department'; department: NpdDepartmentConfigRow }
  | { kind: 'field'; field: NpdFieldCatalogRow }
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

function isFieldConfigError(
  result: unknown,
): result is { ok: false; error: AutoSourceErrorCode | FieldDuplicateErrorCode | string } {
  return isAutoSourceError(result) && typeof (result as { error?: unknown }).error === 'string';
}

function fieldConfigErrorMessage(
  error: string,
  labels: NpdFieldsScreenLabels,
): string {
  if (AUTO_SOURCE_ERROR_CODES.includes(error as AutoSourceErrorCode)) {
    return labels.autoSourceErrors[error as AutoSourceErrorCode];
  }
  if (FIELD_DUPLICATE_ERROR_CODES.includes(error as FieldDuplicateErrorCode)) {
    return labels.duplicateFieldErrors[error as FieldDuplicateErrorCode];
  }
  return labels.error;
}

function catalogMutationErrorMessage(err: unknown, labels: NpdFieldsScreenLabels): string {
  if (!(err instanceof Error)) return labels.error;
  if (FIELD_DUPLICATE_ERROR_CODES.includes(err.message as FieldDuplicateErrorCode)) {
    return labels.duplicateFieldErrors[err.message as FieldDuplicateErrorCode];
  }
  return labels.error;
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

export function slugifyCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeUiDataType(value: string): UiDataType {
  return UI_DATA_TYPES.includes(value as UiDataType) ? (value as UiDataType) : 'text';
}

function normalizeStage(value: string): StageCode {
  return STAGE_CODES.includes(value as StageCode) ? (value as StageCode) : 'brief';
}

function stageIndex(stageCode: string): number {
  const normalized = normalizeStage(stageCode);
  return STAGE_CODES.indexOf(normalized);
}

function compareDepartments(a: NpdDepartmentConfigRow, b: NpdDepartmentConfigRow): number {
  const stageDiff = stageIndex(a.stage_code) - stageIndex(b.stage_code);
  if (stageDiff !== 0) return stageDiff;
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  return a.name.localeCompare(b.name);
}

function statusBadge(active: boolean, labels: NpdFieldsScreenLabels) {
  return active ? (
    <span className="badge badge-green">● {labels.active}</span>
  ) : (
    <span className="badge badge-gray">✕ {labels.inactive}</span>
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
  // The delete actions are owned by the backend lane and injected by the page;
  // they cannot be imported here (would couple the client to the action module).
  // The no-op defaults keep the screen renderable in isolation.
  deleteDepartmentAction,
  deleteFieldAction,
}: NpdFieldsScreenProps) {
  const router = useRouter();
  const [departmentRows, setDepartmentRows] = useState(departments);
  const [fieldCatalogRows, setFieldCatalogRows] = useState(fieldCatalog);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departments[0]?.id ?? '');
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [pendingTarget, setPendingTarget] = useState<PendingTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const [deleteDialogPending, setDeleteDialogPending] = useState(false);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setDepartmentRows(departments);
  }, [departments]);

  useEffect(() => {
    setFieldCatalogRows(fieldCatalog);
  }, [fieldCatalog]);

  const sortedDepartments = useMemo(
    () => [...departmentRows].sort(compareDepartments),
    [departmentRows],
  );

  const departmentsByStage = useMemo(() => {
    const grouped = new Map<StageCode, NpdDepartmentConfigRow[]>();
    for (const stage of STAGE_CODES) {
      grouped.set(stage, []);
    }
    for (const department of sortedDepartments) {
      const stage = normalizeStage(department.stage_code);
      grouped.get(stage)?.push(department);
    }
    return grouped;
  }, [sortedDepartments]);

  const selectedDepartment = useMemo(
    () => departmentRows.find((department) => department.id === selectedDepartmentId) ?? departmentRows[0],
    [departmentRows, selectedDepartmentId],
  );

  const assignedFieldIds = useMemo(
    () => new Set(selectedDepartment?.fields.map((field) => field.field_id) ?? []),
    [selectedDepartment],
  );

  const departmentOptions = sortedDepartments.map((department) => ({
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
    { value: 'integer', label: 'integer' },
    { value: 'number', label: labels.dataTypeNumber },
    { value: 'date', label: labels.dataTypeDate },
    { value: 'datetime', label: 'datetime' },
    { value: 'boolean', label: 'boolean' },
    { value: 'dropdown', label: 'dropdown' },
    { value: 'formula', label: 'formula' },
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
      const row =       await assignFieldAction({
        department_id: selectedDepartment.id,
        field_id: selectedFieldId,
        required: false,
        visible: true,
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
        // Keep the catalog assignment count in sync so the catalog Delete
        // affordance reflects the new cross-department usage immediately.
        bumpAssignmentCount(selectedFieldId, 1);
      }
      setSelectedFieldId('');
    });
  }

  /**
   * Adjust the cross-department assignment count held on a catalog row by
   * `delta` (clamped at 0). Drives the enabled/disabled state of the catalog
   * Delete so unassigning the last department flips Delete to enabled in place.
   */
  function bumpAssignmentCount(fieldId: string, delta: number) {
    setFieldCatalogRows((current) =>
      current.map((row) =>
        row.id === fieldId
          ? { ...row, assignment_count: Math.max(0, (row.assignment_count ?? 0) + delta) }
          : row,
      ),
    );
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
    // Optimistically drop the cross-department count; removing the last
    // assignment flips the catalog Delete to enabled (count → 0).
    bumpAssignmentCount(assignment.field_id, -1);
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
        bumpAssignmentCount(assignment.field_id, 1);
        throw caught;
      }
    });
  }

  function openDeleteDialog(next: DeleteDialogState) {
    if (!canEdit) return;
    setDeleteDialogError(null);
    setDeleteDialog(next);
  }

  function closeDeleteDialog() {
    if (deleteDialogPending) return;
    setDeleteDialog(null);
    setDeleteDialogError(null);
  }

  async function confirmDeleteDepartment(department: NpdDepartmentConfigRow) {
    if (!canEdit || !deleteDepartmentAction) return;
    setDeleteDialogPending(true);
    setDeleteDialogError(null);
    setError(null);
    try {
      const result = await deleteDepartmentAction(department.id);
      if (!result.ok) {
        setDeleteDialogError(
          result.error === 'cannot_delete_core' ? labels.deleteDepartmentUnavailable : labels.error,
        );
        return;
      }
      setDepartmentRows((current) => {
        const remaining = current.filter((row) => row.id !== department.id);
        if (selectedDepartmentId === department.id) {
          setSelectedDepartmentId(remaining[0]?.id ?? '');
        }
        return remaining;
      });
      setDeleteDialog(null);
      refreshAfterMutation();
    } catch {
      setDeleteDialogError(labels.error);
    } finally {
      setDeleteDialogPending(false);
    }
  }

  async function confirmDeleteField(field: NpdFieldCatalogRow) {
    if (!canEdit || !deleteFieldAction) return;
    setDeleteDialogPending(true);
    setDeleteDialogError(null);
    setError(null);
    try {
      const result = await deleteFieldAction(field.id);
      setFieldCatalogRows((current) => current.filter((row) => row.id !== field.id));
      setDepartmentRows((current) =>
        current.map((department) => ({
          ...department,
          fields: department.fields.filter((entry) => entry.field_id !== field.id),
        })),
      );
      setDeleteDialog(null);
      refreshAfterMutation();
      void result;
    } catch {
      setDeleteDialogError(labels.error);
    } finally {
      setDeleteDialogPending(false);
    }
  }

  function handleDeleteDepartment(department: NpdDepartmentConfigRow) {
    if (!canEdit || !deleteDepartmentAction) return;
    if (department.code.toLowerCase() === 'core') return;
    openDeleteDialog({ kind: 'department', department });
  }

  function handleDeleteField(field: NpdFieldCatalogRow) {
    if (!canEdit || !deleteFieldAction) return;
    openDeleteDialog({ kind: 'field', field });
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
    } catch (err) {
      setDialogError(catalogMutationErrorMessage(err, labels));
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
          display_order: nextOrder,
        });
        bumpAssignmentCount(created.id, 1);
      }
      setFieldCatalogRows((current) => [
        ...current,
        {
          id: created.id,
          code: created.code,
          label: created.label,
          data_type: created.data_type,
          active: created.active,
          help_text: created.help_text,
          is_auto: created.is_auto ?? false,
          auto_source_field: created.auto_source_field ?? null,
          assignment_count: input.department_id ? 1 : 0,
        },
      ]);
    });
  }

  function handleCreateDepartment(input: {
    code: string;
    name: string;
    description: string;
    stage_code: string;
  }) {
    void runDialogMutation(async () => {
      const nextOrder = departmentRows.reduce((max, d) => Math.max(max, d.display_order), 0) + 10;
      const created = await createDepartmentAction({
        code: input.code,
        name: input.name,
        stage_code: input.stage_code,
        display_order: nextOrder,
      });
      setDepartmentRows((current) => [
        ...current,
        {
          id: created.id,
          code: created.code,
          name: created.name,
          stage_code: created.stage_code,
          display_order: created.display_order,
          active: created.active,
          fields: [],
        },
      ]);
      setSelectedDepartmentId(created.id);
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
        if (isFieldConfigError(result)) {
          setDialogError(fieldConfigErrorMessage(result.error, labels));
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

  function handleUpdateDepartment(
    departmentId: string,
    patch: { name: string; stage_code: string },
  ) {
    void runDialogMutation(async () => {
      const updated = await updateDepartmentAction(departmentId, {
        name: patch.name,
        stage_code: patch.stage_code,
      });
      setDepartmentRows((current) =>
        current.map((row) =>
          row.id === departmentId
            ? { ...row, name: updated.name, stage_code: updated.stage_code }
            : row,
        ),
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
                  <th>{labels.columns.stage}</th>
                  <th>{labels.selectedDepartment}</th>
                  <th>{labels.active}</th>
                  <th>{labels.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {STAGE_CODES.map((stage) => {
                  const stageDepartments = departmentsByStage.get(stage) ?? [];
                  if (stageDepartments.length === 0) return null;
                  return (
                    <Fragment key={stage}>
                      <tr data-testid={`npd-stage-group-${stage}`} className="muted">
                        <td colSpan={4} style={{ fontWeight: 600, paddingTop: 12 }}>
                          {labels.stages[stage]}
                        </td>
                      </tr>
                      {stageDepartments.map((department) => (
                        <tr
                          key={department.id}
                          data-testid={`npd-department-row-${department.id}`}
                          data-stage={stage}
                          data-inactive={department.active ? undefined : 'true'}
                          style={department.active ? undefined : { opacity: 0.55 }}
                        >
                          <td>
                            <span className="badge badge-blue" data-testid={`npd-department-stage-${department.id}`}>
                              {labels.stages[normalizeStage(department.stage_code)]}
                            </span>
                          </td>
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
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`${labels.editAction} ${department.name}`}
                                disabled={editDisabled}
                                onClick={() => openDialog({ kind: 'edit-department', department })}
                              >
                                {labels.editAction}
                              </button>
                              {department.code.toLowerCase() === 'core' ? null : (
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  aria-label={`${labels.deleteDepartment} ${department.name}`}
                                  disabled={editDisabled}
                                  onClick={() => handleDeleteDepartment(department)}
                                >
                                  {labels.deleteDepartment}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
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

      <Section title={labels.catalogTitle} sub={labels.catalogSubtitle}>
        {fieldCatalogRows.length === 0 ? (
          <div className="muted" role="status" data-testid="npd-field-catalog-empty">
            {labels.catalogEmpty}
          </div>
        ) : (
          <table data-testid="npd-field-catalog-table">
            <thead>
              <tr>
                <th>{labels.catalogColumns.field}</th>
                <th>{labels.catalogColumns.dataType}</th>
                <th>{labels.catalogColumns.assignments}</th>
                <th>{labels.catalogColumns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {fieldCatalogRows.map((field) => {
                const count = field.assignment_count ?? 0;
                return (
                  <tr key={field.id} data-testid={`npd-catalog-row-${field.id}`}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{field.label}</div>
                      <div className="muted mono">{field.code}</div>
                    </td>
                    <td>
                      <span className="badge badge-blue">{field.data_type}</span>
                    </td>
                    <td>
                      <span
                        className={count === 0 ? 'badge badge-gray' : 'badge badge-amber'}
                        data-testid={`npd-catalog-count-${field.id}`}
                      >
                        {labels.catalogAssignmentCount.replace('{count}', String(count))}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger"
                        aria-label={`${labels.deleteField} ${field.label}`}
                        disabled={editDisabled}
                        onClick={() => handleDeleteField(field)}
                      >
                        {labels.deleteField}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

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
          stageOptions={stageOptions}
          pending={dialogPending}
          error={dialogError}
          formTestId="npd-new-department-form"
          submitLabel={labels.create}
          mode="create"
          onCancel={closeDialog}
          onSubmit={(values) =>
            handleCreateDepartment({
              code: values.code,
              name: values.name,
              description: values.description,
              stage_code: values.stage_code,
            })
          }
        />
      ) : null}

      {dialog?.kind === 'edit-department' ? (
        <DepartmentDialog
          title={labels.editDepartmentTitle}
          labels={labels}
          stageOptions={stageOptions}
          initial={{
            code: dialog.department.code,
            name: dialog.department.name,
            description: '',
            stage_code: normalizeStage(dialog.department.stage_code),
          }}
          pending={dialogPending}
          error={dialogError}
          formTestId="npd-edit-department-form"
          submitLabel={labels.save}
          mode="edit"
          onCancel={closeDialog}
          onSubmit={(values) =>
            handleUpdateDepartment(dialog.department.id, {
              name: values.name,
              stage_code: values.stage_code,
            })
          }
        />
      ) : null}

      {deleteDialog?.kind === 'department' ? (
        <CascadeDeleteDialog
          open
          title={labels.deleteDepartmentTitle.replace('{name}', deleteDialog.department.name)}
          body={labels.deleteDepartmentBody}
          targetCode={deleteDialog.department.code}
          labels={{
            cancel: labels.cancel,
            confirmButton: labels.deleteConfirmButton,
            deleting: labels.deleteDeleting,
            typeToConfirm: labels.deleteTypeToConfirm,
          }}
          pending={deleteDialogPending}
          error={deleteDialogError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void confirmDeleteDepartment(deleteDialog.department)}
        />
      ) : null}

      {deleteDialog?.kind === 'field' ? (
        <CascadeDeleteDialog
          open
          title={labels.deleteFieldTitle.replace('{name}', deleteDialog.field.label)}
          body={labels.deleteFieldBody}
          targetCode={deleteDialog.field.code}
          labels={{
            cancel: labels.cancel,
            confirmButton: labels.deleteConfirmButton,
            deleting: labels.deleteDeleting,
            typeToConfirm: labels.deleteTypeToConfirm,
          }}
          pending={deleteDialogPending}
          error={deleteDialogError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void confirmDeleteField(deleteDialog.field)}
        />
      ) : null}
    </main>
  );
}
