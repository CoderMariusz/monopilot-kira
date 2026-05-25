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
  withOrgContext: vi.fn(),
  topbarCalls: [] as Array<Record<string, unknown>>,
  sidebarCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  usePathname: () => '/en/settings/units',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
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
    mocks.withOrgContext.mockReset();
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
    expect(within(main).getByRole('heading', { name: /units & conversions/i })).toBeInTheDocument();
    expect(within(main).getByText(/units of measure used across recipes, stock, and shipping/i)).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: /add unit/i })).toHaveAttribute('data-slot', 'button');

    const regions = within(main).getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(regions).toEqual(['mass', 'volume', 'Custom conversions']);
    expect(within(main).getByText(/base unit:\s*kilogram/i)).toBeInTheDocument();
    expect(within(main).getByText(/base unit:\s*litre/i)).toBeInTheDocument();

    for (const tableName of [/mass units/i, /volume units/i]) {
      const table = within(main).getByRole('table', { name: tableName });
      expect(table).toHaveAttribute('data-slot', 'table');
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
    expect(within(kgRow).getByText('Base')).toHaveAttribute('data-slot', 'badge');
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
      Array.from(main!.querySelectorAll('h1,h2,button,a,th,td,[data-slot="badge"]'))
        .filter((node) => !(node instanceof HTMLElement && node.matches('td') && node.querySelector('[data-slot="badge"]')))
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
        "g",
        "Gram",
        "0.001",
        "—",
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
});
