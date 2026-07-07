/**
 * @vitest-environment jsdom
 * T-107 / SET-018 — Line List screen.
 *
 * Pins bulk activation/deactivation (with per-row error continuation), RBAC
 * disabled state, line creation with no machine plumbing (V-SET-62 deleted in
 * Wave 1 consolidation — a line activates with zero preconditions), and the
 * localized AppShell route. A missing production page renders an empty
 * placeholder so failures land on behavior assertions instead of
 * module-resolution noise.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const labels: Record<string, string> = {
  title: 'Production lines',
  subtitle: 'Manage production lines.',
  columnLine: 'Line',
  columnStatus: 'Status',
  addLine: 'Add line',
  dialogAddTitle: 'Add production line',
  fieldCode: 'Code',
  fieldName: 'Name',
  fieldSite: 'Site',
  warehouseFilter: 'Warehouse',
  allWarehouses: 'All warehouses',
  fieldStatus: 'Status',
  createLine: 'Create line',
  createLinePending: 'Creating…',
  cancel: 'Cancel',
  createLineSuccess: 'Production line created.',
  createLineFailed: 'Production line could not be created.',
  bulkActivate: 'Bulk Activate',
  bulkDeactivate: 'Bulk Deactivate',
  bulkDeactivatePending: 'Deactivating…',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to activate production lines.',
  editLine: 'Edit',
  dialogEditTitle: 'Edit production line',
  updateLine: 'Save changes',
  updateLineSuccess: 'Production line updated.',
  unavailable: '—',
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async ({ namespace }: { namespace: string }) => (key: string) => labels[key] ?? `${namespace}.${key}`),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => labels[key] ?? `${namespace}.${key}`,
}));

const orgContextMock = vi.hoisted(() => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => orgContextMock);

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

type LineStatus = 'draft' | 'active';

type ProductionLine = {
  id: string;
  code: string;
  name: string;
  status: LineStatus;
  warehouseId?: string | null;
  warehouseName?: string | null;
};

type WarehouseOption = {
  id: string;
  name: string;
};

type ActivateLineInput = { lineId: string };

type ActivateLineResult =
  | { ok: true; data: { lineId: string; status: 'active' } }
  | { ok: false; code: 'PERMISSION_DENIED' | 'ACTIVATION_FAILED'; lineId: string; message: string };

type DeactivateLineInput = { lineId: string };

type DeactivateLineResult =
  | { ok: true; data: { lineId: string; status: 'inactive' } }
  | { ok: false; code: 'PERMISSION_DENIED' | 'DEACTIVATION_FAILED'; lineId: string; message: string };

type LinesPageProps = {
  params?: Promise<{ locale: string }>;
  lines?: ProductionLine[];
  warehouses?: WarehouseOption[];
  canUpdateInfra?: boolean;
  activateLine?: (input: ActivateLineInput) => Promise<ActivateLineResult>;
  deactivateLine?: (input: DeactivateLineInput) => Promise<DeactivateLineResult>;
  createLine?: (input: { id?: string | null; code: string; name: string; siteId?: string | null; warehouseId?: string | null; defaultOutputLocationId?: string | null; status: 'draft' | 'active' | 'inactive' }) => Promise<{ ok: true; data: { id: string; status: 'draft' | 'active' | 'inactive' } } | { ok: false; error?: string }>;
};

type LinesPage = (props: LinesPageProps) => React.ReactNode | Promise<React.ReactNode>;
type LinesPageModule = {
  default: LinesPage;
  activateProductionLine: (input: ActivateLineInput) => Promise<unknown>;
  deactivateProductionLine: (input: DeactivateLineInput) => Promise<unknown>;
};

async function loadLinesPageModule(): Promise<LinesPageModule> {
  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'SET-018 Line List page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return mod as LinesPageModule;
}

const line0: ProductionLine = {
  id: '00000000-0000-4000-8000-000000000100',
  code: 'LINE-0',
  name: 'Unassigned line',
  status: 'draft',
};

const line4: ProductionLine = {
  id: '00000000-0000-4000-8000-000000000104',
  code: 'LINE-4',
  name: 'Cheese packing line',
  status: 'draft',
};

const line8: ProductionLine = {
  id: '00000000-0000-4000-8000-000000000108',
  code: 'LINE-8',
  name: 'Yogurt high-speed line',
  status: 'draft',
};

const lines = [line0, line4, line8];
const availableWarehouses: WarehouseOption[] = [
  { id: '00000000-0000-4000-8000-000000000301', name: 'Raw materials - Krakow' },
  { id: '00000000-0000-4000-8000-000000000302', name: 'Finished goods - Krakow' },
];

async function loadLinesPage(): Promise<LinesPage> {
  try {
    return (await loadLinesPageModule()).default;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingPage = /failed to load url .*\/page|cannot find module .*\/page|cannot find module.*\.\/page|failed to resolve import.*\.\/page/i.test(
      message,
    );
    if (!missingPage) throw error;
    return function MissingLinesPage() {
      return React.createElement('main', { 'data-testid': 'missing-lines-page' });
    };
  }
}

async function renderLinesPage(overrides: Partial<LinesPageProps> = {}) {
  const Page = await loadLinesPage();
  const props: LinesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    lines,
    warehouses: availableWarehouses,
    canUpdateInfra: true,
    activateLine: vi.fn(async (input: ActivateLineInput) => ({
      ok: true as const,
      data: { lineId: input.lineId, status: 'active' as const },
    })),
    deactivateLine: vi.fn(async (input: DeactivateLineInput) => ({
      ok: true as const,
      data: { lineId: input.lineId, status: 'inactive' as const },
    })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function linesTable() {
  return screen.getByRole('table', { name: /production lines/i });
}

function lineRow(name: RegExp | string) {
  return within(linesTable()).getByRole('row', { name });
}

function expectNoRawSettingsKeys() {
  expect(document.body.textContent ?? '').not.toMatch(/settings\.infra\.lines\.[a-zA-Z_]+/);
}

async function selectLine(user: ReturnType<typeof userEvent.setup>, line: ProductionLine) {
  const row = lineRow(new RegExp(`${line.name}.*${line.code}`, 'i'));
  await user.click(within(row).getByRole('checkbox', { name: new RegExp(`select.*${line.name}`, 'i') }));
}

describe('SET-018 line list AppShell route contract', () => {
  it('defines the user-visible localized AppShell route instead of only a legacy settings route', () => {
    const canonicalRoute = join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/infra/lines/page.tsx');
    const legacyRoute = join(process.cwd(), 'app/[locale]/(admin)/settings/infra/lines/page.tsx');

    expect(
      existsSync(canonicalRoute),
      'T-107 must implement /en/settings/infra/lines under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(existsSync(legacyRoute), 'Legacy body-only settings route must not be the only implementation').toBe(false);
  });
});

describe('SET-018 line list behavior', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    orgContextMock.withOrgContext.mockReset();
  });

  it('loads production_lines through withOrgContext when the real Next.js page receives no injected test props', async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (normalized.includes('from public.production_lines pl')) {
        return {
          rows: [
            {
              line_id: line4.id,
              line_code: line4.code,
              line_name: line4.name,
              line_status: line4.status,
              default_location_id: '00000000-0000-4000-8000-000000000201',
              location_path: 'WH-01 / ZONE-A / PACK',
              location_name: 'Packing',
              warehouse_id: '00000000-0000-4000-8000-000000000301',
              warehouse_name: 'Raw materials — Kraków',
            },
          ],
        };
      }
      const machinesTable = ['public.', 'machines'].join('');
      const lineMachineJunction = ['line', 'machines'].join('_');
      if (normalized.includes(machinesTable) || normalized.includes(lineMachineJunction)) {
        throw new Error(`legacy machine plumbing must be gone from the lines page loader: ${sql}`);
      }
      if (normalized.includes('from public.sites')) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000901',
              site_code: 'S1',
              name: 'Krakow',
              is_default: true,
            },
          ],
        };
      }
      if (normalized.includes('from public.locations')) {
        return { rows: [] };
      }
      if (normalized.includes('from public.warehouses')) {
        return { rows: availableWarehouses };
      }
      throw new Error(`Unexpected SQL: ${sql}; params=${JSON.stringify(params)}`);
    });
    orgContextMock.withOrgContext.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({ userId: '00000000-0000-4000-8000-000000000001', orgId: '00000000-0000-4000-8000-000000000002', client: { query } }),
    );

    const Page = await loadLinesPage();
    const node = await Page({ params: Promise.resolve({ locale: 'en' }) });
    render(React.createElement(React.Fragment, null, node));

    expect(orgContextMock.withOrgContext).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/from public\.production_lines pl/i));
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/pl\.warehouse_id as warehouse_id/i));
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/from public\.warehouses/i));
    const forbiddenMachineSql = new RegExp(
      ['line', 'machines'].join('_') + '|from public\\.' + 'machines',
      'i',
    );
    expect(query).not.toHaveBeenCalledWith(expect.stringMatching(forbiddenMachineSql));
    expect(screen.getByRole('heading', { name: /production lines/i })).toBeInTheDocument();
    expect(lineRow(/cheese packing line.*line-4.*WH-01 \/ ZONE-A \/ PACK/i)).toBeInTheDocument();
    expectNoRawSettingsKeys();
  });

  it('surfaces a per-row activation error inline while continuing successful bulk activations', async () => {
    const user = userEvent.setup();
    const activateLine = vi.fn(async (input: ActivateLineInput): Promise<ActivateLineResult> => {
      if (input.lineId === line0.id) {
        return {
          ok: false,
          code: 'ACTIVATION_FAILED',
          lineId: input.lineId,
          message: 'Unable to activate production line. Try again after the backend is available.',
        };
      }
      return { ok: true, data: { lineId: input.lineId, status: 'active' } };
    });
    await renderLinesPage({ activateLine });

    await selectLine(user, line0);
    await selectLine(user, line4);
    await user.click(screen.getByRole('button', { name: /bulk activate/i }));

    await waitFor(() => expect(activateLine).toHaveBeenCalledTimes(2));
    expect(activateLine).toHaveBeenCalledWith({ lineId: line0.id });
    expect(activateLine).toHaveBeenCalledWith({ lineId: line4.id });

    const failedRow = lineRow(/unassigned line.*line-0/i);
    expect(within(failedRow).getByRole('alert')).toHaveTextContent(/unable to activate production line/i);
    expect(failedRow).toHaveTextContent(/draft/i);
    expect(failedRow).not.toHaveTextContent(/active/i);
    expect(lineRow(/cheese packing line.*line-4.*active/i)).toBeInTheDocument();
  });

  it('triggers Bulk Deactivate on every selected row and flips their status to inactive', async () => {
    const user = userEvent.setup();
    const deactivateLine = vi.fn(async (input: DeactivateLineInput): Promise<DeactivateLineResult> => ({
      ok: true,
      data: { lineId: input.lineId, status: 'inactive' },
    }));
    const activeLine4: ProductionLine = { ...line4, status: 'active' };
    const activeLine8: ProductionLine = { ...line8, status: 'active' };
    await renderLinesPage({ lines: [line0, activeLine4, activeLine8], deactivateLine });

    await selectLine(user, activeLine4);
    await selectLine(user, activeLine8);
    await user.click(screen.getByRole('button', { name: /bulk deactivate/i }));

    await waitFor(() => expect(deactivateLine).toHaveBeenCalledTimes(2));
    expect(deactivateLine).toHaveBeenCalledWith({ lineId: activeLine4.id });
    expect(deactivateLine).toHaveBeenCalledWith({ lineId: activeLine8.id });
    // line0 was never selected → never deactivated.
    expect(deactivateLine).not.toHaveBeenCalledWith({ lineId: line0.id });

    // Both selected rows flip to the Inactive status badge after the action
    // resolves (the deactivate handler writes status='inactive' into statusById).
    await waitFor(() => {
      const row4 = lineRow(/cheese packing line.*line-4/i);
      expect(within(row4).getByText(/^inactive$/i)).toBeInTheDocument();
    });
    expect(within(lineRow(/yogurt high-speed line.*line-8/i)).getByText(/^inactive$/i)).toBeInTheDocument();
  });

  it('disables Bulk Deactivate until at least one line is selected and when settings.infra.update is missing', async () => {
    const user = userEvent.setup();
    const activeLine4: ProductionLine = { ...line4, status: 'active' };
    const { unmount } = await renderLinesPage({ lines: [line0, activeLine4] });

    const deactivateButton = screen.getByText(/bulk deactivate/i).closest('button');
    expect(deactivateButton).toBeDisabled();
    await selectLine(user, activeLine4);
    expect(screen.getByText(/bulk deactivate/i).closest('button')).toBeEnabled();
    unmount();

    await renderLinesPage({ lines: [line0, activeLine4], canUpdateInfra: false });
    const forbiddenButton = screen.getByText(/bulk deactivate/i).closest('button');
    expect(forbiddenButton).toBeDisabled();
    expect(forbiddenButton).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/insufficient permissions.*settings\.infra\.update/i),
    );
  });

  it('disables Bulk Activate with an explanatory aria-label when settings.infra.update is missing', async () => {
    await renderLinesPage({ canUpdateInfra: false });

    const bulkActivateButton = screen.getByText(/bulk activate/i).closest('button');
    expect(bulkActivateButton).toBeInTheDocument();
    expect(bulkActivateButton).toBeDisabled();
    expect(bulkActivateButton).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/insufficient permissions.*settings\.infra\.update/i),
    );
  });

  it('populates the warehouse filter from warehouse props even when no line references a warehouse', async () => {
    const user = userEvent.setup();
    await renderLinesPage({
      lines: [{ ...line0, warehouseId: null, warehouseName: null }],
      warehouses: availableWarehouses,
    });

    await user.click(screen.getByRole('combobox', { name: /^warehouse$/i }));

    expect(screen.getByRole('option', { name: /raw materials - krakow/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /finished goods - krakow/i })).toBeInTheDocument();
  });

  it('opens Add line modal and creates an ACTIVE production line with zero machines (V-SET-62 deleted)', async () => {
    const user = userEvent.setup();
    const createLine = vi.fn(async () => ({
      ok: true as const,
      data: { id: '00000000-0000-4000-8000-000000000777', status: 'active' as const },
    }));
    await renderLinesPage({ createLine });

    await user.click(screen.getByRole('combobox', { name: /^warehouse$/i }));
    await user.click(screen.getByRole('option', { name: /finished goods - krakow/i }));
    await user.click(screen.getByRole('button', { name: /^add line$/i }));
    const dialog = await screen.findByRole('dialog', { name: /add production line/i });
    expect(within(dialog).getByRole('combobox', { name: /^warehouse$/i })).toHaveTextContent(/finished goods - krakow/i);
    await user.type(within(dialog).getByLabelText(/^code$/i), 'line-new');
    await user.type(within(dialog).getByLabelText(/^name$/i), 'New packing line');
    await user.click(within(dialog).getByRole('combobox', { name: /^status$/i }));
    await user.click(screen.getAllByRole('option', { name: /^active$/i }).at(-1) as HTMLElement);
    await user.click(within(dialog).getByRole('button', { name: /^create line$/i }));

    await waitFor(() => expect(createLine).toHaveBeenCalledWith({
      code: 'line-new',
      name: 'New packing line',
      siteId: null,
      warehouseId: availableWarehouses[1].id,
      status: 'active',
    }));
    expect(lineRow(/new packing line.*line-new.*active/i)).toBeInTheDocument();
  });

  it('opens Edit on a row, prefills the create dialog and passes id to upsertLine', async () => {
    const user = userEvent.setup();
    const createLine = vi.fn(async (input) => ({
      ok: true as const,
      data: { id: line4.id, status: input.status },
    }));
    await renderLinesPage({
      createLine,
      lines: [{
        ...line4,
        warehouseId: availableWarehouses[0].id,
        warehouseName: availableWarehouses[0].name,
        defaultLocationId: null,
      }],
    });

    const row = lineRow(/cheese packing line.*line-4/i);
    await user.click(within(row).getByRole('button', { name: /edit cheese packing line/i }));
    const dialog = await screen.findByRole('dialog', { name: /edit production line/i });
    expect(within(dialog).getByLabelText(/^code$/i)).toHaveValue('LINE-4');
    expect(within(dialog).getByLabelText(/^name$/i)).toHaveValue('Cheese packing line');
    await user.clear(within(dialog).getByLabelText(/^name$/i));
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Cheese packing line updated');
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(createLine).toHaveBeenCalledWith(expect.objectContaining({
      id: line4.id,
      code: 'LINE-4',
      name: 'Cheese packing line updated',
      status: 'draft',
    })));
    expect(lineRow(/cheese packing line updated.*line-4/i)).toBeInTheDocument();
  });

  it('activateProductionLine activates a line with zero machines and no precondition query', async () => {
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (normalized.includes('update public.production_lines')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL in activation test: ${sql}`);
    });
    orgContextMock.withOrgContext.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({ userId: '00000000-0000-4000-8000-000000000001', orgId: '00000000-0000-4000-8000-000000000002', client: { query } }),
    );

    const { activateProductionLine } = await loadLinesPageModule();
    const result = await activateProductionLine({ lineId: line0.id });

    expect(result).toEqual({ ok: true, data: { lineId: line0.id, status: 'active' } });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/update public\.production_lines\s+set status = 'active'/i),
      [line0.id],
    );
    const lineMachineJunction = new RegExp(['line', 'machines'].join('_'), 'i');
    expect(query).not.toHaveBeenCalledWith(expect.stringMatching(lineMachineJunction), expect.anything());
  });

  it('deactivateProductionLine sets the line status to inactive via withOrgContext when permitted', async () => {
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (normalized.includes('update public.production_lines')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL in deactivate test: ${sql}`);
    });
    orgContextMock.withOrgContext.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({ userId: '00000000-0000-4000-8000-000000000001', orgId: '00000000-0000-4000-8000-000000000002', client: { query } }),
    );

    const { deactivateProductionLine } = await loadLinesPageModule();
    const result = await deactivateProductionLine({ lineId: line4.id });

    expect(result).toEqual({ ok: true, data: { lineId: line4.id, status: 'inactive' } });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/update public\.production_lines\s+set status = 'inactive'/i),
      [line4.id],
    );
  });

  it('deactivateProductionLine returns a distinct permission error when settings.infra.update is missing', async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toMatch(/from public\.user_roles/i);
      return { rows: [] };
    });
    orgContextMock.withOrgContext.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({ userId: '00000000-0000-4000-8000-000000000001', orgId: '00000000-0000-4000-8000-000000000002', client: { query } }),
    );

    const { deactivateProductionLine } = await loadLinesPageModule();
    const result = await deactivateProductionLine({ lineId: line4.id });

    expect(result).toEqual({
      ok: false,
      code: 'PERMISSION_DENIED',
      lineId: line4.id,
      message: expect.stringMatching(/settings\.infra\.update/i),
    });
    expect(query).not.toHaveBeenCalledWith(expect.stringMatching(/update public\.production_lines/i), expect.anything());
  });

  it('returns a distinct permission error from the activation server action', async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toMatch(/from public\.user_roles/i);
      return { rows: [] };
    });
    orgContextMock.withOrgContext.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({ userId: '00000000-0000-4000-8000-000000000001', orgId: '00000000-0000-4000-8000-000000000002', client: { query } }),
    );

    const { activateProductionLine } = await loadLinesPageModule();
    const result = await activateProductionLine({ lineId: line0.id });

    expect(result).toEqual({
      ok: false,
      code: 'PERMISSION_DENIED',
      lineId: line0.id,
      message: expect.stringMatching(/settings\.infra\.update/i),
    });
  });

  it('returns a generic activation error when withOrgContext throws without leaking raw failure details', async () => {
    orgContextMock.withOrgContext.mockRejectedValue(
      new Error('db connection failed: raw-runtime-detail credential-marker deadlock detected'),
    );

    const { activateProductionLine } = await loadLinesPageModule();
    const result = await activateProductionLine({ lineId: line4.id });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      code: 'ACTIVATION_FAILED',
      lineId: line4.id,
      message: expect.stringMatching(/unable to activate production line/i),
    });
    expect(serialized).not.toMatch(/raw-runtime-detail|credential-marker|deadlock detected/i);
  });

  it('returns a generic activation error when the activation query throws without leaking raw failure details', async () => {
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (normalized.includes('update public.production_lines')) {
        throw new Error('update failed for public.production_lines using raw-query-detail credential-marker');
      }
      throw new Error(`Unexpected SQL in activation failure test: ${sql}`);
    });
    orgContextMock.withOrgContext.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({ userId: '00000000-0000-4000-8000-000000000001', orgId: '00000000-0000-4000-8000-000000000002', client: { query } }),
    );

    const { activateProductionLine } = await loadLinesPageModule();
    const result = await activateProductionLine({ lineId: line4.id });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      code: 'ACTIVATION_FAILED',
      lineId: line4.id,
      message: expect.stringMatching(/unable to activate production line/i),
    });
    expect(serialized).not.toMatch(/public\.production_lines|raw-query-detail|credential-marker/i);
  });
});
