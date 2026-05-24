import React from 'react';
import { getTranslations } from 'next-intl/server';

import { getTenantVariations } from '../../../../../../../actions/tenant/get';
import { setDepartmentOverride } from '../../../../../../../actions/tenant/set-dept';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';

export const dynamic = 'force-dynamic';

type Department = {
  code: string;
  name: string;
  assignedColumnCount: number;
  order: number;
  provenance: 'baseline' | 'tenant_variations.dept_overrides';
};

type SourceColumn = {
  code: string;
  label: string;
  departmentCode: string;
};

type DeptOverridePayload =
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

type DeptSubmitResult =
  | { ok: true; data: { storage?: string; deptOverrides?: unknown } }
  | { ok: false; error: string; message?: string };

type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type DeptTaxonomyLabels = {
  title: string;
  subtitle: string;
  warning: string;
  currentDeptList: string;
  addCustomDept: string;
  operations: string;
  sourceDept: string;
  splitOption: string;
  mergeOption: string;
  addOption: string;
  targetDept1Name: string;
  targetDept1Code: string;
  targetDept2Name: string;
  targetDept2Code: string;
  columnMapping: string;
  saveChanges: string;
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
};

type DeptTaxonomyPageProps = {
  params?: Promise<{ locale: string }>;
  departments?: Department[];
  sourceColumns?: SourceColumn[];
  selectedDeptCode?: string;
  canEdit?: boolean;
  state?: PageState;
  submitDeptOverride?: (payload: DeptOverridePayload) => Promise<DeptSubmitResult>;
};

const DEFAULT_LABELS: DeptTaxonomyLabels = {
  title: 'Department Taxonomy',
  subtitle: 'Customize department structure for your organization. Changes affect column ownership and rule routing.',
  warning: 'Dept changes affect how columns and rules are grouped. Review the impact before saving.',
  currentDeptList: 'Current dept list',
  addCustomDept: '+ Add Custom Dept',
  operations: 'Operations',
  sourceDept: 'Source dept',
  splitOption: 'Split technical into two departments',
  mergeOption: 'Merge selected depts into one',
  addOption: 'Add new department',
  targetDept1Name: 'Target Dept 1 name',
  targetDept1Code: 'Target Dept 1 code',
  targetDept2Name: 'Target Dept 2 name',
  targetDept2Code: 'Target Dept 2 code',
  columnMapping: 'Column mapping',
  saveChanges: 'Save Changes',
  discard: 'Discard',
  code: 'Code',
  namePl: 'Name PL',
  nameEn: 'Name EN',
  displayOrder: 'Display Order',
  loading: 'Loading department taxonomy…',
  empty: 'No departments are configured for this workspace.',
  error: 'Unable to load department taxonomy.',
  permissionDenied: 'You do not have permission to edit tenant department taxonomy.',
  confirmationTitle: 'Confirm department change',
  confirmationBody: 'Saved to tenant_variations.dept_overrides for this organization.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof DeptTaxonomyLabels>;

// Baseline Apex department taxonomy from SET-061; live tenant variations are merged over it at render time.
const BASELINE_DEPARTMENTS: Department[] = [
  { code: 'core', name: 'Core', assignedColumnCount: 12, order: 10, provenance: 'baseline' },
  { code: 'technical', name: 'Technical', assignedColumnCount: 3, order: 20, provenance: 'baseline' },
  { code: 'packaging', name: 'Packaging', assignedColumnCount: 5, order: 30, provenance: 'baseline' },
  { code: 'mrp', name: 'MRP', assignedColumnCount: 8, order: 40, provenance: 'baseline' },
  { code: 'planning', name: 'Planning', assignedColumnCount: 9, order: 50, provenance: 'baseline' },
  { code: 'production', name: 'Production', assignedColumnCount: 14, order: 60, provenance: 'baseline' },
  { code: 'price', name: 'Price', assignedColumnCount: 2, order: 70, provenance: 'baseline' },
];

// Project-shaped fallback source columns until the schema metadata loader supplies live owner_department rows.
const DEFAULT_SOURCE_COLUMNS: SourceColumn[] = [
  { code: 'tech.allergen_statement', label: 'Allergen statement', departmentCode: 'technical' },
  { code: 'tech.lab_release_rule', label: 'Lab release rule', departmentCode: 'technical' },
  { code: 'tech.food_safety_owner', label: 'Food safety owner', departmentCode: 'technical' },
];

async function buildLabels(locale: string): Promise<DeptTaxonomyLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.dept_taxonomy' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as DeptTaxonomyLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function loadDefaultDepartments(): Promise<{ departments: Department[]; state: PageState }> {
  const result = await getTenantVariations();
  if (!result.ok) return { departments: BASELINE_DEPARTMENTS, state: result.error === 'forbidden' ? 'permission_denied' : 'error' };
  return { departments: mergeTenantDeptOverrides(BASELINE_DEPARTMENTS, result.data.deptOverrides), state: 'ready' };
}

