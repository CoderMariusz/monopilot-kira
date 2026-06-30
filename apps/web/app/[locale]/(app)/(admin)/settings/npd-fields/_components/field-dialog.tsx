'use client';

import React, { useState } from 'react';

import { SelectField, SettingField, SRow, Toggle } from '../../_components';
import { normalizeUiDataType, slugifyCode, type NpdFieldsScreenLabels, type UiDataType } from '../npd-fields-screen.client';
import { DialogShell } from './dialog-shell';

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

export function FieldDialog({
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
