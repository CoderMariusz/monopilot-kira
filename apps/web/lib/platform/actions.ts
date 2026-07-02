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
import type { PlatformActionResult } from './actions-types';

const ACT_AS_MAX_AGE_SECONDS = 60 * 60 * 8;

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
