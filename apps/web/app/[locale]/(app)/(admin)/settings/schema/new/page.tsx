import React from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getTenantVariations } from '../../../../../../../actions/tenant/get';
import { addColumn } from '../../../../../../../actions/schema/add-column';
import { editColumn } from '../../../../../../../actions/schema/edit-column';
import { TypeCards, ValidationRules } from './wizard-steps.client';
import type { ValidationLabels } from './wizard-steps.client';

export const dynamic = 'force-dynamic';

// Reference-table codes for the Step 4 dropdown-source selector
// (parity: schema-wizard.jsx:38-44).
const REF_CODES = [
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
  'reference.tax_codes',
] as const;

type PageSearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<PageSearchParams>;
};

type DeptOption = { code: string; label: string; provenance: 'baseline' | 'tenant_variations.dept_overrides' };
type DeptLoadState =
  | { status: 'loaded'; options: DeptOption[] }
  | { status: 'empty'; options: DeptOption[] }
  | { status: 'error'; options: DeptOption[]; message: string }
  | { status: 'forbidden'; options: DeptOption[]; message: string };
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
  | { ok: false; error?: string; data?: { diff?: ConflictDiff; currentSchemaVersion?: number } & Record<string, unknown> };

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

type TypeCardLabels = {
  text: string; textDesc: string;
  number: string; numberDesc: string;
  date: string; dateDesc: string;
  enum: string; enumDesc: string;
  formula: string; formulaDesc: string;
  relation: string; relationDesc: string;
};

const TYPE_CARD_DEFAULTS: Record<string, [keyof TypeCardLabels, string]> = {
  typeText: ['text', 'Text'], typeTextDesc: ['textDesc', 'Free text, short or long'],
  typeNumber: ['number', 'Number'], typeNumberDesc: ['numberDesc', 'Integer or decimal, supports range validation'],
  typeDate: ['date', 'Date'], typeDateDesc: ['dateDesc', 'Date or date-time value'],
  typeEnum: ['enum', 'Enum'], typeEnumDesc: ['enumDesc', 'Fixed list of options (dropdown)'],
  typeFormula: ['formula', 'Formula'], typeFormulaDesc: ['formulaDesc', 'Calculated from other fields'],
  typeRelation: ['relation', 'Relation'], typeRelationDesc: ['relationDesc', 'Reference to another table row'],
};

const VALIDATION_DEFAULTS: Record<keyof ValidationLabels, string> = {
  valRequired: 'Required', valRequiredHint: 'Cannot be saved empty.',
  valUnique: 'Unique per org', valUniqueHint: 'No two rows in this org may share the same value.',
  valRegex: 'Regex pattern', valRegexHint: 'JavaScript-style regex. Test it below before publishing.',
  valRegexPlaceholder: 'Test string…',
  valRegexMatch: 'match', valRegexFail: 'fail', valRegexInvalid: 'invalid regex',
  valRange: 'Range (min / max)',
  valRangeAvailable: 'Available for number and date types.',
  valRangeUnavailable: 'Not available — choose a number or date type in step 3.',
  valRangeMin: 'min', valRangeMax: 'max', valRangeTo: 'to',
  valDropdown: 'Dropdown source', valDropdownHint: 'Bind values to a reference table.',
  valDropdownPlaceholder: '— Select a reference table —',
};

async function buildStepLabels(locale: string): Promise<{ types: TypeCardLabels; validation: ValidationLabels }> {
  let t: ((key: string) => string) | null = null;
  try {
    t = await getTranslations({ locale, namespace: 'settings.schema_column_wizard' });
  } catch {
    t = null;
  }
  const read = (key: string, fallback: string): string => {
    if (!t) return fallback;
    try {
      const value = t(key);
      return value && value !== key ? value : fallback;
    } catch {
      return fallback;
    }
  };
  const types = {} as TypeCardLabels;
  for (const [msgKey, [field, fallback]] of Object.entries(TYPE_CARD_DEFAULTS)) {
    types[field] = read(msgKey, fallback);
  }
  const validation = {} as ValidationLabels;
  for (const key of Object.keys(VALIDATION_DEFAULTS) as Array<keyof ValidationLabels>) {
    validation[key] = read(key, VALIDATION_DEFAULTS[key]);
  }
  return { types, validation };
}

