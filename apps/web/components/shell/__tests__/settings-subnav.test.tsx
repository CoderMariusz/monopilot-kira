/**
 * @vitest-environment jsdom
 * UI-132 RED — SettingsSubNav manifest order, active state, RBAC deferral, token width, and a11y contract.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_NAV_GROUPS } from '../../../lib/navigation/settings-nav';

const NAV_I18N_NAMESPACE = 'Navigation.settings';
const RBAC_TODO_ID = 'rbac/02-settings/T-130';
let currentPathname = '/en/settings/users';

function navI18nKey(i18nKey: string) {
  const prefix = `${NAV_I18N_NAMESPACE}.`;
  return i18nKey.startsWith(prefix) ? i18nKey.slice(prefix.length) : i18nKey;
}

function translatedKey(namespace: string | undefined, key: string) {
  return `tx:${namespace ? `${namespace}.${key}` : key}`;
}

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => (key: string) => translatedKey(namespace, key),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string | { pathname?: string }; children: React.ReactNode }) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname ?? '';
    return React.createElement('a', { href: resolvedHref, 'data-next-link': 'true', ...props }, children);
  },
}));

type SettingsSubNavProps = {
  locale?: string;
  pathnameOverride?: string;
};

type SettingsSubNavComponent = React.ComponentType<SettingsSubNavProps>;

const settingsSubnavPath = path.resolve(process.cwd(), 'components/shell/settings-subnav.tsx');
const expectedGroups = SETTINGS_NAV_GROUPS.map((group) => ({
  ...group,
  translatedLabel: translatedKey(NAV_I18N_NAMESPACE, navI18nKey(group.i18n_key)),
  items: group.items.map((item) => ({
    ...item,
    translatedLabel: translatedKey(NAV_I18N_NAMESPACE, navI18nKey(item.i18n_key)),
    localizedHref: `/en${item.route}`,
  })),
}));
const expectedItems = expectedGroups.flatMap((group) => group.items);

async function loadSettingsSubNav(): Promise<SettingsSubNavComponent> {
  expect(
    existsSync(settingsSubnavPath),
    'SettingsSubNav production component must exist at apps/web/components/shell/settings-subnav.tsx',
  ).toBe(true);

  const mod = (await import(/* @vite-ignore */ settingsSubnavPath)) as {
    SettingsSubNav?: SettingsSubNavComponent;
    default?: SettingsSubNavComponent;
  };
  const SettingsSubNav = mod.SettingsSubNav ?? mod.default;
  if (typeof SettingsSubNav !== 'function') {
    throw new TypeError('settings-subnav.tsx must export SettingsSubNav or a default React component');
  }
  return SettingsSubNav;
}

async function renderSettingsSubNav(pathname = '/en/settings/users') {
  currentPathname = pathname;
  const SettingsSubNav = await loadSettingsSubNav();
  return render(<SettingsSubNav locale="en" pathnameOverride={pathname} />);
}

type AccessibilityViolation = { id: string; message: string };

function runSubnavAccessibilityAudit(container: HTMLElement): AccessibilityViolation[] {
  const violations: AccessibilityViolation[] = [];
  const root = container.querySelector('[data-testid="settings-subnav"]');
  const links = Array.from(container.querySelectorAll('[data-testid^="settings-subnav-item-"]'));
  const activeLinks = links.filter((link) => link.getAttribute('aria-current') === 'page');

  if (!(root instanceof HTMLElement)) {
    violations.push({ id: 'settings-subnav-root-missing', message: 'settings subnav root is missing' });
  } else {
    if (root.getAttribute('role') !== 'navigation') {
      violations.push({ id: 'landmark-role', message: 'settings subnav root must be a navigation landmark' });
    }
    if (!root.getAttribute('aria-label')) {
      violations.push({ id: 'landmark-name', message: 'settings subnav navigation landmark must be named' });
    }
  }

  if (activeLinks.length !== 1) {
    violations.push({ id: 'active-current-count', message: 'exactly one settings item must expose aria-current=page' });
  }

  for (const link of links) {
    if (!(link instanceof HTMLAnchorElement)) {
      violations.push({ id: 'link-native-semantics', message: `${link.getAttribute('data-testid')} must render as an anchor` });
      continue;
    }
    if (!link.getAttribute('href')) {
      violations.push({ id: 'link-href', message: `${link.getAttribute('data-testid')} must have an href` });
    }
    if (!link.textContent?.trim()) {
      violations.push({ id: 'link-name', message: `${link.getAttribute('data-testid')} must have accessible text` });
    }
  }

  return violations;
}

