/**
 * @vitest-environment jsdom
 * UI-131 RED — App route-group AppShell grid + Server Component Supabase auth guard.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Locale = 'en' | 'pl' | 'uk' | 'ro';
type AppLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
};
type AppLayoutComponent = (props: AppLayoutProps) => React.ReactNode | Promise<React.ReactNode>;

type ShellComponentCall = Record<string, unknown>;

const appLayoutPath = path.resolve(process.cwd(), 'app/[locale]/(app)/layout.tsx');
const loadingPath = path.resolve(process.cwd(), 'app/[locale]/(app)/loading.tsx');
const supabaseServerPath = path.resolve(process.cwd(), 'lib/auth/supabase-server.ts');
const appTopbarPath = path.resolve(process.cwd(), 'components/shell/app-topbar.tsx');
const appSidebarPath = path.resolve(process.cwd(), 'components/shell/app-sidebar.tsx');

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  createServerSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  topbarCalls: [] as ShellComponentCall[],
  sidebarCalls: [] as ShellComponentCall[],
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  usePathname: () => '/en/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock('../../../../components/shell/app-topbar', () => ({
  AppTopbar: async (props: ShellComponentCall) => {
    mocks.topbarCalls.push(props);
    return (
      <header data-testid="app-topbar" data-locale={String(props.locale)} role="banner" style={{ height: 'var(--shell-topbar-h)' }}>
        Mock topbar for {String((props.user as { email?: string } | undefined)?.email ?? 'unknown')}
      </header>
    );
  },
  default: async (props: ShellComponentCall) => {
    mocks.topbarCalls.push(props);
    return (
      <header data-testid="app-topbar" data-locale={String(props.locale)} role="banner" style={{ height: 'var(--shell-topbar-h)' }}>
        Mock topbar for {String((props.user as { email?: string } | undefined)?.email ?? 'unknown')}
      </header>
    );
  },
}));

vi.mock('../../../../components/shell/app-sidebar', () => ({
  AppSidebar: (props: ShellComponentCall) => {
    mocks.sidebarCalls.push(props);
    return (
      <aside data-testid="app-sidebar" data-locale={String(props.locale)} role="navigation" style={{ width: 'var(--shell-sidebar-w)' }}>
        Mock sidebar
      </aside>
    );
  },
  default: (props: ShellComponentCall) => {
    mocks.sidebarCalls.push(props);
    return (
      <aside data-testid="app-sidebar" data-locale={String(props.locale)} role="navigation" style={{ width: 'var(--shell-sidebar-w)' }}>
        Mock sidebar
      </aside>
    );
  },
}));

async function loadLayout(): Promise<AppLayoutComponent> {
  expect(existsSync(appLayoutPath), '(app)/layout.tsx must exist').toBe(true);
  expect(existsSync(supabaseServerPath), 'Supabase Server Component auth helper must exist').toBe(true);
  expect(existsSync(appTopbarPath), 'AppTopbar component must exist before layout mocks can verify wiring').toBe(true);
  expect(existsSync(appSidebarPath), 'AppSidebar component must exist before layout mocks can verify wiring').toBe(true);

  const mod = (await import(/* @vite-ignore */ appLayoutPath)) as { default?: AppLayoutComponent };
  if (typeof mod.default !== 'function') {
    expect.fail('(app)/layout.tsx must default-export the route-group layout component');
  }
  return mod.default;
}

async function renderAppLayout(locale: Locale = 'en') {
  const Layout = await loadLayout();
  const node = await Layout({
    params: Promise.resolve({ locale }),
    children: <section data-testid="existing-page-content">Existing application page content</section>,
  });
  return render(<>{node}</>);
}

function setAuthenticatedUser() {
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-131',
        email: 'ui-131@example.test',
        user_metadata: { name: 'UI 131 Tester' },
      },
    },
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
}

function setUnauthenticatedUser() {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.createServerSupabaseClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
}

