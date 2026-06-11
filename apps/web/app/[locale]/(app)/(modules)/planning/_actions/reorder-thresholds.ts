'use server';

/**
 * CL2 slice 2 — reorder_thresholds CRUD (mig 178 §4: per-item reorder config
 * backing the Material Demand dashboard, T-045).
 *
 * DDL grain honoured exactly: one row per (org_id, item_id) — upsert via the
 * reorder_thresholds_org_item_unique key. min_qty / reorder_qty are
 * NUMERIC(18,6) >= 0 and travel as decimal strings end-to-end (never JS
 * floats). preferred_supplier_id is a SOFT FK ("service-layer-validated" per
 * the mig-178 comment) — we validate it against public.suppliers inside the
 * same org context before writing.
 *
 * RBAC: reads gate on `scheduler.run.read` (the M2 planning read gate);
 * writes gate on `npd.planning.write` via procurement-shared
 * hasPlanningWritePermission — the exact permission family PO/TO creates use.
 *
 * All statements run inside withOrgContext as app_user (RLS:
 * org_id = app.current_org_id()); no service-role bypass.
 */
import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  hasPlanningWritePermission,
  isPgError,
  toIso,
  writeProcurementAudit,
  uuidSchema,
  type OrgActionContext,
  type QueryClient,
} from './procurement-shared';
import { listSuppliers } from '../suppliers/_actions/actions';
import {
  searchItems,
  type ItemPickerOption,
  type SearchItemsInput,
} from '../../../../../(npd)/fa/actions/search-items';

/** Same read gate as runMrp / the planning dashboard. */
const PLANNING_READ_PERMISSION = 'scheduler.run.read';

/** MRP-planned item types — the thresholds picker offers exactly these. */
const THRESHOLD_ITEM_TYPES = ['rm', 'ingredient', 'intermediate', 'packaging'] as const;

export type ReorderThresholdRow = {
  id: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uomBase: string | null;
  /** Decimal strings, mig-178 NUMERIC(18,6). */
  minQty: string;
  reorderQty: string;
  preferredSupplierId: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  /** suppliers.lead_time_days (mig 261) when a preferred supplier is set. */
  leadTimeDays: number | null;
  updatedAt: string;
};

export type ThresholdError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'persistence_failed';

export type ThresholdResult<T> = { ok: true; data: T } | { ok: false; error: ThresholdError };

export type ThresholdSupplierOption = {
  id: string;
  code: string;
  name: string;
  leadTimeDays: number;
};

/** Non-negative quantity, up to 6 dp (mig-178 NUMERIC(18,6) scale). */
const nonNegQtySchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,6})?$/);

const UpsertThresholdInput = z.object({
  itemId: uuidSchema,
  minQty: nonNegQtySchema,
  reorderQty: nonNegQtySchema,
  preferredSupplierId: uuidSchema.nullable().optional(),
});

export type UpsertThresholdInputType = z.input<typeof UpsertThresholdInput>;

async function hasPlanningReadPermission(ctx: OrgActionContext): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, PLANNING_READ_PERMISSION],
  );
  return rows.length > 0;
}

type ThresholdSqlRow = {
  id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  uom_base: string | null;
  min_qty: string;
  reorder_qty: string;
  preferred_supplier_id: string | null;
  supplier_code: string | null;
  supplier_name: string | null;
  lead_time_days: number | null;
  updated_at: string | Date;
};

function mapThreshold(row: ThresholdSqlRow): ReorderThresholdRow {
  return {
    id: row.id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    uomBase: row.uom_base,
    minQty: String(row.min_qty),
    reorderQty: String(row.reorder_qty),
    preferredSupplierId: row.preferred_supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    leadTimeDays: row.lead_time_days === null ? null : Number(row.lead_time_days),
    updatedAt: toIso(row.updated_at),
  };
}

const THRESHOLD_SELECT = `select rt.id, rt.item_id, i.item_code, i.name as item_name, i.uom_base,
        rt.min_qty::text as min_qty, rt.reorder_qty::text as reorder_qty,
        rt.preferred_supplier_id, s.code as supplier_code, s.name as supplier_name,
        s.lead_time_days, rt.updated_at
   from public.reorder_thresholds rt
   left join public.items i
     on i.org_id = app.current_org_id() and i.id = rt.item_id
   left join public.suppliers s
     on s.org_id = app.current_org_id() and s.id = rt.preferred_supplier_id`;

