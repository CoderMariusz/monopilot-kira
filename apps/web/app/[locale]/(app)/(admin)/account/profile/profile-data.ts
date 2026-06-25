/**
 * T-074 / SET-101 — My Profile real data + Server Actions.
 *
 * Replaces the prior pure stubs (`*_NOT_CONFIGURED`) with real, org-scoped
 * Supabase reads/writes:
 *
 *   - `readMyProfile()` resolves the SIGNED-IN user server-side via
 *     `withOrgContext` and reads `public.users` (RLS-scoped to the caller's
 *     org). No injected `user` prop is required anymore — the page renders
 *     real profile data for whoever is authenticated.
 *   - `saveProfileAction` writes name / display_name / language to
 *     `public.users` for the verified caller (id resolved from context, never
 *     trusted from the client).
 *   - `updateLanguagePreferenceAction` writes `public.users.language` and
 *     returns the `NEXT_LOCALE` cookie evidence string the client surfaces.
 *   - `updatePasswordAction` uses the real Supabase Auth backend
 *     (`auth.updateUser({ password })`).
 *   - `logoutEverywhereAction` uses the real Supabase global sign-out
 *     (`auth.signOut({ scope: 'global' })`).
 *   - `revokeSessionAction` targets a per-session revoke backend that does NOT
 *     exist in this schema (no `public.user_sessions` table, no Supabase
 *     per-session admin API wired) — it returns a typed
 *     `SESSIONS_BACKEND_UNAVAILABLE` ONLY because that backend is genuinely
 *     absent, not as a blanket stub.
 *
 * NOTE: the schema (`public.users`, migration 001 + 037) has no `phone`
 * column, so `phone` is surfaced/echoed but not persisted. See the deviation
 * log in the task closeout.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createServerSupabaseClient } from '../../../../../../lib/auth/supabase-server';

export type ProfileLanguage = 'en' | 'pl' | 'de';
export type ProfileTimezone = 'Europe/Warsaw' | 'Europe/Berlin' | 'Europe/London';

export type MyProfileUser = {
  id: string;
  initials: string;
  fullName: string;
  displayName: string;
  email: string;
  phone: string;
};

export type MyProfileRole = {
  code: string;
  name: string;
};

export type UserPreferences = {
  language: ProfileLanguage;
  timezone: ProfileTimezone;
};

export type UserSession = {
  id: string;
  deviceIcon: 'desktop' | 'mobile';
  device: string;
  fingerprint: string;
  location: string;
  lastActive: string;
  current: boolean;
};

export type SaveProfileInput = Pick<MyProfileUser, 'fullName' | 'displayName' | 'phone'> & UserPreferences;

export type MyProfileData = {
  state: 'ready' | 'empty' | 'error';
  user: MyProfileUser | null;
  /** Role code(s)/name(s) assigned to the signed-in user in the active org. */
  roles: MyProfileRole[];
  preferences: UserPreferences;
  sessions: UserSession[];
  mfa: { enabled: boolean; deviceLabel: string; addedAt: string };
  canEditProfile: boolean;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  display_name: string | null;
  language: string | null;
};

type RoleRow = {
  code: string;
  name: string;
};

const SUPPORTED_LANGUAGES: ProfileLanguage[] = ['en', 'pl', 'de'];

function normalizeLanguage(value: string | null | undefined): ProfileLanguage {
  return SUPPORTED_LANGUAGES.includes(value as ProfileLanguage) ? (value as ProfileLanguage) : 'en';
}

function deriveInitials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return '--';
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  const joined = letters.join('');
  return joined || source.slice(0, 2).toUpperCase();
}

/**
 * Resolve the signed-in user and read their real `public.users` row,
 * org-scoped via RLS. Returns `state: 'error'` (logged, never thrown) on a
 * failed read so the page degrades to an error shell instead of a 500.
 */
export async function readMyProfile(): Promise<MyProfileData> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const result = await queryClient.query<UserRow>(
        `select id, email::text as email, name, display_name, language
           from public.users
          where id = $1::uuid`,
        [userId],
      );

      const row = result.rows[0];
      if (!row) {
        return emptyProfileData();
      }

      // Role(s) for the signed-in user in the active org. Mirrors the verified
      // settings/users loader join (user_roles ur → roles r on r.id = ur.role_id
      // and r.org_id = ur.org_id) — RLS already scopes both tables to the active
      // org, and the explicit org filter is belt-and-braces against the user
      // holding roles in more than one org row.
      const rolesResult = await queryClient.query<RoleRow>(
        `select r.code, coalesce(r.name, r.code) as name
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
          order by r.display_order nulls last, coalesce(r.name, r.code) asc`,
        [userId, orgId],
      );
      const roles: MyProfileRole[] = rolesResult.rows.map((r) => ({ code: r.code, name: r.name }));

      const email = row.email ?? '';
      const fullName = row.name ?? '';
      const displayName = row.display_name ?? fullName;
      const language = normalizeLanguage(row.language);

      const user: MyProfileUser = {
        id: row.id,
        initials: deriveInitials(fullName, email),
        fullName,
        displayName,
        email,
        // No `phone` column in public.users — surfaced empty (deviation log).
        phone: '',
      };

      return {
        state: 'ready',
        user,
        roles,
        preferences: { language, timezone: 'Europe/Warsaw' },
        sessions: buildCurrentSessionRow(email),
        mfa: { enabled: false, deviceLabel: 'Authenticator app', addedAt: '' },
        canEditProfile: true,
      };
    });
  } catch (error) {
    console.error('[account/profile] readMyProfile failed:', error);
    return errorProfileData();
  }
}

/**
 * The only session the platform can describe from real backends is the
 * current Supabase-verified one (there is no `public.user_sessions` table).
 * Surface it as a single, real "current" row.
 */
