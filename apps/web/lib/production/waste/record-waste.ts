/**
 * Waste recording (08-production E3) — write a categorized waste row into
 * public.wo_waste_log and emit production.waste.recorded. Feeds the yield gate
 * (output_yield_gate_v1), finance loss accounting, and reporting analytics.
 *
 * Flow (atomic, single txn supplied by the route's withOrgContext):
 *   1. zod-validate the body.
 *   2. RBAC: caller must hold production.waste.write.
 *   3. Load the WO (RLS-scoped); WO must be in a recordable lifecycle state.
 *   4. Resolve category_code → waste_categories.id (02-Settings taxonomy shell,
 *      migration 183). An unknown/inactive code is an invalid reference (V-PROD-05).
 *   5. holdsGuard(lpId, lotId) FIRST — active 09-quality hold ⇒ 409 +
 *      production.consume.blocked outbox event.
 *   6. INSERT wo_waste_log (qty_kg > 0 enforced by schema; R14 idempotency on
 *      transaction_id).
 *   7. emit production.waste.recorded in the SAME txn.
 *
 * NUMERIC-exact: qty_kg is a decimal string straight into NUMERIC(12,3); never
 * coerced through a binary float.
 */
import { z } from 'zod';

import {
  PRODUCTION_WASTE_RECORDED_EVENT,
  PRODUCTION_WASTE_WRITE_PERMISSION,
  OUTPUT_RECORDABLE_STATES,
  ProductionActionError,
  QualityHoldError,
  emitOutbox,
  hasPermission,
  holdsGuard,
  readWoExecutionStatus,
  type OrgContextLike,
} from '../shared';

// REGULATED QUANTITY BOUNDARY (food-MES, NUMERIC-exact): qty_kg is a decimal STRING ONLY.
// JS `number` is rejected — it cannot represent an exact decimal (IEEE-754 drift) and
// String(number) can emit exponential notation, corrupting a regulated weight before the
// NUMERIC column. Bound straight to ::numeric in SQL (mirrors register-output; Codex round-2).
const DecimalString = z
  .string()
  .transform((v) => v.trim())
  .refine((s) => /^-?\d+(\.\d+)?$/.test(s), {
    message: 'must be a plain decimal string (no JS number / exponential notation)',
  });

export const RecordWasteInput = z.object({
  transaction_id: z.string().uuid(),
  category_code: z.string().min(1).max(64),
  qty_kg: DecimalString,
  reason_code: z.string().min(1).max(64).optional(),
  reason_notes: z.string().max(2000).optional(),
  operator_id: z.string().uuid().optional(),
  shift_id: z.string().min(1).max(64),
  lp_id: z.string().uuid().optional(),
  lot_id: z.string().uuid().optional(),
  scan_event_id: z.string().uuid().optional(),
});

export type RecordWasteInputType = z.infer<typeof RecordWasteInput>;

export type RecordWasteResult = {
  waste_id: string;
  category_id: string;
  category_code: string;
  qty_kg: string;
};

const SCALE = 1_000_000n;
function toMicro(decimal: string): bigint {
  const neg = decimal.startsWith('-');
  const body = neg ? decimal.slice(1) : decimal;
  const [intPart, fracRaw = ''] = body.split('.');
  const frac = (fracRaw + '000000').slice(0, 6);
  const micro = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
  return neg ? -micro : micro;
}

type WoRow = { id: string; wo_number: string };

