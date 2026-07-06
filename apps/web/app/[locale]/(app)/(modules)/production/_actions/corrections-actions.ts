'use server';

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';
import {
  assertCorrectionAllowed,
  CORRECTION_REASON_CODES,
  CorrectionForbiddenError,
  CorrectionInvalidInputError,
  correctionTransactionId,
  type CorrectionReasonCode,
  insertCounterEntry,
} from '../../../../../../lib/corrections/correct-ledger-entry';
import { CONSUMPTION_CORRECT_PERMISSION } from '../../../../../../lib/corrections/constants';
import { materialIdFromConsumptionExt } from '../../../../../../lib/corrections/material-scope';
import { computeWacReversalDelta, applyConsumptionWacReversal, upsertWac } from '../../../../../../lib/finance/upsert-wac';
import type { ProductionContext, QueryClient } from '../../../../../../lib/production/shared';
import { makeStockMoveNumber } from '../../../../../../lib/warehouse/lp-create';

const WASTE_CORRECT_PERMISSION = 'production.waste.correct';
const OUTPUT_CORRECT_PERMISSION = 'production.output.correct';
const OUTPUT_VOID_INTENT = 'production.output.void';
const CONSUMPTION_REVERSE_INTENT = 'production.consumption.reverse';
const NO_LP_ID = '00000000-0000-0000-0000-000000000000';
// 'destroyed' became legal in migration 294 (the mig-191 CHECK lacked it even
// though app code already excluded it from active-LP sets). Distinct from
// 'consumed' so voided pallets never pollute consumption semantics.
const VOIDED_LP_STATUS = 'destroyed';

export type VoidWasteEntryInput = {
  wasteId: string;
  reasonCode: CorrectionReasonCode;
  note?: string | null;
};

export type VoidWasteEntryResult =
  | { ok: true }
  | {
      ok: false;
      error: 'forbidden' | 'not_found' | 'already_corrected' | 'invalid_input' | 'persistence_failed';
      message?: string;
    };

export type VoidWoOutputInput = {
  outputId: string;
  reasonCode: CorrectionReasonCode;
  note?: string | null;
  signature: { password: string };
};

export type VoidWoOutputResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'forbidden'
        | 'not_found'
        | 'already_corrected'
        | 'lp_not_voidable'
        | 'invalid_input'
        | 'esign_failed'
        | 'persistence_failed';
      message?: string;
    };

export type ReverseConsumptionInput = {
  consumptionId: string;
  reasonCode: CorrectionReasonCode;
  note?: string | null;
  signature: { password: string };
};

export type ReverseConsumptionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'forbidden'
        | 'not_found'
        | 'already_corrected'
        | 'lp_not_restorable'
        | 'inconsistent_ledger'
        | 'invalid_input'
        | 'esign_failed'
        | 'persistence_failed';
      message?: string;
    };

type WasteRow = {
  id: string;
  transaction_id: string;
  site_id: string | null;
  wo_id: string;
  category_id: string;
  qty_kg: string;
  reason_code: string | null;
  reason_notes: string | null;
  operator_id: string | null;
  shift_id: string;
  recorded_at: string;
  wo_status: string | null;
};

type OutputRow = {
  id: string;
  transaction_id: string;
  site_id: string | null;
  wo_id: string;
  output_type: string;
  product_id: string;
  lp_id: string | null;
  batch_number: string;
  qty_kg: string;
  uom: string;
  qa_status: string;
  expiry_date: string | null;
  catch_weight_details: unknown;
  allergen_profile_snapshot: unknown;
  cost_per_kg: string | null;
  ext_jsonb: unknown;
  registered_by: string | null;
  registered_at: string;
  wo_status: string | null;
};

type ConsumptionRow = {
  id: string;
  transaction_id: string;
  site_id: string | null;
  wo_id: string;
  component_id: string;
  lp_id: string;
  qty_consumed: string;
  uom: string;
  operator_id: string | null;
  fefo_adherence_flag: boolean;
  fefo_deviation_reason: string | null;
  over_consumption_flag: boolean;
  over_consumption_approved_by: string | null;
  over_consumption_approved_at: string | null;
  over_consumption_reason_code: string | null;
  ext_jsonb: unknown;
  consumed_at: string;
  wo_status: string | null;
};

type LicensePlateRow = {
  id: string;
  site_id: string | null;
  location_id: string | null;
  status: string;
  qa_status: string;
  quantity: string;
  reserved_qty: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isReasonCode(value: string): value is CorrectionReasonCode {
  return CORRECTION_REASON_CODES.includes(value as CorrectionReasonCode);
}

function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return trimmed.slice(1);
  return `-${trimmed}`;
}

async function multiplyNumeric(ctx: ProductionContext, left: string, right: string | null): Promise<string> {
  const { rows } = await ctx.client.query<{ value: string }>(
    `select ($1::numeric * coalesce($2::numeric, 0))::text as value`,
    [left, right ?? '0'],
  );
  return rows[0]?.value ?? '0';
}

