'use server';

import { revalidatePath } from 'next/cache';

import { writeManufacturingOperationsOutbox } from './_shared/outbox';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};
type OrgContext = { userId: string; orgId: string; client: QueryClient };
type WithOrgContext = <T>(action: (ctx: OrgContext) => Promise<T>) => Promise<T>;
type IndustryCode = 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';

type ManufacturingOperation = {
  id: string;
  org_id: string;
  operation_name: string;
  process_suffix: string;
  description: string | null;
  operation_seq: number;
  industry_code: IndustryCode;
  is_active: boolean;
  marker: 'ORG-CONFIG' | 'APEX-CONFIG';
  created_at?: string;
};

type Input = { id: string; description?: string | null; operationSeq?: number; industryCode?: IndustryCode; isActive?: boolean };

export type UpdateManufacturingOperationResult =
  | { ok: true; data: ManufacturingOperation }
  | { ok: false; error: 'invalid_input' | 'immutable_field' | 'forbidden' | 'not_found' | 'persistence_failed' };

export async function updateManufacturingOperation(rawInput: unknown): Promise<UpdateManufacturingOperationResult> {
  const parsed = parseInput(rawInput);
  if (parsed === 'immutable_field') return { ok: false, error: 'immutable_field' };
  if (!parsed) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'manufacturing_operations.edit'))) return { ok: false, error: 'forbidden' };
      const { rows, rowCount } = await ctx.client.query<ManufacturingOperation>(
        `update "Reference"."ManufacturingOperations" as manufacturing_operations
            set description = coalesce($2, description),
                industry_code = coalesce($3, industry_code),
                is_active = coalesce($4, is_active),
                operation_seq = coalesce($5::integer, operation_seq)
          where org_id = app.current_org_id()
            and id = $1
            and marker in ('ORG-CONFIG', 'APEX-CONFIG')
          returning id, org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active, marker, created_at`,
        [
          parsed.id,
          parsed.description ?? null,
          parsed.industryCode ?? null,
          parsed.isActive ?? null,
          parsed.operationSeq ?? null,
        ],
      );
      const row = rows[0];
      if ((rowCount ?? rows.length) < 1 || !row) return { ok: false, error: 'not_found' };

      await writeAuditLog(ctx.client, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        action: 'manufacturing_operations.update',
        resourceId: row.id,
        afterState: {
          description: row.description,
          operationSeq: row.operation_seq,
          industryCode: row.industry_code,
          isActive: row.is_active,
        },
      });
      await writeManufacturingOperationsOutbox(ctx.client, {
        orgId: ctx.orgId,
        eventType: 'manufacturing_operations.updated',
        aggregateId: ctx.orgId,
        payload: { id: row.id, industryCode: row.industry_code, isActive: row.is_active, operationSeq: row.operation_seq },
      });

      revalidatePath('/settings/reference/manufacturing-operations');
      return { ok: true, data: row };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseInput(raw: unknown): Input | 'immutable_field' | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as { id?: unknown; operationName?: unknown; processSuffix?: unknown; description?: unknown; operationSeq?: unknown; industryCode?: unknown; isActive?: unknown };
  if (c.operationName !== undefined || c.processSuffix !== undefined) return 'immutable_field';
  if (typeof c.id !== 'string' || c.id.trim().length === 0) return null;
  const out: Input = { id: c.id.trim() };
  if (c.description !== undefined) {
    const d = normalizeDescription(c.description);
    if (d === undefined) return null;
    out.description = d;
  }
  if (c.operationSeq !== undefined) {
    const n = normalizeSeq(c.operationSeq);
    if (n === null) return null;
    out.operationSeq = n;
  }
  if (c.industryCode !== undefined) {
    const i = normalizeIndustry(c.industryCode);
    if (!i) return null;
    out.industryCode = i;
  }
  if (c.isActive !== undefined) {
    if (typeof c.isActive !== 'boolean') return null;
    out.isActive = c.isActive;
  }
  return out;
}

function normalizeDescription(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length <= 200 ? s : undefined;
}

function normalizeSeq(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

function normalizeIndustry(v: unknown): IndustryCode | null {
  return typeof v === 'string' && ['bakery', 'pharma', 'fmcg', 'generic', 'custom'].includes(v) ? (v as IndustryCode) : null;
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

async function writeAuditLog(
  client: QueryClient,
  params: { orgId: string; actorUserId: string; action: string; resourceId: string; afterState: unknown },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'manufacturing_operations', $4, null, $5::jsonb, 'standard')`,
    [params.orgId, params.actorUserId, params.action, params.resourceId, JSON.stringify(params.afterState)],
  );
}
