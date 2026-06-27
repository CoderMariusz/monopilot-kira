/**
 * @vitest-environment jsdom
 * T-104 / SET-012-warehouse — Warehouse List screen.
 *
 * RED phase: pin sort/filter/bulk deactivate/soft-warning/RBAC behavior.
 * Missing production page modules render an empty placeholder so RED reports
 * behavior assertion failures instead of module-resolution noise.
 */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';


const { withOrgContextMock, createWarehouseActionMock, deactivateWarehouseActionMock, updateStorageRulesActionMock } = vi.hoisted(() => ({
  withOrgContextMock: vi.fn(),
  createWarehouseActionMock: vi.fn(async () => ({ ok: false as const, error: 'invalid_input' })),
  deactivateWarehouseActionMock: vi.fn(async (input: DeactivateWarehouseInput) => ({
    ok: true as const,
    data: { warehouseId: input.warehouseId, deactivated_at: '2026-05-24T10:00:00.000Z' },
  })),
  updateStorageRulesActionMock: vi.fn(async (input: UpdateStorageRulesInput) => ({
    ok: true as const,
    data: {
      warehouseId: input.warehouseId,
      binAssignmentStrategy: input.binAssignmentStrategy ?? 'FEFO',
      mixedLotBins: input.mixedLotBins ?? false,
      expiryWarningDays: input.expiryWarningDays ?? 7,
      blockExpiredStock: input.blockExpiredStock ?? true,
    },
  })),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

vi.mock('../../../../../../../actions/infra/warehouse', () => ({
  createWarehouse: createWarehouseActionMock,
  deactivateWarehouse: deactivateWarehouseActionMock,
  updateWarehouseStorageRules: updateStorageRulesActionMock,
}));

const labels: Record<string, string> = {
  title: 'Warehouses',
  subtitle: 'Manage warehouse master data, status, and infrastructure availability.',
  status: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusDeactivated: 'Deactivated',
  columnName: 'Warehouse',
  columnCode: 'Code',
  columnStatus: 'Status',
  bulkDeactivate: 'Bulk Deactivate',
  softWarningTitle: 'Active work orders reference this warehouse',
  softWarningCode: 'SOFT_WARNING_ACTIVE_WO',
  softWarningBody: 'Active work orders still reference this warehouse. Confirm to deactivate anyway.',
  cancel: 'Cancel',
  confirmDeactivate: 'Confirm deactivation',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to deactivate warehouses.',
  storageRules: 'Storage rules',
  storageRulesSubtitle: 'How the system assigns bins and manages expiry.',
  binAssignmentStrategy: 'Bin assignment strategy',
  binAssignmentFefo: 'FEFO (First expired, first out)',
  binAssignmentFifo: 'FIFO (First in, first out)',
  binAssignmentLifo: 'LIFO',
  binAssignmentManual: 'Manual',
  mixedLotBins: 'Mixed lot bins',
  mixedLotBinsHint: 'Allow different lots in the same bin.',
  expiryWarningThreshold: 'Expiry warning threshold',
  expiryWarningThresholdHint: 'Alert when stock is within this many days of expiry.',
  blockExpiredStock: 'Block expired stock',
  blockExpiredStockHint: 'Prevent movements of expired lots automatically.',
  storageRulesWarehousePicker: 'Warehouse',
  storageRulesWarehousePickerHint: 'Select a warehouse to view and edit its storage rules.',
  storageRulesNoWarehouse: 'Add a warehouse to configure its storage rules.',
  storageRulesSelectedHint: 'Storage rules for {name}. These apply to this warehouse only.',
  saveStorageRules: 'Save storage rules',
  saveStorageRulesPending: 'Saving…',
  storageRulesSaved: 'Storage rules saved.',
  storageRulesSaveFailed: 'Storage rules could not be saved. Try again or contact an administrator.',
  editStorageRules: 'Edit storage rules for {name}',
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async ({ namespace }: { namespace: string }) => (key: string) => labels[key] ?? `${namespace}.${key}`),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

type BinAssignmentStrategy = 'FEFO' | 'FIFO' | 'LIFO' | 'Manual';

type WarehouseStorageRules = {
  binAssignmentStrategy: BinAssignmentStrategy;
  mixedLotBins: boolean;
  expiryWarningDays: number;
  blockExpiredStock: boolean;
};

type Warehouse = {
  id: string;
  code: string;
  name: string;
  deactivated_at: string | null;
  active_wo_count: number;
  storageRules?: WarehouseStorageRules | null;
};

type WarehouseSiteOption = {
  id: string;
  name: string;
};

type DeactivateWarehouseInput = {
  warehouseId: string;
  force?: boolean;
};

type UpdateStorageRulesInput = { warehouseId: string } & Partial<WarehouseStorageRules>;
type UpdateStorageRulesResult =
  | { ok: true; data: { warehouseId: string } & WarehouseStorageRules }
  | { ok: false; error?: string };

type DeactivateWarehouseResult =
  | { ok: true; data: { warehouseId: string; deactivated_at: string } }
  | {
      ok: false;
      code: 'SOFT_WARNING_ACTIVE_WO';
      warning: { code: 'SOFT_WARNING_ACTIVE_WO'; activeWoCount: number };
    };

type WarehousePageProps = {
  params?: Promise<{ locale: string }>;
  warehouses?: Warehouse[];
  sites?: WarehouseSiteOption[];
  canUpdateInfra?: boolean;
  createWarehouse?: (input: CreateWarehouseInput) => Promise<CreateWarehouseResult>;
  deactivateWarehouse?: (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>;
  updateStorageRules?: (input: UpdateStorageRulesInput) => Promise<UpdateStorageRulesResult>;
};

type CreateWarehouseInput = {
  code: string;
  name: string;
  site_id: string;
  address?: string | null;
};

type CreateWarehouseResult =
  | { ok: true; data: Warehouse }
  | { ok: false; error?: string };

type WarehousesPage = (props: WarehousePageProps) => React.ReactNode | Promise<React.ReactNode>;

const activeWarehouseNames = ['Apex Chilled', 'Apex Ambient', 'Apex Frozen'];

type PrototypeParityWarehouse = Warehouse & {
  site: string;
  zones: number;
  bins: number;
  capacity: string;
  usedPercent: number;
};

const prototypeParityWarehouses = [
  {
    id: '00000000-0000-4000-8000-000000000501',
    code: 'WH-LIVE-01',
    name: 'Live chilled warehouse',
    deactivated_at: null,
    active_wo_count: 0,
    site: 'Kraków HQ',
    zones: 6,
    bins: 842,
    capacity: '1,200 plt',
    usedPercent: 68,
  },
] satisfies PrototypeParityWarehouse[];

const sampleSites: WarehouseSiteOption[] = [
  { id: '00000000-0000-4000-8000-000000000701', name: 'Kraków HQ' },
  { id: '00000000-0000-4000-8000-000000000702', name: 'Poznań DC' },
];

const warehouses: Warehouse[] = Array.from({ length: 25 }, (_, index) => {
  const rowNumber = index + 1;
  const active = rowNumber <= 18;
  const knownNames: Record<number, string> = {
    1: 'Apex Chilled',
    2: 'Apex Ambient',
    3: 'Apex Frozen',
    4: 'Apex WO Hold',
    21: 'Closed Spare Warehouse',
  };
  // Distinct per-warehouse storage rules so the editor can be asserted to scope per row.
  const storageRules: Record<number, WarehouseStorageRules> = {
    1: { binAssignmentStrategy: 'FEFO', mixedLotBins: false, expiryWarningDays: 7, blockExpiredStock: true },
    2: { binAssignmentStrategy: 'LIFO', mixedLotBins: true, expiryWarningDays: 30, blockExpiredStock: false },
  };
  return {
    id: `00000000-0000-4000-8000-${String(rowNumber).padStart(12, '0')}`,
    code: `WH-${String(rowNumber).padStart(2, '0')}`,
    name: knownNames[rowNumber] ?? `Warehouse ${String(rowNumber).padStart(2, '0')}`,
    deactivated_at: active ? null : `2026-05-${String(rowNumber - 18).padStart(2, '0')}T08:00:00.000Z`,
    active_wo_count: rowNumber === 4 ? 2 : 0,
    storageRules: storageRules[rowNumber] ?? null,
  };
});

async function loadWarehousesPage(): Promise<WarehousesPage> {
  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'SET-012 warehouse page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return mod.default as WarehousesPage;
}

async function renderWarehousesPage(overrides: Partial<WarehousePageProps> = {}) {
  const Page = await loadWarehousesPage();
    const props: WarehousePageProps = {
      params: Promise.resolve({ locale: 'en' }),
      warehouses,
      sites: sampleSites,
      canUpdateInfra: true,
      createWarehouse: vi.fn(async (input: CreateWarehouseInput) => ({
        ok: true as const,
        data: {
          id: '00000000-0000-4000-8000-000000000778',
          code: input.code,
          name: input.name,
          site: sampleSites.find((site) => site.id === input.site_id)?.name ?? null,
          address: input.address ?? null,
          deactivated_at: null,
          active_wo_count: 0,
        },
      })),
    deactivateWarehouse: vi.fn(async (input: DeactivateWarehouseInput) => ({
      ok: true as const,
      data: { warehouseId: input.warehouseId, deactivated_at: '2026-05-24T10:00:00.000Z' },
    })),
    updateStorageRules: vi.fn(async (input: UpdateStorageRulesInput) => ({
      ok: true as const,
      data: {
        warehouseId: input.warehouseId,
        binAssignmentStrategy: input.binAssignmentStrategy ?? 'FEFO',
        mixedLotBins: input.mixedLotBins ?? false,
        expiryWarningDays: input.expiryWarningDays ?? 7,
        blockExpiredStock: input.blockExpiredStock ?? true,
      },
    })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function warehouseTable() {
  return screen.getByRole('table', { name: /warehouses/i });
}

function warehouseRows() {
  return screen.getAllByTestId('settings-warehouse-row');
}

function rowFor(name: RegExp | string) {
  return within(warehouseTable()).getByRole('row', { name });
}

function expectNoRawSettingsKeys() {
  expect(document.body.textContent ?? '').not.toMatch(/settings\.infra\.warehouses\.[a-zA-Z_]+/);
}

async function selectWarehouses(user: ReturnType<typeof userEvent.setup>, names: string[]) {
  for (const name of names) {
    const row = rowFor(new RegExp(name, 'i'));
    await user.click(within(row).getByRole('checkbox', { name: new RegExp(`select.*${name}`, 'i') }));
  }
}

describe('SET-012 warehouse AppShell route contract', () => {
  it('defines the user-visible localized AppShell route instead of only a legacy settings route', () => {
    const canonicalRoute = join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/infra/warehouses/page.tsx');
    const legacyRoute = join(process.cwd(), 'app/[locale]/(admin)/settings/infra/warehouses/page.tsx');

    expect(
      existsSync(canonicalRoute),
      'T-104 must implement /en/settings/infra/warehouses under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(existsSync(legacyRoute), 'Legacy body-only settings route must not be the only implementation').toBe(false);
  });

  it('keeps the page server-rendered, isolates hooks in a client leaf, and resolves real production imports', async () => {
    const sourceDir = join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/infra/warehouses');
    const pageSource = readFileSync(join(sourceDir, 'page.tsx'), 'utf8');
    const clientSource = readFileSync(join(sourceDir, 'warehouse-list-screen.client.tsx'), 'utf8');
    const actionModule = await vi.importActual<Record<string, unknown>>('../../../../../../../actions/infra/warehouse');
    const orgContextModule = await vi.importActual<Record<string, unknown>>('../../../../../../../lib/auth/with-org-context');

    expect(pageSource).not.toMatch(/^['"]use client['"]/m);
    expect(pageSource).toContain("from './warehouse-list-screen.client'");
    expect(clientSource).toMatch(/^['"]use client['"]/m);
    expect(existsSync(join(process.cwd(), 'actions/infra/warehouse.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'lib/auth/with-org-context.ts'))).toBe(true);
    expect(actionModule.deactivateWarehouse).toEqual(expect.any(Function));
    expect(orgContextModule.withOrgContext).toEqual(expect.any(Function));
    expect(pageSource).not.toMatch(/\bw\.deactivated_at\b/);
    expect(pageSource).toContain("w.address->>'deactivated_at'");
    expect(pageSource).toContain("to_regclass('public.work_orders')");
  });

  it('uses the withOrgContext-scoped loader when warehouses props are not injected', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes("to_regclass('public.work_orders')")) return { rows: [{ ok: false }] };
      if (sql.includes('from public.warehouses')) {
        return {
          rows: [
            {
              id: warehouses[0].id,
              code: warehouses[0].code,
              name: warehouses[0].name,
              address_label: 'Dock 1, Warsaw, PL',
              deactivated_at: null,
              active_wo_count: 0,
            },
          ],
        };
      }
      return { rows: [] };
    });
    withOrgContextMock.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({
        userId: '00000000-0000-4000-8000-000000000999',
        orgId: '00000000-0000-4000-8000-000000000998',
        client: { query },
      }),
    );

    const Page = await loadWarehousesPage();
    const node = await Page({ params: Promise.resolve({ locale: 'en' }) });
    render(React.createElement(React.Fragment, null, node));

    expect(withOrgContextMock).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('from public.warehouses'), []);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('public.work_orders wo'), expect.anything());
    expect(screen.getByRole('row', { name: /apex chilled wh-01 active/i })).toBeInTheDocument();
    expectNoRawSettingsKeys();
  });
});

describe('UI-SET-001 warehouse prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('matches the prototype page head, primary CTA, table columns, usage presentation, and storage rules regions', async () => {
    await renderWarehousesPage({ warehouses: prototypeParityWarehouses as Warehouse[] });

    // Prototype PageHead renders the title in .sg-title (not an <h1>); assert that DS structure.
    const pageTitle = document.querySelector('.sg-head .sg-title');
    expect(pageTitle).toHaveTextContent(/^warehouses$/i);
    expect(screen.getByText(/zones, bin locations, and storage rules/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^\+ add warehouse$/i })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /add warehouse/i })).not.toBeInTheDocument();

    const table = warehouseTable();
    for (const header of ['Code', 'Name', 'Site', 'Zones', 'Bins', 'Capacity', 'Used', 'Status']) {
      expect(within(table).getByRole('columnheader', { name: new RegExp(`^${header}$`, 'i') })).toBeInTheDocument();
    }

    const row = within(table).getByRole('row', { name: /WH-LIVE-01.*Live chilled warehouse.*Kraków HQ.*6.*842.*1,200 plt.*68%.*Active/i });
    expect(within(row).getByText('68%')).toBeInTheDocument();
    expect(within(row).getByTestId('warehouse-usage-bar')).toHaveAttribute('aria-valuenow', '68');

    // Storage rules now sits in a shared Section scoped to the selected warehouse: a labelled
    // region (role=region + aria-labelledby -> .sg-section-title) titled "Storage rules — <code>".
    expect(screen.getByRole('region', { name: /^storage rules — WH-LIVE-01$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^warehouse$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bin assignment strategy/i)).toBeInTheDocument();
    expect(screen.getByText(/mixed lot bins/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/expiry warning threshold/i)).toBeInTheDocument();
    expect(screen.getByText(/block expired stock/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save storage rules$/i })).toBeInTheDocument();
    expectNoRawSettingsKeys();
  });

  it('opens a prototype-style Add warehouse dialog from the header CTA and persists through the real create action prop', async () => {
    const user = userEvent.setup();
    const createWarehouse = vi.fn(async (input: CreateWarehouseInput) => ({
      ok: true as const,
      data: {
        id: '00000000-0000-4000-8000-000000000777',
        code: input.code,
        name: input.name,
        address: input.address ?? null,
        deactivated_at: null,
        active_wo_count: 0,
        site: 'Kraków HQ',
        zones: 0,
        bins: 0,
        capacity: '0 plt',
        usedPercent: 0,
      } as Warehouse,
    }));
    await renderWarehousesPage({ warehouses: prototypeParityWarehouses as Warehouse[], createWarehouse });

    await user.click(screen.getByRole('button', { name: /^\+ add warehouse$/i }));

    const dialog = screen.getByRole('dialog', { name: /^add warehouse$/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await user.type(within(dialog).getByLabelText(/^code$/i), 'WH-LIVE-02');
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Live frozen warehouse');
    await user.click(within(dialog).getByRole('combobox', { name: /^site$/i }));
    await user.click(screen.getByRole('option', { name: /^kraków hq$/i }));
    await user.click(within(dialog).getByRole('button', { name: /^create warehouse$/i }));

    await waitFor(() => expect(createWarehouse).toHaveBeenCalledTimes(1));
    expect(createWarehouse).toHaveBeenCalledWith(expect.objectContaining({ code: 'WH-LIVE-02', name: 'Live frozen warehouse', site_id: sampleSites[0].id }));
    expect(screen.queryByRole('dialog', { name: /^add warehouse$/i })).not.toBeInTheDocument();
    expect(within(warehouseTable()).getByRole('row', { name: /WH-LIVE-02.*Live frozen warehouse.*Active/i })).toBeInTheDocument();
    expectNoRawSettingsKeys();
  });

  it('rejects Add warehouse submission when no site is selected', async () => {
    const user = userEvent.setup();
    const createWarehouse = vi.fn(async () => ({ ok: false as const, error: 'invalid_input' }));
    await renderWarehousesPage({ warehouses: prototypeParityWarehouses as Warehouse[], sites: [], createWarehouse });

    await user.click(screen.getByRole('button', { name: /^\+ add warehouse$/i }));

    const dialog = screen.getByRole('dialog', { name: /^add warehouse$/i });
    await user.type(within(dialog).getByLabelText(/^code$/i), 'WH-NOSITE');
    await user.type(within(dialog).getByLabelText(/^name$/i), 'No site warehouse');
    expect(within(dialog).getByRole('button', { name: /^create warehouse$/i })).toBeDisabled();

    fireEvent.submit(document.getElementById('add-warehouse-form') as HTMLFormElement);

    expect(createWarehouse).not.toHaveBeenCalled();
  });

  it('shows a prototype-aligned permission state without exposing the create dialog when update permission is missing', async () => {
    await renderWarehousesPage({ warehouses: prototypeParityWarehouses as Warehouse[], canUpdateInfra: false, state: 'permission_denied' });

    expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
    const addButton = screen.getByRole('button', { name: /add warehouse/i });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAccessibleName(/settings\.infra\.update/i);
    expect(screen.queryByRole('dialog', { name: /add warehouse/i })).not.toBeInTheDocument();
    expectNoRawSettingsKeys();
  });
});

describe('SET-012 warehouse list behavior', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    deactivateWarehouseActionMock.mockImplementation(async (input: DeactivateWarehouseInput) => ({
      ok: true as const,
      data: { warehouseId: input.warehouseId, deactivated_at: '2026-05-24T10:00:00.000Z' },
    }));
  });

  it('renders 25 mixed-status rows with status badges and filters to active-only warehouses', async () => {
    const user = userEvent.setup();
    await renderWarehousesPage();

    expect(screen.getByTestId('settings-warehouse-screen')).toBeInTheDocument();
    expect(document.querySelector('.sg-head .sg-title')).toHaveTextContent(/^warehouses$/i);
    expect(warehouseRows()).toHaveLength(25);
    expectNoRawSettingsKeys();

    const activeRow = rowFor(/apex chilled wh-01 active/i);
    expect(within(activeRow).getByText(/^active$/i)).toHaveAccessibleName(/active/i);
    expect(within(activeRow).getByText(/^active$/i)).toHaveAttribute('data-slot', 'badge');

    const deactivatedRow = rowFor(/closed spare warehouse wh-21 deactivated/i);
    expect(within(deactivatedRow).getByText(/^deactivated$/i)).toHaveAccessibleName(/deactivated/i);
    expect(within(deactivatedRow).getByText(/^deactivated$/i)).toHaveAttribute('data-slot', 'badge');

    await user.click(screen.getByRole('combobox', { name: /status/i }));
    await user.click(screen.getByRole('option', { name: /^active$/i }));

    expect(warehouseRows()).toHaveLength(18);
    expect(rowFor(/apex chilled wh-01 active/i)).toBeInTheDocument();
    expect(within(warehouseTable()).queryByRole('row', { name: /closed spare warehouse/i })).not.toBeInTheDocument();
  });

  it('bulk-deactivates 3 selected active warehouses without a confirm dialog and updates their row statuses', async () => {
    const user = userEvent.setup();
    const deactivateWarehouse = vi.fn(async (input: DeactivateWarehouseInput) => ({
      ok: true as const,
      data: { warehouseId: input.warehouseId, deactivated_at: '2026-05-24T10:00:00.000Z' },
    }));
    await renderWarehousesPage({ deactivateWarehouse });

    await selectWarehouses(user, activeWarehouseNames);
    await user.click(screen.getByRole('button', { name: /bulk deactivate/i }));

    await waitFor(() => expect(deactivateWarehouse).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('dialog', { name: /active work orders/i })).not.toBeInTheDocument();
    for (const selected of warehouses.slice(0, 3)) {
      expect(deactivateWarehouse).toHaveBeenCalledWith(
        expect.objectContaining({ warehouseId: selected.id, force: false }),
      );
      expect(rowFor(new RegExp(`${selected.name} ${selected.code} deactivated`, 'i'))).toBeInTheDocument();
    }
  });

  it('surfaces SOFT_WARNING_ACTIVE_WO and re-issues the selected deactivate with force=true only after confirmation', async () => {
    const user = userEvent.setup();
    const warningWarehouse = warehouses[3];
    const deactivateWarehouse = vi.fn(async (input: DeactivateWarehouseInput) => {
      if (input.warehouseId === warningWarehouse.id && input.force !== true) {
        return {
          ok: false as const,
          code: 'SOFT_WARNING_ACTIVE_WO' as const,
          warning: { code: 'SOFT_WARNING_ACTIVE_WO' as const, activeWoCount: 2 },
        };
      }
      return {
        ok: true as const,
        data: { warehouseId: input.warehouseId, deactivated_at: '2026-05-24T10:00:00.000Z' },
      };
    });
    await renderWarehousesPage({ deactivateWarehouse });

    await selectWarehouses(user, [warningWarehouse.name]);
    await user.click(screen.getByRole('button', { name: /bulk deactivate/i }));

    await waitFor(() => expect(deactivateWarehouse).toHaveBeenCalledTimes(1));
    expect(deactivateWarehouse).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: warningWarehouse.id, force: false }),
    );
    const dialog = screen.getByRole('dialog', { name: /active work orders reference this warehouse/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/SOFT_WARNING_ACTIVE_WO/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/2 active work orders/i)).toBeInTheDocument();
    expect(deactivateWarehouse).not.toHaveBeenCalledWith(expect.objectContaining({ force: true }));

    await user.click(within(dialog).getByRole('button', { name: /confirm deactivation/i }));

    await waitFor(() => expect(deactivateWarehouse).toHaveBeenCalledTimes(2));
    expect(deactivateWarehouse).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: warningWarehouse.id, force: true }),
    );
    expect(rowFor(new RegExp(`${warningWarehouse.name} ${warningWarehouse.code} deactivated`, 'i'))).toBeInTheDocument();
  });

  it('disables Bulk Deactivate with an aria-label explaining settings.infra.update is required when permission is missing', async () => {
    await renderWarehousesPage({ canUpdateInfra: false });

    const button = screen.getByRole('button', { name: /bulk deactivate/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName(/insufficient permissions.*settings\.infra\.update/i);
  });
});

