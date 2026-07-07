'use server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { debitWac } from '../../../../../../../../lib/finance/upsert-wac';
import {
  asTrimmed,
  hasWarehousePermission,
  moveNumberFromTransactionId,
  uuidFromSeed,
  type QueryClient,
  type WarehouseContext,
} from '../../../_actions/shared';

const WAREHOUSE_LP_SPLIT_PERMISSION = 'warehouse.lp.split';
const WAREHOUSE_LP_MERGE_PERMISSION = 'warehouse.lp.merge';
const WAREHOUSE_LP_DESTROY_PERMISSION = 'warehouse.lp.destroy';

// Operable physical states for split/merge: material present, not held, not terminal.
// 'quarantine'/'blocked' are deliberately EXCLUDED — splitting/merging held stock would
// mint 'available' children that escape the hold (food-safety, MON-domain-quality #1).
// To rework held stock: destroy it (disposal) or release the hold first.
const SPLIT_MERGE_STATES = new Set(['received', 'available', 'returned']);
// Destroy blocks already-terminal states (re-destroying or destroying consumed/shipped
// stock corrupts the ledger). Holding/quarantine/blocked CAN be destroyed — that is the
// legitimate "dispose of rejected material" path.
const DESTROY_BLOCKED_STATES = new Set(['consumed', 'shipped', 'merged', 'destroyed']);

type LpMutationResult = { ok: true } | { ok: false; error: string };

type LockedLp = {
  id: string;
  lp_number: string;
  site_id: string | null;
  warehouse_id: string;
  location_id: string | null;
  product_id: string;
  quantity: string;
  reserved_qty: string;
  uom: string;
  status: string;
  origin: string;
  parent_lp_id: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  qa_status: string;
  grn_id: string | null;
  wo_id: string | null;
};

function failure(error: string): LpMutationResult {
  return { ok: false, error };
}

function mapFailure(error: unknown): LpMutationResult {
  console.error('[warehouse] lp split/merge/destroy action failed', error);
  return failure('error');
}

function asPositiveQuantity(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const text = String(value);
  return /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(text) ? text : null;
}

function mostRestrictiveQaStatus(statuses: string[]): string {
  const rank: Record<string, number> = { released: 0, pending: 1, hold: 2, on_hold: 2, rejected: 3 };
  return statuses.reduce((selected, status) => (rank[status] > rank[selected] ? status : selected), statuses[0] ?? 'released');
}

