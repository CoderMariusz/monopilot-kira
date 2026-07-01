'use server';

import { revalidatePath } from 'next/cache';

import { hasPermission } from '../../../lib/auth/has-permission';

type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> };
type OrgContext = { userId: string; orgId: string; client: QueryClient };
type WithOrgContext = <T>(action: (ctx: OrgContext) => Promise<T>) => Promise<T>;
type ManufacturingOperation = { id: string; org_id: string; operation_name: string; process_suffix: string; description: string | null; operation_seq: number; industry_code: string; is_active: boolean; marker: 'ORG-CONFIG' };

export type ReorderManufacturingOperationsResult =
  | { ok: true; data: ManufacturingOperation[] }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export async function reorderManufacturingOperations(rawInput: unknown): Promise<ReorderManufacturingOperationsResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'manufacturing_operations.reorder'))) return { ok: false, error: 'forbidden' };
      for (const item of input.items) {
        await ctx.client.query(
          `update "Reference"."ManufacturingOperations" as manufacturing_operations
              set operation_seq = $2::integer
            where org_id = app.current_org_id()
              and id = $1
              and marker = 'ORG-CONFIG'`,
          [item.id, item.operationSeq],
        );
      }
      const { rows } = await ctx.client.query<ManufacturingOperation>(
        `select id, org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active, marker
           from "Reference"."ManufacturingOperations" as manufacturing_operations
          where org_id = app.current_org_id()
            and marker = 'ORG-CONFIG'
          order by operation_seq asc, operation_name asc`,
        [],
      );
      revalidatePath('/settings/reference/manufacturing-operations');
      return { ok: true, data: rows };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseInput(raw: unknown): { items: Array<{ id: string; operationSeq: number }> } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const parsed: Array<{ id: string; operationSeq: number }> = [];
  const seqs = new Set<number>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const c = item as { id?: unknown; operationSeq?: unknown };
    const seq = Number(c.operationSeq);
    if (typeof c.id !== 'string' || c.id.trim().length === 0 || !Number.isInteger(seq) || seq < 1 || seq > 99 || seqs.has(seq)) return null;
    seqs.add(seq);
    parsed.push({ id: c.id.trim(), operationSeq: seq });
  }
  if (!seqs.has(1)) return null;
  return { items: parsed };
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
