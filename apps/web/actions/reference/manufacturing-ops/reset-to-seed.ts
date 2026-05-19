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

type SeedRow = { operationName: string; processSuffix: string; description: string; operationSeq: number; industryCode: IndustryCode };

// Mirrors packages/db/seeds/manufacturing-operations.sql per PRD §8.9.7.
// When the seed file changes, update this table to match.
const SEEDS: Record<Exclude<IndustryCode, 'custom'>, SeedRow[]> = {
  bakery: [
    { operationSeq: 1, operationName: 'Mix', processSuffix: 'MX', description: 'Mixing', industryCode: 'bakery' },
    { operationSeq: 2, operationName: 'Knead', processSuffix: 'KN', description: 'Kneading dough', industryCode: 'bakery' },
    { operationSeq: 3, operationName: 'Proof', processSuffix: 'PR', description: 'Proofing/bulk fermentation', industryCode: 'bakery' },
    { operationSeq: 4, operationName: 'Bake', processSuffix: 'BK', description: 'Baking in oven', industryCode: 'bakery' },
  ],
  pharma: [
    { operationSeq: 1, operationName: 'Synthesis', processSuffix: 'SY', description: 'Chemical synthesis', industryCode: 'pharma' },
    { operationSeq: 2, operationName: 'Separation', processSuffix: 'SE', description: 'Separation/chromatography', industryCode: 'pharma' },
    { operationSeq: 3, operationName: 'Crystallization', processSuffix: 'CZ', description: 'Crystallization', industryCode: 'pharma' },
    { operationSeq: 4, operationName: 'Drying', processSuffix: 'DR', description: 'Drying/lyophilization', industryCode: 'pharma' },
  ],
  fmcg: [
    { operationSeq: 1, operationName: 'Mix', processSuffix: 'MX', description: 'Mixing ingredients', industryCode: 'fmcg' },
    { operationSeq: 2, operationName: 'Fill', processSuffix: 'FL', description: 'Filling containers', industryCode: 'fmcg' },
    { operationSeq: 3, operationName: 'Seal', processSuffix: 'SL', description: 'Sealing/capping', industryCode: 'fmcg' },
    { operationSeq: 4, operationName: 'Label', processSuffix: 'LB', description: 'Labeling packaging', industryCode: 'fmcg' },
  ],
  generic: [
    { operationSeq: 1, operationName: 'Process_A', processSuffix: 'PA', description: 'Generic process 1', industryCode: 'generic' },
    { operationSeq: 2, operationName: 'Process_B', processSuffix: 'PB', description: 'Generic process 2', industryCode: 'generic' },
    { operationSeq: 3, operationName: 'Process_C', processSuffix: 'PC', description: 'Generic process 3', industryCode: 'generic' },
    { operationSeq: 4, operationName: 'Process_D', processSuffix: 'PD', description: 'Generic process 4', industryCode: 'generic' },
  ],
};

export type ResetManufacturingOperationsToSeedResult =
  | { ok: true; data: ManufacturingOperation[] }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'confirmation_required' | 'persistence_failed' };

export async function resetManufacturingOperationsToSeed(rawInput: unknown): Promise<ResetManufacturingOperationsToSeedResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };
  if (!input.confirmReset) return { ok: false, error: 'confirmation_required' };
  const seeds = SEEDS[input.industryCode === 'custom' ? 'generic' : input.industryCode];

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'manufacturing_operations.edit'))) return { ok: false, error: 'forbidden' };

      // Industry-safe delete: scoped to (org_id, industry_code, marker IN
      // ('ORG-CONFIG', 'APEX-CONFIG')) so resetting bakery does not destroy
      // customs in other industries, and Apex-seeded rows can be replaced
      // without violating UNIQUE(org_id, industry_code, process_suffix).
      await ctx.client.query(
        `delete from "Reference"."ManufacturingOperations" as manufacturing_operations
          where org_id = app.current_org_id()
            and industry_code = $1
            and marker in ('ORG-CONFIG', 'APEX-CONFIG')`,
        [seeds[0]?.industryCode ?? input.industryCode],
      );

      const inserted: ManufacturingOperation[] = [];
      for (const seed of seeds) {
        const { rows } = await ctx.client.query<ManufacturingOperation>(
          `insert into "Reference"."ManufacturingOperations"
             (org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active, marker)
           values ($1::uuid, $2, $3, $4, $5::integer, $6, true, 'ORG-CONFIG')
           returning id, org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active, marker, created_at`,
          [ctx.orgId, seed.operationName, seed.processSuffix, seed.description, seed.operationSeq, seed.industryCode],
        );
        const row = rows[0];
        if (!row?.id) return { ok: false, error: 'persistence_failed' };
        inserted.push({
          id: row.id,
          org_id: row.org_id,
          operation_name: row.operation_name,
          process_suffix: row.process_suffix,
          description: row.description,
          operation_seq: row.operation_seq ?? seed.operationSeq,
          industry_code: row.industry_code,
          is_active: true,
          marker: 'ORG-CONFIG',
          created_at: row.created_at,
        });
      }

      await writeAuditLog(ctx.client, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        action: 'manufacturing_operations.reset_to_seed',
        resourceId: input.industryCode,
        afterState: { industryCode: input.industryCode, rowCount: inserted.length, suffixes: inserted.map((row) => row.process_suffix) },
      });
      await writeOutbox(ctx.client, {
        orgId: ctx.orgId,
        eventType: 'manufacturing_operations.reset_to_seed',
        aggregateId: ctx.orgId,
        payload: { industryCode: input.industryCode, rowCount: inserted.length },
      });

      revalidatePath('/settings/reference/manufacturing-operations');
      return { ok: true, data: inserted };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseInput(raw: unknown): { industryCode: IndustryCode; confirmReset: boolean } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as { industryCode?: unknown; confirmReset?: unknown };
  const industryCode = typeof c.industryCode === 'string' && ['bakery', 'pharma', 'fmcg', 'generic', 'custom'].includes(c.industryCode) ? (c.industryCode as IndustryCode) : null;
  if (!industryCode) return null;
  return { industryCode, confirmReset: c.confirmReset === true };
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