/** All configured thresholds for the org, item-code sorted. */
export async function listReorderThresholds(): Promise<ThresholdResult<ReorderThresholdRow[]>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningReadPermission(ctx))) {
        return { ok: false as const, error: 'forbidden' as const };
      }
      const { rows } = await ctx.client.query<ThresholdSqlRow>(
        `${THRESHOLD_SELECT}
          where rt.org_id = app.current_org_id()
          order by i.item_code asc nulls last, rt.created_at asc`,
      );
      return { ok: true as const, data: rows.map(mapThreshold) };
    });
  } catch (err) {
    console.error('[planning/reorder-thresholds] listReorderThresholds failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

/**
 * Create-or-update the threshold of one item (mig-178 unique (org_id, item_id)).
 * Validates the item (MRP-planned types only) and the soft supplier FK inside
 * the org context; quantities stay decimal strings into ::numeric binds.
 */
export async function upsertReorderThreshold(
  rawInput: unknown,
): Promise<ThresholdResult<ReorderThresholdRow>> {
  const parsed = UpsertThresholdInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      // Item must exist in the org and be an MRP-planned type.
      const item = await ctx.client.query<{ id: string }>(
        `select id from public.items
          where org_id = app.current_org_id()
            and id = $1::uuid
            and item_type = any($2::text[])
          limit 1`,
        [input.itemId, [...THRESHOLD_ITEM_TYPES]],
      );
      if (item.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

      // Soft FK (mig-178 comment: "service-layer-validated"): the preferred
      // supplier must be a real org supplier when provided.
      const supplierId = input.preferredSupplierId ?? null;
      if (supplierId) {
        const supplier = await ctx.client.query<{ id: string }>(
          `select id from public.suppliers
            where org_id = app.current_org_id() and id = $1::uuid
            limit 1`,
          [supplierId],
        );
        if (supplier.rows.length === 0) return { ok: false as const, error: 'not_found' as const };
      }

      const { rows } = await ctx.client.query<{ id: string }>(
        `insert into public.reorder_thresholds
           (org_id, item_id, min_qty, reorder_qty, preferred_supplier_id, updated_by)
         values
           (app.current_org_id(), $1::uuid, $2::numeric, $3::numeric, $4::uuid, $5::uuid)
         on conflict on constraint reorder_thresholds_org_item_unique
         do update set min_qty = excluded.min_qty,
                       reorder_qty = excluded.reorder_qty,
                       preferred_supplier_id = excluded.preferred_supplier_id,
                       updated_by = excluded.updated_by
         returning id`,
        [input.itemId, input.minQty, input.reorderQty, supplierId, userId],
      );
      const upserted = rows[0];
      if (!upserted) return { ok: false as const, error: 'persistence_failed' as const };

      await writeProcurementAudit(ctx, {
        action: 'planning.reorder_threshold.upserted',
        resourceType: 'reorder_threshold',
        resourceId: upserted.id,
        afterState: {
          itemId: input.itemId,
          minQty: input.minQty,
          reorderQty: input.reorderQty,
          preferredSupplierId: supplierId,
        },
      });

      const detail = await ctx.client.query<ThresholdSqlRow>(
        `${THRESHOLD_SELECT}
          where rt.org_id = app.current_org_id() and rt.id = $1::uuid
          limit 1`,
        [upserted.id],
      );
      const row = detail.rows[0];
      if (!row) return { ok: false as const, error: 'persistence_failed' as const };
      return { ok: true as const, data: mapThreshold(row) };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'not_found' };
    console.error('[planning/reorder-thresholds] upsertReorderThreshold failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

/** Remove one threshold (write-gated; audited). */
export async function deleteReorderThreshold(id: string): Promise<ThresholdResult<{ id: string }>> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) {
        return { ok: false as const, error: 'forbidden' as const };
      }
      const { rows } = await ctx.client.query<{ id: string; item_id: string }>(
        `delete from public.reorder_thresholds
          where org_id = app.current_org_id() and id = $1::uuid
          returning id, item_id`,
        [parsed.data],
      );
      const deleted = rows[0];
      if (!deleted) return { ok: false as const, error: 'not_found' as const };
      await writeProcurementAudit(ctx, {
        action: 'planning.reorder_threshold.deleted',
        resourceType: 'reorder_threshold',
        resourceId: deleted.id,
        beforeState: { itemId: deleted.item_id },
      });
      return { ok: true as const, data: { id: deleted.id } };
    });
  } catch (err) {
    console.error('[planning/reorder-thresholds] deleteReorderThreshold failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

/** Item picker seam — the org items master restricted to MRP-planned types. */
export async function searchThresholdItems(input: SearchItemsInput = {}): Promise<ItemPickerOption[]> {
  try {
    return await searchItems({ ...input, itemTypes: [...THRESHOLD_ITEM_TYPES] });
  } catch {
    return [];
  }
}

/** Supplier select seam — active suppliers with their lead times (mig 261). */
export async function listThresholdSuppliers(): Promise<ThresholdSupplierOption[]> {
  const result = await listSuppliers({ status: 'active', limit: 200 });
  if (!result.ok) return [];
  return result.data.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    leadTimeDays: s.leadTimeDays,
  }));
}
