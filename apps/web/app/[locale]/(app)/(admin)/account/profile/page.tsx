import React from 'react';
import { getTranslations } from 'next-intl/server';

import MyProfileClient from '../../../../../(admin)/account/profile/page';
import {
  logoutEverywhereAction,
  readMyProfile,
  revokeSessionAction,
  saveProfileAction,
  updateLanguagePreferenceAction,
  updatePasswordAction,
  type MyProfileData,
  type MyProfileRole,
  type MyProfileUser,
  type SaveProfileInput,
  type UserPreferences,
  type UserSession,
} from './profile-data';

export const dynamic = 'force-dynamic';

type MyProfilePageProps = {
  params?: Promise<{ locale: string }> | { locale: string };
  // Test seam only: production resolves the signed-in user in this Server
  // Component via readMyProfile(). These typed overrides keep RTL parity tests
  // focused without reintroducing an unsafe unknown prop bag.
  user?: MyProfileUser;
  roles?: MyProfileRole[];
  preferences?: UserPreferences;
  sessions?: UserSession[];
  mfa?: { enabled: boolean; deviceLabel: string; addedAt: string };
  canEditProfile?: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  saveProfile?: (input: SaveProfileInput) => Promise<unknown> | unknown;
  updatePassword?: (input: { currentPassword: string; newPassword: string; confirmNew: string }) => Promise<unknown> | unknown;
  updateLanguagePreference?: (input: { userId: string; language: UserPreferences['language'] }) => Promise<{
    ok?: boolean;
    userPreferencesRowUpdated?: boolean;
    localeCookie?: string;
    error?: string;
  }> | { ok?: boolean; userPreferencesRowUpdated?: boolean; localeCookie?: string; error?: string };
  revokeSession?: (input: { sessionId: string }) => Promise<{
    ok?: boolean;
    deletedSessionId?: string;
    invalidatedSessionToken?: boolean;
    error?: string;
  }> | { ok?: boolean; deletedSessionId?: string; invalidatedSessionToken?: boolean; error?: string };
  logoutEverywhere?: () => Promise<unknown> | unknown;
};

function nonInteractiveShell(state: 'loading' | 'empty' | 'error' | 'permission-denied') {
  const message =
    state === 'loading'
      ? 'Loading my profile…'
      : state === 'empty'
        ? 'No profile data is available for the current user.'
        : state === 'error'
          ? 'My profile could not be loaded.'
          : 'Permission denied. Sign in to edit this profile.';
  const role = state === 'loading' || state === 'empty' ? 'status' : 'alert';

  return (
    <main aria-labelledby="my-profile-heading" className="grid gap-4 p-6">
      <h1 id="my-profile-heading">My profile</h1>
      <p role={role}>{message}</p>
    </main>
  );
}

export default async function MyProfilePage(props: MyProfilePageProps = {}) {
  // Localized "Role" row label (real i18n key, PL+EN; ro/uk mirror EN). Resolved
  // server-side so the prototype-faithful client component stays string-prop
  // driven rather than being refactored into a next-intl consumer.
  const t = await getTranslations('account.profile');
  const roleLabel = t('roleLabel');

  // Test seam: when a `user` is injected we render exactly that (parity tests),
  // delegating ALL state handling (loading/empty/error/permission-denied) to
  // the client which owns the prototype-faithful per-state shells.
  // Production resolves the signed-in user from real Supabase + public.users.
  if (props.user) {
    return (
      <MyProfileClient
        user={props.user}
        roles={props.roles ?? []}
        roleLabel={roleLabel}
        preferences={props.preferences ?? { language: 'en', timezone: 'Europe/Warsaw' }}
        sessions={props.sessions ?? []}
        mfa={props.mfa ?? { enabled: false, deviceLabel: 'Authenticator app', addedAt: '' }}
        canEditProfile={props.canEditProfile ?? true}
        state={props.state ?? 'ready'}
        saveProfile={props.saveProfile ?? saveProfileAction}
        updatePassword={props.updatePassword ?? updatePasswordAction}
        updateLanguagePreference={props.updateLanguagePreference ?? updateLanguagePreferenceAction}
        revokeSession={props.revokeSession ?? revokeSessionAction}
        logoutEverywhere={props.logoutEverywhere ?? logoutEverywhereAction}
      />
    );
  }

  // No injected user, explicit non-ready override (parity tests for the
  // server-resolved shells).
  if (props.state && props.state !== 'ready') {
    return nonInteractiveShell(props.state);
  }

  const data: MyProfileData = await readMyProfile();

  if (data.state !== 'ready' || !data.user) {
    return nonInteractiveShell(data.state === 'ready' ? 'empty' : data.state);
  }

  return (
    <MyProfileClient
      user={data.user}
      roles={data.roles}
      roleLabel={roleLabel}
      preferences={data.preferences}
      sessions={data.sessions}
      mfa={data.mfa}
      canEditProfile={data.canEditProfile}
      state="ready"
      saveProfile={saveProfileAction}
      updatePassword={updatePasswordAction}
      updateLanguagePreference={updateLanguagePreferenceAction}
      revokeSession={revokeSessionAction}
      logoutEverywhere={logoutEverywhereAction}
    />
  );
}
