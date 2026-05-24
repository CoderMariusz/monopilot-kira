'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';

export type Department = {
  code: string;
  name: string;
  assignedColumnCount: number;
  order: number;
  provenance: 'baseline' | 'tenant_variations.dept_overrides';
};

export type SourceColumn = {
  code: string;
  label: string;
  departmentCode: string;
};

export type DeptOverridePayload =
  | {
      action: 'split';
      source: string;
      targets: string[];
      columnMapping: Record<string, string>;
    }
  | {
      action: 'merge';
      sources: string[];
      target: string;
    }
  | {
      action: 'add';
      code: string;
      namePl: string;
      nameEn: string;
      displayOrder: number;
    };

export type DeptSubmitResult =
  | { ok: true; data: { storage?: string; deptOverrides?: unknown } }
  | { ok: false; error: string; message?: string };

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type DeptTaxonomyLabels = {
  title: string;
  subtitle: string;
  warning: string;
  currentDeptList: string;
  addCustomDept: string;
  operations: string;
  sourceDept: string;
  sourceDepts: string;
  splitOption: string;
  mergeOption: string;
  addOption: string;
  targetDept1Name: string;
  targetDept1Code: string;
  targetDept2Name: string;
  targetDept2Code: string;
  targetDeptName: string;
  targetDeptCode: string;
  columnMapping: string;
  saveChanges: string;
  saving: string;
  discard: string;
  code: string;
  namePl: string;
  nameEn: string;
  displayOrder: string;
  loading: string;
  empty: string;
  error: string;
  permissionDenied: string;
  confirmationTitle: string;
  confirmationBody: string;
  settingsBreadcrumb: string;
  deptListProvenance: string;
  assignedColumns: string;
  operationType: string;
  chooseTargetDept: string;
};

type DeptTaxonomyScreenProps = {
  labels: DeptTaxonomyLabels;
  departments: Department[];
  sourceColumns: SourceColumn[];
  selectedDeptCode: string;
  canEdit: boolean;
  state: PageState;
  submitDeptOverrideAction: (payload: DeptOverridePayload) => Promise<DeptSubmitResult>;
};

