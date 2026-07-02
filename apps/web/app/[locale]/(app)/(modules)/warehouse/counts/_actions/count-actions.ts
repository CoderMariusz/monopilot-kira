'use server';

import { randomUUID } from 'node:crypto';

import { signEvent, type ESignTxOptions } from '@monopilot/e-sign';
import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getActiveSiteId } from '../../../../../../../lib/site/site-context';
import { makeLpNumber, makeStockMoveNumber } from '../../../../../../../lib/warehouse/lp-create';
import { microToDecimal, toMicro } from '../../../../../../../lib/shared/decimal';
import {
  hasWarehousePermission,
  uuidFromSeed,
  type QueryClient,
  type WarehouseContext,
} from '../../_actions/shared';
import {
  COUNT_TYPES,
  type ApplyVarianceResult,
  type ApproveAndApplyVarianceInput,
  type CountLine,
  type CountLineStatus,
  type CountSession,
  type CountSessionDetail,
  type CountType,
  type CountVarianceWarning,
  type CreateCountSessionInput,
  type RecordCountInput,
} from './count-types';

const WAREHOUSE_STOCK_ADJUST_PERMISSION = 'warehouse.stock.adjust';
const STOCK_COUNT_ADJUST_INTENT = 'warehouse.stock.adjust';
const STOCK_COUNT_REASON = 'stock_count_variance';
const DESTROYED_STATUS = 'destroyed';
/**
 * Hard floor when the org has not configured `count_variance_warn_pct`. A count
 * that disagrees with the system on-hand by more than this (percent of system
 * qty) gets a soft WARN — never a block. Mirrors the mass-balance/over-consume
 * default-WARN tier. Set to 0 in feature_flags to opt OUT entirely.
 */
const COUNT_VARIANCE_DEFAULT_WARN_PCT = 5;

type SessionRow = {
  id: string;
  warehouse_id: string;
  warehouse_code: string | null;
  count_type: string;
  status: string;
  created_at: string | Date | null;
  line_count: number | string | null;
  counted_line_count: number | string | null;
  variance_line_count: number | string | null;
  variance_qty: string | null;
};

type CountLineRow = {
  id: string;
  session_id: string;
  location_id: string;
  location_code: string | null;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  lp_id: string | null;
  lp_number: string | null;
  counted_qty: string | null;
  variance_qty: string | null;
  status: CountLineStatus;
  uom: string | null;
};

type CountLineForApply = {
  id: string;
  session_id: string;
  warehouse_id: string;
  session_site_id: string | null;
  session_status: string;
  location_id: string;
  item_id: string;
  lp_id: string | null;
  system_qty: string;
  counted_qty: string | null;
  variance_qty: string | null;
  status: CountLineStatus;
};

type LpForShrinkage = {
  id: string;
  site_id: string | null;
  status: string;
  quantity: string;
  reserved_qty: string;
  uom: string;
};

type ShrinkageLeg = {
  lp: LpForShrinkage;
  quantity: string;
};

type AdjustmentLeg = {
  lpId: string;
  siteId: string | null;
  quantity: string;
  uom: string;
};

type CountLineAdjustmentMetadata = {
  batchNumber: string | null;
  expiryDate: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function assertUuid(value: unknown, field: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!isUuid(trimmed)) throw new Error(`invalid_${field}`);
  return trimmed;
}

function assertCountType(value: unknown): CountType {
  const countType = typeof value === 'string' ? value.trim() : '';
  if (!(COUNT_TYPES as readonly string[]).includes(countType)) throw new Error('invalid_count_type');
  return countType as CountType;
}

function normalizeOptionalUuid(value: unknown, field: string): string | null {
  if (value == null || value === '') return null;
  return assertUuid(value, field);
}

function normalizeNonNegativeDecimal(value: unknown, field: string): string {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`invalid_${field}`);
  return microToDecimal(toMicro(text));
}

function normalizeOptionalText(value: unknown, field: string): string | null {
  if (value == null) return null;
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0) return null;
  if (text.length > 120) throw new Error(`invalid_${field}`);
  return text;
}

function normalizeOptionalTimestamp(value: unknown, field: string): string | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new Error(`invalid_${field}`);
  return date.toISOString();
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toInt(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number.parseInt(value, 10);
  return 0;
}

function absDecimal(value: string): string {
  const micro = toMicro(value);
  return microToDecimal(micro < 0n ? -micro : micro);
}

function mapSession(row: SessionRow): CountSession {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    warehouseCode: row.warehouse_code,
    countType: row.count_type,
    status: row.status,
    createdAt: toIso(row.created_at),
    lineCount: toInt(row.line_count),
    countedLineCount: toInt(row.counted_line_count),
    varianceLineCount: toInt(row.variance_line_count),
    varianceQty: row.variance_qty ?? '0',
  };
}

