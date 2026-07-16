/**
 * T-028 — Output recording (primary / co_product / by_product) into the
 * canonical wo_outputs table (08-production owns this table — NEVER 04-planning).
 * T-032 — Catch-weight entry: when item.weight_mode='catch', the body carries a
 * per-unit weight array; we persist catch_weight_details and compute a ±tolerance
 * variance SOFT warning (P1 — never a hard block per PRD §6 D13).
 *
 * Flow (atomic, single txn supplied by the route's withOrgContext):
 *   1. zod-validate the body (cheap fail before any DB work).
 *   2. RBAC: caller must hold production.output.write.
 *   3. Load the WO (RLS-scoped) + soft-load the item for shelf_life / weight_mode.
 *   4. WO must be in a recordable lifecycle state (read wo_executions.status —
 *      never write it).
 *   5. holdsGuard(lpId, lotId) FIRST — active 09-quality hold ⇒ 409 +
 *      production.consume.blocked outbox event.
 *   6. Generate batch_number = {wo_number}-OUT-{NNN} (seq = count+1 per WO+type),
 *      expiry_date = current_date + item.shelf_life_days (V-PROD-04).
 *   7. Build catch_weight_details when weight_mode='catch' (variance vs
 *      item.nominal_weight; soft warning > tolerance).
 *   8. INSERT wo_outputs (V-PROD-24 batch-unique-per-year enforced by the schema).
 *   8b. (W9-K-II, F-A04/F-B08) when no caller-supplied lp_id: create the output
 *       LP in the SAME txn (status received / qa pending, org-default warehouse,
 *       genealogy parent = first consumed LP, all consumed LPs in
 *       ext_jsonb.consumed_lp_ids) and back-link wo_outputs.lp_id.
 *   9. emit production.output.recorded in the SAME txn.
 *
 * NUMERIC-exact: qty / per-unit kg never round-trip through a binary float. The
 * body sends strings; we validate them as decimal strings and pass them straight
 * to NUMERIC(12,3) columns. Variance math uses a small fixed-point decimal helper
 * (no `Number()` on the kg values) so two outputs that sum to the same NUMERIC
 * are bit-identical.
 *
 * DEVIATION (noted for collection): the task prompt references
 * `item.weight_mode='nominal'` and `item.avg_unit_kg`; the SHIPPED schema
 * (migration 153) uses weight_mode ∈ {'fixed','catch'} and the per-unit
 * reference column is `nominal_weight`. We map: non-catch = 'fixed';
 * avg_unit_kg = items.nominal_weight. prod_settings.catch_weight_tolerance_pct
 * is not yet a shipped table, so the tolerance defaults to 0.10 and can be
 * overridden via items.variance_tolerance_pct (a percent) when present.
 */
import { z } from 'zod';

import { resolveOutputWacContribution } from '../../finance/resolve-output-wac';
import { resolveWacDeltaQtyKgFromSnapshot, upsertWac } from '../../finance/upsert-wac';
import { woSnapshotWacQtyFields } from '../../uom/convert';
import { makeLpNumber, makeStockMoveNumber } from '../../warehouse/lp-create';
import { woPostedConsumptionKgSubquery } from '../consumption-qty-to-kg';
import {
  PRODUCTION_OUTPUT_RECORDED_EVENT,
  PRODUCTION_OUTPUT_WRITE_PERMISSION,
  OUTPUT_RECORDABLE_STATES,
  ProductionActionError,
  QualityHoldError,
  emitOutbox,
  hasPermission,
  holdsGuard,
  readWoExecutionStatus,
  type OrgContextLike,
} from '../shared';

// ─── Input schema ──────────────────────────────────────────────────────────────
// REGULATED QUANTITY BOUNDARY (food-MES, NUMERIC-exact): qty_kg / catch weights
// are decimal STRINGS ONLY. We deliberately REJECT JS `number` here — a number
// cannot represent an exact decimal (IEEE-754 drift) and String(number) can emit
// exponential notation (e.g. 1e-7) or a rounded mantissa, corrupting a regulated
// weight before it ever reaches the NUMERIC column. The client must send the raw
// decimal as a string; it is bound straight to ::numeric in SQL (no float ever).
const DecimalString = z
  .string()
  .transform((v) => v.trim())
  .refine((s) => /^-?\d+(\.\d+)?$/.test(s), {
    message: 'must be a plain decimal string (no JS number / exponential notation)',
  });

export const RegisterOutputInput = z.object({
  transaction_id: z.string().uuid(),
  operator_id: z.string().uuid().optional(),
  output_type: z.enum(['primary', 'co_product', 'by_product']),
  product_id: z.string().uuid(),
  qty_kg: DecimalString.optional(),
  qtyKg: DecimalString.optional(),
  qtyUnits: DecimalString.optional(),
  unitsUom: z.enum(['each', 'box']).optional(),
  actualWeightKg: DecimalString.optional(),
  uom: z.string().min(1).max(16).optional(),
  lp_id: z.string().uuid().optional(),
  lot_id: z.string().uuid().optional(),
  batch_number: z.string().min(1).max(64).optional(),
  // T-032 catch-weight: array of per-unit kg. Required only when weight_mode='catch'
  // (enforced in the service after the item is loaded, not in the schema).
  catch_weight_kg_per_unit: z.array(DecimalString).min(1).optional(),
  // Optional explicit tolerance override (fraction, e.g. 0.10). Defaults below.
  catch_weight_tolerance_pct: z.number().min(0).max(1).optional(),
}).refine((value) => !value.qtyUnits || !!value.unitsUom, {
  path: ['unitsUom'],
  message: 'unitsUom is required when qtyUnits is present',
}).refine((value) => !!value.actualWeightKg || !!value.qtyUnits || !!value.qty_kg || !!value.qtyKg, {
  path: ['qty_kg'],
  message: 'qty_kg, qtyKg, actualWeightKg, or qtyUnits is required',
});

