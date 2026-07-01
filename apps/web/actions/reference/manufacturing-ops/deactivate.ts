'use server';

import { revalidatePath } from 'next/cache';

import { hasPermission } from '../../../lib/auth/has-permission';
import { writeManufacturingOperationsOutbox } from './_shared/outbox';

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
  operation_seq?: number;
  industry_code: string;
  is_active: boolean;
  marker: 'ORG-CONFIG' | 'APEX-CONFIG';
};

type WarningCode = 'OPERATION_REFERENCED' | 'DEACTIVATE_WARNING';

type Warning = {
  code: WarningCode;
  message: string;
  activeFaCount?: number;
  templateCount?: number;
  referencedCount?: number;
};

export type DeactivateManufacturingOperationResult =
  | { ok: true; data: ManufacturingOperation; warning: Warning }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'CONFIRMATION_REQUIRED' | 'persistence_failed'; warning?: Warning };

export async function deactivateManufacturingOperation(rawInput: unknown): Promise<DeactivateManufacturingOperationResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'manufacturing_operations.delete'))) return { ok: false, error: 'forbidden' };
      const existing = await getExisting(ctx.client, input.id);
      if (!existing) return { ok: false, error: 'not_found' };

      const usage = await referenceUsage(ctx.client, ctx.orgId, existing.operation_name);
      const referencedCount = usage.activeFaCount + usage.templateCount;
      const isReferenced = referencedCount > 0;
      const warning: Warning = isReferenced
        ? {
            code: 'OPERATION_REFERENCED',
            message: `Operation "${existing.operation_name}" is referenced by ${usage.activeFaCount} active FAs and ${usage.templateCount} templates. Deactivating will prevent new FA assignments; existing FAs continue to function.`,
            activeFaCount: usage.activeFaCount,
            templateCount: usage.templateCount,
            referencedCount,
          }
        : {
            code: 'DEACTIVATE_WARNING',
            message: 'This operation will no longer be available for new FA assignments. Existing FAs using this operation will continue to function.',
          };

      const confirmed = isReferenced ? input.confirmReferenced : input.confirmDeactivateWarning;
      if (!confirmed) return { ok: false, error: 'CONFIRMATION_REQUIRED', warning };

      const { rows, rowCount } = await ctx.client.query<ManufacturingOperation>(
        `update "Reference"."ManufacturingOperations" as manufacturing_operations
            set is_active = false,
                description = coalesce(description, 'inactive')
          where org_id = app.current_org_id()
            and id = $1
            and marker in ('ORG-CONFIG', 'APEX-CONFIG')
            and is_active = true
          returning id, org_id, operation_name, process_suffix, description, industry_code, is_active, marker`,
        [input.id],
      );
      const row = rows[0];
      if ((rowCount ?? rows.length) < 1 || !row) return { ok: false, error: 'not_found' };

      await writeAuditLog(ctx.client, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        action: 'manufacturing_operations.deactivate',
        resourceId: row.id,
        beforeState: { is_active: true, operation_name: existing.operation_name },
        afterState: { is_active: false, warning },
      });
      await writeManufacturingOperationsOutbox(ctx.client, {
        orgId: ctx.orgId,
        eventType: 'manufacturing_operations.deactivated',
        aggregateId: ctx.orgId,
        payload: {
          id: row.id,
          operationName: row.operation_name,
          referencedCount,
          warningCode: warning.code,
        },
      });

      revalidatePath('/settings/reference/manufacturing-operations');
      return { ok: true, data: row, warning };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseInput(raw: unknown): { id: string; confirmDeactivateWarning: boolean; confirmReferenced: boolean } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as { id?: unknown; confirmDeactivateWarning?: unknown; confirmReferenced?: unknown };
  if (typeof c.id !== 'string' || c.id.trim().length === 0) return null;
  return {
    id: c.id.trim(),
    confirmDeactivateWarning: c.confirmDeactivateWarning === true,
    confirmReferenced: c.confirmReferenced === true,
  };
}

async function getExisting(client: QueryClient, id: string): Promise<ManufacturingOperation | null> {
  const { rows } = await client.query<ManufacturingOperation>(
    `select id, org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active, marker
       from "Reference"."ManufacturingOperations" as manufacturing_operations
      where org_id = app.current_org_id()
        and id = $1
        and marker in ('ORG-CONFIG', 'APEX-CONFIG')
      order by operation_seq asc`,
    [id],
  );
  return rows.find((row) => row.id === id) ?? null;
}

async function referenceUsage(
  client: QueryClient,
  orgId: string,
  operationName: string,
): Promise<{ activeFaCount: number; templateCount: number }> {
  const { rows } = await client.query<{ active_fa_count?: number | string | null; template_count?: number | string | null }>(
    `select active_fa_count, template_count
       from app.count_manufacturing_operation_usage($1::uuid, $2)`,
    [orgId, operationName],
  );
  const row = rows[0];
  return {
    activeFaCount: Number(row?.active_fa_count ?? 0),
    templateCount: Number(row?.template_count ?? 0),
  };
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
  params: { orgId: string; actorUserId: string; action: string; resourceId: string; beforeState: unknown; afterState: unknown },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'manufacturing_operations', $4, $5::jsonb, $6::jsonb, 'standard')`,
    [
      params.orgId,
      params.actorUserId,
      params.action,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
    ],
  );
}
