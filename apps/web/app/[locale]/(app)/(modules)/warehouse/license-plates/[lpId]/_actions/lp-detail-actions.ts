'use server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_LP_RESERVE_PERMISSION,
  asLimit,
  asTrimmed,
  hasWarehousePermission,
  uuidFromSeed,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from '../../../_actions/shared';

const WAREHOUSE_LP_BLOCK_PERMISSION = 'warehouse.lp.block';
const TERMINAL_LP_STATUSES = ['consumed', 'destroyed', 'shipped', 'merged', 'returned'] as const;
const OPEN_WO_STATUSES = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD'] as const;

export type BlockLpResult = {
  lpId: string;
  lpNumber: string;
  status: string;
  qaStatus: string;
  holdId: string;
  holdNumber: string;
};

export type ReserveLpResult = {
  lpId: string;
  lpNumber: string;
  status: string;
  reservedQty: string;
  availableQty: string;
  reservedForWoId: string | null;
  reservedForWoNumber: string | null;
  uom: string;
};

export type ReserveWorkOrderOption = {
  id: string;
  woNumber: string;
  status: string;
  itemCode: string | null;
  itemName: string | null;
  plannedQuantity: string;
  uom: string;
};

function isPositiveDecimal(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value) && !/^0(?:\.0{1,6})?$/.test(value);
}

function mapFailure(error: unknown): WarehouseResult<never> {
  console.error('[warehouse] lp detail action failed', error);
  return { ok: false, reason: 'error' };
}

export async function listOpenWorkOrdersForLpReserve(search?: string, limitInput?: number): Promise<WarehouseResult<ReserveWorkOrderOption[]>> {
  const q = asTrimmed(search);
  const limit = asLimit(limitInput, 25, 50);

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<ReserveWorkOrderOption[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_LP_RESERVE_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        id: string;
        wo_number: string;
        status: string;
        item_code: string | null;
        item_name: string | null;
        planned_quantity: string;
        uom: string;
      }>(
        `select wo.id::text,
                wo.wo_number,
                wo.status,
                i.item_code,
                i.name as item_name,
                wo.planned_quantity::text,
                wo.uom
           from public.work_orders wo
           left join public.items i
             on i.org_id = app.current_org_id()
            and i.id = wo.product_id
          where wo.org_id = app.current_org_id()
            and wo.status = any($1::text[])
            and (
              $2::text is null
              or wo.wo_number ilike '%' || $2 || '%'
              or coalesce(i.item_code, '') ilike '%' || $2 || '%'
              or coalesce(i.name, '') ilike '%' || $2 || '%'
            )
          order by wo.scheduled_start_time nulls last, wo.created_at desc
          limit $3::integer`,
        [[...OPEN_WO_STATUSES], q, limit],
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          woNumber: row.wo_number,
          status: row.status,
          itemCode: row.item_code,
          itemName: row.item_name,
          plannedQuantity: String(row.planned_quantity),
          uom: row.uom,
        })),
      };
    });
  } catch (error) {
    return mapFailure(error);
  }
}

