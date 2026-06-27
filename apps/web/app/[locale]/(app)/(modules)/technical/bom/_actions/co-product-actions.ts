'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  BOM_CREATE_PERMISSION,
  BOM_LINE_EDITABLE_STATUSES,
  type BomLineActionResult,
  type BomStatus,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  writeAudit,
} from './shared';

const AUDIT_BOM_CO_PRODUCT_ADDED = 'bom.co_product_added';
const AUDIT_BOM_CO_PRODUCT_UPDATED = 'bom.co_product_updated';
const AUDIT_BOM_CO_PRODUCT_DELETED = 'bom.co_product_deleted';

const AddBomCoProductInput = z.object({
  bomHeaderId: z.string().uuid(),
  coProductItemId: z.string().uuid(),
  quantity: z.coerce.number().positive().finite(),
  uom: z.string().trim().min(1).max(32),
  allocationPct: z.coerce.number().min(0).max(100),
  isByproduct: z.boolean(),
  expectedYieldPct: z.coerce.number().min(0).max(100).optional(),
});

const UpdateBomCoProductInput = z.object({
  bomHeaderId: z.string().uuid(),
  coProductId: z.string().uuid(),
  quantity: z.coerce.number().positive().finite(),
  uom: z.string().trim().min(1).max(32),
  allocationPct: z.coerce.number().min(0).max(100),
  expectedYieldPct: z.coerce.number().min(0).max(100).optional(),
});

const DeleteBomCoProductInput = z.object({
  bomHeaderId: z.string().uuid(),
  coProductId: z.string().uuid(),
});

type HeaderRow = { id: string; product_id: string | null; status: string };
type CoProductRow = {
  id: string;
  co_product_item_id: string;
  quantity: string;
  uom: string;
  allocation_pct: string;
  is_byproduct: boolean;
  expected_yield_pct: string | null;
};

async function loadHeader(c: QueryClient, bomHeaderId: string): Promise<HeaderRow | null> {
  const { rows } = await c.query<HeaderRow>(
    `select bh.id, i.item_code as product_id, bh.status
       from public.bom_headers bh
       join public.items i on i.id = bh.item_id
      where bh.org_id = app.current_org_id() and bh.id = $1::uuid
      limit 1`,
    [bomHeaderId],
  );
  return rows[0] ?? null;
}

async function requireEditableHeader(c: QueryClient, bomHeaderId: string): Promise<HeaderRow | BomLineActionResult> {
  const header = await loadHeader(c, bomHeaderId);
  if (!header) return { ok: false, error: 'not_found' };
  if (!BOM_LINE_EDITABLE_STATUSES.has(header.status as BomStatus)) {
    return { ok: false, error: 'bom_not_editable', message: `BOM version is ${header.status}` };
  }
  return header;
}

function isResult(value: HeaderRow | BomLineActionResult): value is BomLineActionResult {
  return 'ok' in value;
}

async function validateNonByproductAllocation(
  c: QueryClient,
  input: { bomHeaderId: string; allocationPct: number; excludeCoProductId?: string },
): Promise<BomLineActionResult | null> {
  const { rows } = await c.query<{ allocation_sum: string | null }>(
    `select coalesce(sum(allocation_pct), 0)::text as allocation_sum
       from public.bom_co_products
      where org_id = app.current_org_id()
        and bom_header_id = $1::uuid
        and is_byproduct is false
        and ($2::uuid is null or id <> $2::uuid)`,
    [input.bomHeaderId, input.excludeCoProductId ?? null],
  );
  const current = Number(rows[0]?.allocation_sum ?? 0);
  if (current + input.allocationPct > 100) {
    return {
      ok: false,
      error: 'validation_failed',
      code: 'V-TEC-12',
      message: `non-byproduct allocation sums to ${current + input.allocationPct}, must be <= 100`,
    };
  }
  return null;
}

