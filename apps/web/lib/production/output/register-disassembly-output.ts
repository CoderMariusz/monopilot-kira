import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { writeItemCostLedger } from '../../../app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger';
import { upsertWac } from '../../finance/upsert-wac';
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

export class DisassemblyAbort extends Error {
  constructor(
    readonly code: string,
    readonly msg?: string,
  ) {
    super(code);
  }
}

export type RegisterDisassemblyOutputResult =
  | { ok: true; outputs: Array<{ lpId: string; lpCode: string }>; mass_balance_warning?: DisassemblyMassBalanceWarning }
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
  currency: string | null;
};

type InputConsumptionWacRow = {
  wac_value: string;
  wac_qty_kg: string;
};

type ExistingOutputRow = {
  lp_id: string;
  lp_number: string;
};

type SiteWarehouseTarget = { id: string; default_location_id: string | null };

const SCALE = 1_000_000n;
const ALLOCATION_TARGET = 100n * SCALE;
const ALLOCATION_TOLERANCE = 10_000n; // 0.01 percent points
const DISASSEMBLY_MASS_BALANCE_WARN_PCT = 0.02;
const NO_WAREHOUSE_FOR_SITE_MESSAGE =
  'No warehouse is configured for your site — set one in Settings -> Sites';

export type DisassemblyMassBalanceWarning = {
  input_kg: string;
  output_kg: string;
  warn_pct: number;
};

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

function validateCoProductAllocationSum(coProducts: CoProductRow[]): boolean {
  let sum = 0n;
  for (const row of coProducts) {
    sum += decimalToFixed(row.allocation_pct);
  }
  const diff = sum >= ALLOCATION_TARGET ? sum - ALLOCATION_TARGET : ALLOCATION_TARGET - sum;
  return diff <= ALLOCATION_TOLERANCE;
}

function evaluateDisassemblyMassBalance(
  inputKg: bigint,
  outputKg: bigint,
): DisassemblyMassBalanceWarning | undefined {
  if (inputKg <= 0n) return undefined;
  const diff = outputKg >= inputKg ? outputKg - inputKg : inputKg - outputKg;
  const warnThreshold = (inputKg * 2n + 50n) / 100n;
  if (diff <= warnThreshold) return undefined;
  return {
    input_kg: fixedToDecimal(inputKg),
    output_kg: fixedToDecimal(outputKg),
    warn_pct: DISASSEMBLY_MASS_BALANCE_WARN_PCT,
  };
}