function mapCountLine(row: CountLineRow): CountLine {
  return {
    id: row.id,
    sessionId: row.session_id,
    locationId: row.location_id,
    locationCode: row.location_code,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    lpId: row.lp_id,
    lpNumber: row.lp_number,
    countedQty: row.counted_qty,
    varianceQty: row.variance_qty,
    status: row.status,
    uom: row.uom,
  };
}

async function assertCanAdjustStock(ctx: WarehouseContext): Promise<void> {
  if (!(await hasWarehousePermission(ctx, WAREHOUSE_STOCK_ADJUST_PERMISSION))) {
    throw new Error('forbidden');
  }
}

async function readCountSessionSummary(client: QueryClient, sessionId: string, siteId: string): Promise<CountSession | null> {
  const { rows } = await client.query<SessionRow>(
    `select cs.id::text,
            cs.warehouse_id::text,
            w.code as warehouse_code,
            cs.count_type,
            cs.status,
            cs.created_at,
            count(cl.id)::int as line_count,
            count(cl.id) filter (where cl.status in ('counted', 'approved', 'applied'))::int as counted_line_count,
            count(cl.id) filter (where coalesce(cl.variance_qty, 0) <> 0)::int as variance_line_count,
            coalesce(sum(abs(coalesce(cl.variance_qty, 0))), 0)::text as variance_qty
       from public.count_sessions cs
       left join public.warehouses w
         on w.org_id = app.current_org_id()
        and w.id = cs.warehouse_id
       left join public.count_lines cl
         on cl.session_id = cs.id
      where cs.org_id = app.current_org_id()
        and cs.id = $1::uuid
        and cs.site_id = $2::uuid
      group by cs.id, cs.warehouse_id, w.code, cs.count_type, cs.status, cs.created_at
      limit 1`,
    [sessionId, siteId],
  );
  const row = rows[0];
  return row ? mapSession(row) : null;
}

async function readCountLines(client: QueryClient, sessionId: string): Promise<CountLine[]> {
  const { rows } = await client.query<CountLineRow>(
    `select cl.id::text,
            cl.session_id::text,
            cl.location_id::text,
            loc.code as location_code,
            cl.item_id::text,
            i.item_code,
            i.name as item_name,
            cl.lp_id::text,
            lp.lp_number,
            cl.counted_qty::text,
            cl.variance_qty::text,
            cl.status,
            coalesce(lp.uom, i.uom_base) as uom
       from public.count_lines cl
       join public.count_sessions cs
         on cs.id = cl.session_id
        and cs.org_id = app.current_org_id()
       left join public.locations loc
         on loc.org_id = app.current_org_id()
        and loc.id = cl.location_id
       left join public.items i
         on i.org_id = app.current_org_id()
        and i.id = cl.item_id
       left join public.license_plates lp
         on lp.org_id = app.current_org_id()
        and lp.id = cl.lp_id
      where cl.session_id = $1::uuid
      order by loc.code asc nulls last, i.item_code asc nulls last, lp.lp_number asc nulls last, cl.id asc`,
    [sessionId],
  );
  return rows.map(mapCountLine);
}

async function readCurrentOnHand(
  client: QueryClient,
  input: { locationId: string; itemId: string; lpId: string | null },
): Promise<{ systemQty: string; uom: string | null }> {
  const { rows } = await client.query<{ system_qty: string; uom: string | null }>(
    `select coalesce(sum(inv.available_qty), 0)::text as system_qty,
            min(inv.uom) as uom
       from public.v_inventory_available inv
      where inv.org_id = app.current_org_id()
        and inv.location_id = $1::uuid
        and inv.product_id = $2::uuid
        and ($3::uuid is null or inv.lp_id = $3::uuid)`,
    [input.locationId, input.itemId, input.lpId],
  );
  return { systemQty: rows[0]?.system_qty ?? '0', uom: rows[0]?.uom ?? null };
}

/**
 * Read the org's configured cycle-count variance WARN threshold (percent) from
 * `tenant_variations.feature_flags->>'count_variance_warn_pct'`. Falls back to
 * COUNT_VARIANCE_DEFAULT_WARN_PCT when unset/non-numeric. An explicit 0 disables
 * the warning. Mirrors the over-consume/mass-balance feature-flag read pattern.
 */
async function readCountVarianceWarnPct(client: QueryClient): Promise<bigint> {
  const { rows } = await client.query<{ warn_pct: string }>(
    `select coalesce(
              case
                when (tv.feature_flags->>'count_variance_warn_pct') ~ '^[0-9]+(\\.[0-9]+)?$'
                  then (tv.feature_flags->>'count_variance_warn_pct')::numeric
                else $1::numeric
              end,
              $1::numeric
            )::text as warn_pct
       from public.tenant_variations tv
      where tv.org_id = app.current_org_id()
      limit 1`,
    [String(COUNT_VARIANCE_DEFAULT_WARN_PCT)],
  );
  // No tenant_variations row → use the default.
  if (rows.length === 0) return toMicro(String(COUNT_VARIANCE_DEFAULT_WARN_PCT));
  return toMicro(rows[0]?.warn_pct ?? String(COUNT_VARIANCE_DEFAULT_WARN_PCT));
}