function isZeroDecimalString(value: string): boolean {
  return Number(value) === 0;
}

// Locks the original waste row (FOR UPDATE OF wl — same locking discipline as
// loadOutputForUpdate) so concurrent voids of the same row serialize. The
// hasWasteCorrection pre-check stays for a friendly error; the mig-296 unique
// partial index (org_id, correction_of_id) is the DB backstop — a losing racer
// hits 23505 on the counter INSERT, mapped to 'already_corrected'.
async function loadWasteForUpdate(ctx: ProductionContext, wasteId: string): Promise<WasteRow | null> {
  const { rows } = await ctx.client.query<WasteRow>(
    `select wl.id::text as id,
            wl.transaction_id::text as transaction_id,
            wl.site_id::text as site_id,
            wl.wo_id::text as wo_id,
            wl.category_id::text as category_id,
            wl.qty_kg::text as qty_kg,
            wl.reason_code,
            wl.reason_notes,
            wl.operator_id::text as operator_id,
            wl.shift_id,
            wl.recorded_at::text as recorded_at,
            coalesce(we.status, wo.status)::text as wo_status
       from public.wo_waste_log wl
       join public.work_orders wo on wo.id = wl.wo_id and wo.org_id = wl.org_id
       left join public.wo_executions we on we.wo_id = wl.wo_id and we.org_id = wl.org_id
      where wl.org_id = app.current_org_id()
        and wl.id = $1::uuid
        and wl.correction_of_id is null
      limit 1
      for update of wl`,
    [wasteId],
  );
  return rows[0] ?? null;
}

async function hasWasteCorrection(ctx: ProductionContext, wasteId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.wo_waste_log
      where org_id = app.current_org_id()
        and correction_of_id = $1::uuid
      limit 1`,
    [wasteId],
  );
  return rows.length > 0;
}

async function loadOutputForUpdate(ctx: ProductionContext, outputId: string): Promise<OutputRow | null> {
  const { rows } = await ctx.client.query<OutputRow>(
    `select o.id::text as id,
            o.transaction_id::text as transaction_id,
            o.site_id::text as site_id,
            o.wo_id::text as wo_id,
            o.output_type,
            o.product_id::text as product_id,
            o.lp_id::text as lp_id,
            o.batch_number,
            o.qty_kg::text as qty_kg,
            o.uom,
            o.qa_status,
            o.expiry_date::text as expiry_date,
            o.catch_weight_details,
            o.allergen_profile_snapshot,
            i.cost_per_kg::text as cost_per_kg,
            o.ext_jsonb,
            o.registered_by::text as registered_by,
            o.registered_at::text as registered_at,
            coalesce(we.status, wo.status)::text as wo_status
       from public.wo_outputs o
       join public.work_orders wo on wo.id = o.wo_id and wo.org_id = o.org_id
       left join public.items i on i.id = o.product_id and i.org_id = o.org_id
       left join public.wo_executions we on we.wo_id = o.wo_id and we.org_id = o.org_id
      where o.org_id = app.current_org_id()
        and o.id = $1::uuid
        and o.correction_of_id is null
      limit 1
      for update of o`,
    [outputId],
  );
  return rows[0] ?? null;
}

async function loadConsumptionForUpdate(ctx: ProductionContext, consumptionId: string): Promise<ConsumptionRow | null> {
  const { rows } = await ctx.client.query<ConsumptionRow>(
    `select c.id::text as id,
            c.transaction_id::text as transaction_id,
            c.site_id::text as site_id,
            c.wo_id::text as wo_id,
            c.component_id::text as component_id,
            c.lp_id::text as lp_id,
            c.qty_consumed::text as qty_consumed,
            c.uom,
            c.operator_id::text as operator_id,
            c.fefo_adherence_flag,
            c.fefo_deviation_reason,
            c.over_consumption_flag,
            c.over_consumption_approved_by::text as over_consumption_approved_by,
            c.over_consumption_approved_at::text as over_consumption_approved_at,
            c.over_consumption_reason_code,
            c.ext_jsonb,
            c.consumed_at::text as consumed_at,
            coalesce(we.status, wo.status)::text as wo_status
       from public.wo_material_consumption c
       join public.work_orders wo on wo.id = c.wo_id and wo.org_id = c.org_id
       left join public.wo_executions we on we.wo_id = c.wo_id and we.org_id = c.org_id
      where c.org_id = app.current_org_id()
        and c.id = $1::uuid
        and c.correction_of_id is null
      limit 1
      for update of c`,
    [consumptionId],
  );
  return rows[0] ?? null;
}

async function loadLicensePlateForUpdate(ctx: ProductionContext, lpId: string): Promise<LicensePlateRow | null> {
  const { rows } = await ctx.client.query<LicensePlateRow>(
    `select id::text as id,
            site_id::text as site_id,
            location_id::text as location_id,
            status,
            qa_status,
            quantity::text as quantity,
            reserved_qty::text as reserved_qty
       from public.license_plates
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1
      for update`,
    [lpId],
  );
  return rows[0] ?? null;
}

async function hasOutputCorrection(ctx: ProductionContext, outputId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.wo_outputs
      where org_id = app.current_org_id()
        and correction_of_id = $1::uuid
      limit 1`,
    [outputId],
  );
  return rows.length > 0;
}

