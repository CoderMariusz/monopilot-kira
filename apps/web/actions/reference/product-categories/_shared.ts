type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgContext = { userId: string; orgId: string; client: QueryClient };
type WithOrgContext = <T>(action: (ctx: OrgContext) => Promise<T>) => Promise<T>;

export type ProductCategory = {
  id: string;
  org_id: string;
  code: string;
  label: string;
  is_active: boolean;
  display_order: number;
};

export async function runWithOrgContext<T>(action: (ctx: OrgContext) => Promise<T>): Promise<T> {
  try {
    const packagePath = '@monopilot/db/with-org-context';
    const mod = (await import(packagePath)) as { withOrgContext?: WithOrgContext };
    if (typeof mod.withOrgContext === 'function') return mod.withOrgContext(action);
  } catch {
    // Fall through to the web app wrapper when the package subpath is unavailable.
  }
  const webWrapperPath = '../../../lib/auth/with-org-context.js';
  const mod = (await import(webWrapperPath)) as unknown as { withOrgContext: WithOrgContext };
  return mod.withOrgContext(action);
}

export function normalizeCategoryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_]{0,63}$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizeCategoryLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 120 ? trimmed : null;
}

export function normalizeDisplayOrder(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : null;
}

export async function writeProductCategoryAudit(
  client: QueryClient,
  params: { orgId: string; actorUserId: string; action: string; resourceId: string; afterState: unknown },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'product_categories', $4, null, $5::jsonb, 'standard')`,
    [params.orgId, params.actorUserId, params.action, params.resourceId, JSON.stringify(params.afterState)],
  );
}
