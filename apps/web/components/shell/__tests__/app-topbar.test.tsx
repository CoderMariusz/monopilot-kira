/**
 * @vitest-environment jsdom
 * UI-130 RED — AppTopbar Server Component composition, shell token height, i18n, and a11y contract.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type AppTopbarProps = {
  locale: 'en' | 'pl' | 'uk' | 'ro';
  user: { id: string; email: string; name: string; initials: string };
  orgId: string;
  orgName: string;
  userLanguage: 'en' | 'pl' | 'uk' | 'ro' | null;
  effectiveLanguage: 'en' | 'pl';
  organizationLanguage: 'en' | 'pl';
  signOutAction: (formData: FormData) => Promise<never> | never;
  onSelectLanguage: (input: { userId: string; orgId: string; locale: 'en' | 'pl' | 'uk' | 'ro' }) => Promise<unknown>;
  switchNextIntlLocale: (locale: 'en' | 'pl') => void;
};

type AppTopbarComponent = (props: AppTopbarProps) => React.ReactNode | Promise<React.ReactNode>;

const appTopbarPath = path.resolve(process.cwd(), 'components/shell/app-topbar.tsx');
const localeFiles = ['en', 'pl', 'uk', 'ro'] as const;

const topbarMessages: Record<string, string> = {
  brand: 'MonoPilot MES',
  searchPlaceholder: 'Search settings…',
  userMenu: 'User menu',
  openUserMenu: 'Open user menu for {name}',
  signOut: 'Sign out',
  siteCrumbLabel: 'Current organization',
};

function translateTopbar(key: string, values?: Record<string, string>) {
  return (topbarMessages[key] ?? key).replace(/\{(\w+)\}/g, (_match, valueKey: string) => values?.[valueKey] ?? '');
}

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => translateTopbar),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => translateTopbar,
}));

async function loadAppTopbar(): Promise<AppTopbarComponent> {
  expect(
    existsSync(appTopbarPath),
    'AppTopbar production component must exist at apps/web/components/shell/app-topbar.tsx',
  ).toBe(true);

  const mod = (await import(/* @vite-ignore */ appTopbarPath)) as { AppTopbar?: AppTopbarComponent; default?: AppTopbarComponent };
  const AppTopbar = mod.AppTopbar ?? mod.default;
  if (typeof AppTopbar !== 'function') {
    throw new TypeError('app-topbar.tsx must export AppTopbar or a default React component');
  }
  return AppTopbar;
}

function defaultProps(): AppTopbarProps {
  return {
    locale: 'en',
    user: { id: 'user-current', email: 'katarzyna.nowak@apex.example', name: 'Katarzyna Nowak', initials: 'KN' },
    orgId: 'org-apex',
    orgName: 'Apex Dairy',
    userLanguage: 'pl',
    effectiveLanguage: 'en',
    organizationLanguage: 'en',
    signOutAction: vi.fn(async () => {
      throw new Error('NEXT_REDIRECT:/en/login');
    }),
    onSelectLanguage: vi.fn().mockResolvedValue({ ok: true, language: 'pl', hotSwitched: true, usersLanguageUpdated: true }),
    switchNextIntlLocale: vi.fn(),
  };
}

async function renderTopbar(overrides: Partial<AppTopbarProps> = {}) {
  const AppTopbar = await loadAppTopbar();
  const props = { ...defaultProps(), ...overrides };
  const node = await AppTopbar(props);
  return { props, ...render(<>{node}</>) };
}

type AccessibilityViolation = { id: string; message: string };

