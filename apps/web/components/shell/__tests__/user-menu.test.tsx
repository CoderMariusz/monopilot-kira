/**
 * @vitest-environment jsdom
 * UI-130 RED — UserMenu Radix-style keyboard menu, existing language picker mount, and sign-out action wiring.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserMenuLanguagePickerProps as ExistingLanguagePickerProps } from '../../../app/_components/user-menu-language-picker';

type UserMenuProps = {
  user: { id: string; email: string; name: string; initials: string };
  orgId: string;
  locale: 'en' | 'pl' | 'uk' | 'ro';
  userLanguage: ExistingLanguagePickerProps['userLanguage'];
  effectiveLanguage: ExistingLanguagePickerProps['effectiveLanguage'];
  organizationLanguage: ExistingLanguagePickerProps['organizationLanguage'];
  onSelectLanguage: ExistingLanguagePickerProps['onSelectLanguage'];
  switchNextIntlLocale: ExistingLanguagePickerProps['switchNextIntlLocale'];
  signOutAction: (formData: FormData) => Promise<never> | never;
};

type UserMenuComponent = React.ComponentType<UserMenuProps>;
type SignOutModule = {
  signOut?: (formData: FormData) => Promise<never>;
  default?: (formData: FormData) => Promise<never>;
};

const userMenuPath = path.resolve(process.cwd(), 'components/shell/user-menu.tsx');
const signOutPath = path.resolve(process.cwd(), 'app/[locale]/(app)/_actions/sign-out.ts');
const pickerCalls: ExistingLanguagePickerProps[] = [];

const topbarMessages: Record<string, string> = {
  openUserMenu: 'Open user menu for {name}',
  signOut: 'Sign out',
};

function translateTopbar(key: string, values?: Record<string, string>) {
  return (topbarMessages[key] ?? key).replace(/\{(\w+)\}/g, (_match, valueKey: string) => values?.[valueKey] ?? '');
}

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  createServerSupabaseClient: vi.fn(),
  supabaseSignOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => translateTopbar,
}));

vi.mock('../../../app/_components/user-menu-language-picker', () => ({
  default: (props: ExistingLanguagePickerProps) => {
    pickerCalls.push(props);
    return (
      <div role="menu" aria-label="Language" data-testid="mock-user-menu-language-picker">
        <button role="menuitemradio" aria-checked="true" type="button">
          English Active
        </button>
        <button role="menuitemradio" aria-checked="false" type="button">
          Polski Select
        </button>
      </div>
    );
  },
}));

async function loadUserMenu(): Promise<UserMenuComponent> {
  expect(
    existsSync(userMenuPath),
    'UserMenu production component must exist at apps/web/components/shell/user-menu.tsx',
  ).toBe(true);

  const mod = (await import(/* @vite-ignore */ userMenuPath)) as { UserMenu?: UserMenuComponent; default?: UserMenuComponent };
  const UserMenu = mod.UserMenu ?? mod.default;
  if (typeof UserMenu !== 'function') {
    expect.fail('user-menu.tsx must export UserMenu or a default React component');
  }
  return UserMenu;
}

async function loadSignOutAction(): Promise<(formData: FormData) => Promise<never>> {
  expect(
    existsSync(signOutPath),
    'sign-out Server Action must exist at apps/web/app/[locale]/(app)/_actions/sign-out.ts',
  ).toBe(true);

  const mod = (await import(signOutPath)) as SignOutModule;
  const signOut = mod.signOut ?? mod.default;
  if (typeof signOut !== 'function') {
    throw new TypeError('sign-out.ts must export signOut(formData) or a default Server Action');
  }
  return signOut;
}

async function renderUserMenu(overrides: Partial<UserMenuProps> = {}) {
  const UserMenu = await loadUserMenu();
  const props: UserMenuProps = {
    user: { id: 'user-current', email: 'katarzyna.nowak@apex.example', name: 'Katarzyna Nowak', initials: 'KN' },
    orgId: 'org-apex',
    locale: 'en',
    userLanguage: 'pl',
    effectiveLanguage: 'en',
    organizationLanguage: 'en',
    onSelectLanguage: vi.fn().mockResolvedValue({ ok: true, language: 'pl', hotSwitched: true, usersLanguageUpdated: true }),
    switchNextIntlLocale: vi.fn(),
    signOutAction: vi.fn(async () => {
      throw new Error('NEXT_REDIRECT:/en/login');
    }),
    ...overrides,
  };

  return { props, ...render(<UserMenu {...props} />) };
}

function formData(entries: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  pickerCalls.length = 0;
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { signOut: mocks.supabaseSignOut.mockResolvedValue({ error: null }) },
  });
});

afterEach(() => cleanup());

describe('UI-130 UserMenu language picker host and keyboard behavior', () => {
  it('opens from the avatar trigger on Enter, focuses the first item, mounts the existing picker props unchanged, and closes on Escape', async () => {
    const user = userEvent.setup();
    const { props } = await renderUserMenu();

    const trigger = screen.getByTestId('app-topbar-user-trigger');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveTextContent(/KN|Katarzyna Nowak/);

    trigger.focus();
    await user.keyboard('{Enter}');

    const languageMenu = await screen.findByRole('menu', { name: 'Language' });
    const firstLanguageItem = within(languageMenu).getAllByRole('menuitemradio')[0];
    await waitFor(() => expect(document.activeElement).toBe(firstLanguageItem));

    expect(screen.getByTestId('mock-user-menu-language-picker')).toBeInTheDocument();
    expect(pickerCalls).toHaveLength(1);
    expect(pickerCalls[0]).toMatchObject({
      userId: props.user.id,
      orgId: props.orgId,
      userLanguage: props.userLanguage,
      effectiveLanguage: props.effectiveLanguage,
      organizationLanguage: props.organizationLanguage,
    });
    expect(pickerCalls[0].onSelectLanguage).toBe(props.onSelectLanguage);
    expect(pickerCalls[0].switchNextIntlLocale).toBe(props.switchNextIntlLocale);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Language' })).not.toBeInTheDocument());
  });

  it('renders sign out as a form submit control that carries the active locale', async () => {
    const user = userEvent.setup();
    await renderUserMenu({ locale: 'pl' });

    screen.getByTestId('app-topbar-user-trigger').focus();
    await user.keyboard('{Space}');

    const signOut = await screen.findByTestId('app-topbar-sign-out');
    expect(signOut).toHaveAttribute('type', 'submit');
    expect(signOut.closest('form')).toHaveAttribute('data-testid', 'app-topbar-sign-out-form');
    expect(within(signOut.closest('form') as HTMLElement).getByDisplayValue('pl')).toHaveAttribute('name', 'locale');
  });
});

describe('UI-130 signOut Server Action', () => {
  it('signs out with the server Supabase client and redirects to /<locale>/login', async () => {
    const signOut = await loadSignOutAction();

    await expect(signOut(formData({ locale: 'pl' }))).rejects.toThrow('NEXT_REDIRECT:/pl/login');

    expect(mocks.createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mocks.supabaseSignOut).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith('/pl/login');
  });
});
