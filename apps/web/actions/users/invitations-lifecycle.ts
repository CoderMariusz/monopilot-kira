'use server';

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';
import { getResendConfiguration, sendResendEmail, type ResendConfiguration } from '../email/resend';
import { createSupabaseAuthAdmin } from './supabase-admin';

const INVITE_TTL_SECONDS = 604800;
const INVITE_PERMISSION = 'settings.users.invite';
const INVITATION_EMAIL_SUBJECT = 'You have been invited to Monopilot';
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
  invited_by_actor_type: string | null;
  invited_by_name: string | null;
  invited_at: string | Date | null;
  invite_token: string | null;
  invite_token_expires_at: string | Date | null;
  is_active: boolean | null;
  accepted_at: string | Date | null;
};

type InvitedByAttribution = 'user' | 'system' | 'unknown';

type InvitationStatus = 'pending' | 'expired' | 'accepted' | 'revoked';

function inviteCreatorCte(orgParam: string): string {
  return `
  with invite_creator as (
    select distinct on (al.resource_id)
           al.resource_id,
           al.actor_user_id,
           al.actor_type
      from public.audit_log al
     where al.org_id = ${orgParam}::uuid
       -- inviteUser (invite.ts) stamps resource_type 'users' on the CREATION row, while
       -- resend/revoke here use 'user_invitation'. Filtering on one value alone matched
       -- zero rows, so "Invited By" always fell through to Unknown even though the actor
       -- was recorded. The action already narrows this to invitations; the resource_type
       -- list only spans the two writers.
       and al.resource_type in ('user_invitation', 'users')
       and al.action = 'settings.user.invited'
     order by al.resource_id, al.occurred_at asc
  )`;
}

const INVITATION_AUDIT_JOIN = `
  left join invite_creator
    on invite_creator.resource_id = u.id::text
  left join public.users inviter
    on inviter.id = invite_creator.actor_user_id
   and inviter.org_id = u.org_id`;

const INVITATION_SELECT_FIELDS = `
            u.id,
            u.org_id,
            u.email,
            coalesce(r.name, r.code) as role_name,
            u.role_id,
            invite_creator.actor_user_id as invited_by,
            invite_creator.actor_type as invited_by_actor_type,
            coalesce(nullif(trim(inviter.name), ''), inviter.email) as invited_by_name,
            u.created_at as invited_at,
            u.invite_token,
            u.invite_token_expires_at,
            u.is_active,
            case when u.is_active then u.updated_at else null end as accepted_at`;

const INVITATION_LIST_WHERE = `
          where u.org_id = $1::uuid
            and (
              u.invite_token is not null
              or u.invite_token_expires_at is not null
              or exists (
                select 1
                  from public.audit_log al
                 where al.org_id = u.org_id
                   and al.resource_type in ('user_invitation', 'users')
                   and al.resource_id = u.id::text
                   and al.occurred_at >= u.created_at
                   and al.action in (
                     'settings.user.invited',
                     'settings.user.invitation_resent',
                     'settings.user.invitation_revoked'
                   )
                 limit 1
              )
            )`;

type InvitationListItem = {
  id: string;
  email: string;
  role: string | null;
  roleId: string | null;
  invitedBy: string | null;
  invitedByAttribution: InvitedByAttribution;
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

export type InvitationDelivery = 'email';

export type ResendInvitationResult =
  | {
      ok: true;
      data: {
        invitationId: string;
        email: string;
        expiresAt: string;
        resendKind: 'pending' | 'expired';
        delivery: InvitationDelivery;
        messageId: string;
      };
    }
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
        | 'email_not_configured'
        | 'persistence_failed';
    };

export type RevokeInvitationResult =
  | { ok: true; data: { invitationId: string; status: 'revoked' } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'invalid_state' | 'stale_token' | 'persistence_failed';
    };

type PrepareResendResult =
  | { ready: false; result: ResendInvitationResult }
  | {
      ready: true;
      config: ResendConfiguration;
      invitationId: string;
      email: string;
      expiresAt: string;
      resendKind: 'pending' | 'expired';
      acceptUrl: string;
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
  // Rows are pre-filtered to invitation lifecycle only — is_active here means accepted invite.
  if (row.is_active) return 'accepted';
  if (!row.invite_token) return 'revoked';
  const expiresAt = row.invite_token_expires_at ? Date.parse(iso(row.invite_token_expires_at) ?? '') : Number.NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) return 'expired';
  return 'pending';
}

function resolveInvitedByAttribution(row: InvitationRow): InvitedByAttribution {
  if (row.invited_by_actor_type === 'system') return 'system';
  if (row.invited_by_name || row.invited_by) return 'user';
  return 'unknown';
}

