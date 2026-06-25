/**
 * @vitest-environment jsdom
 * T-106 / SET-016 — Machine List screen.
 *
 * RED phase: page-level RTL tests for status indicators, ltree-derived
 * location breadcrumbs, status filtering, bulk deactivate wiring, and RBAC.
 * A missing production page renders an empty placeholder so RED fails on
 * behavior assertions instead of module-resolution noise.
 */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getTranslations } from 'next-intl/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const labels: Record<string, string> = {
  title: 'Machines',
  subtitle: 'Manage equipment status, location, and infrastructure availability.',
  status: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusOffline: 'Offline',
  statusMaintenance: 'Maintenance',
  locationBreadcrumb: 'Location breadcrumb',
  columnName: 'Machine',
  columnCode: 'Code',
  columnStatus: 'Status',
  columnLocation: 'Location',
  bulkActivate: 'Bulk Activate',
  bulkDeactivate: 'Bulk Deactivate',
  addMachine: 'Add machine',
  dialogAddTitle: 'Add machine',
  fieldCode: 'Code',
  fieldName: 'Name',
  fieldMachineType: 'Machine type',
  fieldLocation: 'Location',
  locationUnplaced: 'Unplaced (no location)',
  createMachine: 'Create machine',
  createMachinePending: 'Creating…',
  cancel: 'Cancel',
  createMachineSuccess: 'Machine created.',
  createMachineFailed: 'Machine could not be created.',
  noLocationsAvailable: 'No bin-level locations yet — the machine will be created unplaced. Add locations later to assign it.',
  deactivated: 'Deactivated',
  insufficientPermission:
    'Insufficient permissions: settings.infra.update is required to activate or deactivate machines.',
};

const REQUIRED_MACHINE_LABEL_KEYS = Object.freeze([
  'title',
  'subtitle',
  'sectionTitle',
  'toolbarLabel',
  'status',
  'warehouse',
  'statusAll',
  'warehouseAll',
  'statusActive',
  'statusOffline',
  'statusMaintenance',
  'locationBreadcrumb',
  'columnSelect',
  'columnName',
  'columnCode',
  'columnStatus',
  'columnLocation',
  'columnDeactivated',
  'bulkActivate',
  'bulkActivatePending',
  'bulkDeactivate',
  'bulkDeactivatePending',
  'addMachine',
  'dialogAddTitle',
  'fieldCode',
  'fieldName',
  'fieldMachineType',
  'fieldLocation',
  'createMachine',
  'createMachinePending',
  'cancel',
  'createMachineSuccess',
  'createMachineFailed',
  'noLocationsAvailable',
  'locationUnplaced',
  'deactivated',
  'selectMachine',
  'insufficientPermission',
  'loading',
  'empty',
  'error',
  'forbidden',
  'actionError',
  'provenance',
]);

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => labels[key] ?? key),
}));

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

type MachineStatus = 'active' | 'offline' | 'maintenance';

type LocationRow = {
  id: string;
  warehouseId: string;
  path: string;
  name: string;
  level?: number;
};

type MachineRow = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  locationId: string;
  locationPath: string;
  specs: { status: MachineStatus };
  deactivated_at: string | null;
};

type MachineActionInput = { machineId: string };

type MachineActionResult = {
  ok: true;
  data: { machineId: string; deactivated_at?: string | null };
};

type MachinesPageProps = {
  params?: Promise<{ locale: string }>;
  machines?: MachineRow[];
  locations?: LocationRow[];
  canUpdateInfra?: boolean;
  createMachine?: (input: { code: string; name: string; machineType: string; locationId: string | null }) => Promise<{ ok: true; data: { id: string; locationId: string | null; status: string } } | { ok: false; error?: string }>;
  deactivateMachine?: (input: MachineActionInput) => Promise<MachineActionResult>;
  activateMachine?: (input: MachineActionInput) => Promise<MachineActionResult>;
};

