/**
 * B-2 — Changeover create-modal LINE picker source (read-only).
 *
 * The C4 mutation seam (changeover-actions.ts) is owned by another lane; the
 * create modal still needs the org's production lines to populate the line
 * <Select>. This is a thin read-only loader over public.production_lines (mig
 * 042 / 268), org-scoped via withOrgContext + RLS — the same shape the dashboard
 * loader joins to. It is NOT the C4 changeover-actions.ts file (no mutations).
 *
 * Gated server-side on production.oee.read (mirrors changeover-data.ts).
 */
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

import type { ChangeoverLineOption } from '../_components/changeovers-contract';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';

async function hasPermission(
  c: QueryClient,
  userId: string,
  orgId: string,
  permission: string,
): Promise<boolean> {
  const { rows } = await c.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

export async function listChangeoverLines(): Promise<ChangeoverLineOption[]> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ChangeoverLineOption[]> => {
      const c = client as QueryClient;
      const allowed = await hasPermission(c, userId, orgId, PRODUCTION_VIEW_PERMISSION);
      if (!allowed) return [];

      const { rows } = await c.query<{ id: string; code: string }>(
        `select pl.id::text as id, pl.code
           from public.production_lines pl
          where pl.org_id = app.current_org_id()
            and coalesce(pl.status, 'active') <> 'archived'
          order by pl.code asc
          limit 200`,
      );
      return rows.map((r) => ({ id: r.id, code: r.code }));
    });
  } catch (error) {
    console.error('[production/changeovers] line load failed:', error);
    return [];
  }
}