/**
 * Compute the soft variance warning for a just-recorded count. Returns undefined
 * when there is no system baseline (system qty 0 → percent undefined), when the
 * threshold is disabled (0), or when |variance%| is at/under the threshold.
 * Never throws and never blocks — purely a structured signal for the UI.
 */
function buildCountVarianceWarning(input: {
  systemQty: string;
  varianceQty: string;
  warnPctMicro: bigint;
}): CountVarianceWarning | undefined {
  if (input.warnPctMicro <= 0n) return undefined;
  const systemMicro = toMicro(input.systemQty);
  if (systemMicro <= 0n) return undefined; // no baseline to measure a percent against
  const varianceMicro = toMicro(input.varianceQty);
  const absVarianceMicro = varianceMicro < 0n ? -varianceMicro : varianceMicro;
  // variancePctMicro = |variance| / system * 100, kept in micro units throughout.
  const variancePctMicro = (absVarianceMicro * 100_000_000n) / systemMicro;
  if (variancePctMicro <= input.warnPctMicro) return undefined;
  return {
    varianceExceedsThreshold: true,
    reasonCode: 'count_variance_over_threshold',
    variancePct: microToDecimal(variancePctMicro),
    warnPct: microToDecimal(input.warnPctMicro),
  };
}

async function readLineForApply(client: QueryClient, countLineId: string): Promise<CountLineForApply | null> {
  const { rows } = await client.query<CountLineForApply>(
    `select cl.id::text,
            cl.session_id::text,
            cs.warehouse_id::text,
            cs.site_id::text as session_site_id,
            cs.status as session_status,
            cl.location_id::text,
            cl.item_id::text,
            cl.lp_id::text,
            cl.system_qty::text,
            cl.counted_qty::text,
            cl.variance_qty::text,
            cl.status
       from public.count_lines cl
       join public.count_sessions cs
         on cs.id = cl.session_id
        and cs.org_id = app.current_org_id()
      where cl.id = $1::uuid
      limit 1
      for update of cl`,
    [countLineId],
  );
  return rows[0] ?? null;
}

async function resolveAdjustmentUom(
  client: QueryClient,
  input: { itemId: string; locationId: string; lpId: string | null },
): Promise<string> {
  const { rows } = await client.query<{ uom: string | null }>(
    `select coalesce(
              (select min(inv.uom)
                 from public.v_inventory_available inv
                where inv.org_id = app.current_org_id()
                  and inv.product_id = $1::uuid
                  and inv.location_id = $2::uuid
                  and ($3::uuid is null or inv.lp_id = $3::uuid)),
              (select i.uom_base
                 from public.items i
                where i.org_id = app.current_org_id()
                  and i.id = $1::uuid
                limit 1)
            ) as uom`,
    [input.itemId, input.locationId, input.lpId],
  );
  const uom = rows[0]?.uom;
  if (!uom) throw new Error('item_uom_not_found');
  return uom;
}

async function createAdjustmentLicensePlate(
  ctx: WarehouseContext,
  input: {
    siteId: string | null;
    warehouseId: string;
    locationId: string;
    itemId: string;
    quantity: string;
    uom: string;
    countLineId: string;
    batchNumber: string | null;
    expiryDate: string | null;
  },
): Promise<string> {
  const lpNumber = makeLpNumber();
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.license_plates (
       org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
       batch_number, expiry_date, status, qa_status, origin, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::numeric, $7,
       $8, $9::timestamptz, 'available', 'pending', 'adjustment', $10::uuid, $10::uuid
     )
     returning id::text`,
    [
      input.siteId,
      input.warehouseId,
      input.locationId,
      lpNumber,
      input.itemId,
      input.quantity,
      input.uom,
      input.batchNumber,
      input.expiryDate,
      ctx.userId,
    ],
  );
  const lpId = rows[0]?.id;
  if (!lpId) throw new Error('lp_create_failed');

  await ctx.client.query(
    `insert into public.lp_state_history (
       org_id, site_id, lp_id, from_state, to_state, reason_code, reason_text,
       transaction_id, ext_jsonb, created_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, null, 'available', 'stock_count_adjustment',
       $3, $4::uuid, $5::jsonb, $6::uuid
     )`,
    [
      input.siteId,
      lpId,
      STOCK_COUNT_REASON,
      randomUUID(),
      JSON.stringify({
        count_line_id: input.countLineId,
        adjustment_qty: input.quantity,
        origin: 'adjustment',
      }),
      ctx.userId,
    ],
  );

  return lpId;
}

async function writeCountLineAdjustmentMetadata(
  ctx: WarehouseContext,
  input: { countLineId: string; batchNumber: string | null; expiryDate: string | null },
): Promise<void> {
  if (!input.batchNumber && !input.expiryDate) return;

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
       'warehouse.stock.count_metadata_recorded',
       'count_line',
       $2,
       null,
       $3::jsonb,
       $4::uuid,
       'operational'
     )`,
    [
      ctx.userId,
      input.countLineId,
      JSON.stringify({
        batch_number: input.batchNumber,
        expiry_date: input.expiryDate,
      }),
      randomUUID(),
    ],
  );
}