function runShellA11yAudit(container: HTMLElement) {
  const violations: string[] = [];
  const shell = container.querySelector('[data-testid="app-shell"]');
  const topbar = container.querySelector('[data-testid="app-topbar"]');
  const sidebar = container.querySelector('[data-testid="app-sidebar"]');
  const main = container.querySelector('[data-testid="app-shell-main"]');

  if (!(shell instanceof HTMLElement)) violations.push('missing app-shell landmark root');
  if (!(topbar instanceof HTMLElement) || topbar.getAttribute('role') !== 'banner') violations.push('topbar must be a banner');
  if (!(sidebar instanceof HTMLElement) || sidebar.getAttribute('role') !== 'navigation') violations.push('sidebar must be navigation');
  if (!(main instanceof HTMLElement) || main.tagName.toLowerCase() !== 'main') violations.push('shell content must be rendered in a <main>');

  return violations;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.topbarCalls.length = 0;
  mocks.sidebarCalls.length = 0;
  setAuthenticatedUser();
});

afterEach(() => cleanup());

describe('UI-131 (app) route-group AppShell layout', () => {
  it('authenticates in the Server Component and renders Topbar, Sidebar, and main around existing page content', async () => {
    const { container } = await renderAppLayout('en');

    expect(mocks.createServerSupabaseClient, 'layout must create the server Supabase client').toHaveBeenCalledTimes(1);
    expect(mocks.getUser, 'layout must call auth.getUser() before rendering app chrome').toHaveBeenCalledTimes(1);

    const shell = screen.getByTestId('app-shell');
    expect(shell).toHaveClass('grid');
    expect(shell).toHaveStyle({ minHeight: '100vh' });

    expect(screen.getByTestId('app-topbar')).toHaveAttribute('role', 'banner');
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('role', 'navigation');

    const main = screen.getByTestId('app-shell-main');
    expect(main.tagName.toLowerCase()).toBe('main');
    expect(main).toHaveClass('overflow-auto');
    expect(within(main).getByTestId('existing-page-content')).toHaveTextContent('Existing application page content');

    expect(runShellA11yAudit(container), 'AppShell rendered tree should have zero axe-equivalent landmark violations').toEqual([]);
  });

  it('redirects unauthenticated users to the locale login route before rendering AppShell markup', async () => {
    setUnauthenticatedUser();
    const Layout = await loadLayout();

    await expect(
      Promise.resolve().then(() =>
        Layout({
          params: Promise.resolve({ locale: 'en' }),
          children: <section data-testid="existing-page-content">Should not render</section>,
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/en/login');

    expect(mocks.redirect).toHaveBeenCalledWith('/en/login');
    expect(mocks.topbarCalls).toHaveLength(0);
    expect(mocks.sidebarCalls).toHaveLength(0);
  });

  it('propagates params.locale into both shell chrome components', async () => {
    await renderAppLayout('pl');

    expect(mocks.topbarCalls).toHaveLength(1);
    expect(mocks.sidebarCalls).toHaveLength(1);
    expect(mocks.topbarCalls[0]).toMatchObject({ locale: 'pl' });
    expect(mocks.sidebarCalls[0]).toMatchObject({ locale: 'pl' });
    expect(screen.getByTestId('app-topbar')).toHaveAttribute('data-locale', 'pl');
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-locale', 'pl');
  });

  it('provides a loading skeleton that preserves shell topbar and sidebar dimensions', async () => {
    expect(existsSync(loadingPath), '(app)/loading.tsx must exist so suspense loading keeps AppShell dimensions').toBe(true);
    if (!existsSync(loadingPath)) return;

    const mod = (await import(/* @vite-ignore */ loadingPath)) as { default?: React.ComponentType };
    const Loading = mod.default;
    if (typeof Loading !== 'function') {
      expect.fail('(app)/loading.tsx must default-export a React loading skeleton');
    }

    render(<Loading />);
    expect(screen.getByTestId('app-shell')).toHaveStyle({ minHeight: '100vh' });
    expect(screen.getByTestId('app-topbar')).toHaveStyle({ height: 'var(--shell-topbar-h)' });
    expect(screen.getByTestId('app-sidebar')).toHaveStyle({ width: 'var(--shell-sidebar-w)' });
    expect(screen.getByTestId('app-shell-main')).toBeInTheDocument();
  });
});
