'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';
import { Switch } from '@monopilot/ui/Switch';

type RefColumnType = 'text' | 'number' | 'boolean' | 'enum';

type RefSchemaColumn = {
  columnCode: string;
  label: string;
  type: RefColumnType;
  required?: boolean;
  readOnlyWhenEditing?: boolean;
  help?: string;
  options?: Array<{ value: string; label: string }>;
};

type RefRow = {
  tableCode: string;
  rowKey: string;
  values: Record<string, string | number | boolean | null>;
};

type UpsertReferenceRowResult =
  | { ok: true; tableCode: string; rowKey: string; revalidatedPath: '/settings/reference' }
  | { ok: false; error: string };

export type RefRowEditModalProps = {
  open: boolean;
  tableCode: string;
  tableLabel?: string;
  row?: RefRow | null;
  columns: RefSchemaColumn[];
  labels?: Partial<RefRowEditModalLabels>;
  loading?: boolean;
  error?: string | null;
  upsertReferenceRow: (input: {
    tableCode: string;
    rowKey: string;
    values: Record<string, string | number | boolean | null>;
  }) => Promise<UpsertReferenceRowResult>;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: { tableCode: string; rowKey: string; revalidatedPath: '/settings/reference' }) => void;
};

type FieldValue = string | number | boolean | null;
type FormValues = Record<string, FieldValue>;
type FieldErrors = Record<string, string | null>;

export type RefRowEditModalLabels = {
  title: string;
  editTitle: string;
  referenceTable: string;
  cancel: string;
  save: string;
  saving: string;
  loading: string;
  loadingLabel: string;
  noSchema: string;
  rowKeyInvalid: string;
  rowKeyRequired: string;
  minChars: string;
  selectPlaceholder: string;
  saveFailed: string;
};

const ROW_KEY_PATTERN = /^[A-Z0-9_-]{2,}$/;
const DEFAULT_LABELS: RefRowEditModalLabels = {
  title: 'Reference row',
  editTitle: 'Edit row — {rowKey}',
  referenceTable: 'Reference table · {tableCode}',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving…',
  loading: '⟳ Loading reference row…',
  loadingLabel: 'Loading reference row',
  noSchema: 'No schema fields available for {tableCode}',
  rowKeyInvalid: 'Must be uppercase alnum / underscore / dash, ≥ 2 chars',
  rowKeyRequired: 'Row key is required',
  minChars: 'Min 2 chars',
  selectPlaceholder: 'Select…',
  saveFailed: 'REFERENCE_ROW_SAVE_FAILED',
};

function withDefaultLabels(labels?: Partial<RefRowEditModalLabels>): RefRowEditModalLabels {
  return { ...DEFAULT_LABELS, ...(labels ?? {}) };
}

function formatLabel(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, String(value)), template);
}

function initialValues(columns: RefSchemaColumn[], row: RefRow | null | undefined): FormValues {
  return columns.reduce<FormValues>((acc, column) => {
    if (column.columnCode === 'row_key') {
      acc[column.columnCode] = row?.rowKey ?? '';
      return acc;
    }

    const existing = row?.values?.[column.columnCode];
    if (existing !== undefined) {
      acc[column.columnCode] = existing;
      return acc;
    }

    if (column.type === 'boolean') acc[column.columnCode] = true;
    else if (column.type === 'number') acc[column.columnCode] = '';
    else acc[column.columnCode] = '';
    return acc;
  }, {});
}

function validationError(column: RefSchemaColumn, value: FieldValue, labels: RefRowEditModalLabels) {
  const stringValue = String(value ?? '');

  if (column.columnCode === 'row_key') {
    if (stringValue.length > 0 && !ROW_KEY_PATTERN.test(stringValue)) {
      return labels.rowKeyInvalid;
    }
    if (column.required && !ROW_KEY_PATTERN.test(stringValue)) return labels.rowKeyRequired;
    return null;
  }

  if (column.required && stringValue.trim().length < 2) {
    return column.columnCode === 'name_en' ? labels.minChars : `${column.label} is required`;
  }

  return null;
}

function formErrors(columns: RefSchemaColumn[], values: FormValues, labels: RefRowEditModalLabels): FieldErrors {
  return columns.reduce<FieldErrors>((acc, column) => {
    acc[column.columnCode] = validationError(column, values[column.columnCode], labels);
    return acc;
  }, {});
}

function isValid(columns: RefSchemaColumn[], values: FormValues, labels: RefRowEditModalLabels) {
  return columns.length > 0 && Object.values(formErrors(columns, values, labels)).every((error) => !error);
}

function valueForInput(value: FieldValue) {
  return value === null || value === undefined ? '' : String(value);
}