function mergeTenantDeptOverrides(base: Department[], deptOverrides: unknown): Department[] {
  const merged = [...base];
  const addActions = readAddActions(deptOverrides);
  for (const action of addActions) {
    if (merged.some((dept) => dept.code === action.code)) continue;
    merged.push({
      code: action.code,
      name: action.label ?? titleizeCode(action.code),
      assignedColumnCount: 0,
      order: 80 + merged.length,
      provenance: 'tenant_variations.dept_overrides',
    });
  }
  return merged.sort((a, b) => a.order - b.order);
}

function readAddActions(value: unknown): Array<{ code: string; label?: string }> {
  if (!value || typeof value !== 'object') return [];
  const actions = (value as { actions?: unknown }).actions;
  if (!actions || typeof actions !== 'object') return [];
  const add = (actions as { add?: unknown }).add;
  if (!add || typeof add !== 'object') return [];
  return Object.values(add as Record<string, unknown>).flatMap((entry): Array<{ code: string; label?: string }> => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as { code?: unknown; label?: unknown };
    if (typeof row.code !== 'string') return [];
    const label = typeof row.label === 'string' ? row.label : undefined;
    return label ? [{ code: row.code, label }] : [{ code: row.code }];
  });
}

function titleizeCode(code: string): string {
  return code
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function defaultSubmitDeptOverride(payload: DeptOverridePayload): Promise<DeptSubmitResult> {
  const result =
    payload.action === 'add'
      ? await setDepartmentOverride({
          action: 'add',
          newDepartmentCode: payload.code,
          label: payload.nameEn,
          auditReason: `SET-061 add department ${payload.code}`,
        })
      : payload.action === 'merge'
        ? await setDepartmentOverride({
            action: 'merge',
            sourceDepartmentCodes: payload.sources,
            targetDepartmentCode: payload.target,
            auditReason: `SET-061 merge departments into ${payload.target}`,
          })
        : await setDepartmentOverride({
            action: 'split',
            departmentCode: payload.source,
            targetDepartmentCodes: payload.targets,
            auditReason: `SET-061 split department ${payload.source}`,
          });

  if (!result.ok) return result;
  return { ok: true, data: { storage: 'tenant_variations.dept_overrides', deptOverrides: result.data.deptOverrides } };
}

export default async function DeptTaxonomyPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as DeptTaxonomyPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const loaded = props.departments ? { departments: props.departments, state: props.state ?? 'ready' } : await loadDefaultDepartments();

  return (
    <DeptTaxonomyScreen
      labels={labels}
      departments={loaded.departments}
      sourceColumns={props.sourceColumns ?? DEFAULT_SOURCE_COLUMNS}
      selectedDeptCode={props.selectedDeptCode ?? 'technical'}
      canEdit={props.canEdit ?? loaded.state !== 'permission_denied'}
      state={props.state ?? loaded.state}
      submitDeptOverride={props.submitDeptOverride ?? defaultSubmitDeptOverride}
    />
  );
}

function DeptTaxonomyScreen({
  labels,
  departments,
  sourceColumns,
  selectedDeptCode,
  canEdit,
  state,
  submitDeptOverride,
}: {
  labels: DeptTaxonomyLabels;
  departments: Department[];
  sourceColumns: SourceColumn[];
  selectedDeptCode: string;
  canEdit: boolean;
  state: PageState;
  submitDeptOverride: (payload: DeptOverridePayload) => Promise<DeptSubmitResult>;
}) {
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
    const result = await submitDeptOverride(payload);
    setIsPending(false);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }
    setConfirmation(result.data.storage ?? 'tenant_variations.dept_overrides');
  }

  return (
    <main data-screen="dept-taxonomy" className="space-y-6">
      <header data-region="page-head" className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Settings / Tenant config</div>
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
              <p className="text-xs text-muted-foreground">Baseline departments plus tenant_variations.dept_overrides.</p>
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
                  <div className="text-xs text-muted-foreground">{dept.assignedColumnCount} assigned columns</div>
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
              <legend className="sr-only">Operation type</legend>
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
            {operation === 'merge' ? <MergeFields departments={departments} /> : null}
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
                {isPending ? 'Saving…' : labels.saveChanges}
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
              <option value="">Choose target dept</option>
              <option value={targetOneCode}>{targetOneCode}</option>
              <option value={targetTwoCode}>{targetTwoCode}</option>
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

function MergeFields({ departments }: { departments: Department[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1 text-sm font-medium">
        <span>Source depts</span>
        <select name="mergeSources" multiple className="min-h-24 w-full rounded-md border px-3 py-2 text-sm">
          {departments.map((dept) => (
            <option key={dept.code} value={dept.code}>
              {dept.code}
            </option>
          ))}
        </select>
      </label>
      <TextField label="Target dept name" name="mergeTargetName" defaultValue="Technical Operations" />
      <TextField label="Target dept code" name="mergeTargetCode" defaultValue="technical" />
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
