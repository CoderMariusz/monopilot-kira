'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

import { getCachedUser } from '../auth/supabase-server';
import { getOwnerPool, withOrgContext } from '../auth/with-org-context';
import { SITE_COOKIE_NAME } from '../site/site-context';
import {
  PLATFORM_ORG_COOKIE,
  asPlatformOrgId,
  assertPlatformAdmin,
  readPlatformOrgCookie,
} from './platform-context';
import type { AddPlatformAdminResult, PlatformActionResult } from './actions-types';

const ACT_AS_MAX_AGE_SECONDS = 60 * 60 * 8;

// Pragmatic email shape check; the authoritative existence check is the
// public.users citext lookup below.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requirePlatformActor(): Promise<string> {
  const { data, error } = await getCachedUser();
  if (error || !data?.user?.id) {
    throw new Error('platform action requires a verified user');
  }
  await assertPlatformAdmin(data.user.id);
  return data.user.id;
}

async function writePublicAudit(action: string, targetOrgId: string): Promise<void> {
  await withOrgContext(async ({ userId, orgId, client }) => {
    await client.query(
      `insert into public.audit_events
         (org_id, actor_user_id, actor_type, impersonator_id, action, resource_type, resource_id, after_state, request_id, retention_class)
       values
         ($1::uuid, $2::uuid, 'impersonation', $2::uuid, $3, 'platform_org', $4::text, $5::jsonb, $6::uuid, 'security')`,
      [
        orgId,
        userId,
        action,
        targetOrgId,
        JSON.stringify({ target_org_id: targetOrgId }),
        randomUUID(),
      ],
    );
  });
}

async function writePlatformAudit(
  actorUserId: string,
  action: string,
  targetOrgId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const owner = getOwnerPool();
  const home = await owner.query<{ org_id: string }>(
    `select org_id::text as org_id from public.users where id = $1::uuid`,
    [actorUserId],
  );
  const homeOrgId = home.rows[0]?.org_id ?? null;

  await owner.query(
    `insert into app.platform_audit
       (actor_user_id, home_org_id, target_org_id, action, metadata)
     values
       ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb)`,
    [actorUserId, homeOrgId, targetOrgId, action, JSON.stringify(metadata)],
  );
}

export async function actAsOrgAction(orgId: string): Promise<PlatformActionResult> {
  const actorUserId = await requirePlatformActor();
  const targetOrgId = asPlatformOrgId(orgId);
  if (!targetOrgId) return { ok: false, error: 'invalid_org' };

  const owner = getOwnerPool();
  const exists = await owner.query<{ ok: boolean }>(
    `select true as ok from public.organizations where id = $1::uuid limit 1`,
    [targetOrgId],
  );
  if (exists.rows.length === 0) return { ok: false, error: 'invalid_org' };

  const store = await cookies();
  store.set(PLATFORM_ORG_COOKIE, targetOrgId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: true,
    maxAge: ACT_AS_MAX_AGE_SECONDS,
  });
  store.delete(SITE_COOKIE_NAME);

  await writePublicAudit('platform.act_as.entered', targetOrgId);
  await writePlatformAudit(actorUserId, 'platform.act_as.entered', targetOrgId);

  return { ok: true };
}

/**
 * Grant platform-admin to an existing auth user by email.
 *
 * Guards (server-resolved, never client-trusted): requirePlatformActor →
 * assertPlatformAdmin first. The email is resolved to a user id from
 * public.users using the citext-matching = operator (public.users.email is
 * citext), so lookup is case-insensitive without lowercasing here.
 *
 * Insert-or-revive: app.platform_admins.user_id is the PK, so a conflict means
 * the user is already (or was previously) an admin. On conflict we set
 * revoked_at = null → a previously-revoked admin is revived; an active admin is
 * a no-op. We distinguish the outcomes by reading revoked_at back.
 *
 * A successful add/revive writes an app.platform_audit row with action
 * 'platform.admin.added' (allowed only once mig 411 widens the CHECK — see
 * _meta/lane-drafts/C1-audit-actions.sql). Self-add and already-admin are
 * no-op successes and do not write an audit row.
 */
export async function addPlatformAdminAction(email: string): Promise<AddPlatformAdminResult> {
  const actorUserId = await requirePlatformActor();

  const trimmed = (email ?? '').trim();
  if (trimmed.length === 0 || !EMAIL_RE.test(trimmed)) {
    return { ok: false, error: 'invalid_email' };
  }

  const owner = getOwnerPool();

  const found = await owner.query<{ id: string; email: string }>(
    `select id::text as id, email::text as email
       from public.users
      where email = $1::citext
        and deleted_at is null
      limit 1`,
    [trimmed],
  );
  const target = found.rows[0];
  if (!target) return { ok: false, error: 'not_found' };

  // Self-add is a harmless no-op success (the actor is already an admin).
  if (target.id === actorUserId) {
    return { ok: true, outcome: 'self', email: target.email };
  }

  const upserted = await owner.query<{ was_revoked: boolean; existed: boolean }>(
    `with existing as (
        select revoked_at from app.platform_admins where user_id = $1::uuid
      ),
      upsert as (
        insert into app.platform_admins (user_id, email, created_by)
        values ($1::uuid, $2::citext, $3::uuid)
        on conflict (user_id) do update set revoked_at = null
        returning true as touched
      )
      select
        (select revoked_at is not null from existing) as was_revoked,
        (select true from existing) is not null       as existed
      from upsert`,
    [target.id, target.email, actorUserId],
  );

  const row = upserted.rows[0];
  const existed = row?.existed === true;
  const wasRevoked = row?.was_revoked === true;

  // Already an active admin → no-op success, no audit noise.
  if (existed && !wasRevoked) {
    return { ok: true, outcome: 'already_admin', email: target.email };
  }

  const outcome: 'revived' | 'added' = existed && wasRevoked ? 'revived' : 'added';

  await writePlatformAudit(actorUserId, 'platform.admin.added', null, {
    target_user_id: target.id,
    target_email: target.email,
    outcome,
  });

  return { ok: true, outcome, email: target.email };
}

export async function exitActAsAction(): Promise<PlatformActionResult> {
  const actorUserId = await requirePlatformActor();
  const targetOrgId = await readPlatformOrgCookie();

  if (targetOrgId) {
    await writePublicAudit('platform.act_as.exited', targetOrgId);
  }
  await writePlatformAudit(actorUserId, 'platform.act_as.exited', targetOrgId);

  const store = await cookies();
  store.delete(PLATFORM_ORG_COOKIE);
  store.delete(SITE_COOKIE_NAME);

  return { ok: true };
}
