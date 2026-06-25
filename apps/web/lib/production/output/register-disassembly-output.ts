import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { writeItemCostLedger } from '../../../app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger';
import { holdsGuard } from '../holds-guard';
import { makeLpNumber } from '../../warehouse/lp-create';
import {
  emitOutbox,
  hasPermission,
  OUTPUT_RECORDABLE_STATES,
  PRODUCTION_OUTPUT_RECORDED_EVENT,
  PRODUCTION_OUTPUT_WRITE_PERMISSION,
  ProductionActionError,
  QualityHoldError,
  readWoExecutionStatus,
  type OrgContextLike,
} from '../shared';

const DecimalInput = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? String(value) : value.trim()))
  .refine((value) => /^\d+(\.\d+)?$/.test(value), {
    message: 'must be a non-negative plain decimal',
  })
  .refine((value) => decimalToFixed(value) > 0n, {
    message: 'must be greater than zero',
  });

export const RegisterDisassemblyOutputInput = z.object({
  woId: z.string().uuid(),
  inputLpId: z.string().uuid(),
  outputs: z
    .array(
      z.object({
        coProductItemId: z.string().uuid(),
        qtyKg: DecimalInput,
      }),
    )
    .min(1),
  operatorId: z.string().uuid().optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
});

export type RegisterDisassemblyOutputInputType = z.input<typeof RegisterDisassemblyOutputInput>;

export type RegisterDisassemblyOutputResult =
  | { ok: true; outputs: Array<{ lpId: string; lpCode: string }> }
  | { ok: false; reason: 'no_warehouse_for_site'; message: string }
  | { ok: false; error: string };

type WoBomRow = {
  id: string;
  wo_number: string;
  site_id: string | null;
  uom: string;
  bom_header_id: string | null;
  bom_type: 'forward' | 'disassembly' | string;
};

type CoProductRow = {
  co_product_item_id: string;
  allocation_pct: string;
  is_byproduct: boolean;
};

type InputLpRow = {
  id: string;
  quantity: string;
  cost_per_kg: string | null;
  currency: string | null;
};

type SiteWarehouseTarget = { id: string; default_location_id: string | null };

const SCALE = 1_000_000n;
const NO_WAREHOUSE_FOR_SITE_MESSAGE =
  'No warehouse is configured for your site — set one in Settings -> Sites';

function decimalToFixed(value: string): bigint {
  const [intPart = '0', fracRaw = ''] = value.split('.');
  const frac = (fracRaw + '000000').slice(0, 6);
  return BigInt(intPart) * SCALE + BigInt(frac);
}

function fixedToDecimal(value: bigint, scale = 6): string {
  const intPart = value / SCALE;
  const fracFull = (value % SCALE).toString().padStart(6, '0');
  if (scale <= 0) return intPart.toString();
  return `${intPart}.${fracFull.slice(0, scale)}`;
}

function multiplyFixed(left: bigint, right: bigint): bigint {
  return (left * right + SCALE / 2n) / SCALE;
}

function divideFixed(left: bigint, right: bigint): bigint {
  if (right <= 0n) throw new Error('invalid_decimal_divisor');
  return (left * SCALE + right / 2n) / right;
}

async function loadWoBom(ctx: OrgContextLike, woId: string): Promise<WoBomRow | null> {
  const { rows } = await ctx.client.query<WoBomRow>(
    `select wo.id,
            wo.wo_number,
            wo.site_id::text as site_id,
            wo.uom,
            coalesce(wo.active_bom_header_id, wo.bom_id)::text as bom_header_id,
            bh.bom_type
       from public.work_orders wo
       left join public.bom_headers bh
         on bh.org_id = wo.org_id
        and bh.id = coalesce(wo.active_bom_header_id, wo.bom_id)
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
      limit 1`,
    [woId],
  );
  return rows[0] ?? null;
}

async function loadCoProducts(ctx: OrgContextLike, bomHeaderId: string): Promise<CoProductRow[]> {
  const { rows } = await ctx.client.query<CoProductRow>(
    `select co_product_item_id::text as co_product_item_id,
            allocation_pct::text as allocation_pct,
            is_byproduct
       from public.bom_co_products
      where org_id = app.current_org_id()
        and bom_header_id = $1::uuid
      order by co_product_item_id`,
    [bomHeaderId],
  );
  return rows;
}

