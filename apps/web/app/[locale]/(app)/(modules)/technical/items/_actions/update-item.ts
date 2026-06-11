'use server';

/**
 * Lane A — 03-technical Items Master: update Server Action (T-010).
 *
 * Gated on the real `technical.items.edit` RBAC permission. RLS-scoped UPDATE of
 * the descriptive + commercial attributes (item_code is immutable — it is the
 * org-scoped natural key). zod-validated against migration 153 CHECK constraints.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  hasPermission,
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
};

export async function updateItem(rawInput: unknown): Promise<UpdateItemResult> {
  const parsed = UpdateItemInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<UpdateItemResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, ITEMS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const before = await (client as QueryClient).query<BeforeRow>(
        `select name, item_type, status, uom_base, weight_mode,
                nominal_weight, tare_weight, gross_weight_max, gs1_gtin,
                output_uom, net_qty_per_each, each_per_box, boxes_per_pallet
           from public.items
          where org_id = app.current_org_id() and id = $1::uuid`,
        [input.id],
      );
      if (before.rows.length === 0) return { ok: false, error: 'not_found' };

      const { rows, rowCount } = await (client as QueryClient).query<{ id: string }>(
        `update public.items
            set name = $2,
                item_type = $3,
                status = $4,
                uom_base = $5,
                weight_mode = $6,
                description = $7,
                product_group = $8,
                uom_secondary = $9,
                gs1_gtin = $10,
                nominal_weight = $11::numeric,
                tare_weight = $12::numeric,
                gross_weight_max = $13::numeric,
                variance_tolerance_pct = $14::numeric,
                shelf_life_days = $15::integer,
                shelf_life_mode = $16,
                output_uom = $17,
                net_qty_per_each = $18::numeric,
                each_per_box = $19::integer,
                boxes_per_pallet = $20::integer
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
        ],
      );
      if ((rowCount ?? rows.length) < 1 || !rows[0]) return { ok: false, error: 'not_found' };

      await writeAudit(client as QueryClient, {
        orgId,
        actorUserId: userId,
        action: 'item.updated',
        resourceId: input.id,
        beforeState: before.rows[0],
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
        },
      });

      safeRevalidatePath('/technical/items');
      return { ok: true, data: { id: input.id } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/items] updateItem persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
