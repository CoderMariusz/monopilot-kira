/**
 * @vitest-environment jsdom
 * T-103 / SET-070-grid — Module Toggles Dashboard.
 *
 * RED phase: RTL contract for features_screen parity from
 * prototypes/design/Monopilot Design System/settings/ops-screens.jsx:166-198.
 * Missing production modules render an empty placeholder so RED reports behavior
 * assertion failures instead of module-resolution noise.
 */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const labels: Record<string, string> = {
  title: 'Feature flags',
  subtitle: 'Turn modules and features on for your workspace.',
  dryRunActivation: 'Dry-run activation',
  dryRunTitle: 'Preview affected modules + active sessions before saving flag changes',
  planNotice: "You're on the {planName}. All premium features are included. Beta features are released incrementally.",
  modulesTitle: 'Modules',
  earlyAccessTitle: 'Early access',
  earlyAccessCopy: 'Want to try a feature early?',
  joinPreviewProgram: 'Join the preview program →',
  loading: 'Loading module toggles…',
  empty: 'No modules are configured for this workspace.',
  error: 'Module toggles are currently unavailable. Try again later.',
  premium: 'Premium',
  beta: 'Beta',
  dependentsEnabled: '{count} dependents enabled',
  confirmDisableTitle: 'Disable module with enabled dependents?',
  confirmDisableBody: 'Downstream enabled modules may stop working until dependencies are restored.',
  cancel: 'Cancel',
  confirm: 'Confirm',
  close: 'Close',
  saveChanges: 'Save changes',
  dryRunDialogTitle: 'Dry-run — feature flag activation',
  dryRunAffects: 'Activating this flag set affects {modules} modules across {sessions} active sessions.',
  dryRunFlagsOn: '{enabled} of {total}',
  dryRunApplyOnLoad: 'flags currently on. Changes apply on next page load for each user.',
  affectedModulesLabel: 'Affected modules',
};

