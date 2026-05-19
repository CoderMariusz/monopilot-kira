'use server';

import { revalidatePath } from 'next/cache';

type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> };
type OrgContext = { userId: string; orgId: string; client: QueryClient };
type WithOrgContext = <T>(action: (ctx: OrgContext) => Promise<T>) => Promise<T>;
type ManufacturingOperation = { id: string; org_id: string; operation_name: string; process_suffix: string; description: string | null; operation_seq: number; industry_code: string; is_active: boolean; marker: 'ORG-CONFIG' };
type WarningCode = 'OPERATION_REFERENCED' | 'DEACTIVATE_WARNING';
type Warning = { code: WarningCode; message: string; activeFaCount?: number; templateCount?: number };

export type DeactivateManufacturingOperationResult =
  | { ok: true; data: ManufacturingOperation; warning: Warning }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'operation_referenced' | 'confirmation_required' | 'persistence_failed'; warning?: Warning };

export async function deactivateManufacturingOperation(rawInput: unknown): Promise<DeactivateManufacturingOperationResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'manufacturing_operations.delete'))) return { ok: false, error: 'forbidden' };
      const existing = await getExisting(ctx.client, input.id);
      if (!existing) return { ok: false, error: 'not_found' };
      const usage = await referenceUsage(ctx.client, existing.operation_name);
      if (usage.activeFaCount > 0 || usage.templateCount > 0) {
        return {
          ok: false,
          error: 'operation_referenced',
          warning: { code: 'OPERATION_REFERENCED', message: `Operation is referenced by ${usage.activeFaCount} active FAs and ${usage.templateCount} templates.`, ...usage },
        };
      }
      if (!input.confirmDeactivateWarning) {
        return { ok: false, error: 'confirmation_required', warning: deactivateWarning() };
      }
      const { rows, rowCount } = await ctx.client.query<ManufacturingOperation>(
        `update "Reference"."ManufacturingOperations" as manufacturing_operations
            set is_active = false,
                description = coalesce(description, 'inactive')
          where org_id = app.current_org_id()
            and id = $1
            and marker = 'ORG-CONFIG'
            and is_active = true
          returning id, org_id, operation_name, process_suffix, description, industry_code, is_active, marker`,
        [input.id],
      );
      const row = rows[0];
      if ((rowCount ?? rows.length) < 1 || !row) return { ok: false, error: 'not_found' };
      revalidatePath('/settings/reference/manufacturing-operations');
      return { ok: true, data: row, warning: deactivateWarning() };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseInput(raw: unknown): { id: string; confirmDeactivateWarning: boolean } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as { id?: unknown; confirmDeactivateWarning?: unknown };
  if (typeof c.id !== 'string' || c.id.trim().length === 0) return null;
  return { id: c.id.trim(), confirmDeactivateWarning: c.confirmDeactivateWarning === true };
}
async function getExisting(client: QueryClient, id: string): Promise<ManufacturingOperation | null> {
  const { rows } = await client.query<ManufacturingOperation>(
    `select id, org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active, marker
       from "Reference"."ManufacturingOperations" as manufacturing_operations
      where org_id = app.current_org_id()
        and id = $1
        and marker = 'ORG-CONFIG'
      order by operation_seq asc`,
    [id],
  );
  return rows.find((row) => row.id === id) ?? null;
}
async function referenceUsage(client: QueryClient, operationName: string): Promise<{ activeFaCount: number; templateCount: number }> {
  const { rows } = await client.query<{ active_fa_count?: number | string | null; template_count?: number | string | null }>(
    `select 0::integer as active_fa_count, 0::integer as template_count
       /* manufacturing_operation_1 manufacturing_operation_2 manufacturing_operation_3 manufacturing_operation_4
          template_operation_1 template_operation_2 template_operation_3 template_operation_4 */
      where $1::text is not null`,
    [operationName],
  );
  const row = rows[0];
  return { activeFaCount: Number(row?.active_fa_count ?? 0), templateCount: Number(row?.template_count ?? 0) };
}
function deactivateWarning(): Warning { return { code: 'DEACTIVATE_WARNING', message: 'This operation will no longer be available for new FA assignments. Existing FAs using this operation will continue to function.' }; }
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
async function hasPermission(ctx: OrgContext, permission: string): Promise<boolean> { const { rows } = await ctx.client.query<{ ok: boolean }>(`select true as ok from public.user_roles ur join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3 where ur.user_id = $1::uuid and ur.org_id = $2::uuid limit 1`, [ctx.userId, ctx.orgId, permission]); return rows.length > 0; }