type MachinesPage = (props: MachinesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const locations: LocationRow[] = [
  { id: 'loc-apex', warehouseId: 'wh-apex', path: 'apex', name: 'Apex Dairy Warehouse' },
  { id: 'loc-apex-chilled', warehouseId: 'wh-apex', path: 'apex.chilled', name: 'Chilled Warehouse' },
  { id: 'loc-apex-chilled-zone-a', warehouseId: 'wh-apex', path: 'apex.chilled.zone_a', name: 'Zone A' },
  {
    id: 'loc-apex-chilled-zone-a-line-01',
    warehouseId: 'wh-apex',
    path: 'apex.chilled.zone_a.line_01',
    name: 'Line 01',
  },
  { id: 'loc-apex-ambient', warehouseId: 'wh-apex', path: 'apex.ambient', name: 'Ambient Warehouse' },
  { id: 'loc-apex-ambient-zone-b', warehouseId: 'wh-apex', path: 'apex.ambient.zone_b', name: 'Zone B' },
  {
    id: 'loc-apex-ambient-zone-b-cell-04',
    warehouseId: 'wh-apex',
    path: 'apex.ambient.zone_b.cell_04',
    name: 'Cell 04',
  },
  { id: 'loc-north', warehouseId: 'wh-north', path: 'north', name: 'North Warehouse' },
  { id: 'loc-north-cold', warehouseId: 'wh-north', path: 'north.cold', name: 'Cold Store' },
  { id: 'loc-north-cold-zone-c', warehouseId: 'wh-north', path: 'north.cold.zone_c', name: 'Zone C' },
  {
    id: 'loc-north-cold-zone-c-cell-02',
    warehouseId: 'wh-north',
    path: 'north.cold.zone_c.cell_02',
    name: 'Cell 02',
  },
  { id: 'loc-north-dry', warehouseId: 'wh-north', path: 'north.dry', name: 'Dry Store' },
  { id: 'loc-north-dry-zone-d', warehouseId: 'wh-north', path: 'north.dry.zone_d', name: 'Zone D' },
  {
    id: 'loc-north-dry-zone-d-cell-08',
    warehouseId: 'wh-north',
    path: 'north.dry.zone_d.cell_08',
    name: 'Cell 08',
  },
];

const machines: MachineRow[] = [
  {
    id: 'machine-pasteurizer-01',
    code: 'MC-PAST-01',
    name: 'Pasteurizer 01',
    warehouseId: 'wh-apex',
    locationId: 'loc-apex-chilled-zone-a-line-01',
    locationPath: 'apex.chilled.zone_a.line_01',
    specs: { status: 'active' },
    deactivated_at: null,
  },
  {
    id: 'machine-filler-02',
    code: 'MC-FILL-02',
    name: 'Filler 02',
    warehouseId: 'wh-apex',
    locationId: 'loc-apex-ambient-zone-b-cell-04',
    locationPath: 'apex.ambient.zone_b.cell_04',
    specs: { status: 'maintenance' },
    deactivated_at: null,
  },
  {
    id: 'machine-cip-03',
    code: 'MC-CIP-03',
    name: 'CIP Skid 03',
    warehouseId: 'wh-north',
    locationId: 'loc-north-cold-zone-c-cell-02',
    locationPath: 'north.cold.zone_c.cell_02',
    specs: { status: 'maintenance' },
    deactivated_at: null,
  },
  {
    id: 'machine-palletizer-04',
    code: 'MC-PAL-04',
    name: 'Palletizer 04',
    warehouseId: 'wh-north',
    locationId: 'loc-north-dry-zone-d-cell-08',
    locationPath: 'north.dry.zone_d.cell_08',
    specs: { status: 'offline' },
    deactivated_at: null,
  },
  {
    id: 'machine-washer-05',
    code: 'MC-WASH-05',
    name: 'Crate Washer 05',
    warehouseId: 'wh-apex',
    locationId: 'loc-apex-chilled-zone-a-line-01',
    locationPath: 'apex.chilled.zone_a.line_01',
    specs: { status: 'active' },
    deactivated_at: null,
  },
];

async function loadMachinesPage(): Promise<MachinesPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-016 machines page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as MachinesPage;
  } catch {
    return function MissingMachinesPage() {
      return React.createElement('main', { 'data-testid': 'missing-machines-page' });
    };
  }
}

