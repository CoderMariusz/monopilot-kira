'use server';

import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import { nextDocumentNumber } from '../../../../../../../lib/documents/numbering';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { resolveWriteSiteId } from '../../../../../../../lib/site/site-context';
import { snapshotFromItemRow, toBaseQty, TypedError } from '../../../../../../../lib/uom/convert';
import { createWorkOrderChainForContext, latestActiveBomHasWipLines } from './create-work-order-chain';
import { createWorkOrderCore, type CreateWorkOrderCoreParams } from './create-work-order-core';
import {
  CreateWorkOrderInput,
  type CreateWorkOrderOptions,
  type CreateWorkOrderResult,
  type OrgActionContext,
  type PlanningWorkOrderError,
  type UomConversionResult,
} from './shared';

function safeRevalidateLocalized(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

function mapChainError(
  error: string,
): Extract<CreateWorkOrderResult, { ok: false }> {
  if (error === 'wo_create_failed') return { ok: false, error: 'persistence_failed' };
  if (error === 'not_found') return { ok: false, error: 'not_found' };
  return { ok: false, error: error as PlanningWorkOrderError };
}

async function resolveCreateSiteId(
  ctx: OrgActionContext,
  siteId: string | undefined,
): Promise<{ ok: true; siteId: string } | { ok: false; error: PlanningWorkOrderError }> {
  if (siteId) {
    const explicitSite = await ctx.client.query<{ id: string }>(
      `select id::text as id
         from public.sites
        where org_id = app.current_org_id()
          and id = $1::uuid
          and is_active = true
        limit 1`,
      [siteId],
    );
    if (!explicitSite.rows[0]) return { ok: false, error: 'no_active_site' };
    return { ok: true, siteId: explicitSite.rows[0].id };
  }
  const siteResolution = await resolveWriteSiteId(ctx.client);
  if (!siteResolution.ok) return { ok: false, error: siteResolution.reason };
  return { ok: true, siteId: siteResolution.siteId };
}

async function buildConversion(
  ctx: OrgActionContext,
  input: {
    productId: string;
    plannedQuantity: string;
    quantityEntered?: string;
    quantityEnteredUom?: 'base' | 'each' | 'box';
  },
): Promise<
  | { ok: true; plannedBaseQty: string; conversion?: UomConversionResult }
  | { ok: false; error: PlanningWorkOrderError }
> {
  let plannedBaseQty = input.plannedQuantity;
  let conversion: UomConversionResult | undefined;
  if (!input.quantityEntered) {
    return { ok: true, plannedBaseQty, conversion };
  }

  const itemUomResult = await ctx.client.query<{
    output_uom: string;
    uom_base: string;
    net_qty_per_each: string | null;
    each_per_box: string | null;
    boxes_per_pallet: string | null;
    weight_mode: 'fixed' | 'catch';
  }>(
    `select output_uom, uom_base, net_qty_per_each::text as net_qty_per_each,
            each_per_box::text as each_per_box, boxes_per_pallet::text as boxes_per_pallet,
            weight_mode
       from public.items
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [input.productId],
  );
  const itemUom = itemUomResult.rows[0];
  if (!itemUom) return { ok: false, error: 'invalid_input' };

  try {
    plannedBaseQty = toBaseQty(
      snapshotFromItemRow(itemUom),
      Number(input.quantityEntered),
      input.quantityEnteredUom ?? 'base',
    ).toFixed(3);
  } catch (error) {
    if (error instanceof TypedError && error.code === 'uom_conversion_unavailable') {
      return { ok: false, error: 'uom_conversion_unavailable' };
    }
    throw error;
  }
  conversion = {
    qtyEntered: input.quantityEntered,
    qtyEnteredUom: input.quantityEnteredUom ?? 'base',
    baseQty: plannedBaseQty,
  };
  return { ok: true, plannedBaseQty, conversion };
}

async function createWorkOrderChainFromPlanning(
  ctx: OrgActionContext,
  input: CreateWorkOrderCoreParams,
): Promise<CreateWorkOrderResult> {
  const parsed = CreateWorkOrderInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };

  const siteResolution = await resolveCreateSiteId(ctx, parsed.data.siteId);
  if (!siteResolution.ok) return { ok: false, error: siteResolution.error };

  const conversionResult = await buildConversion(ctx, parsed.data);
  if (!conversionResult.ok) return { ok: false, error: conversionResult.error };

  let documentNumber: string;
  try {
    documentNumber = parsed.data.documentNumber
      ?? await nextDocumentNumber(ctx.client, ctx.orgId, 'wo', new Date());
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('document_number_settings_missing:')) {
      return { ok: false, error: 'document_mask_missing' };
    }
    throw error;
  }

  const chainResult = await createWorkOrderChainForContext(ctx, {
    productId: parsed.data.productId,
    itemCode: parsed.data.itemCode,
    documentNumber,
    siteId: siteResolution.siteId,
    plannedQuantity: conversionResult.plannedBaseQty,
    quantityEntered: parsed.data.quantityEntered,
    quantityEnteredUom: parsed.data.quantityEnteredUom,
    scheduledStartTime: parsed.data.scheduledStartTime,
    productionLineId: parsed.data.productionLineId,
    notes: parsed.data.notes,
  });

  if (!chainResult.ok) return mapChainError(chainResult.error);

  const approvedSpec = await ctx.client.query<{ id: string }>(
    `select id
       from public.factory_specs
      where org_id = app.current_org_id()
        and fg_item_id = $1::uuid
        and status in ('approved_for_factory', 'released_to_factory')
      order by version desc
      limit 1`,
    [parsed.data.productId],
  );

  return {
    ok: true,
    workOrder: chainResult.fgWorkOrder,
    materials: chainResult.fgMaterials,
    primarySchedule: chainResult.fgPrimarySchedule,
    conversion: conversionResult.conversion,
    warning: !approvedSpec.rows[0] ? 'no_approved_factory_spec' : undefined,
    chain: {
      wipWorkOrders: chainResult.wipWorkOrders,
      dependencies: chainResult.dependencies,
      totalCount: 1 + chainResult.wipWorkOrders.length,
    },
  };
}

export async function createWorkOrder(
  params: CreateWorkOrderCoreParams,
  options?: CreateWorkOrderOptions,
): Promise<CreateWorkOrderResult> {
  try {
    const result = await withOrgContext(async (ctx): Promise<CreateWorkOrderResult> => {
      const parsed = CreateWorkOrderInput.safeParse(params);
      if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };

      if (options?.allowChain) {
        const hasWipLines = await latestActiveBomHasWipLines(ctx, parsed.data.productId, parsed.data.itemCode);
        if (hasWipLines) {
          return createWorkOrderChainFromPlanning(ctx, parsed.data);
        }
      }
      return createWorkOrderCore(ctx, parsed.data);
    });
    if (result.ok) {
      safeRevalidateLocalized('/planning/work-orders');
      safeRevalidateLocalized(`/planning/work-orders/${result.workOrder.id}`);
    }
    return result;
  } catch (error) {
    console.error('[createWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

/** Planning New-WO entry — the ONLY caller allowed to chain (allowChain). Exists as a
 *  named server action because the page cannot pass an inline closure across the RSC
 *  boundary (prod digest 866337143). */
export async function createWorkOrderFromPlanning(
  params: CreateWorkOrderCoreParams,
): Promise<CreateWorkOrderResult> {
  return createWorkOrder(params, { allowChain: true });
}
