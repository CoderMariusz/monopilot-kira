'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_READ_PERMISSION,
  WAREHOUSE_STOCK_MOVE_PERMISSION,
  asLimit,
  asTrimmed,
  hasWarehousePermission,
  moveNumberFromTransactionId,
  toIso,
  uuidFromSeed,
  type CreateStockMoveInput,
  type QueryClient,
  type StockMoveListInput,
  type StockMoveListItem,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';

export async function listStockMoves(input: StockMoveListInput = {}): Promise<WarehouseResult<StockMoveListItem[]>> {
  const moveType = asTrimmed(input.moveType);
  const limit = asLimit(input.limit);

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<StockMoveListItem[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        id: string;
        move_number: string;
        lp_id: string;
        lp_number: string | null;
        move_type: string;
        from_location_code: string | null;
        to_location_code: string | null;
        quantity: string;
        uom: string | null;
        move_date: string | Date;
        reason_text: string | null;
      }>(
        `select sm.id::text,
                sm.move_number,
                sm.lp_id::text,
                lp.lp_number,
                sm.move_type,
                fl.code as from_location_code,
                tl.code as to_location_code,
                sm.quantity::text,
                sm.uom,
                sm.move_date,
                sm.reason_text
           from public.stock_moves sm
           left join public.license_plates lp on lp.org_id = app.current_org_id() and lp.id = sm.lp_id
           left join public.locations fl on fl.org_id = app.current_org_id() and fl.id = sm.from_location_id
           left join public.locations tl on tl.org_id = app.current_org_id() and tl.id = sm.to_location_id
          where sm.org_id = app.current_org_id()
            and ($1::text is null or sm.move_type = $1)
          order by sm.move_date desc, sm.created_at desc
          limit $2::integer`,
        [moveType, limit],
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          moveNumber: row.move_number,
          lpId: row.lp_id,
          lpNumber: row.lp_number,
          moveType: row.move_type,
          fromLocationCode: row.from_location_code,
          toLocationCode: row.to_location_code,
          quantity: String(row.quantity),
          uom: row.uom,
          moveDate: toIso(row.move_date) ?? '',
          reasonText: row.reason_text,
        })),
      };
    });
  } catch (error) {
    console.error('[warehouse] listStockMoves failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function createStockMove(input: CreateStockMoveInput): Promise<WarehouseResult<StockMoveListItem>> {
  const lpId = asTrimmed(input?.lpId);
  const toLocationId = asTrimmed(input?.toLocationId);
  const reason = asTrimmed(input?.reason);
  const clientOpId = asTrimmed(input?.clientOpId);
  if (!lpId || !toLocationId || !clientOpId) return { ok: false, reason: 'error', message: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<StockMoveListItem>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_STOCK_MOVE_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const lpRes = await ctx.client.query<{
        id: string;
        lp_number: string;
        status: string;
        location_id: string | null;
        quantity: string;
        uom: string;
        locked_by: string | null;
        lock_is_active_for_other_user: boolean;
      }>(
        `select lp.id::text,
                lp.lp_number,
                lp.status,
                lp.location_id::text,
                lp.quantity::text,
                lp.uom,
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
      const lp = lpRes.rows[0];
      if (!lp) return { ok: false, reason: 'not_found' };
      if (['consumed', 'destroyed', 'shipped'].includes(lp.status)) {
        return { ok: false, reason: 'error', message: 'immovable_status' };
      }
      if (lp.lock_is_active_for_other_user) {
        return { ok: false, reason: 'error', message: 'locked' };
      }

      const locRes = await ctx.client.query<{ id: string }>(
        `select id::text
           from public.locations
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [toLocationId],
      );
      if (!locRes.rows[0]) return { ok: false, reason: 'not_found' };

      const transactionId = uuidFromSeed(`warehouse.stock.move:${orgId}:${lpId}:${clientOpId}`);
      const moveNumber = moveNumberFromTransactionId(transactionId);

      const inserted = await ctx.client.query<{ id: string }>(
        `insert into public.stock_moves
           (org_id, move_number, lp_id, move_type, from_location_id, to_location_id,
            quantity, uom, reason_text, transaction_id, created_by, updated_by)
         values
           (app.current_org_id(), $1, $2::uuid, 'transfer', $3::uuid, $4::uuid,
            $5::numeric, $6, $7, $8::uuid, $9::uuid, $9::uuid)
         on conflict (org_id, transaction_id) do nothing
         returning id::text`,
        [moveNumber, lpId, lp.location_id, toLocationId, lp.quantity, lp.uom, reason, transactionId, userId],
      );

      await ctx.client.query(
        `update public.license_plates
            set location_id = $2::uuid,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [lpId, toLocationId, userId],
      );

      const move = await ctx.client.query<{
        id: string;
        move_number: string;
        lp_id: string;
        lp_number: string | null;
        move_type: string;
        from_location_code: string | null;
        to_location_code: string | null;
        quantity: string;
        uom: string | null;
        move_date: string | Date;
        reason_text: string | null;
      }>(
        `select sm.id::text,
                sm.move_number,
                sm.lp_id::text,
                lp.lp_number,
                sm.move_type,
                fl.code as from_location_code,
                tl.code as to_location_code,
                sm.quantity::text,
                sm.uom,
                sm.move_date,
                sm.reason_text
           from public.stock_moves sm
           left join public.license_plates lp on lp.org_id = app.current_org_id() and lp.id = sm.lp_id
           left join public.locations fl on fl.org_id = app.current_org_id() and fl.id = sm.from_location_id
           left join public.locations tl on tl.org_id = app.current_org_id() and tl.id = sm.to_location_id
          where sm.org_id = app.current_org_id()
            and sm.transaction_id = $1::uuid
          limit 1`,
        [transactionId],
      );
      const row = move.rows[0];
      if (!row || !inserted) return { ok: false, reason: 'error' };

      return {
        ok: true,
        data: {
          id: row.id,
          moveNumber: row.move_number,
          lpId: row.lp_id,
          lpNumber: row.lp_number,
          moveType: row.move_type,
          fromLocationCode: row.from_location_code,
          toLocationCode: row.to_location_code,
          quantity: String(row.quantity),
          uom: row.uom,
          moveDate: toIso(row.move_date) ?? '',
          reasonText: row.reason_text,
        },
      };
    });
  } catch (error) {
    console.error('[warehouse] createStockMove failed', error);
    return { ok: false, reason: 'error' };
  }
}
