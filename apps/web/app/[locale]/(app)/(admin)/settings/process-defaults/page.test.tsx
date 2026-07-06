/**
 * @vitest-environment jsdom
 * NPD v2 S5a — Per-process production DEFAULTS settings screen
 * (settings/process-defaults).
 *
 * Pins the four required UI states (loading / empty / error /
 * data + permission-denied), asserts each operation renders its standard cost +
 * duration + roles, that the per-operation Edit modal exposes standardCost +
 * defaultDurationHours + a roles editor (add/remove role rows) and CALLS
 * upsertProcessDefaults with the edited values, and that an error result is
 * surfaced inline. No raw UUIDs leak into the rendered DOM. The settings-nav
 * registration is asserted too (avoids a URL-only dead-end).
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
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const OP_MIX = '11111111-1111-4111-8111-111111111111';
const OP_BAKE = '22222222-2222-4222-8222-222222222222';

type ProcessDefaultRole = { roleGroup: string; defaultHeadcount: number };
type ProcessDefaultRow = {
  operationId: string;
  operationName: string;
  standardCost: number;
  defaultDurationHours: number;
  roles: ProcessDefaultRole[];
};
type UpsertInput = {
  operationId: string;
  standardCost: number;
  defaultDurationHours: number;
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
  roleGroupOptions?: string[];
};

type ProcessDefaultsPage = (props: ProcessDefaultsPageProps) => React.ReactNode | Promise<React.ReactNode>;

const rows: ProcessDefaultRow[] = [
  {
    operationId: OP_MIX,
    operationName: 'Mixing',
    standardCost: 42.5,
    defaultDurationHours: 2,
    roles: [{ roleGroup: 'operator', defaultHeadcount: 2 }],
  },
  {
    operationId: OP_BAKE,
    operationName: 'Baking',
    standardCost: 15,
    defaultDurationHours: 1.5,
    roles: [],
  },
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
    roleGroupOptions: ['operator', 'packer', 'supervisor'],
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

describe('NPD v2 S5a process-defaults route contract', () => {
  it('implements the localized AppShell route under app/[locale]/(app)/(admin)/settings/process-defaults', () => {
    const canonical = path.join(
      process.cwd(),
      'app/[locale]/(app)/(admin)/settings/process-defaults/page.tsx',
    );
    expect(existsSync(canonical)).toBe(true);
  });

  it('registers a Process defaults entry in the settings navigation', async () => {
    const { SETTINGS_NAV_GROUPS } = await import('../../../../../../lib/navigation/settings-nav');
    const allItems = SETTINGS_NAV_GROUPS.flatMap((g) => g.items);
    const entry = allItems.find((i) => i.route === '/settings/process-defaults');
    expect(entry, 'a settings-nav item must point at /settings/process-defaults').toBeTruthy();
    expect(entry?.i18n_key).toBe('Navigation.settings.items.process_defaults');
  });
});

describe('NPD v2 S5a process-defaults screen', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the data state: operations with standard cost + duration + roles, no raw UUIDs', async () => {
    await renderPage();
    expect(screen.getByTestId('settings-process-defaults-screen')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /process defaults/i });
    expect(within(table).getByText('Mixing')).toBeInTheDocument();
    expect(within(table).getByText('Baking')).toBeInTheDocument();
    expect(within(table).getByText('42.5')).toBeInTheDocument();
    // role chip renders the role group + headcount (operator × 2)
    expect(within(table).getByText(/operator × 2/i)).toBeInTheDocument();
    expectNoRawUuids();
  });

  it('renders the loading state', async () => {
    await renderPage({ state: 'loading', rows: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/loading process defaults/i);
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

  it('Edit modal exposes standard cost + duration + a roles editor (add/remove)', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /edit mixing/i }));
    const dialog = screen.getByRole('dialog', { name: /mixing/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText(/standard cost/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/default duration/i)).toBeInTheDocument();
    // existing role row is pre-filled from the operation's roles
    expect(within(dialog).getAllByTestId('process-default-role-row').length).toBe(1);
    // role group is a dropdown sourced from labor_rates role groups, not free text
    const roleSelect = within(dialog).getByLabelText(/role \/ group 1/i);
    expect(roleSelect.tagName).toBe('SELECT');
    const optionLabels = within(roleSelect as HTMLElement)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(expect.arrayContaining(['operator', 'packer', 'supervisor']));
    // add a role row, then remove it back to one
    await user.click(within(dialog).getByTestId('process-default-add-role'));
    expect(within(dialog).getAllByTestId('process-default-role-row').length).toBe(2);
    await user.click(within(dialog).getByRole('button', { name: /^remove 2$/i }));
    expect(within(dialog).getAllByTestId('process-default-role-row').length).toBe(1);
  });

  it('saves the edited defaults through the injected upsertProcessDefaults action (cost/duration/roles)', async () => {
    const user = userEvent.setup();
    const { upsertProcessDefaults } = await renderPage();
    await user.click(screen.getByRole('button', { name: /edit baking/i }));
    const dialog = screen.getByRole('dialog', { name: /baking/i });

    const cost = within(dialog).getByLabelText(/standard cost/i);
    await user.clear(cost);
    await user.type(cost, '20');

    const duration = within(dialog).getByLabelText(/default duration/i);
    await user.clear(duration);
    await user.type(duration, '3');

    // Baking starts with no roles — add one (picked from the labor_rates dropdown).
    await user.click(within(dialog).getByTestId('process-default-add-role'));
    await user.selectOptions(within(dialog).getByLabelText(/role \/ group 1/i), 'packer');
    const headcount = within(dialog).getByLabelText(/headcount 1/i);
    await user.clear(headcount);
    await user.type(headcount, '3');

    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(upsertProcessDefaults).toHaveBeenCalledTimes(1));
    expect(upsertProcessDefaults).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: OP_BAKE,
        standardCost: 20,
        defaultDurationHours: 3,
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
