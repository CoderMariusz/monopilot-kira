/**
 * @vitest-environment jsdom
 * T-077 — SET-055 Manufacturing Operations List
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@monopilot/ui/Modal', async () => {
  const ReactModule = await import('react');

  function Modal({
    children,
    modalId,
    onOpenChange,
    open,
  }: {
    children: React.ReactNode;
    modalId?: string;
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }) {
    ReactModule.useEffect(() => {
      if (!open) {
        return undefined;
      }
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onOpenChange(false);
        }
      };
      document.addEventListener('keydown', closeOnEscape);
      return () => document.removeEventListener('keydown', closeOnEscape);
    }, [onOpenChange, open]);

    if (!open) {
      return null;
    }

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-seed-title"
        data-focus-trap="radix-dialog"
        data-modal-id={modalId}
      >
        {children}
      </div>
    );
  }

  Modal.Header = ({ title }: { title: string }) => <h2 id="reset-seed-title">{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

  return { default: Modal };
});

import ManufacturingOperationsScreen, {
  type ManufacturingOperation,
  type ManufacturingOperationsScreenLabels,
  type ManufacturingOperationsScreenProps,
} from './manufacturing-operations-screen.client';

const labels: ManufacturingOperationsScreenLabels = {
  breadcrumbSettings: 'Settings',
  breadcrumbReferenceTables: 'Reference Tables',
  breadcrumbManufacturingOperations: 'Manufacturing Operations',
  setReference: 'SET-055 / PRD §8.9.4',
  title: 'Manufacturing Operations',
  subtitle: 'Configure tenant-specific operation names, process suffixes, industry seed sets, active state, and recipe sequence order.',
  notice: 'Operations are referenced by routings, line assignments, and WIP code generators. The process suffix is immutable after creation.',
  loading: 'Loading manufacturing operations…',
  error: 'Unable to load manufacturing operations.',
  permissionDenied: 'You do not have permission to manage manufacturing operations.',
  addNewOperation: 'Add New Operation',
  resetToSeedData: 'Reset to seed data',
  deleteInactiveRows: 'Delete inactive rows',
  industryLabel: 'Industry',
  showInactive: 'Show inactive',
  industryAll: 'All industries',
  industryBakery: 'Bakery',
  industryPharma: 'Pharma',
  industryFmcg: 'FMCG',
  industryGeneric: 'Generic',
  industryCustom: 'Custom',
  columnOperationName: 'Operation Name',
  columnProcessSuffix: 'Process Suffix',
  columnSequence: 'Sequence',
  columnIndustryCode: 'Industry Code',
  columnStatus: 'Status',
  columnActions: 'Actions',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  editOperation: 'Edit {operation}',
  deleteOperation: 'Delete {operation}',
  empty: 'No manufacturing operations match the current filters.',
  resetDialogTitle: 'Reset to industry seed data',
  resetDialogBody: 'This will replace all current operations with the selected industry seed data. Existing operation order, suffixes, and inactive rows will be reset.',
  addDialogTitle: 'Add manufacturing operation',
  fieldOperationName: 'Operation name',
  fieldProcessSuffix: 'Process suffix',
  fieldDescription: 'Description',
  fieldSequence: 'Sequence',
  fieldActive: 'Active',
  create: 'Create',
  creating: 'Creating...',
  duplicateOperationName: 'An operation with this name already exists.',
  duplicateProcessSuffix: 'An operation with this suffix already exists for this industry.',
  createFailed: 'Unable to create manufacturing operation.',
  cancel: 'Cancel',
  reset: 'Reset',
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

async function importMaybe(target: string) {
  return import(/* @vite-ignore */ target).catch(() => null);
}

async function loadLocalizedManufacturingOperationsPage() {
  const localized = await importMaybe('./page');
  expect(
    localized,
    'SET-055 must be implemented at apps/web/app/[locale]/(admin)/settings/reference/manufacturing-operations/page.tsx for /en/settings/reference/manufacturing-operations',
  ).not.toBeNull();
  expect(localized?.default, 'localized SET-055 page must default-export a renderable Server Component').toEqual(
    expect.any(Function),
  );
  return localized!.default as React.ComponentType;
}

async function renderManufacturingOperations(overrides?: Partial<ManufacturingOperationsScreenProps>) {
  const props: ManufacturingOperationsScreenProps = {
    operations,
    labels,
    industryFilter: 'all',
    showInactive: false,
    reorderOperations: vi.fn().mockResolvedValue({ ok: true }),
    resetToSeed: vi.fn().mockResolvedValue({ ok: true }),
    onAddOperation: vi.fn(),
    onEditOperation: vi.fn(),
    onDeactivateOperation: vi.fn(),
    ...overrides,
  };

  render(React.createElement(ManufacturingOperationsScreen, props));
  return props;
}

