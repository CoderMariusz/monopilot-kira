'use server';

import { revalidatePath } from 'next/cache';

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
  marker: 'ORG-CONFIG';
  created_at?: string;
};

type Input = { operationName: string; processSuffix: string; description: string | null; operationSeq: number; industryCode: IndustryCode; isActive: boolean };

export type CreateManufacturingOperationResult =
  | { ok: true; data: ManufacturingOperation }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'duplicate_operation_name' | 'duplicate_process_suffix' | 'already_exists' | 'persistence_failed'; message?: string };

export async function createManufacturingOperation(rawInput: unknown): Promise<CreateManufacturingOperationResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'manufacturing_operations.create'))) return { ok: false, error: 'forbidden' };
      const duplicate = await findDuplicate(ctx.client, input);
      if (duplicate === 'name') return { ok: false, error: 'duplicate_operation_name' };
      if (duplicate === 'suffix') return { ok: false, error: 'duplicate_process_suffix' };

      const { rows } = await ctx.client.query<ManufacturingOperation>(
        `insert into "Reference"."ManufacturingOperations"
           (org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active, marker)
         values ($1::uuid, $2, $3, $4, $5::integer, $6, $7::boolean, 'ORG-CONFIG')
         returning id, org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active, marker, created_at`,
        [ctx.orgId, input.operationName, input.processSuffix, input.description, input.operationSeq, input.industryCode, input.isActive],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'already_exists' };

      await writeAuditLog(ctx.client, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        action: 'manufacturing_operations.create',
        resourceId: row.id,
        afterState: {
          operationName: row.operation_name,
          processSuffix: row.process_suffix,
          operationSeq: row.operation_seq,
          industryCode: row.industry_code,
          isActive: row.is_active,
        },
      });
      await writeOutbox(ctx.client, {
        orgId: ctx.orgId,
        eventType: 'manufacturing_operations.created',
        aggregateId: ctx.orgId,
        payload: { id: row.id, operationName: row.operation_name, processSuffix: row.process_suffix, industryCode: row.industry_code },
      });

      revalidatePath('/settings/reference/manufacturing-operations');
      return { ok: true, data: row };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

async function findDuplicate(client: QueryClient, input: Input): Promise<'name' | 'suffix' | null> {
  const { rows } = await client.query<{ operation_name: string; process_suffix: string; industry_code: string }>(
    `select operation_name, process_suffix, industry_code
       from "Reference"."ManufacturingOperations" as manufacturing_operations
      where org_id = app.current_org_id()
        and marker in ('ORG-CONFIG', 'APEX-CONFIG')
        and (
          operation_name = $1
          or (industry_code = $2 and process_suffix = $3)
        )
      limit 1`,
    [input.operationName, input.industryCode, input.processSuffix],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.operation_name === input.operationName) return 'name';
  return 'suffix';
}

function parseInput(raw: unknown): Input | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as { operationName?: unknown; processSuffix?: unknown; description?: unknown; operationSeq?: unknown; industryCode?: unknown; isActive?: unknown };
  const operationName = normalizeName(c.operationName);
  const processSuffix = normalizeSuffix(c.processSuffix);
  const description = normalizeDescription(c.description);
  const operationSeq = normalizeSeq(c.operationSeq);
  const industryCode = normalizeIndustry(c.industryCode);
  if (!operationName || !processSuffix || description === undefined || operationSeq === null || !industryCode || typeof c.isActive !== 'boolean') return null;
  return { operationName, processSuffix, description, operationSeq, industryCode, isActive: c.isActive };
}

function normalizeName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[A-Za-z0-9 ]{1,50}$/.test(s) ? s : null;
}

function normalizeSuffix(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[A-Z0-9]{2,4}$/.test(s) ? s : null;
}

function normalizeDescription(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
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

async function writeOutbox(
  client: QueryClient,
  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'manufacturing_operations', $3::uuid, $4::jsonb, 'settings-manufacturing-ops-v1')`,
    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload)],
  );
}