async function readCountLineAdjustmentMetadata(
  client: QueryClient,
  countLineId: string,
): Promise<CountLineAdjustmentMetadata> {
  const { rows } = await client.query<{ batch_number: string | null; expiry_date: string | null }>(
    `select after_state ->> 'batch_number' as batch_number,
            after_state ->> 'expiry_date' as expiry_date
       from public.audit_events
      where org_id = app.current_org_id()
        and resource_type = 'count_line'
        and resource_id = $1
        and action = 'warehouse.stock.count_metadata_recorded'
      order by occurred_at desc, id desc
      limit 1`,
    [countLineId],
  );
  return {
    batchNumber: rows[0]?.batch_number ?? null,
    expiryDate: rows[0]?.expiry_date ?? null,
  };
}

async function resolveAdjustmentSiteId(
  client: QueryClient,
  input: { sessionSiteId: string | null; warehouseId: string; locationId: string; lpId: string | null },
): Promise<string | null> {
  if (input.sessionSiteId) return input.sessionSiteId;

  const { rows } = await client.query<{ site_id: string | null }>(
    `select coalesce(
              (select lp.site_id
                 from public.license_plates lp
                where lp.org_id = app.current_org_id()
                  and lp.id = $3::uuid
                  and lp.site_id is not null
                limit 1),
              (select lp.site_id
                 from public.license_plates lp
                where lp.org_id = app.current_org_id()
                  and lp.warehouse_id = $1::uuid
                  and lp.location_id = $2::uuid
                  and lp.site_id is not null
                order by lp.expiry_date asc nulls last, lp.lp_number asc
                limit 1)
            )::text as site_id`,
    [input.warehouseId, input.locationId, input.lpId],
  );
  return rows[0]?.site_id ?? null;
}

async function selectLpsForShrinkage(
  client: QueryClient,
  input: { warehouseId: string; locationId: string; itemId: string; lpId: string | null; quantity: string },
): Promise<ShrinkageLeg[]> {
  const { rows } = await client.query<LpForShrinkage>(
    `select lp.id::text,
            lp.site_id::text,
            lp.status,
            lp.quantity::text,
            lp.reserved_qty::text,
            lp.uom
      from public.license_plates lp
      where lp.org_id = app.current_org_id()
        and lp.warehouse_id = $4::uuid
        and lp.location_id = $1::uuid
        and lp.product_id = $2::uuid
        and ($3::uuid is null or lp.id = $3::uuid)
        and lp.status = 'available'
        and lp.qa_status = 'released'
        and lp.quantity > lp.reserved_qty
      order by lp.expiry_date asc nulls last, lp.lp_number asc
      for update`,
    [input.locationId, input.itemId, input.lpId, input.warehouseId],
  );

  let remaining = toMicro(input.quantity);
  const legs: ShrinkageLeg[] = [];

  for (const lp of rows) {
    if (remaining <= 0n) break;
    const available = toMicro(lp.quantity) - toMicro(lp.reserved_qty);
    if (available <= 0n) continue;

    const take = available < remaining ? available : remaining;
    legs.push({ lp, quantity: microToDecimal(take) });
    remaining -= take;
  }

  if (remaining > 0n) throw new Error('insufficient_on_hand');
  return legs;
}

async function reduceLicensePlateForShrinkage(
  ctx: WarehouseContext,
  input: { lp: LpForShrinkage; quantity: string; countLineId: string },
): Promise<void> {
  const { rows } = await ctx.client.query<{ id: string; quantity: string; status: string }>(
    `update public.license_plates
        set quantity = quantity - $2::numeric,
            status = case when quantity - $2::numeric = 0 then $4 else status end,
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid
        and quantity - $2::numeric >= reserved_qty
      returning id::text, quantity::text, status`,
    [input.lp.id, input.quantity, ctx.userId, DESTROYED_STATUS],
  );
  const updated = rows[0];
  if (!updated) throw new Error('insufficient_on_hand');

  await ctx.client.query(
    `insert into public.lp_state_history (
       org_id, site_id, lp_id, from_state, to_state, reason_code, reason_text,
       transaction_id, ext_jsonb, created_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, $3, $4, 'stock_count_shrinkage',
       $5, $6::uuid, $7::jsonb, $8::uuid
     )`,
    [
      input.lp.site_id,
      input.lp.id,
      input.lp.status,
      updated.status,
      STOCK_COUNT_REASON,
      randomUUID(),
      JSON.stringify({
        count_line_id: input.countLineId,
        adjustment_qty: input.quantity,
        quantity_before: input.lp.quantity,
        quantity_after: updated.quantity,
      }),
      ctx.userId,
    ],
  );
}