export type RegisterOutputInputType = z.infer<typeof RegisterOutputInput>;

export type CatchWeightSummary = {
  avg_kg: string;
  total_kg: string;
  variance_pct: string;
  warning: boolean;
};

export type MassBalanceWarning = {
  expected_input_kg: string;
  posted_consumption_kg: string;
  effective_yield_pct: string;
  warn_pct: number;
};

export type RegisterOutputResult = {
  output_id: string;
  lp_id: string | null;
  /** Set when this call CREATED the output LP (F-A04/F-B08); null on caller-supplied lp_id. */
  lp_number: string | null;
  batch_number: string;
  expiry_date: string | null;
  catch_weight_summary: CatchWeightSummary | null;
  mass_balance_warning?: MassBalanceWarning;
  /** Stubbed until T-033 (PDF label). */
  label_pdf_url: string | null;
};

const DEFAULT_CATCH_WEIGHT_TOLERANCE = 0.1; // 10% — PRD §7.3 default
const MASS_BALANCE_WARN_PCT = 0.02;

type ItemRow = {
  id: string;
  weight_mode: 'fixed' | 'catch';
  shelf_life_days: number | null;
  nominal_weight: string | null;
  variance_tolerance_pct: string | null;
  cost_per_kg: string | null;
};

type WoRow = {
  id: string;
  wo_number: string;
  site_id: string | null;
  uom: string;
  uom_snapshot: Record<string, unknown> | null;
};

type SiteWarehouseTarget = { id: string; default_location_id: string | null };
type OutputLpMoveRow = { site_id: string | null; location_id: string | null };

type SuppliedOutputLpRow = {
  id: string;
  product_id: string;
  quantity: string;
  uom: string;
  status: string;
  qa_status: string;
  site_id: string | null;
  warehouse_id: string;
  wo_id: string | null;
  location_id: string | null;
};

type GenealogyAllocation = { lp_id: string; alloc_qty: string; uom: string };

const TERMINAL_OUTPUT_LP_STATUSES = ['consumed', 'merged', 'shipped', 'returned', 'destroyed'] as const;

const NO_WAREHOUSE_FOR_SITE_MESSAGE =
  'No warehouse is configured for your site — set one in Settings -> Sites';

type MassBalanceGateRow = {
  expected_input_kg: string | null;
  posted_consumption_kg: string;
  effective_yield_pct: string;
  block_pct: string;
  warn: boolean;
  block: boolean;
};

// ─── Fixed-point decimal helpers (NUMERIC-exact, no binary float on kg) ──────────
// We keep kg as integer micro-units (1e-6) internally so summation/division for
// the catch-weight summary is exact to 6 fractional digits, then render back to
// trimmed decimal strings. wo_outputs.qty_kg is NUMERIC(12,3); the per-unit
// summary is informational and we publish 3-decimal kg + a 4-decimal variance.
const SCALE = 1_000_000n;

function toMicro(decimal: string): bigint {
  const neg = decimal.startsWith('-');
  const body = neg ? decimal.slice(1) : decimal;
  const [intPart, fracRaw = ''] = body.split('.');
  const frac = (fracRaw + '000000').slice(0, 6);
  const micro = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
  return neg ? -micro : micro;
}

function microToDecimal(micro: bigint, dp: number): string {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const intPart = abs / SCALE;
  const fracFull = (abs % SCALE).toString().padStart(6, '0');
  const fracTrim = fracFull.slice(0, dp);
  const out = dp > 0 ? `${intPart}.${fracTrim}` : `${intPart}`;
  return neg && abs !== 0n ? `-${out}` : out;
}

/**
 * Compute the catch-weight summary from a per-unit kg array. Variance is
 * |avg - reference| / reference, computed in micro-units. Returns variance_pct
 * as a fraction string (e.g. '1.0000' = 100%) per the task's AC2 (variance_pct=1.0).
 */
export function computeCatchWeightSummary(
  perUnitKg: readonly string[],
  referenceKg: string,
  tolerance: number,
): CatchWeightSummary {
  const microUnits = perUnitKg.map(toMicro);
  const totalMicro = microUnits.reduce((a, b) => a + b, 0n);
  const count = BigInt(microUnits.length);
  // avg in micro-units (round to nearest)
  const avgMicro = (totalMicro + count / 2n) / count;

  const refMicro = toMicro(referenceKg);
  let variancePctStr = '0.0000';
  let warning = false;
  if (refMicro !== 0n) {
    const diff = avgMicro >= refMicro ? avgMicro - refMicro : refMicro - avgMicro;
    // variance fraction scaled to 4 dp: (diff / ref) -> *10000
    const variance4dp = (diff * 10_000n + refMicro / 2n) / refMicro;
    const intP = variance4dp / 10_000n;
    const fracP = (variance4dp % 10_000n).toString().padStart(4, '0');
    variancePctStr = `${intP}.${fracP}`;
    // warning when fraction > tolerance
    const toleranceMicroPct = BigInt(Math.round(tolerance * 10_000));
    warning = variance4dp > toleranceMicroPct;
  }

  return {
    avg_kg: microToDecimal(avgMicro, 3),
    total_kg: microToDecimal(totalMicro, 3),
    variance_pct: variancePctStr,
    warning,
  };
}