async function hasConsumptionCorrection(ctx: ProductionContext, consumptionId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.wo_material_consumption
      where org_id = app.current_org_id()
        and correction_of_id = $1::uuid
      limit 1`,
    [consumptionId],
  );
  return rows.length > 0;
}

async function hasLpConsumptionOrChildren(ctx: ProductionContext, lpId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select (
       (
         select coalesce(sum(qty_consumed), 0)
           from public.wo_material_consumption
          where org_id = app.current_org_id()
            and lp_id = $1::uuid
       ) > 0
       or exists (
         select 1
           from public.license_plates
          where org_id = app.current_org_id()
            and parent_lp_id = $1::uuid
       )
     ) as ok`,
    [lpId],
  );
  return rows[0]?.ok === true;
}

// F1/F3 (R3 review) — lock the matching wo_materials row(s) BEFORE any write and
// prove SQL-side (NUMERIC-exact, no JS floats) that the decrement stays
// non-negative. withOrgContext COMMITS on return, so every ok:false gate must
// fire before the first mutation; this select is that gate for the ledger.
async function lockWoMaterialsAndValidateDecrement(ctx: ProductionContext, original: ConsumptionRow): Promise<boolean> {
  const materialId = materialIdFromConsumptionExt(original);

  if (!materialId) {
    const { rows } = await ctx.client.query<{ id: string; can_decrement: boolean; matching_line_count: string }>(
      `with locked_materials as (
         select id,
                consumed_qty
           from public.wo_materials
          where org_id = app.current_org_id()
            and wo_id = $1::uuid
            and product_id = $2::uuid
          for update
       )
       select id::text as id,
              (consumed_qty - $3::numeric >= 0) as can_decrement,
              (select count(*) from locked_materials)::text as matching_line_count
         from locked_materials`,
      [original.wo_id, original.component_id, original.qty_consumed],
    );
    return rows.length === 1 && rows[0]?.matching_line_count === '1' && rows[0].can_decrement;
  }

  const { rows } = await ctx.client.query<{ id: string; can_decrement: boolean }>(
    `select id::text as id,
            (consumed_qty - $3::numeric >= 0) as can_decrement
       from public.wo_materials
      where org_id = app.current_org_id()
        and wo_id = $1::uuid
        and ${materialId ? 'id' : 'product_id'} = $2::uuid
        and consumed_qty - $3::numeric >= 0
      for update`,
    [original.wo_id, materialId ?? original.component_id, original.qty_consumed],
  );
  // Mirrors decrementConsumedQty's WHERE.
  return rows.length > 0 && rows.every((row) => row.can_decrement);
}

async function decrementConsumedQty(ctx: ProductionContext, original: ConsumptionRow): Promise<boolean> {
  const materialId = materialIdFromConsumptionExt(original);

  if (!materialId) {
    const { rows } = await ctx.client.query<{ id: string }>(
      `with locked_materials as (
         select id
           from public.wo_materials
          where org_id = app.current_org_id()
            and wo_id = $1::uuid
            and product_id = $2::uuid
          for update
       ),
       single_material as (
         select id
           from locked_materials
          where (select count(*) from locked_materials) = 1
       )
       update public.wo_materials wm
          set consumed_qty = wm.consumed_qty - $3::numeric,
              updated_at = now()
         from single_material sm
        where wm.org_id = app.current_org_id()
          and wm.id = sm.id
          and wm.consumed_qty - $3::numeric >= 0
        returning wm.id::text as id`,
      [original.wo_id, original.component_id, original.qty_consumed],
    );
    return rows.length === 1;
  }

  const { rows } = await ctx.client.query<{ id: string }>(
    `update public.wo_materials
        set consumed_qty = consumed_qty - $3::numeric,
            updated_at = now()
      where org_id = app.current_org_id()
        and wo_id = $1::uuid
        and ${materialId ? 'id' : 'product_id'} = $2::uuid
        and consumed_qty - $3::numeric >= 0
      returning id::text as id`,
    [original.wo_id, materialId ?? original.component_id, original.qty_consumed],
  );
  return rows.length > 0;
}

