/**
 * @vitest-environment jsdom
 * UI-129 RED — AppSidebar manifest, active-state, token, link, and a11y contract.
 *
 * RED scope is tests-only. The production component is expected at
 * apps/web/components/shell/app-sidebar.tsx and must consume APP_NAV_GROUPS.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_NAV_GROUPS } from '../../../lib/navigation/app-nav';

const NAV_I18N_NAMESPACE = 'Navigation.app';
let currentPathname = '/en/dashboard';

function translatedKey(namespace: string | undefined, key: string) {
  return `tx:${namespace ? `${namespace}.${key}` : key}`;
}

function navI18nKey(i18nKey: string) {
  const prefix = `${NAV_I18N_NAMESPACE}.`;
  return i18nKey.startsWith(prefix) ? i18nKey.slice(prefix.length) : i18nKey;
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
  locale: string;
  pathnameOverride?: string;
};

type AppSidebarComponent = React.ComponentType<AppSidebarProps>;

const expectedGroups = APP_NAV_GROUPS.map((group) => ({
  ...group,
  translatedLabel: translatedKey(NAV_I18N_NAMESPACE, navI18nKey(group.i18n_key)),
  items: group.items.map((item) => ({
    ...item,
    translatedLabel: translatedKey(NAV_I18N_NAMESPACE, navI18nKey(item.i18n_key)),
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

type AccessibilityViolation = { id: string; message: string };

function runSidebarAccessibilityAudit(container: HTMLElement): AccessibilityViolation[] {
  const violations: AccessibilityViolation[] = [];
  const root = container.querySelector('[data-testid="app-sidebar"]');
  const links = Array.from(container.querySelectorAll('[data-testid^="app-sidebar-item-"]'));

  if (!(root instanceof HTMLElement)) {
    violations.push({ id: 'sidebar-root-missing', message: 'sidebar root is missing' });
  } else {
    if (root.getAttribute('role') !== 'navigation') {
      violations.push({ id: 'landmark-role', message: 'sidebar root must be a navigation landmark' });
    }
    if (root.getAttribute('aria-label') !== 'Primary') {
      violations.push({ id: 'landmark-name', message: 'sidebar navigation landmark must be named' });
    }
  }

  for (const link of links) {
    if (!(link instanceof HTMLAnchorElement)) {
      violations.push({ id: 'link-native-semantics', message: `${link.getAttribute('data-testid')} must render as an anchor` });
      continue;
    }
    if (!link.getAttribute('href')) {
      violations.push({ id: 'link-name', message: `${link.getAttribute('data-testid')} must have an href` });
    }
    if (!link.textContent?.trim()) {
      violations.push({ id: 'link-name', message: `${link.getAttribute('data-testid')} must have accessible text` });
    }
  }

  return violations;
}

afterEach(() => cleanup());

beforeEach(() => {
  currentPathname = '/en/dashboard';
});

describe('UI-129 AppSidebar manifest rendering', () => {
  it('renders five group headers and eighteen manifest items in UI-128 order, with the cross-shell Scanner link included', async () => {
    await renderSidebar('/en/dashboard');

    const root = screen.getByTestId('app-sidebar');
    expect(root, 'root must expose data-testid=app-sidebar').toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBe(root);

    const groupHeaders = Array.from(root.querySelectorAll('[data-slot="group"]'));
    expect(groupHeaders, 'AppSidebar must render exactly the five APP_NAV_GROUPS headers').toHaveLength(5);
    expect(groupHeaders.map((node) => node.textContent?.trim())).toEqual(expectedGroups.map((group) => group.translatedLabel));

    const links = within(root).getAllByRole('link');
    expect(links, 'AppSidebar must render exactly the 18 sidebar items from APP_NAV_GROUPS').toHaveLength(18);
    expect(links.map((link) => link.textContent?.trim())).toEqual(expectedItems.map((item) => item.translatedLabel));

    for (const item of expectedItems) {
      const node = screen.getByTestId(`app-sidebar-item-${item.key}`);
      expect(node, `${item.key} must expose data-testid=app-sidebar-item-${item.key}`).toBeInTheDocument();
      expect(node, `${item.key} must be rendered by the next/link mock as an anchor`).toHaveAttribute('data-next-link', 'true');
      expect(node.querySelector('[data-slot="count"]'), `${item.key} must expose the count slot placeholder`).toBeInTheDocument();
    }
    // Scanner is now a deliberate cross-shell sidebar link to /scanner/home so
    // the device shell is reachable from the desktop app.
    const scannerLink = screen.getByTestId('app-sidebar-item-scanner');
    expect(scannerLink, 'Scanner sidebar link must render').toBeInTheDocument();
    expect(scannerLink, 'Scanner link must target the device shell landing').toHaveAttribute('href', '/en/scanner/home');
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
    expect(activeLinks[0]).toHaveTextContent(translatedKey(NAV_I18N_NAMESPACE, 'items.settings'));

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
    expect(root.className, 'root background must use the dark sidebar surface token utility').toContain('bg-shell-sidebar');
    expect(root.className, 'root foreground/border must use dark sidebar token utilities').toEqual(expect.stringContaining('text-shell-sidebar-fg'));
    expect(root.className).toEqual(expect.stringContaining('border-shell-sidebar-border'));

    const rootWidth = getComputedStyle(root).width;
    expect(rootWidth, 'root inline width must resolve to the shell sidebar token var').toBe('var(--shell-sidebar-w)');

    const active = screen.getByTestId('app-sidebar-item-settings');
    expect(active.className, 'active item must use the shell active background token utility').toContain('bg-shell-active');
    expect(active.className, 'active item must use the shell active foreground token utility').toContain('text-shell-active-fg');
  });

  it('has zero accessibility contract violations for the sidebar fixture', async () => {
    const { container } = await renderSidebar('/en/settings/users');
    const violations = runSidebarAccessibilityAudit(container);
    expect(violations, violations.map((violation) => `${violation.id}: ${violation.message}`).join(', ')).toEqual([]);
  });

  it('keeps RBAC deferral visible in source for every manifest item with rbac_todo metadata', () => {
    expect(expectedItems.every((item) => item.rbac_todo !== null), 'fixture expects current UI-128 items to carry deferred RBAC metadata').toBe(true);
    const source = readFileSync(appSidebarPath, 'utf8');
    expect(source).toContain('item.rbac_todo');
    expect(source).toContain('TODO(rbac/02-settings/T-130)');
  });
});
