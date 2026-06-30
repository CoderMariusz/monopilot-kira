/** Minimal pg-client surface (matches the BOM-snapshot service `QueryClient`). */
export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/**
 * The org-context handed to every production service. Mirrors the BOM-snapshot
 * `OrgActionContext` so the snapshot service can be called with the SAME ctx.
 */
export type ProductionContext = { userId: string; orgId: string; siteId?: string | null; client: QueryClient };