describe('SET-012 per-warehouse storage rules', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function storageRegion() {
    return screen.getByRole('region', { name: /^storage rules/i });
  }

  it('hydrates the storage-rules editor from the first warehouses persisted per-warehouse rules', async () => {
    await renderWarehousesPage();

    // WH-01 carries FEFO / no mixed lots / 7 days / block expired.
    expect(storageRegion()).toHaveAccessibleName(/storage rules — WH-01/i);
    const region = storageRegion();
    expect(within(region).getByLabelText(/bin assignment strategy/i)).toHaveAttribute('data-value', 'FEFO');
    expect((within(region).getByLabelText(/expiry warning threshold/i) as HTMLInputElement).value).toBe('7');
    expect((within(region).getByLabelText(/^mixed lot bins$/i) as HTMLInputElement).checked).toBe(false);
    expect((within(region).getByLabelText(/^block expired stock$/i) as HTMLInputElement).checked).toBe(true);
  });

  it('re-scopes the editor to a different warehouses own rules via the per-row edit affordance', async () => {
    const user = userEvent.setup();
    await renderWarehousesPage();

    // Use the per-row "Storage rules" button on WH-02 (LIFO / mixed lots / 30 days / not blocked).
    const row = rowFor(/apex ambient wh-02 active/i);
    await user.click(within(row).getByTestId('edit-storage-rules'));

    const region = storageRegion();
    expect(region).toHaveAccessibleName(/storage rules — WH-02/i);
    expect(within(region).getByLabelText(/bin assignment strategy/i)).toHaveAttribute('data-value', 'LIFO');
    expect((within(region).getByLabelText(/expiry warning threshold/i) as HTMLInputElement).value).toBe('30');
    expect((within(region).getByLabelText(/^mixed lot bins$/i) as HTMLInputElement).checked).toBe(true);
    expect((within(region).getByLabelText(/^block expired stock$/i) as HTMLInputElement).checked).toBe(false);
  });

  it('persists edited rules for the selected warehouse only through the per-warehouse update action', async () => {
    const user = userEvent.setup();
    const updateStorageRules = vi.fn(async (input: UpdateStorageRulesInput) => ({
      ok: true as const,
      data: {
        warehouseId: input.warehouseId,
        binAssignmentStrategy: input.binAssignmentStrategy ?? 'FEFO',
        mixedLotBins: input.mixedLotBins ?? false,
        expiryWarningDays: input.expiryWarningDays ?? 7,
        blockExpiredStock: input.blockExpiredStock ?? true,
      },
    }));
    await renderWarehousesPage({ updateStorageRules });

    const region = storageRegion();
    const expiry = within(region).getByLabelText(/expiry warning threshold/i) as HTMLInputElement;
    await user.clear(expiry);
    await user.type(expiry, '14');
    await user.click(within(region).getByLabelText(/^mixed lot bins$/i));
    await user.click(within(region).getByRole('button', { name: /^save storage rules$/i }));

    await waitFor(() => expect(updateStorageRules).toHaveBeenCalledTimes(1));
    expect(updateStorageRules).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: warehouses[0].id,
        binAssignmentStrategy: 'FEFO',
        mixedLotBins: true,
        expiryWarningDays: 14,
        blockExpiredStock: true,
      }),
    );
    expect(await screen.findByText(/storage rules saved/i)).toBeInTheDocument();
  });

  it('disables the storage-rules editor and Save when update permission is missing', async () => {
    await renderWarehousesPage({ canUpdateInfra: false, state: 'ready' });

    const region = storageRegion();
    expect(within(region).getByLabelText(/expiry warning threshold/i)).toBeDisabled();
    const save = within(region).getByRole('button', { name: /save storage rules/i });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleName(/settings\.infra\.update/i);
  });
});
