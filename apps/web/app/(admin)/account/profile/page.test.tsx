/**
 * @vitest-environment jsdom
 * T-074 / SET-101 — My Profile screen
 *
 * RED phase: these RTL tests specify my_profile_screen production behavior from
 * prototypes/design/Monopilot Design System/settings/account-screens.jsx:3-75.
 * Missing production page modules render an empty placeholder so RED reports
 * behavior assertion failures instead of module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../../packages/ui/test/assertModalA11y';

type MyProfileUser = {
  id: string;
  initials: string;
  fullName: string;
  displayName: string;
  email: string;
  phone: string;
};

type UserPreferences = {
  language: 'en' | 'pl' | 'de';
  timezone: 'Europe/Warsaw' | 'Europe/Berlin' | 'Europe/London';
};

type UserSession = {
  id: string;
  deviceIcon: 'desktop' | 'mobile';
  device: string;
  fingerprint: string;
  location: string;
  lastActive: string;
  current: boolean;
};

type SaveProfileInput = Pick<MyProfileUser, 'fullName' | 'displayName' | 'phone'> & UserPreferences;

type MyProfilePageProps = {
  user: MyProfileUser;
  preferences: UserPreferences;
  sessions: UserSession[];
  mfa: { enabled: boolean; deviceLabel: string; addedAt: string };
  canEditProfile: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  saveProfile: ReturnType<typeof vi.fn>;
  updatePassword: ReturnType<typeof vi.fn>;
  updateLanguagePreference: ReturnType<typeof vi.fn>;
  revokeSession: ReturnType<typeof vi.fn>;
  logoutEverywhere: ReturnType<typeof vi.fn>;
};

type MyProfilePage = (props: MyProfilePageProps) => React.ReactNode | Promise<React.ReactNode>;

const profileUser: MyProfileUser = {
  id: 'user-k-nowak',
  initials: 'KN',
  fullName: 'Krzysztof Nowak',
  displayName: 'K. Nowak',
  email: 'k.nowak@apex.pl',
  phone: '+48 600 123 456',
};

const preferences: UserPreferences = {
  language: 'pl',
  timezone: 'Europe/Warsaw',
};

const sessions: UserSession[] = [
  {
    id: 'session-current',
    deviceIcon: 'desktop',
    device: 'Chrome on macOS',
    fingerprint: '192.168.1.42',
    location: 'Kraków, PL',
    lastActive: 'Current session',
    current: true,
  },
  {
    id: 'session-scanner',
    deviceIcon: 'mobile',
    device: 'Monopilot Scanner',
    fingerprint: 'Zebra TC22 · DEV-001',
    location: 'Kraków HQ · Line 1',
    lastActive: '2 hours ago',
    current: false,
  },
];

async function loadMyProfilePage(): Promise<MyProfilePage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-101 my profile page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as MyProfilePage;
  } catch {
    return function MissingMyProfilePage() {
      return React.createElement('main', { 'data-testid': 'missing-my-profile-page' });
    };
  }
}

async function renderMyProfile(overrides: Partial<MyProfilePageProps> = {}) {
  const Page = await loadMyProfilePage();
  const props: MyProfilePageProps = {
    user: profileUser,
    preferences,
    sessions,
    mfa: { enabled: true, deviceLabel: 'Google Authenticator on iPhone', addedAt: '2025-07-14', enrollmentAvailable: true },
    beginMfaReconfigure: vi.fn().mockResolvedValue({
      ok: true,
      secret: 'BASE32SECRET',
      provisioningUri: 'otpauth://totp/Monopilot:test?secret=BASE32SECRET',
    }),
    confirmMfaReconfigure: vi.fn().mockResolvedValue({ ok: true, backupCodes: ['code-1', 'code-2'] }),
    regenerateBackupCodes: vi.fn().mockResolvedValue({ ok: true, backupCodes: ['fresh-1', 'fresh-2'] }),
    mfaLabels: {
      reconfigureTitle: 'Reconfigure authenticator',
      backupCodesTitle: 'Backup codes',
      enrollInstructions: 'Add this secret to your authenticator app, then enter the six-digit code to confirm.',
      backupCodesInstructions: 'Backup codes are shown once. Store them in a secure password manager.',
      backupCodesRotateWarning: 'Generating new codes invalidates any previous backup codes.',
      secretLabel: 'Authenticator secret',
      verificationCodeLabel: 'Verification code',
      backupCodesListLabel: 'Your backup codes',
      confirm: 'Confirm',
      close: 'Close',
      generating: 'Preparing enrollment…',
      verifying: 'Verifying…',
      invalidCode: 'Enter a valid six-digit code.',
      unavailableTitle: 'MFA enrollment unavailable',
      unavailableBody: 'TOTP enrollment is not configured on this deployment (MFA_MASTER_KEY missing).',
      copyCodes: 'Copy codes',
    },
    canEditProfile: true,
    state: 'ready',
    saveProfile: vi.fn().mockResolvedValue({ ok: true, user: profileUser, preferences }),
    updatePassword: vi.fn().mockResolvedValue({ ok: true, passwordUpdated: true }),
    updateLanguagePreference: vi.fn().mockResolvedValue({
      ok: true,
      userPreferencesRowUpdated: true,
      localeCookie: 'NEXT_LOCALE=en; Path=/; SameSite=Lax',
    }),
    revokeSession: vi.fn().mockResolvedValue({
      ok: true,
      deletedSessionId: 'session-scanner',
      invalidatedSessionToken: true,
    }),
    logoutEverywhere: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return { props, ...render(React.createElement(Page as React.ComponentType<MyProfilePageProps>, props)) };
}

function profileSections() {
  // Migrated to the shared settings primitives (plan A2/A5): each section is now
  // a `.sg-section` labelled region whose heading is the `.sg-section-title`
  // element (14px/600 from the ported design-system CSS), not a Tailwind `<h2>`.
  return Array.from(document.querySelectorAll<HTMLElement>('.sg-section[role="region"]')).map(
    (section) => section.querySelector('.sg-section-title')?.textContent ?? null,
  );
}

function profileFieldSummary() {
  return {
    sections: profileSections(),
    controls: [
      screen.getByLabelText(/^Full name$/i),
      screen.getByLabelText(/^Display name$/i),
      screen.getByLabelText(/^Email$/i),
      screen.getByLabelText(/^Phone$/i),
      screen.getByRole('combobox', { name: /^Language$/i }),
      screen.getByRole('combobox', { name: /^Timezone$/i }),
      screen.getByLabelText(/^Current password$/i),
      screen.getByLabelText(/^New password$/i),
      screen.getByLabelText(/^Confirm new$/i),
    ].map((element) => element.getAttribute('aria-label') || element.getAttribute('name') || element.id),
    sessionHeaders: within(screen.getByRole('table', { name: /active sessions/i }))
      .getAllByRole('columnheader')
      .map((header) => header.textContent),
  };
}

async function chooseLanguage(language: 'en' | 'pl' | 'de') {
  const control = screen.getByRole('combobox', { name: /^Language$/i }) as HTMLSelectElement;
  const user = userEvent.setup();

  if (control.tagName.toLowerCase() === 'select') {
    await user.selectOptions(control, language);
    return;
  }

  await user.click(control);
  const optionName = language === 'en' ? /english/i : language === 'pl' ? /polski/i : /deutsch/i;
  await user.click(await screen.findByRole('option', { name: optionName }));
}

describe('SET-101 my_profile_screen prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders prototype sections, fields, primitives, action order, session table, and keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = await renderMyProfile();

    // PageHead renders the page title via `.sg-title` (22px/600 from the ported
    // design-system CSS), not a Tailwind `<h1>` heading element.
    const head = container.querySelector('.sg-head');
    expect(head).not.toBeNull();
    expect(head?.querySelector('.sg-title')?.textContent).toMatch(/^My profile$/i);
    expect(head?.querySelector('.sg-sub')?.textContent).toMatch(/your personal info — only visible to admins and you/i);
    expect(profileSections()).toEqual(['Profile', 'Password', 'Two-factor authentication', 'Active sessions', 'Danger zone']);

    const profile = screen.getByRole('region', { name: /^Profile$/i });
    expect(within(profile).getByText('KN')).toBeInTheDocument();
    expect(within(profile).getByRole('button', { name: /^Upload$/i })).toHaveAttribute('data-slot', 'button');
    expect(within(profile).getByText(/png or jpg · 200×200px/i)).toBeInTheDocument();
    expect(within(profile).getByLabelText(/^Full name$/i)).toHaveValue('Krzysztof Nowak');
    expect(within(profile).getByLabelText(/^Display name$/i)).toHaveValue('K. Nowak');
    expect(within(profile).getByText(/shown in the ui/i)).toBeInTheDocument();
    expect(within(profile).getByLabelText(/^Email$/i)).toHaveAttribute('type', 'email');
    expect(within(profile).getByLabelText(/^Email$/i)).toBeDisabled();
    // Phone has no `public.users.phone` column, so the field is rendered
    // disabled (no silently-dropped input) with an explicit "not yet available"
    // hint — see the deviation note. It still surfaces the value read-only.
    expect(within(profile).getByLabelText(/^Phone$/i)).toHaveValue('+48 600 123 456');
    expect(within(profile).getByLabelText(/^Phone$/i)).toBeDisabled();
    expect(within(profile).getByText(/phone number storage is not yet available/i)).toBeInTheDocument();
    expect(within(profile).getByRole('combobox', { name: /^Language$/i })).toHaveAttribute('data-slot');
    expect(within(profile).getByRole('combobox', { name: /^Timezone$/i })).toHaveAttribute('data-slot');

    const footerButtons = within(profile).getAllByRole('button').map((button) => button.textContent);
    expect(footerButtons.slice(-2)).toEqual(['Cancel', 'Save changes']);
    expect(within(profile).getByRole('button', { name: /^Save changes$/i })).toBeDisabled();

    const password = screen.getByRole('region', { name: /^Password$/i });
    expect(within(password).getByLabelText(/^Current password$/i)).toHaveAttribute('type', 'password');
    expect(within(password).getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(within(password).getByLabelText(/^New password$/i)).toHaveAttribute('placeholder', 'Min. 12 characters');
    expect(within(password).getByLabelText(/^Confirm new$/i)).toHaveAttribute('type', 'password');
    expect(within(password).getByRole('button', { name: /^Update password$/i })).toHaveAttribute('data-slot', 'button');

    const mfa = screen.getByRole('region', { name: /^Two-factor authentication$/i });
    expect(within(mfa).getByText(/enabled/i)).toBeInTheDocument();
    expect(within(mfa).getByText(/google authenticator on iphone\. added 2025-07-14/i)).toBeInTheDocument();
    expect(within(mfa).getByRole('button', { name: /^Reconfigure$/i })).toHaveAttribute('data-modal-id', 'SM-MFA-ENROLL');
    expect(within(mfa).getByRole('button', { name: /^Show codes$/i })).toHaveAttribute('data-modal-id', 'SM-BACKUP-CODES');

    const sessionTable = screen.getByRole('table', { name: /active sessions/i });
    expect(within(sessionTable).getByText('Chrome on macOS')).toBeInTheDocument();
    expect(within(sessionTable).getByText('Current session')).toBeInTheDocument();
    expect(within(sessionTable).getByText('Monopilot Scanner')).toBeInTheDocument();
    // Per-session revoke has no backend (revokeSessionAction returns
    // SESSIONS_BACKEND_UNAVAILABLE), so the control is rendered disabled with a
    // "coming soon" title instead of a clickable action that always fails. The
    // working escape hatch is "Log out everywhere" in the Danger zone below.
    const revokeButton = within(sessionTable).getByRole('button', { name: /^Revoke Monopilot Scanner$/i });
    expect(revokeButton).toHaveAttribute('data-session-id', 'session-scanner');
    expect(revokeButton).toBeDisabled();
    expect(revokeButton).toHaveAttribute('title', expect.stringMatching(/coming soon/i));

    const danger = screen.getByRole('region', { name: /^Danger zone$/i });
    expect(within(danger).getByRole('button', { name: /^Log out everywhere$/i })).toHaveAttribute(
      'data-slot',
      'button',
    );
    expect(container).not.toHaveTextContent(/raw-session-token|supabase-refresh-token|access_token/i);
    // Text/password inputs are now native `<input>`s inside `.sg-field` (capped
    // at 420px by the ported `.sg-field input` CSS), composed via the shared
    // SettingField/SRow primitives — not the `@monopilot/ui/Input`
    // (`data-slot="input"`) wrapper. Dropdowns stay on the shared shadcn Select
    // (`data-slot="select-trigger"`), never a native `<select>`.
    expect(container.querySelectorAll('.sg-field input').length).toBeGreaterThanOrEqual(6);
    expect(container.querySelectorAll('[data-slot="select-trigger"]').length).toBe(2);
    expect(container.querySelectorAll('select')).toHaveLength(0);

    await user.tab();
    expect(screen.getByRole('button', { name: /^Upload$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/^Full name$/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/^Display name$/i)).toHaveFocus();
    // Email and Phone are disabled (no backing column), so focus skips them and
    // lands on the next interactive control — the Language dropdown trigger.
    await user.tab();
    expect(screen.getByRole('combobox', { name: /^Language$/i })).toHaveFocus();

    expect(profileFieldSummary()).toMatchInlineSnapshot(`
      {
        "controls": [
          "Full name",
          "Display name",
          "Email",
          "Phone",
          "Language",
          "Timezone",
          "Current password",
          "New password",
          "Confirm new",
        ],
        "sections": [
          "Profile",
          "Password",
          "Two-factor authentication",
          "Active sessions",
          "Danger zone",
        ],
        "sessionHeaders": [
          "",
          "Device",
          "Location",
          "Last active",
          "",
        ],
      }
    `);
  });

  it('renders loading, empty, error, and permission-denied states without silently skipping invariants', async () => {
    await renderMyProfile({ state: 'loading' });
    expect(screen.getByTestId('my-profile-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();

    cleanup();
    await renderMyProfile({ state: 'empty', user: { ...profileUser, id: '' } });
    expect(screen.getByRole('status')).toHaveTextContent(/no profile data is available/i);

    cleanup();
    await renderMyProfile({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/my profile could not be loaded/i);

    cleanup();
    await renderMyProfile({ state: 'permission-denied', canEditProfile: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i);
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('opens MFA dialogs from the prototype triggers and keeps modal accessibility intact', async () => {
    const user = userEvent.setup();
    await renderMyProfile();

    await user.click(screen.getByRole('button', { name: /^Reconfigure$/i }));
    const reconfigureDialog = await screen.findByRole('dialog', { name: /reconfigure authenticator/i });
    expect(reconfigureDialog).toHaveAttribute('data-modal-id', 'SM-MFA-ENROLL');
    expect(await screen.findByTestId('mfa-enroll-secret')).toHaveTextContent('BASE32SECRET');
    await assertModalA11y(reconfigureDialog);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /reconfigure authenticator/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Show codes$/i }));
    const backupDialog = await screen.findByRole('dialog', { name: /backup codes/i });
    expect(backupDialog).toHaveAttribute('data-modal-id', 'SM-BACKUP-CODES');
    await assertModalA11y(backupDialog);
  });
});

describe('SET-101 profile mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits language 'en' through the preference action and surfaces the next-intl locale cookie evidence", async () => {
    const user = userEvent.setup();
    const updateLanguagePreference = vi.fn().mockResolvedValue({
      ok: true,
      userPreferencesRowUpdated: true,
      localeCookie: 'NEXT_LOCALE=en; Path=/; SameSite=Lax',
    });
    await renderMyProfile({ updateLanguagePreference });

    await chooseLanguage('en');
    await user.click(screen.getByRole('button', { name: /^Save changes$/i }));

    expect(updateLanguagePreference).toHaveBeenCalledTimes(1);
    expect(updateLanguagePreference).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-k-nowak', language: 'en' }),
    );
    expect(await screen.findByText(/user_preferences updated/i)).toBeInTheDocument();
    expect(await screen.findByText(/NEXT_LOCALE=en/i)).toBeInTheDocument();
  });

  it('does not wire the per-session Revoke control to a backend that always fails (disabled, no-op on click)', async () => {
    const user = userEvent.setup();
    // There is no sessions backend: revokeSessionAction returns
    // SESSIONS_BACKEND_UNAVAILABLE. The control must therefore be disabled, not a
    // dead clickable button — clicking it must NOT invoke the action.
    const revokeSession = vi.fn();
    const { container } = await renderMyProfile({ revokeSession });

    const revokeButton = screen.getByRole('button', { name: /^Revoke Monopilot Scanner$/i });
    expect(revokeButton).toBeDisabled();
    expect(revokeButton).toHaveAttribute('title', expect.stringMatching(/log out everywhere/i));

    await user.click(revokeButton);

    // Disabled control = no backend call, no optimistic row removal, no error.
    expect(revokeSession).not.toHaveBeenCalled();
    expect(screen.getByText('Monopilot Scanner')).toBeInTheDocument();
    expect(screen.queryByText(/session could not be revoked/i)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/raw-session-token|refresh-token|access_token/i);
  });
});
