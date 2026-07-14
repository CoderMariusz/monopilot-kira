'use server';

import { randomUUID } from 'node:crypto';
import { assertNoActiveHoldForLp, QaHoldActiveError } from '@monopilot/server/quality/holdsGuard.js';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';
import {
  ALLOWED_CREATE_PICK_LIST_SO_STATUSES,
  isSalesOrderStatus,
} from './so-transitions';
import { readLockedSalesOrderStatus, writeSalesOrderStatusInContext } from './so-status-write';
import type { PickListDetail } from './pick-actions-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

type CreatePickListResult = { ok: true; pickListId: string } | { ok: false; error: string };
type PickLineResult = { ok: true } | { ok: false; error: string };
type GetPickListResult =
  | { ok: true; data: PickListDetail | null; canPick: boolean }
  | { ok: false; error: string };

const SHIP_PICK_EXECUTE = 'ship.pick.execute';
const SHIPPING_PICK_COMPLETED_EVENT = 'shipping.pick.completed';

const OPEN_PICK_LIST_STATUSES = ['pending', 'assigned', 'in_progress'] as const;

async function requirePermission(ctx: ShippingContext, permission: string): Promise<{ ok: false; error: string } | null> {
  if (!(await hasPermission(ctx, permission))) {
    return { ok: false, error: 'forbidden' };
  }
  return null;
}

async function assertLpPickable(ctx: ShippingContext, lpId: string): Promise<{ ok: false; error: string } | null> {
  try {
    await assertNoActiveHoldForLp(lpId, ctx.client);
  } catch (error) {
    if (error instanceof QaHoldActiveError) {
      return { ok: false, error: 'lp_blocked_for_pick' };
    }
    throw error;
  }

  const { rows } = await ctx.client.query<{ reason: string }>(
    `select case
              when exists (
                select 1
                  from public.license_plates lp
                 where lp.org_id = app.current_org_id()
                   and lp.id = $1::uuid
                   and lp.qa_status <> 'released'
              ) then 'qa'
              when exists (
                select 1
                  from public.license_plates lp
                 where lp.org_id = app.current_org_id()
                   and lp.id = $1::uuid
                   and lp.expiry_date is not null
                   and lp.expiry_date < current_date
              ) then 'expired'
              else null
            end as reason`,
    [lpId],
  );
  const reason = rows[0]?.reason;
  if (reason) return { ok: false, error: 'lp_blocked_for_pick' };
  return null;
}

async function emitPickCompletedOutbox(
  ctx: ShippingContext,
  params: {
    pickListLineId: string;
    pickListId: string;
    salesOrderId: string;
    salesOrderLineId: string;
    licensePlateId: string;
    quantityPicked: string;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, 'pick_list_line', $2::uuid, $3::jsonb,
        coalesce(current_setting('app.app_version', true), 'dev'), $4)
     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
    [
      SHIPPING_PICK_COMPLETED_EVENT,
      params.pickListLineId,
      JSON.stringify({
        pick_list_line_id: params.pickListLineId,
        pick_list_id: params.pickListId,
        sales_order_id: params.salesOrderId,
        sales_order_line_id: params.salesOrderLineId,
        license_plate_id: params.licensePlateId,
        quantity_picked: params.quantityPicked,
        org_id: ctx.orgId,
        picked_by: ctx.userId,
      }),
      `${SHIPPING_PICK_COMPLETED_EVENT}:pick_list_line:${params.pickListLineId}:${randomUUID()}`,
    ],
  );
}