async function loadWo(ctx: OrgContextLike, woId: string): Promise<WoRow> {
  const { rows } = await ctx.client.query<WoRow>(
    `select id, wo_number
            , site_id::text as site_id
            , uom
            , uom_snapshot
       from public.work_orders
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [woId],
  );
  const wo = rows[0];
  if (!wo) throw new ProductionActionError('not_found', 404);
  return wo;
}

async function loadItem(ctx: OrgContextLike, productId: string): Promise<ItemRow> {
  const { rows } = await ctx.client.query<ItemRow>(
    `select id, weight_mode, shelf_life_days, nominal_weight, variance_tolerance_pct, cost_per_kg::text as cost_per_kg
       from public.items
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [productId],
  );
  const item = rows[0];
  // product_id is a soft FK (service-layer validated). A missing item is an
  // invalid reference, not a 404 on the WO.
  if (!item) throw new ProductionActionError('invalid_reference', 422, { field: 'product_id' });
  return item;
}

/**
 * V-PROD-03: registered output product must match the WO primary item or a
 * declared co/by-product on the WO schedule / active BOM snapshot.
 */
async function assertOutputProductAllowed(
  ctx: OrgContextLike,
  woId: string,
  productId: string,
  outputType: RegisterOutputInputType['output_type'],
): Promise<void> {
  const { rows } = await ctx.client.query<{ allowed: boolean }>(
    `with wo as (
       select product_id, active_bom_header_id
         from public.work_orders
        where org_id = app.current_org_id()
          and id = $1::uuid
        limit 1
     ),
     allowed_products as (
       select wo.product_id as item_id, 'primary'::text as role
         from wo
       union
       select so.product_id, so.output_role
         from public.schedule_outputs so
        where so.org_id = app.current_org_id()
          and so.planned_wo_id = $1::uuid
       union
       select bcp.co_product_item_id,
              case when bcp.is_byproduct then 'byproduct' else 'co_product' end
         from public.bom_co_products bcp
         join wo on wo.active_bom_header_id = bcp.bom_header_id
        where bcp.org_id = app.current_org_id()
     )
     select exists (
       select 1
         from allowed_products ap
        where ap.item_id = $2::uuid
          and (
            ($3 = 'primary' and ap.role = 'primary')
            or ($3 = 'co_product' and ap.role = 'co_product')
            or ($3 = 'by_product' and ap.role in ('byproduct', 'by_product'))
          )
     ) as allowed`,
    [woId, productId, outputType],
  );
  if (!rows[0]?.allowed) {
    throw new ProductionActionError('invalid_reference', 422, {
      field: 'product_id',
      output_type: outputType,
      message: 'Output product is not declared on this work order or its active BOM.',
    });
  }
}

async function nextBatchNumber(
  ctx: OrgContextLike,
  woId: string,
  woNumber: string,
  outputType: string,
): Promise<string> {
  await ctx.client.query(
    `select pg_advisory_xact_lock(hashtext($1::text || '::' || $2::text))`,
    [woId, outputType],
  );
  const { rows } = await ctx.client.query<{ seq: string }>(
    `select count(*)::text as seq
       from public.wo_outputs
      where wo_id = $1::uuid
        and org_id = app.current_org_id()
        and output_type = $2
        and correction_of_id is null`,
    [woId, outputType],
  );
  const seq = Number(rows[0]?.seq ?? '0') + 1;
  return `${woNumber}-OUT-${String(seq).padStart(3, '0')}`;
}

/**
 * Genealogy source (F-B08): allocate each parent's net consumed qty across this WO's
 * output LPs proportionally to the registering output's share of total WO output,
 * capped by remaining unattributed parent qty and (for mass-compatible UoMs) this
 * output qty so summed child edges never exceed the parent's net consumption.
 */
async function allocateGenealogyContributionsForOutput(
  ctx: OrgContextLike,
  woId: string,
  outputQty: string,
  outputUom: string,
): Promise<GenealogyAllocation[]> {
  // Serialize ALL genealogy allocation for this WO (not per output type) so
  // concurrent registrations cannot collectively exceed each parent's net consumption.
  await ctx.client.query(
    `select pg_advisory_xact_lock(hashtext($1::text || '::genealogy'))`,
    [woId],
  );

  const { rows: mixedUomParents } = await ctx.client.query<{ lp_id: string; uoms: string[] }>(
    `select mc.lp_id::text as lp_id,
            array_agg(distinct mc.uom order by mc.uom) as uoms
       from public.wo_material_consumption mc
      where mc.org_id = app.current_org_id()
        and mc.wo_id = $1::uuid
        and mc.lp_id <> '00000000-0000-0000-0000-000000000000'::uuid
      group by mc.lp_id
     having count(distinct mc.uom) > 1`,
    [woId],
  );
  if (mixedUomParents.length > 0) {
    const mixed = mixedUomParents[0]!;
    throw new ProductionActionError('uom_mismatch', 409, {
      lp_id: mixed.lp_id,
      uoms: mixed.uoms,
      message: 'Parent LP has consumption ledger rows in more than one UoM; cannot allocate genealogy.',
    });
  }

  const { rows } = await ctx.client.query<GenealogyAllocation & { consumption_uom: string }>(
    `with parent_net as (
       select mc.lp_id,
              sum(mc.qty_consumed) as net_qty,
              min(mc.uom) as consumption_uom
         from public.wo_material_consumption mc
        where mc.org_id = app.current_org_id()
          and mc.wo_id = $1::uuid
          and mc.lp_id <> '00000000-0000-0000-0000-000000000000'::uuid
        group by mc.lp_id
       having sum(mc.qty_consumed) > 0::numeric
          and count(distinct mc.uom) = 1
     ),
     wo_output_total as (
       select coalesce(sum(o.qty_kg), 0::numeric) as total_output_qty
         from public.wo_outputs o
        where o.org_id = app.current_org_id()
          and o.wo_id = $1::uuid
          and o.correction_of_id is null
     ),
     already_attributed as (
       select lg.parent_lp_id,
              sum(lg.qty) as attributed_qty
         from public.lp_genealogy lg
         join public.license_plates child_lp
           on child_lp.org_id = lg.org_id
          and child_lp.id = lg.child_lp_id
         join public.wo_outputs o
           on o.org_id = child_lp.org_id
          and o.lp_id = child_lp.id
          and o.wo_id = $1::uuid
        where lg.org_id = app.current_org_id()
          and lg.relation_type = 'consumed'
        group by lg.parent_lp_id
     )
     select pn.lp_id::text as lp_id,
            least(
              pn.net_qty * $2::numeric / nullif(wot.total_output_qty, 0::numeric),
              pn.net_qty - coalesce(aa.attributed_qty, 0::numeric),
              case
                when pn.consumption_uom = $3 and $3 in ('kg', 'g', 'lb')
                  then $2::numeric
                else pn.net_qty
              end
            )::text as alloc_qty,
            pn.consumption_uom as uom,
            pn.consumption_uom
       from parent_net pn
       cross join wo_output_total wot
       left join already_attributed aa on aa.parent_lp_id = pn.lp_id
      where wot.total_output_qty > 0::numeric
        and least(
              pn.net_qty * $2::numeric / wot.total_output_qty,
              pn.net_qty - coalesce(aa.attributed_qty, 0::numeric),
              case
                when pn.consumption_uom = $3 and $3 in ('kg', 'g', 'lb')
                  then $2::numeric
                else pn.net_qty
              end
            ) > 0::numeric
      order by pn.lp_id asc`,
    [woId, outputQty, outputUom],
  );

  for (const row of rows) {
    if (row.consumption_uom !== outputUom) {
      throw new ProductionActionError('uom_mismatch', 409, {
        uom: row.consumption_uom,
        expected_uom: outputUom,
        message: 'Parent consumption UoM does not match the output UoM for genealogy allocation.',
      });
    }
  }

  return rows.map(({ lp_id, alloc_qty, uom }) => ({ lp_id, alloc_qty, uom }));
}

