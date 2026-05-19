'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { createServerSupabaseClient } from '../../lib/auth/supabase-server';

const INVITE_TTL_SECONDS = 604800;
const INVITE_PERMISSION = 'settings.users.invite';
const OUTBOX_EVENT_BY_LIFECYCLE_ACTION = {
  'settings.user.invitation_resent': 'user.invited',
  'settings.user.invitation_revoked': 'audit.recorded',
} as const;

type QueryResult<T> = { rows: T[]; rowCount: number };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type InvitationRow = {
  id: string;
  org_id: string;
  email: string;
  role_name: string | null;
  role_id: string | null;
  invited_by: string | null;
  invited_by_name: string | null;
  invited_at: string | Date | null;
  invite_token: string | null;
  invite_token_expires_at: string | Date | null;
  is_active: boolean | null;
  accepted_at: string | Date | null;
};

type InvitationStatus = 'pending' | 'expired' | 'accepted' | 'revoked';

type InvitationListItem = {
  id: string;
  email: string;
  role: string | null;
  roleId: string | null;
  invitedBy: string | null;
  invitedByUserId: string | null;
  invitedAt: string | null;
  expiresAt: string | null;
  status: InvitationStatus;
  actions: { canResend: boolean; canRevoke: boolean };
};

export type ListInvitationsResult =
  | { ok: true; data: { invitations: InvitationListItem[] } }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export type InvitationLifecycleInput = {
  invitationId: string;
  inviteToken: string;
};

export type ResendInvitationResult =
  | { ok: true; data: { invitationId: string; email: string; expiresAt: string; resendKind: 'pending' | 'expired' } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'invalid_state'
        | 'stale_token'
        | 'seat_limit_exceeded'
        | 'invite_failed'
        | 'persistence_failed';
    };

export type RevokeInvitationResult =
  | { ok: true; data: { invitationId: string; status: 'revoked' } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'invalid_state' | 'stale_token' | 'persistence_failed';
    };

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function invitationStatus(row: InvitationRow, now = new Date()): InvitationStatus {
  if (row.accepted_at || row.is_active) return 'accepted';
  if (!row.invite_token) return 'revoked';
  const expiresAt = row.invite_token_expires_at ? Date.parse(iso(row.invite_token_expires_at) ?? '') : Number.NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) return 'expired';
  return 'pending';
}

function toListItem(row: InvitationRow): InvitationListItem {
  const status = invitationStatus(row);
  return {
    id: row.id,
    email: row.email,
    role: row.role_name,
    roleId: row.role_id,
    invitedBy: row.invited_by_name,
    invitedByUserId: row.invited_by,
    invitedAt: iso(row.invited_at),
    expiresAt: iso(row.invite_token_expires_at),
    status,
    actions: {
      canResend: status === 'pending' || status === 'expired',
      canRevoke: status === 'pending',
    },
  };
}

async function hasInvitePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, INVITE_PERMISSION],
  );
  return rows.length > 0;
}

async function readInvitation(client: QueryClient, invitationId: string, orgId: string): Promise<InvitationRow | null> {
  const { rows } = await client.query<InvitationRow>(
    `select u.id,
            u.org_id,
            u.email,
            coalesce(r.name, r.code) as role_name,
            u.role_id,
            null::uuid as invited_by,
            null::text as invited_by_name,
            u.created_at as invited_at,
            u.invite_token,
            u.invite_token_expires_at,
            u.is_active,
            null::timestamptz as accepted_at
       from public.users u
       left join public.roles r on r.id = u.role_id and r.org_id = u.org_id
      where u.id = $1::uuid
        and u.org_id = $2::uuid
      limit 1`,
    [invitationId, orgId],
  );
  return rows[0] ?? null;
}

async function ensureSeatAvailable(client: QueryClient, orgId: string): Promise<boolean> {
  const { rows: seatRows } = await client.query<{ seat_limit: number | null }>(
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
  return seatLimit === null || activeUserCount < seatLimit;
}

async function writeAuditLog(
  { client, orgId, userId }: OrgContextLike,
  action: 'settings.user.invitation_resent' | 'settings.user.invitation_revoked',
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'user_invitation', $4::uuid, $5::jsonb, $6::jsonb, 'standard')`,
    [orgId, userId, action, beforeState.invitation_id, JSON.stringify(beforeState), JSON.stringify(afterState)],
  );
}

async function writeOutbox(
  { client, orgId, userId }: OrgContextLike,
  eventType: 'settings.user.invitation_resent' | 'settings.user.invitation_revoked',
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (
       $1::uuid,
       $2,
       'user',
       $3::uuid,
       ($5::jsonb || jsonb_build_object('lifecycle_event', $4::text)),
       'settings-invitations-lifecycle-v1'
     )`,
    [
      orgId,
      OUTBOX_EVENT_BY_LIFECYCLE_ACTION[eventType],
      payload.invitation_id,
      eventType,
      JSON.stringify({ org_id: orgId, actor_user_id: userId, ...payload }),
    ],
  );
}