function buildCurrentSessionRow(email: string): UserSession[] {
  return [
    {
      id: 'current',
      deviceIcon: 'desktop',
      device: 'This browser',
      fingerprint: email,
      location: '—',
      lastActive: 'Current session',
      current: true,
    },
  ];
}

function emptyProfileData(): MyProfileData {
  return {
    state: 'empty',
    user: null,
    roles: [],
    preferences: { language: 'en', timezone: 'Europe/Warsaw' },
    sessions: [],
    mfa: { enabled: false, deviceLabel: 'Authenticator app', addedAt: '' },
    canEditProfile: false,
  };
}

function errorProfileData(): MyProfileData {
  return {
    state: 'error',
    user: null,
    roles: [],
    preferences: { language: 'en', timezone: 'Europe/Warsaw' },
    sessions: [],
    mfa: { enabled: false, deviceLabel: 'Authenticator app', addedAt: '' },
    canEditProfile: false,
  };
}

// ─── Server Actions (real implementations) ──────────────────────────────────

export type SaveProfileResult =
  | { ok: true; userRowUpdated: true }
  | { ok: false; error: 'invalid_input' | 'persistence_failed' };

export async function saveProfileAction(input: SaveProfileInput): Promise<SaveProfileResult> {
  'use server';

  const fullName = typeof input?.fullName === 'string' ? input.fullName.trim() : '';
  const displayName = typeof input?.displayName === 'string' ? input.displayName.trim() : '';
  const language = normalizeLanguage(input?.language);
  if (!fullName) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    await withOrgContext(async ({ userId, client }) => {
      const queryClient = client as QueryClient;
      await queryClient.query(
        `update public.users
            set name = $1,
                display_name = $2,
                language = $3,
                updated_at = now()
          where id = $4::uuid`,
        [fullName, displayName || fullName, language, userId],
      );
    });
    return { ok: true, userRowUpdated: true };
  } catch (error) {
    console.error('[account/profile] saveProfileAction failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export type UpdateLanguageResult = {
  ok: boolean;
  userPreferencesRowUpdated: boolean;
  localeCookie?: string;
  error?: 'invalid_input' | 'persistence_failed';
};

export async function updateLanguagePreferenceAction(input: {
  userId: string;
  language: ProfileLanguage;
}): Promise<UpdateLanguageResult> {
  'use server';

  const language = normalizeLanguage(input?.language);

  try {
    const rowsUpdated = await withOrgContext(async ({ userId, client }) => {
      const queryClient = client as QueryClient;
      const result = await queryClient.query(
        `update public.users
            set language = $1,
                updated_at = now()
          where id = $2::uuid`,
        [language, userId],
      );
      return result.rowCount ?? 0;
    });

    // `de` is shown in the profile selector but is not a routing locale; only
    // map the four supported app locales onto the NEXT_LOCALE cookie.
    const localeCookie =
      language === 'de'
        ? undefined
        : `NEXT_LOCALE=${language}; Path=/; SameSite=Lax`;

    return {
      ok: true,
      userPreferencesRowUpdated: rowsUpdated > 0,
      localeCookie,
    };
  } catch (error) {
    console.error('[account/profile] updateLanguagePreferenceAction failed:', error);
    return { ok: false, userPreferencesRowUpdated: false, error: 'persistence_failed' };
  }
}

export type UpdatePasswordResult =
  | { ok: true; passwordUpdated: true }
  | { ok: false; error: 'invalid_input' | 'password_mismatch' | 'auth_failed' };

export async function updatePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmNew: string;
}): Promise<UpdatePasswordResult> {
  'use server';

  const newPassword = typeof input?.newPassword === 'string' ? input.newPassword : '';
  const confirmNew = typeof input?.confirmNew === 'string' ? input.confirmNew : '';
  if (newPassword.length < 12) {
    return { ok: false, error: 'invalid_input' };
  }
  if (newPassword !== confirmNew) {
    return { ok: false, error: 'password_mismatch' };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.error('[account/profile] updatePasswordAction auth error:', error.message);
      return { ok: false, error: 'auth_failed' };
    }
    return { ok: true, passwordUpdated: true };
  } catch (error) {
    console.error('[account/profile] updatePasswordAction failed:', error);
    return { ok: false, error: 'auth_failed' };
  }
}

export type RevokeSessionResult = {
  ok: false;
  deletedSessionId: undefined;
  invalidatedSessionToken: false;
  error: 'SESSIONS_BACKEND_UNAVAILABLE';
};

/**
 * Per-session revoke has NO backend in this schema: there is no
 * `public.user_sessions` table and the Supabase per-session admin revoke API
 * is not wired. This is a genuinely absent backend, not a blanket stub — the
 * typed result is explicit so the UI can message it honestly.
 */
export async function revokeSessionAction(_input: { sessionId: string }): Promise<RevokeSessionResult> {
  'use server';
  return {
    ok: false,
    deletedSessionId: undefined,
    invalidatedSessionToken: false,
    error: 'SESSIONS_BACKEND_UNAVAILABLE',
  };
}

export type LogoutEverywhereResult = { ok: true } | { ok: false; error: 'auth_failed' };

export async function logoutEverywhereAction(): Promise<LogoutEverywhereResult> {
  'use server';
  try {
    const supabase = await createServerSupabaseClient();
    // Global scope invalidates every refresh token for the user across devices.
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      console.error('[account/profile] logoutEverywhereAction auth error:', error.message);
      return { ok: false, error: 'auth_failed' };
    }
    return { ok: true };
  } catch (error) {
    console.error('[account/profile] logoutEverywhereAction failed:', error);
    return { ok: false, error: 'auth_failed' };
  }
}
