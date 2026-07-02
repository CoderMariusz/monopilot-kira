export type HasPermissionClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export interface HasPermissionContext {
  userId: string;
  orgId: string;
  client: HasPermissionClient;
}

const SUPER_ROLES = ['owner', 'admin', 'org_admin'] as const;

export async function hasPermission(ctx: HasPermissionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select (
        exists (
          select 1
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
            left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
           where ur.user_id = $1::uuid
             and ur.org_id = $2::uuid
             and (
               rp.permission is not null
               or coalesce(r.permissions, '[]'::jsonb) ? $3
               or r.code = any($4::text[])
               or r.slug = any($4::text[])
             )
        )
        or app.current_user_is_platform_admin()
      ) as ok`,
    [ctx.userId, ctx.orgId, permission, SUPER_ROLES],
  );

  return rows[0]?.ok === true;
}

export async function hasAnyPermission(ctx: HasPermissionContext, permissions: string[]): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select (
        exists (
          select 1
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
            left join public.role_permissions rp on rp.role_id = r.id and rp.permission = any($3::text[])
           where ur.user_id = $1::uuid
             and ur.org_id = $2::uuid
             and (
               rp.permission = any($3::text[])
               or coalesce(r.permissions, '[]'::jsonb) ?| $3::text[]
               or r.code = any($4::text[])
               or r.slug = any($4::text[])
             )
        )
        or app.current_user_is_platform_admin()
      ) as ok`,
    [ctx.userId, ctx.orgId, permissions, SUPER_ROLES],
  );

  return rows[0]?.ok === true;
}