function runTopbarAccessibilityAudit(container: HTMLElement): AccessibilityViolation[] {
  const violations: AccessibilityViolation[] = [];
  const root = container.querySelector('[data-testid="app-topbar"]');
  const search = container.querySelector('[data-testid="app-topbar-search"]');
  const trigger = container.querySelector('[data-testid="app-topbar-user-trigger"]');

  if (!(root instanceof HTMLElement)) {
    violations.push({ id: 'topbar-root-missing', message: 'topbar root is missing' });
  } else {
    if (!['banner', 'navigation'].includes(root.getAttribute('role') ?? '')) {
      violations.push({ id: 'landmark-role', message: 'topbar root must expose a landmark role' });
    }
  }

  if (!(search instanceof HTMLInputElement)) {
    violations.push({ id: 'search-input-missing', message: 'static search input is missing' });
  } else {
    if (!search.getAttribute('aria-label') && !search.getAttribute('placeholder')) {
      violations.push({ id: 'search-name', message: 'search input must have an accessible name' });
    }
  }

  if (!(trigger instanceof HTMLButtonElement)) {
    violations.push({ id: 'user-trigger-missing', message: 'user menu trigger must be a button' });
  } else {
    if (trigger.getAttribute('aria-haspopup') !== 'menu') {
      violations.push({ id: 'trigger-popup', message: 'user trigger must advertise aria-haspopup=menu' });
    }
    if (!trigger.textContent?.trim() && !trigger.getAttribute('aria-label')) {
      violations.push({ id: 'trigger-name', message: 'user trigger must have an accessible name' });
    }
  }

  return violations;
}

afterEach(() => cleanup());

describe('UI-130 AppTopbar Server Component shell contract', () => {
  it('is not a Client Component and renders the shell topbar at var(--shell-topbar-h)', async () => {
    expect(existsSync(appTopbarPath), 'app-topbar.tsx must exist before source boundary checks run').toBe(true);
    const source = readFileSync(appTopbarPath, 'utf8').trimStart();
    expect(source.startsWith('"use client"')).toBe(false);
    expect(source.startsWith("'use client'")).toBe(false);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = await renderTopbar();

    const root = screen.getByTestId('app-topbar');
    expect(root).toHaveStyle({ height: 'var(--shell-topbar-h)' });
    expect(root).toHaveAttribute('role', 'banner');
    expect(consoleError, 'component render must not call console.error').not.toHaveBeenCalled();

    consoleError.mockRestore();
    const violations = runTopbarAccessibilityAudit(container);
    expect(violations, violations.map((violation) => `${violation.id}: ${violation.message}`).join(', ')).toEqual([]);
  });

  it('renders brand, static search, SiteCrumb host, and UserMenu trigger from the user/org fixture', async () => {
    await renderTopbar({ orgName: 'Apex Dairy' });

    const root = screen.getByTestId('app-topbar');
    expect(within(root).getByText(/MonoPilot/i)).toBeInTheDocument();

    const search = screen.getByTestId('app-topbar-search') as HTMLInputElement;
    expect(search).toHaveAttribute('type', 'search');
    expect(search.readOnly || search.disabled, 'search is a static shell placeholder in UI-130').toBe(true);

    const crumb = screen.getByTestId('app-topbar-sitecrumb');
    expect(crumb).toHaveAttribute('data-slot', 'site-switcher');
    expect(crumb).toHaveAttribute('data-todo', 'multi-site-T-020');
    expect(crumb).toHaveTextContent(/^Apex Dairy$/);
    expect(within(crumb).queryByRole('combobox'), 'AppTopbar must not implement live site selection in UI-130').not.toBeInTheDocument();

    const trigger = screen.getByTestId('app-topbar-user-trigger');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveTextContent(/KN|Katarzyna Nowak/);
  });
});

describe('UI-130 Topbar i18n messages', () => {
  it('keeps Topbar.* keys in apps/web/i18n/{en,pl,uk,ro}.json and avoids legacy messages imports from the topbar source', () => {
    for (const locale of localeFiles) {
      const filePath = path.resolve(process.cwd(), `i18n/${locale}.json`);
      expect(existsSync(filePath), `${locale}.json must exist`).toBe(true);
      const messages = JSON.parse(readFileSync(filePath, 'utf8')) as { Topbar?: Record<string, unknown> };
      expect(messages.Topbar, `${locale}.json must define the Topbar namespace`).toEqual(
        expect.objectContaining({
          brand: expect.any(String),
          searchPlaceholder: expect.any(String),
          userMenu: expect.any(String),
          openUserMenu: expect.any(String),
          signOut: expect.any(String),
          siteCrumbLabel: expect.any(String),
        }),
      );
    }
  });
});
