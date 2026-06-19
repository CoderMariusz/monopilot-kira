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

/**
 * WH-006 fix — UNIFIED movement ledger.
 *
 * The movements screen historically read ONLY public.stock_moves, but the
 * receive / consume / output write paths record their LP transitions in
 * public.lp_state_history (an append-only state ledger) and never write a
 * stock_moves row. Live consequence: stock_moves=0, lp_state_history=N, so the
 * Receipts / Consume tabs were permanently empty.
 *
 * This action is the SAFE read-side fix: it returns a UNION of the two ledgers
 * normalized to one StockMoveListItem shape (no write-path changes, no
 * migration). Both tables are RLS org-scoped via app.current_org_id().
 *
 *   stock_moves      → kept as-is (putaway / transfer / issue / adjustment),
 *                      source='stock_move'.
 *   lp_state_history → each transition mapped to a movement type:
 *                        • from=null, to=received, reason scanner_receive_po → 'receipt'
 *                        • from=null, to=received, reason production_output  → 'production'
 *                        • to=consumed                                       → 'consume_to_wo'
 *                        • →available (qa/putaway promotion)                 → 'putaway'
 *                        • to=blocked/quarantine/returned                    → matching type
 *                        • fallback                                          → from→to text
 *                      source='lp_state'. lp_state_history has no qty/location
 *                      columns, so qty/uom/to-location come from the LP itself
 *                      (the from-location is unknown → null); the synthetic
 *                      move # is derived from the history row id.
 *
 * Ordered by timestamp desc across both ledgers, then limited.
 */
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
        quantity: string | null;
        uom: string | null;
        move_date: string | Date;
        reason_text: string | null;
        source: 'stock_move' | 'lp_state';
      }>(
        `with unified as (
           -- (a) the explicit stock-move ledger — putaway / transfer / issue / adjustment.
           select sm.id::text                       as id,
                  sm.move_number                     as move_number,
                  sm.lp_id::text                     as lp_id,
                  lp.lp_number                        as lp_number,
                  sm.move_type                        as move_type,
                  fl.code                             as from_location_code,
                  tl.code                             as to_location_code,
                  sm.quantity::text                   as quantity,
                  sm.uom                              as uom,
                  sm.move_date                        as move_date,
                  sm.reason_text                      as reason_text,
                  'stock_move'                        as source
             from public.stock_moves sm
             left join public.license_plates lp on lp.org_id = app.current_org_id() and lp.id = sm.lp_id
             left join public.locations fl on fl.org_id = app.current_org_id() and fl.id = sm.from_location_id
             left join public.locations tl on tl.org_id = app.current_org_id() and tl.id = sm.to_location_id
            where sm.org_id = app.current_org_id()

           union all

           -- (b) the LP state-transition ledger — receive / production output / consume / promotion.
           select h.id::text                          as id,
                  'LPH-' || upper(left(replace(h.id::text, '-', ''), 12)) as move_number,
                  h.lp_id::text                        as lp_id,
                  lp2.lp_number                         as lp_number,
                  case
                    when h.to_state = 'received' and h.reason_code = 'production_output' then 'production'
                    when h.to_state = 'received' then 'receipt'
                    when h.to_state = 'consumed' then 'consume_to_wo'
                    when h.to_state = 'available' then 'putaway'
                    when h.to_state = 'quarantine' then 'quarantine'
                    when h.to_state = 'returned' then 'return'
                    when h.to_state = 'blocked' then 'adjustment'
                    else coalesce(h.from_state, '∅') || '→' || h.to_state
                  end                                   as move_type,
                  -- lp_state_history has no location columns; the 'to' is the LP's
                  -- current location, the 'from' is unknown.
                  null                                  as from_location_code,
                  tl2.code                              as to_location_code,
                  lp2.quantity::text                    as quantity,
                  lp2.uom                               as uom,
                  h.transitioned_at                     as move_date,
                  coalesce(h.reason_text, h.reason_code) as reason_text,
                  'lp_state'                            as source
             from public.lp_state_history h
             left join public.license_plates lp2 on lp2.org_id = app.current_org_id() and lp2.id = h.lp_id
             left join public.locations tl2 on tl2.org_id = app.current_org_id() and tl2.id = lp2.location_id
            where h.org_id = app.current_org_id()
         )
         select id, move_number, lp_id, lp_number, move_type,
                from_location_code, to_location_code, quantity, uom,
                move_date, reason_text, source
           from unified
          where ($1::text is null or move_type = $1)
          order by move_date desc, id desc
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
          quantity: row.quantity == null ? '' : String(row.quantity),
          uom: row.uom,
          moveDate: toIso(row.move_date) ?? '',
          reasonText: row.reason_text,
          source: row.source,
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
          source: 'stock_move',
        },
      };
    });
  } catch (error) {
    console.error('[warehouse] createStockMove failed', error);
    return { ok: false, reason: 'error' };
  }
}
