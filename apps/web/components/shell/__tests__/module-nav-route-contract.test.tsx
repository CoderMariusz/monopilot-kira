/**
 * @vitest-environment jsdom
 * UI-138 RED — APP_NAV_GROUPS route roots + module landing contract.
 *
 * RED scope is tests-only. Production pages must be added under
 * apps/web/app/[locale]/(app)/... so every AppSidebar route resolves for /en.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { type Dirent, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_NAV_GROUPS } from '../../../lib/navigation/app-nav';

const NAV_I18N_NAMESPACE = 'Navigation.app';
let currentPathname = '/en/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => (key: string) => `tx:${namespace ? `${namespace}.${key}` : key}`,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string | { pathname?: string }; children: React.ReactNode; prefetch?: boolean }) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname ?? '';
    return React.createElement('a', { href: resolvedHref, 'data-next-link': 'true', ...props }, children);
  },
}));

type AppSidebarProps = { locale: string; pathnameOverride?: string };
type AppSidebarComponent = React.ComponentType<AppSidebarProps>;

type SidebarRoute = {
  key: string;
  moduleId: string | null;
  route: string;
  i18nKey: string;
  expectedHref: string;
};

const appRouteRoot = path.resolve(process.cwd(), 'app/[locale]/(app)');
const appSidebarPath = path.resolve(process.cwd(), 'components/shell/app-sidebar.tsx');
const sidebarRoutes: SidebarRoute[] = APP_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    key: item.key,
    moduleId: item.module_id,
    route: item.route,
    i18nKey: item.i18n_key,
    expectedHref: `/en${item.route}`,
  })),
);

const expectedModuleLandingIds = sidebarRoutes
  .filter((item) => item.moduleId !== null && item.moduleId !== 'settings')
  .map((item) => item.moduleId as string);

function navI18nKey(i18nKey: string) {
  const prefix = `${NAV_I18N_NAMESPACE}.`;
  return i18nKey.startsWith(prefix) ? i18nKey.slice(prefix.length) : i18nKey;
}

function toRoutePath(pagePath: string) {
  const relative = path.relative(appRouteRoot, pagePath);
  const parts = relative.split(path.sep).slice(0, -1).filter((part) => !/^\(.+\)$/.test(part));
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

function collectLocalizedPageRoots(dir = appRouteRoot): Map<string, string> {
  const roots = new Map<string, string>();
  if (!existsSync(dir)) return roots;

  const entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [route, file] of collectLocalizedPageRoots(absolute)) roots.set(route, file);
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      roots.set(toRoutePath(absolute), absolute);
    }
  }

  return roots;
}

const importModule = (specifier: string) => vi.importActual<unknown>(specifier);

async function loadAppSidebar(): Promise<AppSidebarComponent> {
  expect(existsSync(appSidebarPath), 'AppSidebar must exist for the route contract test').toBe(true);
  const mod = await importModule('../app-sidebar');
  const AppSidebar = (mod as { AppSidebar?: AppSidebarComponent; default?: AppSidebarComponent }).AppSidebar ??
    (mod as { default?: AppSidebarComponent }).default;
  expect(typeof AppSidebar, 'app-sidebar module must export AppSidebar or a default component').toBe('function');
  return AppSidebar!;
}

async function renderSidebar(pathnameOverride: string) {
  currentPathname = pathnameOverride;
  const AppSidebar = await loadAppSidebar();
  return render(<AppSidebar locale="en" pathnameOverride={pathnameOverride} />);
}

afterEach(() => cleanup());
beforeEach(() => {
  currentPathname = '/en/dashboard';
});

describe('UI-138 module nav route contract', () => {
  it('maps every APP_NAV_GROUPS item to a localized route root and keeps scanner out of desktop nav', () => {
    expect(sidebarRoutes.map((item) => item.key), 'Scanner is device-shell only and must not be exposed by APP_NAV_GROUPS').not.toContain('scanner');

    const pageRoots = collectLocalizedPageRoots();
    const missingRoutes = sidebarRoutes
      .filter((item) => !pageRoots.has(item.route))
      .map((item) => `${item.key}:${item.route}`);

    expect(
      missingRoutes,
      `Every AppSidebar item must have an apps/web/app/[locale]/(app)/.../page.tsx root; found routes: ${JSON.stringify([...pageRoots.keys()].sort())}`,
    ).toEqual([]);
  });

  it('requires UI-138 landing stubs for sidebar module roots that did not already own a page', () => {
    const pageRoots = collectLocalizedPageRoots();
    const missingLandingIds = expectedModuleLandingIds.filter((moduleId) => {
      const item = sidebarRoutes.find((candidate) => candidate.moduleId === moduleId);
      const pagePath = item ? pageRoots.get(item.route) : undefined;
      return !pagePath || !readFileSync(pagePath, 'utf8').includes(`module-landing-${moduleId}`);
    });

    expect(
      missingLandingIds,
      'Missing module roots must receive minimal translated Server Component landing stubs with data-testid=module-landing-<module_id>; existing Settings page is intentionally not overwritten',
    ).toEqual([]);
  });

  it('renders every AppSidebar link with an /en href and a single active state for its localized route', async () => {
    for (const item of sidebarRoutes) {
      cleanup();
      await renderSidebar(item.expectedHref);

      const activeLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
      const link = screen.getByTestId(`app-sidebar-item-${item.key}`);

      expect(link, `${item.key} must point to the locale-prefixed route`).toHaveAttribute('href', item.expectedHref);
      expect(link, `${item.key} must be active on ${item.expectedHref}`).toHaveAttribute('aria-current', 'page');
      expect(activeLinks, `${item.key} route should mark exactly one sidebar item current`).toHaveLength(1);
      expect(link).toHaveTextContent(`tx:${NAV_I18N_NAMESPACE}.${navI18nKey(item.i18nKey)}`);
    }
  });
});
