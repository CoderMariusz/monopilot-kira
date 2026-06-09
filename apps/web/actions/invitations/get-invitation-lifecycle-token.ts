'use server';

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../lib/auth/with-org-context';

const INVITE_PERMISSION = 'settings.users.invite';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type InvitationTokenRow = {
  id: string;
  email: string;
  invite_token: string;
  invite_token_expires_at: string | Date;
  is_active: boolean | null;
};

export type GetInvitationLifecycleTokenInput = {
  invitationId: string;
};

export type GetInvitationLifecycleTokenResult = {
  token: string;
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
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

async function writeAuditEvent(
  { client, orgId, userId }: OrgContextLike,
  invitation: InvitationTokenRow,
): Promise<void> {
  await client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        after_state, request_id, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'user_invitation', $4::text, $5::jsonb, $6::uuid, 'security')`,
    [
      orgId,
      userId,
      'settings.user.invitation_lifecycle_token_accessed',
      invitation.id,
      JSON.stringify({
        invitation_id: invitation.id,
        email: invitation.email,
        expires_at:
          invitation.invite_token_expires_at instanceof Date
            ? invitation.invite_token_expires_at.toISOString()
            : invitation.invite_token_expires_at,
      }),
      randomUUID(),
    ],
  );
}

export async function getInvitationLifecycleToken(
  input: GetInvitationLifecycleTokenInput,
): Promise<GetInvitationLifecycleTokenResult> {
  if (!isUuid(input?.invitationId)) {
    throw new Error('invalid_input');
  }

  return withOrgContext<GetInvitationLifecycleTokenResult>(async (ctx): Promise<GetInvitationLifecycleTokenResult> => {
    const context = ctx as OrgContextLike;
    if (!(await hasInvitePermission(context))) {
      throw new Error('forbidden');
    }

    const { rows } = await context.client.query<InvitationTokenRow>(
      `select u.id,
              u.email::text as email,
              u.invite_token,
              u.invite_token_expires_at,
              u.is_active
         from public.users u
        where u.id = $1::uuid
          and u.org_id = app.current_org_id()
        limit 1`,
      [input.invitationId],
    );
    const invitation = rows[0];
    if (!invitation) {
      throw new Error('not_found');
    }
    if (invitation.is_active || !invitation.invite_token || !invitation.invite_token_expires_at) {
      throw new Error('non_pending');
    }
    const expiresAt =
      invitation.invite_token_expires_at instanceof Date
        ? invitation.invite_token_expires_at.getTime()
        : Date.parse(invitation.invite_token_expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error('non_pending');
    }

    await writeAuditEvent(context, invitation);
    return { token: invitation.invite_token };
  });
}
