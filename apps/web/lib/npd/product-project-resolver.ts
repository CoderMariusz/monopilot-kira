export type OrgCtx = {
  client: {
    query<T = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<{ rows: T[] }>;
  };
};

export type ResolveProjectResult =
  | { kind: 'ok'; projectId: string }
  | { kind: 'ambiguous'; projectIds: string[] }
  | { kind: 'none' };

const RESOLVE_PROJECT_SQL = `select id::text as id
  from public.npd_projects
 where org_id = app.current_org_id()
   and product_code = $1::text`;

export async function resolveProjectIdByProductCode(
  ctx: OrgCtx,
  productCode: string,
): Promise<ResolveProjectResult> {
  if (!productCode.trim()) {
    return { kind: 'none' };
  }

  const { rows } = await ctx.client.query<{ id: string }>(RESOLVE_PROJECT_SQL, [productCode]);

  if (rows.length === 0) {
    return { kind: 'none' };
  }
  if (rows.length === 1) {
    return { kind: 'ok', projectId: rows[0]!.id };
  }
  return { kind: 'ambiguous', projectIds: rows.map((row) => row.id) };
}
