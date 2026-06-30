'use client';

import React, { useState } from 'react';

import { SettingField } from '../../_components';
import { slugifyCode, type NpdFieldsScreenLabels } from '../npd-fields-screen.client';
import { DialogShell } from './dialog-shell';

type DepartmentDialogValues = { code: string; name: string; description: string };

export function DepartmentDialog({
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