export async function blockLp(lpIdInput: string, reasonInput: string): Promise<WarehouseResult<BlockLpResult>> {
  const lpId = asTrimmed(lpIdInput);
  const reason = asTrimmed(reasonInput);
  if (!lpId || !reason) return { ok: false, reason: 'error', message: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<BlockLpResult>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_LP_BLOCK_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const before = await ctx.client.query<{
        id: string;
        lp_number: string;
        status: string;
        qa_status: string;
        quantity: string;
        site_id: string | null;
        wo_id: string | null;
        grn_id: string | null;
        lock_is_active_for_other_user: boolean;
      }>(
        `select lp.id::text,
                lp.lp_number,
                lp.status,
                lp.qa_status,
                lp.quantity::text,
                lp.site_id::text,
                lp.wo_id::text,
                lp.grn_id::text,
                (
                  lp.locked_by is not null
                  and lp.locked_by <> $2::uuid
                  and lp.locked_at > pg_catalog.now() - interval '5 minutes'
                ) as lock_is_active_for_other_user
           from public.license_plates lp
          where lp.org_id = app.current_org_id()
            and lp.id = $1::uuid
          for update`,
        [lpId, userId],
      );
      const lp = before.rows[0];
      if (!lp) return { ok: false, reason: 'not_found' };
      if (lp.lock_is_active_for_other_user) return { ok: false, reason: 'error', message: 'locked' };
      if ((TERMINAL_LP_STATUSES as readonly string[]).includes(lp.status)) {
        return { ok: false, reason: 'error', message: 'terminal_lp_status' };
      }
      if (lp.status === 'blocked' || lp.qa_status === 'on_hold') {
        return { ok: false, reason: 'error', message: 'already_blocked' };
      }

      const activeHold = await ctx.client.query<{ hold_id: string }>(
        `select hold_id::text
           from public.v_active_holds
          where org_id = app.current_org_id()
            and reference_type = 'lp'
            and reference_id = $1::uuid
          limit 1`,
        [lpId],
      );
      if (activeHold.rows[0]) return { ok: false, reason: 'error', message: 'already_blocked' };

      const hold = await ctx.client.query<{ id: string; hold_number: string }>(
        `insert into public.quality_holds (
           org_id,
           site_id,
           reference_type,
           reference_id,
           reason_free_text,
           priority,
           hold_status,
           created_by
         )
         values (
           app.current_org_id(),
           $2::uuid,
           'lp',
           $1::uuid,
           $3,
           'high',
           'open',
           $4::uuid
         )
         returning id::text, hold_number`,
        [lpId, lp.site_id, reason, userId],
      );
      const createdHold = hold.rows[0];
      if (!createdHold?.id) return { ok: false, reason: 'error', message: 'hold_insert_failed' };

      await ctx.client.query(
        `insert into public.quality_hold_items (
           org_id,
           hold_id,
           license_plate_id,
           qty_held_kg,
           item_status,
           notes
         )
         values (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, 'held', $4)
         on conflict (hold_id, license_plate_id) do nothing`,
        [createdHold.id, lpId, lp.quantity, reason],
      );

      const updated = await ctx.client.query<{
        id: string;
        lp_number: string;
        status: string;
        qa_status: string;
      }>(
        `update public.license_plates
            set status = 'blocked',
                qa_status = 'on_hold',
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status <> all($3::text[])
            and status <> 'blocked'
          returning id::text, lp_number, status, qa_status`,
        [lpId, userId, [...TERMINAL_LP_STATUSES]],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, reason: 'error', message: 'already_blocked' };

      const transactionId = uuidFromSeed(`warehouse.lp.block:${orgId}:${lpId}:${createdHold.id}`);
      await ctx.client.query(
        `insert into public.lp_state_history (
           org_id,
           site_id,
           lp_id,
           from_state,
           to_state,
           reason_code,
           reason_text,
           transaction_id,
           wo_id,
           grn_id,
           created_by,
           ext_jsonb
         )
         values (
           app.current_org_id(),
           $2::uuid,
           $1::uuid,
           $3,
           'blocked',
           'manual_block',
           $4,
           $5::uuid,
           $6::uuid,
           $7::uuid,
           $8::uuid,
           $9::jsonb
         )
         on conflict (org_id, transaction_id) do nothing`,
        [
          lpId,
          lp.site_id,
          lp.status,
          reason,
          transactionId,
          lp.wo_id,
          lp.grn_id,
          userId,
          JSON.stringify({
            source: 'warehouse_lp_block',
            holdId: createdHold.id,
            holdNumber: createdHold.hold_number,
            qaStatusFrom: lp.qa_status,
            qaStatusTo: 'on_hold',
          }),
        ],
      );

      await ctx.client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values (app.current_org_id(), 'quality.hold.created', 'quality_hold', $1::uuid, $2::jsonb, 'quality-holds-v1')`,
        [
          createdHold.id,
          JSON.stringify({
            org_id: orgId,
            actor_user_id: userId,
            holdId: createdHold.id,
            holdNumber: createdHold.hold_number,
            referenceType: 'lp',
            referenceId: lpId,
            lpIds: [lpId],
            source: 'warehouse_lp_block',
            reason,
          }),
        ],
      );

      return {
        ok: true,
        data: {
          lpId: row.id,
          lpNumber: row.lp_number,
          status: row.status,
          qaStatus: row.qa_status,
          holdId: createdHold.id,
          holdNumber: createdHold.hold_number,
        },
      };
    });
  } catch (error) {
    return mapFailure(error);
  }
}

export async function reserveLp(lpIdInput: string, woIdInput: string, qtyInput: string): Promise<WarehouseResult<ReserveLpResult>> {
  const lpId = asTrimmed(lpIdInput);
  const woId = asTrimmed(woIdInput);
  const qty = asTrimmed(qtyInput);
  if (!lpId || !woId || !qty || !isPositiveDecimal(qty)) {
    return { ok: false, reason: 'error', message: 'invalid_input' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<ReserveLpResult>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_LP_RESERVE_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const before = await ctx.client.query<{
        id: string;
        lp_number: string;
        status: string;
        qa_status: string;
        quantity: string;
        reserved_qty: string;
        reserved_for_wo_id: string | null;
        uom: string;
        site_id: string | null;
        wo_id: string | null;
        grn_id: string | null;
        lock_is_active_for_other_user: boolean;
      }>(
        `select lp.id::text,
                lp.lp_number,
                lp.status,
                lp.qa_status,
                lp.quantity::text,
                lp.reserved_qty::text,
                lp.reserved_for_wo_id::text,
                lp.uom,
                lp.site_id::text,
                lp.wo_id::text,
                lp.grn_id::text,
                (
                  lp.locked_by is not null
                  and lp.locked_by <> $2::uuid
                  and lp.locked_at > pg_catalog.now() - interval '5 minutes'
                ) as lock_is_active_for_other_user
           from public.license_plates lp
          where lp.org_id = app.current_org_id()
            and lp.id = $1::uuid
          for update`,
        [lpId, userId],
      );
      const lp = before.rows[0];
      if (!lp) return { ok: false, reason: 'not_found' };
      if (lp.lock_is_active_for_other_user) return { ok: false, reason: 'error', message: 'locked' };
      if ((TERMINAL_LP_STATUSES as readonly string[]).includes(lp.status) || lp.status === 'blocked') {
        return { ok: false, reason: 'error', message: 'invalid_state' };
      }
      if (lp.qa_status !== 'released') return { ok: false, reason: 'error', message: 'lp_not_released' };
      if (lp.reserved_for_wo_id && lp.reserved_for_wo_id !== woId) {
        return { ok: false, reason: 'error', message: 'reserved_for_other_wo' };
      }

      const wo = await ctx.client.query<{ id: string; wo_number: string; status: string }>(
        `select id::text, wo_number, status
           from public.work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [woId],
      );
      const workOrder = wo.rows[0];
      if (!workOrder) return { ok: false, reason: 'not_found' };
      if (!(OPEN_WO_STATUSES as readonly string[]).includes(workOrder.status)) {
        return { ok: false, reason: 'error', message: 'wo_not_open' };
      }

      const availability = await ctx.client.query<{ fits: boolean }>(
        `select ($1::numeric <= ($2::numeric - $3::numeric)) as fits`,
        [qty, lp.quantity, lp.reserved_qty],
      );
      if (availability.rows[0]?.fits !== true) {
        return { ok: false, reason: 'error', message: 'qty_exceeds_available' };
      }

      const updated = await ctx.client.query<{
        id: string;
        lp_number: string;
        status: string;
        reserved_qty: string;
        available_qty: string;
        reserved_for_wo_id: string | null;
        reserved_for_wo_number: string | null;
        uom: string;
      }>(
        `update public.license_plates lp
            set reserved_qty = reserved_qty + $2::numeric,
                reserved_for_wo_id = $3::uuid,
                status = 'reserved',
                updated_by = $4::uuid
          where lp.org_id = app.current_org_id()
            and lp.id = $1::uuid
            and lp.status in ('available', 'reserved')
            and lp.qa_status = 'released'
            and (lp.reserved_for_wo_id is null or lp.reserved_for_wo_id = $3::uuid)
            and (lp.quantity - lp.reserved_qty) >= $2::numeric
        returning lp.id::text,
                  lp.lp_number,
                  lp.status,
                  lp.reserved_qty::text,
                  (lp.quantity - lp.reserved_qty)::text as available_qty,
                  lp.reserved_for_wo_id::text,
                  (select wo.wo_number from public.work_orders wo where wo.org_id = app.current_org_id() and wo.id = lp.reserved_for_wo_id) as reserved_for_wo_number,
                  lp.uom`,
        [lpId, qty, woId, userId],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, reason: 'error', message: 'qty_exceeds_available' };

      const transactionId = uuidFromSeed(`warehouse.lp.reserve.manual:${orgId}:${lpId}:${woId}:${qty}`);
      await ctx.client.query(
        `insert into public.lp_state_history (
           org_id,
           site_id,
           lp_id,
           from_state,
           to_state,
           reason_code,
           reason_text,
           transaction_id,
           wo_id,
           grn_id,
           created_by,
           ext_jsonb
         )
         values (
           app.current_org_id(),
           $2::uuid,
           $1::uuid,
           $3,
           'reserved',
           'manual_reservation',
           $4,
           $5::uuid,
           $6::uuid,
           $7::uuid,
           $8::uuid,
           $9::jsonb
         )
         on conflict (org_id, transaction_id) do nothing`,
        [
          lpId,
          lp.site_id,
          lp.status,
          `Manual reserve ${qty} ${lp.uom} for ${workOrder.wo_number}`,
          transactionId,
          woId,
          lp.grn_id,
          userId,
          JSON.stringify({
            source: 'manual',
            quantity: qty,
            uom: lp.uom,
            reservedForWoId: woId,
            reservedForWoNumber: workOrder.wo_number,
            reservedQtyFrom: lp.reserved_qty,
            reservedQtyTo: row.reserved_qty,
          }),
        ],
      );

      return {
        ok: true,
        data: {
          lpId: row.id,
          lpNumber: row.lp_number,
          status: row.status,
          reservedQty: String(row.reserved_qty),
          availableQty: String(row.available_qty),
          reservedForWoId: row.reserved_for_wo_id,
          reservedForWoNumber: row.reserved_for_wo_number,
          uom: row.uom,
        },
      };
    });
  } catch (error) {
    return mapFailure(error);
  }
}
