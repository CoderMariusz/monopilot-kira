type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type ProductionLineResolveRow = {
  id: string;
  code: string;
  name: string;
  site_id: string | null;
  status: string;
};

export function normalizeLineCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Canonical production-line lookup by (org, site, code). Callers must pass site_id
 * whenever the business context is site-scoped — never resolve by code alone.
 */
export async function resolveProductionLineByCodeAndSite(
  client: QueryClient,
  input: { code: string; siteId: string | null },
): Promise<ProductionLineResolveRow | null> {
  return findProductionLineByCodeAndSite(client, input);
}

export async function findProductionLineByCodeAndSite(
  client: QueryClient,
  input: { code: string; siteId: string | null; excludeId?: string | null },
): Promise<ProductionLineResolveRow | null> {
  const code = normalizeLineCode(input.code);
  const excludeId = input.excludeId ?? null;

  if (input.siteId) {
    const { rows } = await client.query<ProductionLineResolveRow>(
      `select id::text, code, name, site_id::text, status
         from public.production_lines
        where org_id = app.current_org_id()
          and site_id = $1::uuid
          and upper(code) = $2
          and ($3::uuid is null or id <> $3::uuid)
        limit 1`,
      [input.siteId, code, excludeId],
    );
    return rows[0] ?? null;
  }

  const { rows } = await client.query<ProductionLineResolveRow>(
    `select id::text, code, name, site_id::text, status
       from public.production_lines
      where org_id = app.current_org_id()
        and site_id is null
        and upper(code) = $1
        and ($2::uuid is null or id <> $2::uuid)
      limit 1`,
    [code, excludeId],
  );
  return rows[0] ?? null;
}
