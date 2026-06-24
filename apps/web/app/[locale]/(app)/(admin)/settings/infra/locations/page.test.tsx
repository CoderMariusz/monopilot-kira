/**
 * @vitest-environment jsdom
 * T-105 / SET-014 — Location Tree screen.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getTranslations } from 'next-intl/server';
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
      addLocation: '+ Add location',
      editLocation: 'Edit',
      addChild: '+ Child',
      deleteLocation: 'Delete',
      selectedLocation: 'Selected location',
      selectedParent: 'Parent',
      selectedDepth: 'Depth level',
      selectedType: 'Type',
      selectedStatus: 'Status',
      lpsHere: 'LPs here',
      readOnly: 'Read-only — settings.infra.update required to edit',
      dialogAddTitle: 'Add location',
      dialogEditTitle: 'Edit location',
      dialogDeleteTitle: 'Delete location',
      dialogDeleteBody: 'Delete {name}? This cannot be undone.',
      fieldCode: 'Code',
      fieldName: 'Name',
      fieldParent: 'Parent location',
      fieldType: 'Type',
      fieldActive: 'Is active',
      fieldBarcode: 'Barcode (optional)',
      depthExceeded: 'Maximum location depth for this tenant is 3 levels (warehouse → zone → bin).',
      cancel: 'Cancel',
      createLocation: 'Create location',
      confirmDelete: 'Delete location',
      saveChanges: 'Save changes',
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
      deleteSuccess: 'Location deleted.',
      deleteError: 'Location delete failed.',
      deleteHasChildren: 'Delete child locations first.',
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
  searchParams?: Promise<{ warehouseId?: string; importStatus?: string; importMessage?: string }> | { warehouseId?: string; importStatus?: string; importMessage?: string };
  warehouses: Warehouse[];
  locations: LocationRow[];
  selectedWarehouseId?: string;
  canImport: boolean;
  createLocation: ReturnType<typeof vi.fn>;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
};

type LocationTreePage = (props: LocationTreePageProps) => React.ReactNode | Promise<React.ReactNode>;
type LocationTreeModule = {
  default: LocationTreePage;
  importLocationCsvText: (
    text: string,
    createLocation: (input: CreateLocationInput) => Promise<{ ok: boolean; error?: Record<string, unknown> }> | { ok: boolean; error?: Record<string, unknown> },
    labels: { importError: string; importSuccess: string },
  ) => Promise<{ ok: boolean; message: string; rows: CreateLocationInput[] }>;
};

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

async function loadLocationTreeModule(): Promise<LocationTreeModule> {
  const pageModulePath = './page';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'SET-014 Location Tree page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return mod as LocationTreeModule;
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
  const Page = (await loadLocationTreeModule()).default;
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

  it('renders page content inside the real AppShell route without fake shell wrappers and orders the expandable tree by ltree path', async () => {
    const user = userEvent.setup();
    await renderLocationTree();

    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-topbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-location-tree-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /location tree/i })).toBeInTheDocument();

    const warehouseFilter = screen.getByRole('combobox', { name: /warehouse/i });
    expect(warehouseFilter).toHaveTextContent(/all warehouses/i);

    const tree = screen.getByRole('tree', { name: /location tree/i });
    const apexRoot = within(tree).getByText('Apex Dairy Warehouse').closest('[role="treeitem"]');
    expect(apexRoot).toHaveAttribute('aria-level', '1');
    expect(apexRoot).toHaveAttribute('data-location-id', 'root-apex');

    await user.click(within(apexRoot as HTMLElement).getByLabelText(/expand apex dairy warehouse/i));
    const zoneItems = within(tree).getAllByText(/zone/i).map((text) => text.closest('[role="treeitem"]'));
    expect(zoneItems.map((item) => item?.textContent)).toEqual([
      expect.stringContaining('A02 Chilled Zone'),
      expect.stringContaining('A10 Ambient Zone'),
    ]);
    expect(zoneItems.map((item) => item?.getAttribute('aria-level'))).toEqual(['2', '2']);

    await user.click(within(zoneItems[0] as HTMLElement).getByLabelText(/expand a02 chilled zone/i));
    await user.click(within(zoneItems[1] as HTMLElement).getByLabelText(/expand a10 ambient zone/i));
    const renderedOrder = within(tree).getAllByRole('treeitem').map((item) => item.getAttribute('data-location-id'));
    expect(renderedOrder).toEqual([
      'root-apex',
      'zone-a02',
      'bin-a02-01',
      'bin-a02-02',
      'zone-a10',
      'bin-a10-01',
      'bin-a10-02',
      'root-north',
    ]);
  });

  it('server-renders the selected warehouse filter so rerendered trees only expose that warehouse', async () => {
    await renderLocationTree({ selectedWarehouseId: 'wh-apex' });

    const tree = screen.getByRole('tree', { name: /location tree/i });
    expect(screen.getByRole('combobox', { name: /warehouse/i })).toHaveTextContent('Apex Dairy Warehouse');
    expect(within(tree).queryByText('North Warehouse')).not.toBeInTheDocument();
    expect(within(tree).getByText('Apex Dairy Warehouse')).toBeInTheDocument();
  });

  it('imports five CSV rows through the T-029 dispatcher helper and exposes browser toast wiring for V-SET-60 row errors', async () => {
    const { importLocationCsvText } = await loadLocationTreeModule();
    const createLocation = defaultCreateLocation();
    const csv = [
      'name,warehouseId,parentPath,level,path',
      'CSV Root,wh-apex,,1,apex.csv-root',
      'CSV Zone A,wh-apex,apex.csv-root,2,apex.csv-root.zone-a',
      'CSV Bad Bin,wh-apex,apex.csv-root,3,apex.csv-root.bad-bin',
      'CSV Zone B,wh-apex,apex.csv-root,2,apex.csv-root.zone-b',
      'CSV Bin B1,wh-apex,apex.csv-root.zone-b,3,apex.csv-root.zone-b.bin-b1',
    ].join('\n');

    const result = await importLocationCsvText(csv, createLocation, {
      importError: 'Row {row}: {code} ({validation}) {message}',
      importSuccess: 'Imported {count} location rows.',
    });

    expect(createLocation).toHaveBeenCalledTimes(5);
    expect(createLocation).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        csvRowNumber: 3,
        level: 3,
        parentPath: 'apex.csv-root',
        path: 'apex.csv-root.bad-bin',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/row 3/i);
    expect(result.message).toContain('LEVEL_GAP');
    expect(result.message).toContain('V-SET-60');

    await renderLocationTree({
      createLocation,
      searchParams: { importStatus: 'error', importMessage: result.message },
    });
    expect(screen.getByLabelText(/csv file/i)).toHaveAttribute('type', 'file');
    expect(screen.getByRole('button', { name: /import csv/i })).toHaveAttribute('type', 'submit');
    const toast = screen.getByRole('alert');
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

type UpsertLocationInput = {
  id?: string;
  warehouseId: string;
  parentId: string | null;
  code: string;
  name: string;
  level: number;
  locationType: string;
  active?: boolean;
  barcode?: string | null;
};

type UpsertLocationResult =
  | { ok: true; data: { id: string; path: string; level: number } }
  | { ok: false; error: string };

type LocationModalCrudProps = Partial<LocationTreePageProps> & {
  canUpdateInfra?: boolean;
  upsertLocation?: (input: UpsertLocationInput) => Promise<UpsertLocationResult>;
  deleteLocation?: (input: { locationId: string; warehouseId: string }) => Promise<{ ok: boolean; error?: string; data?: { locationId: string; warehouseId: string } }>;
};

const REQUIRED_LOCATION_MODAL_LABEL_KEYS = Object.freeze([
  'addLocation',
  'editLocation',
  'addChild',
  'deleteLocation',
  'selectedLocation',
  'selectedParent',
  'selectedDepth',
  'selectedType',
  'selectedStatus',
  'lpsHere',
  'readOnly',
  'dialogAddTitle',
  'dialogEditTitle',
  'dialogDeleteTitle',
  'dialogDeleteBody',
  'fieldCode',
  'fieldName',
  'fieldParent',
  'fieldType',
  'fieldActive',
  'fieldBarcode',
  'depthExceeded',
  'cancel',
  'createLocation',
  'confirmDelete',
  'saveChanges',
]);

async function renderLocationModalCrud(overrides: LocationModalCrudProps = {}) {
  return renderLocationTree(overrides as Partial<LocationTreePageProps>);
}

function currentDialog() {
  return screen.getByRole('dialog');
}

describe('UI-SET-002 locations modal CRUD parity RED', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps modal CRUD and RBAC labels localized in settings.infra.locations for en/pl/ro/uk', async () => {
    await renderLocationModalCrud();

    expect(getTranslations).toHaveBeenCalledWith({ locale: 'en', namespace: 'settings.infra.locations' });

    for (const locale of ['en', 'pl', 'ro', 'uk'] as const) {
      const localePath = path.join(process.cwd(), 'messages', locale, '02-settings.json');
      const messages = JSON.parse(readFileSync(localePath, 'utf8')) as { infra?: { locations?: Record<string, unknown> } };
      const locationLabels = messages.infra?.locations;
      expect(locationLabels, `${localePath} must define settings.infra.locations`).toBeTruthy();
      for (const key of REQUIRED_LOCATION_MODAL_LABEL_KEYS) {
        expect(typeof locationLabels?.[key], `${localePath} missing translated locations.${key}`).toBe('string');
        expect(locationLabels?.[key], `${localePath} locations.${key} must not expose a raw key or blank fallback`).not.toMatch(/^$|settings\.infra\.locations\./);
      }
    }
  });

  it('renders prototype regions: primary Add location CTA, selected-location card actions, and LP table', async () => {
    await renderLocationModalCrud({ canUpdateInfra: true });

    expect(screen.getByRole('button', { name: /\+ add location/i })).toBeEnabled();
    expect(screen.getByRole('region', { name: /selected location/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /\+ child/i })).toBeEnabled();
    expect(screen.getByText(/LPs here/i)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /LPs at this location/i })).toBeInTheDocument();
  });

  it('opens Add location dialog with prototype fields, depth validator, and Create footer wired to upsertLocation', async () => {
    const user = userEvent.setup();
    const upsertLocation = vi.fn(async () => ({
      ok: true as const,
      data: { id: 'created-bin-c5', path: 'apex.z02.c5', level: 3 },
    }));
    await renderLocationModalCrud({ canUpdateInfra: true, upsertLocation });

    await user.click(screen.getByRole('button', { name: /\+ add location/i }));

    expect(within(currentDialog()).getByRole('heading', { name: /add location/i })).toBeInTheDocument();
    await user.type(within(currentDialog()).getByLabelText(/code/i), 'c5');
    await user.type(within(currentDialog()).getByLabelText(/^name/i), 'Cold Storage Bin C5');
    await user.click(within(currentDialog()).getByRole('combobox', { name: /parent location/i }));
    await user.click(screen.getByRole('option', { name: /apex › z02 › b01/i }));
    expect(within(currentDialog()).getByText(/maximum location depth/i)).toBeInTheDocument();
    expect(within(currentDialog()).getByRole('button', { name: /create location/i })).toBeDisabled();

    await user.click(within(currentDialog()).getByRole('combobox', { name: /parent location/i }));
    await user.click(screen.getByRole('option', { name: /apex › z02$/i }));
    await user.click(within(currentDialog()).getByRole('combobox', { name: /^type/i }));
    await user.click(screen.getByRole('option', { name: /^storage$/i }));
    await user.type(within(currentDialog()).getByLabelText(/barcode/i), 'LOC-C5');
    await user.click(within(currentDialog()).getByRole('button', { name: /create location/i }));

    await waitFor(() => expect(upsertLocation).toHaveBeenCalledTimes(1));
    expect(upsertLocation).toHaveBeenCalledWith(expect.objectContaining({
      code: 'C5',
      name: 'Cold Storage Bin C5',
      parentId: 'zone-a02',
      locationType: 'storage',
      barcode: 'LOC-C5',
    }));
  });

  it('opens a delete confirmation and calls deleteLocation scoped to the selected warehouse', async () => {
    const user = userEvent.setup();
    const deleteLocation = vi.fn(async () => ({
      ok: true as const,
      data: { locationId: 'root-apex', warehouseId: 'wh-apex' },
    }));
    await renderLocationModalCrud({ canUpdateInfra: true, deleteLocation });

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(within(currentDialog()).getByRole('heading', { name: /delete location/i })).toBeInTheDocument();
    expect(within(currentDialog()).getByText(/apex dairy warehouse/i)).toBeInTheDocument();
    await user.click(within(currentDialog()).getByRole('button', { name: /delete location/i }));

    await waitFor(() => expect(deleteLocation).toHaveBeenCalledTimes(1));
    expect(deleteLocation).toHaveBeenCalledWith({ locationId: 'root-apex', warehouseId: 'wh-apex' });
  });

  it('shows an explicit read-only state and suppresses modal-opening controls without settings.infra.update', async () => {
    await renderLocationModalCrud({ canUpdateInfra: false });

    expect(screen.getByText(/read-only.*settings\.infra\.update/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+ add location/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+ child/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