async function writeWasteVoidAudit(
  ctx: ProductionContext,
  params: {
    original: WasteRow;
    correctionId: string;
    reasonCode: CorrectionReasonCode;
    note: string | null;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events (
       org_id,
       actor_user_id,
       actor_type,
       action,
       resource_type,
       resource_id,
       before_state,
       after_state,
       request_id,
       retention_class
     )
     values (
       app.current_org_id(),
       $1::uuid,
       'user',
       'production.waste.corrected',
       'wo_waste_log',
       $2,
       $3::jsonb,
       $4::jsonb,
       $5::uuid,
       'operational'
     )`,
    [
      ctx.userId,
      params.original.id,
      JSON.stringify({
        waste_id: params.original.id,
        wo_id: params.original.wo_id,
        qty_kg: params.original.qty_kg,
        reason_code: params.original.reason_code,
      }),
      JSON.stringify({
        correction_id: params.correctionId,
        correction_of_id: params.original.id,
        reason_code: params.reasonCode,
        note: params.note,
      }),
      randomUUID(),
    ],
  );
}

async function writeOutputVoidStockMove(
  ctx: ProductionContext,
  params: { original: OutputRow; lp: LicensePlateRow; correctionId: string; reasonCode: CorrectionReasonCode; note: string | null },
): Promise<void> {
  const transactionId = correctionTransactionId({
    orgId: ctx.orgId,
    table: 'wo_outputs',
    originalId: params.original.id,
    reasonCode: params.reasonCode,
  });
  await ctx.client.query(
    `insert into public.stock_moves (
       org_id, site_id, move_number, lp_id, move_type, from_location_id,
       quantity, uom, reason_code, reason_text, transaction_id, wo_id,
       status, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2, $3::uuid, 'adjustment', $4::uuid,
       $5::numeric, $6, 'output_voided', $7,
       $8::uuid, $9::uuid, 'completed', $10::jsonb, $11::uuid, $11::uuid
     )
     on conflict (org_id, transaction_id) do nothing`,
    [
      params.lp.site_id ?? params.original.site_id,
      makeStockMoveNumber(transactionId),
      params.lp.id,
      params.lp.location_id,
      negateDecimalString(params.original.qty_kg),
      params.original.uom,
      params.note,
      transactionId,
      params.original.wo_id,
      JSON.stringify({
        source: 'voidWoOutput',
        output_id: params.original.id,
        correction_id: params.correctionId,
        correction_reason_code: params.reasonCode,
      }),
      ctx.userId,
    ],
  );
}

async function writeConsumptionReverseStockMove(
  ctx: ProductionContext,
  params: { original: ConsumptionRow; lp: LicensePlateRow; correctionId: string; reasonCode: CorrectionReasonCode; note: string | null },
): Promise<void> {
  const transactionId = correctionTransactionId({
    orgId: ctx.orgId,
    table: 'wo_material_consumption',
    originalId: params.original.id,
    reasonCode: params.reasonCode,
  });
  await ctx.client.query(
    `insert into public.stock_moves (
       org_id, site_id, move_number, lp_id, move_type, from_location_id,
       quantity, uom, reason_code, reason_text, transaction_id, wo_id, wo_material_id,
       status, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2, $3::uuid, 'adjustment', $4::uuid,
       $5::numeric, $6, 'consumption_reversed', $7,
       $8::uuid, $9::uuid, $10::uuid, 'completed', $11::jsonb, $12::uuid, $12::uuid
     )
     on conflict (org_id, transaction_id) do nothing`,
    [
      params.lp.site_id ?? params.original.site_id,
      makeStockMoveNumber(transactionId),
      params.lp.id,
      params.lp.location_id,
      negateDecimalString(params.original.qty_consumed),
      params.original.uom,
      params.note,
      transactionId,
      params.original.wo_id,
      materialIdFromConsumptionExt(params.original) ?? params.original.component_id,
      JSON.stringify({
        source: 'reverseConsumption',
        consumption_id: params.original.id,
        correction_id: params.correctionId,
        correction_reason_code: params.reasonCode,
      }),
      ctx.userId,
    ],
  );
}

async function writeOutputVoidAudit(
  ctx: ProductionContext,
  params: {
    original: OutputRow;
    lp: LicensePlateRow;
    correctionId: string;
    reasonCode: CorrectionReasonCode;
    note: string | null;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events (
       org_id,
       actor_user_id,
       actor_type,
       action,
       resource_type,
       resource_id,
       before_state,
       after_state,
       request_id,
       retention_class
     )
     values (
       app.current_org_id(),
       $1::uuid,
       'user',
       'production.output.corrected',
       'wo_outputs',
       $2,
       $3::jsonb,
       $4::jsonb,
       $5::uuid,
       'operational'
     )`,
    [
      ctx.userId,
      params.original.id,
      JSON.stringify({
        output_id: params.original.id,
        wo_id: params.original.wo_id,
        lp_id: params.original.lp_id,
        qty_kg: params.original.qty_kg,
        lp_status: params.lp.status,
        lp_quantity: params.lp.quantity,
      }),
      JSON.stringify({
        correction_id: params.correctionId,
        correction_of_id: params.original.id,
        reason_code: params.reasonCode,
        note: params.note,
        lp_status: VOIDED_LP_STATUS,
        lp_quantity: '0',
      }),
      randomUUID(),
    ],
  );
}