async function loadInputLp(ctx: OrgContextLike, inputLpId: string): Promise<InputLpRow | null> {
  const { rows } = await ctx.client.query<InputLpRow>(
    `select lp.id::text as id,
            lp.quantity::text as quantity,
            coalesce(ch.cost_per_kg::text, item.cost_per_kg::text) as cost_per_kg,
            coalesce(trim(ch.currency::text), 'PLN') as currency
       from public.license_plates lp
       left join public.items item
         on item.org_id = lp.org_id
        and item.id = lp.product_id
       left join lateral (
         select cost_per_kg, currency
           from public.item_cost_history
          where org_id = app.current_org_id()
            and item_id = lp.product_id
            and effective_to is null
          order by effective_from desc
          limit 1
       ) ch on true
      where lp.org_id = app.current_org_id()
        and lp.id = $1::uuid
      limit 1`,
    [inputLpId],
  );
  return rows[0] ?? null;
}

async function nextOutputSequence(ctx: OrgContextLike, woId: string): Promise<number> {
  const { rows } = await ctx.client.query<{ seq: string }>(
    `select count(*)::text as seq
       from public.wo_outputs
      where wo_id = $1::uuid
        and org_id = app.current_org_id()`,
    [woId],
  );
  return Number(rows[0]?.seq ?? '0') + 1;
}

async function resolveWarehouseForSessionSite(ctx: OrgContextLike): Promise<SiteWarehouseTarget | null> {
  // Resilient resolution (see register-output.ts): prefer a site-linked
  // warehouse, then the org default, then the org's first warehouse — so
  // disassembly output never 409s 'no_warehouse_for_site' just because the
  // WO/session has no site or no warehouse is site-linked. Null only when the
  // org has zero warehouses.
  const { rows } = await ctx.client.query<SiteWarehouseTarget>(
    `select w.id,
            (select l.id
               from public.locations l
              where l.org_id = w.org_id
                and l.warehouse_id = w.id
              order by l.level asc, l.code asc
              limit 1) as default_location_id
       from public.warehouses w
      where w.org_id = app.current_org_id()
      order by (case when $1::uuid is not null and w.site_id = $1::uuid then 0 else 1 end) asc,
               w.is_default desc nulls last,
               w.name asc,
               w.id asc
      limit 1`,
    [ctx.siteId ?? null],
  );
  return rows[0] ?? null;
}

async function createDisassemblyOutputLp(
  ctx: OrgContextLike,
  input: {
    woId: string;
    inputLpId: string;
    coProductItemId: string;
    qtyKg: string;
    batchNumber: string;
    allocationPct: string;
    actorUserId: string;
  },
): Promise<{ id: string; lpCode: string }> {
  const warehouse = await resolveWarehouseForSessionSite(ctx);
  if (!warehouse) throw new Error('no_warehouse_for_site');

  const lpCode = makeLpNumber();
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.license_plates (
       org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
       status, qa_status, batch_number, expiry_date, best_before_date,
       origin, wo_id, parent_lp_id, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::numeric, 'kg',
       'received', 'pending', $7, null, null,
       'production', $8::uuid, $9::uuid, $10::jsonb, $11::uuid, $11::uuid
     )
     returning id`,
    [
      ctx.siteId,
      warehouse.id,
      warehouse.default_location_id,
      lpCode,
      input.coProductItemId,
      input.qtyKg,
      input.batchNumber,
      input.woId,
      input.inputLpId,
      JSON.stringify({
        consumed_lp_ids: [input.inputLpId],
        disassembly_input_lp_id: input.inputLpId,
        allocation_pct: input.allocationPct,
      }),
      input.actorUserId,
    ],
  );

  const lp = rows[0];
  if (!lp) throw new Error('persistence_failed');

  await ctx.client.query(
    `insert into public.lp_genealogy (
       org_id, child_lp_id, parent_lp_id, relation_type, qty, uom
     )
     values (app.current_org_id(), $1::uuid, $2::uuid, 'derived', $3::numeric, 'kg')
     on conflict (org_id, child_lp_id, parent_lp_id, relation_type) do nothing`,
    [lp.id, input.inputLpId, input.qtyKg],
  );

  await ctx.client.query(
    `insert into public.lp_state_history (
       org_id, lp_id, from_state, to_state, reason_code, reason_text,
       wo_id, transaction_id, created_by
     )
     values (app.current_org_id(), $1::uuid, null, 'received', 'production_output',
             'Disassembly output registration', $2::uuid, $3::uuid, $4::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [lp.id, input.woId, randomUUID(), input.actorUserId],
  );

  return { id: lp.id, lpCode };
}

