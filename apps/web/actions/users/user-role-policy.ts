/**
 * Canonical list of role codes that cannot be self-served via invite or
 * create-with-password (G7 contract). Single source of truth — consumed by:
 *   - actions/users/create-user-with-password.ts  (server-side guard)
 *   - actions/users/invite.ts                      (server-side guard)
 *   - settings/users/_components/InviteDialog.tsx  (client-side picker filter)
 *
 * NOT a 'use server' module so it can be imported by client components.
 */
export const SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT = new Set([
  'owner',
  'admin',
  'org_admin',
  'org.access.admin',
  'org.platform.admin',
  'org.schema.admin',
]);
