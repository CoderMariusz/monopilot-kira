/**
 * @vitest-environment jsdom
 * T-135 RED — cross-component AppShell contracts from brief §7 risks and §3 luka inventory.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from '../app-sidebar';
import { AppTopbar } from '../app-topbar';
import { ScannerFrame } from '../scanner-frame';
import { SettingsSubNav } from '../settings-subnav';
import { SiteCrumb } from '../site-crumb';
import { UserMenu } from '../user-menu';

type Locale = 'en' | 'pl' | 'uk' | 'ro';
type AppLayoutProps = { children: React.ReactNode; params: Promise<{ locale: Locale }> };
type SettingsLayoutProps = { children: React.ReactNode; params: Promise<{ locale: string }> };
type ScannerLayoutProps = { children: React.ReactNode };
type LoginPageProps = { params: Promise<{ locale: string }> };

const appLayoutPath = path.resolve(process.cwd(), 'app/[locale]/(app)/layout.tsx');
const settingsLayoutPath = path.resolve(process.cwd(), 'app/[locale]/(app)/(admin)/settings/layout.tsx');
const scannerLayoutPath = path.resolve(process.cwd(), 'app/[locale]/(scanner)/layout.tsx');
const loginPagePath = path.resolve(process.cwd(), 'app/[locale]/(auth)/login/page.tsx');
const globalsPath = path.resolve(process.cwd(), 'app/globals.css');
const hiddenShellIds = ['app-shell', 'app-sidebar', 'app-topbar', 'settings-subnav', 'scanner-frame'] as const;

let currentPathname = '/en/dashboard';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  createServerSupabaseClient: vi.fn(),
  getUser: vi.fn(),
}));

function translated(namespace: string | undefined, key: string, values?: Record<string, string>) {
  const fullKey = namespace ? `${namespace}.${key}` : key;
  return `tx:${fullKey}`.replace(/\{(\w+)\}/g, (_match, valueKey: string) => values?.[valueKey] ?? '');
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), getAll: vi.fn(() => []), has: vi.fn(() => false) })),
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  usePathname: () => currentPathname,
  useParams: () => ({ locale: 'en' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, string>) => translated(namespace, key, values),
}));

vi.mock('next-intl/server', () => ({
  getMessages: vi.fn(async () => ({})),
  getTranslations: vi.fn(async (input?: string | { namespace?: string }) => {
    const namespace = typeof input === 'string' ? input : input?.namespace;
    return (key: string, values?: Record<string, string>) => translated(namespace, key, values);
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string | { pathname?: string }; children: React.ReactNode }) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname ?? '';
    return React.createElement('a', { href: resolvedHref, 'data-next-link': 'true', ...props }, children);
  },
}));

vi.mock('../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

async function loadDefault<T>(modulePath: string, label: string): Promise<T> {
  const mod = (await import(/* @vite-ignore */ modulePath)) as { default?: T };
  if (typeof mod.default !== 'function') {
    expect.fail(`${label} must default-export a renderable component`);
  }
  return mod.default;
}

function setAuthenticatedUser() {
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-shell-contract',
        email: 'shell.contract@example.test',
        user_metadata: {
          name: 'Shell Contract',
          org_id: 'org-shell',
          org_name: 'Acme Manufacturing',
          language: 'pl',
        },
      },
    },
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
}

async function renderAppShell(children: React.ReactNode, locale: Locale = 'en') {
  const AppLayout = await loadDefault<(props: AppLayoutProps) => React.ReactNode | Promise<React.ReactNode>>(
    appLayoutPath,
    '(app)/layout.tsx',
  );
  const node = await AppLayout({ children, params: Promise.resolve({ locale }) });
  return render(<>{node}</>);
}