export async function listInvitations(): Promise<ListInvitationsResult> {
  try {
    return await withOrgContext<ListInvitationsResult>(async (ctx): Promise<ListInvitationsResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasInvitePermission(context))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await context.client.query<InvitationRow>(
        `select u.id,
                u.org_id,
                u.email,
                coalesce(r.name, r.code) as role_name,
                u.role_id,
                null::uuid as invited_by,
                null::text as invited_by_name,
                u.created_at as invited_at,
                u.invite_token,
                u.invite_token_expires_at,
                u.is_active,
                null::timestamptz as accepted_at
           from public.users u
           left join public.roles r on r.id = u.role_id and r.org_id = u.org_id
          where u.org_id = $1::uuid
            and (u.invite_token is not null or u.invite_token_expires_at is not null or u.is_active = true)
          order by u.created_at desc, u.email asc`,
        [context.orgId],
      );

      return { ok: true, data: { invitations: rows.map(toListItem) } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function resendInvitation(input: InvitationLifecycleInput): Promise<ResendInvitationResult> {
  if (!isUuid(input?.invitationId) || !normalizeToken(input?.inviteToken)) {
    return { ok: false, error: 'invalid_input' };
  }
  const inviteToken = normalizeToken(input.inviteToken)!;

  try {
    return await withOrgContext<ResendInvitationResult>(async (ctx): Promise<ResendInvitationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasInvitePermission(context))) {
        return { ok: false, error: 'forbidden' };
      }

      const invitation = await readInvitation(context.client, input.invitationId, context.orgId);
      if (!invitation) return { ok: false, error: 'not_found' };

      const status = invitationStatus(invitation);
      if (status !== 'pending' && status !== 'expired') return { ok: false, error: 'invalid_state' };
      if (invitation.invite_token !== inviteToken) return { ok: false, error: 'stale_token' };
      if (!(await ensureSeatAvailable(context.client, context.orgId))) {
        return { ok: false, error: 'seat_limit_exceeded' };
      }

      const expiresAt = new Date(Date.now() + INVITE_TTL_SECONDS * 1000);
      const supabase = await createServerSupabaseClient();
      const linkResponse = await supabase.auth.admin.generateLink({
        type: 'invite',
        email: invitation.email,
        options: {
          data: {
            org_id: context.orgId,
            role_id: invitation.role_id,
            invited_by: context.userId,
            invitation_id: invitation.id,
            expires_in: INVITE_TTL_SECONDS,
          },
        },
      });
      if (linkResponse.error) return { ok: false, error: 'invite_failed' };
      const newInviteToken =
        linkResponse.data?.properties?.hashed_token ??
        linkResponse.data?.properties?.email_otp ??
        linkResponse.data?.user?.id ??
        null;
      if (!newInviteToken) return { ok: false, error: 'invite_failed' };

      const updated = await context.client.query(
        `update public.users
            set invite_token = $1,
                invite_token_expires_at = $2::timestamptz,
                updated_at = now()
          where id = $3::uuid
            and org_id = $4::uuid
            and invite_token = $5
            and is_active = false`,
        [newInviteToken, expiresAt.toISOString(), invitation.id, context.orgId, inviteToken],
      );
      if ((updated.rowCount ?? 0) < 1) return { ok: false, error: 'stale_token' };

      const beforeState = {
        invitation_id: invitation.id,
        email: invitation.email,
        status,
        expires_at: iso(invitation.invite_token_expires_at),
      };
      const afterState = {
        invitation_id: invitation.id,
        email: invitation.email,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      };
      await writeAuditLog(context, 'settings.user.invitation_resent', beforeState, afterState);
      await writeOutbox(context, 'settings.user.invitation_resent', afterState);

      return {
        ok: true,
        data: {
          invitationId: invitation.id,
          email: invitation.email,
          expiresAt: expiresAt.toISOString(),
          resendKind: status,
        },
      };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function revokeInvitation(input: InvitationLifecycleInput): Promise<RevokeInvitationResult> {
  if (!isUuid(input?.invitationId) || !normalizeToken(input?.inviteToken)) {
    return { ok: false, error: 'invalid_input' };
  }
  const inviteToken = normalizeToken(input.inviteToken)!;

  try {
    return await withOrgContext<RevokeInvitationResult>(async (ctx): Promise<RevokeInvitationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasInvitePermission(context))) {
        return { ok: false, error: 'forbidden' };
      }

      const invitation = await readInvitation(context.client, input.invitationId, context.orgId);
      if (!invitation) return { ok: false, error: 'not_found' };
      const status = invitationStatus(invitation);
      if (status !== 'pending') return { ok: false, error: 'invalid_state' };
      if (invitation.invite_token !== inviteToken) return { ok: false, error: 'stale_token' };

      const updated = await context.client.query(
        `update public.users
            set invite_token = null,
                invite_token_expires_at = null,
                updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
            and invite_token = $3
            and is_active = false
            and invite_token_expires_at > now()`,
        [invitation.id, context.orgId, inviteToken],
      );
      if ((updated.rowCount ?? 0) < 1) return { ok: false, error: 'stale_token' };

      const beforeState = {
        invitation_id: invitation.id,
        email: invitation.email,
        status,
        expires_at: iso(invitation.invite_token_expires_at),
      };
      const afterState = {
        invitation_id: invitation.id,
        email: invitation.email,
        status: 'revoked',
        expires_at: null,
      };
      await writeAuditLog(context, 'settings.user.invitation_revoked', beforeState, afterState);
      await writeOutbox(context, 'settings.user.invitation_revoked', afterState);

      return { ok: true, data: { invitationId: invitation.id, status: 'revoked' } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