function decimalToMicro(value: string): bigint {
  const sign = value.startsWith('-') ? -1n : 1n;
  const unsigned = value.replace(/^-/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  return sign * (BigInt(whole || '0') * 1_000_000n + BigInt(fraction.padEnd(6, '0').slice(0, 6)));
}

function microToDecimal(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const whole = abs / 1_000_000n;
  const fraction = (abs % 1_000_000n).toString().padStart(6, '0');
  return `${sign}${whole}.${fraction}`;
}

function sumDecimal(values: string[]): string {
  return microToDecimal(values.reduce((sum, value) => sum + decimalToMicro(value), 0n));
}

function isZeroDecimal(value: string): boolean {
  return decimalToMicro(value) === 0n;
}

async function lockLp(ctx: WarehouseContext, lpId: string): Promise<LockedLp | null> {
  const { rows } = await ctx.client.query<LockedLp>(
    `select lp.id::text,
            lp.lp_number,
            lp.site_id::text,
            lp.warehouse_id::text,
            lp.location_id::text,
            lp.product_id::text,
            lp.quantity::text,
            lp.reserved_qty::text,
            lp.uom,
            lp.status,
            lp.origin,
            lp.parent_lp_id::text,
            lp.batch_number,
            lp.expiry_date::text,
            lp.qa_status,
            lp.grn_id::text,
            lp.wo_id::text
       from public.license_plates lp
      where lp.org_id = app.current_org_id()
        and lp.id = $1::uuid
      for update`,
    [lpId],
  );
  return rows[0] ?? null;
}

// Food-safety gate: which of these LPs are under an OPEN quality hold. Reads the
// canonical SECURITY-INVOKER read-model (v_active_holds, T-064) — never quality_holds
// directly. Split/merge must refuse held material so a hold can't be laundered off.
async function activeHeldLpIds(ctx: WarehouseContext, lpIds: string[]): Promise<Set<string>> {
  if (lpIds.length === 0) return new Set();
  const { rows } = await ctx.client.query<{ id: string }>(
    `select reference_id::text as id
       from public.v_active_holds
      where org_id = app.current_org_id()
        and reference_type = 'lp'
        and reference_id = any($1::uuid[])`,
    [lpIds],
  );
  return new Set(rows.map((row) => row.id));
}

async function lockClientOperation(ctx: WarehouseContext, operation: 'lp-split' | 'lp-destroy', clientOpId: string): Promise<void> {
  await ctx.client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${ctx.orgId}:${operation}:${clientOpId}`]);
}

async function insertLpStateHistory(
  ctx: WarehouseContext,
  input: {
    lpId: string;
    siteId: string | null;
    fromState: string | null;
    toState: string;
    reasonCode: string;
    reasonText: string;
    transactionId: string;
    woId?: string | null;
    grnId?: string | null;
    ext?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.lp_state_history (
       org_id, site_id, lp_id, from_state, to_state, reason_code, reason_text,
       transaction_id, wo_id, grn_id, ext_jsonb, created_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, $3, $4, $5, $6,
       $7::uuid, $8::uuid, $9::uuid, $10::jsonb, $11::uuid
     )
     on conflict (org_id, transaction_id) do nothing`,
    [
      input.siteId,
      input.lpId,
      input.fromState,
      input.toState,
      input.reasonCode,
      input.reasonText,
      input.transactionId,
      input.woId ?? null,
      input.grnId ?? null,
      JSON.stringify(input.ext ?? {}),
      ctx.userId,
    ],
  );
}

