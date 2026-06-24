import { withOrgContext, type OrgContext } from '../../../../../../lib/auth/with-org-context';

export const OEE_ANDON_VIEW_PERMISSION = 'oee.tv.kiosk_view';

async function hasPermission(ctx: OrgContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

export async function canViewAndonKiosk(): Promise<boolean> {
  return withOrgContext(async (ctx) => hasPermission(ctx, OEE_ANDON_VIEW_PERMISSION));
}