/**
 * Caller-supplied output LP: lock, validate product/site/UoM/status/QA/WO ownership,
 * then increment quantity atomically in the same txn as the receipt move.
 */
async function validateAndLockSuppliedOutputLp(
  ctx: OrgContextLike,
  params: {
    lpId: string;
    productId: string;
    qtyKg: string;
    uom: string;
    woId: string;
    woSiteId: string | null;
    destinationWarehouseId: string;
  },
): Promise<SuppliedOutputLpRow> {
  const { rows } = await ctx.client.query<SuppliedOutputLpRow>(
    `select lp.id::text as id,
            lp.product_id::text as product_id,
            lp.quantity::text as quantity,
            lp.uom,
            lp.status,
            lp.qa_status,
            lp.site_id::text as site_id,
            lp.warehouse_id::text as warehouse_id,
            lp.wo_id::text as wo_id,
            lp.location_id::text as location_id
       from public.license_plates lp
      where lp.org_id = app.current_org_id()
        and lp.id = $1::uuid
      limit 1
      for update of lp`,
    [params.lpId],
  );
  const lp = rows[0];
  if (!lp) {
    throw new ProductionActionError('invalid_reference', 422, { field: 'lp_id' });
  }
  if (lp.product_id !== params.productId) {
    throw new ProductionActionError('invalid_reference', 422, {
      field: 'lp_id',
      message: 'Supplied license plate product does not match the output product.',
    });
  }
  if (lp.uom !== params.uom) {
    throw new ProductionActionError('uom_mismatch', 409, { uom: lp.uom, expected_uom: params.uom });
  }
  if (!lp.warehouse_id) {
    throw new ProductionActionError('invalid_reference', 422, {
      field: 'lp_id',
      message: 'Supplied license plate has no warehouse scope.',
    });
  }
  if (lp.warehouse_id !== params.destinationWarehouseId) {
    throw new ProductionActionError('invalid_reference', 422, {
      field: 'lp_id',
      message: 'Supplied license plate warehouse does not match the work order output destination.',
    });
  }
  if (params.woSiteId) {
    if (!lp.site_id) {
      throw new ProductionActionError('invalid_reference', 422, {
        field: 'lp_id',
        message: 'Supplied license plate site is required for a site-scoped work order.',
      });
    }
    if (lp.site_id !== params.woSiteId) {
      throw new ProductionActionError('invalid_reference', 422, {
        field: 'lp_id',
        message: 'Supplied license plate site does not match the work order site.',
      });
    }
  }
  // wo_id null is allowed — internal reuse of a pre-created output shell LP for this WO.
  if (lp.wo_id && lp.wo_id !== params.woId) {
    throw new ProductionActionError('invalid_reference', 422, {
      field: 'lp_id',
      message: 'Supplied license plate is linked to a different work order.',
    });
  }
  if ((TERMINAL_OUTPUT_LP_STATUSES as readonly string[]).includes(lp.status)) {
    throw new ProductionActionError('lp_not_receivable', 409, { status: lp.status });
  }
  if (lp.status !== 'received') {
    throw new ProductionActionError('lp_not_receivable', 409, { status: lp.status });
  }
  if (lp.qa_status !== 'pending') {
    throw new ProductionActionError('lp_not_receivable', 409, { qa_status: lp.qa_status });
  }
  return lp;
}

async function incrementSuppliedOutputLpQuantity(
  ctx: OrgContextLike,
  params: { lpId: string; qtyKg: string; actorUserId: string },
): Promise<void> {
  const { rows } = await ctx.client.query<{ id: string; quantity: string }>(
    `update public.license_plates
        set quantity = quantity + $2::numeric,
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid
    returning id::text, quantity::text`,
    [params.lpId, params.qtyKg, params.actorUserId],
  );
  if (!rows[0]) {
    throw new ProductionActionError('persistence_failed', 500);
  }
}

