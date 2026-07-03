import { NPD_CHECKLIST_PERMISSION } from './checklist-template-schema';

export type QueryResult<T> = { rows: T[]; rowCount?: number | null };
export type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
export type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export async function hasNpdSchemaEdit({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
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
    [userId, orgId, NPD_CHECKLIST_PERMISSION],
  );
  return rows.length > 0;
}