async function flagDisassemblyMassBalanceWarning(ctx: OrgContextLike, woId: string): Promise<void> {
  await ctx.client.query(
    `update public.work_orders
        set over_production_flagged = true,
            over_production_flagged_at = coalesce(over_production_flagged_at, now())
      where id = $1::uuid
        and org_id = app.current_org_id()`,
    [woId],
  );
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

type ConsumedQtyKgResult =
  | { ok: true; qtyKg: bigint }
  | { ok: false; error: 'input-uom-unsupported' };

async function loadConsumedQtyKg(
  ctx: OrgContextLike,
  woId: string,
  inputLpId: string,
): Promise<ConsumedQtyKgResult> {
  const { rows } = await ctx.client.query<{ qty_kg: string; has_unsupported: boolean }>(
    `with consumption as (
       select c.qty_consumed,
              c.uom,
              i.uom_base,
              i.net_qty_per_each,
              i.each_per_box
         from public.wo_material_consumption c
         join public.items i
           on i.org_id = c.org_id
          and i.id = c.component_id
        where c.org_id = app.current_org_id()
          and c.wo_id = $1::uuid
          and c.lp_id = $2::uuid
     )
     select coalesce(
              sum(
                case
                  when uom = 'kg' then qty_consumed
                  when uom = uom_base and uom_base = 'kg' then qty_consumed
                  when uom = 'each'
                    and net_qty_per_each is not null
                    and net_qty_per_each > 0
                    then qty_consumed * net_qty_per_each
                  when uom = 'box'
                    and net_qty_per_each is not null
                    and net_qty_per_each > 0
                    and each_per_box is not null
                    and each_per_box > 0
                    then qty_consumed * each_per_box * net_qty_per_each
                  else null
                end
              ),
              0
            )::text as qty_kg,
            exists (
              select 1
                from consumption
               where case
                       when uom = 'kg' then true
                       when uom = uom_base and uom_base = 'kg' then true
                       when uom = 'each'
                         and net_qty_per_each is not null
                         and net_qty_per_each > 0
                         then true
                       when uom = 'box'
                         and net_qty_per_each is not null
                         and net_qty_per_each > 0
                         and each_per_box is not null
                         and each_per_box > 0
                         then true
                       else false
                     end = false
            ) as has_unsupported
       from consumption`,
    [woId, inputLpId],
  );
  const row = rows[0];
  if (!row || row.has_unsupported) {
    return { ok: false, error: 'input-uom-unsupported' };
  }
  return { ok: true, qtyKg: decimalToFixed(row.qty_kg ?? '0') };
}

async function lockWorkOrderForDisassembly(ctx: OrgContextLike, woId: string): Promise<void> {
  await ctx.client.query(
    `select wo.id
       from public.work_orders wo
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
      for update`,
    [woId],
  );
}

async function loadExistingDisassemblyOutputs(
  ctx: OrgContextLike,
  woId: string,
  inputLpId: string,
): Promise<ExistingOutputRow[]> {
  const { rows } = await ctx.client.query<ExistingOutputRow>(
    `select wo.lp_id::text as lp_id,
            lp.lp_number
       from public.wo_outputs wo
       join public.license_plates lp
         on lp.org_id = wo.org_id
        and lp.id = wo.lp_id
      where wo.org_id = app.current_org_id()
        and wo.wo_id = $1::uuid
        and wo.ext_jsonb->>'disassembly_input_lp_id' = $2`,
    [woId, inputLpId],
  );
  return rows;
}

async function loadInputLp(ctx: OrgContextLike, inputLpId: string): Promise<InputLpRow | null> {
  const { rows } = await ctx.client.query<InputLpRow>(
    `select lp.id::text as id,
            coalesce(trim(ch.currency::text), 'GBP') as currency
       from public.license_plates lp
       left join lateral (
         select currency
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

async function loadInputConsumptionWacSnapshot(
  ctx: OrgContextLike,
  woId: string,
  inputLpId: string,
): Promise<InputConsumptionWacRow | null> {
  const { rows } = await ctx.client.query<InputConsumptionWacRow>(
    `select sum(nullif(c.ext_jsonb->>'wac_value', '')::numeric)::text as wac_value,
            sum(nullif(c.ext_jsonb->>'wac_qty_kg', '')::numeric)::text as wac_qty_kg
       from public.wo_material_consumption c
      where c.org_id = app.current_org_id()
        and c.wo_id = $1::uuid
        and c.lp_id = $2::uuid
        and c.correction_of_id is null`,
    [woId, inputLpId],
  );
  const row = rows[0];
  if (!row?.wac_value || !row.wac_qty_kg || isZeroDecimal(row.wac_value) || isZeroDecimal(row.wac_qty_kg)) {
    return null;
  }
  return row;
}

function isZeroDecimal(value: string): boolean {
  return /^-?0+(?:\.0+)?$/.test(value.trim());
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

async function resolveWarehouseForSite(
  ctx: OrgContextLike,
  siteId: string | null,
): Promise<SiteWarehouseTarget | null> {
  // Resolve warehouse for the WO site (not the scanner session site) so LP
  // site_id and warehouse/location stay on the same site as the work order.
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
    [siteId],
  );
  return rows[0] ?? null;
}

async function createDisassemblyOutputLp(
  ctx: OrgContextLike,
  warehouse: SiteWarehouseTarget,
  input: {
    siteId: string | null;
    woId: string;
    inputLpId: string;
    coProductItemId: string;
    qtyKg: string;
    batchNumber: string;
    allocationPct: string;
    actorUserId: string;
  },
): Promise<{ id: string; lpCode: string }> {
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
      input.siteId,
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
    wacQtyKg: string;
    wacValue: string;
  },
): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.wo_outputs
       (org_id, site_id, transaction_id, wo_id, output_type, product_id, lp_id,
        batch_number, qty_kg, uom, catch_weight_details, registered_by, created_by,
        expiry_date, ext_jsonb, qa_status)
     values
       (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid,
        $7, $8::numeric, 'kg', null, $9::uuid, $9::uuid,
        null, $10::jsonb,
        case
          when exists (
            select 1
              from public.v_active_holds h
             where h.org_id = app.current_org_id()
               and h.reference_type = 'wo'
               and h.reference_id = $3::uuid
          ) then 'ON_HOLD'
          else 'PENDING'
        end)
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
        wac_qty_kg: input.wacQtyKg,
        wac_value: input.wacValue,
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
  if (!validateCoProductAllocationSum(coProducts)) {
    return { ok: false, error: 'allocation-pct-invalid' };
  }
  const outputItemIds = new Set(input.outputs.map((output) => output.coProductItemId));
  if (
    outputItemIds.size !== input.outputs.length ||
    outputItemIds.size !== coProducts.length ||
    input.outputs.some((output) => !coProductByItem.has(output.coProductItemId))
  ) {
    return { ok: false, error: 'co-product-mismatch' };
  }

  const inputLp = await loadInputLp(ctx, input.inputLpId);
  if (!inputLp) return { ok: false, error: 'not-found' };

  const consumptionWac = await loadInputConsumptionWacSnapshot(ctx, input.woId, input.inputLpId);
  if (!consumptionWac) return { ok: false, error: 'input-wac-snapshot-missing' };

  const consumedQtyResult = await loadConsumedQtyKg(ctx, input.woId, input.inputLpId);
  if (!consumedQtyResult.ok) return consumedQtyResult;
  const consumedQty = consumedQtyResult.qtyKg;
  if (consumedQty <= 0n) return { ok: false, error: 'input-not-consumed' };

  const totalInputCost = decimalToFixed(consumptionWac.wac_value);
  if (totalInputCost < 0n) return { ok: false, error: 'input-cost-invalid' };

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

  // Serialize concurrent submits for the same WO before the replay probe so two
  // identical requests cannot both pass the existence check and double-insert.
  await lockWorkOrderForDisassembly(ctx, input.woId);

  // Replay idempotency: one disassembly registration per (wo_id, input LP).
  // A retry after rollback (zero rows) or a duplicate submit after success
  // returns the existing outputs without issuing new inserts.
  const existingOutputs = await loadExistingDisassemblyOutputs(ctx, input.woId, input.inputLpId);
  if (existingOutputs.length > 0) {
    return {
      ok: true,
      outputs: existingOutputs.map((row) => ({ lpId: row.lp_id, lpCode: row.lp_number })),
    };
  }

  const warehouse = await resolveWarehouseForSite(ctx, wo.site_id);
  if (!warehouse) {
    return {
      ok: false,
      reason: 'no_warehouse_for_site',
      message: NO_WAREHOUSE_FOR_SITE_MESSAGE,
    };
  }

  let totalOutputQty = 0n;
  for (const output of input.outputs) {
    totalOutputQty += decimalToFixed(output.qtyKg);
  }
  const massBalanceWarning = evaluateDisassemblyMassBalance(consumedQty, totalOutputQty);
  if (massBalanceWarning) {
    await flagDisassemblyMassBalanceWarning(ctx, input.woId);
  }

  const firstSequence = await nextOutputSequence(ctx, input.woId);
  const results: Array<{ lpId: string; lpCode: string }> = [];
  let allocatedSoFar = 0n;
  const lastOutputIndex = input.outputs.length - 1;

  for (const [index, output] of input.outputs.entries()) {
    const coProduct = coProductByItem.get(output.coProductItemId);
    if (!coProduct) throw new DisassemblyAbort('co-product-mismatch');

    const allocationPct = decimalToFixed(coProduct.allocation_pct);
    const allocatedCost =
      index === lastOutputIndex
        ? totalInputCost - allocatedSoFar
        : divideFixed(multiplyFixed(totalInputCost, allocationPct), decimalToFixed('100'));
    if (allocatedCost < 0n) throw new DisassemblyAbort('cost-allocation-invalid');
    allocatedSoFar += allocatedCost;

    const batchNumber = `${wo.wo_number}-OUT-${String(firstSequence + index).padStart(3, '0')}`;
    const createdLp = await createDisassemblyOutputLp(ctx, warehouse, {
      siteId: wo.site_id,
      woId: input.woId,
      inputLpId: input.inputLpId,
      coProductItemId: output.coProductItemId,
      qtyKg: output.qtyKg,
      batchNumber,
      allocationPct: coProduct.allocation_pct,
      actorUserId,
    });

    const outputQty = decimalToFixed(output.qtyKg);
    const outputCostPerKg = divideFixed(allocatedCost, outputQty);
    const wacValue = fixedToDecimal(allocatedCost);
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
      allocatedCost: wacValue,
      wacQtyKg: output.qtyKg,
      wacValue,
    });

    await upsertWac(ctx.client, {
      orgId: ctx.orgId,
      siteId: wo.site_id,
      itemId: output.coProductItemId,
      deltaQtyKg: output.qtyKg,
      deltaValue: wacValue,
      updatedBy: actorUserId,
    });

    const costResult = await writeItemCostLedger(ctx.client, {
      orgId: ctx.orgId,
      userId: actorUserId,
      input: {
        itemId: output.coProductItemId,
        costPerKg: fixedToDecimal(outputCostPerKg),
        currency: input.currency ?? inputLp.currency ?? 'GBP',
        source: 'disassembly_allocation',
        notes: `Disassembly allocation from input LP ${input.inputLpId}; allocated_cost=${fixedToDecimal(allocatedCost)}`,
      },
    });
    if (!costResult.ok) throw new DisassemblyAbort(`cost-ledger-${costResult.error}`);

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
        mass_balance_warning: massBalanceWarning ?? null,
        actor_user_id: ctx.userId,
      },
      dedupKey: `${PRODUCTION_OUTPUT_RECORDED_EVENT}:${transactionId}`,
    });

    results.push({ lpId: createdLp.id, lpCode: createdLp.lpCode });
  }

  return {
    ok: true,
    outputs: results,
    ...(massBalanceWarning ? { mass_balance_warning: massBalanceWarning } : {}),
  };
}
