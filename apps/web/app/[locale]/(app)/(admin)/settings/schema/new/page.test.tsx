/**
 * @vitest-environment jsdom
 * T-097 / SET-031 — localized Schema Column Edit Wizard.
 *
 * RED phase: tests describe the spec-driven 8-step wizard required by
 * prototypes/design/02-SETTINGS-UX.md SET-031. A missing production page
 * renders an empty placeholder so RED fails on behavior assertions rather
 * than module-resolution noise.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTenantVariations: vi.fn(),
  addColumn: vi.fn(),
  editColumn: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => {
    const labels: Record<string, string> = {
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
      wizardStepList: 'Wizard step list',
      wizardSteps: 'Schema column wizard steps',
      loadingStepStatus: 'Loading step data...',
      deptLoadFallback: 'Could not load tenant department overrides. Baseline Apex departments are shown as a fallback.',
      deptLoadForbidden: 'You do not have permission to load tenant department overrides. Baseline Apex departments are shown read-only.',
      requestL1Promotion: 'Request L1 Promotion',
      reloadLatest: 'Reload latest',
      concurrentEditTitle: 'Concurrent edit detected',
      concurrentEditBody: 'Another admin published a newer version while you were editing. Review the diff and republish.',
      provenance: 'tenant_variations.dept_overrides',
      typeText: 'Text', typeTextDesc: 'Free text, short or long',
      typeNumber: 'Number', typeNumberDesc: 'Integer or decimal, supports range validation',
      typeDate: 'Date', typeDateDesc: 'Date or date-time value',
      typeEnum: 'Enum', typeEnumDesc: 'Fixed list of options (dropdown)',
      typeFormula: 'Formula', typeFormulaDesc: 'Calculated from other fields',
      typeRelation: 'Relation', typeRelationDesc: 'Reference to another table row',
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
    return labels[key] ?? key;
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('../../../../../../../actions/tenant/get', () => ({
  getTenantVariations: mocks.getTenantVariations,
}));

vi.mock('../../../../../../../actions/schema/add-column', () => ({
  addColumn: mocks.addColumn,
}));

vi.mock('../../../../../../../actions/schema/edit-column', () => ({
  editColumn: mocks.editColumn,
}));

type ColumnWizardPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
};

type ColumnWizardPage = (props: ColumnWizardPageProps) => React.ReactNode | Promise<React.ReactNode>;

const baselineDeptNames = ['Core', 'Technical', 'Packaging', 'MRP', 'Planning', 'Production', 'Price'];
const customDeptNames = ['Regulatory Affairs', 'Fermentation'];

async function loadColumnWizardPage(): Promise<ColumnWizardPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-031 Schema Column Edit Wizard page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as ColumnWizardPage;
  } catch (error) {
    if (isMissingPageModule(error)) {
      return function MissingColumnWizardPage() {
        return React.createElement('main', { 'data-testid': 'missing-schema-column-wizard-page' });
      };
    }
    throw error;
  }
}

function isMissingPageModule(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Cannot find module|Failed to resolve|does not exist|Unknown variable dynamic import/i.test(message);
}

async function renderColumnWizard(searchParams: Record<string, string | undefined> = {}) {
  const Page = await loadColumnWizardPage();
  const node = await Page({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(React.createElement(React.Fragment, null, node));
}

describe('SET-031 Schema Column Edit Wizard localized AppShell route', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.getTenantVariations.mockResolvedValue({
      ok: true,
      data: {
        deptOverrides: {
          actions: {
            add: {
              'regulatory-affairs': { action: 'add', code: 'regulatory-affairs', label: 'Regulatory Affairs' },
              fermentation: { action: 'add', code: 'fermentation', label: 'Fermentation' },
            },
          },
        },
        ruleVariantOverrides: {},
        featureFlags: { 'integrations.d365.enabled': true },
      },
    });
    mocks.addColumn.mockResolvedValue({ ok: true, data: { tableCode: 'main_table', columnCode: 'pack_finish', tier: 'L2' } });
    mocks.editColumn.mockResolvedValue({ ok: true, data: { tableCode: 'main_table', columnCode: 'pack_finish', schemaVersion: 8 } });
  });

  it('renders the SET-031 eight-step wizard body and relies on the real (app) AppShell layout instead of hardcoded shell stubs', async () => {
    const { container } = await renderColumnWizard();

    expect(screen.getByRole('heading', { name: /column edit wizard/i })).toBeInTheDocument();
    expect(screen.getByTestId('schema-column-wizard')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="app-shell"]')).toBeNull();
    expect(container.querySelector('[data-testid="app-sidebar"]')).toBeNull();
    expect(container.querySelector('[data-testid="app-topbar"]')).toBeNull();

    const layoutSource = readFileSync(`${process.cwd()}/app/[locale]/(app)/layout.tsx`, 'utf8');
    expect(layoutSource).toContain('data-testid="app-shell"');
    expect(layoutSource).toContain('<AppSidebar');
    expect(layoutSource).toContain('AppTopbar');

    const stepper = screen.getByRole('list', { name: /schema column wizard steps/i });
    for (const stepName of [
      'Pick Table',
      'Pick Department',
      'Pick Data Type',
      'Validation Rules',
      'Blocking Rule',
      'Required for Done',
      'Presentation',
      'Preview & Save',
    ]) {
      expect(within(stepper).getByText(new RegExp(stepName, 'i'))).toBeInTheDocument();
    }

    expect(screen.getByLabelText(/which table does this column belong to/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'main_table' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'bom' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'reference.pack_sizes' })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="promote-to-l2-modal"]')).toBeNull();
    expect(screen.queryByRole('dialog', { name: /promote to l2|request l1 schema promotion/i })).not.toBeInTheDocument();
  });

  it("uses tenant_variations.dept_overrides plus the seven-dept Apex baseline when table='main_table' renders step 2", async () => {
    await renderColumnWizard({ table: 'main_table', step: '2' });

    const deptStep = screen.getByRole('region', { name: /pick department/i });
    expect(within(deptStep).getByText(/which department owns this column/i)).toBeInTheDocument();
    for (const deptName of [...baselineDeptNames, ...customDeptNames]) {
      expect(within(deptStep).getByRole('radio', { name: new RegExp(deptName, 'i') })).toBeInTheDocument();
    }
    expect(within(deptStep).getByText(/tenant_variations\.dept_overrides/i)).toBeInTheDocument();
    expect(mocks.getTenantVariations).toHaveBeenCalledTimes(1);
  });

  it('shows a diff modal with Reload latest after the publish action redirects with CONCURRENT_EDIT details', async () => {
    await renderColumnWizard({
      mode: 'edit',
      table: 'main_table',
      column: 'pack_finish',
      step: '8',
      expectedSchemaVersion: '7',
      conflict: 'CONCURRENT_EDIT',
      diffField: 'presentation.section',
      diffBefore: 'Packaging Details',
      diffAfter: 'Quality Lab Details',
    });
    expect(screen.getByRole('heading', { name: /review your column definition/i })).toBeInTheDocument();

    const conflictDialog = await screen.findByRole('dialog', { name: /concurrent edit detected/i });
    expect(conflictDialog).toHaveTextContent(/another admin published a newer version/i);
    expect(conflictDialog).toHaveTextContent(/presentation\.section/i);
    expect(conflictDialog).toHaveTextContent(/Packaging Details/i);
    expect(conflictDialog).toHaveTextContent(/Quality Lab Details/i);
    expect(within(conflictDialog).getByRole('link', { name: /reload latest/i })).toBeInTheDocument();
  });

  it('surfaces loading, failed-load, and forbidden states instead of silently swallowing tenant variation failures', async () => {
    await renderColumnWizard({ state: 'loading' });
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/loading step data/i);
    cleanup();

    mocks.getTenantVariations.mockResolvedValueOnce({ ok: false, error: 'persistence_failed' });
    await renderColumnWizard({ table: 'main_table', step: '2' });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load tenant department overrides/i);
    expect(screen.getByRole('radio', { name: /packaging/i })).toBeInTheDocument();
    cleanup();

    mocks.getTenantVariations.mockResolvedValueOnce({ ok: false, error: 'forbidden' });
    await renderColumnWizard({ table: 'main_table', step: '8' });
    expect(screen.getByRole('alert')).toHaveTextContent(/do not have permission/i);
    expect(screen.getByRole('button', { name: /publish column/i })).toBeDisabled();
  });

  it('resolves the schema-column-wizard namespace in all supported locale message bundles instead of falling back to raw English defaults', () => {
    const requiredKeys = [
      'title',
      'subtitle',
      'step1',
      'step2',
      'step3',
      'step4',
      'step5',
      'step6',
      'step7',
      'step8',
      'publishColumn',
      'reloadLatest',
      'concurrentEditTitle',
      'concurrentEditBody',
      'provenance',
    ];

    for (const locale of ['en', 'pl', 'ro', 'uk']) {
      const messages = JSON.parse(readFileSync(`${process.cwd()}/messages/${locale}/02-settings.json`, 'utf8')) as {
        settings?: { schema_column_wizard?: Record<string, string> };
        schema_column_wizard?: Record<string, string>;
      };
      const namespace = messages.schema_column_wizard ?? messages.settings?.schema_column_wizard;
      expect(namespace, `${locale}/02-settings.json must define schema_column_wizard messages for SET-031`).toBeDefined();
      for (const key of requiredKeys) {
        expect(namespace?.[key], `${locale}/02-settings.json missing schema_column_wizard.${key}`).toEqual(expect.any(String));
        expect(namespace?.[key], `${locale}/02-settings.json schema_column_wizard.${key} must not be an empty fallback`).not.toEqual('');
      }
    }
  });

  it('keeps the page as a Server Component: no page-level use client, React stateful class, or browser event handlers in page.tsx', () => {
    const source = readFileSync(`${process.cwd()}/app/[locale]/(app)/(admin)/settings/schema/new/page.tsx`, 'utf8');
    expect(source.slice(0, 100)).not.toMatch(/['"]use client['"]/);
    expect(source).not.toMatch(/class\s+SchemaColumnWizard\s+extends\s+React\.Component/);
    expect(source).not.toMatch(/\buseState\b|\bsetState\b|onClick=|onChange=/);
    expect(source).toMatch(/async function publishColumnAction/);
    expect(source).toMatch(/CONCURRENT_EDIT/);
  });

  it('renders Step 3 as the 6 rich data-type CARDS with icon + description (parity: schema-wizard.jsx:58-65), not a flat radio list', async () => {
    await renderColumnWizard({ table: 'main_table', dept: 'core', step: '3' });

    const typeGroup = screen.getByRole('radiogroup', { name: /data type/i });
    for (const [label, desc] of [
      ['Text', 'Free text'],
      ['Number', 'Integer or decimal'],
      ['Date', 'Date or date-time'],
      ['Enum', 'Fixed list of options'],
      ['Formula', 'Calculated from other fields'],
      ['Relation', 'Reference to another table row'],
    ]) {
      const card = within(typeGroup).getByText(label).closest('label');
      expect(card, `type card for ${label}`).toBeTruthy();
      expect(card).toHaveTextContent(new RegExp(desc, 'i'));
    }
    expect(within(typeGroup).getAllByRole('radio')).toHaveLength(6);
  });

  it('renders Step 4 rich validators — unique_per_org, regex live-preview, range, and dropdown_source (parity: schema-wizard.jsx:82-105 / 211-310)', async () => {
    const user = userEvent.setup();
    await renderColumnWizard({ table: 'main_table', dept: 'core', type: 'number', step: '4' });

    expect(screen.getByRole('switch', { name: /required/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /unique per org/i })).toBeInTheDocument();

    // Regex toggle reveals pattern + test inputs with a live match/fail badge.
    const regexSwitch = screen.getByRole('switch', { name: /regex pattern/i });
    await user.click(regexSwitch);
    const patternInput = screen.getByPlaceholderText('^[A-Z]{3}-\\d{4}$');
    await user.type(patternInput, '^[0-9]+$');
    const testInput = screen.getByPlaceholderText(/test string/i);
    await user.type(testInput, '123');
    expect(screen.getByText(/match/i)).toBeInTheDocument();
    await user.clear(testInput);
    await user.type(testInput, 'abc');
    expect(screen.getByText(/^✕ fail$|fail/i)).toBeInTheDocument();

    // Range available because type=number; dropdown_source selector present.
    const rangeSwitch = screen.getByRole('switch', { name: /range/i });
    expect(rangeSwitch).toBeEnabled();
    await user.click(rangeSwitch);
    expect(screen.getByPlaceholderText('min')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('max')).toBeInTheDocument();

    const dropdownSwitch = screen.getByRole('switch', { name: /dropdown source/i });
    await user.click(dropdownSwitch);
    expect(screen.getByRole('combobox', { name: /dropdown source/i })).toBeInTheDocument();
  });

  it('disables the Step 4 range validator for non-numeric/date types (parity: schema-wizard.jsx:271-277)', async () => {
    await renderColumnWizard({ table: 'main_table', dept: 'core', type: 'text', step: '4' });
    expect(screen.getByRole('switch', { name: /range/i })).toBeDisabled();
    expect(screen.getByText(/choose a number or date type/i)).toBeInTheDocument();
  });

  it('defines the Step 3/4 rich-control i18n keys for every supported locale', () => {
    const requiredKeys = [
      'typeText', 'typeTextDesc', 'typeNumber', 'typeRelation', 'typeRelationDesc',
      'valUnique', 'valRegex', 'valRegexMatch', 'valRegexFail', 'valRange', 'valDropdown',
    ];
    for (const locale of ['en', 'pl', 'ro', 'uk']) {
      const messages = JSON.parse(readFileSync(`${process.cwd()}/messages/${locale}/02-settings.json`, 'utf8')) as {
        schema_column_wizard?: Record<string, string>;
      };
      const ns = messages.schema_column_wizard;
      expect(ns, `${locale} schema_column_wizard`).toBeDefined();
      for (const key of requiredKeys) {
        expect(ns?.[key], `${locale}/02-settings.json missing schema_column_wizard.${key}`).toEqual(expect.any(String));
        expect(ns?.[key]).not.toEqual('');
      }
    }
  });
});