async function writeConsumptionReverseAudit(
  ctx: ProductionContext,
  params: {
    original: ConsumptionRow;
    lp: LicensePlateRow | null;
    correctionId: string;
    reasonCode: CorrectionReasonCode;
    note: string | null;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events (
       org_id,
       actor_user_id,
       actor_type,
       action,
       resource_type,
       resource_id,
       before_state,
       after_state,
       request_id,
       retention_class
     )
     values (
       app.current_org_id(),
       $1::uuid,
       'user',
       'production.consumption.corrected',
       'wo_material_consumption',
       $2,
       $3::jsonb,
       $4::jsonb,
       $5::uuid,
       'operational'
     )`,
    [
      ctx.userId,
      params.original.id,
      JSON.stringify({
        consumption_id: params.original.id,
        wo_id: params.original.wo_id,
        component_id: params.original.component_id,
        lp_id: params.original.lp_id,
        qty_consumed: params.original.qty_consumed,
        lp_status: params.lp?.status ?? null,
        lp_quantity: params.lp?.quantity ?? null,
      }),
      JSON.stringify({
        correction_id: params.correctionId,
        correction_of_id: params.original.id,
        reason_code: params.reasonCode,
        note: params.note,
        reversed_qty: params.original.qty_consumed,
      }),
      randomUUID(),
    ],
  );
}

async function writeLpVoidHistory(
  ctx: ProductionContext,
  params: {
    original: OutputRow;
    lp: LicensePlateRow;
    reasonCode: CorrectionReasonCode;
    note: string | null;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.lp_state_history (
       org_id,
       site_id,
       lp_id,
       from_state,
       to_state,
       reason_code,
       reason_text,
       wo_id,
       transaction_id,
       ext_jsonb,
       created_by
     )
     values (
       app.current_org_id(),
       $1::uuid,
       $2::uuid,
       $3,
       $4,
       'output_voided',
       $5,
       $6::uuid,
       $7::uuid,
       $8::jsonb,
       $9::uuid
     )`,
    [
      params.original.site_id,
      params.lp.id,
      params.lp.status,
      VOIDED_LP_STATUS,
      params.note,
      params.original.wo_id,
      randomUUID(),
      JSON.stringify({
        output_id: params.original.id,
        correction_reason_code: params.reasonCode,
      }),
      ctx.userId,
    ],
  );
}

async function markLpVoided(ctx: ProductionContext, lpId: string): Promise<void> {
  await ctx.client.query(
    `update public.license_plates
        set status = $2,
            quantity = 0,
            reserved_qty = 0,
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [lpId, VOIDED_LP_STATUS, ctx.userId],
  );
}

async function unlinkLpGenealogyChildren(ctx: ProductionContext, lpId: string): Promise<void> {
  await ctx.client.query(
    `delete from public.lp_genealogy
      where org_id = app.current_org_id()
        and child_lp_id = $1::uuid`,
    [lpId],
  );
}

async function hasOpenLpQualityHold(ctx: ProductionContext, lpId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select exists (
       select 1
         from public.quality_holds
        where org_id = app.current_org_id()
          and reference_type = 'lp'
          and reference_id = $1::uuid
          and hold_status in ('open', 'investigating', 'escalated', 'quarantined')
          and released_at is null
     ) as ok`,
    [lpId],
  );
  return rows[0]?.ok === true;
}

// F4 (R3 review) — QA-aware restore target. A consumed LP goes back to
// 'available' (pickable) ONLY when its QA release still stands; QA holds restore
// to 'blocked' only while an active LP hold still exists, and other
// non-released statuses restore to 'received'. qa_status itself is preserved
// as-is. Partially-consumed LPs keep their status.
async function lpRestoreTargetState(ctx: ProductionContext, lp: LicensePlateRow): Promise<string> {
  if (lp.status !== 'consumed') return lp.status;
  if (lp.qa_status === 'on_hold') return (await hasOpenLpQualityHold(ctx, lp.id)) ? 'blocked' : 'received';
  return lp.qa_status === 'released' ? 'available' : 'received';
}

