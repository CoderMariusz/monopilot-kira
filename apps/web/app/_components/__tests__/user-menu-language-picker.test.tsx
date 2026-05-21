/**
 * @vitest-environment jsdom
 * T-129 / SET-100 — User Menu Language Picker RED tests.
 *
 * These tests intentionally pin behavior only; the production component may be
 * missing during RED, in which case a placeholder renders so failures are
 * assertion failures instead of module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UserLanguage = 'pl' | 'en' | 'uk' | 'ro';
type LanguageChangeResult =
  | { ok: true; language: 'pl' | 'en'; hotSwitched: true; usersLanguageUpdated: true }
  | { ok: false; error: 'unsupported_locale' | 'permission_denied' | 'persistence_failed'; message: string };

type UserMenuLanguagePickerProps = {
  userId: string;
  orgId: string;
  userLanguage: UserLanguage | null;
  effectiveLanguage: 'pl' | 'en';
  organizationLanguage: 'pl' | 'en';
  supportedLocales: Array<'pl' | 'en'>;
  phase2Locales: Array<'uk' | 'ro'>;
  onSelectLanguage: (locale: UserLanguage) => Promise<LanguageChangeResult>;
  switchNextIntlLocale: (locale: 'pl' | 'en') => void;
};

type UserMenuLanguagePicker = (props: UserMenuLanguagePickerProps) => React.ReactNode;
type UserMenuLanguagePickerModule = {
  default: UserMenuLanguagePicker;
  SET100_LANGUAGE_PICKER_PARITY_CONTRACT?: {
    prototype_path: string;
    prototype_route: string;
    target_route: string;
    viewports: ReadonlyArray<{ name: string; width: number; height: number }>;
    region_selectors: Record<string, string>;
    parity_matrix: ReadonlyArray<{ region: string; structural: string; visual: string; interaction: string }>;
    allowed_deviations: ReadonlyArray<{ region: string; prototype: string; implementation: string; reason: string }>;
  };
};

async function loadLanguagePickerModule(): Promise<UserMenuLanguagePickerModule> {
  try {
    const modulePath = '../user-menu-language-picker';
    const mod = (await import(/* @vite-ignore */ modulePath)) as UserMenuLanguagePickerModule;
    expect(mod.default, 'SET-100 language picker must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod;
  } catch {
    return {
      default: function MissingUserMenuLanguagePicker() {
        return <div role="menu" aria-label="Language" data-testid="missing-set-100-language-picker" />;
      },
    };
  }
}

async function loadLanguagePicker(): Promise<UserMenuLanguagePicker> {
  return (await loadLanguagePickerModule()).default;
}

async function renderLanguagePicker(overrides: Partial<UserMenuLanguagePickerProps> = {}) {
  const Picker = await loadLanguagePicker();
  const props: UserMenuLanguagePickerProps = {
    userId: 'user-current',
    orgId: 'org-apex',
    userLanguage: 'pl',
    effectiveLanguage: 'pl',
    organizationLanguage: 'en',
    supportedLocales: ['pl', 'en'],
    phase2Locales: ['uk', 'ro'],
    onSelectLanguage: vi.fn().mockResolvedValue({
      ok: true,
      language: 'en',
      hotSwitched: true,
      usersLanguageUpdated: true,
    }),
    switchNextIntlLocale: vi.fn(),
    ...overrides,
  };

  return { props, ...render(<Picker {...props} />) };
}

function languageMenu() {
  return screen.getByRole('menu', { name: /language/i });
}

describe('SET-100 user menu language picker parity contract', () => {
  it('declares the prototype/target parity surface and the select-to-radio-menu deviation', async () => {
    const mod = await loadLanguagePickerModule();
    const contract = mod.SET100_LANGUAGE_PICKER_PARITY_CONTRACT;

    expect(contract).toEqual(
      expect.objectContaining({
        prototype_path: 'prototypes/design/Monopilot Design System/settings/account-screens.jsx',
        prototype_route: expect.stringContaining('account-screens.jsx'),
        target_route: expect.stringContaining('user-menu-language-picker.tsx'),
        region_selectors: expect.objectContaining({
          language_menu: '[role="menu"][aria-label="Language"]',
          active_language: '[role="menuitemradio"][aria-checked="true"]',
          disabled_phase_2: '[role="menuitemradio"][aria-disabled="true"]',
        }),
      }),
    );
    expect(contract?.viewports.map((viewport) => viewport.name)).toEqual(['desktop-1280', 'mobile-375']);
    expect(contract?.parity_matrix.map((row) => row.region)).toEqual([
      'language_menu',
      'language_options',
      'active_feedback',
    ]);
    expect(contract?.allowed_deviations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          region: 'language_control',
          prototype: expect.stringContaining('native <select>'),
          implementation: expect.stringContaining('role=menuitemradio'),
        }),
      ]),
    );
  });
});

describe('SET-100 user menu language picker options and active state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows PL/EN as selectable, marks the effective active locale with a checkmark, and renders Phase 2 locales disabled', async () => {
    await renderLanguagePicker({ userLanguage: null, effectiveLanguage: 'en', organizationLanguage: 'en' });

    const menu = languageMenu();
    const english = within(menu).getByRole('menuitemradio', { name: /english/i });
    const polish = within(menu).getByRole('menuitemradio', { name: /polski/i });
    const ukrainian = within(menu).getByRole('menuitemradio', { name: /українська|ukrainian/i });
    const romanian = within(menu).getByRole('menuitemradio', { name: /română|romanian/i });

    expect(english).toHaveAttribute('aria-checked', 'true');
    expect(english).toHaveTextContent('✓');
    expect(polish).toHaveAttribute('aria-disabled', 'false');
    expect(ukrainian).toHaveAttribute('aria-disabled', 'true');
    expect(ukrainian).toHaveTextContent(/phase 2|unavailable/i);
    expect(romanian).toHaveAttribute('aria-disabled', 'true');
    expect(romanian).toHaveTextContent(/phase 2|unavailable/i);
  });

  it('persists a supported PL/EN user override with current user/org context and hot-switches next-intl without a full page reload', async () => {
    const user = userEvent.setup();
    const onSelectLanguage = vi.fn().mockResolvedValue({
      ok: true,
      language: 'en',
      hotSwitched: true,
      usersLanguageUpdated: true,
    });
    const switchNextIntlLocale = vi.fn();
    const startingHref = window.location.href;

    await renderLanguagePicker({ onSelectLanguage, switchNextIntlLocale });
    await user.click(within(languageMenu()).getByRole('menuitemradio', { name: /english/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/language updated|next-intl/i);

    expect(onSelectLanguage).toHaveBeenCalledTimes(1);
    expect(onSelectLanguage).toHaveBeenCalledWith({
      userId: 'user-current',
      orgId: 'org-apex',
      locale: 'en',
    });
    expect(switchNextIntlLocale).toHaveBeenCalledWith('en');
    expect(window.location.href).toBe(startingHref);
  });

  it('surfaces a typed persistence/permission error for PL/EN and does not hot-switch on failure', async () => {
    const user = userEvent.setup();
    const onSelectLanguage = vi.fn().mockResolvedValue({
      ok: false,
      error: 'permission_denied',
      message: 'Permission denied while updating users.language.',
    });
    const switchNextIntlLocale = vi.fn();

    await renderLanguagePicker({ onSelectLanguage, switchNextIntlLocale });
    await user.click(within(languageMenu()).getByRole('menuitemradio', { name: /english/i }));

    expect(onSelectLanguage).toHaveBeenCalledWith('en');
    expect(switchNextIntlLocale).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission_denied|permission denied|users\.language/i);
  });
});
