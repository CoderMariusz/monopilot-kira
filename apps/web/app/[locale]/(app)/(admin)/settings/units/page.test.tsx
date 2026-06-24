/**
 * @vitest-environment jsdom
 * T-073 / SET-094 — Units (UoM) screen.
 *
 * RED phase: page-level RTL tests for units_screen parity at
 * prototypes/design/Monopilot Design System/settings/data-screens.jsx:151-187.
 * Missing production page falls back to an empty placeholder so RED fails on
 * required visible behavior, not module-resolution noise.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  createServerSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  cachedUserPromise: undefined as Promise<unknown> | undefined,
  withOrgContext: vi.fn(),
  createUnit: vi.fn(),
  createCustomConversion: vi.fn(),
  softDeleteUnit: vi.fn(),
  refresh: vi.fn(),
  topbarCalls: [] as Array<Record<string, unknown>>,
  sidebarCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  usePathname: () => '/en/settings/units',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

// The Add-unit / Add-conversion dialogs call these real Server Actions
// (apps/web/app/.../settings/units/_actions/manage-units.ts). Mock the module so
// the RTL test can assert the working CTA invokes the action without a live DB.
vi.mock('./_actions/manage-units', () => ({
  createUnit: mocks.createUnit,
  createCustomConversion: mocks.createCustomConversion,
  softDeleteUnit: mocks.softDeleteUnit,
}));

vi.mock('../../../../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createCachedServerSupabaseClient: mocks.createServerSupabaseClient,
  getCachedUser: async () => {
    mocks.cachedUserPromise ??= Promise.resolve()
      .then(() => mocks.createServerSupabaseClient())
      .then((supabase) => supabase.auth.getUser());
    return mocks.cachedUserPromise;
  },
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: mocks.withOrgContext,
}));

vi.mock('../../../../../../components/shell/app-topbar', () => ({
  AppTopbar: async (props: Record<string, unknown>) => {
    mocks.topbarCalls.push(props);
    return (
      <header data-testid="app-topbar" data-locale={String(props.locale)} role="banner">
        Mock topbar
      </header>
    );
  },
}));

vi.mock('../../../../../../components/shell/app-sidebar', () => ({
  AppSidebar: (props: Record<string, unknown>) => {
    mocks.sidebarCalls.push(props);
    return (
      <aside data-testid="app-sidebar" data-locale={String(props.locale)} role="navigation">
        Mock sidebar
      </aside>
    );
  },
}));

type UnitCategory = 'mass' | 'volume' | 'count';

type UnitOfMeasure = {
  id: string;
  category: UnitCategory;
  code: string;
  name: string;
  factorToBase: number;
  isBase: boolean;
};

type CustomConversion = {
  id: string;
  label: string;
  from: string;
  to: string;
  factor: number;
};

type UnitsPageProps = {
  params?: Promise<{ locale: string }>;
  units?: UnitOfMeasure[];
  customConversions?: CustomConversion[];
  canEdit?: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
};

type UnitsPage = (props: UnitsPageProps) => React.ReactNode | Promise<React.ReactNode>;
type AppRouteGroupLayout = (props: {
  children: React.ReactNode;
  params: Promise<{ locale: 'en' | 'pl' | 'uk' | 'ro' }>;
}) => React.ReactNode | Promise<React.ReactNode>;

const pageProps: Required<Pick<UnitsPageProps, 'units' | 'customConversions' | 'canEdit' | 'state'>> = {
  units: [
    { id: 'u-kg', category: 'mass', code: 'kg', name: 'Kilogram', factorToBase: 1, isBase: true },
    { id: 'u-g', category: 'mass', code: 'g', name: 'Gram', factorToBase: 0.001, isBase: false },
    { id: 'u-l', category: 'volume', code: 'L', name: 'Litre', factorToBase: 1, isBase: true },
  ],
  customConversions: [],
  canEdit: true,
  state: 'ready',
};

async function loadUnitsPage(): Promise<UnitsPage> {
  try {
    const pageModulePath: string = './page';
    const mod = (await import(/* @vite-ignore */ pageModulePath)) as { default?: UnitsPage };
    expect(mod.default, 'SET-094 units page must default-export a renderable Server Component').toEqual(
      expect.any(Function),
    );
    return mod.default as UnitsPage;
  } catch {
    return function MissingUnitsPage() {
      return <main data-testid="missing-units-page" />;
    };
  }
}

