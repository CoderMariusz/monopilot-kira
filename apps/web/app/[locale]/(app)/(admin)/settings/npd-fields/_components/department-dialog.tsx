'use client';

import React, { useState } from 'react';

import { SelectField, SettingField } from '../../_components';
import { slugifyCode, type NpdFieldsScreenLabels } from '../npd-fields-screen.client';
import { DialogShell } from './dialog-shell';

type DepartmentDialogValues = { code: string; name: string; description: string; stage_code: string };

export function DepartmentDialog({
  mode,
  title,
  labels,
  stageOptions,
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
  stageOptions: Array<{ value: string; label: string }>;
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
  const [stageCode, setStageCode] = useState(initial?.stage_code ?? 'brief');
  const [codeTouched, setCodeTouched] = useState(mode === 'edit');

  const effectiveCode = mode === 'create' && !codeTouched ? slugifyCode(name) : code;
  const canSubmit = !pending && effectiveCode.trim().length > 0 && name.trim().length > 0 && stageCode.length > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      code: slugifyCode(effectiveCode),
      name: name.trim(),
      description: '',
      stage_code: stageCode,
    });
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
        <SelectField
          id={`${formTestId}-stage`}
          label={labels.departmentStage}
          options={stageOptions}
          value={stageCode}
          disabled={pending}
          onChange={setStageCode}
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
