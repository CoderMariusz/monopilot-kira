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

import { snapshotFromItemRow, toBaseQty, TypedError } from '../../uom/convert';
import { makeLpNumber } from '../../warehouse/lp-create';
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
};

type WoRow = {
  id: string;
  wo_number: string;
  uom: string;
  uom_snapshot: Record<string, unknown> | null;
};

type SiteWarehouseTarget = { id: string; default_location_id: string | null };

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
    `select id, weight_mode, shelf_life_days, nominal_weight, variance_tolerance_pct
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
 * Genealogy source (F-B08): the LPs this WO consumed, from the canonical
 * consumption ledger (wo_material_consumption — the only consume writer),
 * ordered by first consumption so [0] is the primary parent.
 */
async function loadConsumedLpIds(ctx: OrgContextLike, woId: string): Promise<string[]> {
  const { rows } = await ctx.client.query<{ lp_id: string }>(
    // Exclude the sentinel nil UUID that no-LP consumes write
    // (consume-material-actions.ts: lp_id coalesces to
    // '00000000-0000-0000-0000-000000000000'). Without this filter a WO whose
    // only consumes were LP-less would give the output a phantom parent_lp_id
    // pointing at a license_plates row that does not exist — corrupting
    // genealogy. Filtering here keeps parent_lp_id null instead.
    `select lp_id::text as lp_id
       from public.wo_material_consumption
      where org_id = app.current_org_id()
        and wo_id = $1::uuid
        and lp_id <> '00000000-0000-0000-0000-000000000000'::uuid
      group by lp_id
      order by min(consumed_at) asc, lp_id asc`,
    [woId],
  );
  return rows.map((r) => r.lp_id);
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
              coalesce(
                (select sum(c.qty_consumed)
                  from public.wo_material_consumption c
                  where c.org_id = app.current_org_id()
                    and c.wo_id = $1::uuid
                    and c.uom = 'kg'),
                0::numeric
              ) as posted_consumption_kg
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
              and (t.running_output_kg / (y.effective_yield_pct / 100.0))
                    > (t.posted_consumption_kg * (1 + $3::numeric)) as warn,
            t.posted_consumption_kg > 0
              and y.effective_yield_pct > 0
              and coalesce((select block_pct from cfg), 0) > 0
              and (t.running_output_kg / (y.effective_yield_pct / 100.0))
                    > (t.posted_consumption_kg * (1 + coalesce((select block_pct from cfg), 0) / 100)) as block
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
  if (!ctx.siteId) return null;
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
        and w.site_id = $1::uuid
      order by w.is_default desc nulls last
      limit 1`,
    [ctx.siteId],
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
  },
): Promise<{ id: string; lp_number: string }> {
  const warehouse = await resolveWarehouseForSessionSite(ctx);
  if (!warehouse) {
    throw new ProductionActionError('no_warehouse_for_site', 409, {
      reason: 'no_warehouse_for_site',
      message: NO_WAREHOUSE_FOR_SITE_MESSAGE,
    });
  }

  const consumedLpIds = await loadConsumedLpIds(ctx, input.woId);
  const parentLpId = consumedLpIds[0] ?? null;
  const lpNumber = makeLpNumber();

  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.license_plates (
       org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
       status, qa_status, batch_number, expiry_date, best_before_date,
       origin, wo_id, parent_lp_id, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::numeric, $7,
       'received', 'pending', $8, $9::timestamptz, $9::timestamptz,
       'production', $10::uuid, $11::uuid,
       jsonb_build_object('consumed_lp_ids', $12::jsonb), $13::uuid, $13::uuid
     )
     returning id`,
    [
      ctx.siteId,
      warehouse.id,
      warehouse.default_location_id,
      lpNumber,
      input.productId,
      input.quantity,
      input.uom,
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

  if (consumedLpIds.length > 0) {
    for (const consumedLpId of consumedLpIds) {
      await ctx.client.query(
        `insert into public.lp_genealogy (
           org_id, child_lp_id, parent_lp_id, relation_type, qty, uom
         )
         values (app.current_org_id(), $1::uuid, $2::uuid, 'consumed', $3::numeric, $4)
         on conflict (org_id, child_lp_id, parent_lp_id, relation_type) do nothing`,
        [lp.id, consumedLpId, input.quantity, input.uom],
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

  // 3. load WO + item
  const wo = await loadWo(ctx, woId);
  const resolvedQtyKg = resolveQtyKg(wo, input);
  // V-PROD-03: registered output quantity must be > 0.
  if (toMicro(resolvedQtyKg) <= 0n) {
    throw new ProductionActionError('invalid_input', 422, { fields: ['qty_kg'] });
  }
  const item = await loadItem(ctx, input.product_id);

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

  // 7. catch-weight (T-032).
  let catchSummary: CatchWeightSummary | null = null;
  let catchDetailsJson: string | null = null;
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
  } else if (input.catch_weight_kg_per_unit && input.catch_weight_kg_per_unit.length > 0) {
    // Red-line: do not require/accept catch weights for non-catch items silently;
    // a caller sending them against a 'fixed' item is an input error.
    throw new ProductionActionError('invalid_input', 422, {
      fields: ['catch_weight_kg_per_unit'],
      message: "item.weight_mode is 'fixed' — catch weights not accepted",
    });
  }

  const massBalanceWarning = await evaluateMassBalanceGate(ctx, woId, resolvedQtyKg);

  // 8. INSERT wo_outputs (V-PROD-24 unique-per-org-per-year enforced by index).
  let outputId: string;
  let lpId: string | null;
  let expiryDate: string | null;
  try {
    const { rows } = await ctx.client.query<{ id: string; lp_id: string | null; expiry_date: string | null }>(
      `insert into public.wo_outputs
         (org_id, site_id, transaction_id, wo_id, output_type, product_id, lp_id,
          batch_number, qty_kg, uom, catch_weight_details, registered_by, created_by,
          expiry_date, qty_units, units_uom, actual_weight_kg)
       values
         (app.current_org_id(), null, $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
          $6, $7::numeric, $8, $9::jsonb, $10::uuid, $10::uuid,
          case when $11::int is not null then (current_date + ($11::int || ' days')::interval)::date else null end,
          $12::numeric, $13, $14::numeric)
       returning id, lp_id, to_char(expiry_date, 'YYYY-MM-DD') as expiry_date`,
      [
        input.transaction_id,
        woId,
        input.output_type,
        input.product_id,
        input.lp_id ?? null,
        batchNumber,
        resolvedQtyKg,
        input.uom ?? wo.uom,
        catchDetailsJson,
        input.operator_id ?? ctx.userId,
        item.shelf_life_days,
        input.qtyUnits ?? null,
        input.unitsUom ?? null,
        input.actualWeightKg ?? null,
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
      uom: input.uom ?? wo.uom,
      qty_units: input.qtyUnits ?? null,
      units_uom: input.unitsUom ?? null,
      actual_weight_kg: input.actualWeightKg ?? null,
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

function resolveQtyKg(wo: WoRow, input: RegisterOutputInputType): string {
  if (input.actualWeightKg) return input.actualWeightKg;
  if (input.qtyUnits && input.unitsUom) {
    try {
      const snapshotRow = wo.uom_snapshot ?? {};
      const snap = snapshotFromItemRow({ ...snapshotRow, uom_base: wo.uom });
      return toBaseQty(snap, Number(input.qtyUnits), input.unitsUom).toFixed(3);
    } catch (error) {
      if (error instanceof TypedError && error.code === 'uom_conversion_unavailable') {
        throw new ProductionActionError('uom_conversion_unavailable', 422, {
          fields: ['qtyUnits', 'unitsUom'],
        });
      }
      throw error;
    }
  }
  return input.qty_kg ?? input.qtyKg ?? '0';
}
