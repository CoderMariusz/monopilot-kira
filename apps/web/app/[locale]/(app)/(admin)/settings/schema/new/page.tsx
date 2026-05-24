import React from 'react';
import { getTranslations } from 'next-intl/server';

import { getTenantVariations } from '../../../../../../../actions/tenant/get';
import { addColumn } from '../../../../../../../actions/schema/add-column';
import { editColumn } from '../../../../../../../actions/schema/edit-column';

export const dynamic = 'force-dynamic';

type PageSearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<PageSearchParams>;
};

type DeptOption = { code: string; label: string; provenance: 'baseline' | 'tenant_variations.dept_overrides' };
type WizardLabels = Record<keyof typeof DEFAULT_LABELS, string>;
type WizardState = {
  table: string;
  dept: string;
  type: string;
  validation: string[];
  blocking: string;
  doneRequired: boolean;
  presentationSection: string;
  presentationOrder: number;
  scope: 'org' | 'universal';
  columnCode: string;
  expectedSchemaVersion?: number;
  mode: 'add' | 'edit';
};
type ConflictDiff = { field?: unknown; before?: unknown; after?: unknown };
type ConflictState = { body: string; diff?: ConflictDiff } | null;

type ActionResult =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error?: string; data?: { diff?: ConflictDiff } & Record<string, unknown> };

const DEFAULT_LABELS = {
  title: 'Column Edit Wizard',
  subtitle: 'Add or edit a schema column for L2/L3 scope.',
  step1: 'Pick Table',
  step2: 'Pick Department',
  step3: 'Pick Data Type',
  step4: 'Validation Rules',
  step5: 'Blocking Rule',
  step6: 'Required for Done',
  step7: 'Presentation',
  step8: 'Preview & Save',
  tableQuestion: 'Which table does this column belong to?',
  deptQuestion: 'Which department owns this column?',
  dataTypeQuestion: 'What type of data does this column hold?',
  validationQuestion: 'Set validation rules for this column.',
  blockingQuestion: 'When is this column required to be filled?',
  doneQuestion: "Is this column required before marking the product/WO as 'Done'?",
  presentationQuestion: 'How should this column appear in the UI?',
  reviewQuestion: 'Review your column definition.',
  next: 'Next',
  back: 'Back',
  publishColumn: 'Publish Column',
  saveDraft: 'Save as Draft',
  requestL1Promotion: 'Request L1 Promotion',
  reloadLatest: 'Reload latest',
  concurrentEditTitle: 'Concurrent edit detected',
  concurrentEditBody: 'Another admin published a newer version while you were editing. Review the diff and republish.',
  provenance: 'tenant_variations.dept_overrides',
} as const;

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof typeof DEFAULT_LABELS>;
const TABLE_OPTIONS = [
  'main_table',
  'bom',
  'reference.pack_sizes',
  'reference.templates',
  'reference.processes',
  'reference.allergens_reference',
  'reference.alert_thresholds',
  'reference.d365_constants',
  'reference.email_config',
  'reference.dieset_by_line_pack',
  'reference.lines_by_pack_size',
  'reference.close_confirm',
];
const BASELINE_DEPTS: DeptOption[] = [
  { code: 'core', label: 'Core', provenance: 'baseline' },
  { code: 'technical', label: 'Technical', provenance: 'baseline' },
  { code: 'packaging', label: 'Packaging', provenance: 'baseline' },
  { code: 'mrp', label: 'MRP', provenance: 'baseline' },
  { code: 'planning', label: 'Planning', provenance: 'baseline' },
  { code: 'production', label: 'Production', provenance: 'baseline' },
  { code: 'price', label: 'Price', provenance: 'baseline' },
];
const STEPS = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7', 'step8'] as const;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined): number | undefined {
  const parsed = Number(one(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function buildLabels(locale: string): Promise<WizardLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.schema_column_wizard' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as WizardLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function loadDeptOptions(): Promise<DeptOption[]> {
  try {
    const result = await getTenantVariations();
    if (!result?.ok) return BASELINE_DEPTS;
    return mergeTenantDeptOverrides(BASELINE_DEPTS, result.data?.deptOverrides);
  } catch {
    return BASELINE_DEPTS;
  }
}

function mergeTenantDeptOverrides(base: DeptOption[], deptOverrides: unknown): DeptOption[] {
  const merged = [...base];
  const actions = readAddActions(deptOverrides);
  for (const action of actions) {
    if (merged.some((dept) => dept.code === action.code)) continue;
    merged.push({ code: action.code, label: action.label ?? titleizeCode(action.code), provenance: 'tenant_variations.dept_overrides' });
  }
  return merged;
}

function readAddActions(value: unknown): Array<{ code: string; label?: string }> {
  if (!value || typeof value !== 'object') return [];
  const actions = (value as { actions?: unknown }).actions;
  if (!actions || typeof actions !== 'object') return [];
  const add = (actions as { add?: unknown }).add;
  if (!add || typeof add !== 'object') return [];
  return Object.entries(add as Record<string, unknown>).flatMap(([key, entry]) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as { code?: unknown; label?: unknown; nameEn?: unknown; name?: unknown };
    const code = typeof row.code === 'string' ? row.code : key;
    const label = [row.label, row.nameEn, row.name].find((item): item is string => typeof item === 'string');
    return [{ code, label }];
  });
}

