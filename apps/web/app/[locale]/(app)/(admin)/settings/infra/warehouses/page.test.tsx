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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';


const { withOrgContextMock, deactivateWarehouseActionMock } = vi.hoisted(() => ({
  withOrgContextMock: vi.fn(),
  deactivateWarehouseActionMock: vi.fn(async (input: DeactivateWarehouseInput) => ({
    ok: true as const,
    data: { warehouseId: input.warehouseId, deactivated_at: '2026-05-24T10:00:00.000Z' },
  })),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

vi.mock('../../../../../../../actions/infra/warehouse', () => ({
  deactivateWarehouse: deactivateWarehouseActionMock,
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
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => labels[key] ?? key),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

type Warehouse = {
  id: string;
  code: string;
  name: string;
  deactivated_at: string | null;
  active_wo_count: number;
};

type DeactivateWarehouseInput = {
  warehouseId: string;
  force?: boolean;
};

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
  canUpdateInfra?: boolean;
  deactivateWarehouse?: (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>;
};

type WarehousesPage = (props: WarehousePageProps) => React.ReactNode | Promise<React.ReactNode>;

const activeWarehouseNames = ['Apex Chilled', 'Apex Ambient', 'Apex Frozen'];

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
  return {
    id: `00000000-0000-4000-8000-${String(rowNumber).padStart(12, '0')}`,
    code: `WH-${String(rowNumber).padStart(2, '0')}`,
    name: knownNames[rowNumber] ?? `Warehouse ${String(rowNumber).padStart(2, '0')}`,
    deactivated_at: active ? null : `2026-05-${String(rowNumber - 18).padStart(2, '0')}T08:00:00.000Z`,
    active_wo_count: rowNumber === 4 ? 2 : 0,
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
    canUpdateInfra: true,
    deactivateWarehouse: vi.fn(async (input: DeactivateWarehouseInput) => ({
      ok: true as const,
      data: { warehouseId: input.warehouseId, deactivated_at: '2026-05-24T10:00:00.000Z' },
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
    expect(pageSource).not.toMatch(/w\.deactivated_at/);
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
    expect(screen.getByRole('heading', { name: /^warehouses$/i })).toBeInTheDocument();
    expect(warehouseRows()).toHaveLength(25);

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
