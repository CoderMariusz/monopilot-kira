'use server';

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  BOM_CREATE_PERMISSION,
  BomVersionRefInput,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
} from './shared';

export type DeleteBomVersionResult =
  | { ok: true; data: { id: string; productId: string; version: number } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'not_draft'
        | 'snapshot_referenced'
        | 'only_version'
        | 'persistence_failed';
      message?: string;
      snapshotCount?: number;
    };

type BomHeaderDeleteRow = {
  id: string;
  product_id: string;
  version: number;
  status: string;
  yield_pct: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  notes: string | null;
};

export async function deleteBomVersion(rawInput: unknown): Promise<DeleteBomVersionResult> {
  const parsed = BomVersionRefInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<DeleteBomVersionResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows: headerRows } = await c.query<BomHeaderDeleteRow>(
        `select bh.id, i.item_code as product_id, bh.version, bh.status, bh.yield_pct::text as yield_pct,
                effective_from, effective_to, notes
           from public.bom_headers bh
           join public.items i on i.id = bh.item_id
          where bh.org_id = app.current_org_id()
            and bh.item_id = (
              select id
                from public.items
               where org_id = app.current_org_id()
                 and item_code = $1
            )
            and bh.version = $2`,
        [input.productId, input.version],
      );
      const header = headerRows[0];
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status !== 'draft') {
        return { ok: false, error: 'not_draft', message: 'Only draft BOM versions can be deleted' };
      }

      const [{ rows: countRows }, { rows: snapshotRows }] = await Promise.all([
        c.query<{ version_count: string | number }>(
          `select count(*)::int as version_count
             from public.bom_headers
            where org_id = app.current_org_id()
              and item_id = (
                select id
                  from public.items
                 where org_id = app.current_org_id()
                   and item_code = $1
              )`,
          [input.productId],
        ),
        c.query<{ snapshot_count: string | number }>(
          `select count(*)::int as snapshot_count
             from public.bom_snapshots
            where org_id = app.current_org_id()
              and bom_header_id = $1::uuid`,
          [header.id],
        ),
      ]);

      const versionCount = Number(countRows[0]?.version_count ?? 0);
      if (versionCount <= 1) {
        return { ok: false, error: 'only_version', message: 'Cannot delete the only BOM version' };
      }

      const snapshotCount = Number(snapshotRows[0]?.snapshot_count ?? 0);
      if (snapshotCount > 0) {
        return {
          ok: false,
          error: 'snapshot_referenced',
          message: 'Cannot delete a BOM version referenced by snapshots',
          snapshotCount,
        };
      }

      const beforeState = {
        id: header.id,
        productId: header.product_id,
        version: Number(header.version),
        status: header.status,
        yieldPct: String(header.yield_pct),
        effectiveFrom: toIso(header.effective_from),
        effectiveTo: toIso(header.effective_to),
        notes: header.notes,
      };

      const { rowCount } = await c.query(
        `delete from public.bom_headers
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'draft'`,
        [header.id],
      );
      if (rowCount !== 1) return { ok: false, error: 'persistence_failed' };

      await c.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values
           ($1::uuid, $2::uuid, 'user', 'bom.version_deleted', 'bom_header', $3,
            $4::jsonb, null, $5::uuid, 'standard')`,
        [orgId, userId, header.id, JSON.stringify(beforeState), randomUUID()],
      );

      safeRevalidatePath('/technical/bom');
      safeRevalidatePath(`/technical/bom/${encodeURIComponent(input.productId)}`);
      safeRevalidatePath(`/technical/bom/${encodeURIComponent(input.productId)}/history`);

      return {
        ok: true,
        data: { id: header.id, productId: input.productId, version: input.version },
      };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23503') {
      return { ok: false, error: 'snapshot_referenced', message: 'BOM version is still referenced' };
    }
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/bom] deleteBomVersion persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

function toIso(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
