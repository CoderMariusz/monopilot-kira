/**
 * @vitest-environment jsdom
 * T-105 / SET-014 — Location Tree screen.
 *
 * RED phase: page-level RTL tests for PRD §12.2 and V-SET-60. A missing
 * production page renders an empty placeholder so RED fails on behavior
 * assertions, not module-resolution noise.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      title: 'Location Tree',
      subtitle: 'Hierarchical warehouse zones and bins ordered by ltree path. Drag-drop reorder is deferred to Phase 2.',
      workspace: 'Location Tree workspace',
      settingsNavigation: 'Settings navigation',
      sidebarLabel: 'Settings / Infrastructure',
      sectionTitle: 'Location hierarchy',
      warehouse: 'Warehouse',
      allWarehouses: 'All warehouses',
      importCsv: 'Import CSV',
      csvFile: 'CSV file',
      insufficientPermissions: 'Insufficient permissions: settings.infra.update is required to import CSV.',
      loading: 'Loading location tree…',
      empty: 'No locations are available for the selected warehouse.',
      error: 'Unable to load the location tree. Try again after the backend is available.',
      forbidden: 'You do not have permission to view location infrastructure settings.',
      provenance: 'Data source: live loader props; empty fallback is used only when the runtime loader has no rows.',
      expand: 'Expand {name}',
      leaf: 'Leaf location',
      level: 'Level {level}',
      importSuccess: 'Imported {count} location rows.',
      importError: 'Row {row}: {code} ({validation}) {message}',
    };
    return Object.entries(values ?? {}).reduce(
      (label, [name, value]) => label.replace(`{${name}}`, String(value)),
      labels[key] ?? key,
    );
  }),
}));

type Warehouse = {
  id: string;
  code: string;
  name: string;
};

type LocationRow = {
  id: string;
  warehouseId: string;
  parentId: string | null;
  name: string;
  level: number;
  path: string;
};

type CreateLocationInput = {
  csvRowNumber: number;
  warehouseId: string;
  parentPath: string | null;
  name: string;
  level: number;
  path: string;
};

type LocationTreePageProps = {
  params?: Promise<{ locale: string }>;
  warehouses: Warehouse[];
  locations: LocationRow[];
  selectedWarehouseId?: string;
  canImport: boolean;
  createLocation: ReturnType<typeof vi.fn>;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
};

type LocationTreePage = (props: LocationTreePageProps) => React.ReactNode | Promise<React.ReactNode>;

const warehouses: Warehouse[] = [
  { id: 'wh-apex', code: 'APEX', name: 'Apex Dairy Warehouse' },
  { id: 'wh-north', code: 'NORTH', name: 'North Warehouse' },
];

const locations: LocationRow[] = [
  // Intentionally unsorted: the page must render by ltree path order, not input order.
  { id: 'bin-a10-02', warehouseId: 'wh-apex', parentId: 'zone-a10', name: 'A10 Bin 02', level: 3, path: 'apex.z10.b02' },
  { id: 'zone-a02', warehouseId: 'wh-apex', parentId: 'root-apex', name: 'A02 Chilled Zone', level: 2, path: 'apex.z02' },
  { id: 'root-north', warehouseId: 'wh-north', parentId: null, name: 'North Warehouse', level: 1, path: 'north' },
  { id: 'bin-a02-02', warehouseId: 'wh-apex', parentId: 'zone-a02', name: 'A02 Bin 02', level: 3, path: 'apex.z02.b02' },
  { id: 'zone-a10', warehouseId: 'wh-apex', parentId: 'root-apex', name: 'A10 Ambient Zone', level: 2, path: 'apex.z10' },
  { id: 'bin-a02-01', warehouseId: 'wh-apex', parentId: 'zone-a02', name: 'A02 Bin 01', level: 3, path: 'apex.z02.b01' },
  { id: 'root-apex', warehouseId: 'wh-apex', parentId: null, name: 'Apex Dairy Warehouse', level: 1, path: 'apex' },
  { id: 'bin-a10-01', warehouseId: 'wh-apex', parentId: 'zone-a10', name: 'A10 Bin 01', level: 3, path: 'apex.z10.b01' },
];

async function loadLocationTreePage(): Promise<LocationTreePage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-014 Location Tree page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as LocationTreePage;
  } catch {
    return function MissingLocationTreePage() {
      return React.createElement('main', { 'data-testid': 'missing-location-tree-page' });
    };
  }
}

function defaultCreateLocation() {
  return vi.fn(async (input: CreateLocationInput) => {
    if (input.csvRowNumber === 3) {
      return {
        ok: false as const,
        error: {
          code: 'LEVEL_GAP',
          rowNumber: 3,
          validation: 'V-SET-60',
          message: 'LEVEL_GAP: level must equal parent.level + 1',
        },
      };
    }

    return { ok: true as const, data: { id: `created-${input.csvRowNumber}` } };
  });
}

async function renderLocationTree(overrides: Partial<LocationTreePageProps> = {}) {
  const Page = await loadLocationTreePage();
  const props: LocationTreePageProps = {
    params: Promise.resolve({ locale: 'en' }),
    warehouses,
    locations,
    selectedWarehouseId: 'all',
    canImport: true,
    state: 'ready',
    createLocation: defaultCreateLocation(),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

describe('SET-014 Location Tree screen', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the localized AppShell location tree expandable by ltree path order with warehouse filtering', async () => {
    const user = userEvent.setup();
    await renderLocationTree();

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('app-topbar')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /location tree/i })).toBeInTheDocument();

    const warehouseFilter = screen.getByRole('combobox', { name: /warehouse/i });
    expect(warehouseFilter).toHaveTextContent(/all warehouses/i);

    const tree = screen.getByRole('tree', { name: /location tree/i });
    const apexRoot = within(tree).getByRole('treeitem', { name: /apex dairy warehouse/i });
    expect(apexRoot).toHaveAttribute('aria-level', '1');
    expect(apexRoot).toHaveAttribute('aria-expanded', 'false');
    await user.click(within(apexRoot).getByRole('button', { name: /expand/i }));

    const zoneItems = within(tree).getAllByRole('treeitem', { name: /zone/i });
    expect(zoneItems.map((item) => item.textContent)).toEqual([
      expect.stringContaining('A02 Chilled Zone'),
      expect.stringContaining('A10 Ambient Zone'),
    ]);
    expect(zoneItems.map((item) => item.getAttribute('aria-level'))).toEqual(['2', '2']);

    await user.click(within(zoneItems[0]).getByRole('button', { name: /expand/i }));
    await user.click(within(zoneItems[1]).getByRole('button', { name: /expand/i }));
    const visibleItems = within(tree).getAllByRole('treeitem').map((item) => item.textContent);
    expect(visibleItems).toEqual([
      expect.stringContaining('Apex Dairy Warehouse'),
      expect.stringContaining('A02 Chilled Zone'),
      expect.stringContaining('A02 Bin 01'),
      expect.stringContaining('A02 Bin 02'),
      expect.stringContaining('A10 Ambient Zone'),
      expect.stringContaining('A10 Bin 01'),
      expect.stringContaining('A10 Bin 02'),
      expect.stringContaining('North Warehouse'),
    ]);

    await user.click(screen.getByRole('option', { name: 'Apex Dairy Warehouse' }));
    expect(screen.queryByRole('treeitem', { name: /north warehouse/i })).not.toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /apex dairy warehouse/i })).toBeInTheDocument();
  });

  it('imports five CSV rows via T-029 createLocation and aggregates the V-SET-60 LEVEL_GAP row error in a toast', async () => {
    const user = userEvent.setup();
    const createLocation = defaultCreateLocation();
    await renderLocationTree({ createLocation });

    const csv = [
      'name,warehouseId,parentPath,level,path',
      'CSV Root,wh-apex,,1,apex.csv-root',
      'CSV Zone A,wh-apex,apex.csv-root,2,apex.csv-root.zone-a',
      'CSV Bad Bin,wh-apex,apex.csv-root,3,apex.csv-root.bad-bin',
      'CSV Zone B,wh-apex,apex.csv-root,2,apex.csv-root.zone-b',
      'CSV Bin B1,wh-apex,apex.csv-root.zone-b,3,apex.csv-root.zone-b.bin-b1',
    ].join('\n');
    const file = new File([csv], 'locations.csv', { type: 'text/csv' });

    await user.upload(screen.getByLabelText(/csv file/i), file);
    await user.click(screen.getByRole('button', { name: /import csv/i }));

    await waitFor(() => expect(createLocation).toHaveBeenCalledTimes(5));
    expect(createLocation).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        csvRowNumber: 3,
        level: 3,
        parentPath: 'apex.csv-root',
        path: 'apex.csv-root.bad-bin',
      }),
    );
    const toast = await screen.findByRole('alert');
    expect(toast).toHaveTextContent(/row 3/i);
    expect(toast).toHaveTextContent(/LEVEL_GAP/i);
    expect(toast).toHaveTextContent(/V-SET-60/i);
  });

  it('disables CSV import with an explanatory aria-label when settings.infra.update is missing', async () => {
    await renderLocationTree({ canImport: false });

    const importButton = screen.getByText(/import csv/i).closest('button');
    expect(importButton).toBeInTheDocument();
    expect(importButton).toBeDisabled();
    expect(importButton).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/insufficient permissions|settings\.infra\.update/i),
    );
  });
});