async function evaluateMassBalanceGate(
  ctx: OrgContextLike,
  woId: string,
  qtyKg: string,
): Promise<MassBalanceWarning | undefined> {
  const { rows } = await ctx.client.query<MassBalanceGateRow>(
    `with cfg as (
       select coalesce(
                case
                  when (tv.feature_flags->>'massbalance_threshold_pct') ~ '^[0-9]+(\\.[0-9]+)?$'
                    then (tv.feature_flags->>'massbalance_threshold_pct')::numeric
                  else 0
                end,
                0
              ) as block_pct
         from public.tenant_variations tv
        where tv.org_id = app.current_org_id()
     ),
     yield_ctx as (
       select coalesce(
                (
                  select wop.expected_yield_percent
                    from public.wo_operations wop
                   where wop.org_id = app.current_org_id()
                     and wop.wo_id = wo.id
                     and wop.expected_yield_percent is not null
                   order by wop.sequence asc
                   limit 1
                ),
                bh.yield_pct,
                -- Missing yield data falls back to factor 1.0.
                100::numeric
              ) as effective_yield_pct
         from public.work_orders wo
         left join public.bom_headers bh
           on bh.org_id = wo.org_id
          and bh.id = wo.active_bom_header_id
        where wo.org_id = app.current_org_id()
          and wo.id = $1::uuid
        limit 1
     ),
     totals as (
       select coalesce(
                (select sum(o.qty_kg)
                   from public.wo_outputs o
                  where o.org_id = app.current_org_id()
                    and o.wo_id = $1::uuid),
                0::numeric
              ) + $2::numeric as running_output_kg,
              ${woPostedConsumptionKgSubquery('$1')} as posted_consumption_kg
     )
     select case
              when y.effective_yield_pct > 0
                then (t.running_output_kg / (y.effective_yield_pct / 100.0))::text
              else null
            end as expected_input_kg,
            t.posted_consumption_kg::text as posted_consumption_kg,
            y.effective_yield_pct::text as effective_yield_pct,
            coalesce((select block_pct from cfg), 0)::text as block_pct,
            t.posted_consumption_kg > 0
              and y.effective_yield_pct > 0
              and t.running_output_kg
                    > (t.posted_consumption_kg * (y.effective_yield_pct / 100.0) * (1 + $3::numeric)) as warn,
            t.posted_consumption_kg > 0
              and y.effective_yield_pct > 0
              and coalesce((select block_pct from cfg), 0) > 0
              and t.running_output_kg
                    > (t.posted_consumption_kg * (y.effective_yield_pct / 100.0) * (1 + coalesce((select block_pct from cfg), 0) / 100)) as block
       from yield_ctx y
       cross join totals t`,
    [woId, qtyKg, MASS_BALANCE_WARN_PCT],
  );
  const gate = rows[0];
  if (!gate || gate.posted_consumption_kg === '0' || gate.expected_input_kg === null) return undefined;

  if (gate.block) {
    throw new ProductionActionError('insufficient_input_for_output', 409, {
      message: `Insufficient posted input for output: expected ${gate.expected_input_kg} kg, posted ${gate.posted_consumption_kg} kg, yield ${gate.effective_yield_pct}%, threshold ${gate.block_pct}%.`,
      expected_input_kg: gate.expected_input_kg,
      posted_consumption_kg: gate.posted_consumption_kg,
      effective_yield_pct: gate.effective_yield_pct,
      block_pct: gate.block_pct,
    });
  }

  if (!gate.warn) return undefined;
  return {
    expected_input_kg: gate.expected_input_kg,
    posted_consumption_kg: gate.posted_consumption_kg,
    effective_yield_pct: gate.effective_yield_pct,
    warn_pct: MASS_BALANCE_WARN_PCT,
  };
}