vi.mock('../../../../../../actions/modules/toggle', () => ({
  toggleModule: vi.fn(async (input: { moduleCode: string; enabled: boolean }) => ({
    ok: true as const,
    data: { moduleCode: input.moduleCode, enabled: input.enabled },
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Live org-scoped loader is exercised via this mock so the no-injected-data
// path renders REAL-shaped catalog rows rather than the old NO_LIVE_MODULES [].
const withOrgContextMock = vi.fn();
vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (fn: (ctx: unknown) => unknown) => withOrgContextMock(fn),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, number>) => {
    const value = labels[key] ?? key;
    return typeof values?.count === 'number' ? value.replace('{count}', String(values.count)) : value;
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

type ModuleToggle = {
  key: string;
  label: string;
  desc: string;
  enabled: boolean;
  premium?: boolean;
  beta?: boolean;
  enabledDependents?: string[];
};

type ToggleModuleInput = {
  moduleKey: string;
  enabled: boolean;
  force?: boolean;
};

type ToggleModuleResult = {
  ok: true;
  moduleKey: string;
  enabled: boolean;
  outboxEventType: 'settings.module_toggled';
};

type ModulesPageProps = {
  params?: Promise<{ locale: string }>;
  modules?: ModuleToggle[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
  planName?: string;
  activeSessionCount?: number;
  toggleModule?: (input: ToggleModuleInput) => Promise<ToggleModuleResult>;
};

type ModulesPage = (props: ModulesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const modules: ModuleToggle[] = [
  {
    key: 'npd',
    label: 'NPD',
    desc: 'Product development, specs, and allergen workflow.',
    enabled: true,
    premium: true,
    enabledDependents: [],
  },
  {
    key: 'warehouse',
    label: 'Warehouse',
    desc: 'License plates, GRN, transfers, and stock movements.',
    enabled: true,
    premium: true,
    enabledDependents: ['shipping'],
  },
  {
    key: 'shipping',
    label: 'Shipping',
    desc: 'Sales orders, allocation, pick/pack, BOL, and POD.',
    enabled: true,
    beta: true,
    enabledDependents: [],
  },
  {
    key: 'oee',
    label: 'OEE',
    desc: 'Availability, performance, quality, and read-only snapshots.',
    enabled: false,
    premium: true,
    beta: true,
    enabledDependents: [],
  },
];

async function loadModulesPage(): Promise<ModulesPage> {
  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'SET-070 modules page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return mod.default as ModulesPage;
}

async function renderModulesPage(overrides: Partial<ModulesPageProps> = {}) {
  const Page = await loadModulesPage();
  const props: ModulesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    modules,
    state: 'ready',
    planName: 'Premium plan',
    activeSessionCount: 28,
    toggleModule: vi.fn(async (input: ToggleModuleInput) => ({
      ok: true as const,
      moduleKey: input.moduleKey,
      enabled: input.enabled,
      outboxEventType: 'settings.module_toggled' as const,
    })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

async function renderModulesPageWithoutInjectedData() {
  // Live loader returns zero catalog rows → honest empty state (NOT demo rows).
  withOrgContextMock.mockImplementation(async (fn: (ctx: unknown) => unknown) =>
    fn({
      orgId: '00000000-0000-0000-0000-000000000001',
      client: {
        query: vi.fn(async (sql: string) =>
          /from\s+public\.modules/i.test(sql) ? { rows: [] } : { rows: [{ tier: 'L2', active_sessions: 0 }] },
        ),
      },
    }),
  );
  const Page = await loadModulesPage();
  const node = await Page({ params: Promise.resolve({ locale: 'en' }) });
  return render(React.createElement(React.Fragment, null, node));
}

function moduleRows() {
  return screen.getAllByTestId('settings-module-toggle-row');
}

function structuralSnapshot() {
  return {
    regions: Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
      region.getAttribute('data-region'),
    ),
    actions: screen.getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean),
    sections: screen.getAllByTestId('settings-module-section').map((section) =>
      within(section).getByRole('heading', { level: 2 }).textContent,
    ),
    modules: moduleRows().map((row) => ({
      label: within(row).getByTestId('settings-module-label').textContent,
      desc: within(row).getByTestId('settings-module-description').textContent,
      badges: within(row).queryAllByTestId('settings-module-badge').map((badge) => badge.textContent),
      checked: within(row).getByRole('switch').getAttribute('aria-checked'),
    })),
  };
}

function assertModalA11y(dialog: HTMLElement, name: RegExp) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(name);
  expect(within(dialog).getByRole('button', { name: /close|cancel/i })).toBeInTheDocument();
}

describe('SET-070 modules AppShell route contract', () => {
  it('defines the user-visible localized AppShell route instead of only a legacy settings route', () => {
    const canonicalRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/modules/page.tsx'),
      join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/modules/page.tsx'),
    ];
    const legacyRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(admin)/settings/modules/page.tsx'),
      join(process.cwd(), 'app/[locale]/(admin)/settings/modules/page.tsx'),
    ];

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'T-103 must implement /en/settings/modules under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only implementation',
    ).toBe(false);
  });
});

describe('SET-070 module toggles prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders prototype regions, labels, badges, shadcn switches, dry-run dialog, and keyboard order', async () => {
    const user = userEvent.setup();
    await renderModulesPage();

    expect(screen.getByTestId('settings-modules-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^feature flags$/i })).toBeInTheDocument();
    expect(screen.getByText(/turn modules and features on for your workspace/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/premium plan/i);
    expect(screen.getByRole('button', { name: /dry-run activation/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('link', { name: /join the preview program/i })).toHaveAttribute('href', expect.stringContaining('preview'));
    expect(document.querySelectorAll('[data-slot="switch"]').length).toBeGreaterThanOrEqual(modules.length);
    expect(document.querySelectorAll('input[type="checkbox"]:not([role="switch"])')).toHaveLength(0);

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "actions": [
          "Dry-run activation",
        ],
        "modules": [
          {
            "badges": [
              "Premium",
            ],
            "checked": "true",
            "desc": "Product development, specs, and allergen workflow.",
            "label": "NPD",
          },
          {
            "badges": [
              "Premium",
              "1 dependents enabled",
            ],
            "checked": "true",
            "desc": "License plates, GRN, transfers, and stock movements.",
            "label": "Warehouse",
          },
          {
            "badges": [
              "Beta",
            ],
            "checked": "true",
            "desc": "Sales orders, allocation, pick/pack, BOL, and POD.",
            "label": "Shipping",
          },
          {
            "badges": [
              "Premium",
              "Beta",
            ],
            "checked": "false",
            "desc": "Availability, performance, quality, and read-only snapshots.",
            "label": "OEE",
          },
        ],
        "regions": [
          "page-head",
          "plan-notice",
          "modules-section",
          "early-access-section",
        ],
        "sections": [
          "Modules",
          "Early access",
        ],
      }
    `);

    await user.tab();
    expect(screen.getByRole('button', { name: /dry-run activation/i })).toHaveFocus();
    await user.tab();
    expect(within(moduleRows()[0]).getByRole('switch', { name: /npd/i })).toHaveFocus();
    await user.tab();
    expect(within(moduleRows()[1]).getByRole('switch', { name: /warehouse/i })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /dry-run activation/i }));
    const dialog = screen.getByRole('dialog', { name: /dry-run/i });
    assertModalA11y(dialog, /dry-run/i);
    expect(dialog).toHaveTextContent(/affects 3 modules across 28 active sessions/i);
    expect(within(dialog).getByText(/3 of 4/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/affected modules/i)).toBeInTheDocument();
    expect(within(dialog).getAllByTestId('settings-dry-run-module-badge').map((badge) => badge.textContent)).toEqual([
      'NPD',
      'Warehouse',
      'Shipping',
    ]);
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Close', 'Save changes']);
  });

  it('does not fabricate PRD/demo module rows when the live loader returns an empty catalog', async () => {
    await renderModulesPageWithoutInjectedData();

    // Live loader was invoked (no NO_LIVE_MODULES [] shortcut).
    expect(withOrgContextMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryAllByTestId('settings-module-toggle-row'),
      'Empty live catalog must render the honest empty state, never fabricated module rows.',
    ).toHaveLength(0);
    // No fabricated demo module names or the old demo session count.
    expect(document.body).not.toHaveTextContent(/28 active sessions|NPD|Warehouse|Shipping|OEE/i);
    // Honest empty-state copy is shown.
    expect(document.body).toHaveTextContent(/no modules|not configured/i);
  });

  it('the page source wires a real org-scoped loader and carries no NO_LIVE_MODULES demo shortcut', () => {
    const sourcePath = [
      join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/modules/page.tsx'),
      join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/modules/page.tsx'),
    ].find((candidate) => existsSync(candidate));
    expect(sourcePath, 'modules page.tsx must exist').toBeTruthy();
    const source = readFileSync(sourcePath as string, 'utf8');
    expect(source, 'NO_LIVE_MODULES placeholder array must be removed').not.toMatch(/NO_LIVE_MODULES/);
    expect(source, "the dead 'live data unavailable' plan name must be removed").not.toMatch(/live data unavailable/);
    expect(source, 'an org-scoped loader must be wired').toMatch(/withOrgContext/);
    expect(source, 'the loader must query the real module catalog').toMatch(/from\s+public\.modules/);
    expect(source, 'the loader must read per-org enablement').toMatch(/organization_modules/);
    expect(source, 'module description must come from the catalog row').toMatch(/m\.description/);
  });

  it('renders REAL catalog-backed module rows with phase badges and dependency warnings', async () => {
    withOrgContextMock.mockImplementation(async (fn: (ctx: unknown) => unknown) =>
      fn({
        orgId: '00000000-0000-0000-0000-000000000001',
        client: {
          query: vi.fn(async (sql: string) => {
            if (/from\s+public\.modules/i.test(sql)) {
              return {
                rows: [
                  {
                    code: '08-production',
                    name: 'Production',
                    description: 'Work order execution, outputs, waste, and downtime.',
                    dependencies: [],
                    can_disable: true,
                    phase: 1,
                    enabled: true,
                  },
                  {
                    code: '15-oee',
                    name: 'OEE',
                    description: 'Availability, performance, quality, and read-only snapshots.',
                    dependencies: ['08-production'],
                    can_disable: true,
                    phase: 3,
                    enabled: true,
                  },
                ],
              };
            }
            return { rows: [{ tier: 'L2', active_sessions: 5 }] };
          }),
        },
      }),
    );

    const Page = await loadModulesPage();
    const node = await Page({ params: Promise.resolve({ locale: 'en' }) });
    render(React.createElement(React.Fragment, null, node));

    expect(withOrgContextMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Work order execution, outputs, waste, and downtime.')).toBeInTheDocument();
    // OEE is phase 3 → Premium badge derived from real catalog phase.
    const oeeRow = screen.getAllByTestId('settings-module-toggle-row').find((row) => within(row).queryByText('OEE'));
    expect(within(oeeRow as HTMLElement).getByText('Premium')).toBeInTheDocument();
    // OEE (enabled) depends on Production → Production shows "1 dependents enabled".
    const productionRow = screen
      .getAllByTestId('settings-module-toggle-row')
      .find((row) => within(row).queryByText('Production'));
    expect(within(productionRow as HTMLElement).getByText('1 dependents enabled')).toBeInTheDocument();
  });

  it('renders loading, empty, and error states without silently skipping parity invariants', async () => {
    await renderModulesPage({ state: 'loading' });
    expect(screen.getByText(/loading module toggles/i)).toBeInTheDocument();
    expect(screen.getByTestId('settings-modules-loading-state')).toBeInTheDocument();

    cleanup();
    await renderModulesPage({ state: 'empty', modules: [] });
    expect(screen.getByText(/no modules are configured/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /join the preview program/i })).toBeInTheDocument();

    cleanup();
    await renderModulesPage({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/module toggles are currently unavailable/i);
  });

  it('shows enabled-dependent warning and requires force confirmation before invoking T-019 toggleModule', async () => {
    const user = userEvent.setup();
    const toggleModule = vi.fn(async (input: ToggleModuleInput) => ({
      ok: true as const,
      moduleKey: input.moduleKey,
      enabled: input.enabled,
      outboxEventType: 'settings.module_toggled' as const,
    }));
    await renderModulesPage({ toggleModule });

    const warehouseRow = moduleRows().find((row) => within(row).queryByText('Warehouse'));
    expect(warehouseRow, 'Warehouse row must render before dependent-toggle assertions run').toBeTruthy();
    expect(within(warehouseRow as HTMLElement).getByText('1 dependents enabled')).toHaveAttribute('data-variant', 'warning');

    await user.click(within(warehouseRow as HTMLElement).getByRole('switch', { name: /warehouse/i }));

    expect(toggleModule).not.toHaveBeenCalled();
    const confirmDialog = screen.getByRole('dialog', { name: /disable module with enabled dependents/i });
    assertModalA11y(confirmDialog, /disable module with enabled dependents/i);
    expect(confirmDialog).toHaveTextContent(/downstream enabled modules may stop working/i);

    await user.click(within(confirmDialog).getByRole('button', { name: /^confirm$/i }));

    expect(toggleModule).toHaveBeenCalledTimes(1);
    expect(toggleModule).toHaveBeenCalledWith({ moduleKey: 'warehouse', enabled: false, force: true });
    expect(await toggleModule.mock.results[0].value).toEqual(
      expect.objectContaining({ outboxEventType: 'settings.module_toggled' }),
    );
  });
});