async function insertStockMove(
  ctx: WarehouseContext,
  input: {
    lpId: string;
    siteId: string | null;
    moveType: 'adjustment' | 'split' | 'merge';
    quantity: string;
    uom: string;
    locationId: string | null;
    reasonCode: string;
    reasonText: string;
    transactionId: string;
    referenceId: string;
    referenceType: string;
    ext?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.stock_moves (
       org_id, site_id, move_number, lp_id, move_type, from_location_id, to_location_id,
       quantity, uom, reason_code, reason_text, transaction_id, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2, $3::uuid, $4, $5::uuid, $6::uuid,
       $7::numeric, $8, $9, $10, $11::uuid, $12::jsonb, $13::uuid, $13::uuid
     )
     on conflict (org_id, transaction_id) do nothing`,
    [
      input.siteId,
      moveNumberFromTransactionId(input.transactionId),
      input.lpId,
      input.moveType,
      input.quantity.startsWith('-') ? input.locationId : null,
      input.quantity.startsWith('-') ? null : input.locationId,
      input.quantity,
      input.uom,
      input.reasonCode,
      input.reasonText,
      input.transactionId,
      JSON.stringify({
        reference_id: input.referenceId,
        reference_type: input.referenceType,
        ...input.ext,
      }),
      ctx.userId,
    ],
  );
}

async function findSplitReplay(ctx: WarehouseContext, childSeed: string, childMoveTransactionId: string, childHistoryTransactionId: string): Promise<string | null> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `with deterministic_child as (
       select (
         substr(md5($1), 1, 8) || '-' ||
         substr(md5($1), 9, 4) || '-4' ||
         substr(md5($1), 14, 3) || '-a' ||
         substr(md5($1), 18, 3) || '-' ||
         substr(md5($1), 21, 12)
       )::uuid as id
     ),
     replay_child as (
       select lp.id::text as id
         from public.license_plates lp
         join deterministic_child child on child.id = lp.id
        where lp.org_id = app.current_org_id()
       union all
       select sm.lp_id::text as id
         from public.stock_moves sm
        where sm.org_id = app.current_org_id()
          and sm.transaction_id = $2::uuid
       union all
       select history.lp_id::text as id
         from public.lp_state_history history
        where history.org_id = app.current_org_id()
          and history.transaction_id = $3::uuid
     )
     select replay_child.id
       from replay_child
      limit 1`,
    [childSeed, childMoveTransactionId, childHistoryTransactionId],
  );
  return rows[0]?.id ?? null;
}

export async function splitLp(lpIdInput: string, splitQtyInput: number, reasonInput: string, clientOpIdInput: string): Promise<LpMutationResult> {
  const lpId = asTrimmed(lpIdInput);
  const splitQty = asPositiveQuantity(splitQtyInput);
  const reason = asTrimmed(reasonInput);
  const clientOpId = asTrimmed(clientOpIdInput);
  if (!lpId || !splitQty || !reason || !clientOpId) return failure('invalid_input');

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LpMutationResult> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      await lockClientOperation(ctx, 'lp-split', clientOpId);
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_LP_SPLIT_PERMISSION))) return failure('forbidden');

      const splitTransactionId = uuidFromSeed(`warehouse.lp.split:${clientOpId}`);
      const childHistoryTransactionId = uuidFromSeed(`${splitTransactionId}:child-history`);
      const childMoveTransactionId = uuidFromSeed(`${splitTransactionId}:child-move`);
      const childSeed = `${orgId}:lp-split:${clientOpId}`;
      const replayChildId = await findSplitReplay(ctx, childSeed, childMoveTransactionId, childHistoryTransactionId);
      if (replayChildId) return { ok: true };

      const source = await lockLp(ctx, lpId);
      if (!source) return failure('not_found');
      if (!SPLIT_MERGE_STATES.has(source.status)) return failure('LP status does not allow split');
      if ((await activeHeldLpIds(ctx, [source.id])).size > 0) return failure('LP is under an active quality hold');

      // Strict `<`: a split must leave the source with positive quantity. Splitting the
      // entire available amount is just a relabel — reject it so we never mislabel the
      // emptied source as 'consumed'.
      const availability = await ctx.client.query<{ fits: boolean; remaining_qty: string }>(
        `select ($1::numeric < (quantity - reserved_qty)) as fits,
                (quantity - $1::numeric)::text as remaining_qty
           from public.license_plates
          where org_id = app.current_org_id()
            and id = $2::uuid`,
        [splitQty, lpId],
      );
      const available = availability.rows[0];
      if (available?.fits !== true) return failure('split quantity must be less than available quantity');

      const child = await ctx.client.query<{ id: string }>(
        `with deterministic_child as (
           select (
             substr(md5($12), 1, 8) || '-' ||
             substr(md5($12), 9, 4) || '-4' ||
             substr(md5($12), 14, 3) || '-a' ||
             substr(md5($12), 18, 3) || '-' ||
             substr(md5($12), 21, 12)
           )::uuid as id
         )
         insert into public.license_plates (
           id, org_id, site_id, warehouse_id, location_id, lp_number, product_id,
           quantity, reserved_qty, uom, status, origin, parent_lp_id, batch_number,
           expiry_date, qa_status, created_by, updated_by
         )
         select id,
                app.current_org_id(),
                $1::uuid,
                $2::uuid,
                $3::uuid,
                'LP-' || upper(left(replace(id::text, '-', ''), 12)),
                $4::uuid,
                $5::numeric,
                0::numeric,
                $6,
                'available',
                'split',
                $7::uuid,
                $8,
                $9::timestamptz,
                $10,
                $11::uuid,
                $11::uuid
           from deterministic_child
        on conflict (id) do nothing
        returning id::text`,
        [
          source.site_id,
          source.warehouse_id,
          source.location_id,
          source.product_id,
          splitQty,
          source.uom,
          source.id,
          source.batch_number,
          source.expiry_date,
          source.qa_status,
          userId,
          childSeed,
        ],
      );
      const childId = child.rows[0]?.id ?? (await findSplitReplay(ctx, childSeed, childMoveTransactionId, childHistoryTransactionId));
      if (!childId) return failure('child_lp_insert_failed');

      await ctx.client.query(
        `update public.license_plates
            set quantity = quantity - $2::numeric,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and $2::numeric < (quantity - reserved_qty)`,
        [lpId, splitQty, userId],
      );

      await ctx.client.query(
        `insert into public.lp_genealogy (org_id, child_lp_id, parent_lp_id, relation_type, qty, uom)
         values (app.current_org_id(), $1::uuid, $2::uuid, 'split', $3::numeric, $4)
         on conflict (org_id, child_lp_id, parent_lp_id, relation_type) do nothing`,
        [childId, source.id, splitQty, source.uom],
      );

      await insertLpStateHistory(ctx, {
        lpId: source.id,
        siteId: source.site_id,
        fromState: source.status,
        toState: source.status,
        reasonCode: 'lp_split',
        reasonText: reason,
        transactionId: uuidFromSeed(`${splitTransactionId}:source-history`),
        woId: source.wo_id,
        grnId: source.grn_id,
        ext: { source: 'warehouse_lp_split', split_qty: splitQty, child_lp_id: childId, remaining_qty: available.remaining_qty },
      });
      await insertLpStateHistory(ctx, {
        lpId: childId,
        siteId: source.site_id,
        fromState: null,
        toState: 'available',
        reasonCode: 'lp_split_genesis',
        reasonText: reason,
        transactionId: uuidFromSeed(`${splitTransactionId}:child-history`),
        ext: { source: 'warehouse_lp_split', parent_lp_id: source.id, quantity: splitQty },
      });
      await insertStockMove(ctx, {
        lpId: source.id,
        siteId: source.site_id,
        moveType: 'adjustment',
        quantity: `-${splitQty}`,
        uom: source.uom,
        locationId: source.location_id,
        reasonCode: 'lp_split',
        reasonText: reason,
        transactionId: uuidFromSeed(`${splitTransactionId}:source-move`),
        referenceId: childId,
        referenceType: 'license_plate',
        ext: { split_qty: splitQty, child_lp_id: childId },
      });
      await insertStockMove(ctx, {
        lpId: childId,
        siteId: source.site_id,
        moveType: 'split',
        quantity: splitQty,
        uom: source.uom,
        locationId: source.location_id,
        reasonCode: 'lp_split',
        reasonText: reason,
        transactionId: uuidFromSeed(`${splitTransactionId}:child-move`),
        referenceId: source.id,
        referenceType: 'license_plate',
        ext: { parent_lp_id: source.id },
      });

      return { ok: true };
    });
  } catch (error) {
    return mapFailure(error);
  }
}

export async function mergeLps(primaryLpIdInput: string, secondaryLpIdsInput: string[], reasonInput: string): Promise<LpMutationResult> {
  const primaryLpId = asTrimmed(primaryLpIdInput);
  const secondaryLpIds = [...new Set(secondaryLpIdsInput.map(asTrimmed).filter((id): id is string => Boolean(id)))];
  const reason = asTrimmed(reasonInput);
  if (!primaryLpId || secondaryLpIds.length === 0 || !reason || secondaryLpIds.includes(primaryLpId)) return failure('invalid_input');

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LpMutationResult> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_LP_MERGE_PERMISSION))) return failure('forbidden');

      const allIds = [primaryLpId, ...secondaryLpIds];
      const locked = await ctx.client.query<LockedLp>(
        `select lp.id::text,
                lp.lp_number,
                lp.site_id::text,
                lp.warehouse_id::text,
                lp.location_id::text,
                lp.product_id::text,
                lp.quantity::text,
                lp.reserved_qty::text,
                lp.uom,
                lp.status,
                lp.origin,
                lp.parent_lp_id::text,
                lp.batch_number,
                lp.expiry_date::text,
                lp.qa_status,
                lp.grn_id::text,
                lp.wo_id::text
           from public.license_plates lp
          where lp.org_id = app.current_org_id()
            and lp.id = any($1::uuid[])
          for update`,
        [allIds],
      );
      if (locked.rows.length !== allIds.length) return failure('not_found');

      const byId = new Map(locked.rows.map((lp) => [lp.id, lp]));
      const primary = byId.get(primaryLpId);
      if (!primary) return failure('not_found');
      const secondaries = secondaryLpIds.map((id) => byId.get(id)).filter((lp): lp is LockedLp => Boolean(lp));
      if (secondaries.length !== secondaryLpIds.length) return failure('not_found');

      const sameSkuLot = secondaries.every(
        (lp) =>
          lp.product_id === primary.product_id &&
          lp.uom === primary.uom &&
          lp.batch_number === primary.batch_number &&
          lp.expiry_date === primary.expiry_date &&
          lp.warehouse_id === primary.warehouse_id &&
          lp.site_id === primary.site_id &&
          lp.location_id === primary.location_id,
      );
      if (!sameSkuLot) return failure('LP product, UOM, batch, expiry, warehouse, site, and location must match before merge');
      if (locked.rows.some((lp) => !SPLIT_MERGE_STATES.has(lp.status))) {
        return failure('only available LPs can be merged');
      }
      if (locked.rows.some((lp) => !isZeroDecimal(lp.reserved_qty))) {
        return failure('reserved LPs cannot be merged');
      }
      if ((await activeHeldLpIds(ctx, allIds)).size > 0) {
        return failure('one or more LPs are under an active quality hold');
      }

      const mergeTransactionId = uuidFromSeed(`warehouse.lp.merge:${orgId}:${primaryLpId}:${secondaryLpIds.join(',')}:${reason}`);
      const resultQaStatus = mostRestrictiveQaStatus(locked.rows.map((lp) => lp.qa_status));

      await ctx.client.query(
        `update public.license_plates
            set quantity = quantity + $2::numeric,
                qa_status = $3,
                updated_by = $4::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [primary.id, sumDecimal(secondaries.map((lp) => lp.quantity)), resultQaStatus, userId],
      );

      for (const secondary of secondaries) {
        await ctx.client.query(
          `update public.license_plates
              set quantity = 0,
                  status = 'merged',
                  updated_by = $2::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid`,
          [secondary.id, userId],
        );
        await ctx.client.query(
          `insert into public.lp_genealogy (org_id, child_lp_id, parent_lp_id, relation_type, qty, uom)
           values (app.current_org_id(), $1::uuid, $2::uuid, 'merge', $3::numeric, $4)
           on conflict (org_id, child_lp_id, parent_lp_id, relation_type) do nothing`,
          [primary.id, secondary.id, secondary.quantity, secondary.uom],
        );
        await insertLpStateHistory(ctx, {
          lpId: secondary.id,
          siteId: secondary.site_id,
          fromState: secondary.status,
          toState: 'merged',
          reasonCode: 'lp_merge',
          reasonText: reason,
          transactionId: uuidFromSeed(`${mergeTransactionId}:secondary-history:${secondary.id}`),
          woId: secondary.wo_id,
          grnId: secondary.grn_id,
          ext: { source: 'warehouse_lp_merge', merged_into_lp_id: primary.id, quantity: secondary.quantity },
        });
        await insertStockMove(ctx, {
          lpId: secondary.id,
          siteId: secondary.site_id,
          moveType: 'adjustment',
          quantity: `-${secondary.quantity}`,
          uom: secondary.uom,
          locationId: secondary.location_id,
          reasonCode: 'lp_merge',
          reasonText: reason,
          transactionId: uuidFromSeed(`${mergeTransactionId}:secondary-move:${secondary.id}`),
          referenceId: primary.id,
          referenceType: 'license_plate',
          ext: { merged_into_lp_id: primary.id },
        });
      }

      const mergedQty = sumDecimal(secondaries.map((lp) => lp.quantity));
      await insertLpStateHistory(ctx, {
        lpId: primary.id,
        siteId: primary.site_id,
        fromState: primary.status,
        toState: primary.status,
        reasonCode: 'lp_merge_quantity_increase',
        reasonText: reason,
        transactionId: uuidFromSeed(`${mergeTransactionId}:primary-history`),
        woId: primary.wo_id,
        grnId: primary.grn_id,
        ext: {
          source: 'warehouse_lp_merge',
          quantity_from: primary.quantity,
          quantity_added: mergedQty,
          qa_status_from: primary.qa_status,
          qa_status_to: resultQaStatus,
          merged_lp_ids: secondaryLpIds,
        },
      });
      await insertStockMove(ctx, {
        lpId: primary.id,
        siteId: primary.site_id,
        moveType: 'merge',
        quantity: mergedQty,
        uom: primary.uom,
        locationId: primary.location_id,
        reasonCode: 'lp_merge',
        reasonText: reason,
        transactionId: uuidFromSeed(`${mergeTransactionId}:primary-move`),
        referenceId: primary.id,
        referenceType: 'license_plate',
        ext: { merged_lp_ids: secondaryLpIds },
      });

      return { ok: true };
    });
  } catch (error) {
    return mapFailure(error);
  }
}