async function renderMachinesPage(overrides: Partial<MachinesPageProps> = {}) {
  const Page = await loadMachinesPage();
  const props: MachinesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    machines,
    locations,
    canUpdateInfra: true,
    deactivateMachine: vi.fn(async (input: MachineActionInput) => ({
      ok: true as const,
      data: { machineId: input.machineId, deactivated_at: '2026-05-24T10:00:00.000Z' },
    })),
    activateMachine: vi.fn(async (input: MachineActionInput) => ({
      ok: true as const,
      data: { machineId: input.machineId, deactivated_at: null },
    })),
    createMachine: vi.fn(async () => ({
      ok: true as const,
      data: { id: 'machine-new', locationId: locations[3].id, status: 'active' },
    })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function machineTable() {
  return screen.getByRole('table', { name: /machines/i });
}

function machineRows() {
  return screen.getAllByTestId('settings-machine-row');
}

function rowFor(name: RegExp | string) {
  return within(machineTable()).getByRole('row', { name });
}

function expectBreadcrumb(row: HTMLElement, crumbs: string[]) {
  const breadcrumb = within(row).getByRole('navigation', { name: /location breadcrumb/i });
  const crumbItems = within(breadcrumb).getAllByRole('listitem');
  expect(crumbItems).toHaveLength(4);
  expect(crumbItems.map((item) => item.textContent)).toEqual(crumbs.map((crumb) => expect.stringContaining(crumb)));
  expect(breadcrumb).toHaveTextContent(new RegExp(crumbs.join('.*'), 'i'));
}

async function chooseStatus(user: ReturnType<typeof userEvent.setup>, statusName: RegExp) {
  const filter = screen.getByRole('combobox', { name: /status/i });
  if (filter instanceof HTMLSelectElement) {
    const option = within(filter).getByRole('option', { name: statusName }) as HTMLOptionElement;
    await user.selectOptions(filter, option.value);
    return;
  }

  await user.click(filter);
  await user.click(screen.getByRole('option', { name: statusName }));
}

async function selectMachines(user: ReturnType<typeof userEvent.setup>, names: string[]) {
  for (const name of names) {
    const row = rowFor(new RegExp(name, 'i'));
    await user.click(within(row).getByRole('checkbox', { name: new RegExp(`select.*${name}`, 'i') }));
  }
}

describe('SET-016 machines i18n and AppShell route contract', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('defines the user-visible localized AppShell route instead of only a legacy settings route', () => {
    const canonicalRoute = path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/infra/machines/page.tsx');
    const legacyRoute = path.join(process.cwd(), 'app/[locale]/(admin)/settings/infra/machines/page.tsx');

    expect(
      existsSync(canonicalRoute),
      'R-F10-004 must keep /en/settings/infra/machines under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(existsSync(legacyRoute), 'Legacy body-only settings route must not be the only implementation').toBe(false);
  });

  it('requests the canonical settings.infra.machines namespace at render time', async () => {
    await renderMachinesPage();

    expect(getTranslations).toHaveBeenCalledWith({ locale: 'en', namespace: 'settings.infra.machines' });
    expect(getTranslations).not.toHaveBeenCalledWith({ locale: 'en', namespace: 'settings.infra_machines' });
  });

  it('provides every machine page label in settings.infra.machines for en/pl/ro/uk locale messages', () => {
    const localeCodes = ['en', 'pl', 'ro', 'uk'] as const;

    for (const locale of localeCodes) {
      const localePath = path.join(process.cwd(), 'messages', locale, '02-settings.json');
      const messages = JSON.parse(readFileSync(localePath, 'utf8')) as {
        infra?: { machines?: Record<string, unknown> };
      };
      const machineLabels = messages.infra?.machines;

      expect(machineLabels, `${localePath} must define settings.infra.machines`).toBeTruthy();
      expect(Object.keys(machineLabels ?? {}).sort(), `${localePath} must cover the full machines label set`).toEqual(
        [...REQUIRED_MACHINE_LABEL_KEYS].sort(),
      );
      for (const key of REQUIRED_MACHINE_LABEL_KEYS) {
        expect(typeof machineLabels?.[key], `${localePath} key ${key} must be a localized string`).toBe('string');
        expect(machineLabels?.[key], `${localePath} key ${key} must not be blank`).not.toBe('');
      }
    }
  });
});

describe('SET-016 machine list behavior', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses a server page for i18n/data and a real client island for interactive controls', () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/infra/machines/page.tsx'),
      'utf8',
    );
    const clientSource = readFileSync(
      path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/infra/machines/machines-list-screen.client.tsx'),
      'utf8',
    );

    expect(pageSource).toContain("getTranslations({ locale, namespace: 'settings.infra.machines' })");
    expect(pageSource).not.toContain('settings.infra_machines');
    expect(pageSource).toContain("from './machines-list-screen.client'");
    expect(pageSource).toContain('withOrgContext');
    expect(pageSource).not.toContain('React.useState');
    expect(pageSource).not.toContain('document.querySelector');
    expect(pageSource).not.toContain('data-testid="app-shell"');
    expect(pageSource).not.toContain("data-testid': 'app-shell'");

    expect(clientSource).toContain("'use client';");
    expect(clientSource).toContain("from '@monopilot/ui/Badge'");
    expect(clientSource).toContain("from '@monopilot/ui/Table'");
    expect(clientSource).toContain("from '@monopilot/ui/Select'");
    expect(clientSource).toContain("from '@monopilot/ui/Button'");
    expect(clientSource).toContain("from '@monopilot/ui/Checkbox'");
    expect(clientSource).not.toContain('document.querySelector');
  });

  it('renders 5 machine rows with status indicators and 4-segment ltree breadcrumbs', async () => {
    await renderMachinesPage();

    expect(screen.getByRole('heading', { name: /^machines$/i })).toBeInTheDocument();
    expect(machineRows()).toHaveLength(5);

    const pasteurizer = rowFor(/pasteurizer 01.*MC-PAST-01.*active/i);
    const activeBadge = within(pasteurizer).getByText(/^active$/i);
    expect(activeBadge).toHaveAccessibleName(/active/i);
    expect(activeBadge).toHaveAttribute('data-slot', 'badge');
    expectBreadcrumb(pasteurizer, ['Apex Dairy Warehouse', 'Chilled Warehouse', 'Zone A', 'Line 01']);

    const filler = rowFor(/filler 02.*MC-FILL-02.*maintenance/i);
    const maintenanceBadge = within(filler).getByText(/^maintenance$/i);
    expect(maintenanceBadge).toHaveAccessibleName(/maintenance/i);
    expect(maintenanceBadge).toHaveAttribute('data-slot', 'badge');
    expectBreadcrumb(filler, ['Apex Dairy Warehouse', 'Ambient Warehouse', 'Zone B', 'Cell 04']);

    const palletizer = rowFor(/palletizer 04.*MC-PAL-04.*offline/i);
    const offlineBadge = within(palletizer).getByText(/^offline$/i);
    expect(offlineBadge).toHaveAccessibleName(/offline/i);
    expect(offlineBadge).toHaveAttribute('data-slot', 'badge');
    expectBreadcrumb(palletizer, ['North Warehouse', 'Dry Store', 'Zone D', 'Cell 08']);
  });

  it("filters the visible rows to machines whose specs.status is 'maintenance'", async () => {
    const user = userEvent.setup();
    await renderMachinesPage();

    await chooseStatus(user, /^maintenance$/i);

    expect(machineRows()).toHaveLength(2);
    expect(rowFor(/filler 02.*maintenance/i)).toBeInTheDocument();
    expect(rowFor(/cip skid 03.*maintenance/i)).toBeInTheDocument();
    expect(within(machineTable()).queryByRole('row', { name: /pasteurizer 01/i })).not.toBeInTheDocument();
    expect(within(machineTable()).queryByRole('row', { name: /palletizer 04/i })).not.toBeInTheDocument();
  });

  it('bulk-deactivates 3 selected machines through T-029 deactivateMachine and reflects deactivated_at in each row', async () => {
    const user = userEvent.setup();
    const deactivateMachine = vi.fn(async (input: MachineActionInput) => ({
      ok: true as const,
      data: { machineId: input.machineId, deactivated_at: '2026-05-24T10:00:00.000Z' },
    }));
    await renderMachinesPage({ deactivateMachine });

    await selectMachines(user, ['Pasteurizer 01', 'Filler 02', 'CIP Skid 03']);
    await user.click(screen.getByRole('button', { name: /bulk deactivate/i }));

    await waitFor(() => expect(deactivateMachine).toHaveBeenCalledTimes(3));
    for (const selected of machines.slice(0, 3)) {
      expect(deactivateMachine).toHaveBeenCalledWith({ machineId: selected.id });
      const row = rowFor(new RegExp(selected.name, 'i'));
      expect(row).toHaveTextContent(/deactivated/i);
      expect(row).toHaveTextContent(/2026-05-24/);
    }
    // The list reconciles with the server of record after the bulk mutation.
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('disables bulk action buttons with an explanatory aria-label when settings.infra.update is missing', async () => {
    await renderMachinesPage({ canUpdateInfra: false });

    for (const buttonName of [/bulk activate/i, /bulk deactivate/i]) {
      const button = screen.getByRole('button', { name: buttonName });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleName(/insufficient permissions.*settings\.infra\.update/i);
    }
  });

  it('opens Add machine modal and creates a machine against the selected location', async () => {
    const user = userEvent.setup();
    const createMachine = vi.fn(async () => ({
      ok: true as const,
      data: { id: 'machine-new-filler', locationId: locations[3].id, status: 'active' },
    }));
    await renderMachinesPage({ createMachine });

    await user.click(screen.getByRole('button', { name: /^add machine$/i }));
    const dialog = await screen.findByRole('dialog', { name: /^add machine$/i });
    await user.type(within(dialog).getByLabelText(/^code$/i), 'MC-FILL-99');
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Filler 99');
    await user.type(within(dialog).getByLabelText(/^machine type$/i), 'filler');
    await user.click(within(dialog).getByRole('combobox', { name: /^location$/i }));
    await user.click(screen.getByRole('option', { name: locations[3].path }));
    await user.click(within(dialog).getByRole('button', { name: /^create machine$/i }));

    await waitFor(() => expect(createMachine).toHaveBeenCalledWith({
      code: 'MC-FILL-99',
      name: 'Filler 99',
      machineType: 'filler',
      locationId: locations[3].id,
    }));
    expect(rowFor(/filler 99.*mc-fill-99.*active/i)).toBeInTheDocument();
    // Canonical settings round-trip: the list refreshes from the server of record
    // after a create so the optimistic row reconciles with the persisted machine.
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('creates an UNPLACED machine on a fresh org with zero locations (the create-line/create-machine bootstrap bug)', async () => {
    const user = userEvent.setup();
    const createMachine = vi.fn(async () => ({
      ok: true as const,
      data: { id: 'machine-bootstrap-01', locationId: null, status: 'active' },
    }));
    await renderMachinesPage({ machines: [], locations: [], createMachine, state: 'empty' });

    await user.click(screen.getByRole('button', { name: /^add machine$/i }));
    const dialog = await screen.findByRole('dialog', { name: /^add machine$/i });

    // No bin-level locations exist, yet creation is NOT blocked — the location
    // Select defaults to "Unplaced" and Create machine stays enabled.
    const createButton = within(dialog).getByRole('button', { name: /^create machine$/i });
    expect(createButton).toBeEnabled();
    expect(within(dialog).getByText(/will be created unplaced/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/^code$/i), 'MX-01');
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Mixer 01');
    await user.type(within(dialog).getByLabelText(/^machine type$/i), 'mixer');
    await user.click(createButton);

    await waitFor(() => expect(createMachine).toHaveBeenCalledWith({
      code: 'MX-01',
      name: 'Mixer 01',
      machineType: 'mixer',
      locationId: null,
    }));
    expect(rowFor(/mixer 01.*mx-01.*active/i)).toBeInTheDocument();
  });
});
