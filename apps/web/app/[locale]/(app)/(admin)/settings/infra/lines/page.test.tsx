/**
 * @vitest-environment jsdom
 * T-107 / SET-018 — Line List screen.
 *
 * RED phase: pin machine-sequence preview chips, V-SET-62 NO_MACHINE row error,
 * bulk activation continuation, RBAC disabled state, and localized AppShell route.
 * A missing production page renders an empty placeholder so RED fails on behavior
 * assertions instead of module-resolution noise.
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
  subtitle: 'Manage production lines and their assigned machine sequence.',
  columnLine: 'Line',
  columnStatus: 'Status',
  columnMachines: 'Machine sequence preview',
  addLine: 'Add line',
  dialogAddTitle: 'Add production line',
  fieldCode: 'Code',
  fieldName: 'Name',
  fieldSite: 'Site',
  warehouseFilter: 'Warehouse',
  allWarehouses: 'All warehouses',
  fieldStatus: 'Status',
  fieldMachines: 'Machine sequence',
  createLine: 'Create line',
  createLinePending: 'Creating…',
  cancel: 'Cancel',
  createLineSuccess: 'Production line created.',
  createLineFailed: 'Production line could not be created.',
  noMachinesAvailable: 'Create at least one machine before creating an active line.',
  bulkActivate: 'Bulk Activate',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to activate production lines.',
  noMachineTitle: 'No machines assigned',
  noMachineCode: 'NO_MACHINE',
  noMachineBody: 'Assign at least one machine before activating this line. V-SET-62',
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

type MachinePreview = {
  id: string;
  code: string;
  name: string;
  seq: number;
};

type ProductionLine = {
  id: string;
  code: string;
  name: string;
  status: LineStatus;
  warehouseId?: string | null;
  warehouseName?: string | null;
  machines: MachinePreview[];
};

type MachineOption = {
  id: string;
  code: string;
  name: string;
};

type WarehouseOption = {
  id: string;
  name: string;
};

type ActivateLineInput = { lineId: string };

type ActivateLineResult =
  | { ok: true; data: { lineId: string; status: 'active' } }
  | { ok: false; code: 'NO_MACHINE'; validation: 'V-SET-62'; lineId: string; message: string };

type LinesPageProps = {
  params?: Promise<{ locale: string }>;
  lines?: ProductionLine[];
  machines?: MachineOption[];
  warehouses?: WarehouseOption[];
  canUpdateInfra?: boolean;
  activateLine?: (input: ActivateLineInput) => Promise<ActivateLineResult>;
  createLine?: (input: { code: string; name: string; siteId?: string | null; warehouseId?: string | null; status: 'draft' | 'active'; machineIds: string[] }) => Promise<{ ok: true; data: { id: string; status: 'draft' | 'active' } } | { ok: false; error?: string }>;
};

type LinesPage = (props: LinesPageProps) => React.ReactNode | Promise<React.ReactNode>;
type LinesPageModule = { default: LinesPage; activateProductionLine: (input: ActivateLineInput) => Promise<unknown> };

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
  machines: [],
};

const line4: ProductionLine = {
  id: '00000000-0000-4000-8000-000000000104',
  code: 'LINE-4',
  name: 'Cheese packing line',
  status: 'draft',
  machines: [
    { id: 'm-04-1', code: 'MIX-01', name: 'Mixer 01', seq: 1 },
    { id: 'm-04-2', code: 'CUT-02', name: 'Cutter 02', seq: 2 },
    { id: 'm-04-3', code: 'PACK-03', name: 'Packer 03', seq: 3 },
    { id: 'm-04-4', code: 'PAL-04', name: 'Palletizer 04', seq: 4 },
  ],
};

const line8: ProductionLine = {
  id: '00000000-0000-4000-8000-000000000108',
  code: 'LINE-8',
  name: 'Yogurt high-speed line',
  status: 'draft',
  machines: [
    { id: 'm-08-8', code: 'WRAP-08', name: 'Wrapper 08', seq: 8 },
    { id: 'm-08-4', code: 'FILL-04', name: 'Filler 04', seq: 4 },
    { id: 'm-08-1', code: 'DEPAL-01', name: 'Depalletizer 01', seq: 1 },
    { id: 'm-08-6', code: 'CHECK-06', name: 'Checkweigher 06', seq: 6 },
    { id: 'm-08-2', code: 'WASH-02', name: 'Washer 02', seq: 2 },
    { id: 'm-08-7', code: 'LABEL-07', name: 'Labeler 07', seq: 7 },
    { id: 'm-08-3', code: 'PAST-03', name: 'Pasteurizer 03', seq: 3 },
    { id: 'm-08-5', code: 'SEAL-05', name: 'Sealer 05', seq: 5 },
  ],
};

const lines = [line0, line4, line8];
const availableMachines: MachineOption[] = [
  { id: '00000000-0000-4000-8000-000000000501', code: 'MIX-01', name: 'Mixer 01' },
  { id: '00000000-0000-4000-8000-000000000502', code: 'PACK-02', name: 'Packer 02' },
];
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
    machines: availableMachines,
    warehouses: availableWarehouses,
    canUpdateInfra: true,
    activateLine: vi.fn(async (input: ActivateLineInput) => ({
      ok: true as const,
      data: { lineId: input.lineId, status: 'active' as const },
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

function machinePreview(row: HTMLElement) {
  return within(row).getByTestId('settings-line-machine-preview');
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
              machine_id: line4.machines[0].id,
              machine_code: line4.machines[0].code,
              machine_name: line4.machines[0].name,
              machine_seq: line4.machines[0].seq,
            },
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
              machine_id: line4.machines[1].id,
              machine_code: line4.machines[1].code,
              machine_name: line4.machines[1].name,
              machine_seq: line4.machines[1].seq,
            },
          ],
        };
      }
      if (normalized.includes('from public.machines')) {
        return { rows: availableMachines };
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
    expect(screen.getByRole('heading', { name: /production lines/i })).toBeInTheDocument();
    expect(lineRow(/cheese packing line.*line-4.*WH-01 \/ ZONE-A \/ PACK/i)).toBeInTheDocument();
    expect(within(machinePreview(lineRow(/cheese packing line.*line-4/i))).getAllByTestId('settings-line-machine-chip')).toHaveLength(2);
    expectNoRawSettingsKeys();
  });

  it('renders ordered machine sequence preview chips and limits overflow to six chips plus a +N more indicator', async () => {
    await renderLinesPage();
    expectNoRawSettingsKeys();

    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-topbar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /production lines/i })).toBeInTheDocument();

    const fourMachinePreview = machinePreview(lineRow(/cheese packing line.*line-4/i));
    expect(within(fourMachinePreview).getAllByTestId('settings-line-machine-chip').map((chip) => chip.textContent)).toEqual([
      expect.stringMatching(/^1\s+MIX-01/i),
      expect.stringMatching(/^2\s+CUT-02/i),
      expect.stringMatching(/^3\s+PACK-03/i),
      expect.stringMatching(/^4\s+PAL-04/i),
    ]);
    expect(within(fourMachinePreview).queryByText(/more/i)).not.toBeInTheDocument();

    const eightMachinePreview = machinePreview(lineRow(/yogurt high-speed line.*line-8/i));
    expect(within(eightMachinePreview).getAllByTestId('settings-line-machine-chip').map((chip) => chip.textContent)).toEqual([
      expect.stringMatching(/^1\s+DEPAL-01/i),
      expect.stringMatching(/^2\s+WASH-02/i),
      expect.stringMatching(/^3\s+PAST-03/i),
      expect.stringMatching(/^4\s+FILL-04/i),
      expect.stringMatching(/^5\s+SEAL-05/i),
      expect.stringMatching(/^6\s+CHECK-06/i),
    ]);
    expect(within(eightMachinePreview).getByText('+2 more')).toBeInTheDocument();
    expect(within(eightMachinePreview).queryByText(/LABEL-07|WRAP-08/i)).not.toBeInTheDocument();
  });

  it('surfaces V-SET-62 NO_MACHINE inline for one selected row while continuing successful bulk activations', async () => {
    const user = userEvent.setup();
    const activateLine = vi.fn(async (input: ActivateLineInput): Promise<ActivateLineResult> => {
      if (input.lineId === line0.id) {
        return {
          ok: false,
          code: 'NO_MACHINE',
          validation: 'V-SET-62',
          lineId: input.lineId,
          message: 'NO_MACHINE: Assign at least one machine before activating this line.',
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

    const noMachineRow = lineRow(/unassigned line.*line-0/i);
    expect(within(noMachineRow).getByRole('alert')).toHaveTextContent(/NO_MACHINE|V-SET-62|assign at least one machine/i);
    expect(noMachineRow).toHaveTextContent(/draft/i);
    expect(noMachineRow).not.toHaveTextContent(/active/i);
    expect(lineRow(/cheese packing line.*line-4.*active/i)).toBeInTheDocument();
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

  it('opens Add line modal and creates a production line with selected machine sequence', async () => {
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
    await user.click(within(dialog).getByLabelText(/mixer 01/i));
    await user.click(within(dialog).getByLabelText(/packer 02/i));
    await user.click(within(dialog).getByRole('button', { name: /^create line$/i }));

    await waitFor(() => expect(createLine).toHaveBeenCalledWith({
      code: 'line-new',
      name: 'New packing line',
      siteId: null,
      warehouseId: availableWarehouses[1].id,
      status: 'active',
      machineIds: [availableMachines[0].id, availableMachines[1].id],
    }));
    expect(lineRow(/new packing line.*line-new.*active/i)).toBeInTheDocument();
    expect(within(machinePreview(lineRow(/new packing line/i))).getAllByTestId('settings-line-machine-chip').map((chip) => chip.textContent)).toEqual([
      expect.stringMatching(/^1\s+MIX-01/i),
      expect.stringMatching(/^2\s+PACK-02/i),
    ]);
  });

  it('returns V-SET-62 NO_MACHINE only for the explicit no-machine validation branch', async () => {
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (normalized.includes('from public.production_lines pl')) {
        return {
          rows: [
            {
              id: line0.id,
              code: line0.code,
              name: line0.name,
              machine_ids: [],
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL in no-machine test: ${sql}`);
    });
    orgContextMock.withOrgContext.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({ userId: '00000000-0000-4000-8000-000000000001', orgId: '00000000-0000-4000-8000-000000000002', client: { query } }),
    );

    const { activateProductionLine } = await loadLinesPageModule();
    const result = await activateProductionLine({ lineId: line0.id });

    expect(result).toEqual({
      ok: false,
      code: 'NO_MACHINE',
      validation: 'V-SET-62',
      lineId: line0.id,
      message: expect.stringMatching(/assign at least one machine/i),
    });
    expect(query).not.toHaveBeenCalledWith(expect.stringMatching(/update public\.production_lines/i), expect.anything());
  });

  it('returns a distinct permission error from the server action instead of masquerading as V-SET-62', async () => {
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
    expect(result).not.toMatchObject({ code: 'NO_MACHINE', validation: 'V-SET-62' });
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
    expect(result).not.toMatchObject({ code: 'NO_MACHINE', validation: 'V-SET-62' });
    expect(serialized).not.toMatch(/V-SET-62|NO_MACHINE|raw-runtime-detail|credential-marker|deadlock detected/i);
  });

  it('returns a generic activation error when the activation query throws without leaking raw failure details', async () => {
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (normalized.includes('from public.production_lines pl')) {
        throw new Error('select failed for public.production_lines using raw-query-detail credential-marker');
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
    expect(result).not.toMatchObject({ code: 'NO_MACHINE', validation: 'V-SET-62' });
    expect(serialized).not.toMatch(/V-SET-62|NO_MACHINE|public\.production_lines|raw-query-detail|credential-marker/i);
  });
});