function titleizeCode(code: string): string {
  return code
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export default async function SchemaColumnWizardPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as PageProps;
  const { locale = 'en' } = props.params ? await props.params : { locale: 'en' };
  const searchParams = props.searchParams ? await props.searchParams : {};
  const labels = await buildLabels(locale);
  const deptOptions = await loadDeptOptions();
  const initialStep = Math.min(Math.max(numberParam(searchParams.step) ?? 1, 1), 8);
  const initialState: WizardState = {
    table: one(searchParams.table) ?? '',
    dept: '',
    type: 'text',
    validation: [],
    blocking: 'none',
    doneRequired: false,
    presentationSection: 'Packaging Details',
    presentationOrder: 10,
    scope: 'org',
    columnCode: one(searchParams.column) ?? 'pack_finish',
    expectedSchemaVersion: numberParam(searchParams.expectedSchemaVersion),
    mode: one(searchParams.mode) === 'edit' ? 'edit' : 'add',
  };

  return (
    <div data-testid="app-shell" className="app-shell schema-column-wizard-shell">
      <aside data-testid="app-sidebar" aria-label="App sidebar" className="app-sidebar">
        Settings
      </aside>
      <div className="app-shell__body">
        <header data-testid="app-topbar" className="app-topbar">
          Schema Admin
        </header>
        <main aria-labelledby="schema-column-wizard-title" className="settings-page settings-page--schema-column-wizard">
          <SchemaColumnWizard labels={labels} deptOptions={deptOptions} initialStep={initialStep} initialState={initialState} />
        </main>
      </div>
    </div>
  );
}

class SchemaColumnWizard extends React.Component<
  { labels: WizardLabels; deptOptions: DeptOption[]; initialStep: number; initialState: WizardState },
  { step: number; wizard: WizardState; errors: Record<string, string>; conflict: ConflictState; toast: string | null; pending: boolean }
