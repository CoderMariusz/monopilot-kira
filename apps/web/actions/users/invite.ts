'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { createServerSupabaseClient } from '../../lib/auth/supabase-server';

const INVITE_TTL_SECONDS = 604800;
const ADMIN_ROLE_CODES = ['org.access.admin', 'org.platform.admin'] as const;

export type InviteUserInput = {
  email: string;
  name?: string;
  roleId?: string;
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

  const name = normalizeString(input.name) ?? email;
  const language = normalizeString(input.language) ?? 'pl';
  const requestedRoleId = normalizeString(input.roleId);
  const redirectTo = normalizeString(input.redirectTo);
  const expiresAt = new Date(Date.now() + INVITE_TTL_SECONDS * 1000);

  return withOrgContext(async ({ userId, orgId, client }) => {
    const { rows: adminRows } = await client.query<{ id: string }>(
      `select r.id
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id
        where ur.user_id = $1::uuid
          and ur.org_id = $2::uuid
          and r.code = any($3::text[])`,
      [userId, orgId, ADMIN_ROLE_CODES as unknown as string[]],
    );
    if (adminRows.length === 0) {
      return { ok: false, error: 'forbidden' };
    }

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

    const supabase = await createServerSupabaseClient();
    const linkResponse = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { org_id: orgId, invited_by: userId },
        redirectTo,
        expiresIn: INVITE_TTL_SECONDS,
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
      let roleId = requestedRoleId;
      if (!roleId) {
        const { rows: roleRows } = await client.query<RoleRow>(
          `select id
             from public.roles
            where org_id = $1::uuid
            order by is_system desc, display_order asc nulls last
            limit 1`,
          [orgId],
        );
        roleId = roleRows[0]?.id ?? null;
      }

      if (!roleId) {
        return { ok: false, error: 'persistence_failed' };
      }

      await client.query(
        `insert into public.users
           (org_id, email, name, role_id, language, is_active, invite_token, invite_token_expires_at, updated_at)
         values ($1::uuid, $2::citext, $3, $4::uuid, $5, false, $6, $7::timestamptz, now())
         on conflict (email) do update set
           org_id = excluded.org_id,
           name = excluded.name,
           role_id = excluded.role_id,
           language = excluded.language,
           is_active = false,
           invite_token = excluded.invite_token,
           invite_token_expires_at = excluded.invite_token_expires_at,
           updated_at = now()`,
        [orgId, email, name, roleId, language, inviteToken, expiresAt.toISOString()],
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
          }),
        ],
      );
    } catch {
      return { ok: false, error: 'persistence_failed' };
    }

    return { ok: true, data: { email, expiresAt: expiresAt.toISOString() } };
  });
}