export async function destroyLp(lpIdInput: string, reasonInput: string, clientOpIdInput: string): Promise<LpMutationResult> {
  const lpId = asTrimmed(lpIdInput);
  const reason = asTrimmed(reasonInput);
  const clientOpId = asTrimmed(clientOpIdInput);
  if (!lpId || !reason || !clientOpId) return failure('invalid_input');

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LpMutationResult> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      await lockClientOperation(ctx, 'lp-destroy', clientOpId);
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_LP_DESTROY_PERMISSION))) return failure('forbidden');

      const lp = await lockLp(ctx, lpId);
      if (!lp) return failure('not_found');
      if (lp.status === 'destroyed') return { ok: true };
      if (DESTROY_BLOCKED_STATES.has(lp.status)) {
        return failure('LP is already consumed/shipped/merged/destroyed and cannot be destroyed');
      }
      if (lp.status === 'reserved' || !isZeroDecimal(lp.reserved_qty)) {
        return failure('LP has reserved stock; clear reservation before destroying');
      }

      await ctx.client.query(
        `update public.license_plates
            set status = 'destroyed',
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status <> 'destroyed'`,
        [lp.id, userId],
      );

      const destroyTransactionId = uuidFromSeed(`warehouse.lp.destroy:${clientOpId}`);
      await insertLpStateHistory(ctx, {
        lpId: lp.id,
        siteId: lp.site_id,
        fromState: lp.status,
        toState: 'destroyed',
        reasonCode: 'lp_destroy',
        reasonText: reason,
        transactionId: uuidFromSeed(`${destroyTransactionId}:history`),
        woId: lp.wo_id,
        grnId: lp.grn_id,
        ext: { source: 'warehouse_lp_destroy', quantity: lp.quantity, uom: lp.uom },
      });
      if (!isZeroDecimal(lp.quantity)) {
        await insertStockMove(ctx, {
          lpId: lp.id,
          siteId: lp.site_id,
          moveType: 'adjustment',
          quantity: `-${lp.quantity}`,
          uom: lp.uom,
          locationId: lp.location_id,
          reasonCode: 'lp_destroy',
          reasonText: reason,
          transactionId: uuidFromSeed(`${destroyTransactionId}:move`),
          referenceId: lp.id,
          referenceType: 'license_plate',
          ext: { destroyed_lp_id: lp.id },
        });
        await debitWac(ctx.client, {
          orgId: ctx.orgId,
          siteId: lp.site_id,
          itemId: lp.product_id,
          qty: lp.quantity,
          uom: lp.uom,
          updatedBy: ctx.userId,
          sourceRef: {
            aggregateType: 'license_plate',
            aggregateId: lp.id,
            dedupKey: `warehouse-destroy:${destroyTransactionId}`,
          },
        });
      }

      return { ok: true };
    });
  } catch (error) {
    return mapFailure(error);
  }
}
