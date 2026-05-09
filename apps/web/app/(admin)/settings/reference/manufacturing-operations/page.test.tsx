/**
 * T-077 — Manufacturing Operations List screen (SET-055)
 *
 * RED phase: these RTL tests specify the spec-driven Manufacturing Operations list.
 * They must fail until apps/web/app/(admin)/settings/reference/manufacturing-operations/page.tsx is implemented.
 *
 * Source of truth: UX SET-055 / PRD §8.9.4. Adjacent Reference Data prototype is pattern-only.
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type ManufacturingOperation = {
  id: string;
  operation_name: string;
  process_suffix: string;
  operation_seq: number;
  industry_code: 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';
  is_active: boolean;
  description?: string;
};

type ManufacturingOperationsPageProps = {
  operations: ManufacturingOperation[];
  industryFilter?: ManufacturingOperation['industry_code'] | 'all';
  showInactive?: boolean;
  reorderOperations: ReturnType<typeof vi.fn>;
  resetToSeed: ReturnType<typeof vi.fn>;
  onAddOperation: ReturnType<typeof vi.fn>;
  onEditOperation: ReturnType<typeof vi.fn>;
  onDeactivateOperation: ReturnType<typeof vi.fn>;
};

const operations: ManufacturingOperation[] = [
  {
    id: 'op-mix',
    operation_name: 'Mix',
    process_suffix: 'MX',
    operation_seq: 1,
    industry_code: 'bakery',
    is_active: true,
    description: 'Mixing dry ingredients for dough',
  },
  {
    id: 'op-knead',
    operation_name: 'Knead',
    process_suffix: 'KN',
    operation_seq: 2,
    industry_code: 'bakery',
    is_active: true,
  },
  {
    id: 'op-granulate',
    operation_name: 'Granulate',
    process_suffix: 'GR',
    operation_seq: 1,
    industry_code: 'pharma',
    is_active: true,
  },
  {
    id: 'op-legacy-pack',
    operation_name: 'Legacy Pack',
    process_suffix: 'LP',
    operation_seq: 3,
    industry_code: 'bakery',
    is_active: false,
  },
];

async function loadManufacturingOperationsPage() {
  const target = './page';
  const module = await import(/* @vite-ignore */ target).catch(() => null);
  expect(
    module,
    'apps/web/app/(admin)/settings/reference/manufacturing-operations/page.tsx should exist for SET-055',
  ).not.toBeNull();
  expect(module?.default, 'SET-055 page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return module!.default as React.ComponentType<ManufacturingOperationsPageProps>;
}

async function renderManufacturingOperations(overrides?: Partial<ManufacturingOperationsPageProps>) {
  const ManufacturingOperationsPage = await loadManufacturingOperationsPage();
  const props: ManufacturingOperationsPageProps = {
    operations,
    industryFilter: 'all',
    showInactive: false,
    reorderOperations: vi.fn().mockResolvedValue({ ok: true }),
    resetToSeed: vi.fn().mockResolvedValue({ ok: true }),
    onAddOperation: vi.fn(),
    onEditOperation: vi.fn(),
    onDeactivateOperation: vi.fn(),
    ...overrides,
  };

  render(React.createElement(ManufacturingOperationsPage, props));
  return props;
}

describe('SET-055 Manufacturing Operations list view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the PRD §8.9.4 data grid columns, toolbar actions, row actions, and status semantics', async () => {
    await renderManufacturingOperations();

    expect(screen.getByRole('heading', { name: /manufacturing operations/i })).toBeInTheDocument();
    expect(screen.getByText(/settings/i)).toBeInTheDocument();
    expect(screen.getByText(/reference tables/i)).toBeInTheDocument();

    const grid = screen.getByRole('table', { name: /manufacturing operations/i });
    for (const columnName of ['Operation Name', 'Process Suffix', 'Sequence', 'Industry Code', 'Status']) {
      expect(within(grid).getByRole('columnheader', { name: new RegExp(columnName, 'i') })).toBeInTheDocument();
    }

    expect(screen.getByRole('button', { name: /add new operation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset to seed data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete inactive rows/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /industry/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /show inactive/i })).toBeInTheDocument();

    const mixRow = within(grid).getByRole('row', { name: /mix mx 1 bakery active/i });
    expect(within(mixRow).getByRole('button', { name: /edit mix/i })).toBeInTheDocument();
    expect(within(mixRow).getByRole('button', { name: /delete mix|deactivate mix/i })).toBeInTheDocument();
    expect(within(mixRow).getByText(/active/i)).toHaveAccessibleName(/active/i);
  });

  it("applies industry='bakery' filtering and hides non-bakery rows", async () => {
    const user = userEvent.setup();
    await renderManufacturingOperations({ industryFilter: 'all', showInactive: true });

    await user.selectOptions(screen.getByRole('combobox', { name: /industry/i }), 'bakery');

    const grid = screen.getByRole('table', { name: /manufacturing operations/i });
    expect(within(grid).getByRole('row', { name: /mix mx 1 bakery active/i })).toBeInTheDocument();
    expect(within(grid).getByRole('row', { name: /knead kn 2 bakery active/i })).toBeInTheDocument();
    expect(within(grid).getByRole('row', { name: /legacy pack lp 3 bakery inactive/i })).toBeInTheDocument();
    expect(within(grid).queryByRole('row', { name: /granulate gr 1 pharma active/i })).not.toBeInTheDocument();
  });

  it('auto-saves drag-to-reorder with the T-038 reorderOperations payload of id and operation_seq pairs', async () => {
    const reorderOperations = vi.fn().mockResolvedValue({ ok: true });
    await renderManufacturingOperations({ operations: operations.slice(0, 2), reorderOperations });

    const grid = screen.getByRole('table', { name: /manufacturing operations/i });
    const mixRow = within(grid).getByRole('row', { name: /mix mx 1 bakery active/i });
    const kneadRow = within(grid).getByRole('row', { name: /knead kn 2 bakery active/i });

    const dataTransfer = {
      clearData: vi.fn(),
      getData: vi.fn(),
      setData: vi.fn(),
      dropEffect: 'move',
      effectAllowed: 'move',
    };

    fireEvent.dragStart(kneadRow, { dataTransfer });
    fireEvent.dragOver(mixRow, { dataTransfer });
    fireEvent.drop(mixRow, { dataTransfer });

    expect(reorderOperations).toHaveBeenCalledTimes(1);
    expect(reorderOperations).toHaveBeenCalledWith([
      { id: 'op-knead', operation_seq: 1 },
      { id: 'op-mix', operation_seq: 2 },
    ]);
  });
});