function toListItem(row: InvitationRow): InvitationListItem {
  const status = invitationStatus(row);
  const invitedByAttribution = resolveInvitedByAttribution(row);
  return {
    id: row.id,
    email: row.email,
    role: row.role_name,
    roleId: row.role_id,
    invitedBy: invitedByAttribution === 'user' ? row.invited_by_name : null,
    invitedByAttribution,
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
    `${inviteCreatorCte('$2')}
     select ${INVITATION_SELECT_FIELDS}
       from public.users u
       left join public.roles r on r.id = u.role_id and r.org_id = u.org_id
       ${INVITATION_AUDIT_JOIN}
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

async function insertInvitationEmailLog(
  client: QueryClient,
  params: {
    id: string;
    orgId: string;
    email: string;
    status: 'queued' | 'failed';
    messageId: string | null;
    error: string | null;
    invitationId: string;
  },
): Promise<void> {
  await client.query(
    `insert into public.email_delivery_log
       (id, org_id, trigger_code, recipient_email, subject, status, provider_message_id, last_error_summary, payload)
     values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      params.id,
      params.orgId,
      'settings.user.invitation_resent',
      params.email,
      INVITATION_EMAIL_SUBJECT,
      params.status,
      params.messageId,
      params.error,
      JSON.stringify({ invitation_id: params.invitationId, provider: 'resend' }),
    ],
  );
}

async function updateInvitationEmailLog(
  client: QueryClient,
  params: {
    id: string;
    orgId: string;
    status: 'sent' | 'failed';
    messageId: string | null;
    error: string | null;
  },
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `update public.email_delivery_log
        set status = $3,
            provider_message_id = $4,
            last_error_summary = $5,
            updated_at = pg_catalog.now()
      where id = $1::uuid
        and org_id = $2::uuid
      returning id`,
    [params.id, params.orgId, params.status, params.messageId, params.error],
  );
  if ((result.rowCount ?? result.rows.length) !== 1) {
    throw new Error('INVITATION_EMAIL_LOG_UPDATE_FAILED');
  }
}

function inviteAcceptUrl(token: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!base) return null;
  try {
    const url = new URL('/api/auth/invite/accept', base);
    url.searchParams.set('token', token);
    return url.toString();
  } catch {
    return null;
  }
}