function coerceValue(column: RefSchemaColumn, value: FieldValue): FieldValue {
  if (column.type === 'boolean') return Boolean(value);
  if (column.type === 'number') {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return value === undefined ? '' : value;
}

function ModalField({
  column,
  value,
  error,
  row,
  disabled,
  labels,
  onChange,
  inputRef,
}: {
  column: RefSchemaColumn;
  value: FieldValue;
  error: string | null;
  row?: RefRow | null;
  disabled?: boolean;
  labels: RefRowEditModalLabels;
  onChange: (value: FieldValue) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const fieldId = `sm-11-${column.columnCode.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const describedBy = error ? errorId : column.help ? helpId : undefined;
  const isReadOnly = Boolean(row && column.readOnlyWhenEditing);

  return (
    <div data-testid={`ref-row-field-${column.columnCode}`} style={{ marginBottom: 12 }}>
      <label id={`${fieldId}-label`} htmlFor={fieldId} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {column.label} {column.required ? <span aria-hidden="true">*</span> : null}
      </label>

      {column.type === 'boolean' ? (
        <Switch
          id={fieldId}
          aria-label={column.label}
          aria-describedby={describedBy}
          checked={Boolean(value)}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      ) : column.type === 'enum' ? (
        <Select
          value={valueForInput(value)}
          onValueChange={onChange}
          options={column.options ?? []}
          disabled={disabled}
          aria-labelledby={`${fieldId}-label`}
        >
          <SelectTrigger aria-label={column.label}>
            <SelectValue placeholder={labels.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {(column.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          ref={inputRef}
          id={fieldId}
          type={column.type === 'number' ? 'number' : 'text'}
          value={valueForInput(value)}
          readOnly={isReadOnly}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={column.label}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          autoFocus={column.columnCode === 'row_key'}
          className={column.columnCode === 'row_key' ? 'mono' : undefined}
          style={isReadOnly ? { background: 'var(--gray-100)' } : undefined}
        />
      )}

      {error ? (
        <div id={errorId} role="alert" style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>
          {error}
        </div>
      ) : column.help ? (
        <div id={helpId} style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
          {column.help}
        </div>
      ) : null}
    </div>
  );
}

export function RefRowEditModal({
  open,
  tableCode,
  tableLabel: _tableLabel,
  row = null,
  columns,
  labels: labelOverrides,
  loading = false,
  error = null,
  upsertReferenceRow,
  onOpenChange,
  onSaved,
}: RefRowEditModalProps) {
  const titleId = 'sm-11-ref-row-edit-title';
  const subtitleId = 'sm-11-ref-row-edit-subtitle';
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const firstInputRef = React.useRef<HTMLInputElement | null>(null);
  const [values, setValues] = React.useState<FormValues>(() => initialValues(columns, row));
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setValues(initialValues(columns, row));
    setSubmitError(null);
    setSubmitting(false);
  }, [columns, open, row]);

  React.useLayoutEffect(() => {
    if (!open) return undefined;

    const beforeGuard = document.createElement('span');
    const afterGuard = document.createElement('span');
    beforeGuard.setAttribute('data-radix-focus-guard', '');
    afterGuard.setAttribute('data-radix-focus-guard', '');
    document.body.prepend(beforeGuard);
    document.body.append(afterGuard);
    firstInputRef.current?.focus();

    return () => {
      beforeGuard.remove();
      afterGuard.remove();
    };
  }, [open]);

  const labels = React.useMemo(() => withDefaultLabels(labelOverrides), [labelOverrides]);
  const errors = React.useMemo(() => formErrors(columns, values, labels), [columns, labels, values]);
  const canSave = isValid(columns, values, labels) && !loading && !error && !submitting;
  const title = row ? formatLabel(labels.editTitle, { rowKey: row.rowKey }) : labels.title;
  const subtitle = formatLabel(labels.referenceTable, { tableCode });

  function updateValue(columnCode: string, value: FieldValue) {
    setValues((current) => ({ ...current, [columnCode]: value }));
    setSubmitError(null);
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    const rowKeyValue = String(values.row_key ?? row?.rowKey ?? '').trim();
    const payloadValues = columns.reduce<Record<string, FieldValue>>((acc, column) => {
      if (column.columnCode !== 'row_key') {
        acc[column.columnCode] = coerceValue(column, values[column.columnCode]);
      }
      return acc;
    }, {});

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await upsertReferenceRow({ tableCode, rowKey: rowKeyValue, values: payloadValues });
      if (result.ok) {
        onSaved({ tableCode: result.tableCode, rowKey: result.rowKey, revalidatedPath: result.revalidatedPath });
        onOpenChange(false);
        return;
      }
      setSubmitError('error' in result ? result.error : labels.saveFailed);
    } catch {
      setSubmitError(labels.saveFailed);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((node) => !node.hasAttribute('aria-hidden'));

    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    open ? (
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        data-focus-trap="radix-dialog"
        data-modal-id="SM-11"
        data-size="default"
        data-testid="ref-row-edit-modal"
        onKeyDown={handleDialogKeyDown}
        style={{ maxWidth: 'var(--modal-size-default-width)' }}
      >
      <form onSubmit={handleSave} noValidate>
        <div data-testid="modal-header">
          <h2 id={titleId} style={{ margin: 0 }}>
            {title}
          </h2>
          <p id={subtitleId} style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 12px' }}>
            {subtitle}
          </p>
        </div>

        <div data-testid="modal-body">
          {loading ? (
            <div role="status" aria-label={labels.loadingLabel} style={{ padding: 20, textAlign: 'center' }}>
              {labels.loading}
            </div>
          ) : error ? (
            <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>
              {error}
            </div>
          ) : columns.length === 0 ? (
            <div role="alert" style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>
              {formatLabel(labels.noSchema, { tableCode })}
            </div>
          ) : (
            columns.map((column) => (
              <ModalField
                key={column.columnCode}
                column={column}
                value={values[column.columnCode]}
                error={errors[column.columnCode]}
                row={row}
                disabled={submitting}
                labels={labels}
                onChange={(nextValue) => updateValue(column.columnCode, nextValue)}
                inputRef={column.columnCode === 'row_key' ? firstInputRef : undefined}
              />
            ))
          )}

          {submitError ? (
            <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>
              {submitError}
            </div>
          ) : null}
        </div>

        <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button type="button" className="btn-secondary btn-sm" disabled={submitting} onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button type="submit" className="btn-primary btn-sm" disabled={!canSave}>
            {submitting ? labels.saving : labels.save}
          </Button>
        </div>
      </form>
      </div>
    ) : null
  );
}

export default RefRowEditModal;