export async function createPickList(soId: string): Promise<CreatePickListResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<CreatePickListResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_PICK_EXECUTE);
    if (forbidden) return forbidden;

    const currentStatus = await readLockedSalesOrderStatus(ctx, soId);
    if (currentStatus === 'not_found') return { ok: false, error: 'not_found' };
    if (!ALLOWED_CREATE_PICK_LIST_SO_STATUSES.has(currentStatus)) {
      return { ok: false, error: 'invalid_state' };
    }

    const { rows: openPickRows } = await ctx.client.query<{ id: string }>(
      `select id::text
         from public.pick_lists pl
        where pl.org_id = app.current_org_id()
          and pl.sales_order_id = $1::uuid
          and pl.deleted_at is null
          and pl.status = any($2::text[])
        limit 1`,
      [soId, OPEN_PICK_LIST_STATUSES],
    );
    if (openPickRows.length > 0) {
      return { ok: false, error: 'open_pick_list_exists' };
    }

    const { rows: soRows } = await ctx.client.query<{ site_id: string | null }>(
      `select site_id::text
         from public.sales_orders
        where org_id = app.current_org_id()
          and id = $1::uuid
          and deleted_at is null
        limit 1`,
      [soId],
    );
    const siteId = soRows[0]?.site_id ?? null;

    const { rows: allocationRows } = await ctx.client.query<{
      sales_order_line_id: string;
      license_plate_id: string;
      product_id: string;
      lot_number: string | null;
      location_id: string | null;
      quantity_allocated: string;
      line_number: number | string | null;
    }>(
      `select ia.sales_order_line_id::text,
              ia.license_plate_id::text,
              sol.product_id::text,
              lp.lot_number,
              lp.location_id::text as location_id,
              ia.quantity_allocated::text,
              sol.line_number
         from public.inventory_allocations ia
         join public.sales_order_lines sol
           on sol.id = ia.sales_order_line_id
          and sol.org_id = app.current_org_id()
          and sol.sales_order_id = $1::uuid
          and sol.deleted_at is null
         left join public.license_plates lp
           on lp.org_id = app.current_org_id()
          and lp.id = ia.license_plate_id
        where ia.org_id = app.current_org_id()
          and ia.deleted_at is null
          and ia.status = 'allocated'
        order by sol.line_number, ia.allocated_at`,
      [soId],
    );
    if (allocationRows.length === 0) {
      return { ok: false, error: 'no_allocations' };
    }

    const { rows: pickListRows } = await ctx.client.query<{ id: string }>(
      `insert into public.pick_lists
         (org_id, site_id, pick_type, status, sales_order_id, created_by, updated_by)
       values ($1::uuid, $2::uuid, 'single_order', 'pending', $3::uuid, $4::uuid, $4::uuid)
       returning id::text`,
      [orgId, siteId, soId, userId],
    );
    const pickListId = pickListRows[0]?.id;
    if (!pickListId) return { ok: false, error: 'persistence_failed' };

    let sequence = 1;
    for (const row of allocationRows) {
      await ctx.client.query(
        `insert into public.pick_list_lines
           (org_id, site_id, pick_list_id, sales_order_line_id, license_plate_id, location_id,
            product_id, lot_number, quantity_to_pick, status, pick_sequence, created_by, updated_by)
         values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
                 $7::uuid, $8, $9::numeric, 'pending', $10::integer, $11::uuid, $11::uuid)`,
        [
          orgId,
          siteId,
          pickListId,
          row.sales_order_line_id,
          row.license_plate_id,
          row.location_id,
          row.product_id,
          row.lot_number,
          row.quantity_allocated,
          sequence,
          userId,
        ],
      );
      sequence += 1;
    }

    revalidateLocalized('/shipping');
    return { ok: true, pickListId };
  });
}