export default function DeptTaxonomyScreen({
  labels,
  departments,
  sourceColumns,
  selectedDeptCode,
  canEdit,
  state,
  submitDeptOverrideAction,
}: DeptTaxonomyScreenProps) {
  const [operation, setOperation] = React.useState<'split' | 'merge' | 'add'>('split');
  const [activeSourceDeptCode, setActiveSourceDeptCode] = React.useState(selectedDeptCode);
  const [targetOneCode, setTargetOneCode] = React.useState('food-safety');
  const [targetTwoCode, setTargetTwoCode] = React.useState('quality-lab');
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);
  const selectedDept = departments.find((dept) => dept.code === activeSourceDeptCode) ?? departments[0];
  const splitColumns = sourceColumns.filter((column) => column.departmentCode === (selectedDept?.code ?? activeSourceDeptCode));

  if (state === 'loading') return <StatusShell labels={labels} message={labels.loading} tone="info" />;
  if (state === 'error') return <StatusShell labels={labels} message={labels.error} tone="danger" />;
  if (state === 'permission_denied' || !canEdit) return <StatusShell labels={labels} message={labels.permissionDenied} tone="warning" />;
  if (state === 'empty' || departments.length === 0) return <StatusShell labels={labels} message={labels.empty} tone="muted" />;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    setConfirmation(null);
    const form = new FormData(event.currentTarget);

    if (operation === 'add') {
      const payload: DeptOverridePayload = {
        action: 'add',
        code: String(form.get('code') ?? '').trim(),
        namePl: String(form.get('namePl') ?? '').trim(),
        nameEn: String(form.get('nameEn') ?? '').trim(),
        displayOrder: Number(form.get('displayOrder') ?? 0),
      };
      await submitAndConfirm(payload);
      return;
    }

    if (operation === 'merge') {
      const payload: DeptOverridePayload = {
        action: 'merge',
        sources: form.getAll('mergeSources').map(String).filter(Boolean),
        target: String(form.get('mergeTargetCode') ?? '').trim(),
      };
      await submitAndConfirm(payload);
      return;
    }

    const targets = [String(form.get('targetDept1Code') ?? '').trim(), String(form.get('targetDept2Code') ?? '').trim()].filter(
      Boolean,
    );
    const columnMapping = Object.fromEntries(
      splitColumns
        .map((column) => [column.code, String(form.get(`columnMapping:${column.code}`) ?? '')])
        .filter(([, target]) => Boolean(target)),
    );

    if (targets.length !== 2 || new Set(targets).size !== 2 || Object.keys(columnMapping).length !== splitColumns.length) {
      setValidationError('COLUMN_MAPPING_REQUIRED — V-SET-30: column_mapping must cover all source columns.');
      return;
    }

    await submitAndConfirm({ action: 'split', source: String(form.get('sourceDept') ?? selectedDeptCode), targets, columnMapping });
  }

  async function submitAndConfirm(payload: DeptOverridePayload) {
    setIsPending(true);
    const result = await submitDeptOverrideAction(payload);
    setIsPending(false);
    if ('error' in result) {
      setValidationError(result.error);
      return;
    }
    setConfirmation(result.data.storage ?? 'tenant_variations.dept_overrides');
  }

  return (
    <main data-screen="dept-taxonomy" className="space-y-6">
      <header data-region="page-head" className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labels.settingsBreadcrumb}</div>
        <h1 className="text-2xl font-bold tracking-tight">{labels.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{labels.subtitle}</p>
      </header>

      <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {labels.warning}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,40%)_1fr]">
        <section aria-labelledby="dept-list-heading" className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="dept-list-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {labels.currentDeptList}
              </h2>
              <p className="text-xs text-muted-foreground">{labels.deptListProvenance}</p>
            </div>
            <Button type="button" className="btn-primary btn-sm" onClick={() => setOperation('add')}>
              {labels.addCustomDept}
            </Button>
          </div>

          <div className="space-y-2">
            {departments.map((dept) => (
              <div
                key={dept.code}
                data-testid="dept-row"
                className="flex items-center gap-3 rounded-md border bg-white px-3 py-2 text-sm"
              >
                <span aria-hidden="true" className="text-muted-foreground">⋮⋮</span>
                <Badge variant={dept.provenance === 'baseline' ? 'secondary' : 'success'} className="font-mono text-[11px]">
                  {dept.code}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{dept.name}</div>
                  <div className="text-xs text-muted-foreground">{formatAssignedColumns(labels.assignedColumns, dept.assignedColumnCount)}</div>
                </div>
                <Badge variant="muted" className="font-mono text-[10px]">{dept.provenance}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="operations-heading" className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 id="operations-heading" className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.operations}
          </h2>

          <form className="space-y-5" onSubmit={onSubmit}>
            <fieldset className="space-y-3">
              <legend className="sr-only">{labels.operationType}</legend>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="operation" value="split" checked={operation === 'split'} onChange={() => setOperation('split')} />
                {labels.splitOption.replace('technical', selectedDept?.code ?? selectedDeptCode)}
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="operation" value="merge" checked={operation === 'merge'} onChange={() => setOperation('merge')} />
                {labels.mergeOption}
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="operation" value="add" checked={operation === 'add'} onChange={() => setOperation('add')} />
                {labels.addOption}
              </label>
            </fieldset>

            {operation === 'split' ? (
              <SplitFields
                labels={labels}
                departments={departments}
                selectedDeptCode={selectedDept?.code ?? activeSourceDeptCode}
                columns={splitColumns}
                targetOneCode={targetOneCode}
                targetTwoCode={targetTwoCode}
                onSourceChange={setActiveSourceDeptCode}
                onTargetOneCodeChange={setTargetOneCode}
                onTargetTwoCodeChange={setTargetTwoCode}
              />
            ) : null}
            {operation === 'merge' ? <MergeFields labels={labels} departments={departments} /> : null}
            {operation === 'add' ? <AddFields labels={labels} /> : null}

            {validationError ? (
              <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                {validationError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" className="btn-secondary" onClick={() => setValidationError(null)}>
                {labels.discard}
              </Button>
              <Button type="submit" className="btn-primary" disabled={isPending}>
                {isPending ? labels.saving : labels.saveChanges}
              </Button>
            </div>
          </form>
        </section>
      </div>

      {confirmation ? (
        <div role="dialog" aria-modal="true" aria-label={labels.confirmationTitle} className="rounded-lg border bg-white p-4 shadow-lg">
          <h2 className="text-lg font-semibold">{labels.confirmationTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{labels.confirmationBody}</p>
          <p className="mt-2 font-mono text-xs">{confirmation}</p>
        </div>
      ) : null}
    </main>
  );
}

function SplitFields({
  labels,
  departments,
  selectedDeptCode,
  columns,
  targetOneCode,
  targetTwoCode,
  onSourceChange,
  onTargetOneCodeChange,
  onTargetTwoCodeChange,
}: {
  labels: DeptTaxonomyLabels;
  departments: Department[];
  selectedDeptCode: string;
  columns: SourceColumn[];
  targetOneCode: string;
  targetTwoCode: string;
  onSourceChange: (code: string) => void;
  onTargetOneCodeChange: (code: string) => void;
  onTargetTwoCodeChange: (code: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1 text-sm font-medium">
        <span>{labels.sourceDept}</span>
        <select
          name="sourceDept"
          value={selectedDeptCode}
          onChange={(event) => onSourceChange(event.currentTarget.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          {departments.map((dept) => (
            <option key={dept.code} value={dept.code}>
              {dept.code}
            </option>
          ))}
        </select>
      </label>
      <div />
      <TextField label={labels.targetDept1Name} name="targetDept1Name" defaultValue="Food Safety" />
      <TextField label={labels.targetDept1Code} name="targetDept1Code" value={targetOneCode} onChange={onTargetOneCodeChange} />
      <TextField label={labels.targetDept2Name} name="targetDept2Name" defaultValue="Quality Lab" />
      <TextField label={labels.targetDept2Code} name="targetDept2Code" value={targetTwoCode} onChange={onTargetTwoCodeChange} />
      <div className="md:col-span-2 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labels.columnMapping}</div>
        {columns.map((column) => (
          <label key={column.code} className="grid gap-2 text-sm md:grid-cols-[1fr_220px] md:items-center">
            <span>{column.label}</span>
            <select
              aria-label={column.label}
              name={`columnMapping:${column.code}`}
              defaultValue=""
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">{labels.chooseTargetDept}</option>
              <option value={targetOneCode}>{targetOneCode}</option>
              <option value={targetTwoCode}>{targetTwoCode}</option>
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

function MergeFields({ labels, departments }: { labels: DeptTaxonomyLabels; departments: Department[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1 text-sm font-medium">
        <span>{labels.sourceDepts}</span>
        <select name="mergeSources" multiple className="min-h-24 w-full rounded-md border px-3 py-2 text-sm">
          {departments.map((dept) => (
            <option key={dept.code} value={dept.code}>
              {dept.code}
            </option>
          ))}
        </select>
      </label>
      <TextField label={labels.targetDeptName} name="mergeTargetName" defaultValue="Technical Operations" />
      <TextField label={labels.targetDeptCode} name="mergeTargetCode" defaultValue="technical" />
    </div>
  );
}

function AddFields({ labels }: { labels: DeptTaxonomyLabels }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label={labels.code} name="code" defaultValue="regulatory-affairs" />
      <TextField label={labels.namePl} name="namePl" defaultValue="Sprawy regulacyjne" />
      <TextField label={labels.nameEn} name="nameEn" defaultValue="Regulatory Affairs" />
      <label className="space-y-1 text-sm font-medium">
        <span>{labels.displayOrder}</span>
        <input name="displayOrder" type="number" defaultValue={80} className="w-full rounded-md border px-3 py-2 text-sm" />
      </label>
    </div>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  value,
  onChange,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange ? (event) => onChange(event.currentTarget.value) : undefined}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
    </label>
  );
}

function StatusShell({ labels, message, tone }: { labels: DeptTaxonomyLabels; message: string; tone: 'info' | 'danger' | 'warning' | 'muted' }) {
  return (
    <main data-screen="dept-taxonomy" className="space-y-4">
      <header data-region="page-head" className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{labels.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{labels.subtitle}</p>
      </header>
      <div role="alert" data-tone={tone} className="rounded-md border bg-card px-4 py-3 text-sm">
        {message}
      </div>
    </main>
  );
}

function formatAssignedColumns(template: string, count: number) {
  return template.replace('{count}', String(count));
}