async function restoreLicensePlate(
  ctx: ProductionContext,
  params: { original: ConsumptionRow; lp: LicensePlateRow; toState: string },
): Promise<void> {
  await ctx.client.query(
    `update public.license_plates
        set quantity = quantity + $2::numeric,
            status = $4,
            consumed_by_wo_id = case when status = 'consumed' then null else consumed_by_wo_id end,
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [params.lp.id, params.original.qty_consumed, ctx.userId, params.toState],
  );
}

async function writeLpRestoredHistory(
  ctx: ProductionContext,
  params: {
    original: ConsumptionRow;
    lp: LicensePlateRow;
    toState: string;
    reasonCode: CorrectionReasonCode;
    note: string | null;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.lp_state_history (
       org_id,
       site_id,
       lp_id,
       from_state,
       to_state,
       reason_code,
       reason_text,
       wo_id,
       transaction_id,
       ext_jsonb,
       created_by
     )
     values (
       app.current_org_id(),
       $1::uuid,
       $2::uuid,
       $3,
       $4,
       'consumption_reversed',
       $5,
       $6::uuid,
       $7::uuid,
       $8::jsonb,
       $9::uuid
     )`,
    [
      params.lp.site_id ?? params.original.site_id,
      params.lp.id,
      params.lp.status,
      // F4 — the history row reflects the ACTUAL restore target (QA-aware), not
      // a hardcoded 'available'.
      params.toState,
      params.note,
      params.original.wo_id,
      randomUUID(),
      JSON.stringify({
        consumption_id: params.original.id,
        correction_reason_code: params.reasonCode,
        reversed_qty: params.original.qty_consumed,
      }),
      ctx.userId,
    ],
  );
}

