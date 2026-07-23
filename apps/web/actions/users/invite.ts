'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { ALL_SITE_AUTHORITY_ROLE_SLUGS } from './role-grant-guards';
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
  | { ok: true; data: { email: string; expiresAt: string; resent?: boolean } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'seat_limit_exceeded'
        | 'email_taken'
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
  slug: string | null;
  is_system: boolean;
  display_order: number | null;
};

type ExistingUserRow = {
  id: string;
  is_active: boolean;
  invite_token: string | null;
  invite_token_expires_at: string | null;
  role_slug: string | null;
};

class InvitePersistenceError extends Error {}

function hasOutstandingInvite(row: ExistingUserRow): boolean {
  return row.invite_token !== null || row.invite_token_expires_at !== null;
}

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

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
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
      `select id, org_id, code, slug, is_system, display_order
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

    const resolvedSite = await resolveInviteSiteId(client, site);
    if ('error' in resolvedSite) {
      return { ok: false, error: resolvedSite.error };
    }
    const inviteSiteId = resolvedSite.siteId;

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

    const { rows: existingRows } = await client.query<ExistingUserRow & { org_id: string; role_id: string }>(
      `select u.id,
              u.org_id,
              u.is_active,
              u.invite_token,
              u.invite_token_expires_at,
              u.role_id,
              r.slug as role_slug
         from public.users u
         join public.roles r on r.id = u.role_id and r.org_id = u.org_id
        where u.email = $1::citext
        limit 1`,
      [email],
    );
    const existing = existingRows[0];

    if (existing && existing.org_id !== orgId) {
      return { ok: false, error: 'invalid_input' };
    }

    if (existing?.is_active) {
      return { ok: false, error: 'email_taken' };
    }

    const effectiveRoleSlug = existing?.role_slug ?? role.slug;
    if (
      !inviteSiteId &&
      !ALL_SITE_AUTHORITY_ROLE_SLUGS.some((slug) => slug === effectiveRoleSlug)
    ) {
      return { ok: false, error: 'invalid_input' };
    }

    const minted = await mintInviteLink(email, orgId, userId, site, personalMessage, redirectTo);
    if (!minted.ok) {
      return minted;
    }
    const inviteToken = minted.inviteToken;
    const authUserId = minted.authUserId;

    try {
      if (existing) {
        if (!hasOutstandingInvite(existing)) {
          return { ok: false, error: 'email_taken' };
        }

        const resent = await client.query<{ id: string }>(
          `update public.users
              set invite_token = $1,
                  invite_token_expires_at = $2::timestamptz,
                  updated_at = now()
            where id = $3::uuid
              and org_id = $4::uuid
              and is_active = false
            returning id`,
          [inviteToken, expiresAt.toISOString(), existing.id, orgId],
        );
        if ((resent.rowCount ?? resent.rows.length) < 1) {
          return { ok: false, error: 'persistence_failed' };
        }

        if (inviteSiteId) {
          const scoped = await replaceInvitedUserSiteScope(client, existing.id, inviteSiteId, userId);
          if (!scoped) {
            throw new Error('INVITE_SITE_SCOPE_FAILED');
          }
        }

        await writeInviteAuditAndOutbox(
          client,
          orgId,
          userId,
          existing.id,
          email,
          existing.role_id,
          expiresAt,
          site,
          personalMessage,
        );

        return {
          ok: true,
          data: { email, expiresAt: expiresAt.toISOString(), resent: true },
        };
      }

      const invited = await client.query<{ id: string }>(
        `insert into public.users
           (id, org_id, email, name, role_id, language, is_active, invite_token, invite_token_expires_at, updated_at)
         values ($1::uuid, $2::uuid, $3::citext, $4, $5::uuid, $6, false, $7, $8::timestamptz, now())
         returning id`,
        [authUserId, orgId, email, name, roleId, language, inviteToken, expiresAt.toISOString()],
      );
      if ((invited.rowCount ?? invited.rows.length) < 1) {
        return { ok: false, error: 'invalid_input' };
      }

      const invitedUserId = invited.rows[0]?.id;
      if (invitedUserId !== authUserId) {
        throw new Error('INVITE_USER_ID_MISMATCH');
      }

      if (inviteSiteId) {
        const scoped = await replaceInvitedUserSiteScope(client, authUserId, inviteSiteId, userId);
        if (!scoped) {
          throw new Error('INVITE_SITE_SCOPE_FAILED');
        }
      }

      await writeInviteAuditAndOutbox(
        client,
        orgId,
        userId,
        authUserId,
        email,
        roleId,
        expiresAt,
        site,
        personalMessage,
      );
    } catch {
      throw new InvitePersistenceError();
    }

    return { ok: true, data: { email, expiresAt: expiresAt.toISOString() } };
    });
  } catch (error) {
    if (error instanceof InvitePersistenceError) {
      return { ok: false, error: 'persistence_failed' };
    }
    throw error;
  }
}

// Helpers are declared AFTER inviteUser so raw source order mirrors execution
// order (seat/active-count pre-flight → mint auth link → write audit+outbox).
// The structural guards in invite.test.ts read this source-position ordering.

type InviteQueryClient = Parameters<Parameters<typeof withOrgContext>[0]>[0]['client'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveInviteSiteId(
  client: InviteQueryClient,
  site: string | null,
): Promise<{ siteId: string | null } | { error: 'invalid_input' }> {
  if (!site) {
    return { siteId: null };
  }

  const { rows } = await client.query<{ id: string }>(
    `select s.id::text as id
       from public.sites s
      where s.org_id = app.current_org_id()
        and s.is_active = true
        and (
          s.id = $1::uuid
          or lower(trim(s.name)) = lower(trim($2::text))
          or lower(trim(s.site_code)) = lower(trim($2::text))
        )
      limit 2`,
    [UUID_RE.test(site) ? site : null, site],
  );

  if (rows.length !== 1) {
    return { error: 'invalid_input' };
  }

  return { siteId: rows[0]?.id ?? null };
}

async function replaceInvitedUserSiteScope(
  client: InviteQueryClient,
  targetUserId: string,
  siteId: string,
  assignedBy: string,
): Promise<boolean> {
  const result = await client.query<{ site_id: string }>(
    `with cleared as (
       delete from public.user_sites
        where user_id = $1::uuid
          and org_id = app.current_org_id()
     )
     insert into public.user_sites (user_id, site_id, org_id, assigned_by)
     values ($1::uuid, $2::uuid, app.current_org_id(), $3::uuid)
     returning site_id`,
    [targetUserId, siteId, assignedBy],
  );
  return (result.rowCount ?? result.rows.length) >= 1;
}

async function mintInviteLink(
  email: string,
  orgId: string,
  userId: string,
  site: string | null,
  personalMessage: string | null,
  redirectTo: string | null,
): Promise<
  { ok: true; inviteToken: string; authUserId: string }
  | { ok: false; error: 'invite_failed' }
> {
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
    null;
  const authUserId = linkResponse.data?.user?.id ?? null;
  if (!inviteToken || !authUserId) {
    return { ok: false, error: 'invite_failed' };
  }

  return { ok: true, inviteToken, authUserId };
}

async function writeInviteAuditAndOutbox(
  client: Parameters<Parameters<typeof withOrgContext>[0]>[0]['client'],
  orgId: string,
  userId: string,
  invitedUserId: string,
  email: string,
  roleId: string,
  expiresAt: Date,
  site: string | null,
  personalMessage: string | null,
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'users', $4, null, $5::jsonb, 'security')`,
    [
      orgId,
      userId,
      'settings.user.invited',
      invitedUserId,
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