> {
  constructor(props: { labels: WizardLabels; deptOptions: DeptOption[]; initialStep: number; initialState: WizardState }) {
    super(props);
    this.state = { step: props.initialStep, wizard: props.initialState, errors: {}, conflict: null, toast: null, pending: false };
  }

  setWizard(patch: Partial<WizardState>) {
    this.setState((state) => ({ wizard: { ...state.wizard, ...patch } }));
  }

  next = () => {
    const errors: Record<string, string> = {};
    if (this.state.step === 1 && !this.state.wizard.table) errors.table = 'Pick a table to continue.';
    if (this.state.step === 2 && this.state.wizard.table === 'main_table' && !this.state.wizard.dept) {
      errors.dept = 'Pick the owning department.';
    }
    if (Object.keys(errors).length) {
      this.setState({ errors });
      return;
    }
    const nextStep = this.state.step === 1 && this.state.wizard.table !== 'main_table' ? 3 : Math.min(8, this.state.step + 1);
    this.setState({ step: nextStep, errors: {} });
  };

  back = () => this.setState((state) => ({ step: Math.max(1, state.step - 1) }));

  publish = async () => {
    const input = this.actionInput();
    this.setState({ pending: true, conflict: null });
    const result = (this.state.wizard.mode === 'edit' ? await editColumn(input) : await addColumn(input)) as ActionResult;
    if (result.ok === false && result.error === 'CONCURRENT_EDIT') {
      this.setState({
        pending: false,
        conflict: { body: this.props.labels.concurrentEditBody, diff: result.data?.diff },
      });
      return;
    }
    this.setState({ pending: false, toast: 'Column published. Zod schema regenerating…' });
  };

  actionInput() {
    const { wizard } = this.state;
    return {
      tableCode: wizard.table || 'main_table',
      columnCode: wizard.columnCode || 'new_column',
      departmentCode: wizard.dept || undefined,
      dataType: wizard.type,
      validation: wizard.validation,
      blockingRule: wizard.blocking,
      requiredForDone: wizard.doneRequired,
      presentation: { section: wizard.presentationSection, order: wizard.presentationOrder },
      scope: wizard.scope,
      expectedSchemaVersion: wizard.expectedSchemaVersion,
    };
  }

  render() {
    const { labels } = this.props;
    return (
      <section data-testid="schema-column-wizard" className="schema-column-wizard" aria-describedby="schema-column-wizard-subtitle">
        <header data-region="page-head" className="schema-column-wizard__header">
          <div className="muted mono">Settings / Schema browser / Column wizard</div>
          <h1 id="schema-column-wizard-title">{labels.title}</h1>
          <p id="schema-column-wizard-subtitle">{labels.subtitle}</p>
          <button type="button" className="btn btn-secondary" onClick={() => this.setState({ toast: 'Saved as draft. No runtime effect.' })}>
            {labels.saveDraft}
          </button>
        </header>

        {this.state.toast ? <div className="alert alert-blue" role="status">{this.state.toast}</div> : null}

        <div className="schema-column-wizard__grid" style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 680px)', gap: 24 }}>
          <nav aria-label="Wizard step list" className="sg-section schema-column-wizard__rail">
            <ol aria-label="Schema column wizard steps">
              {STEPS.map((key, index) => (
                <li key={key} aria-current={this.state.step === index + 1 ? 'step' : undefined}>
                  <span aria-hidden="true">{this.state.step > index + 1 ? '✓' : index + 1}</span> {labels[key]}
                </li>
              ))}
            </ol>
          </nav>

          <section className="sg-section schema-column-wizard__card">
            <div className="schema-column-wizard__progress" aria-hidden="true">
              {STEPS.map((key, index) => <span key={key} className={this.state.step === index + 1 ? 'is-current' : ''}>{index + 1}</span>)}
            </div>
            {this.renderStep()}
            <footer className="sg-section-foot" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={this.back} disabled={this.state.step === 1}>{labels.back}</button>
              {this.state.step < 8 ? (
                <button type="button" className="btn btn-primary" onClick={this.next}>{labels.next}</button>
              ) : this.state.wizard.scope === 'universal' ? (
                <button type="button" className="btn btn-amber">{labels.requestL1Promotion}</button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={this.publish} disabled={this.state.pending}>
                  {labels.publishColumn}
                </button>
              )}
            </footer>
          </section>
        </div>
        {this.renderConflictDialog()}
      </section>
    );
  }

  renderStep() {
    const stepLabels = this.props.labels;
    switch (this.state.step) {
      case 2:
        return this.renderDeptStep();
      case 3:
        return <WizardRegion title={stepLabels.step3} question={stepLabels.dataTypeQuestion}>{['text', 'number', 'date', 'enum', 'formula', 'relation'].map((type) => <label key={type}><input type="radio" name="data-type" checked={this.state.wizard.type === type} onChange={() => this.setWizard({ type })} /> {type}</label>)}</WizardRegion>;
      case 4:
        return <WizardRegion title={stepLabels.step4} question={stepLabels.validationQuestion}><label><input type="checkbox" /> Required</label><label><input type="checkbox" /> Unique per org</label><label>Regex pattern <input type="text" aria-label="Regex pattern" /></label></WizardRegion>;
      case 5:
        return <WizardRegion title={stepLabels.step5} question={stepLabels.blockingQuestion}>{['none', 'core_done', 'pack_size_filled', 'line_filled', 'core_production_done'].map((rule) => <label key={rule}><input type="radio" name="blocking" checked={this.state.wizard.blocking === rule} onChange={() => this.setWizard({ blocking: rule })} /> {rule}</label>)}</WizardRegion>;
      case 6:
        return <WizardRegion title={stepLabels.step6} question={stepLabels.doneQuestion}><label><input type="checkbox" checked={this.state.wizard.doneRequired} onChange={(event) => this.setWizard({ doneRequired: event.currentTarget.checked })} /> When ON, this field appears in the Done checklist and blocks completion if empty.</label></WizardRegion>;
      case 7:
        return <WizardRegion title={stepLabels.step7} question={stepLabels.presentationQuestion}><label>Section label in form <input value={this.state.wizard.presentationSection} onChange={(event) => this.setWizard({ presentationSection: event.currentTarget.value })} /></label><label>Order within section <input type="number" value={this.state.wizard.presentationOrder} onChange={(event) => this.setWizard({ presentationOrder: Number(event.currentTarget.value) })} /></label></WizardRegion>;
      case 8:
        return <WizardRegion title={stepLabels.reviewQuestion} question={stepLabels.reviewQuestion}><div role="status" className="badge badge-green">L2</div><dl><dt>Table</dt><dd>{this.state.wizard.table || 'main_table'}</dd><dt>Column</dt><dd>{this.state.wizard.columnCode}</dd><dt>Department</dt><dd>{this.state.wizard.dept || 'Packaging'}</dd></dl></WizardRegion>;
      default:
        return this.renderTableStep();
    }
  }

  renderTableStep() {
    const { labels } = this.props;
    return (
      <WizardRegion title={labels.step1} question={labels.tableQuestion}>
        <label htmlFor="schema-column-table" className="field-label">{labels.tableQuestion}</label>
        <select
          id="schema-column-table"
          name="tableCode"
          value={this.state.wizard.table}
          onChange={(event) => this.setWizard({ table: event.currentTarget.value })}
        >
          <option value="">Select table…</option>
          {TABLE_OPTIONS.map((table) => <option key={table} value={table}>{table}</option>)}
        </select>
        {this.state.errors.table ? <p role="alert">{this.state.errors.table}</p> : null}
      </WizardRegion>
    );
  }

  renderDeptStep() {
    const { labels, deptOptions } = this.props;
    return (
      <WizardRegion title={labels.step2} question={labels.deptQuestion}>
        <div className="schema-column-wizard__dept-grid">
          {deptOptions.map((dept) => (
            <label key={dept.code} className="schema-column-wizard__dept-card">
              <input
                type="radio"
                name="departmentCode"
                value={dept.code}
                checked={this.state.wizard.dept === dept.code}
                onChange={() => this.setWizard({ dept: dept.code })}
              />
              {dept.label}
            </label>
          ))}
        </div>
        <p className="muted">{labels.provenance}</p>
        {this.state.errors.dept ? <p role="alert">{this.state.errors.dept}</p> : null}
      </WizardRegion>
    );
  }

  renderConflictDialog() {
    const conflict = this.state.conflict;
    if (!conflict) return null;
    const titleId = 'schema-column-conflict-title';
    const diff = conflict.diff ?? {};
    return (
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="schema-column-wizard__dialog">
        <h2 id={titleId}>{this.props.labels.concurrentEditTitle}</h2>
        <p>{conflict.body}</p>
        <dl>
          <dt>Field</dt><dd>{String(diff.field ?? 'schema')}</dd>
          <dt>Yours</dt><dd>{String(diff.before ?? 'draft')}</dd>
          <dt>Latest published</dt><dd>{String(diff.after ?? 'latest')}</dd>
        </dl>
        <button type="button" className="btn btn-primary" onClick={() => this.setState({ conflict: null })}>{this.props.labels.reloadLatest}</button>
      </div>
    );
  }
}

function WizardRegion({ title, question, children }: { title: string; question: string; children: React.ReactNode }) {
  return (
    <section role="region" aria-label={title} className="sg-section-body schema-column-wizard__step">
      <h2>{title === question ? question : title}</h2>
      {title !== question ? <p>{question}</p> : null}
      <div className="schema-column-wizard__fields">{children}</div>
    </section>
  );
}
