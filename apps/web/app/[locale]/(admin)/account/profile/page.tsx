import React from 'react';

import MyProfileClient from '../../../../(admin)/account/profile/page';

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
  user?: MyProfileUser;
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

const blockedPreferences: UserPreferences = {
  language: 'en',
  timezone: 'Europe/Warsaw',
};

const blockedSessions: UserSession[] = [];

async function saveProfileAction(_input: SaveProfileInput) {
  'use server';
  return { ok: false, error: 'PROFILE_ACTION_NOT_CONFIGURED' };
}

async function updatePasswordAction(_input: { currentPassword: string; newPassword: string; confirmNew: string }) {
  'use server';
  return { ok: false, error: 'PASSWORD_ACTION_NOT_CONFIGURED' };
}

async function updateLanguagePreferenceAction(_input: { userId: string; language: UserPreferences['language'] }) {
  'use server';
  return { ok: false, userPreferencesRowUpdated: false, error: 'LANGUAGE_ACTION_NOT_CONFIGURED' };
}

async function revokeSessionAction(_input: { sessionId: string }) {
  'use server';
  return { ok: false, deletedSessionId: undefined, invalidatedSessionToken: false, error: 'REVOKE_SESSION_NOT_CONFIGURED' };
}

async function logoutEverywhereAction() {
  'use server';
  return { ok: false, error: 'LOGOUT_EVERYWHERE_NOT_CONFIGURED' };
}

export default async function MyProfilePage(props: MyProfilePageProps = {}) {
  if (!props.user) {
    const state = props.state ?? 'permission-denied';
    const message = state === 'loading'
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

  return (
    <MyProfileClient
      user={props.user}
      preferences={props.preferences ?? blockedPreferences}
      sessions={props.sessions ?? blockedSessions}
      mfa={props.mfa ?? { enabled: false, deviceLabel: 'Authenticator app', addedAt: '' }}
      canEditProfile={props.canEditProfile ?? false}
      state={props.state ?? 'ready'}
      saveProfile={props.saveProfile ?? saveProfileAction}
      updatePassword={props.updatePassword ?? updatePasswordAction}
      updateLanguagePreference={props.updateLanguagePreference ?? updateLanguagePreferenceAction}
      revokeSession={props.revokeSession ?? revokeSessionAction}
      logoutEverywhere={props.logoutEverywhere ?? logoutEverywhereAction}
    />
  );
}