async function insertStockAdjustment(
  ctx: WarehouseContext,
  input: {
    countLine: CountLineForApply;
    direction: 'increase' | 'decrease';
    adjustmentQty: string;
    lpId: string | null;
    esignRef: string;
  },
): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.stock_adjustments (
       org_id, count_line_id, item_id, location_id, warehouse_id, site_id, lp_id,
       adjustment_qty, direction, reason, esign_ref, applied_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
       $7::numeric, $8, $9, $10::uuid, $11::uuid
     )
     returning id::text`,
    [
      input.countLine.id,
      input.countLine.item_id,
      input.countLine.location_id,
      input.countLine.warehouse_id,
      input.countLine.session_site_id,
      input.lpId,
      input.adjustmentQty,
      input.direction,
      STOCK_COUNT_REASON,
      input.esignRef,
      ctx.userId,
    ],
  );
  const adjustmentId = rows[0]?.id;
  if (!adjustmentId) throw new Error('stock_adjustment_insert_failed');
  return adjustmentId;
}

async function insertStockMove(
  ctx: WarehouseContext,
  input: {
    countLine: CountLineForApply;
    adjustmentId: string;
    direction: 'increase' | 'decrease';
    quantity: string;
    lpId: string;
    siteId: string | null;
    uom: string;
    esignRef: string;
  },
): Promise<void> {
  const transactionId = uuidFromSeed(`warehouse.count.stock_move:${input.countLine.id}:${input.lpId}:${input.direction}`);
  const signedQuantity =
    input.direction === 'increase' ? input.quantity : microToDecimal(-toMicro(input.quantity));

  await ctx.client.query(
    `insert into public.stock_moves (
       org_id, site_id, move_number, lp_id, move_type, from_location_id, to_location_id,
       quantity, uom, reason_code, reason_text, transaction_id, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2, $3::uuid, 'adjustment', $4::uuid, $5::uuid,
       $6::numeric, $7, $8, $8, $9::uuid, $10::jsonb, $11::uuid, $11::uuid
     )
     on conflict (org_id, transaction_id) do nothing`,
    [
      input.siteId,
      makeStockMoveNumber(transactionId),
      input.lpId,
      input.direction === 'decrease' ? input.countLine.location_id : null,
      input.direction === 'increase' ? input.countLine.location_id : null,
      signedQuantity,
      input.uom,
      STOCK_COUNT_REASON,
      transactionId,
      JSON.stringify({
        count_line_id: input.countLine.id,
        stock_adjustment_id: input.adjustmentId,
        esign_ref: input.esignRef,
        direction: input.direction,
      }),
      ctx.userId,
    ],
  );
}

async function writeStockAdjustmentAudit(
  ctx: WarehouseContext,
  input: {
    countLine: CountLineForApply;
    adjustmentId: string;
    direction: 'increase' | 'decrease';
    adjustmentQty: string;
    lpId: string | null;
    esignRef: string;
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
       'warehouse.stock.adjusted',
       'count_line',
       $2,
       $3::jsonb,
       $4::jsonb,
       $5::uuid,
       'operational'
     )`,
    [
      ctx.userId,
      input.countLine.id,
      JSON.stringify({
        count_line_id: input.countLine.id,
        session_id: input.countLine.session_id,
        status: input.countLine.status,
        system_qty: input.countLine.system_qty,
        counted_qty: input.countLine.counted_qty,
        variance_qty: input.countLine.variance_qty,
      }),
      JSON.stringify({
        status: 'applied',
        adjustment_id: input.adjustmentId,
        direction: input.direction,
        adjustment_qty: input.adjustmentQty,
        lp_id: input.lpId,
        esign_ref: input.esignRef,
      }),
      randomUUID(),
    ],
  );
}

export async function createCountSession(input: CreateCountSessionInput): Promise<string> {
  const warehouseId = assertUuid(input?.warehouseId, 'warehouse_id');
  const countType = assertCountType(input?.countType);

  return await withOrgContext(async ({ userId, orgId, client }): Promise<string> => {
    const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
    await assertCanAdjustStock(ctx);

    const site = await ctx.client.query<{ site_id: string | null }>(
      `select site_id::text
         from public.warehouses
        where org_id = app.current_org_id()
          and id = $1::uuid
        limit 1`,
      [warehouseId],
    );
    const siteId = site.rows[0]?.site_id;
    if (!siteId) throw new Error('warehouse_site_required');

    const { rows } = await ctx.client.query<{ id: string }>(
      `insert into public.count_sessions (org_id, site_id, warehouse_id, count_type, status)
       values (app.current_org_id(), $1::uuid, $2::uuid, $3, 'open')
       returning id::text`,
      [siteId, warehouseId, countType],
    );
    const sessionId = rows[0]?.id;
    if (!sessionId) throw new Error('count_session_insert_failed');
    revalidatePath('/[locale]/warehouse/counts', 'page');
    return sessionId;
  });
}

