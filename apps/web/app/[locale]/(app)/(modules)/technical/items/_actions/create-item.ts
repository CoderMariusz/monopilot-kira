'use server';

/**
 * Lane A — 03-technical Items Master: create Server Action (T-009).
 *
 * Gated on the real `technical.items.create` RBAC permission (seeded to the
 * org-admin family by migration 154). Runs inside withOrgContext so RLS scopes
 * the INSERT to the caller's org. zod-validated against migration 153's CHECK
 * constraints + unique (org_id, item_code). Writes an audit_log row.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { writeItemCostLedger } from '../../cost/_actions/write-cost-ledger';
import { safeRevalidatePath } from './revalidate';
import {
  CreateItemInput,
  type CreateItemResult,
  hasPermission,
  isPgError,
  ITEMS_CREATE_PERMISSION,
  type OrgActionContext,
  type QueryClient,
  writeAudit,
} from './shared';

export async function createItem(rawInput: unknown): Promise<CreateItemResult> {
  const parsed = CreateItemInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CreateItemResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, ITEMS_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await (client as QueryClient).query<{ id: string }>(
        `insert into public.items
           (org_id, item_code, item_type, name, status, uom_base, uom_secondary, product_group,
           description, gs1_gtin, weight_mode, nominal_weight, tare_weight, gross_weight_max,
            variance_tolerance_pct, shelf_life_days, shelf_life_mode,
            output_uom, net_qty_per_each, each_per_box, boxes_per_pallet, list_price_gbp, created_by)
         values
           (app.current_org_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11::numeric, $12::numeric, $13::numeric, $14::numeric,
            $15::integer, $16,
            $17, $18::numeric, $19::integer, $20::integer, $21::numeric, $22::uuid)
         returning id`,
        [
          input.itemCode,
          input.itemType,
          input.name,
          input.status,
          input.uomBase,
          input.uomSecondary ?? null,
          input.productGroup ?? null,
          input.description ?? null,
          input.gs1Gtin ?? null,
          input.weightMode,
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
          userId,
        ],
      );
      const inserted = rows[0];
      if (!inserted) return { ok: false, error: 'persistence_failed' };

      if (input.supplierCode) {
        const supplier = await (client as QueryClient).query<{ id: string }>(
          `select id
             from public.suppliers
            where org_id = app.current_org_id()
              and code = $1::text
            limit 1`,
          [input.supplierCode],
        );
        if (!supplier.rows[0]) {
          console.warn('[technical/items] createItem supplier_spec_skipped_missing_supplier', {
            itemId: inserted.id,
            supplierCode: input.supplierCode,
          });
        } else {
          const txClient = client as QueryClient;
          await txClient.query('savepoint sp_supplier_spec');
          try {
            await txClient.query(
              `insert into public.supplier_specs
                 (org_id, item_id, supplier_code, supplier_id, supplier_status,
                  spec_version, lifecycle_status, review_status,
                  approved_by, approved_at, uploaded_by)
               values
                 (app.current_org_id(), $1::uuid, $2::text, $4::uuid, 'approved',
                  '1.0', 'active', 'approved',
                  $3::uuid, now(), $3::uuid)
               on conflict (org_id, item_id, supplier_code) where lifecycle_status = 'active' AND review_status = 'approved' do nothing`,
              [inserted.id, input.supplierCode, userId, supplier.rows[0].id],
            );
            await txClient.query('release savepoint sp_supplier_spec');
          } catch (err) {
            await txClient.query('rollback to savepoint sp_supplier_spec');
            console.warn('[technical/items] createItem supplier_spec_failed', {
              itemId: inserted.id,
              supplierCode: input.supplierCode,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      if (input.costPerKg !== undefined) {
        const cost = await writeItemCostLedger(client as QueryClient, {
          orgId,
          userId,
          input: { itemId: inserted.id, costPerKg: input.costPerKg, currency: 'PLN', source: 'manual' },
        });
        if (!cost.ok) return { ok: false, error: cost.error === 'approver_required' ? 'invalid_input' : cost.error };
      }

      await writeAudit(client as QueryClient, {
        orgId,
        actorUserId: userId,
        action: 'item.created',
        resourceId: inserted.id,
        beforeState: null,
        afterState: {
          itemCode: input.itemCode,
          itemType: input.itemType,
          name: input.name,
          status: input.status,
          uomBase: input.uomBase,
          listPriceGbp: input.listPriceGbp ?? null,
        },
      });

      safeRevalidatePath('/technical/items');
      return { ok: true, data: { id: inserted.id, itemCode: input.itemCode } };
    });
  } catch (err) {
    // 23505 unique_violation = items_org_item_code_unique; 23514 check_violation.
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'already_exists' };
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/items] createItem persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
