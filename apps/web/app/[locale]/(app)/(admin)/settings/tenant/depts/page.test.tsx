/**
 * @vitest-environment jsdom
 * T-101 / SET-061 — Dept Taxonomy Editor.
 *
 * RED phase: page-level RTL tests for prototypes/design/02-SETTINGS-UX.md
 * SET-061. A missing production page renders an empty placeholder so RED fails
 * on behavior assertions, not module-resolution noise.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

type DeptTaxonomyPageProps = {
  params?: Promise<{ locale: string }>;
  departments: Department[];
  sourceColumns: SourceColumn[];
  selectedDeptCode?: string;
  canEdit: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
  submitDeptOverride: ReturnType<typeof vi.fn>;
};

type DeptTaxonomyPage = (props: DeptTaxonomyPageProps) => React.ReactNode | Promise<React.ReactNode>;

const baselineDepartments: Department[] = [
  { code: 'core', name: 'Core', assignedColumnCount: 12, order: 10, provenance: 'baseline' },
  { code: 'technical', name: 'Technical', assignedColumnCount: 3, order: 20, provenance: 'baseline' },
  { code: 'packaging', name: 'Packaging', assignedColumnCount: 5, order: 30, provenance: 'baseline' },
  { code: 'mrp', name: 'MRP', assignedColumnCount: 8, order: 40, provenance: 'baseline' },
  { code: 'planning', name: 'Planning', assignedColumnCount: 9, order: 50, provenance: 'baseline' },
  { code: 'production', name: 'Production', assignedColumnCount: 14, order: 60, provenance: 'baseline' },
  { code: 'price', name: 'Price', assignedColumnCount: 2, order: 70, provenance: 'baseline' },
  {
    code: 'regulatory-affairs',
    name: 'Regulatory Affairs',
    assignedColumnCount: 0,
    order: 80,
    provenance: 'tenant_variations.dept_overrides',
  },
];

const sourceColumns: SourceColumn[] = [
  { code: 'tech.allergen_statement', label: 'Allergen statement', departmentCode: 'technical' },
  { code: 'tech.lab_release_rule', label: 'Lab release rule', departmentCode: 'technical' },
  { code: 'tech.food_safety_owner', label: 'Food safety owner', departmentCode: 'technical' },
];

async function loadDeptTaxonomyPage(): Promise<DeptTaxonomyPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-061 dept taxonomy page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as DeptTaxonomyPage;
  } catch {
    return function MissingDeptTaxonomyPage() {
      return React.createElement('main', { 'data-testid': 'missing-dept-taxonomy-page' });
    };
  }
}

async function renderDeptTaxonomyPage(overrides: Partial<DeptTaxonomyPageProps> = {}) {
  const Page = await loadDeptTaxonomyPage();
  const props: DeptTaxonomyPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    departments: baselineDepartments,
    sourceColumns,
    selectedDeptCode: 'technical',
    canEdit: true,
    state: 'ready',
    submitDeptOverride: vi.fn(async (payload: DeptOverridePayload) => ({
      ok: true as const,
      data: {
        storage: 'tenant_variations.dept_overrides',
        deptOverrides: { actions: { [payload.action]: payload } },
      },
    })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

describe('SET-061 dept taxonomy editor UX route and structure', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the UX-spec Department Taxonomy screen at the AppShell route, not a PromoteToL2 modal surrogate', async () => {
    const { container } = await renderDeptTaxonomyPage();

    expect(screen.getByRole('heading', { name: /department taxonomy/i })).toBeInTheDocument();
    expect(
      screen.getByText(/customize department structure for your organization/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/dept changes affect how columns and rules are grouped/i);

    const deptPanel = screen.getByRole('region', { name: /current dept list/i });
    expect(within(deptPanel).getByRole('button', { name: /add custom dept/i })).toHaveAttribute(
      'data-slot',
      'button',
    );
    expect(within(deptPanel).getAllByTestId('dept-row').map((row) => row.textContent)).toEqual([
      expect.stringContaining('core'),
      expect.stringContaining('technical'),
      expect.stringContaining('packaging'),
      expect.stringContaining('mrp'),
      expect.stringContaining('planning'),
      expect.stringContaining('production'),
      expect.stringContaining('price'),
      expect.stringContaining('regulatory-affairs'),
    ]);
    expect(within(deptPanel).getByText(/3 assigned columns/i)).toBeInTheDocument();

    const operations = screen.getByRole('region', { name: /operations/i });
    expect(within(operations).getByRole('radio', { name: /split technical into two departments/i })).toBeChecked();
    expect(within(operations).getByLabelText(/source dept/i)).toHaveValue('technical');
    expect(within(operations).getByLabelText(/target dept 1 name/i)).toBeInTheDocument();
    expect(within(operations).getByLabelText(/target dept 1 code/i)).toBeInTheDocument();
    expect(within(operations).getByLabelText(/target dept 2 name/i)).toBeInTheDocument();
    expect(within(operations).getByLabelText(/target dept 2 code/i)).toBeInTheDocument();
    for (const column of sourceColumns) {
      expect(within(operations).getByRole('combobox', { name: new RegExp(column.label, 'i') })).toBeInTheDocument();
    }
    expect(within(operations).getByRole('radio', { name: /merge selected depts into one/i })).toBeInTheDocument();
    expect(within(operations).getByRole('radio', { name: /add new department/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('button', { name: /discard/i })).toHaveAttribute('data-slot', 'button');

    expect(screen.queryByRole('dialog', { name: /promote to l2/i })).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="promote-to-l2-modal"]')).toBeNull();
  });

  it('blocks a split technical → food-safety + quality-lab submission without complete column mapping and surfaces COLUMN_MAPPING_REQUIRED (V-SET-30)', async () => {
    const user = userEvent.setup();
    const { props } = await renderDeptTaxonomyPage();

    await user.clear(screen.getByLabelText(/target dept 1 name/i));
    await user.type(screen.getByLabelText(/target dept 1 name/i), 'Food Safety');
    await user.clear(screen.getByLabelText(/target dept 1 code/i));
    await user.type(screen.getByLabelText(/target dept 1 code/i), 'food-safety');
    await user.clear(screen.getByLabelText(/target dept 2 name/i));
    await user.type(screen.getByLabelText(/target dept 2 name/i), 'Quality Lab');
    await user.clear(screen.getByLabelText(/target dept 2 code/i));
    await user.type(screen.getByLabelText(/target dept 2 code/i), 'quality-lab');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/COLUMN_MAPPING_REQUIRED/i)).toBeInTheDocument();
    expect(screen.getByText(/V-SET-30/i)).toBeInTheDocument();
    expect(props.submitDeptOverride).not.toHaveBeenCalled();
  });

  it('submits an Add operation for regulatory-affairs to tenant_variations.dept_overrides and shows confirmation provenance', async () => {
    const user = userEvent.setup();
    const { props } = await renderDeptTaxonomyPage({
      departments: baselineDepartments.filter((dept) => dept.code !== 'regulatory-affairs'),
    });

    await user.click(screen.getByRole('radio', { name: /add new department/i }));
    await user.clear(screen.getByLabelText(/^code$/i));
    await user.type(screen.getByLabelText(/^code$/i), 'regulatory-affairs');
    await user.clear(screen.getByLabelText(/name pl/i));
    await user.type(screen.getByLabelText(/name pl/i), 'Sprawy regulacyjne');
    await user.clear(screen.getByLabelText(/name en/i));
    await user.type(screen.getByLabelText(/name en/i), 'Regulatory Affairs');
    await user.clear(screen.getByLabelText(/display order/i));
    await user.type(screen.getByLabelText(/display order/i), '80');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(props.submitDeptOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'add',
        code: 'regulatory-affairs',
        namePl: 'Sprawy regulacyjne',
        nameEn: 'Regulatory Affairs',
        displayOrder: 80,
      }),
    );
    expect(await screen.findByRole('dialog', { name: /confirm department change/i })).toHaveTextContent(
      /tenant_variations\.dept_overrides/i,
    );
  });
});