async function loadAppRouteGroupLayout(): Promise<AppRouteGroupLayout> {
  const layoutModulePath: string = '../../../layout';
  const mod = (await import(/* @vite-ignore */ layoutModulePath)) as { default?: AppRouteGroupLayout };
  expect(mod.default, '/en/settings/units must render through app/[locale]/(app)/layout.tsx').toEqual(
    expect.any(Function),
  );
  return mod.default as AppRouteGroupLayout;
}

function setAuthenticatedShellUser() {
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'set-094-user',
        email: 'set-094@example.test',
        user_metadata: {
          name: 'SET-094 Tester',
          org_id: 'org-set-094',
          org_name: 'SET-094 Org',
        },
      },
    },
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
}

async function renderUnitsPage(overrides: UnitsPageProps = {}) {
  const Page = await loadUnitsPage();
  const node = await Page({
    params: Promise.resolve({ locale: 'en' }),
    ...pageProps,
    ...overrides,
  });
  return render(<>{node}</>);
}

async function renderUnitsRouteThroughAppShell(overrides: UnitsPageProps = {}) {
  const Page = await loadUnitsPage();
  const Layout = await loadAppRouteGroupLayout();
  const pageNode = await Page({
    params: Promise.resolve({ locale: 'en' }),
    ...pageProps,
    ...overrides,
  });
  const shellNode = await Layout({ children: pageNode, params: Promise.resolve({ locale: 'en' }) });
  return render(<>{shellNode}</>);
}

