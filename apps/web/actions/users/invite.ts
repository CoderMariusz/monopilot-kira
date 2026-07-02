'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { createServerSupabaseClient } from '../../lib/auth/supabase-server';
import { SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT } from './user-role-policy';
import { createSupabaseAuthAdmin } from './supabase-admin';

const INVITE_TTL_SECONDS = 604800;
const INVITE_PERMISSION = 'settings.users.invite';

export type InviteUserInput = {
  email: string;
  name?: string;
  roleId?: string;
  site?: string;
  personalMessage?: string;
  language?: string;
  redirectTo?: string;
};

export type InviteUserResult =
  | { ok: true; data: { email: string; expiresAt: string } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'seat_limit_exceeded'
        | 'invite_failed'
        | 'persistence_failed';
    };

type OrganizationSeatRow = {
  seat_limit: number | null;
};

type RoleRow = {
  id: string;
  org_id: string;
  code: string;
  is_system: boolean;
  display_order: number | null;
};

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const email = normalizeEmail(input?.email);
  if (!email) {
    return { ok: false, error: 'invalid_input' };
  }

  const requestedRoleId = normalizeString(input.roleId);
  if (!requestedRoleId) {
    return { ok: false, error: 'invalid_input' };
  }

  const name = normalizeString(input.name) ?? email;
  const site = normalizeString(input.site);
  const personalMessage = normalizeString(input.personalMessage);
  const language = normalizeString(input.language) ?? 'pl';
  const redirectTo = normalizeRedirectTo(input.redirectTo);
  if (redirectTo === 'invalid') {
    return { ok: false, error: 'invalid_input' };
  }
  const expiresAt = new Date(Date.now() + INVITE_TTL_SECONDS * 1000);

  return withOrgContext(async ({ userId, orgId, client }) => {
    // Fail-closed permission-based RBAC: require an explicit grant of
    // settings.users.invite on one of the caller's roles. Role-code fallbacks
    // are honored only when the role exposes the permission via its slug/code
    // or jsonb permissions array — never via hard-coded role-slug allowlists,
    // which drift from the permission registry.
    const { rows: permRows } = await client.query<{ ok: boolean }>(
      `select true as ok
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
         left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
        where ur.user_id = $1::uuid
          and ur.org_id = $2::uuid
          and (
            rp.permission is not null
            or r.code = $3
            or r.slug = $3
            or coalesce(r.permissions, '[]'::jsonb) ? $3
          )
        limit 1`,
      [userId, orgId, INVITE_PERMISSION],
    );
    if (permRows.length === 0) {
      return { ok: false, error: 'forbidden' };
    }

    const { rows: roleRows } = await client.query<RoleRow>(
      `select id, org_id, code, is_system, display_order
         from public.roles
        where id = $1::uuid`,
      [requestedRoleId],
    );
    const role = roleRows[0];
    if (!role || role.org_id !== orgId) {
      return { ok: false, error: 'invalid_input' };
    }
    if (SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT.has(role.code)) {
      return { ok: false, error: 'invalid_input' };
    }
    const roleId = role.id;

    const { rows: seatRows } = await client.query<OrganizationSeatRow>(
      `select seat_limit from public.organizations where id = $1::uuid`,
      [orgId],
    );
    const seatLimit = seatRows[0]?.seat_limit ?? null;

    const { rows: countRows } = await client.query<{ active_user_count: string | number }>(
      `select count(*) as active_user_count
         from public.users
        where org_id = $1::uuid
          and is_active = true`,
      [orgId],
    );
    const activeUserCount = Number(countRows[0]?.active_user_count ?? 0);
    if (seatLimit !== null && activeUserCount >= seatLimit) {
      return { ok: false, error: 'seat_limit_exceeded' };
    }

    // f4.1: generateLink is an admin API — the session client gets 403 not_admin.
    const supabase = await createSupabaseAuthAdmin();
    const linkResponse = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: {
          org_id: orgId,
          invited_by: userId,
          expires_in: INVITE_TTL_SECONDS,
          site: site ?? undefined,
          personal_message: personalMessage ?? undefined,
        },
        redirectTo: redirectTo ?? undefined,
      },
    });
    if (linkResponse.error) {
      return { ok: false, error: 'invite_failed' };
    }

    const inviteToken =
      linkResponse.data?.properties?.hashed_token ??
      linkResponse.data?.properties?.email_otp ??
      linkResponse.data?.user?.id ??
      null;

    try {
      const invited = await client.query<{ id: string }>(
        `insert into public.users
           (org_id, email, name, role_id, language, is_active, invite_token, invite_token_expires_at, updated_at)
         values ($1::uuid, $2::citext, $3, $4::uuid, $5, false, $6, $7::timestamptz, now())
         on conflict (email) do update set
           name = excluded.name,
           role_id = excluded.role_id,
           language = excluded.language,
           is_active = false,
           invite_token = excluded.invite_token,
           invite_token_expires_at = excluded.invite_token_expires_at,
           updated_at = now()
         where public.users.org_id = excluded.org_id
         returning id`,
        [orgId, email, name, roleId, language, inviteToken, expiresAt.toISOString()],
      );
      if ((invited.rowCount ?? invited.rows.length) < 1) {
        return { ok: false, error: 'invalid_input' };
      }

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'org_security_policies', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'settings.user.invited',
          invited.rows[0]?.id ?? email,
          JSON.stringify({
            org_id: orgId,
            email,
            role_id: roleId,
            invited_by: userId,
            expires_at: expiresAt.toISOString(),
            site,
            personal_message_present: Boolean(personalMessage),
          }),
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, 'user', $3::uuid, $4::jsonb, 'settings-invite-user-v1')`,
        [
          orgId,
          'settings.user.invited',
          userId,
          JSON.stringify({
            org_id: orgId,
            email,
            invited_by: userId,
            expires_at: expiresAt.toISOString(),
            site,
            personal_message_present: Boolean(personalMessage),
          }),
        ],
      );
    } catch {
      return { ok: false, error: 'persistence_failed' };
    }

    return { ok: true, data: { email, expiresAt: expiresAt.toISOString() } };
  });
}

function normalizeRedirectTo(value: unknown): string | null | 'invalid' {
  const redirectTo = normalizeString(value);
  if (!redirectTo) return null;
  const baseUrl = normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (!baseUrl) return 'invalid';
  try {
    const resolved = new URL(redirectTo, baseUrl);
    if (resolved.origin !== baseUrl.origin) return 'invalid';
    return resolved.toString();
  } catch {
    return 'invalid';
  }
}

function normalizeAppUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
