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
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
      requestL1Promotion: 'Request L1 Promotion',
      reloadLatest: 'Reload latest',
      concurrentEditTitle: 'Concurrent edit detected',
      concurrentEditBody: 'Another admin published a newer version while you were editing. Review the diff and republish.',
      provenance: 'tenant_variations.dept_overrides',
    };
    return labels[key] ?? key;
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

  it('renders the SET-031 eight-step wizard at /en/settings/schema/new inside AppShell, not a promotion modal surrogate', async () => {
    const { container } = await renderColumnWizard();

    expect(screen.getByRole('heading', { name: /column edit wizard/i })).toBeInTheDocument();
    expect(screen.getByTestId('schema-column-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('app-topbar')).toBeInTheDocument();

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

  it("uses tenant_variations.dept_overrides plus the seven-dept Apex baseline when table='main_table' advances to step 2", async () => {
    const user = userEvent.setup();
    await renderColumnWizard();

    await user.selectOptions(screen.getByRole('combobox', { name: /which table does this column belong to/i }), 'main_table');
    await user.click(screen.getByRole('button', { name: /next/i }));

    const deptStep = screen.getByRole('region', { name: /pick department/i });
    expect(within(deptStep).getByText(/which department owns this column/i)).toBeInTheDocument();
    for (const deptName of [...baselineDeptNames, ...customDeptNames]) {
      expect(within(deptStep).getByRole('radio', { name: new RegExp(deptName, 'i') })).toBeInTheDocument();
    }
    expect(within(deptStep).getByText(/tenant_variations\.dept_overrides/i)).toBeInTheDocument();
    expect(mocks.getTenantVariations).toHaveBeenCalledTimes(1);
  });

  it('shows a diff modal with Reload latest when Step 8 publish receives CONCURRENT_EDIT', async () => {
    const user = userEvent.setup();
    mocks.editColumn.mockResolvedValueOnce({
      ok: false,
      error: 'CONCURRENT_EDIT',
      data: {
        currentSchemaVersion: 8,
        diff: {
          field: 'presentation.section',
          before: 'Packaging Details',
          after: 'Quality Lab Details',
        },
      },
    });

    await renderColumnWizard({ mode: 'edit', table: 'main_table', column: 'pack_finish', step: '8', expectedSchemaVersion: '7' });
    expect(screen.getByRole('heading', { name: /review your column definition/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /publish column/i }));

    await waitFor(() => expect(mocks.editColumn).toHaveBeenCalledWith(expect.objectContaining({
      tableCode: 'main_table',
      columnCode: 'pack_finish',
      expectedSchemaVersion: 7,
    })));
    const conflictDialog = await screen.findByRole('dialog', { name: /concurrent edit detected/i });
    expect(conflictDialog).toHaveTextContent(/another admin published a newer version/i);
    expect(conflictDialog).toHaveTextContent(/presentation\.section/i);
    expect(conflictDialog).toHaveTextContent(/Packaging Details/i);
    expect(conflictDialog).toHaveTextContent(/Quality Lab Details/i);
    expect(within(conflictDialog).getByRole('button', { name: /reload latest/i })).toBeInTheDocument();
  });
});