describe('SET-055 Manufacturing Operations list view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is wired to the localized Settings Reference route as a Server Component with a client leaf and next-intl labels', async () => {
    await loadLocalizedManufacturingOperationsPage();

    const dir = __dirname;
    const pageSource = await fs.readFile(path.join(dir, 'page.tsx'), 'utf8');
    const clientSource = await fs.readFile(path.join(dir, 'manufacturing-operations-screen.client.tsx'), 'utf8');

    expect(pageSource).not.toMatch(/['"]use client['"]/);
    expect(pageSource).toContain('getTranslations');
    expect(pageSource).toContain('settings.manufacturing_operations');
    expect(pageSource).toContain('manufacturing-operations-screen.client');
    expect(clientSource).toMatch(/['"]use client['"]/);
    expect(clientSource).toContain("@monopilot/ui/Modal");
    expect(clientSource).not.toContain('role="dialog"');
  });

  it('renders the PRD §8.9.4 data grid, toolbar actions, row actions, and status semantics', async () => {
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
    expect(within(mixRow).getByRole('button', { name: /delete mix/i })).toBeInTheDocument();
    expect(within(mixRow).getByText(/active/i)).toHaveAccessibleName(/active/i);
  });

  it('opens the add-operation modal and submits a dedicated create action', async () => {
    const user = userEvent.setup();
    const createOperation = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        id: 'op-blend',
        operation_name: 'Blend',
        process_suffix: 'BL',
        operation_seq: 4,
        industry_code: 'bakery',
        is_active: true,
        description: 'Wet blend',
      },
    });
    await renderManufacturingOperations({ createOperation });

    await user.click(screen.getByRole('button', { name: /add new operation/i }));
    const dialog = screen.getByRole('dialog', { name: /add manufacturing operation/i });
    await user.type(within(dialog).getByLabelText(/operation name/i), 'Blend');
    await user.type(within(dialog).getByLabelText(/process suffix/i), 'BL');
    await user.type(within(dialog).getByLabelText(/description/i), 'Wet blend');
    await user.clear(within(dialog).getByLabelText(/sequence/i));
    await user.type(within(dialog).getByLabelText(/sequence/i), '4');
    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(createOperation).toHaveBeenCalledWith({
      operationName: 'Blend',
      processSuffix: 'BL',
      description: 'Wet blend',
      operationSeq: 4,
      industryCode: 'custom',
      isActive: true,
    }));
    expect(await screen.findByText('Blend')).toBeInTheDocument();
  });

  it('surfaces duplicate operation-name errors from the create action', async () => {
    const user = userEvent.setup();
    await renderManufacturingOperations({
      createOperation: vi.fn().mockResolvedValue({ ok: false, error: 'duplicate_operation_name' }),
    });

    await user.click(screen.getByRole('button', { name: /add new operation/i }));
    const dialog = screen.getByRole('dialog', { name: /add manufacturing operation/i });
    await user.type(within(dialog).getByLabelText(/operation name/i), 'Mix');
    await user.type(within(dialog).getByLabelText(/process suffix/i), 'M2');
    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('An operation with this name already exists.');
  });

  it("applies industry='bakery' filtering and hides non-bakery rows", async () => {
    const user = userEvent.setup();
    await renderManufacturingOperations({ industryFilter: 'all', showInactive: true });

    await user.click(screen.getByRole('combobox', { name: /industry/i }));
    await user.click(await screen.findByRole('option', { name: /bakery/i }));

    const grid = screen.getByRole('table', { name: /manufacturing operations/i });
    expect(within(grid).getByRole('row', { name: /mix mx 1 bakery active/i })).toBeInTheDocument();
    expect(within(grid).getByRole('row', { name: /knead kn 2 bakery active/i })).toBeInTheDocument();
    expect(within(grid).getByRole('row', { name: /legacy pack lp 3 bakery inactive/i })).toBeInTheDocument();
    expect(within(grid).queryByRole('row', { name: /granulate gr 1 pharma active/i })).not.toBeInTheDocument();
  });

  it('requires confirmation before Reset to seed data invokes the mutation', async () => {
    const user = userEvent.setup();
    const resetToSeed = vi.fn().mockResolvedValue({ ok: true });
    await renderManufacturingOperations({ resetToSeed });

    await user.click(screen.getByRole('button', { name: /reset to seed data/i }));

    expect(resetToSeed).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: /reset to industry seed data/i });
    expect(dialog).toHaveAttribute('data-focus-trap', 'radix-dialog');
    expect(dialog).toHaveAttribute('data-modal-id', 'SET-055-reset-seed');
    expect(within(dialog).getByText(/replace all current operations/i)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /reset to industry seed data/i })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /reset to seed data/i }));
    await user.click(within(screen.getByRole('dialog', { name: /reset to industry seed data/i })).getByRole('button', { name: /^reset$/i }));
    expect(resetToSeed).toHaveBeenCalledTimes(1);
    expect(resetToSeed).toHaveBeenCalledWith('generic');
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