export async function listCountSessions(): Promise<CountSession[]> {
  return await withOrgContext(async ({ userId, orgId, client }): Promise<CountSession[]> => {
    const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
    await assertCanAdjustStock(ctx);
    const activeSiteId = await getActiveSiteId({ client: ctx.client });
    if (!activeSiteId) return [];

    const { rows } = await ctx.client.query<SessionRow>(
      `select cs.id::text,
              cs.warehouse_id::text,
              w.code as warehouse_code,
              cs.count_type,
              cs.status,
              cs.created_at,
              count(cl.id)::int as line_count,
              count(cl.id) filter (where cl.status in ('counted', 'approved', 'applied'))::int as counted_line_count,
              count(cl.id) filter (where coalesce(cl.variance_qty, 0) <> 0)::int as variance_line_count,
              coalesce(sum(abs(coalesce(cl.variance_qty, 0))), 0)::text as variance_qty
         from public.count_sessions cs
         left join public.warehouses w
           on w.org_id = app.current_org_id()
          and w.id = cs.warehouse_id
         left join public.count_lines cl
           on cl.session_id = cs.id
        where cs.org_id = app.current_org_id()
          and cs.site_id = $1::uuid
        group by cs.id, cs.warehouse_id, w.code, cs.count_type, cs.status, cs.created_at
        order by cs.created_at desc nulls last, cs.id desc`,
      [activeSiteId],
    );

    return rows.map(mapSession);
  });
}

export async function getCountSession(sessionId: string): Promise<CountSessionDetail> {
  const normalizedSessionId = assertUuid(sessionId, 'session_id');

  return await withOrgContext(async ({ userId, orgId, client }): Promise<CountSessionDetail> => {
    const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
    await assertCanAdjustStock(ctx);
    const activeSiteId = await getActiveSiteId({ client: ctx.client });
    if (!activeSiteId) throw new Error('count_session_not_found');

    const session = await readCountSessionSummary(ctx.client, normalizedSessionId, activeSiteId);
    if (!session) throw new Error('count_session_not_found');

    return {
      ...session,
      lines: await readCountLines(ctx.client, normalizedSessionId),
    };
  });
}

export async function recordCount(input: RecordCountInput): Promise<CountLine> {
  const sessionId = assertUuid(input?.sessionId, 'session_id');
  const locationId = assertUuid(input?.locationId, 'location_id');
  const itemId = assertUuid(input?.itemId, 'item_id');
  const lpId = normalizeOptionalUuid(input?.lpId, 'lp_id');
  const countedQty = normalizeNonNegativeDecimal(input?.countedQty, 'counted_qty');
  const batchNumber = normalizeOptionalText(input?.batchNumber ?? input?.batch_number, 'batch_number');
  const expiryDate = normalizeOptionalTimestamp(input?.expiryDate ?? input?.expiry_date, 'expiry_date');

  return await withOrgContext(async ({ userId, orgId, client }): Promise<CountLine> => {
    const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
    await assertCanAdjustStock(ctx);

    const session = await ctx.client.query<{
      id: string;
      status: string;
      warehouse_id: string;
      site_id: string | null;
    }>(
      `select id::text,
              status,
              warehouse_id::text,
              site_id::text
         from public.count_sessions
        where org_id = app.current_org_id()
          and id = $1::uuid
        limit 1
        for update`,
      [sessionId],
    );
    const sessionRow = session.rows[0];
    if (!sessionRow) throw new Error('count_session_not_found');
    if (sessionRow.status !== 'open' && sessionRow.status !== 'counting') {
      throw new Error('count_session_not_open');
    }

    const locationCheck = await ctx.client.query<{ id: string }>(
      `select id::text
         from public.locations
        where org_id = app.current_org_id()
          and id = $1::uuid
          and warehouse_id = $2::uuid
        limit 1`,
      [locationId, sessionRow.warehouse_id],
    );
    if (!locationCheck.rows[0]) throw new Error('location_not_in_warehouse');

    const itemCheck = await ctx.client.query<{ id: string }>(
      `select id::text
         from public.items
        where org_id = app.current_org_id()
          and id = $1::uuid
        limit 1`,
      [itemId],
    );
    if (!itemCheck.rows[0]) throw new Error('item_not_found');

    const onHand = await readCurrentOnHand(ctx.client, { locationId, itemId, lpId });
    const { systemQty } = onHand;
    const varianceQty = microToDecimal(toMicro(countedQty) - toMicro(systemQty));
    const warnPctMicro = await readCountVarianceWarnPct(ctx.client);
    const varianceWarning = buildCountVarianceWarning({ systemQty, varianceQty, warnPctMicro });

    const existing = await ctx.client.query<{ id: string }>(
      `select id::text
         from public.count_lines
        where session_id = $1::uuid
          and location_id = $2::uuid
          and item_id = $3::uuid
          and lp_id is not distinct from $4::uuid
        limit 1
        for update`,
      [sessionId, locationId, itemId, lpId],
    );

    let lineId = existing.rows[0]?.id ?? null;
    if (lineId) {
      await ctx.client.query(
        `update public.count_lines
            set system_qty = $2::numeric,
                counted_qty = $3::numeric,
                variance_qty = $4::numeric,
                status = 'counted',
                counted_by = $5::uuid,
                counted_at = now()
          where id = $1::uuid`,
        [lineId, systemQty, countedQty, varianceQty, ctx.userId],
      );
    } else {
      const inserted = await ctx.client.query<{ id: string }>(
        `insert into public.count_lines (
           session_id, location_id, item_id, lp_id, system_qty, counted_qty, variance_qty,
           status, counted_by, counted_at
         )
         values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::numeric, $7::numeric,
           'counted', $8::uuid, now()
         )
         returning id::text`,
        [sessionId, locationId, itemId, lpId, systemQty, countedQty, varianceQty, ctx.userId],
      );
      lineId = inserted.rows[0]?.id ?? null;
    }
    if (!lineId) throw new Error('count_line_upsert_failed');

    await writeCountLineAdjustmentMetadata(ctx, { countLineId: lineId, batchNumber, expiryDate });

    const { rows } = await ctx.client.query<CountLineRow>(
      `select cl.id::text,
              cl.session_id::text,
              cl.location_id::text,
              loc.code as location_code,
              cl.item_id::text,
              i.item_code,
              i.name as item_name,
              cl.lp_id::text,
              lp.lp_number,
              cl.counted_qty::text,
              cl.variance_qty::text,
              cl.status,
              coalesce(lp.uom, $2, i.uom_base) as uom
         from public.count_lines cl
         left join public.locations loc
           on loc.org_id = app.current_org_id()
          and loc.id = cl.location_id
         left join public.items i
           on i.org_id = app.current_org_id()
          and i.id = cl.item_id
         left join public.license_plates lp
           on lp.org_id = app.current_org_id()
          and lp.id = cl.lp_id
        where cl.id = $1::uuid
        limit 1`,
      [lineId, onHand.uom],
    );
    const line = rows[0];
    if (!line) throw new Error('count_line_not_found');
    const mapped = mapCountLine(line);
    // Soft, non-blocking: attach the variance WARN only when over threshold.
    return varianceWarning ? { ...mapped, varianceWarning } : mapped;
  });
}