export async function addBomCoProduct(rawInput: unknown): Promise<BomLineActionResult> {
  const parsed = AddBomCoProductInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<BomLineActionResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const header = await requireEditableHeader(c, input.bomHeaderId);
      if (isResult(header)) return header;

      if (!input.isByproduct) {
        const allocationError = await validateNonByproductAllocation(c, input);
        if (allocationError) return allocationError;
      }

      const { rows } = await c.query<{ id: string }>(
        `insert into public.bom_co_products
           (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct, expected_yield_pct, is_byproduct)
         values
           (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5::numeric, $6::numeric, $7)
         returning id`,
        [
          input.bomHeaderId,
          input.coProductItemId,
          input.quantity,
          input.uom,
          input.allocationPct,
          input.expectedYieldPct ?? null,
          input.isByproduct,
        ],
      );
      const inserted = rows[0];
      if (!inserted) return { ok: false, error: 'persistence_failed' };

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_CO_PRODUCT_ADDED,
        resourceId: header.id,
        beforeState: null,
        afterState: {
          coProductId: inserted.id,
          coProductItemId: input.coProductItemId,
          quantity: input.quantity,
          uom: input.uom,
          allocationPct: input.allocationPct,
          expectedYieldPct: input.expectedYieldPct ?? null,
          isByproduct: input.isByproduct,
        },
      });

      revalidateForHeader(header.product_id);
      return { ok: true, data: { lineId: inserted.id, bomHeaderId: input.bomHeaderId } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'invalid_input', message: 'invalid reference' };
    console.error('[technical/bom] addBomCoProduct persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateBomCoProduct(rawInput: unknown): Promise<BomLineActionResult> {
  const parsed = UpdateBomCoProductInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<BomLineActionResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const header = await requireEditableHeader(c, input.bomHeaderId);
      if (isResult(header)) return header;

      const { rows: before } = await c.query<CoProductRow>(
        `select id,
                co_product_item_id::text,
                quantity::text,
                uom,
                allocation_pct::text,
                is_byproduct,
                expected_yield_pct::text
           from public.bom_co_products
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and id = $2::uuid
          limit 1`,
        [input.bomHeaderId, input.coProductId],
      );
      const beforeRow = before[0];
      if (!beforeRow) return { ok: false, error: 'not_found' };

      if (!beforeRow.is_byproduct) {
        const allocationError = await validateNonByproductAllocation(c, {
          bomHeaderId: input.bomHeaderId,
          allocationPct: input.allocationPct,
          excludeCoProductId: input.coProductId,
        });
        if (allocationError) return allocationError;
      }

      const { rowCount } = await c.query(
        `update public.bom_co_products
            set quantity = $3::numeric,
                uom = $4,
                allocation_pct = $5::numeric,
                expected_yield_pct = $6::numeric
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and id = $2::uuid`,
        [input.bomHeaderId, input.coProductId, input.quantity, input.uom, input.allocationPct, input.expectedYieldPct ?? null],
      );
      if (rowCount !== 1) return { ok: false, error: 'persistence_failed' };

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_CO_PRODUCT_UPDATED,
        resourceId: header.id,
        beforeState: {
          coProductId: beforeRow.id,
          coProductItemId: beforeRow.co_product_item_id,
          quantity: beforeRow.quantity,
          uom: beforeRow.uom,
          allocationPct: beforeRow.allocation_pct,
          expectedYieldPct: beforeRow.expected_yield_pct,
          isByproduct: beforeRow.is_byproduct,
        },
        afterState: {
          coProductId: input.coProductId,
          coProductItemId: beforeRow.co_product_item_id,
          quantity: input.quantity,
          uom: input.uom,
          allocationPct: input.allocationPct,
          expectedYieldPct: input.expectedYieldPct ?? null,
          isByproduct: beforeRow.is_byproduct,
        },
      });

      revalidateForHeader(header.product_id);
      return { ok: true, data: { lineId: input.coProductId, bomHeaderId: input.bomHeaderId } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'invalid_input', message: 'invalid reference' };
    console.error('[technical/bom] updateBomCoProduct persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteBomCoProduct(rawInput: unknown): Promise<BomLineActionResult> {
  const parsed = DeleteBomCoProductInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<BomLineActionResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const header = await requireEditableHeader(c, input.bomHeaderId);
      if (isResult(header)) return header;

      const { rows: before } = await c.query<CoProductRow>(
        `select id,
                co_product_item_id::text,
                quantity::text,
                uom,
                allocation_pct::text,
                is_byproduct,
                expected_yield_pct::text
           from public.bom_co_products
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and id = $2::uuid
          limit 1`,
        [input.bomHeaderId, input.coProductId],
      );
      const beforeRow = before[0];
      if (!beforeRow) return { ok: false, error: 'not_found' };

      const { rowCount } = await c.query(
        `delete from public.bom_co_products
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and id = $2::uuid`,
        [input.bomHeaderId, input.coProductId],
      );
      if (rowCount !== 1) return { ok: false, error: 'persistence_failed' };

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_CO_PRODUCT_DELETED,
        resourceId: header.id,
        beforeState: {
          coProductId: beforeRow.id,
          coProductItemId: beforeRow.co_product_item_id,
          quantity: beforeRow.quantity,
          uom: beforeRow.uom,
          allocationPct: beforeRow.allocation_pct,
          expectedYieldPct: beforeRow.expected_yield_pct,
          isByproduct: beforeRow.is_byproduct,
        },
        afterState: null,
      });

      revalidateForHeader(header.product_id);
      return { ok: true, data: { lineId: input.coProductId, bomHeaderId: input.bomHeaderId } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/bom] deleteBomCoProduct persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

function revalidateForHeader(productId: string | null): void {
  safeRevalidatePath('/technical/bom');
  if (productId) {
    safeRevalidatePath(`/technical/bom/${encodeURIComponent(productId)}`);
  }
}
