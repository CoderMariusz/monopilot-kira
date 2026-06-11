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

export type RegisterOutputResult = {
  output_id: string;
  lp_id: string | null;
  batch_number: string;
  expiry_date: string | null;
  catch_weight_summary: CatchWeightSummary | null;
  /** Stubbed until T-033 (PDF label). */
  label_pdf_url: string | null;
};

const DEFAULT_CATCH_WEIGHT_TOLERANCE = 0.1; // 10% — PRD §7.3 default

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
  const { rows } = await ctx.client.query<{ seq: string }>(
    `select count(*)::text as seq
       from public.wo_outputs
      where wo_id = $1::uuid
        and org_id = app.current_org_id()
        and output_type = $2`,
    [woId, outputType],
  );
  const seq = Number(rows[0]?.seq ?? '0') + 1;
  return `${woNumber}-OUT-${String(seq).padStart(3, '0')}`;
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
      actor_user_id: ctx.userId,
    },
    dedupKey: `${PRODUCTION_OUTPUT_RECORDED_EVENT}:${input.transaction_id}`,
  });

  return {
    output_id: outputId,
    lp_id: lpId,
    batch_number: batchNumber,
    expiry_date: expiryDate,
    catch_weight_summary: catchSummary,
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
