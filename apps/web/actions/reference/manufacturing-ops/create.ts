'use server';

import { revalidateLocalized } from '../../../lib/i18n/revalidate-localized';

import { hasPermission } from '../../../lib/auth/has-permission';
import type { CreateManufacturingOperationResult, ManufacturingOperation } from './create-types';
import { writeManufacturingOperationsOutbox } from './_shared/outbox';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};
type OrgContext = { userId: string; orgId: string; client: QueryClient };
type WithOrgContext = <T>(action: (ctx: OrgContext) => Promise<T>) => Promise<T>;
type IndustryCode = 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';

type Input = { operationName: string; processSuffix: string; description: string | null; operationSeq: number; industryCode: IndustryCode; isActive: boolean };

function mapPersistenceError(error: unknown): CreateManufacturingOperationResult {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[manufacturing-ops/create] persistence_failed', { message });

  if (message.includes('manufacturing_operations_industry_code_check')) {
    return { ok: false, error: 'invalid_input' };
  }
  if (message.includes('manufacturing_operations_org_operation_name_unique')) {
    return { ok: false, error: 'duplicate_operation_name' };
  }
  if (
    message.includes('manufacturing_operations_org_process_suffix_unique') ||
    message.includes('mfg_ops_org_industry_suffix_unique')
  ) {
    return { ok: false, error: 'duplicate_process_suffix' };
  }
  if (message.includes('no partition of relation') && message.includes('audit_log')) {
    return { ok: false, error: 'persistence_failed' };
  }

  return { ok: false, error: 'persistence_failed' };
}

function safeRevalidateManufacturingOperationsRoute(): void {
  try {
    revalidateLocalized('/settings/reference/manufacturing-operations');
  } catch {
    /* no request store in action unit tests */
  }
}

function serializeCreatedAt(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function serializeManufacturingOperation(row: ManufacturingOperation): ManufacturingOperation {
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    operation_name: String(row.operation_name),
    process_suffix: String(row.process_suffix),
    description: row.description === null || row.description === undefined ? null : String(row.description),
    operation_seq: Number(row.operation_seq),
    industry_code: row.industry_code,
    is_active: Boolean(row.is_active),
    marker: row.marker ?? 'ORG-CONFIG',
    ...(row.created_at == null ? {} : { created_at: serializeCreatedAt(row.created_at) }),
  };
}

export async function createManufacturingOperation(rawInput: unknown): Promise<CreateManufacturingOperationResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    const result = await runWithOrgContext<CreateManufacturingOperationResult>(async (ctx): Promise<CreateManufacturingOperationResult> => {
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
      await writeManufacturingOperationsOutbox(ctx.client, {
        orgId: ctx.orgId,
        eventType: 'manufacturing_operations.created',
        aggregateId: ctx.orgId,
        payload: { id: row.id, operationName: row.operation_name, processSuffix: row.process_suffix, industryCode: row.industry_code },
      });

      return { ok: true, data: serializeManufacturingOperation(row) };
    });

    if (result.ok) {
      safeRevalidateManufacturingOperationsRoute();
    }
    return result;
  } catch (error) {
    return mapPersistenceError(error);
  }
}

async function findDuplicate(client: QueryClient, input: Input): Promise<'name' | 'suffix' | null> {
  const { rows } = await client.query<{ operation_name: string; process_suffix: string }>(
    `select operation_name, process_suffix
       from "Reference"."ManufacturingOperations" as manufacturing_operations
      where org_id = app.current_org_id()
        and marker in ('ORG-CONFIG', 'APEX-CONFIG')
        and (
          operation_name = $1
          or process_suffix = $2
        )
      limit 1`,
    [input.operationName, input.processSuffix],
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
  // Seed rows include Process_A; routings and audit markers may use hyphens.
  return /^[A-Za-z0-9 _-]{1,50}$/.test(s) ? s : null;
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