function cssVar(name: string) {
  const source = readFileSync(globalsPath, 'utf8');
  const match = source.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`));
  expect(match, `${name} must be declared in app/globals.css`).not.toBeNull();
  return match?.[1].trim();
}

function expectExactlyOneTestId(testId: string) {
  expect(screen.getAllByTestId(testId), `${testId} should render exactly once`).toHaveLength(1);
}

function signOutNoop(_formData: FormData): never {
  throw new Error('NEXT_REDIRECT:/en/login');
}

beforeEach(() => {
  vi.clearAllMocks();
  currentPathname = '/en/dashboard';
  setAuthenticatedUser();
});

afterEach(() => cleanup());

describe('T-135 shell cross-component contracts', () => {
  it('renders the authenticated AppShell with one topbar, one sidebar, and children under main', async () => {
    // brief §3 Luka A/C: desktop modules need a single shared AppShell, not per-page shell forks.
    await renderAppShell(<section data-testid="contract-page">Contract page</section>);

    expect(mocks.createServerSupabaseClient, 'AppShell must use the server Supabase auth boundary').toHaveBeenCalledTimes(1);
    expect(mocks.getUser, 'AppShell must read the authenticated user before rendering chrome').toHaveBeenCalledTimes(1);
    expectExactlyOneTestId('app-shell');
    expectExactlyOneTestId('app-topbar');
    expectExactlyOneTestId('app-sidebar');
    const main = screen.getByTestId('app-shell-main');
    expect(main.tagName.toLowerCase()).toBe('main');
    expect(within(main).getByTestId('contract-page')).toHaveTextContent('Contract page');
  });

  it('keeps the login page isolated from every desktop, settings, and scanner shell region', async () => {
    // brief §7 risk: login renders sidebar/topbar instead of staying in the auth card topology.
    const LoginPage = await loadDefault<(props: LoginPageProps) => React.ReactNode | Promise<React.ReactNode>>(
      loginPagePath,
      '(auth)/login/page.tsx',
    );
    const node = await LoginPage({ params: Promise.resolve({ locale: 'en' }) });
    render(<>{node}</>);

    expect(screen.getByRole('main')).toBeInTheDocument();
    for (const testId of hiddenShellIds) {
      expect(screen.queryByTestId(testId), `login must not render ${testId}`).not.toBeInTheDocument();
    }
  });

  it('composes settings inside AppShell with SettingsSubNav, settings-main, and one active item', async () => {
    // brief §3 Luka D: settings needs nested subnav inside the app shell, not a parallel shell.
    currentPathname = '/en/settings/users';
    const SettingsLayout = await loadDefault<(props: SettingsLayoutProps) => React.ReactNode | Promise<React.ReactNode>>(
      settingsLayoutPath,
      '(app)/(admin)/settings/layout.tsx',
    );
    const settingsNode = await SettingsLayout({
      params: Promise.resolve({ locale: 'en' }),
      children: <article data-testid="settings-page">Users table</article>,
    });

    await renderAppShell(settingsNode);

    expectExactlyOneTestId('app-shell');
    expectExactlyOneTestId('settings-subnav');
    expect(within(screen.getByTestId('settings-main')).getByTestId('settings-page')).toHaveTextContent('Users table');
    const activeSettingsItems = within(screen.getByTestId('settings-subnav'))
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(activeSettingsItems, 'exactly one settings item should be active for /settings/users').toHaveLength(1);
    expect(activeSettingsItems[0]).toHaveAttribute('data-testid', 'settings-subnav-item-users');
  });

  it('isolates scanner layout from desktop chrome and yields the ScannerFrame device shell', async () => {
    // brief §7 risk: scanner inherits AppShell instead of the 390×844 scanner device chrome.
    const ScannerLayout = await loadDefault<(props: ScannerLayoutProps) => React.ReactNode>(
      scannerLayoutPath,
      '(scanner)/layout.tsx',
    );
    render(
      <>
        {ScannerLayout({
          children: <section data-testid="scanner-page-content">Scan pallet</section>,
        })}
      </>,
    );

    for (const testId of ['app-shell', 'app-sidebar', 'app-topbar', 'settings-subnav'] as const) {
      expect(screen.queryByTestId(testId), `scanner layout must not render ${testId}`).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('scanner-frame')).toBeInTheDocument();
    expect(within(screen.getByTestId('scanner-content')).getByTestId('scanner-page-content')).toHaveTextContent('Scan pallet');
  });

  it('keeps SiteCrumb as a static future SiteSwitcher slot without live select controls', () => {
    // brief §7 risk: SiteSwitcher ships too early before multi-site/T-020.
    render(<SiteCrumb orgName="Acme" />);

    const crumb = screen.getByTestId('app-topbar-sitecrumb');
    expect(crumb).toHaveAttribute('data-slot', 'site-switcher');
    expect(crumb).toHaveAttribute('data-todo', 'multi-site-T-020');
    expect(crumb).toHaveTextContent(/^Acme$/);
    expect(within(crumb).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(crumb).queryByRole('listbox')).not.toBeInTheDocument();
    expect(crumb.querySelector('select')).not.toBeInTheDocument();
    expect(crumb.querySelector('[data-radix-select-trigger]')).not.toBeInTheDocument();
  });

  it('keeps every rendered settings subnav item visible and marked with the RBAC T-130 TODO', () => {
    // brief §7 risk: settings nav appears complete while permission_key/T-130 gating is not done.
    currentPathname = '/en/settings/users';
    render(<SettingsSubNav locale="en" pathnameOverride="/en/settings/users" />);

    const items = within(screen.getByTestId('settings-subnav')).getAllByRole('link');
    expect(items.length, 'settings subnav should render all manifest items; permission checks must not hide them yet').toBeGreaterThan(20);
    expect(items.filter((item) => item.getAttribute('data-todo') === 'rbac/02-settings/T-130')).toHaveLength(items.length);
  });

  it('mounts the existing UserMenuLanguagePicker exactly once inside the opened user menu boundary', () => {
    // brief §7 risk: language picker is moved into the wrong client boundary or duplicated.
    render(
      <UserMenu
        user={{ id: 'user-language', email: 'language@example.test', name: 'Language User', initials: 'LU' }}
        orgId="org-language"
        locale="en"
        userLanguage="pl"
        effectiveLanguage="en"
        organizationLanguage="en"
        onSelectLanguage={vi.fn().mockResolvedValue({ ok: true, language: 'pl', hotSwitched: true, usersLanguageUpdated: true })}
        switchNextIntlLocale={vi.fn()}
        signOutAction={signOutNoop}
      />,
    );

    expect(screen.queryByRole('menu', { name: 'Language' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('app-topbar-user-trigger'));
    expect(screen.getAllByRole('menu', { name: 'Language' })).toHaveLength(1);
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(4);
  });

  it('consumes UI-127 shell CSS variables for sidebar, topbar, settings subnav, and scanner frame', async () => {
    // brief §3 Luka B/G: shell dimensions must consume shared tokens, not divergent literal px values.
    expect(cssVar('--shell-sidebar-w')).toBe('280px');
    expect(cssVar('--shell-topbar-h')).toBe('56px');
    expect(cssVar('--shell-subnav-w')).toBe('240px');
    expect(cssVar('--shell-scanner-w')).toBe('390px');
    expect(cssVar('--shell-scanner-h')).toBe('844px');

    const topbarNode = await AppTopbar({
      locale: 'en',
      user: { id: 'user-token', email: 'token@example.test', name: 'Token User', initials: 'TU' },
      orgId: 'org-token',
      orgName: 'Acme Tokens',
      userLanguage: 'pl',
      effectiveLanguage: 'en',
      organizationLanguage: 'en',
      signOutAction: signOutNoop,
      onSelectLanguage: vi.fn().mockResolvedValue({ ok: true, language: 'pl', hotSwitched: true, usersLanguageUpdated: true }),
      switchNextIntlLocale: vi.fn(),
    });

    render(
      <>
        <AppSidebar locale="en" pathnameOverride="/en/dashboard" />
        {topbarNode}
        <SettingsSubNav locale="en" pathnameOverride="/en/settings/users" />
        <ScannerFrame bottomActions={<button type="button">Confirm</button>}>Scan content</ScannerFrame>
      </>,
    );

    expect(getComputedStyle(screen.getByTestId('app-sidebar')).width).toBe('var(--shell-sidebar-w)');
    expect(getComputedStyle(screen.getByTestId('app-topbar')).height).toBe('var(--shell-topbar-h)');
    expect(getComputedStyle(screen.getByTestId('settings-subnav')).width).toBe('var(--shell-subnav-w)');
    expect(getComputedStyle(screen.getByTestId('scanner-frame')).width).toBe('var(--shell-scanner-w)');
    expect(getComputedStyle(screen.getByTestId('scanner-frame')).height).toBe('var(--shell-scanner-h)');
  });
});