async function loadWo(ctx: OrgContextLike, woId: string): Promise<WoRow> {
  const { rows } = await ctx.client.query<WoRow>(
    `select id, wo_number
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

async function resolveCategoryId(ctx: OrgContextLike, categoryCode: string): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `select id
       from public.waste_categories
      where org_id = app.current_org_id()
        and code = $1
        and is_active = true
      limit 1`,
    [categoryCode],
  );
  const cat = rows[0];
  if (!cat) throw new ProductionActionError('invalid_reference', 422, { field: 'category_code' });
  return cat.id;
}

export async function recordWaste(
  ctx: OrgContextLike,
  woId: string,
  rawBody: unknown,
): Promise<RecordWasteResult> {
  // 1. validate
  const parsed = RecordWasteInput.safeParse(rawBody);
  if (!parsed.success) {
    throw new ProductionActionError('invalid_input', 422, {
      fields: parsed.error.issues.map((i) => i.path.join('.')),
      message: parsed.error.message,
    });
  }
  const input = parsed.data;

  // V-PROD-05 red-line: waste qty must be strictly positive.
  if (toMicro(input.qty_kg) <= 0n) {
    throw new ProductionActionError('invalid_input', 422, { fields: ['qty_kg'] });
  }

  // 2. RBAC
  if (!(await hasPermission(ctx, PRODUCTION_WASTE_WRITE_PERMISSION))) {
    throw new ProductionActionError('forbidden', 403);
  }

  // 3. load WO + lifecycle gate
  await loadWo(ctx, woId);
  const status = await readWoExecutionStatus(ctx, woId);
  if (status === null || !OUTPUT_RECORDABLE_STATES.has(status)) {
    throw new ProductionActionError('wo_not_recordable', 409, { status });
  }

  // 4. category taxonomy resolve (V-PROD-05).
  const categoryId = await resolveCategoryId(ctx, input.category_code);

  // 5. quality consume gate FIRST. Active hold ⇒ QualityHoldError; the route
  //    emits production.consume.blocked on a committed connection.
  const hold = await holdsGuard(ctx, { lpId: input.lp_id, lotId: input.lot_id });
  if (hold) {
    throw new QualityHoldError({
      hold,
      woId,
      blockedPath: 'waste',
      transactionId: input.transaction_id,
      lpId: input.lp_id ?? null,
      lotId: input.lot_id ?? null,
    });
  }

  if (input.lp_id) {
    const lpGate = await ctx.client.query<{ id: string; quantity: string; reserved_qty: string; has_available: boolean }>(
      `select id::text as id,
              quantity::text as quantity,
              reserved_qty::text as reserved_qty,
              (quantity - reserved_qty >= $2::numeric) as has_available
         from public.license_plates
        where id = $1::uuid
          and org_id = $3::uuid
        limit 1
        for update`,
      [input.lp_id, input.qty_kg, ctx.orgId],
    );
    const lp = lpGate.rows[0];
    if (!lp) {
      throw new ProductionActionError('invalid_reference', 422, { field: 'lp_id' });
    }
    if (!lp.has_available) {
      throw new ProductionActionError('insufficient_lp_quantity', 409, {
        message: 'Insufficient available quantity on license plate for waste quantity.',
      });
    }

    const lpRes = await ctx.client.query<{ id: string; quantity: string }>(
      `update public.license_plates
          set quantity = quantity - $3::numeric,
              status = case when quantity - $3::numeric <= 0 then 'destroyed' else status end,
              updated_at = now()
        where org_id = $1::uuid
          and id = $2::uuid
          and quantity - $3::numeric >= reserved_qty
        returning id::text, quantity::text as quantity`,
      [ctx.orgId, input.lp_id, input.qty_kg],
    );
    if (!lpRes.rows[0]) {
      throw new Error('recordWaste: LP decrement failed after availability gate');
    }
  }

  // 6. INSERT wo_waste_log.
  let wasteId: string;
  try {
    const { rows } = await ctx.client.query<{ id: string }>(
      `insert into public.wo_waste_log
         (org_id, site_id, transaction_id, wo_id, category_id, qty_kg, reason_code,
          reason_notes, operator_id, shift_id, scan_event_id, lp_id)
       values
         (app.current_org_id(), null, $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5,
          $6, $7::uuid, $8, $9::uuid, $10::uuid)
       returning id`,
      [
        input.transaction_id,
        woId,
        categoryId,
        input.qty_kg,
        input.reason_code ?? null,
        input.reason_notes ?? null,
        input.operator_id ?? ctx.userId,
        input.shift_id,
        input.scan_event_id ?? null,
        input.lp_id ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new ProductionActionError('persistence_failed', 500);
    wasteId = row.id;
  } catch (err) {
    if (err instanceof ProductionActionError) throw err;
    const code = (err as { code?: string }).code;
    if (code === '23505') throw new ProductionActionError('already_recorded', 409);
    if (code === '23514' || code === '23503') {
      throw new ProductionActionError('invalid_reference', 422);
    }
    throw err;
  }

  // 7. outbox (same txn) — feeds yield gate + finance loss + reporting.
  await emitOutbox(ctx, {
    eventType: PRODUCTION_WASTE_RECORDED_EVENT,
    aggregateType: 'wo',
    aggregateId: woId,
    payload: {
      org_id: ctx.orgId,
      waste_id: wasteId,
      wo_id: woId,
      category_id: categoryId,
      category_code: input.category_code,
      qty_kg: input.qty_kg,
      reason_code: input.reason_code ?? null,
      shift_id: input.shift_id,
      actor_user_id: ctx.userId,
    },
    dedupKey: `${PRODUCTION_WASTE_RECORDED_EVENT}:${input.transaction_id}`,
  });

  return {
    waste_id: wasteId,
    category_id: categoryId,
    category_code: input.category_code,
    qty_kg: input.qty_kg,
  };
}
