/**
 * @vitest-environment jsdom
 * UI-129 RED — AppSidebar manifest, active-state, token, link, and a11y contract.
 *
 * RED scope is tests-only. The production component is expected at
 * apps/web/components/shell/app-sidebar.tsx and must consume APP_NAV_GROUPS.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_NAV_GROUPS } from '../../../lib/navigation/app-nav';

let currentPathname = '/en/dashboard';

function translatedKey(namespace: string | undefined, key: string) {
  return `tx:${namespace ? `${namespace}.${key}` : key}`;
}

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => (key: string) => translatedKey(namespace, key),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string | { pathname?: string }; children: React.ReactNode }) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname ?? '';
    return React.createElement('a', { href: resolvedHref, 'data-next-link': 'true', ...props }, children);
  },
}));

type AppSidebarProps = {
  locale?: string;
  pathnameOverride?: string;
};

type AppSidebarComponent = React.ComponentType<AppSidebarProps>;

const expectedGroups = APP_NAV_GROUPS.map((group) => ({
  ...group,
  translatedLabel: translatedKey(undefined, group.i18n_key),
  items: group.items.map((item) => ({
    ...item,
    translatedLabel: translatedKey(undefined, item.i18n_key),
    localizedHref: `/en${item.route}`,
  })),
}));
const expectedItems = expectedGroups.flatMap((group) => group.items);

const importModule = (specifier: string) => vi.importActual<unknown>(specifier);
const appSidebarPath = path.resolve(process.cwd(), 'components/shell/app-sidebar.tsx');

async function loadAppSidebar(): Promise<AppSidebarComponent> {
  if (!existsSync(appSidebarPath)) {
    throw new Error('AppSidebar production component is not implemented at apps/web/components/shell/app-sidebar.tsx');
  }

  try {
    const mod = await importModule('../app-sidebar');
    const AppSidebar = (mod as { AppSidebar?: AppSidebarComponent; default?: AppSidebarComponent }).AppSidebar ??
      (mod as { default?: AppSidebarComponent }).default;

    if (typeof AppSidebar !== 'function') {
      throw new TypeError('module must export AppSidebar or a default React component');
    }

    return AppSidebar;
  } catch (error) {
    throw new Error(
      `AppSidebar production component must exist at apps/web/components/shell/app-sidebar.tsx and export a renderable component: ${String(error)}`,
    );
  }
}

async function renderSidebar(pathnameOverride = '/en/dashboard') {
  currentPathname = pathnameOverride;
  const AppSidebar = await loadAppSidebar();
  return render(<AppSidebar locale="en" pathnameOverride={pathnameOverride} />);
}

type AxeViolation = { id: string };
type AxeRunResult = { violations: AxeViolation[] };
type AxeCoreModule = { default: { run: (context: Element | Document | string) => Promise<AxeRunResult> } };

async function loadAxeCore(): Promise<AxeCoreModule> {
  try {
    return (await importModule('axe-core')) as AxeCoreModule;
  } catch (error) {
    throw new Error(`axe-core must be available so UI-129 can assert zero accessibility violations: ${String(error)}`);
  }
}

afterEach(() => cleanup());

beforeEach(() => {
  currentPathname = '/en/dashboard';
});

describe('UI-129 AppSidebar manifest rendering', () => {
  it('renders five group headers and fifteen manifest items in UI-128 order, with Scanner excluded', async () => {
    await renderSidebar('/en/dashboard');

    const root = screen.getByTestId('app-sidebar');
    expect(root, 'root must expose data-testid=app-sidebar').toBeInTheDocument();

    const groupHeaders = Array.from(root.querySelectorAll('[data-slot="group"]'));
    expect(groupHeaders, 'AppSidebar must render exactly the five APP_NAV_GROUPS headers').toHaveLength(5);
    expect(groupHeaders.map((node) => node.textContent?.trim())).toEqual(expectedGroups.map((group) => group.translatedLabel));

    const links = within(root).getAllByRole('link');
    expect(links, 'AppSidebar must render exactly the 15 desktop sidebar items from APP_NAV_GROUPS').toHaveLength(15);
    expect(links.map((link) => link.textContent?.trim())).toEqual(expectedItems.map((item) => item.translatedLabel));

    for (const item of expectedItems) {
      const node = screen.getByTestId(`app-sidebar-item-${item.key}`);
      expect(node, `${item.key} must expose data-testid=app-sidebar-item-${item.key}`).toBeInTheDocument();
      expect(node, `${item.key} must be rendered by the next/link mock as an anchor`).toHaveAttribute('data-next-link', 'true');
    }
    expect(screen.queryByTestId('app-sidebar-item-scanner'), 'Scanner belongs to the device shell and must not render here').not.toBeInTheDocument();
  });

  it('resolves every item link to the active locale-prefixed route', async () => {
    await renderSidebar('/en/dashboard');

    for (const item of expectedItems) {
      const link = screen.getByTestId(`app-sidebar-item-${item.key}`);
      expect(link, `${item.key} href must be locale-prefixed`).toHaveAttribute('href', item.localizedHref);
    }
  });
});

describe('UI-129 AppSidebar active state', () => {
  it('uses pathnameOverride/usePathname so only Settings is aria-current=page for /en/settings/users', async () => {
    await renderSidebar('/en/settings/users');

    const activeLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(activeLinks, 'exactly one sidebar item should be active').toHaveLength(1);
    expect(activeLinks[0]).toHaveAttribute('data-testid', 'app-sidebar-item-settings');
    expect(activeLinks[0]).toHaveTextContent(translatedKey(undefined, 'Navigation.app.items.settings'));

    for (const link of screen.getAllByRole('link')) {
      if (link !== activeLinks[0]) {
        expect(link, `${link.getAttribute('data-testid')} must not be marked current`).not.toHaveAttribute('aria-current');
      }
    }
  });
});

describe('UI-129 AppSidebar shell tokens and accessibility', () => {
  it('uses UI-127 shell width/colour utilities on the root and active item', async () => {
    await renderSidebar('/en/settings/users');

    const root = screen.getByTestId('app-sidebar');
    expect(root.className, 'root width must come from var(--shell-sidebar-w) through w-sidebar').toContain('w-sidebar');
    expect(root.className, 'root background must use the shell background token utility').toContain('bg-shell-bg');
    expect(root.className, 'root foreground/border must use shell token utilities').toEqual(expect.stringContaining('text-shell-fg'));
    expect(root.className).toEqual(expect.stringContaining('border-shell-border'));

    const active = screen.getByTestId('app-sidebar-item-settings');
    expect(active.className, 'active item must use the shell active background token utility').toContain('bg-shell-active');
    expect(active.className, 'active item must use the shell active foreground token utility').toContain('text-shell-active-fg');
  });

  it('has zero axe-core violations for the sidebar fixture', async () => {
    const { container } = await renderSidebar('/en/settings/users');
    const axe = await loadAxeCore();
    const results = await axe.default.run(container);
    expect(results.violations, results.violations.map((violation) => violation.id).join(', ')).toEqual([]);
  });
});
