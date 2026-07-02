import { cache } from 'react';
import { cookies } from 'next/headers';

import { getCachedUser } from '../auth/supabase-server';
import { getOwnerPool } from '../auth/with-org-context';

export const PLATFORM_ORG_COOKIE = 'mp_platform_org';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asPlatformOrgId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

export async function readPlatformOrgCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    return asPlatformOrgId(store.get(PLATFORM_ORG_COOKIE)?.value);
  } catch {
    return null;
  }
}

export const assertPlatformAdmin = cache(async function assertPlatformAdmin(userId: string): Promise<void> {
  const owner = getOwnerPool();
  const { rows } = await owner.query<{ ok: boolean }>(
    `select true as ok
       from app.platform_admins
      where user_id = $1::uuid
        and revoked_at is null
      limit 1`,
    [userId],
  );

  if (rows.length === 0) {
    throw new Error('platform admin required');
  }
});

export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await getCachedUser();
  if (error || !data?.user?.id) return false;

  try {
    await assertPlatformAdmin(data.user.id);
    return true;
  } catch {
    return false;
  }
}
