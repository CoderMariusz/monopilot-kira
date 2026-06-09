'use server';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgContext = { userId: string; orgId: string; client: QueryClient };
type WithOrgContext = <T>(action: (ctx: OrgContext) => Promise<T>) => Promise<T>;

type ManufacturingOperation = {
  id: string;
  org_id: string;
  operation_name: string;
  process_suffix: string;
  description: string | null;
  operation_seq: number;
  industry_code: 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';
  is_active: boolean;
  marker: 'ORG-CONFIG' | 'APEX-CONFIG';
  created_at?: string;
};

type ListInput = { industryCode?: ManufacturingOperation['industry_code']; includeInactive: boolean };

type ListManufacturingOperationsResult =
  | { ok: true; data: ManufacturingOperation[] }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export async function listManufacturingOperations(rawInput: unknown = {}): Promise<ListManufacturingOperationsResult> {
  const input = parseListInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'manufacturing_operations.view'))) return { ok: false, error: 'forbidden' };
      const activeSql = input.includeInactive ? '' : 'and is_active = true';
      const { rows } = await ctx.client.query<ManufacturingOperation>(
        `select id, org_id, operation_name, process_suffix, description, operation_seq,
                industry_code, is_active, marker, created_at
           from "Reference"."ManufacturingOperations" as manufacturing_operations
          where org_id = app.current_org_id()
            and marker in ('ORG-CONFIG', 'APEX-CONFIG')
            and ($1::text is null or industry_code = $1)
            ${activeSql}
          order by operation_seq asc, operation_name asc`,
        [input.industryCode ?? null],
      );
      return { ok: true, data: rows };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseListInput(raw: unknown): ListInput | null {
  if (raw === undefined || raw === null) return { includeInactive: false };
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as { industryCode?: unknown; includeInactive?: unknown };
  const industryCode = candidate.industryCode === undefined ? undefined : normalizeIndustry(candidate.industryCode);
  if (candidate.industryCode !== undefined && !industryCode) return null;
  if (industryCode) return { industryCode, includeInactive: candidate.includeInactive === true };
  return { includeInactive: candidate.includeInactive === true };
}

function normalizeIndustry(value: unknown): ManufacturingOperation['industry_code'] | null {
  return typeof value === 'string' && ['bakery', 'pharma', 'fmcg', 'generic', 'custom'].includes(value)
    ? (value as ManufacturingOperation['industry_code'])
    : null;
}

async function runWithOrgContext<T>(action: (ctx: OrgContext) => Promise<T>): Promise<T> {
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

async function hasPermission(ctx: OrgContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}
