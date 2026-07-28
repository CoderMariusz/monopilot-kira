/**
 * FALA 6 / R01-07 — the app shell's user identity.
 *
 * The shell used to build the user menu purely from Supabase `user_metadata`
 * (`name` → `full_name` → email), so a Display name saved on /account/profile
 * (which writes `public.users.name` + `public.users.display_name`) never
 * reached the chrome — the menu kept showing the stale metadata value.
 *
 * The persisted row is now the source of truth and `user_metadata` is the
 * fallback. Two constraints shape this module:
 *
 *  - The (app) layout renders on EVERY page, so this must be ONE query by
 *    primary key. It is memoised with React `cache()` and the layout fires it
 *    inside the existing `Promise.all`, so it adds no serial round-trip and no
 *    per-row lookups.
 *  - A missing/unreadable row must never break the shell: every failure path
 *    returns `null` and the caller degrades to metadata, then to the email.
 */
import { cache } from 'react';

import { withOrgContext } from '../auth/with-org-context';

export type ShellIdentityRow = { display_name: string | null; name: string | null };

export type ShellUser = {
  id: string;
  email: string;
  name: string;
  initials: string;
};

type ShellUserMetadata = { name?: unknown; full_name?: unknown };

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

export function initialsFor(name: string, email: string): string {
  const fromName = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return fromName || email[0]?.toUpperCase() || 'U';
}

/**
 * Resolve the name shown in the shell.
 *
 * Precedence — persisted first, metadata second:
 *   users.display_name → users.name → metadata.name → metadata.full_name → email
 *
 * `display_name` wins over `name` to match /account/profile, which renders the
 * same precedence (profile-data.ts: `row.display_name ?? fullName`). Blank
 * strings are skipped, not preferred, so a row with `display_name = ''` falls
 * through instead of rendering an empty user menu.
 */
export function resolveShellUser(
  user: { id?: string; email?: string | null; user_metadata?: ShellUserMetadata | null },
  row: ShellIdentityRow | null,
): ShellUser {
  const metadata = user.user_metadata ?? {};
  const email = firstNonEmpty(user.email) ?? 'user@monopilot.local';
  const name =
    firstNonEmpty(row?.display_name, row?.name, metadata.name, metadata.full_name) ?? email;

  return {
    id: firstNonEmpty(user.id) ?? 'current-user',
    email,
    name,
    initials: initialsFor(name, email),
  };
}

/**
 * One indexed read of the caller's own `public.users` row.
 *
 * Never throws: a user without a row yet (mid-invite, SAML JIT before the
 * profile lands) or a transient DB failure resolves to `null` and the shell
 * falls back to `user_metadata`.
 */
export const loadShellIdentity = cache(async function loadShellIdentity(): Promise<ShellIdentityRow | null> {
  try {
    return await withOrgContext(async ({ client, userId }) => {
      const { rows } = await client.query<{ display_name: string | null; name: string | null }>(
        `select display_name, name
           from public.users
          where id = $1::uuid
          limit 1`,
        [userId],
      );
      return rows[0] ?? null;
    });
  } catch (error) {
    console.error(
      '[shell] display-name lookup failed; falling back to auth metadata:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
});