export async function pickLine(
  pickListLineId: string,
  input: { pickedLicensePlateId?: string; quantityPicked: string },
): Promise<PickLineResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<PickLineResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_PICK_EXECUTE);
    if (forbidden) return forbidden;

    const quantityPicked = input.quantityPicked?.trim();
    if (!quantityPicked) {
      return { ok: false, error: 'invalid_input' };
    }

    const { rows: lineRows } = await ctx.client.query<{
      id: string;
      pick_list_id: string;
      sales_order_line_id: string | null;
      license_plate_id: string | null;
      quantity_to_pick: string;
      status: string;
      sales_order_id: string | null;
      pick_list_status: string;
    }>(
      `select pll.id::text,
              pll.pick_list_id::text,
              pll.sales_order_line_id::text,
              pll.license_plate_id::text,
              pll.quantity_to_pick::text,
              pll.status,
              pl.sales_order_id::text,
              pl.status as pick_list_status
         from public.pick_list_lines pll
         join public.pick_lists pl
           on pl.id = pll.pick_list_id
          and pl.org_id = app.current_org_id()
          and pl.deleted_at is null
        where pll.org_id = app.current_org_id()
          and pll.id = $1::uuid
          and pll.deleted_at is null
        for update of pll, pl`,
      [pickListLineId],
    );
    const line = lineRows[0];
    if (!line || line.status !== 'pending') {
      return { ok: false, error: 'invalid_state' };
    }
    if (!OPEN_PICK_LIST_STATUSES.includes(line.pick_list_status as (typeof OPEN_PICK_LIST_STATUSES)[number])) {
      return { ok: false, error: 'invalid_state' };
    }
    if (!line.sales_order_line_id) {
      return { ok: false, error: 'invalid_state' };
    }

    const assignedLicensePlateId = line.license_plate_id;
    if (!assignedLicensePlateId) {
      return { ok: false, error: 'invalid_input' };
    }
    if (input.pickedLicensePlateId && input.pickedLicensePlateId !== assignedLicensePlateId) {
      return { ok: false, error: 'invalid_input' };
    }

    const { rows: qtyRows } = await ctx.client.query<{ exact_match: boolean; short_pick: boolean }>(
      `select ($1::numeric(14,3) = $2::numeric(14,3)) as exact_match,
              ($1::numeric(14,3) < $2::numeric(14,3)) as short_pick`,
      [quantityPicked, line.quantity_to_pick],
    );
    if (!qtyRows[0]?.exact_match) {
      if (qtyRows[0]?.short_pick) {
        return { ok: false, error: 'short_pick_not_supported' };
      }
      return { ok: false, error: 'invalid_input' };
    }

    const lpBlocked = await assertLpPickable(ctx, assignedLicensePlateId);
    if (lpBlocked) return lpBlocked;

    const { rows: allocationRows } = await ctx.client.query<{ id: string }>(
      `select ia.id::text
         from public.inventory_allocations ia
        where ia.org_id = app.current_org_id()
          and ia.sales_order_line_id = $1::uuid
          and ia.license_plate_id = $2::uuid
          and ia.deleted_at is null
          and ia.status = 'allocated'
        for update`,
      [line.sales_order_line_id, assignedLicensePlateId],
    );
    if (!allocationRows[0]?.id) {
      return { ok: false, error: 'allocation_not_found' };
    }
    const allocationId = allocationRows[0].id;

    const { rowCount: lineUpdateCount } = await ctx.client.query(
      `update public.pick_list_lines
          set status = 'picked',
              quantity_picked = $2::numeric(14,3),
              picked_license_plate_id = $3::uuid,
              picked_at = now(),
              picked_by = $4::uuid,
              updated_at = now(),
              updated_by = $4::uuid
        where org_id = app.current_org_id()
          and id = $1::uuid
          and deleted_at is null`,
      [pickListLineId, quantityPicked, assignedLicensePlateId, userId],
    );
    if (lineUpdateCount !== 1) return { ok: false, error: 'persistence_failed' };

    const { rowCount: allocationUpdateCount } = await ctx.client.query(
      `update public.inventory_allocations
          set status = 'picked',
              updated_at = now(),
              updated_by = $2::uuid
        where org_id = app.current_org_id()
          and id = $1::uuid
          and deleted_at is null`,
      [allocationId, userId],
    );
    if (allocationUpdateCount !== 1) {
      throw new Error('persistence_failed');
    }

    await ctx.client.query(
      `update public.sales_order_lines
          set quantity_picked = quantity_picked + $2::numeric(14,3),
              updated_at = now(),
              updated_by = $3::uuid
        where org_id = app.current_org_id()
          and id = $1::uuid
          and deleted_at is null`,
      [line.sales_order_line_id, quantityPicked, userId],
    );

    if (line.sales_order_id) {
      await emitPickCompletedOutbox(ctx, {
        pickListLineId,
        pickListId: line.pick_list_id,
        salesOrderId: line.sales_order_id,
        salesOrderLineId: line.sales_order_line_id,
        licensePlateId: assignedLicensePlateId,
        quantityPicked,
      });
    }

    if (line.pick_list_status === 'pending' || line.pick_list_status === 'assigned') {
      await ctx.client.query(
        `update public.pick_lists
            set status = 'in_progress',
                started_at = coalesce(started_at, now()),
                updated_at = now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and deleted_at is null`,
        [line.pick_list_id, userId],
      );
    }

    const { rows: pendingRows } = await ctx.client.query<{ pending_count: number | string | bigint | null }>(
      `select count(*)::int as pending_count
         from public.pick_list_lines pll
        where pll.org_id = app.current_org_id()
          and pll.pick_list_id = $1::uuid
          and pll.deleted_at is null
          and pll.status = 'pending'`,
      [line.pick_list_id],
    );
    const pendingCount = Number(pendingRows[0]?.pending_count ?? 0);
    if (pendingCount === 0) {
      await ctx.client.query(
        `update public.pick_lists
            set status = 'completed',
                completed_at = now(),
                updated_at = now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and deleted_at is null`,
        [line.pick_list_id, userId],
      );

      if (line.sales_order_id) {
        const currentSoStatus = await readLockedSalesOrderStatus(ctx, line.sales_order_id);
        if (currentSoStatus !== 'not_found' && isSalesOrderStatus(currentSoStatus)) {
          const writeResult = await writeSalesOrderStatusInContext(ctx, line.sales_order_id, 'picked', {
            currentStatus: currentSoStatus,
          });
          if (writeResult === 'illegal_transition') {
            throw new Error('illegal_transition');
          }
        }
      }
    }

    revalidateLocalized('/shipping');
    return { ok: true };
  });
}