afterEach(() => cleanup());

beforeEach(() => {
  currentPathname = '/en/settings/users';
});

describe('UI-132 SettingsSubNav manifest rendering', () => {
  it('is the only client boundary for the settings subnav and renders every SETTINGS_NAV_GROUPS item in order', async () => {
    expect(existsSync(settingsSubnavPath), 'settings-subnav.tsx must exist before source boundary checks run').toBe(true);
    const source = readFileSync(settingsSubnavPath, 'utf8').trimStart();
    expect(source.startsWith('"use client"') || source.startsWith("'use client'"), 'SettingsSubNav must be a Client Component').toBe(true);
    expect(source, 'SettingsSubNav must import the UI-128 manifest rather than duplicate navigation arrays').toContain('SETTINGS_NAV_GROUPS');

    await renderSettingsSubNav('/en/settings/users');

    const root = screen.getByTestId('settings-subnav');
    expect(root).toHaveAttribute('role', 'navigation');

    const links = within(root).getAllByRole('link');
    expect(links, 'SettingsSubNav must render every SETTINGS_NAV_GROUPS item').toHaveLength(expectedItems.length);
    expect(links.map((link) => link.getAttribute('data-testid'))).toEqual(
      expectedItems.map((item) => `settings-subnav-item-${item.key}`),
    );

    for (const item of expectedItems) {
      const link = screen.getByTestId(`settings-subnav-item-${item.key}`);
      expect(link, `${item.key} must be rendered by the next/link mock as an anchor`).toHaveAttribute('data-next-link', 'true');
      expect(link, `${item.key} href must be locale-prefixed`).toHaveAttribute('href', item.localizedHref);
      expect(link.textContent?.trim(), `${item.key} must render a visible label`).not.toBe('');
    }
  });

  it('marks exactly the active settings item with aria-current=page from usePathname', async () => {
    await renderSettingsSubNav('/en/settings/users');

    const activeLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(activeLinks, 'exactly one settings subnav item should be active').toHaveLength(1);
    expect(activeLinks[0]).toHaveAttribute('data-testid', 'settings-subnav-item-users');

    for (const item of expectedItems.filter((item) => item.key !== 'users')) {
      expect(screen.getByTestId(`settings-subnav-item-${item.key}`), `${item.key} must not be current`).not.toHaveAttribute(
        'aria-current',
      );
    }
  });

  it('uses shell subnav width tokens, preserves RBAC deferral metadata, and has zero a11y contract violations', async () => {
    const { container } = await renderSettingsSubNav('/en/settings/users');

    const root = screen.getByTestId('settings-subnav');
    expect(root.className, 'root width must come from var(--shell-subnav-w) through w-subnav').toContain('w-subnav');
    expect(getComputedStyle(root).width, 'root inline width must resolve to --shell-subnav-w').toBe('var(--shell-subnav-w)');

    for (const item of expectedItems) {
      const link = screen.getByTestId(`settings-subnav-item-${item.key}`);
      expect(link, `${item.key} must retain explicit future RBAC deferral marker`).toHaveAttribute('data-todo', RBAC_TODO_ID);
    }

    const violations = runSubnavAccessibilityAudit(container);
    expect(violations, violations.map((violation) => `${violation.id}: ${violation.message}`).join(', ')).toEqual([]);
  });
});