export async function listInvitations(): Promise<ListInvitationsResult> {
  try {
    return await withOrgContext<ListInvitationsResult>(async (ctx): Promise<ListInvitationsResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasInvitePermission(context))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await context.client.query<InvitationRow>(
        `${inviteCreatorCte('$1')}
         select ${INVITATION_SELECT_FIELDS}
           from public.users u
           left join public.roles r on r.id = u.role_id and r.org_id = u.org_id
           ${INVITATION_AUDIT_JOIN}
          ${INVITATION_LIST_WHERE}
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
  const emailLogId = randomUUID();

  try {
    const prepared = await withOrgContext<PrepareResendResult>(async (ctx): Promise<PrepareResendResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasInvitePermission(context))) {
        return { ready: false, result: { ok: false, error: 'forbidden' } };
      }

      const invitation = await readInvitation(context.client, input.invitationId, context.orgId);
      if (!invitation) return { ready: false, result: { ok: false, error: 'not_found' } };

      const status = invitationStatus(invitation);
      if (status !== 'pending' && status !== 'expired') {
        return { ready: false, result: { ok: false, error: 'invalid_state' } };
      }
      if (invitation.invite_token !== inviteToken) {
        return { ready: false, result: { ok: false, error: 'stale_token' } };
      }
      if (!(await ensureSeatAvailable(context.client, context.orgId))) {
        return { ready: false, result: { ok: false, error: 'seat_limit_exceeded' } };
      }

      const configuration = getResendConfiguration();
      if (!configuration.ok) {
        await insertInvitationEmailLog(context.client, {
          id: emailLogId,
          orgId: context.orgId,
          email: invitation.email,
          status: 'failed',
          messageId: null,
          error: configuration.reason,
          invitationId: invitation.id,
        });
        console.error('[resendInvitation] provider_not_configured', {
          invitationId: invitation.id,
          reason: configuration.reason,
        });
        return { ready: false, result: { ok: false, error: 'email_not_configured' } };
      }

      const expiresAt = new Date(Date.now() + INVITE_TTL_SECONDS * 1000);
      // `auth.admin.*` is a service-role endpoint. Minting this through the
      // request-scoped ANON client (createServerSupabaseClient) makes Supabase
      // answer `not_admin` on every production call, so the UPDATE + audit +
      // outbox + revalidate below were unreachable and the action always ended
      // `invite_failed`. Same service-role factory the initial invite uses
      // (invite.ts → sendInviteEmail).
      let linkResponse: Awaited<
        ReturnType<Awaited<ReturnType<typeof createSupabaseAuthAdmin>>['auth']['admin']['generateLink']>
      >;
      try {
        const supabase = await createSupabaseAuthAdmin();
        linkResponse = await supabase.auth.admin.generateLink({
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
      } catch (error) {
        // createSupabaseAuthAdmin throws when the service-role env is absent.
        // Fail closed BEFORE the UPDATE so a missing key can never half-apply.
        console.error('[resendInvitation] service-role invite link mint failed', {
          invitationId: invitation.id,
          err: error instanceof Error ? error.message : String(error),
        });
        return { ready: false, result: { ok: false, error: 'invite_failed' } };
      }
      if (linkResponse.error) {
        return { ready: false, result: { ok: false, error: 'invite_failed' } };
      }
      const newInviteToken =
        linkResponse.data?.properties?.hashed_token ??
        linkResponse.data?.properties?.email_otp ??
        linkResponse.data?.user?.id ??
        null;
      if (!newInviteToken) {
        return { ready: false, result: { ok: false, error: 'invite_failed' } };
      }

      const acceptUrl = inviteAcceptUrl(newInviteToken);
      if (!acceptUrl) {
        const reason = 'Missing or invalid required email environment variable: NEXT_PUBLIC_APP_URL';
        await insertInvitationEmailLog(context.client, {
          id: emailLogId,
          orgId: context.orgId,
          email: invitation.email,
          status: 'failed',
          messageId: null,
          error: reason,
          invitationId: invitation.id,
        });
        console.error('[resendInvitation] provider_not_configured', {
          invitationId: invitation.id,
          reason,
        });
        return { ready: false, result: { ok: false, error: 'email_not_configured' } };
      }

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
      if ((updated.rowCount ?? 0) < 1) {
        return { ready: false, result: { ok: false, error: 'stale_token' } };
      }

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
      await insertInvitationEmailLog(context.client, {
        id: emailLogId,
        orgId: context.orgId,
        email: invitation.email,
        status: 'queued',
        messageId: null,
        error: null,
        invitationId: invitation.id,
      });

      return {
        ready: true,
        config: configuration.config,
        invitationId: invitation.id,
        email: invitation.email,
        expiresAt: expiresAt.toISOString(),
        resendKind: status,
        acceptUrl,
      };
    });

    if (!prepared.ready) return prepared.result;

    const delivery = await sendResendEmail({
      config: prepared.config,
      to: [prepared.email],
      subject: INVITATION_EMAIL_SUBJECT,
      text: [
        'You have been invited to Monopilot.',
        `Accept your invitation: ${prepared.acceptUrl}`,
        `This invitation expires at ${prepared.expiresAt}.`,
      ].join('\n'),
      idempotencyKey: `invitation/${prepared.invitationId}/${emailLogId}`,
    });

    await withOrgContext(async ({ client, orgId }) => {
      await updateInvitationEmailLog(client as QueryClient, {
        id: emailLogId,
        orgId,
        status: delivery.status,
        messageId: delivery.status === 'sent' ? delivery.messageId : null,
        error: delivery.status === 'failed' ? delivery.reason : null,
      });
    });

    try {
      revalidateLocalized('/settings/users');
      revalidateLocalized('/settings/invitations');
    } catch {
      // Unit tests and non-Next callers do not provide a static-generation store.
    }

    if (delivery.status === 'failed') {
      console.error('[resendInvitation] provider_send_failed', {
        invitationId: prepared.invitationId,
        code: delivery.code,
        reason: delivery.reason,
      });
      return { ok: false, error: 'invite_failed' };
    }

    return {
      ok: true,
      data: {
        invitationId: prepared.invitationId,
        email: prepared.email,
        expiresAt: prepared.expiresAt,
        resendKind: prepared.resendKind,
        delivery: 'email',
        messageId: delivery.messageId,
      },
    };
  } catch (error) {
    console.error('[resendInvitation] persistence_failed', {
      invitationId: input.invitationId,
      err: error instanceof Error ? error.message : String(error),
    });
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
        expires_at: iso(invitation.invite_token_expires_at),
      };
      await writeAuditLog(context, 'settings.user.invitation_revoked', beforeState, afterState);
      await writeOutbox(context, 'settings.user.invitation_revoked', afterState);

      try {
        revalidateLocalized('/settings/users');
        revalidateLocalized('/settings/invitations');
      } catch {
        // Unit tests and non-Next callers do not provide a static-generation store.
      }

      return { ok: true, data: { invitationId: invitation.id, status: 'revoked' } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