async function insertWoOutput(
  ctx: OrgContextLike,
  input: {
    wo: WoBomRow;
    transactionId: string;
    outputType: 'co_product' | 'by_product';
    coProductItemId: string;
    lpId: string;
    batchNumber: string;
    qtyKg: string;
    actorUserId: string;
    inputLpId: string;
    allocationPct: string;
    allocatedCost: string;
  },
): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.wo_outputs
       (org_id, site_id, transaction_id, wo_id, output_type, product_id, lp_id,
        batch_number, qty_kg, uom, catch_weight_details, registered_by, created_by,
        expiry_date, ext_jsonb)
     values
       (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid,
        $7, $8::numeric, 'kg', null, $9::uuid, $9::uuid,
        null, $10::jsonb)
     returning id`,
    [
      input.wo.site_id,
      input.transactionId,
      input.wo.id,
      input.outputType,
      input.coProductItemId,
      input.lpId,
      input.batchNumber,
      input.qtyKg,
      input.actorUserId,
      JSON.stringify({
        disassembly_input_lp_id: input.inputLpId,
        allocation_pct: input.allocationPct,
        allocated_cost: input.allocatedCost,
      }),
    ],
  );
  const output = rows[0];
  if (!output) throw new Error('persistence_failed');
  return output.id;
}

export async function registerDisassemblyOutput(
  ctx: OrgContextLike,
  rawInput: RegisterDisassemblyOutputInputType,
): Promise<RegisterDisassemblyOutputResult> {
  try {
    const parsed = RegisterDisassemblyOutputInput.safeParse(rawInput);
    if (!parsed.success) return { ok: false, error: 'invalid-input' };
    const input = parsed.data;
    const actorUserId = input.operatorId ?? ctx.userId;

    if (!(await hasPermission(ctx, PRODUCTION_OUTPUT_WRITE_PERMISSION))) {
      return { ok: false, error: 'forbidden' };
    }

    const wo = await loadWoBom(ctx, input.woId);
    if (!wo || !wo.bom_header_id) return { ok: false, error: 'not-found' };
    if (wo.bom_type !== 'disassembly') return { ok: false, error: 'not-disassembly' };

    const coProducts = await loadCoProducts(ctx, wo.bom_header_id);
    const coProductByItem = new Map(coProducts.map((row) => [row.co_product_item_id, row]));
    const outputItemIds = new Set(input.outputs.map((output) => output.coProductItemId));
    if (
      outputItemIds.size !== input.outputs.length ||
      outputItemIds.size !== coProducts.length ||
      input.outputs.some((output) => !coProductByItem.has(output.coProductItemId))
    ) {
      return { ok: false, error: 'co-product-mismatch' };
    }

    const inputLp = await loadInputLp(ctx, input.inputLpId);
    if (!inputLp || !inputLp.cost_per_kg) return { ok: false, error: 'input-cost-missing' };

    const inputQty = decimalToFixed(inputLp.quantity);
    const inputCostPerKg = decimalToFixed(inputLp.cost_per_kg);
    if (inputQty <= 0n || inputCostPerKg < 0n) return { ok: false, error: 'input-cost-invalid' };

    const status = await readWoExecutionStatus(ctx, input.woId);
    if (status === null || !OUTPUT_RECORDABLE_STATES.has(status)) {
      throw new ProductionActionError('wo_not_recordable', 409, { status });
    }

    const hold = await holdsGuard(ctx, { lpId: input.inputLpId, lotId: null });
    if (hold) {
      throw new QualityHoldError({
        hold,
        woId: input.woId,
        blockedPath: 'output',
        transactionId: randomUUID(),
        lpId: input.inputLpId,
        lotId: null,
      });
    }

    const totalInputCost = multiplyFixed(inputQty, inputCostPerKg);
    const firstSequence = await nextOutputSequence(ctx, input.woId);
    const results: Array<{ lpId: string; lpCode: string }> = [];
    let allocatedSoFar = 0n;

    for (const [index, output] of input.outputs.entries()) {
      const coProduct = coProductByItem.get(output.coProductItemId);
      if (!coProduct) return { ok: false, error: 'co-product-mismatch' };

      const allocationPct = decimalToFixed(coProduct.allocation_pct);
      const allocatedCost =
        index === input.outputs.length - 1
          ? totalInputCost - allocatedSoFar
          : divideFixed(multiplyFixed(totalInputCost, allocationPct), decimalToFixed('100'));
      if (allocatedCost < 0n) return { ok: false, error: 'cost-allocation-invalid' };
      allocatedSoFar += allocatedCost;

      const batchNumber = `${wo.wo_number}-OUT-${String(firstSequence + index).padStart(3, '0')}`;
      const createdLp = await createDisassemblyOutputLp(ctx, {
        woId: input.woId,
        inputLpId: input.inputLpId,
        coProductItemId: output.coProductItemId,
        qtyKg: output.qtyKg,
        batchNumber,
        allocationPct: coProduct.allocation_pct,
        actorUserId,
      });

      const transactionId = randomUUID();
      const outputType = coProduct.is_byproduct ? 'by_product' : 'co_product';
      const outputId = await insertWoOutput(ctx, {
        wo,
        transactionId,
        outputType,
        coProductItemId: output.coProductItemId,
        lpId: createdLp.id,
        batchNumber,
        qtyKg: output.qtyKg,
        actorUserId,
        inputLpId: input.inputLpId,
        allocationPct: coProduct.allocation_pct,
        allocatedCost: fixedToDecimal(allocatedCost),
      });

      const outputQty = decimalToFixed(output.qtyKg);
      const outputCostPerKg = divideFixed(allocatedCost, outputQty);
      const costResult = await writeItemCostLedger(ctx.client, {
        orgId: ctx.orgId,
        userId: actorUserId,
        input: {
          itemId: output.coProductItemId,
          costPerKg: fixedToDecimal(outputCostPerKg),
          currency: input.currency ?? inputLp.currency ?? 'PLN',
          source: 'disassembly_allocation',
          notes: `Disassembly allocation from input LP ${input.inputLpId}; allocated_cost=${fixedToDecimal(allocatedCost)}`,
        },
      });
      if (!costResult.ok) return { ok: false, error: `cost-ledger-${costResult.error}` };

      await emitOutbox(ctx, {
        eventType: PRODUCTION_OUTPUT_RECORDED_EVENT,
        aggregateType: 'wo',
        aggregateId: input.woId,
        payload: {
          org_id: ctx.orgId,
          output_id: outputId,
          wo_id: input.woId,
          output_type: outputType,
          product_id: output.coProductItemId,
          lp_id: createdLp.id,
          batch_number: batchNumber,
          qty_kg: output.qtyKg,
          uom: 'kg',
          qty_units: null,
          units_uom: null,
          actual_weight_kg: output.qtyKg,
          catch_weight_variance_warning: false,
          actor_user_id: ctx.userId,
        },
        dedupKey: `${PRODUCTION_OUTPUT_RECORDED_EVENT}:${transactionId}`,
      });

      results.push({ lpId: createdLp.id, lpCode: createdLp.lpCode });
    }

    return { ok: true, outputs: results };
  } catch (error) {
    if (error instanceof Error && error.message === 'no_warehouse_for_site') {
      return {
        ok: false,
        reason: 'no_warehouse_for_site',
        message: NO_WAREHOUSE_FOR_SITE_MESSAGE,
      };
    }
    if (error instanceof Error && error.message === 'warehouse_not_configured') {
      return { ok: false, error: 'warehouse-not-configured' };
    }
    if (error instanceof ProductionActionError) throw error;
    return { ok: false, error: 'persistence-failed' };
  }
}
