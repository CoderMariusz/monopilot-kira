/**
 * @vitest-environment jsdom
 * W2-T1 — Unified Settings "Processes" screen (settings/process-defaults;
 * route renames to settings/processes in W2-T2).
 *
 * Pins the four required UI states (loading / empty / error /
 * data + permission-denied), asserts each operation renders its prefix +
 * suffix + cost (with override badge) + setup/throughput/yield + roles, that
 * the per-operation Edit modal exposes the derived-with-override cost (live
 * Σ(headcount × rate) recompute, manual override toggle), the prefix field
 * (auto-number placeholder), setup/throughput/yield fields, a roles editor
 * (add/remove role rows), the read-only per-product rates from
 * npd_wip_processes, and CALLS upsertProcessDefaults with the edited values.
 * An error result is surfaced inline. No raw UUIDs leak into the rendered
 * DOM. The settings-nav registration is asserted too (the single unified
 * "Processes" entry points here; no separate process-defaults entry remains).
 */
import React from 'react';
import { existsSync } from 'node:fs';
import path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

// The backend lane owns this module; stub it so the page module imports cleanly
// in isolation. The screen behaviour is driven through the injected prop action.
vi.mock('./_actions/process-defaults-actions', () => ({
  listProcessDefaults: vi.fn(),
  upsertProcessDefaults: vi.fn(),
  listLaborRateRoleGroups: vi.fn(),
  listLaborRateRoleGroupRates: vi.fn(),
  getProcessDefault: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const OP_MIX = '11111111-1111-4111-8111-111111111111';
const OP_BAKE = '22222222-2222-4222-8222-222222222222';

type ProcessDefaultRole = { roleGroup: string; defaultHeadcount: number };
type RoleGroupRate = { roleGroup: string; ratePerHour: number };
type ProcessProductRate = {
  productCode: string;
  throughputPerHour: number | null;
  throughputUom: string | null;
  setupCost: number;
  yieldPct: number;
};
type ProcessDefaultRow = {
  operationId: string;
  operationName: string;
  processSuffix: string;
  prefix: string | null;
  standardCost: number;
  costOverridden: boolean;
  defaultDurationHours: number;
  setupCost: number;
  throughputPerHour: number | null;
  throughputUom: string | null;
  yieldPct: number;
  roles: ProcessDefaultRole[];
  productRates: ProcessProductRate[];
};
type UpsertInput = {
  operationId: string;
  standardCost: number;
  costOverridden: boolean;
  defaultDurationHours: number;
  setupCost: number;
  throughputPerHour: number | null;
  throughputUom: string | null;
  yieldPct: number;
  prefix: string;
  roles: ProcessDefaultRole[];
};
type UpsertResult = { ok: true } | { ok: false; error: string };
type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type ProcessDefaultsPageProps = {
  params?: Promise<{ locale: string }>;
  rows?: ProcessDefaultRow[];
  canManage?: boolean;
  state?: PageState;
  upsertProcessDefaults?: (input: UpsertInput) => Promise<UpsertResult>;
  roleGroupRates?: RoleGroupRate[];
};

type ProcessDefaultsPage = (props: ProcessDefaultsPageProps) => React.ReactNode | Promise<React.ReactNode>;

const rows: ProcessDefaultRow[] = [
  {
    operationId: OP_MIX,
    operationName: 'Mixing',
    processSuffix: 'MIX',
    prefix: 'MIX-01',
    standardCost: 42.5,
    costOverridden: false,
    defaultDurationHours: 2,
    setupCost: 5,
    throughputPerHour: 120,
    throughputUom: 'kg',
    yieldPct: 97.5,
    roles: [{ roleGroup: 'operator', defaultHeadcount: 2 }],
    productRates: [
      { productCode: 'FG-0001', throughputPerHour: 110, throughputUom: 'kg', setupCost: 4, yieldPct: 95 },
    ],
  },
  {
    operationId: OP_BAKE,
    operationName: 'Baking',
    processSuffix: 'BAKE',
    prefix: null,
    standardCost: 15,
    costOverridden: true,
    defaultDurationHours: 1.5,
    setupCost: 0,
    throughputPerHour: null,
    throughputUom: null,
    yieldPct: 100,
    roles: [],
    productRates: [],
  },
];

const roleGroupRates: RoleGroupRate[] = [
  { roleGroup: 'operator', ratePerHour: 14.5 },
  { roleGroup: 'packer', ratePerHour: 12 },
  { roleGroup: 'supervisor', ratePerHour: 20 },
];

async function loadPage(): Promise<ProcessDefaultsPage> {
  const mod = await import('./page.tsx');
  expect(mod.default, 'process-defaults page must default-export a renderable component').toEqual(
    expect.any(Function),
  );
  return mod.default as ProcessDefaultsPage;
}

async function renderPage(overrides: Partial<ProcessDefaultsPageProps> = {}) {
  const Page = await loadPage();
  const upsertProcessDefaults = vi.fn(async (): Promise<UpsertResult> => ({ ok: true }));
  const props: ProcessDefaultsPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    rows,
    canManage: true,
    state: 'ready',
    upsertProcessDefaults,
    roleGroupRates,
    ...overrides,
  };
  const node = await Page(props);
  return { props, upsertProcessDefaults, ...render(React.createElement(React.Fragment, null, node)) };
}

function expectNoRawUuids() {
  expect(document.body.textContent ?? '').not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
}

describe('W2-T1 unified Processes route contract', () => {
  it('implements the localized AppShell route under app/[locale]/(app)/(admin)/settings/process-defaults', () => {
    const canonical = path.join(
      process.cwd(),
      'app/[locale]/(app)/(admin)/settings/process-defaults/page.tsx',
    );
    expect(existsSync(canonical)).toBe(true);
  });

  it('registers ONE unified Processes entry pointing here, with no separate process-defaults entry', async () => {
    const { SETTINGS_NAV_GROUPS } = await import('../../../../../../lib/navigation/settings-nav');
    const allItems = SETTINGS_NAV_GROUPS.flatMap((g) => g.items);
    const entry = allItems.find((i) => i.route === '/settings/process-defaults');
    expect(entry, 'the unified Processes settings-nav item must point at /settings/process-defaults').toBeTruthy();
    expect(entry?.key).toBe('processes');
    expect(entry?.i18n_key).toBe('Navigation.settings.items.processes');
    // W2-T1 fold: the old separate entry is gone…
    expect(allItems.some((i) => i.key === 'process-defaults')).toBe(false);
    // …the legacy reference-A route has no nav entry anymore (screen dies in W2-T2)…
    expect(allItems.some((i) => i.route === '/settings/processes')).toBe(false);
    // …and manufacturing-ops stays reachable as the vocabulary sub-link.
    const vocab = allItems.find((i) => i.key === 'manufacturing-ops');
    expect(vocab?.route).toBe('/settings/reference/manufacturing-operations');
  });

  it('anchors the screen root to the settings prototype (UI parity policy)', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main[data-prototype-source]');
    expect(main).toBeTruthy();
    expect(main?.getAttribute('data-prototype-source')).toBe(
      'prototypes/design/Monopilot Design System/settings/manufacturing-ops.jsx:186-260',
    );
  });
});

describe('W2-T1 unified Processes screen', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the data state: prefix, suffix, cost (+override badge), setup, throughput, yield, roles — no raw UUIDs', async () => {
    await renderPage();
    expect(screen.getByTestId('settings-process-defaults-screen')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /processes/i });
    expect(within(table).getByText('Mixing')).toBeInTheDocument();
    expect(within(table).getByText('Baking')).toBeInTheDocument();
    expect(within(table).getByText('MIX-01')).toBeInTheDocument();
    expect(within(table).getByText('MIX')).toBeInTheDocument();
    expect(within(table).getByText('42.5')).toBeInTheDocument();
    expect(within(table).getByText(/97\.5%/)).toBeInTheDocument();
    expect(within(table).getByText(/120 kg/)).toBeInTheDocument();
    // Baking's cost is a manual override → badge
    expect(within(table).getByTestId('process-default-overridden-badge')).toHaveTextContent(/overridden/i);
    // role chip renders the role group + headcount (operator × 2)
    expect(within(table).getByText(/operator × 2/i)).toBeInTheDocument();
    expectNoRawUuids();
  });

  it('renders the loading state', async () => {
    await renderPage({ state: 'loading', rows: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/loading process/i);
  });

  it('renders the empty state', async () => {
    await renderPage({ state: 'empty', rows: [] });
    expect(screen.getByText(/no manufacturing operations/i)).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    await renderPage({ state: 'error', rows: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });

  it('renders the permission-denied state and disables Edit', async () => {
    await renderPage({ state: 'permission_denied', rows: [], canManage: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
  });

  it('disables the per-operation Edit affordance when the caller cannot manage', async () => {
    await renderPage({ canManage: false });
    const editButtons = screen.getAllByRole('button', { name: /edit mixing/i });
    expect(editButtons[0]).toBeDisabled();
    expect(editButtons[0]).toHaveAccessibleName(/settings\.org\.update/i);
  });

  it('Edit modal shows the LIVE computed crew cost (Σ headcount × rate) readonly, updating as roles change', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /edit mixing/i }));
    const dialog = screen.getByRole('dialog', { name: /mixing/i });

    // operator × 2 × 14.5 = 29 — computed hint + readonly cost input
    expect(within(dialog).getByTestId('process-default-computed-cost')).toHaveTextContent('29');
    const cost = within(dialog).getByLabelText(/^cost per hour$/i);
    expect(cost).toHaveValue(29);
    expect(cost).toBeDisabled();

    // bump headcount 2 → 3: live recompute to 43.5
    const headcount = within(dialog).getByLabelText(/headcount 1/i);
    await user.clear(headcount);
    await user.type(headcount, '3');
    expect(within(dialog).getByTestId('process-default-computed-cost')).toHaveTextContent('43.5');
    expect(within(dialog).getByLabelText(/^cost per hour$/i)).toHaveValue(43.5);
  });

  it('Edit modal override toggle unlocks the manual cost field and the override is submitted + sticks', async () => {
    const user = userEvent.setup();
    const { upsertProcessDefaults } = await renderPage();
    await user.click(screen.getByRole('button', { name: /edit mixing/i }));
    const dialog = screen.getByRole('dialog', { name: /mixing/i });

    await user.click(within(dialog).getByTestId('process-default-cost-override'));
    const cost = within(dialog).getByLabelText(/^cost per hour$/i);
    expect(cost).toBeEnabled();
    await user.clear(cost);
    await user.type(cost, '55.5');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(upsertProcessDefaults).toHaveBeenCalledTimes(1));
    expect(upsertProcessDefaults).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: OP_MIX, standardCost: 55.5, costOverridden: true }),
    );
    // override sticks in the list: value + badge
    const table = screen.getByRole('table', { name: /processes/i });
    expect(within(table).getByText('55.5')).toBeInTheDocument();
    expect(within(table).getAllByTestId('process-default-overridden-badge').length).toBe(2);
  });

  it('Edit modal exposes prefix (auto-number placeholder), setup cost, throughput + UoM, yield and a roles editor', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /edit baking/i }));
    const dialog = screen.getByRole('dialog', { name: /baking/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // prefix auto-number affordance: blank value, BAKE-01 placeholder from the vocab suffix
    const prefix = within(dialog).getByLabelText(/prefix/i);
    expect(prefix).toHaveValue('');
    expect(prefix).toHaveAttribute('placeholder', 'BAKE-01');

    expect(within(dialog).getByLabelText(/setup cost/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/throughput per hour/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/throughput uom/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/yield/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/default duration/i)).toBeInTheDocument();

    // roles editor: add a row, role group is a labor_rates dropdown, remove it back
    expect(within(dialog).getByTestId('process-default-roles-empty')).toBeInTheDocument();
    await user.click(within(dialog).getByTestId('process-default-add-role'));
    const roleSelect = within(dialog).getByLabelText(/role \/ group 1/i);
    expect(roleSelect.tagName).toBe('SELECT');
    const optionLabels = within(roleSelect as HTMLElement)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(expect.arrayContaining(['operator', 'packer', 'supervisor']));
    await user.click(within(dialog).getByRole('button', { name: /^remove 1$/i }));
    expect(within(dialog).queryAllByTestId('process-default-role-row').length).toBe(0);
  });

  it('Edit modal surfaces the read-only per-product rates from npd_wip_processes', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /edit mixing/i }));
    const dialog = screen.getByRole('dialog', { name: /mixing/i });
    const rates = within(dialog).getByTestId('process-default-product-rates');
    const row = within(rates).getByTestId('process-default-product-rate-row');
    expect(row).toHaveTextContent('FG-0001');
    expect(row).toHaveTextContent('110 kg/h');
    expect(row).toHaveTextContent('95%');
    // and no inputs — surfacing only
    expect(within(rates).queryAllByRole('textbox').length).toBe(0);
    expect(within(rates).queryAllByRole('spinbutton').length).toBe(0);
  });

  it('saves the edited definition through the injected upsertProcessDefaults action (all fields)', async () => {
    const user = userEvent.setup();
    const { upsertProcessDefaults } = await renderPage();
    await user.click(screen.getByRole('button', { name: /edit baking/i }));
    const dialog = screen.getByRole('dialog', { name: /baking/i });

    const prefix = within(dialog).getByLabelText(/prefix/i);
    await user.type(prefix, 'BAKE-07');

    const duration = within(dialog).getByLabelText(/default duration/i);
    await user.clear(duration);
    await user.type(duration, '3');

    const setup = within(dialog).getByLabelText(/setup cost/i);
    await user.clear(setup);
    await user.type(setup, '12.5');

    const throughput = within(dialog).getByLabelText(/throughput per hour/i);
    await user.type(throughput, '400');
    const uom = within(dialog).getByLabelText(/throughput uom/i);
    await user.type(uom, 'kg');

    const yieldPct = within(dialog).getByLabelText(/yield/i);
    await user.clear(yieldPct);
    await user.type(yieldPct, '92');

    // Baking starts with no roles — add one (picked from the labor_rates dropdown).
    await user.click(within(dialog).getByTestId('process-default-add-role'));
    await user.selectOptions(within(dialog).getByLabelText(/role \/ group 1/i), 'packer');
    const headcount = within(dialog).getByLabelText(/headcount 1/i);
    await user.clear(headcount);
    await user.type(headcount, '3');

    // Baking opened as overridden (costOverridden: true) — switch back to computed.
    await user.click(within(dialog).getByTestId('process-default-cost-override'));

    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(upsertProcessDefaults).toHaveBeenCalledTimes(1));
    expect(upsertProcessDefaults).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: OP_BAKE,
        // computed: packer × 3 × 12 = 36
        standardCost: 36,
        costOverridden: false,
        defaultDurationHours: 3,
        setupCost: 12.5,
        throughputPerHour: 400,
        throughputUom: 'kg',
        yieldPct: 92,
        prefix: 'BAKE-07',
        roles: [{ roleGroup: 'packer', defaultHeadcount: 3 }],
      }),
    );
  });

  it('surfaces a save error when upsertProcessDefaults returns a failure', async () => {
    const user = userEvent.setup();
    const upsert = vi.fn(async (): Promise<UpsertResult> => ({ ok: false, error: 'persistence_failed' }));
    await renderPage({ upsertProcessDefaults: upsert });
    await user.click(screen.getByRole('button', { name: /edit mixing/i }));
    const dialog = screen.getByRole('dialog', { name: /mixing/i });
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
  });
});