export async function voidWasteEntry(input: VoidWasteEntryInput): Promise<VoidWasteEntryResult> {
  const wasteId = typeof input?.wasteId === 'string' ? input.wasteId.trim() : '';
  const reasonCode = typeof input?.reasonCode === 'string' ? input.reasonCode.trim() : '';
  const note = typeof input?.note === 'string' && input.note.trim().length > 0 ? input.note.trim() : null;

  if (!isUuid(wasteId) || !isReasonCode(reasonCode)) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<VoidWasteEntryResult & { woId?: string }> => {
      const ctx: ProductionContext = { userId, orgId, client: client as QueryClient };
      const original = await loadWasteForUpdate(ctx, wasteId);
      if (!original) return { ok: false, error: 'not_found' };

      try {
        await assertCorrectionAllowed(ctx, {
          permission: WASTE_CORRECT_PERMISSION,
          woStatus: original.wo_status,
          requireEsign: false,
        });
      } catch {
        return { ok: false, error: 'forbidden' };
      }

      if (await hasWasteCorrection(ctx, wasteId)) {
        return { ok: false, error: 'already_corrected' };
      }

      const correction = await insertCounterEntry<{ id: string }>(ctx, {
        table: 'wo_waste_log',
        originalId: original.id,
        reasonCode,
        transactionIdColumn: 'transaction_id',
        values: {
          site_id: original.site_id,
          wo_id: original.wo_id,
          category_id: original.category_id,
          qty_kg: negateDecimalString(original.qty_kg),
          reason_code: reasonCode,
          reason_notes: note,
          operator_id: userId,
          shift_id: original.shift_id,
          approved_by: null,
          scan_event_id: null,
        },
      });

      await writeWasteVoidAudit(ctx, {
        original,
        correctionId: correction.id,
        reasonCode,
        note,
      });

      return { ok: true, woId: original.wo_id };
    });

    if (result.ok && result.woId) {
      revalidateLocalized('/production', 'page');
      revalidateLocalized(`/production/wos/${result.woId}`, 'page');
    }

    return result.ok ? { ok: true } : result;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return { ok: false, error: 'already_corrected' };
    if (code === '23514' || code === '23503' || code === '22P02') return { ok: false, error: 'invalid_input' };
    console.error('[production] voidWasteEntry failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function voidWoOutput(input: VoidWoOutputInput): Promise<VoidWoOutputResult> {
  const outputId = typeof input?.outputId === 'string' ? input.outputId.trim() : '';
  const reasonCode = typeof input?.reasonCode === 'string' ? input.reasonCode.trim() : '';
  const note = typeof input?.note === 'string' && input.note.trim().length > 0 ? input.note.trim() : null;
  const password = typeof input?.signature?.password === 'string' ? input.signature.password : '';

  if (!isUuid(outputId) || !isReasonCode(reasonCode) || password.length === 0) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<VoidWoOutputResult & { woId?: string }> => {
      const ctx: ProductionContext = { userId, orgId, client: client as QueryClient };
      const original = await loadOutputForUpdate(ctx, outputId);
      if (!original) return { ok: false, error: 'not_found' };

      if (await hasOutputCorrection(ctx, outputId)) {
        return { ok: false, error: 'already_corrected' };
      }

      if (!original.lp_id) {
        return { ok: false, error: 'lp_not_voidable' };
      }

      const lp = await loadLicensePlateForUpdate(ctx, original.lp_id);
      if (
        !lp ||
        lp.qa_status !== 'pending' ||
        lp.status !== 'received' ||
        !isZeroDecimalString(lp.reserved_qty) ||
        (await hasLpConsumptionOrChildren(ctx, original.lp_id))
      ) {
        return { ok: false, error: 'lp_not_voidable' };
      }

      try {
        await assertCorrectionAllowed(ctx, {
          permission: OUTPUT_CORRECT_PERMISSION,
          woStatus: original.wo_status,
          requireEsign: true,
          signature: {
            pin: password,
            intent: OUTPUT_VOID_INTENT,
            reason: reasonCode,
            subject: {
              output_id: original.id,
              wo_id: original.wo_id,
              lp_id: original.lp_id,
              qty_kg: original.qty_kg,
            },
          },
        });
      } catch (error) {
        if (error instanceof CorrectionForbiddenError) return { ok: false, error: 'forbidden' };
        if (error instanceof CorrectionInvalidInputError) return { ok: false, error: 'invalid_input' };
        return { ok: false, error: 'esign_failed' };
      }

      const correction = await insertCounterEntry<{ id: string }>(ctx, {
        table: 'wo_outputs',
        originalId: original.id,
        reasonCode,
        transactionIdColumn: 'transaction_id',
        values: {
          site_id: original.site_id,
          wo_id: original.wo_id,
          output_type: original.output_type,
          product_id: original.product_id,
          lp_id: null,
          batch_number: `${original.batch_number}-VOID-${original.id.slice(0, 8)}`,
          qty_kg: negateDecimalString(original.qty_kg),
          uom: original.uom,
          qa_status: original.qa_status,
          expiry_date: original.expiry_date,
          catch_weight_details: original.catch_weight_details == null ? null : JSON.stringify(original.catch_weight_details),
          allergen_profile_snapshot: original.allergen_profile_snapshot == null
            ? null
            : JSON.stringify(original.allergen_profile_snapshot),
          ext_jsonb: JSON.stringify({
            correction_reason_code: reasonCode,
            correction_note: note,
            corrected_output_id: original.id,
            corrected_lp_id: original.lp_id,
          }),
          registered_by: userId,
          created_by: userId,
          updated_by: userId,
        },
      });

      let wacReversal = computeWacReversalDelta({
        extJsonb: original.ext_jsonb,
        fallbackQtyKg: original.qty_kg,
        fallbackValue: '0',
      });
      if (wacReversal.source === 'fallback') {
        console.warn('[wac] reversal_fallback', { woOutputId: original.id });
        const fallbackValue = await multiplyNumeric(ctx, original.qty_kg, original.cost_per_kg);
        wacReversal = computeWacReversalDelta({
          extJsonb: original.ext_jsonb,
          fallbackQtyKg: original.qty_kg,
          fallbackValue,
        });
      }
      await upsertWac(ctx.client, {
        orgId,
        siteId: original.site_id,
        itemId: original.product_id,
        deltaQtyKg: wacReversal.deltaQtyKg,
        deltaValue: wacReversal.deltaValue,
        updatedBy: userId,
      });

      await writeOutputVoidStockMove(ctx, { original, lp, correctionId: correction.id, reasonCode, note });
      await markLpVoided(ctx, original.lp_id);
      await unlinkLpGenealogyChildren(ctx, original.lp_id);
      await writeLpVoidHistory(ctx, { original, lp, reasonCode, note });
      await writeOutputVoidAudit(ctx, {
        original,
        lp,
        correctionId: correction.id,
        reasonCode,
        note,
      });

      // No legal correction/void event exists in the production.* outbox family; audit_events is the durable trail.
      return { ok: true, woId: original.wo_id };
    });

    if (result.ok && result.woId) {
      revalidateLocalized('/production', 'page');
      revalidateLocalized(`/production/wos/${result.woId}`, 'page');
    }

    return result.ok ? { ok: true } : result;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return { ok: false, error: 'already_corrected' };
    if (code === '23514' || code === '23503' || code === '22P02') return { ok: false, error: 'invalid_input' };
    console.error('[production] voidWoOutput failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function reverseConsumption(input: ReverseConsumptionInput): Promise<ReverseConsumptionResult> {
  const consumptionId = typeof input?.consumptionId === 'string' ? input.consumptionId.trim() : '';
  const reasonCode = typeof input?.reasonCode === 'string' ? input.reasonCode.trim() : '';
  const note = typeof input?.note === 'string' && input.note.trim().length > 0 ? input.note.trim() : null;
  const password = typeof input?.signature?.password === 'string' ? input.signature.password : '';

  if (!isUuid(consumptionId) || !isReasonCode(reasonCode) || password.length === 0) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<ReverseConsumptionResult & { woId?: string }> => {
      const ctx: ProductionContext = { userId, orgId, client: client as QueryClient };
      const original = await loadConsumptionForUpdate(ctx, consumptionId);
      if (!original) return { ok: false, error: 'not_found' };

      if (await hasConsumptionCorrection(ctx, consumptionId)) {
        return { ok: false, error: 'already_corrected' };
      }

      // F1 (R3 review) — ALL ok:false gates fire BEFORE the first mutation.
      // withOrgContext COMMITS on plain return (only throws roll back), so an
      // error-return after a write would silently persist a half-applied
      // reversal. Order: lock LP + restorability gate → lock wo_materials +
      // ledger gate → e-sign → only then write.
      let lp: LicensePlateRow | null = null;
      if (original.lp_id !== NO_LP_ID) {
        lp = await loadLicensePlateForUpdate(ctx, original.lp_id);
        if (!lp || !['consumed', 'available', 'received'].includes(lp.status)) {
          return { ok: false, error: 'lp_not_restorable' };
        }
      }

      if (!(await lockWoMaterialsAndValidateDecrement(ctx, original))) {
        return { ok: false, error: 'inconsistent_ledger' };
      }

      try {
        await assertCorrectionAllowed(ctx, {
          permission: CONSUMPTION_CORRECT_PERMISSION,
          woStatus: original.wo_status,
          requireEsign: true,
          signature: {
            pin: password,
            intent: CONSUMPTION_REVERSE_INTENT,
            reason: reasonCode,
            subject: {
              consumption_id: original.id,
              wo_id: original.wo_id,
              component_id: original.component_id,
              lp_id: original.lp_id,
              qty_consumed: original.qty_consumed,
            },
          },
        });
      } catch (error) {
        if (error instanceof CorrectionForbiddenError) return { ok: false, error: 'forbidden' };
        if (error instanceof CorrectionInvalidInputError) return { ok: false, error: 'invalid_input' };
        return { ok: false, error: 'esign_failed' };
      }

      const correction = await insertCounterEntry<{ id: string }>(ctx, {
        table: 'wo_material_consumption',
        originalId: original.id,
        reasonCode,
        transactionIdColumn: 'transaction_id',
        values: {
          site_id: original.site_id,
          wo_id: original.wo_id,
          component_id: original.component_id,
          lp_id: original.lp_id,
          qty_consumed: negateDecimalString(original.qty_consumed),
          uom: original.uom,
          operator_id: userId,
          fefo_adherence_flag: original.fefo_adherence_flag,
          fefo_deviation_reason: original.fefo_deviation_reason,
          over_consumption_flag: false,
          over_consumption_approved_by: null,
          over_consumption_approved_at: null,
          over_consumption_reason_code: null,
          ext_jsonb: JSON.stringify({
            correction_reason_code: reasonCode,
            correction_note: note,
            corrected_consumption_id: original.id,
            source: 'reverseConsumption',
            original_ext_jsonb: original.ext_jsonb ?? {},
          }),
        },
      });

      const wacReversal = await applyConsumptionWacReversal(ctx.client, {
        orgId,
        siteId: original.site_id,
        itemId: original.component_id,
        extJsonb: original.ext_jsonb,
        fallbackQty: original.qty_consumed,
        fallbackUom: original.uom,
        updatedBy: userId,
        logContext: { consumptionId: original.id },
      });
      if (wacReversal.applied) {
        await ctx.client.query(
          `update public.wo_material_consumption
              set ext_jsonb = coalesce(ext_jsonb, '{}'::jsonb) || $2::jsonb
            where org_id = app.current_org_id()
              and id = $1::uuid`,
          [
            correction.id,
            JSON.stringify({
              wac_qty_kg: wacReversal.deltaQtyKg,
              wac_value: wacReversal.deltaValue,
              wac_reversal_source: wacReversal.source,
            }),
          ],
        );
      }

      if (!(await decrementConsumedQty(ctx, original))) {
        // Unreachable in practice: the wo_materials rows are locked and the
        // decrement was validated pre-write. If it ever fires, THROW so the
        // whole transaction (incl. the counter insert above) rolls back —
        // returning ok:false here would commit a half-applied reversal.
        throw new Error('reverseConsumption: wo_materials decrement failed despite pre-validated row lock');
      }

      if (lp) {
        const toState = await lpRestoreTargetState(ctx, lp);
        await restoreLicensePlate(ctx, { original, lp, toState });
        await writeConsumptionReverseStockMove(ctx, { original, lp, correctionId: correction.id, reasonCode, note });
        await writeLpRestoredHistory(ctx, { original, lp, toState, reasonCode, note });
      }

      await writeConsumptionReverseAudit(ctx, {
        original,
        lp,
        correctionId: correction.id,
        reasonCode,
        note,
      });

      return { ok: true, woId: original.wo_id };
    });

    if (result.ok && result.woId) {
      revalidateLocalized('/production', 'page');
      revalidateLocalized(`/production/wos/${result.woId}`, 'page');
    }

    return result.ok ? { ok: true } : result;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return { ok: false, error: 'already_corrected' };
    if (code === '23514' || code === '23503' || code === '22P02') return { ok: false, error: 'invalid_input' };
    console.error('[production] reverseConsumption failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
