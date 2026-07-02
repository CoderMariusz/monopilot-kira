'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_LP_RESERVE_PERMISSION,
  WAREHOUSE_READ_PERMISSION,
  asTrimmed,
  hasWarehousePermission,
  uuidFromSeed,
  type QueryClient,
  type ReleaseReservationInput,
  type ReservationRow,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';

export async function listReservations(): Promise<WarehouseResult<ReservationRow[]>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<ReservationRow[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        lp_id: string;
        lp_number: string;
        status: string;
        reserved_qty: string;
        reserved_for_wo_id: string | null;
        wo_number: string | null;
        item_code: string | null;
        item_name: string | null;
        quantity: string;
        uom: string;
      }>(
        `select lp.id::text as lp_id,
                lp.lp_number,
                lp.status,
                lp.reserved_qty::text,
                lp.reserved_for_wo_id::text,
                wo.wo_number,
                i.item_code,
                i.name as item_name,
                lp.quantity::text,
                lp.uom
           from public.license_plates lp
           left join public.work_orders wo on wo.org_id = app.current_org_id() and wo.id = lp.reserved_for_wo_id
           left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
          where lp.org_id = app.current_org_id()
            and (
              lp.reserved_for_wo_id is not null
              or lp.reserved_qty > 0
            )
          order by lp.updated_at desc, lp.lp_number asc`,
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          lpId: row.lp_id,
          lpNumber: row.lp_number,
          status: row.status,
          reservedQty: String(row.reserved_qty),
          reservedForWoId: row.reserved_for_wo_id,
          woNumber: row.wo_number,
          itemCode: row.item_code,
          itemName: row.item_name,
          quantity: String(row.quantity),
          uom: row.uom,
        })),
      };
    });
  } catch (error) {
    console.error('[warehouse] listReservations failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function releaseReservation(input: ReleaseReservationInput): Promise<WarehouseResult<ReservationRow>> {
  const lpId = asTrimmed(input?.lpId);
  const reason = asTrimmed(input?.reason);
  if (!lpId || !reason) return { ok: false, reason: 'error', message: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<ReservationRow>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_LP_RESERVE_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const before = await ctx.client.query<{
        id: string;
        status: string;
        reserved_qty: string;
        reserved_for_wo_id: string | null;
        locked_by: string | null;
        lock_is_active_for_other_user: boolean;
      }>(
        `select lp.id::text,
                lp.status,
                lp.reserved_qty::text,
                lp.reserved_for_wo_id::text,
                lp.locked_by::text,
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

      // Review HIGH finding: terminal LPs (consumed/destroyed/shipped/merged)
      // must NOT be mutated — silently zeroing reserved_qty on them is a
      // ledger-relevant write with no lp_state_history row. Refuse instead.
      if (['consumed', 'destroyed', 'shipped', 'merged'].includes(lp.status)) {
        return { ok: false, reason: 'error', message: 'not_releasable_status' };
      }

      const nextStatus = lp.status === 'reserved' ? 'available' : lp.status;
      const updated = await ctx.client.query<{
        lp_id: string;
        lp_number: string;
        status: string;
        reserved_qty: string;
        reserved_for_wo_id: string | null;
        wo_number: string | null;
        item_code: string | null;
        item_name: string | null;
        quantity: string;
        uom: string;
      }>(
        `update public.license_plates lp
            set reserved_qty = 0,
                reserved_for_wo_id = null,
                status = $2,
                updated_by = $3::uuid
          where lp.org_id = app.current_org_id()
            and lp.id = $1::uuid
        returning lp.id::text as lp_id,
                  lp.lp_number,
                  lp.status,
                  lp.reserved_qty::text,
                  lp.reserved_for_wo_id::text,
                  null::text as wo_number,
                  (select i.item_code from public.items i where i.org_id = app.current_org_id() and i.id = lp.product_id) as item_code,
                  (select i.name from public.items i where i.org_id = app.current_org_id() and i.id = lp.product_id) as item_name,
                  lp.quantity::text,
                  lp.uom`,
        [lpId, nextStatus, userId],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };

      if (lp.status !== nextStatus) {
        await ctx.client.query(
          `insert into public.lp_state_history
             (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, created_by)
           values
             (app.current_org_id(), $1::uuid, $2, $3, 'reservation_released', $4, $5::uuid, $6::uuid)
           on conflict (org_id, transaction_id) do nothing`,
          [lpId, lp.status, nextStatus, reason, uuidFromSeed(`warehouse.lp.reserve.release:${orgId}:${lpId}:${reason}`), userId],
        );
      }

      revalidateLocalized('/warehouse/reservations', 'page');

      return {
        ok: true,
        data: {
          lpId: row.lp_id,
          lpNumber: row.lp_number,
          status: row.status,
          reservedQty: String(row.reserved_qty),
          reservedForWoId: row.reserved_for_wo_id,
          woNumber: row.wo_number,
          itemCode: row.item_code,
          itemName: row.item_name,
          quantity: String(row.quantity),
          uom: row.uom,
        },
      };
    });
  } catch (error) {
    console.error('[warehouse] releaseReservation failed', error);
    return { ok: false, reason: 'error' };
  }
}