async function resolveWarehouseForSessionSite(ctx: OrgContextLike): Promise<SiteWarehouseTarget | null> {
  // Resilient resolution for the output LP's warehouse: prefer a warehouse
  // linked to the active site, then the org default, then the org's first
  // warehouse. The previous version filtered strictly on `w.site_id = ctx.siteId`
  // AND returned null when the WO/session had no site — so every desktop output
  // 409'd 'no_warehouse_for_site' in orgs that hadn't wired site↔warehouse yet
  // (the common state: warehouses with site_id NULL + no default). Now returns
  // null only when the org genuinely has zero warehouses.
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

/**
 * 8b (F-A04/F-B08): materialize the output as INVENTORY. Creates the output LP
 * in the SAME transaction as the wo_outputs row:
 *   - warehouse/location = the scanner session site's default warehouse and
 *     its first location;
 *   - status 'received' + qa_status 'pending' — the LP is NOT born 'available';
 *     it flows through the QA release → available promotion path;
 *   - genealogy: parent_lp_id = FIRST consumed LP (license_plates models a
 *     SINGLE parent); ALL consumed LPs are recorded in ext_jsonb.consumed_lp_ids.
 *     MODELLING GAP (reported): N consumed parents cannot be expressed
 *     relationally without a junction table (future lp_genealogy migration).
 * Idempotency: on replay the wo_outputs transaction_id unique (23505) fires
 * BEFORE this block and aborts the whole txn — no duplicate/orphan LP.
 */
async function createOutputLp(
  ctx: OrgContextLike,
  input: {
    woId: string;
    productId: string;
    quantity: string;
    uom: string;
    batchNumber: string;
    expiryDate: string | null; // 'YYYY-MM-DD' from the wo_outputs insert
    transactionId: string;
    actorUserId: string;
    siteId: string | null;
    /** Dual-UoM actual weight for catch-weight items; persisted on license_plates.catch_weight_kg. */
    catchWeightKg?: string | null;
  },
): Promise<{ id: string; lp_number: string }> {
  const warehouse = await resolveWarehouseForSessionSite(ctx);
  if (!warehouse) {
    throw new ProductionActionError('no_warehouse_for_site', 409, {
      reason: 'no_warehouse_for_site',
      message: NO_WAREHOUSE_FOR_SITE_MESSAGE,
    });
  }

  const consumedParents = await allocateGenealogyContributionsForOutput(
    ctx,
    input.woId,
    input.quantity,
    input.uom,
  );
  const consumedLpIds = consumedParents.map((parent) => parent.lp_id);
  const parentLpId = consumedLpIds[0] ?? null;
  const lpNumber = makeLpNumber();

  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.license_plates (
       org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
       catch_weight_kg, status, qa_status, batch_number, expiry_date, best_before_date,
       origin, wo_id, parent_lp_id, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::numeric, $7,
       $8::numeric, 'received', 'pending', $9, $10::timestamptz, $10::timestamptz,
       'production', $11::uuid, $12::uuid,
       jsonb_build_object('consumed_lp_ids', $13::jsonb), $14::uuid, $14::uuid
     )
     returning id`,
    [
      input.siteId,
      warehouse.id,
      warehouse.default_location_id,
      lpNumber,
      input.productId,
      input.quantity,
      input.uom,
      input.catchWeightKg ?? null,
      input.batchNumber,
      input.expiryDate,
      input.woId,
      parentLpId,
      JSON.stringify(consumedLpIds),
      input.actorUserId,
    ],
  );
  const lp = rows[0];
  if (!lp) throw new ProductionActionError('persistence_failed', 500);

  if (consumedParents.length > 0) {
    for (const parent of consumedParents) {
      await ctx.client.query(
        `insert into public.lp_genealogy (
           org_id, child_lp_id, parent_lp_id, relation_type, qty, uom
         )
         values (app.current_org_id(), $1::uuid, $2::uuid, 'consumed', $3::numeric, $4)
         on conflict (org_id, child_lp_id, parent_lp_id, relation_type) do nothing`,
        [lp.id, parent.lp_id, parent.alloc_qty, parent.uom],
      );
    }
  }

  // Genesis row in the LP transition ledger (same contract as the GRN flow).
  await ctx.client.query(
    `insert into public.lp_state_history (
       org_id, lp_id, from_state, to_state, reason_code, reason_text,
       wo_id, transaction_id, created_by
     )
     values (app.current_org_id(), $1::uuid, null, 'received', 'production_output',
             'WO output registration', $2::uuid, $3::uuid, $4::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [lp.id, input.woId, input.transactionId, input.actorUserId],
  );

  return { id: lp.id, lp_number: lpNumber };
}

/**
 * Register a single output row for a WO. The route supplies an OrgContextLike
 * bound to a withOrgContext transaction; this function never opens its own.
 */
export async function registerOutput(
  ctx: OrgContextLike,
  woId: string,
  rawBody: unknown,
): Promise<RegisterOutputResult> {
  // 1. validate
  const parsed = RegisterOutputInput.safeParse(rawBody);
  if (!parsed.success) {
    throw new ProductionActionError('invalid_input', 422, {
      fields: parsed.error.issues.map((i) => i.path.join('.')),
      message: parsed.error.message,
    });
  }
  const input = parsed.data;

  // 2. RBAC
  if (!(await hasPermission(ctx, PRODUCTION_OUTPUT_WRITE_PERMISSION))) {
    throw new ProductionActionError('forbidden', 403);
  }

  // 3. load WO + item (catch-weight qty must be derived before persistence — S17).
  const wo = await loadWo(ctx, woId);
  await assertOutputProductAllowed(ctx, woId, input.product_id, input.output_type);
  const item = await loadItem(ctx, input.product_id);

  let catchSummary: CatchWeightSummary | null = null;
  let catchDetailsJson: string | null = null;
  let persistedQtyUnits: string | null = input.qtyUnits ?? null;
  let persistedActualWeightKg: string | null = input.actualWeightKg ?? null;

  if (item.weight_mode === 'catch') {
    if (!input.catch_weight_kg_per_unit || input.catch_weight_kg_per_unit.length === 0) {
      throw new ProductionActionError('invalid_input', 422, {
        fields: ['catch_weight_kg_per_unit'],
      });
    }
    const reference = item.nominal_weight ?? '0';
    const tolerance =
      input.catch_weight_tolerance_pct ??
      (item.variance_tolerance_pct != null
        ? Number(item.variance_tolerance_pct) / 100
        : DEFAULT_CATCH_WEIGHT_TOLERANCE);
    catchSummary = computeCatchWeightSummary(
      input.catch_weight_kg_per_unit,
      reference,
      tolerance,
    );
    catchDetailsJson = JSON.stringify({
      per_unit_kg: input.catch_weight_kg_per_unit,
      avg_kg: catchSummary.avg_kg,
      total_kg: catchSummary.total_kg,
      variance_pct: catchSummary.variance_pct,
      variance_warning: catchSummary.warning,
      reference_kg: reference,
      tolerance,
    });
    persistedQtyUnits = String(input.catch_weight_kg_per_unit.length);
    persistedActualWeightKg = catchSummary.total_kg;
  } else if (input.catch_weight_kg_per_unit && input.catch_weight_kg_per_unit.length > 0) {
    throw new ProductionActionError('invalid_input', 422, {
      fields: ['catch_weight_kg_per_unit'],
      message: "item.weight_mode is 'fixed' — catch weights not accepted",
    });
  }

  const resolvedQtyKg =
    item.weight_mode === 'catch' && catchSummary
      ? catchSummary.total_kg
      : await resolveQtyKg(ctx.client, wo, input);
  // V-PROD-03: registered output quantity must be > 0.
  if (toMicro(resolvedQtyKg) <= 0n) {
    throw new ProductionActionError('invalid_input', 422, { fields: ['qty_kg'] });
  }

  const wacContribution = await resolveOutputWacContribution(ctx.client, {
    woId,
    qtyKg: resolvedQtyKg,
    standardCostPerKg: item.cost_per_kg,
  });
  if (
    !wacContribution.applied &&
    wacContribution.excluded === 'un_costed' &&
    wacContribution.unCostedLines.length > 0
  ) {
    throw new ProductionActionError('wac_un_costed', 422, {
      unCostedLines: wacContribution.unCostedLines,
    });
  }

  // 4. WO must be in a recordable lifecycle state (read-only).
  const status = await readWoExecutionStatus(ctx, woId);
  if (status === null || !OUTPUT_RECORDABLE_STATES.has(status)) {
    throw new ProductionActionError('wo_not_recordable', 409, { status });
  }

  // 5. quality consume gate FIRST (on the consumed/output LP + lot). On an active
  //    hold we throw QualityHoldError; the route emits production.consume.blocked
  //    on a committed connection (this txn rolls back — no output row written).
  const hold = await holdsGuard(ctx, { lpId: input.lp_id, lotId: input.lot_id });
  if (hold) {
    throw new QualityHoldError({
      hold,
      woId,
      blockedPath: 'output',
      transactionId: input.transaction_id,
      lpId: input.lp_id ?? null,
      lotId: input.lot_id ?? null,
    });
  }

  // 6. batch_number + expiry_date (V-PROD-04).
  const batchNumber =
    input.batch_number ?? (await nextBatchNumber(ctx, woId, wo.wo_number, input.output_type));

  const massBalanceWarning = await evaluateMassBalanceGate(ctx, woId, resolvedQtyKg);

  const outputUom = input.uom ?? wo.uom;
  let suppliedLp: SuppliedOutputLpRow | null = null;
  if (input.lp_id) {
    const destinationWarehouse = await resolveWarehouseForSessionSite(ctx);
    if (!destinationWarehouse) {
      throw new ProductionActionError('no_warehouse_for_site', 409, {
        reason: 'no_warehouse_for_site',
        message: NO_WAREHOUSE_FOR_SITE_MESSAGE,
      });
    }
    suppliedLp = await validateAndLockSuppliedOutputLp(ctx, {
      lpId: input.lp_id,
      productId: input.product_id,
      qtyKg: resolvedQtyKg,
      uom: outputUom,
      woId,
      woSiteId: wo.site_id,
      destinationWarehouseId: destinationWarehouse.id,
    });
  }

  // 8. INSERT wo_outputs (V-PROD-24 unique-per-org-per-year enforced by index).
  let outputId: string;
  let lpId: string | null;
  let expiryDate: string | null;
  try {
    const { rows } = await ctx.client.query<{ id: string; lp_id: string | null; expiry_date: string | null }>(
      `insert into public.wo_outputs
         (org_id, site_id, transaction_id, wo_id, output_type, product_id, lp_id,
          batch_number, qty_kg, uom, catch_weight_details, registered_by, created_by,
          expiry_date, qty_units, units_uom, actual_weight_kg, qa_status)
       values
         (app.current_org_id(), $15::uuid, $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
          $6, $7::numeric, $8, $9::jsonb, $10::uuid, $10::uuid,
          case when $11::int is not null then (current_date + ($11::int || ' days')::interval)::date else null end,
          $12::numeric, $13, $14::numeric,
          case
            when exists (
              select 1
                from public.v_active_holds h
               where h.org_id = app.current_org_id()
                 and h.reference_type = 'wo'
                 and h.reference_id = $2::uuid
            ) then 'ON_HOLD'
            else 'PENDING'
          end)
       returning id, lp_id, to_char(expiry_date, 'YYYY-MM-DD') as expiry_date`,
    [
      input.transaction_id,
      woId,
      input.output_type,
      input.product_id,
      input.lp_id ?? null,
      batchNumber,
      resolvedQtyKg,
      outputUom,
        catchDetailsJson,
        input.operator_id ?? ctx.userId,
        item.shelf_life_days,
        persistedQtyUnits,
        input.unitsUom ?? null,
        persistedActualWeightKg,
        wo.site_id,
      ],
    );
    const row = rows[0];
    if (!row) throw new ProductionActionError('persistence_failed', 500);
    outputId = row.id;
    lpId = row.lp_id;
    expiryDate = row.expiry_date;
  } catch (err) {
    if (err instanceof ProductionActionError) throw err;
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      // transaction_id unique (R14 idempotency replay) OR V-PROD-24 batch+year.
      throw new ProductionActionError('already_recorded', 409);
    }
    if (code === '23514' || code === '23503') {
      throw new ProductionActionError('invalid_reference', 422);
    }
    throw err;
  }

  // Owner policy (mig 336): mass-balance over-production is WARN + FLAG, never a hard
  // block. When the warn tier fired (registered output exceeds what the yield-adjusted
  // consumed input could yield), persist a flag on the WO — in the SAME transaction as
  // the output — so over-produced orders are visible on the list/detail. Idempotent:
  // keeps the FIRST flag timestamp; not cleared when an output is later voided (the
  // over-production event still happened and stays on the record).
  if (massBalanceWarning) {
    await ctx.client.query(
      `update public.work_orders
          set over_production_flagged = true,
              over_production_flagged_at = coalesce(over_production_flagged_at, now())
        where id = $1::uuid
          and org_id = app.current_org_id()`,
      [woId],
    );
  }

  // 8b. Output → LP (F-A04/F-B08): when the caller did not hand us an existing
  // LP, create the output LP atomically in this same txn and back-link it.
  let lpNumber: string | null = null;
  if (!lpId) {
    const createdLp = await createOutputLp(ctx, {
      woId,
      productId: input.product_id,
      quantity: resolvedQtyKg,
      uom: input.uom ?? wo.uom,
      batchNumber,
      expiryDate,
      transactionId: input.transaction_id,
      actorUserId: input.operator_id ?? ctx.userId,
      siteId: wo.site_id,
      catchWeightKg: item.weight_mode === 'catch' ? persistedActualWeightKg : null,
    });
    lpId = createdLp.id;
    lpNumber = createdLp.lp_number;
    await ctx.client.query(
      `update public.wo_outputs
          set lp_id = $2::uuid,
              updated_by = $3::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [outputId, lpId, input.operator_id ?? ctx.userId],
    );
  }

  const outputLp = suppliedLp
    ? {
        rows: [{ site_id: suppliedLp.site_id, location_id: suppliedLp.location_id }],
      }
    : await ctx.client.query<OutputLpMoveRow>(
        `select site_id::text as site_id,
                location_id::text as location_id
           from public.license_plates
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [lpId],
      );
  const outputLpMove = outputLp.rows[0];
  if (!outputLpMove) {
    throw new ProductionActionError('invalid_reference', 422);
  }
  await ctx.client.query(
    `insert into public.stock_moves (
       org_id, site_id, move_number, lp_id, move_type, to_location_id,
       quantity, uom, reason_code, reason_text, transaction_id, wo_id,
       status, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2, $3::uuid, 'receipt', $4::uuid,
       $5::numeric, $6, 'production_output', 'WO output receipt',
       $7::uuid, $8::uuid, 'completed', $9::jsonb, $10::uuid, $10::uuid
     )
     on conflict (org_id, transaction_id) do nothing`,
    [
      outputLpMove.site_id,
      makeStockMoveNumber(input.transaction_id),
      lpId,
      outputLpMove.location_id,
      resolvedQtyKg,
      outputUom,
      input.transaction_id,
      woId,
      JSON.stringify({ source: 'production_output', wo_id: woId, output_id: outputId }),
      input.operator_id ?? ctx.userId,
    ],
  );

  if (suppliedLp) {
    await incrementSuppliedOutputLpQuantity(ctx, {
      lpId: suppliedLp.id,
      qtyKg: resolvedQtyKg,
      actorUserId: input.operator_id ?? ctx.userId,
    });
  }

  if (wacContribution.applied) {
    await upsertWac(ctx.client, {
      orgId: ctx.orgId,
      siteId: wo.site_id,
      itemId: input.product_id,
      deltaQtyKg: wacContribution.deltaQtyKg,
      deltaValue: wacContribution.deltaValue,
      updatedBy: input.operator_id ?? ctx.userId,
    });
    await ctx.client.query(
      `update public.wo_outputs
          set ext_jsonb = coalesce(ext_jsonb, '{}'::jsonb) || $2::jsonb,
              updated_by = $3::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [
        outputId,
        JSON.stringify({
          wac_qty_kg: wacContribution.deltaQtyKg,
          wac_value: wacContribution.deltaValue,
          wac_cost_source: wacContribution.source,
        }),
        input.operator_id ?? ctx.userId,
      ],
    );
  }

  // 9. outbox (same txn).
  await emitOutbox(ctx, {
    eventType: PRODUCTION_OUTPUT_RECORDED_EVENT,
    aggregateType: 'wo',
    aggregateId: woId,
    payload: {
      org_id: ctx.orgId,
      output_id: outputId,
      wo_id: woId,
      output_type: input.output_type,
      product_id: input.product_id,
      lp_id: lpId,
      batch_number: batchNumber,
      qty_kg: resolvedQtyKg,
      uom: outputUom,
      qty_units: persistedQtyUnits,
      units_uom: input.unitsUom ?? null,
      actual_weight_kg: persistedActualWeightKg,
      catch_weight_variance_warning: catchSummary?.warning ?? false,
      mass_balance_warning: massBalanceWarning ?? null,
      actor_user_id: ctx.userId,
    },
    dedupKey: `${PRODUCTION_OUTPUT_RECORDED_EVENT}:${input.transaction_id}`,
  });

  return {
    output_id: outputId,
    lp_id: lpId,
    lp_number: lpNumber,
    batch_number: batchNumber,
    expiry_date: expiryDate,
    catch_weight_summary: catchSummary,
    mass_balance_warning: massBalanceWarning,
    label_pdf_url: null, // T-033
  };
}
async function resolveQtyKg(
  client: OrgContextLike['client'],
  wo: WoRow,
  input: RegisterOutputInputType,
): Promise<string> {
  if (input.actualWeightKg) return input.actualWeightKg;
  if (input.qtyUnits && input.unitsUom) {
    const snap = woSnapshotWacQtyFields(wo.uom_snapshot, wo.uom);
    const resolution = await resolveWacDeltaQtyKgFromSnapshot(client, {
      qty: input.qtyUnits,
      uom: input.unitsUom,
      uomBase: snap.uomBase,
      netQtyPerEach: snap.netQtyPerEach,
      eachPerBox: snap.eachPerBox,
    });
    if (!resolution.resolved) {
      throw new ProductionActionError('uom_conversion_unavailable', 422, {
        fields: ['qtyUnits', 'unitsUom'],
      });
    }
    return resolution.qtyKg;
  }
  return input.qty_kg ?? input.qtyKg ?? '0';
}