export async function getPickListForSalesOrder(soId: string): Promise<GetPickListResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<GetPickListResult> => {
    const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
    const forbidden = await requirePermission(ctx, SHIP_PICK_EXECUTE);
    if (forbidden) return forbidden;

    const canPick = true;

    const { rows: pickListRows } = await ctx.client.query<{
      id: string;
      pick_list_number: string;
      status: string;
      sales_order_id: string;
      sales_order_number: string;
    }>(
      `select pl.id::text,
              pl.pick_list_number,
              pl.status,
              pl.sales_order_id::text,
              so.order_number as sales_order_number
         from public.pick_lists pl
         join public.sales_orders so
           on so.id = pl.sales_order_id
          and so.org_id = app.current_org_id()
        where pl.org_id = app.current_org_id()
          and pl.sales_order_id = $1::uuid
          and pl.deleted_at is null
        order by pl.created_at desc
        limit 1`,
      [soId],
    );
    const pickList = pickListRows[0];
    if (!pickList) {
      return { ok: true, data: null, canPick };
    }

    const { rows: lineRows } = await ctx.client.query<{
      id: string;
      line_number: number | string | null;
      item_code: string | null;
      item_name: string | null;
      lp_code: string | null;
      quantity_to_pick: string;
      quantity_picked: string;
      status: string;
    }>(
      `select pll.id::text,
              sol.line_number,
              i.item_code,
              i.name as item_name,
              lp.lp_number as lp_code,
              pll.quantity_to_pick::text,
              pll.quantity_picked::text,
              pll.status
         from public.pick_list_lines pll
         left join public.sales_order_lines sol
           on sol.id = pll.sales_order_line_id
          and sol.org_id = app.current_org_id()
         left join public.items i
           on i.org_id = app.current_org_id()
          and i.id = pll.product_id
         left join public.license_plates lp
           on lp.org_id = app.current_org_id()
          and lp.id = pll.license_plate_id
        where pll.org_id = app.current_org_id()
          and pll.pick_list_id = $1::uuid
          and pll.deleted_at is null
        order by pll.pick_sequence nulls last, sol.line_number`,
      [pickList.id],
    );

    return {
      ok: true,
      canPick,
      data: {
        id: pickList.id,
        pickListNumber: pickList.pick_list_number,
        status: pickList.status,
        salesOrderId: pickList.sales_order_id,
        salesOrderNumber: pickList.sales_order_number,
        lines: lineRows.map((row) => ({
          id: row.id,
          lineNo: row.line_number == null ? null : Number(row.line_number),
          itemCode: row.item_code,
          itemName: row.item_name,
          licensePlateCode: row.lp_code,
          quantityToPick: row.quantity_to_pick,
          quantityPicked: row.quantity_picked,
          status: row.status,
        })),
      },
    };
  });
}