async function loadDeptOptions(): Promise<DeptLoadState> {
  try {
    const result = await getTenantVariations();
    if (!result) {
      return {
        status: 'error',
        options: BASELINE_DEPTS,
        message: 'Could not load tenant department overrides. Baseline Apex departments are shown as a fallback.',
      };
    }
    if (!result.ok) {
      const error = 'error' in result ? result.error : undefined;
      if (error === 'forbidden') {
        return {
          status: 'forbidden',
          options: BASELINE_DEPTS,
          message: 'You do not have permission to load tenant department overrides. Baseline Apex departments are shown read-only.',
        };
      }
      return {
        status: 'error',
        options: BASELINE_DEPTS,
        message: 'Could not load tenant department overrides. Baseline Apex departments are shown as a fallback.',
      };
    }
    const options = mergeTenantDeptOverrides(BASELINE_DEPTS, result.data?.deptOverrides);
    return options.length > 0 ? { status: 'loaded', options } : { status: 'empty', options: BASELINE_DEPTS };
  } catch {
    return {
      status: 'error',
      options: BASELINE_DEPTS,
      message: 'Could not load tenant department overrides. Baseline Apex departments are shown as a fallback.',
    };
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

function wizardStateFromParams(searchParams: PageSearchParams): WizardState {
  return {
    table: one(searchParams.tableCode) ?? one(searchParams.table) ?? '',
    dept: one(searchParams.departmentCode) ?? one(searchParams.dept) ?? '',
    type: one(searchParams.dataType) ?? one(searchParams.type) ?? 'text',
    validation: [],
    blocking: one(searchParams.blockingRule) ?? one(searchParams.blocking) ?? 'none',
    doneRequired: one(searchParams.requiredForDone) === 'on' || one(searchParams.doneRequired) === 'true',
    presentationSection: one(searchParams.presentationSection) ?? 'Packaging Details',
    presentationOrder: numberParam(searchParams.presentationOrder) ?? 10,
    scope: one(searchParams.scope) === 'universal' ? 'universal' : 'org',
    columnCode: one(searchParams.columnCode) ?? one(searchParams.column) ?? 'pack_finish',
    expectedSchemaVersion: numberParam(searchParams.expectedSchemaVersion),
    mode: one(searchParams.mode) === 'edit' ? 'edit' : 'add',
  };
}

function stepFromParams(searchParams: PageSearchParams, wizard: WizardState): number {
  const requested = Math.min(Math.max(numberParam(searchParams.step) ?? 1, 1), 8);
  if (requested === 2 && wizard.table && wizard.table !== 'main_table') return 3;
  return requested;
}

function conflictFromParams(searchParams: PageSearchParams, labels: WizardLabels): ConflictState {
  if (one(searchParams.conflict) !== 'CONCURRENT_EDIT') return null;
  return {
    body: labels.concurrentEditBody,
    diff: {
      field: one(searchParams.diffField) ?? 'schema',
      before: one(searchParams.diffBefore) ?? 'draft',
      after: one(searchParams.diffAfter) ?? 'latest',
    },
  };
}

function urlForStep(locale: string, step: number, wizard: WizardState, extra: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();
  params.set('step', String(step));
  params.set('mode', wizard.mode);
  params.set('table', wizard.table || 'main_table');
  params.set('column', wizard.columnCode || 'new_column');
  if (wizard.dept) params.set('dept', wizard.dept);
  if (wizard.expectedSchemaVersion !== undefined) params.set('expectedSchemaVersion', String(wizard.expectedSchemaVersion));
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return `/${locale}/settings/schema/new?${params.toString()}`;
}

function actionInput(formData: FormData) {
  const presentationSection = stringFromForm(formData, 'presentationSection') || 'Packaging Details';
  const presentationOrder = Number(stringFromForm(formData, 'presentationOrder') || 10);
  return {
    tableCode: stringFromForm(formData, 'tableCode') || 'main_table',
    columnCode: stringFromForm(formData, 'columnCode') || 'new_column',
    departmentCode: stringFromForm(formData, 'departmentCode') || undefined,
    dataType: stringFromForm(formData, 'dataType') || 'text',
    validation: [],
    blockingRule: stringFromForm(formData, 'blockingRule') || 'none',
    requiredForDone: stringFromForm(formData, 'requiredForDone') === 'on',
    presentation: { section: presentationSection, order: Number.isFinite(presentationOrder) ? presentationOrder : 10 },
    scope: stringFromForm(formData, 'scope') === 'universal' ? 'universal' : 'org',
    expectedSchemaVersion: Number(stringFromForm(formData, 'expectedSchemaVersion')),
    mode: stringFromForm(formData, 'mode') === 'edit' ? 'edit' : 'add',
    locale: stringFromForm(formData, 'locale') || 'en',
  };
}

function stringFromForm(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function toActionPayload(input: ReturnType<typeof actionInput>) {
  if (input.mode === 'edit') {
    return {
      tableCode: input.tableCode,
      columnCode: input.columnCode,
      expectedSchemaVersion: input.expectedSchemaVersion,
      patch: {
        dataType: input.dataType,
        validationJson: { rules: input.validation, blockingRule: input.blockingRule, requiredForDone: input.requiredForDone },
        presentationJson: input.presentation,
      },
    };
  }
  return {
    tableCode: input.tableCode,
    columnCode: input.columnCode,
    scope: input.scope === 'universal' ? 'universal' : 'variation',
    dataType: input.dataType,
    validationJson: { rules: input.validation, blockingRule: input.blockingRule, requiredForDone: input.requiredForDone },
    presentationJson: input.presentation,
    expectedSchemaVersion: Number.isFinite(input.expectedSchemaVersion) ? input.expectedSchemaVersion : undefined,
  };
}

async function publishColumnAction(formData: FormData) {
  'use server';
  const input = actionInput(formData);
  const result = (input.mode === 'edit' ? await editColumn(toActionPayload(input)) : await addColumn(toActionPayload(input))) as ActionResult;
  const base = {
    mode: input.mode,
    table: input.tableCode,
    column: input.columnCode,
    expectedSchemaVersion: Number.isFinite(input.expectedSchemaVersion) ? input.expectedSchemaVersion : undefined,
  };
  if (result.ok === false && result.error === 'CONCURRENT_EDIT') {
    const diff = result.data?.diff ?? {};
    redirect(urlForStep(input.locale, 8, {
      table: input.tableCode,
      dept: input.departmentCode ?? '',
      type: input.dataType,
      validation: input.validation,
      blocking: input.blockingRule,
      doneRequired: input.requiredForDone,
      presentationSection: input.presentation.section,
      presentationOrder: input.presentation.order,
      scope: input.scope as WizardState['scope'],
      columnCode: input.columnCode,
      expectedSchemaVersion: input.expectedSchemaVersion,
      mode: input.mode as WizardState['mode'],
    }, {
      ...base,
      conflict: 'CONCURRENT_EDIT',
      diffField: String(diff.field ?? 'schema'),
      diffBefore: String(diff.before ?? 'draft'),
      diffAfter: String(diff.after ?? 'latest'),
    }));
  }
  if (result.ok === false) {
    redirect(urlForStep(input.locale, 8, {
      table: input.tableCode,
      dept: input.departmentCode ?? '',
      type: input.dataType,
      validation: input.validation,
      blocking: input.blockingRule,
      doneRequired: input.requiredForDone,
      presentationSection: input.presentation.section,
      presentationOrder: input.presentation.order,
      scope: input.scope as WizardState['scope'],
      columnCode: input.columnCode,
      expectedSchemaVersion: input.expectedSchemaVersion,
      mode: input.mode as WizardState['mode'],
    }, { ...base, actionError: result.error ?? 'PERSISTENCE_FAILED' }));
  }
  redirect(urlForStep(input.locale, 8, {
    table: input.tableCode,
    dept: input.departmentCode ?? '',
    type: input.dataType,
    validation: input.validation,
    blocking: input.blockingRule,
    doneRequired: input.requiredForDone,
    presentationSection: input.presentation.section,
    presentationOrder: input.presentation.order,
    scope: input.scope as WizardState['scope'],
    columnCode: input.columnCode,
    expectedSchemaVersion: input.expectedSchemaVersion,
    mode: input.mode as WizardState['mode'],
  }, { ...base, published: '1' }));
}

export default async function SchemaColumnWizardPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as PageProps;
  const { locale = 'en' } = props.params ? await props.params : { locale: 'en' };
  const searchParams = props.searchParams ? await props.searchParams : {};
  const labels = await buildLabels(locale);
  const stepLabels = await buildStepLabels(locale);
  const deptState = await loadDeptOptions();
  const wizard = wizardStateFromParams(searchParams);
  const step = stepFromParams(searchParams, wizard);
  const conflict = conflictFromParams(searchParams, labels);
  const viewState = one(searchParams.state);

  return (
    <section data-testid="schema-column-wizard" data-screen="schema-column-wizard" className="settings-page settings-page--schema-column-wizard" aria-describedby="schema-column-wizard-subtitle">
      <header data-region="page-head" className="schema-column-wizard__header">
        <div className="muted mono">Settings / Schema browser / Column wizard</div>
        <h1 id="schema-column-wizard-title">{labels.title}</h1>
        <p id="schema-column-wizard-subtitle">{labels.subtitle}</p>
        <form method="get" action={`/${locale}/settings/schema/new`}>
          <HiddenWizardFields locale={locale} wizard={wizard} step={step} />
          <input type="hidden" name="draft" value="1" />
          <button type="submit" className="btn btn-secondary">{labels.saveDraft}</button>
        </form>
      </header>

      <StateBanners labels={labels} deptState={deptState} conflict={conflict} actionError={one(searchParams.actionError)} published={one(searchParams.published) === '1'} />

      <div className="schema-column-wizard__grid" style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 680px)', gap: 24 }}>
        <nav aria-label="Wizard step list" className="sg-section schema-column-wizard__rail">
          <ol aria-label="Schema column wizard steps">
            {STEPS.map((key, index) => (
              <li key={key} aria-current={step === index + 1 ? 'step' : undefined}>
                <span aria-hidden="true">{step > index + 1 ? '✓' : index + 1}</span> {labels[key]}
              </li>
            ))}
          </ol>
        </nav>

        <section className="sg-section schema-column-wizard__card card" aria-busy={viewState === 'loading' ? 'true' : undefined}>
          <div className="wiz-stepper schema-column-wizard__progress" aria-hidden="true">
            {STEPS.map((key, index) => {
              const position = index + 1;
              const status = step === position ? 'current' : step > position ? 'done' : '';
              return (
                <React.Fragment key={key}>
                  {index > 0 ? <span className={`wiz-step-line ${step > index ? 'done' : ''}`} /> : null}
                  <span className={`wiz-step ${status}`}>
                    <span className="wiz-step-num">{step > position ? '✓' : position}</span>
                    {labels[key]}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
          {viewState === 'loading' ? <LoadingStepCard /> : <WizardStep locale={locale} labels={labels} stepLabels={stepLabels} deptState={deptState} step={step} wizard={wizard} />}
          <WizardFooter locale={locale} labels={labels} deptState={deptState} step={step} wizard={wizard} />
        </section>
      </div>
      <ConflictDialog labels={labels} locale={locale} wizard={wizard} conflict={conflict} />
    </section>
  );
}

function StateBanners({ labels, deptState, conflict, actionError, published }: { labels: WizardLabels; deptState: DeptLoadState; conflict: ConflictState; actionError?: string; published: boolean }) {
  return (
    <>
      {deptState.status === 'error' ? <div className="alert alert-red" role="alert">{deptState.message}</div> : null}
      {deptState.status === 'forbidden' ? <div className="alert alert-amber" role="alert">{deptState.message}</div> : null}
      {deptState.status === 'empty' ? <div className="alert alert-blue" role="status">No tenant department overrides found; showing the seven-dept Apex baseline.</div> : null}
      {published ? <div className="alert alert-blue" role="status">Column published. Zod schema regenerating…</div> : null}
      {actionError ? <div className="alert alert-red" role="alert">Could not publish column: {actionError}</div> : null}
      {conflict ? <div className="alert alert-amber" role="alert"><strong>{labels.concurrentEditTitle}.</strong> {conflict.body}</div> : null}
    </>
  );
}

function LoadingStepCard() {
  return (
    <section role="region" aria-label="Loading step data" className="sg-section-body schema-column-wizard__step">
      <div className="spinner" aria-hidden="true" />
      <p role="status">Loading step data…</p>
    </section>
  );
}

type StepLabels = { types: TypeCardLabels; validation: ValidationLabels };

function StepForm({ locale, wizard, nextStep, omit = [], children }: { locale: string; wizard: WizardState; nextStep: number; omit?: string[]; children: React.ReactNode }) {
  return (
    <form id="schema-column-wizard-step-form" method="get" action={`/${locale}/settings/schema/new`}>
      <HiddenWizardFields locale={locale} wizard={wizard} step={nextStep} omit={omit} />
      {children}
    </form>
  );
}

function WizardStep({ locale, labels, stepLabels, deptState, step, wizard }: { locale: string; labels: WizardLabels; stepLabels: StepLabels; deptState: DeptLoadState; step: number; wizard: WizardState }) {
  switch (step) {
    case 2:
      return <DeptStep locale={locale} labels={labels} deptState={deptState} wizard={wizard} />;
    case 3:
      return (
        <StepForm locale={locale} wizard={wizard} nextStep={4} omit={['dataType']}>
          <WizardRegion title={labels.step3} question={labels.dataTypeQuestion}>
            <TypeCards name="dataType" defaultValue={wizard.type} labels={stepLabels.types} />
          </WizardRegion>
        </StepForm>
      );
    case 4:
      return (
        <StepForm locale={locale} wizard={wizard} nextStep={5}>
          <WizardRegion title={labels.step4} question={labels.validationQuestion}>
            <ValidationRules dataType={wizard.type} refTables={[...REF_CODES]} labels={stepLabels.validation} />
          </WizardRegion>
        </StepForm>
      );
    case 5:
      return (
        <StepForm locale={locale} wizard={wizard} nextStep={6} omit={['blockingRule']}>
          <WizardRegion title={labels.step5} question={labels.blockingQuestion}>
            {['none', 'core_done', 'pack_size_filled', 'line_filled', 'core_production_done'].map((rule) => (
              <label key={rule}>
                <input type="radio" name="blockingRule" defaultChecked={wizard.blocking === rule} value={rule} /> {rule}
              </label>
            ))}
          </WizardRegion>
        </StepForm>
      );
    case 6:
      return (
        <StepForm locale={locale} wizard={wizard} nextStep={7} omit={['requiredForDone']}>
          <WizardRegion title={labels.step6} question={labels.doneQuestion}>
            <label>
              <input type="checkbox" name="requiredForDone" defaultChecked={wizard.doneRequired} /> When ON, this field appears in the Done checklist and blocks completion if empty.
            </label>
          </WizardRegion>
        </StepForm>
      );
    case 7:
      return (
        <StepForm locale={locale} wizard={wizard} nextStep={8} omit={['presentationSection', 'presentationOrder']}>
          <WizardRegion title={labels.step7} question={labels.presentationQuestion}>
            <div className="ff">
              <label>Section label in form</label>
              <input name="presentationSection" defaultValue={wizard.presentationSection} className="form-input" />
            </div>
            <div className="ff">
              <label>Order within section</label>
              <input name="presentationOrder" type="number" defaultValue={wizard.presentationOrder} className="form-input" />
            </div>
          </WizardRegion>
        </StepForm>
      );
    case 8:
      return <PreviewStep labels={labels} wizard={wizard} />;
    default:
      return <TableStep locale={locale} labels={labels} wizard={wizard} />;
  }
}

function TableStep({ locale, labels, wizard }: { locale: string; labels: WizardLabels; wizard: WizardState }) {
  return (
    <form id="schema-column-wizard-step-form" method="get" action={`/${locale}/settings/schema/new`}>
      <WizardRegion title={labels.step1} question={labels.tableQuestion}>
        <HiddenWizardFields locale={locale} wizard={wizard} step={2} omit={['table']} />
        <div className="ff">
          <label htmlFor="schema-column-table">{labels.tableQuestion}</label>
          <select id="schema-column-table" name="table" defaultValue={wizard.table} required className="form-input">
            <option value="">Select table…</option>
            {TABLE_OPTIONS.map((table) => <option key={table} value={table}>{table}</option>)}
          </select>
        </div>
      </WizardRegion>
    </form>
  );
}

function DeptStep({ locale, labels, deptState, wizard }: { locale: string; labels: WizardLabels; deptState: DeptLoadState; wizard: WizardState }) {
  return (
    <form id="schema-column-wizard-step-form" method="get" action={`/${locale}/settings/schema/new`}>
      <WizardRegion title={labels.step2} question={labels.deptQuestion}>
        <HiddenWizardFields locale={locale} wizard={wizard} step={3} omit={['dept']} />
        <div className="schema-column-wizard__dept-grid">
          {deptState.options.map((dept) => (
            <label key={dept.code} className="schema-column-wizard__dept-card">
              <input type="radio" name="dept" value={dept.code} defaultChecked={wizard.dept === dept.code} required={wizard.table === 'main_table'} />
              {dept.label}
            </label>
          ))}
        </div>
        <p className="muted">{labels.provenance}</p>
      </WizardRegion>
    </form>
  );
}

function PreviewStep({ labels, wizard }: { labels: WizardLabels; wizard: WizardState }) {
  return (
    <WizardRegion title={labels.reviewQuestion} question={labels.reviewQuestion}>
      <div role="status" className="badge badge-green">{wizard.scope === 'universal' ? 'L1' : 'L2'}</div>
      <div className="schema-column-wizard__sample-field">
        <label>{wizard.presentationSection}<input readOnly value="Sample value" /></label>
      </div>
      <dl>
        <dt>Table</dt><dd>{wizard.table || 'main_table'}</dd>
        <dt>Column</dt><dd>{wizard.columnCode}</dd>
        <dt>Department</dt><dd>{wizard.dept || 'Packaging'}</dd>
        <dt>Blocking</dt><dd>{wizard.blocking}</dd>
      </dl>
    </WizardRegion>
  );
}

function WizardFooter({ locale, labels, deptState, step, wizard }: { locale: string; labels: WizardLabels; deptState: DeptLoadState; step: number; wizard: WizardState }) {
  const backStep = Math.max(1, step - 1);
  const publishDisabled = deptState.status === 'forbidden';
  return (
    <footer className="sg-section-foot" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <a className="btn btn-ghost" aria-disabled={step === 1 ? 'true' : undefined} href={urlForStep(locale, backStep, wizard)}>{labels.back}</a>
      {step < 8 ? (
        <button type="submit" form="schema-column-wizard-step-form" className="btn btn-primary">{labels.next}</button>
      ) : wizard.scope === 'universal' ? (
        <button
          type="button"
          className="btn btn-amber"
          style={{ background: 'var(--amber)', borderColor: 'var(--amber)', color: '#fff' }}
        >
          {labels.requestL1Promotion}
        </button>
      ) : (
        <form action={publishColumnAction}>
          <HiddenWizardFields locale={locale} wizard={wizard} step={8} />
          <button type="submit" className="btn btn-primary" disabled={publishDisabled}>{labels.publishColumn}</button>
        </form>
      )}
    </footer>
  );
}

function ConflictDialog({ labels, locale, wizard, conflict }: { labels: WizardLabels; locale: string; wizard: WizardState; conflict: ConflictState }) {
  if (!conflict) return null;
  const titleId = 'schema-column-conflict-title';
  const diff = conflict.diff ?? {};
  return (
    <div className="modal-overlay schema-column-wizard__dialog-overlay">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-box schema-column-wizard__dialog">
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">{labels.concurrentEditTitle}</h2>
        </div>
        <div className="modal-body">
          <p>{conflict.body}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="muted">Field</dt><dd className="mono">{String(diff.field ?? 'schema')}</dd>
            <dt className="muted">Yours</dt><dd className="mono">{String(diff.before ?? 'draft')}</dd>
            <dt className="muted">Latest published</dt><dd className="mono">{String(diff.after ?? 'latest')}</dd>
          </dl>
        </div>
        <div className="modal-foot">
          <a className="btn btn-primary" href={urlForStep(locale, 8, wizard)}>{labels.reloadLatest}</a>
        </div>
      </div>
    </div>
  );
}

function HiddenWizardFields({ locale, wizard, step, omit = [] }: { locale: string; wizard: WizardState; step: number; omit?: string[] }) {
  const omitSet = new Set(omit);
  const hidden: Record<string, string | number | undefined> = {
    locale,
    step,
    mode: wizard.mode,
    table: wizard.table,
    tableCode: wizard.table,
    dept: wizard.dept,
    departmentCode: wizard.dept,
    dataType: wizard.type,
    blockingRule: wizard.blocking,
    presentationSection: wizard.presentationSection,
    presentationOrder: wizard.presentationOrder,
    scope: wizard.scope,
    column: wizard.columnCode,
    columnCode: wizard.columnCode,
    expectedSchemaVersion: wizard.expectedSchemaVersion,
  };
  return (
    <>
      {Object.entries(hidden).flatMap(([name, value]) => {
        if (omitSet.has(name) || value === undefined || value === '') return [];
        return <input key={name} type="hidden" name={name} value={value} />;
      })}
      {wizard.doneRequired ? <input type="hidden" name="requiredForDone" value="on" /> : null}
    </>
  );
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