describe('SET-094 Units (UoM) screen parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.topbarCalls.length = 0;
    mocks.sidebarCalls.length = 0;
    mocks.cachedUserPromise = undefined;
    mocks.withOrgContext.mockReset();
    mocks.withOrgContext.mockImplementation(async (callback: (ctx: { client: { query: typeof vi.fn }; userId: string }) => Promise<unknown>) =>
      callback({
        userId: 'set-094-user',
        client: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
      }),
    );
    mocks.createUnit.mockReset();
    mocks.createCustomConversion.mockReset();
    mocks.softDeleteUnit.mockReset();
    mocks.refresh.mockReset();
    setAuthenticatedShellUser();
  });

  it('renders /en/settings/units inside the localized AppShell with units_screen section order and table structure', async () => {
    const { container } = await renderUnitsRouteThroughAppShell();

    expect(mocks.createServerSupabaseClient, 'AppShell route evidence must authenticate before rendering settings').toHaveBeenCalledTimes(1);
    expect(mocks.getUser, 'AppShell route evidence must call auth.getUser before shell render').toHaveBeenCalledTimes(1);
    expect(mocks.topbarCalls).toEqual([expect.objectContaining({ locale: 'en' })]);
    expect(mocks.sidebarCalls).toEqual([expect.objectContaining({ locale: 'en' })]);
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('app-topbar')).toHaveAttribute('role', 'banner');
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('role', 'navigation');

    const main = screen.getByTestId('app-shell-main');
    // Page title now renders through the shared PageHead primitive as a
    // `.sg-title` element (design parity: not an oversized text-2xl heading).
    const pageTitle = main.querySelector('.sg-title');
    expect(pageTitle, 'units screen must render the title via PageHead `.sg-title`').not.toBeNull();
    expect(pageTitle).toHaveTextContent(/units & conversions/i);
    expect(within(main).getByText(/units of measure used across recipes, stock, and shipping/i)).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: /add unit/i })).toHaveAttribute('data-slot', 'button');

    // Each grouped table + custom-conversions block is wrapped in the shared
    // `Section` primitive, which exposes a labelled region (role=region +
    // aria-labelledby -> the `.sg-section-title`).
    const regions = within(main).getAllByRole('region', { name: /mass|volume|custom conversions/i });
    expect(regions.map((region) => region.querySelector('.sg-section-title')?.textContent)).toEqual([
      'mass',
      'volume',
      'Custom conversions',
    ]);
    expect(within(main).getByText(/base unit:\s*kilogram/i)).toBeInTheDocument();
    expect(within(main).getByText(/base unit:\s*litre/i)).toBeInTheDocument();

    for (const tableName of [/mass units/i, /volume units/i]) {
      // Prototype-style bare <table> (globals `table` styling: grey th, td
      // borders) instead of the @monopilot/ui BEM Table.
      const table = within(main).getByRole('table', { name: tableName });
      for (const header of ['Code', 'Name', 'Factor to base', 'Base?', 'Actions']) {
        expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
      }
    }

    expect(container.querySelector('[data-testid="missing-units-page"]')).toBeNull();
  });

  it('marks kg as the mass base unit, renders the zero-conversions empty link, and preserves keyboard focus order', async () => {
    await renderUnitsPage();
    const user = userEvent.setup();

    const massTable = screen.getByRole('table', { name: /mass units/i });
    const kgRow = within(massTable).getByRole('row', { name: /kg kilogram 1 base/i });
    // Prototype "Base" badge (data-screens.jsx:173) — bare `.badge.badge-blue`.
    expect(within(kgRow).getByText('Base')).toHaveClass('badge', 'badge-blue');
    expect(within(massTable).getByRole('row', { name: /g gram 0\.001/i })).toHaveTextContent('—');

    const customConversions = screen.getByRole('region', { name: /custom conversions/i });
    expect(within(customConversions).getByText(/no custom conversions yet/i)).toBeInTheDocument();
    expect(within(customConversions).getByRole('link', { name: /add custom conversion/i })).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /add unit/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: /add custom conversion/i })).toHaveFocus();
  });

  it('renders required loading, error, empty, and permission-denied states loudly instead of silently skipping them', async () => {
    const { unmount } = await renderUnitsPage({ state: 'loading' });
    expect(screen.getByRole('status', { name: /loading units/i })).toBeInTheDocument();
    unmount();

    await renderUnitsPage({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load units/i);
    cleanup();

    await renderUnitsPage({ state: 'empty', units: [], customConversions: [] });
    expect(screen.getByText(/no units configured yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add custom conversion/i })).toBeInTheDocument();
    cleanup();

    await renderUnitsPage({ state: 'permission_denied', canEdit: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/do not have permission to manage units/i);
    expect(screen.queryByRole('button', { name: /add unit/i })).not.toBeInTheDocument();
  });

  it('captures a compact RTL parity snapshot of the prototype-backed ready state', async () => {
    const { container } = await renderUnitsPage();
    const main = container.querySelector('main, [data-screen="settings-units"]');
    expect(main, 'ready-state snapshot must cover the units screen root').not.toBeNull();
    expect(
      Array.from(main!.querySelectorAll('.sg-title,.sg-section-title,button,a,th,td,.badge'))
        .filter((node) => !(node instanceof HTMLElement && node.matches('td') && node.querySelector('.badge')))
        .map((node) => node.textContent?.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ).toMatchInlineSnapshot(`
      [
        "Units & conversions",
        "+ Add unit",
        "mass",
        "Code",
        "Name",
        "Factor to base",
        "Base?",
        "Actions",
        "kg",
        "Kilogram",
        "1",
        "Base",
        "⋮",
        "g",
        "Gram",
        "0.001",
        "—",
        "⋮",
        "volume",
        "Code",
        "Name",
        "Factor to base",
        "Base?",
        "Actions",
        "L",
        "Litre",
        "1",
        "Base",
        "⋮",
        "Custom conversions",
        "+ Add custom conversion",
      ]
    `);
  });

  it('does not expose a dead Add unit affordance: the screen is either editable via dialog or explicitly deferred/read-only', async () => {
    await renderUnitsPage();
    const user = userEvent.setup();

    const addUnitButton = screen.queryByRole('button', { name: /^\+ add unit$/i });
    if (addUnitButton) {
      await user.click(addUnitButton);
      const dialog = screen.queryByRole('dialog', { name: /add unit/i });
      expect(
        dialog,
        'Clicking the prototype primary CTA must open an Add unit dialog; otherwise hide the CTA and render explicit read-only/deferred capability copy.',
      ).toBeInTheDocument();
      expect(within(dialog!).getByLabelText(/code/i)).toBeInTheDocument();
      expect(within(dialog!).getByLabelText(/name/i)).toBeInTheDocument();
      expect(within(dialog!).getByLabelText(/factor to base/i)).toBeInTheDocument();
      expect(within(dialog!).getByRole('button', { name: /save|create|add unit/i })).toBeEnabled();
      return;
    }

    expect(
      screen.getByRole('region', { name: /units capability matrix|capability matrix/i }),
      'When units are not editable in this wave, the UI must state that as an explicit capability matrix instead of implying CRUD is complete.',
    ).toBeInTheDocument();
    expect(screen.getByText(/read-only|deferred|not editable/i)).toBeInTheDocument();
  });

  it('does not fall back to seed-looking unit data or enabled CRUD when live org DB context is unavailable', async () => {
    mocks.withOrgContext.mockRejectedValueOnce(new Error('org context unavailable'));

    await renderUnitsPage({ units: undefined, customConversions: undefined, canEdit: undefined, state: undefined });

    expect(screen.queryByRole('row', { name: /kg kilogram 1 base/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /g gram 0\.001/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^\+ add unit$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/unable|unavailable|permission|read-only|deferred/i);
  });

  // ── Wave 2b: real read + canEdit-from-RBAC + working add ──────────────────

  type FakeRow = Record<string, unknown>;
  type DbScript = { units: FakeRow[]; conversions: FakeRow[]; canManage: boolean };

  // Drives the REAL readUnitsData() path: withOrgContext invokes the page
  // callback with a fake app-role client whose query() answers by SQL shape,
  // mirroring the live unit_of_measure / uom_custom_conversions / role_permissions
  // reads (migration 064). No props are injected, so the page reads live data.
  function wireLiveRead(script: DbScript) {
    mocks.withOrgContext.mockImplementation(
      async (action: (ctx: { userId: string; orgId: string; sessionToken: string; client: unknown }) => Promise<unknown>) => {
        const client = {
          query: async (sql: string) => {
            if (/from\s+public\.unit_of_measure/i.test(sql)) {
              return { rows: script.units, rowCount: script.units.length };
            }
            if (/from\s+public\.uom_custom_conversions/i.test(sql)) {
              return { rows: script.conversions, rowCount: script.conversions.length };
            }
            if (/public\.role_permissions/i.test(sql) && /settings\.units\.manage|\$3/i.test(sql)) {
              return script.canManage ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
            }
            return { rows: [], rowCount: 0 };
          },
        };
        return action({ userId: 'set-094-user', orgId: 'org-set-094', sessionToken: 'tok', client });
      },
    );
  }

  const liveUnitRows: FakeRow[] = [
    { id: 'u-kg', category: 'mass', code: 'kg', name: 'Kilogram', factor_to_base: '1', is_base: true },
    { id: 'u-g', category: 'mass', code: 'g', name: 'Gram', factor_to_base: '0.001', is_base: false },
  ];

  it('reads units from the live unit_of_measure table via withOrgContext (no injected props, no mocks)', async () => {
    wireLiveRead({ units: liveUnitRows, conversions: [], canManage: true });

    await renderUnitsPage({ units: undefined, customConversions: undefined, canEdit: undefined, state: undefined });

    expect(mocks.withOrgContext, 'page must read through the org-scoped HOF, not a hardcoded array').toHaveBeenCalled();
    const massTable = screen.getByRole('table', { name: /mass units/i });
    expect(within(massTable).getByRole('row', { name: /kg kilogram 1 base/i })).toBeInTheDocument();
    expect(within(massTable).getByRole('row', { name: /g gram 0\.001/i })).toBeInTheDocument();
  });

  it('derives canEdit from the real settings.units.manage permission, not a hardcoded false', async () => {
    // With permission → editable affordances render.
    wireLiveRead({ units: liveUnitRows, conversions: [], canManage: true });
    await renderUnitsPage({ units: undefined, customConversions: undefined, canEdit: undefined, state: undefined });
    expect(
      screen.getByRole('button', { name: /^\+ add unit$/i }),
      'a caller holding settings.units.manage must see the Add unit CTA',
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /capability matrix/i })).not.toBeInTheDocument();
    cleanup();

    // Without permission → CTA hidden (no render-then-disable info leak).
    wireLiveRead({ units: liveUnitRows, conversions: [], canManage: false });
    await renderUnitsPage({ units: undefined, customConversions: undefined, canEdit: undefined, state: undefined });
    expect(
      screen.queryByRole('button', { name: /^\+ add unit$/i }),
      'a caller lacking settings.units.manage must NOT see the Add unit CTA',
    ).not.toBeInTheDocument();
  });

  it('Add unit dialog submits to the real createUnit Server Action with the typed payload', async () => {
    mocks.createUnit.mockResolvedValue({ ok: true, data: { id: 'u-new', code: 'lb', category: 'mass' } });
    const user = userEvent.setup();

    await renderUnitsPage({
      units: [{ id: 'u-kg', category: 'mass', code: 'kg', name: 'Kilogram', factorToBase: 1, isBase: true }],
      customConversions: [],
      canEdit: true,
      state: 'ready',
    });

    await user.click(screen.getByRole('button', { name: /^\+ add unit$/i }));
    const dialog = screen.getByRole('dialog', { name: /add unit/i });

    await user.type(within(dialog).getByLabelText(/code/i), 'lb');
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Pound');
    const factor = within(dialog).getByLabelText(/factor to base/i);
    await user.clear(factor);
    await user.type(factor, '0.453592');
    await user.click(within(dialog).getByRole('button', { name: /save unit/i }));

    expect(mocks.createUnit, 'clicking Save must call the real createUnit action').toHaveBeenCalledTimes(1);
    expect(mocks.createUnit).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'mass', code: 'lb', name: 'Pound', factorToBase: 0.453592 }),
    );
  });
});
