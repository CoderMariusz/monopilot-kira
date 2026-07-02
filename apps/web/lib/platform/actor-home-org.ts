/**
 * Resolve the platform actor's HOME org id — the org their public.users row
 * belongs to. Used by the console to tag the "Home"/"You are here" row and by
 * the topbar org switcher to split "your home org" from "act as" targets.
 *
 * Owner-pool read (lib/platform is fence-allowed), guarded by assertPlatformAdmin
 * so a non-admin can never resolve cross-actor identity through it.
 */

import { getCachedUser } from "../auth/supabase-server";
import { getOwnerPool } from "../auth/with-org-context";
import { assertPlatformAdmin } from "./platform-context";

export async function resolvePlatformActorHomeOrgId(): Promise<string | null> {
  const { data, error } = await getCachedUser();
  if (error || !data?.user?.id) {
    throw new Error("platform actor resolution requires a verified user");
  }
  await assertPlatformAdmin(data.user.id);

  const owner = getOwnerPool();
  const { rows } = await owner.query<{ org_id: string }>(
    `select org_id::text as org_id from public.users where id = $1::uuid limit 1`,
    [data.user.id],
  );
  return rows[0]?.org_id ?? null;
}
