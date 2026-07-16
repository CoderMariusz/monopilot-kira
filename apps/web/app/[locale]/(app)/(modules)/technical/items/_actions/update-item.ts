'use server';

/**
 * Lane A — 03-technical Items Master: update Server Action (T-010).
 *
 * Gated on the real `technical.items.edit` RBAC permission. RLS-scoped UPDATE of
 * the descriptive + commercial attributes (item_code is immutable — it is the
 * org-scoped natural key). zod-validated against migration 153 CHECK constraints.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { validateActiveCategoryCode } from '../../../../../../../actions/reference/product-categories/validate-category-code';
import { safeRevalidatePath } from './revalidate';
import {
  hasPermission,
  isAllowedStatusTransition,
  isPgError,
  ITEMS_EDIT_PERMISSION,
  type OrgActionContext,
  type QueryClient,
  UpdateItemInput,
  type UpdateItemResult,
  writeAudit,
} from './shared';

type BeforeRow = {
  name: string;
  item_type: string;
  status: string;
  uom_base: string;
  weight_mode: string;
  nominal_weight: string | null;
  tare_weight: string | null;
  gross_weight_max: string | null;
  gs1_gtin: string | null;
  output_uom: string | null;
  net_qty_per_each: string | null;
  each_per_box: number | null;
  boxes_per_pallet: number | null;
  list_price_gbp: string | null;
};

export async function updateItem(rawInput: unknown): Promise<UpdateItemResult> {
  const parsed = UpdateItemInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<UpdateItemResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, ITEMS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const categoryCheck = await validateActiveCategoryCode(client as QueryClient, input.categoryCode);
      if (!categoryCheck.ok) return { ok: false, error: 'invalid_category' };

      const before = await (client as QueryClient).query<BeforeRow>(
        `select name, item_type, status, uom_base, weight_mode,
                nominal_weight, tare_weight, gross_weight_max, gs1_gtin,
                output_uom, net_qty_per_each, each_per_box, boxes_per_pallet,
                list_price_gbp
           from public.items
          where org_id = app.current_org_id() and id = $1::uuid`,
        [input.id],
      );
      if (before.rows.length === 0) return { ok: false, error: 'not_found' };
      const beforeRow = before.rows[0];

      const { rows: linkedProjectRows } = await (client as QueryClient).query<{ canonical_name: string }>(
        `select np.name as canonical_name
           from public.items i
           join public.npd_projects np
             on np.org_id = i.org_id
            and (
              np.id = i.npd_project_id
              or (np.product_code is not null and np.product_code = i.item_code)
            )
          where i.org_id = app.current_org_id()
            and i.id = $1::uuid
            and i.item_type = 'fg'
          limit 1`,
        [input.id],
      );
      if (linkedProjectRows.length > 0 && input.name !== beforeRow.name) {
        return {
          ok: false,
          error: 'invalid_input',
          message: 'linked_fg_name_immutable',
        };
      }

      if (input.status !== beforeRow.status) {
        if (input.status === 'blocked' || !isAllowedStatusTransition(beforeRow.status, input.status)) {
          return { ok: false, error: 'invalid_input', message: 'invalid_transition' };
        }
      }

      if (input.itemType !== beforeRow.item_type) {
        const { rows: blockerRows } = await (client as QueryClient).query<{ blocked: boolean }>(
          `select (
             $2::text = 'active'
             or exists (
               select 1
                 from public.bom_headers header
                where header.org_id = app.current_org_id()
                  and header.item_id = $1::uuid
                  and header.status in ('draft', 'in_review', 'technical_approved', 'active')
             )
             or exists (
               select 1
                 from public.bom_lines line
                 join public.bom_headers header
                   on header.id = line.bom_header_id
                  and header.org_id = line.org_id
                 join public.items item
                   on item.id = $1::uuid
                  and item.org_id = app.current_org_id()
                where line.org_id = app.current_org_id()
                  and header.status in ('draft', 'in_review', 'technical_approved', 'active')
                  and (line.item_id = $1::uuid or line.component_code = item.item_code)
             )
             or exists (
               select 1
                 from public.factory_specs spec
                where spec.org_id = app.current_org_id()
                  and spec.fg_item_id = $1::uuid
                  and spec.status <> 'archived'
             )
             or exists (
               select 1
                 from public.work_orders wo
                where wo.org_id = app.current_org_id()
                  and wo.product_id = $1::uuid
             )
           ) as blocked`,
          [input.id, beforeRow.status],
        );
        if (blockerRows[0]?.blocked) {
          return {
            ok: false,
            error: 'item_type_immutable',
            message: 'item_type cannot change once the item is active or referenced by BOMs, factory specs, or work orders',
          };
        }
      }

      const { rows, rowCount } = await (client as QueryClient).query<{ id: string }>(
        `update public.items
            set name = $2,
                item_type = $3,
                status = $4,
                uom_base = $5,
                weight_mode = $6,
                description = $7,
                product_group = $8,
                category_code = $9,
                uom_secondary = $10,
                gs1_gtin = $11,
                nominal_weight = $12::numeric,
                tare_weight = $13::numeric,
                gross_weight_max = $14::numeric,
                variance_tolerance_pct = $15::numeric,
                shelf_life_days = $16::integer,
                shelf_life_mode = $17,
                output_uom = $18,
                net_qty_per_each = $19::numeric,
                each_per_box = $20::integer,
                boxes_per_pallet = $21::integer,
                list_price_gbp = $22::numeric
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id`,
        [
          input.id,
          input.name,
          input.itemType,
          input.status,
          input.uomBase,
          input.weightMode,
          input.description ?? null,
          input.productGroup ?? null,
          input.categoryCode ?? null,
          input.uomSecondary ?? null,
          input.gs1Gtin ?? null,
          input.nominalWeight ?? null,
          input.tareWeight ?? null,
          input.grossWeightMax ?? null,
          input.varianceTolerancePct ?? null,
          input.shelfLifeDays ?? null,
          input.shelfLifeMode ?? null,
          input.outputUom,
          input.netQtyPerEach ?? null,
          input.eachPerBox ?? null,
          input.boxesPerPallet ?? null,
          input.listPriceGbp ?? null,
        ],
      );
      if ((rowCount ?? rows.length) < 1 || !rows[0]) return { ok: false, error: 'not_found' };

      await writeAudit(client as QueryClient, {
        orgId,
        actorUserId: userId,
        action: 'item.updated',
        resourceId: input.id,
        beforeState: beforeRow,
        afterState: {
          name: input.name,
          itemType: input.itemType,
          status: input.status,
          uomBase: input.uomBase,
          weightMode: input.weightMode,
          nominalWeight: input.nominalWeight ?? null,
          tareWeight: input.tareWeight ?? null,
          grossWeightMax: input.grossWeightMax ?? null,
          gs1Gtin: input.gs1Gtin ?? null,
          outputUom: input.outputUom,
          netQtyPerEach: input.netQtyPerEach ?? null,
          eachPerBox: input.eachPerBox ?? null,
          boxesPerPallet: input.boxesPerPallet ?? null,
          listPriceGbp: input.listPriceGbp ?? null,
        },
      });

      safeRevalidatePath('/technical/items');
      return { ok: true, data: { id: input.id } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') {
      const pgMessage = err instanceof Error ? err.message : String(err);
      if (pgMessage.includes('item_type cannot change')) {
        return {
          ok: false,
          error: 'item_type_immutable',
          message: 'item_type cannot change once the item is active or referenced by BOMs, factory specs, or work orders',
        };
      }
      return { ok: false, error: 'invalid_input' };
    }
    console.error('[technical/items] updateItem persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