export async function approveAndApplyVariance(input: ApproveAndApplyVarianceInput): Promise<ApplyVarianceResult> {
  const countLineId = assertUuid(input?.countLineId, 'count_line_id');
  const password = typeof input?.signature?.password === 'string' ? input.signature.password : '';
  if (password.trim().length === 0) throw new Error('signature_required');

  return await withOrgContext(async ({ userId, orgId, client }): Promise<ApplyVarianceResult> => {
    const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
    await assertCanAdjustStock(ctx);

    const countLine = await readLineForApply(ctx.client, countLineId);
    if (!countLine) throw new Error('count_line_not_found');
    if (countLine.session_status !== 'open' && countLine.session_status !== 'review') {
      throw new Error('count_session_not_open');
    }
    if (countLine.status === 'applied') throw new Error('variance_already_applied');
    if (countLine.counted_qty == null || countLine.variance_qty == null) throw new Error('count_line_not_counted');

    const liveOnHand = await readCurrentOnHand(ctx.client, {
      locationId: countLine.location_id,
      itemId: countLine.item_id,
      lpId: countLine.lp_id,
    });
    if (toMicro(liveOnHand.systemQty) !== toMicro(countLine.system_qty)) {
      throw new Error('stock_changed_recount_required');
    }

    const recomputedVarianceQty = microToDecimal(toMicro(countLine.counted_qty) - toMicro(liveOnHand.systemQty));
    const countLineForApply: CountLineForApply = {
      ...countLine,
      system_qty: liveOnHand.systemQty,
      variance_qty: recomputedVarianceQty,
    };
    const varianceMicro = toMicro(recomputedVarianceQty);
    const adjustmentQty = absDecimal(recomputedVarianceQty);
    if (varianceMicro === 0n) throw new Error('variance_is_zero');

    const signatureReceipt = await signEvent(
      {
        signerUserId: userId,
        pin: password,
        intent: STOCK_COUNT_ADJUST_INTENT,
        reason: input.signature.reason ?? STOCK_COUNT_REASON,
        nonce: input.signature.nonce,
        subject: {
          permission: WAREHOUSE_STOCK_ADJUST_PERMISSION,
          count_line_id: countLineForApply.id,
          session_id: countLineForApply.session_id,
          warehouse_id: countLineForApply.warehouse_id,
          location_id: countLineForApply.location_id,
          item_id: countLineForApply.item_id,
          lp_id: countLineForApply.lp_id,
          system_qty: countLineForApply.system_qty,
          counted_qty: countLineForApply.counted_qty,
          variance_qty: countLineForApply.variance_qty,
        },
      },
      { client: ctx.client as unknown as ESignTxOptions['client'] },
    );

    let adjustedLpId: string | null = null;
    const direction = varianceMicro > 0n ? 'increase' : 'decrease';
    const adjustmentLegs: AdjustmentLeg[] = [];

    if (varianceMicro > 0n) {
      const uom = await resolveAdjustmentUom(ctx.client, {
        itemId: countLineForApply.item_id,
        locationId: countLineForApply.location_id,
        lpId: countLineForApply.lp_id,
      });
      const metadata = await readCountLineAdjustmentMetadata(ctx.client, countLineForApply.id);
      const siteId = await resolveAdjustmentSiteId(ctx.client, {
        sessionSiteId: countLineForApply.session_site_id,
        warehouseId: countLineForApply.warehouse_id,
        locationId: countLineForApply.location_id,
        lpId: countLineForApply.lp_id,
      });
      adjustedLpId = await createAdjustmentLicensePlate(ctx, {
        siteId,
        warehouseId: countLineForApply.warehouse_id,
        locationId: countLineForApply.location_id,
        itemId: countLineForApply.item_id,
        quantity: adjustmentQty,
        uom,
        countLineId: countLineForApply.id,
        batchNumber: metadata.batchNumber,
        expiryDate: metadata.expiryDate,
      });
      adjustmentLegs.push({ lpId: adjustedLpId, siteId, quantity: adjustmentQty, uom });
    } else if (varianceMicro < 0n) {
      const shrinkageLegs = await selectLpsForShrinkage(ctx.client, {
        warehouseId: countLineForApply.warehouse_id,
        locationId: countLineForApply.location_id,
        itemId: countLineForApply.item_id,
        lpId: countLineForApply.lp_id,
        quantity: adjustmentQty,
      });
      for (const leg of shrinkageLegs) {
        await reduceLicensePlateForShrinkage(ctx, {
          lp: leg.lp,
          quantity: leg.quantity,
          countLineId: countLineForApply.id,
        });
        adjustmentLegs.push({
          lpId: leg.lp.id,
          siteId: leg.lp.site_id,
          quantity: leg.quantity,
          uom: leg.lp.uom,
        });
      }
      adjustedLpId = adjustmentLegs[0]?.lpId ?? null;
    }

    let adjustmentId: string | null = null;
    if (adjustmentLegs.length > 0) {
      for (const leg of adjustmentLegs) {
        const legAdjustmentId = await insertStockAdjustment(ctx, {
          countLine: countLineForApply,
          direction,
          adjustmentQty: leg.quantity,
          lpId: leg.lpId,
          esignRef: signatureReceipt.signatureId,
        });
        adjustmentId ??= legAdjustmentId;
        await insertStockMove(ctx, {
          countLine: countLineForApply,
          adjustmentId: legAdjustmentId,
          direction,
          quantity: leg.quantity,
          lpId: leg.lpId,
          siteId: leg.siteId,
          uom: leg.uom,
          esignRef: signatureReceipt.signatureId,
        });
      }
    } else {
      adjustmentId = await insertStockAdjustment(ctx, {
        countLine: countLineForApply,
        direction,
        adjustmentQty,
        lpId: adjustedLpId,
        esignRef: signatureReceipt.signatureId,
      });
    }
    if (!adjustmentId) throw new Error('stock_adjustment_insert_failed');

    await writeStockAdjustmentAudit(ctx, {
      countLine: countLineForApply,
      adjustmentId,
      direction,
      adjustmentQty,
      lpId: adjustedLpId,
      esignRef: signatureReceipt.signatureId,
    });

    await ctx.client.query(
      `update public.count_lines
          set system_qty = $2::numeric,
              variance_qty = $3::numeric,
              status = 'applied'
        where id = $1::uuid`,
      [countLineForApply.id, countLineForApply.system_qty, countLineForApply.variance_qty],
    );

    return {
      countLineId: countLineForApply.id,
      adjustmentId,
      direction,
      adjustmentQty,
      varianceQty: recomputedVarianceQty,
      lpId: adjustedLpId,
      esignRef: signatureReceipt.signatureId,
      status: 'applied',
    };
  });
}

export async function closeCountSession(sessionId: string): Promise<string> {
  const normalizedSessionId = assertUuid(sessionId, 'session_id');

  return await withOrgContext(async ({ userId, orgId, client }): Promise<string> => {
    const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
    await assertCanAdjustStock(ctx);

    const { rows } = await ctx.client.query<{ id: string }>(
      `update public.count_sessions
          set status = 'closed',
              closed_at = now(),
              closed_by = $2::uuid
        where org_id = app.current_org_id()
          and id = $1::uuid
          and status in ('open', 'counting', 'review')
      returning id::text`,
      [normalizedSessionId, ctx.userId],
    );
    const closedId = rows[0]?.id;
    if (!closedId) throw new Error('count_session_not_closable');
    revalidatePath('/[locale]/warehouse/counts', 'page');
    return closedId;
  });
}
