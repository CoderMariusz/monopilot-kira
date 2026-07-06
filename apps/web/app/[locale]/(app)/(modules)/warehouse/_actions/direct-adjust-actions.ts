'use server';

import { signEvent, type ESignTxOptions } from '@monopilot/e-sign';
import { assertNoActiveHoldForLp } from '@monopilot/server/quality/holdsGuard.js';
import { z } from 'zod';

import { verifyPin } from '../../../../../../../../packages/auth/src/verify-pin.js';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { creditWacAtAvgCost, debitWac } from '../../../../../../lib/finance/upsert-wac';
import { microToDecimal, toMicro } from '../../../../../../lib/shared/decimal';
import { makeLpNumber, makeStockMoveNumber } from '../../../../../../lib/warehouse/lp-create';
import {
  hasWarehousePermission,
  uuidFromSeed,
  type QueryClient,
  type WarehouseContext,
} from './shared';

const WAREHOUSE_STOCK_ADJUST_PERMISSION = 'warehouse.stock.adjust';
const DIRECT_ADJUST_INTENT = 'warehouse.stock.adjust';
const DESTROYED_STATUS = 'destroyed';
// Mirror of the over-consumption / reverse-consume supervisor gate
// (apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts:573):
// the distinct second person approving a destructive stock decrease must hold
// the same elevated stock-mutation grant. The warehouse module has no separate
// "adjust.approve" permission, so the elevated grant IS warehouse.stock.adjust.
const WAREHOUSE_STOCK_ADJUST_APPROVE_PERMISSION = 'warehouse.stock.adjust';

// NOT exported: a 'use server' file may export only async functions; an exported
// const (zod enum = object) fails `next build` once a page collects this module.
// The inferred TYPE below is exported for consumers; the schema value stays private.
const DirectAdjustReasonCode = z.enum([
  'found_stock',
  'spillage_damage',
  'expiry_write_off',
  'data_entry_error',
  'system_sync',
  'other',
]);

const directAdjustInputSchema = z.object({
  warehouseId: z.string().uuid(),
  locationId: z.string().uuid(),
  itemId: z.string().uuid(),
  lpId: z.string().uuid().nullable().optional(),
  direction: z.enum(['increase', 'decrease']),
  quantity: z.string().trim().min(1),
  uom: z.string().trim().min(1),
  reasonCode: DirectAdjustReasonCode,
  reasonText: z.string().trim().optional(),
  batchNumber: z.string().trim().optional(),
  expiryDate: z.string().trim().optional(),
  signature: z.object({ password: z.string() }),
  // BLOCKER-3 fix: a decrease (destructive write) now requires a DISTINCT
  // supervisor as a second person. supervisorUserId identifies that person;
  // supervisorPin is verified AGAINST supervisorUserId (never the initiator).
  // NOTE (UI lane): the direct-adjust form must capture supervisorUserId for
  // decreases — currently a NEW required field the UI does not yet send.
  supervisorUserId: z.string().uuid().optional(),
  supervisorPin: z.string().optional(),
  clientOpId: z.string().uuid(),
});

export type DirectAdjustReasonCode = z.infer<typeof DirectAdjustReasonCode>;
export type DirectAdjustInput = z.infer<typeof directAdjustInputSchema>;
export type DirectAdjustResult =
  | { ok: true; data: { adjustmentId: string; lpId: string } }
  | { ok: false; error: { code: string; message: string } };

type LpForAdjustment = {
  id: string;
  site_id: string | null;
  status: string;
  quantity: string;
  reserved_qty: string;
  uom: string;
};

type AdjustmentLeg = {
  lp: LpForAdjustment;
  quantity: string;
};

type ReplayRow = {
  adjustment_id: string | null;
  lp_id: string;
};

function failure(code: string, message = code): Extract<DirectAdjustResult, { ok: false }> {
  return { ok: false, error: { code, message } };
}

class DirectAdjustAbort extends Error {
  constructor(readonly result: Extract<DirectAdjustResult, { ok: false }>) {
    super(result.error.code);
    this.name = 'DirectAdjustAbort';
  }
}

function parsePositiveQuantity(value: string): string | null {
  const micro = toMicro(value);
  if (micro <= 0n) return null;
  return microToDecimal(micro);
}

function optionalText(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function parseOptionalIsoDate(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error('invalid_expiry_date');
  return date.toISOString();
}

/**
 * Pin-enrollment check, mirrored from lib/scanner/auth.ts `userHasPin` so the
 * supervisor SoD gate fails closed with a distinct `supervisor_pin_not_enrolled`
 * code rather than a generic invalid-pin when the supervisor never set a PIN.
 */
async function supervisorHasPin(client: QueryClient, supervisorUserId: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok from public.user_pins where user_id = $1::uuid limit 1`,
    [supervisorUserId],
  );
  return rows.length > 0;
}

async function readReplay(client: QueryClient, transactionId: string): Promise<ReplayRow | null> {
  const { rows } = await client.query<ReplayRow>(
    `select (sm.ext_jsonb ->> 'stock_adjustment_id') as adjustment_id,
            sm.lp_id::text
       from public.stock_moves sm
      where sm.org_id = app.current_org_id()
        and sm.transaction_id = $1::uuid
      order by sm.created_at asc, sm.id asc
      limit 1`,
    [transactionId],
  );
  return rows[0] ?? null;
}

async function selectLpsForDirectDecrease(
  client: QueryClient,
  input: { warehouseId: string; locationId: string; itemId: string; lpId: string | null; quantity: string },
): Promise<AdjustmentLeg[]> {
  // MEDIUM scoping fix: constrain on the LP's REAL warehouse_id so a caller
  // cannot pass a warehouseId that diverges from where the stock actually
  // lives. Without this, the recorded stock_adjustment / stock_move warehouse
  // can be spoofed and a decrease can leak a move under the wrong warehouse.
  const { rows } = await client.query<LpForAdjustment>(
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
  const legs: AdjustmentLeg[] = [];

  for (const lp of rows) {
    if (remaining <= 0n) break;
    const available = toMicro(lp.quantity) - toMicro(lp.reserved_qty);
    if (available <= 0n) continue;
    const take = available < remaining ? available : remaining;
    legs.push({ lp, quantity: microToDecimal(take) });
    remaining -= take;
  }

  if (remaining > 0n) {
    throw new Error(input.lpId ? 'insufficient_unreserved' : 'insufficient_stock');
  }

  for (const leg of legs) {
    await assertNoActiveHoldForLp(leg.lp.id, client);
  }

  return legs;
}

async function resolveSiteId(
  client: QueryClient,
  input: { warehouseId: string; locationId: string; lpId: string | null },
): Promise<string | null> {
  const { rows } = await client.query<{ site_id: string | null }>(
    `select coalesce(
              (select lp.site_id
                 from public.license_plates lp
                where lp.org_id = app.current_org_id()
                  and lp.id = $3::uuid
                  -- MEDIUM scoping fix: only trust the LP's site when the LP
                  -- actually belongs to the passed warehouse, so a cross-
                  -- warehouse lpId cannot pin the adjustment to a foreign site.
                  and lp.warehouse_id = $1::uuid),
              (select w.site_id
                 from public.warehouses w
                where w.org_id = app.current_org_id()
                  and w.id = $1::uuid),
              (select w.site_id
                 from public.locations l
                 join public.warehouses w
                   on w.org_id = l.org_id
                  and w.id = l.warehouse_id
                where l.org_id = app.current_org_id()
                  and l.id = $2::uuid)
            )::text as site_id`,
    [input.warehouseId, input.locationId, input.lpId],
  );
  return rows[0]?.site_id ?? null;
}

async function mintAdjustmentLicensePlate(
  ctx: WarehouseContext,
  input: {
    siteId: string | null;
    warehouseId: string;
    locationId: string;
    itemId: string;
    quantity: string;
    uom: string;
    batchNumber: string | null;
    expiryDate: string | null;
  },
): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.license_plates (
       org_id, site_id, warehouse_id, lp_number, product_id, quantity, reserved_qty,
       uom, status, qa_status, batch_number, expiry_date, location_id, origin,
       created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, $3, $4::uuid, $5::numeric, 0,
       $6, 'available', 'pending', $7, $8::timestamptz, $9::uuid, 'adjustment',
       $10::uuid, $10::uuid
     )
     returning id::text`,
    [
      input.siteId,
      input.warehouseId,
      makeLpNumber(),
      input.itemId,
      input.quantity,
      input.uom,
      input.batchNumber,
      input.expiryDate,
      input.locationId,
      ctx.userId,
    ],
  );
  const lpId = rows[0]?.id;
  if (!lpId) throw new Error('lp_insert_failed');
  return lpId;
}

async function reduceLicensePlate(
  ctx: WarehouseContext,
  input: { lp: LpForAdjustment; quantity: string; transactionId: string; reasonCode: DirectAdjustReasonCode; reasonText: string | null },
): Promise<{ quantityAfter: string; statusAfter: string }> {
  const { rows } = await ctx.client.query<{ quantity: string; status: string }>(
    `update public.license_plates
        set quantity = quantity - $2::numeric,
            status = case when quantity - $2::numeric = 0 then $4 else status end,
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid
        and quantity - $2::numeric >= reserved_qty
      returning quantity::text, status`,
    [input.lp.id, input.quantity, ctx.userId, DESTROYED_STATUS],
  );
  const updated = rows[0];
  if (!updated) throw new Error('insufficient_unreserved');
  return { quantityAfter: updated.quantity, statusAfter: updated.status };
}

async function insertStockAdjustment(
  ctx: WarehouseContext,
  input: {
    siteId: string | null;
    warehouseId: string;
    locationId: string;
    itemId: string;
    lpId: string;
    direction: 'increase' | 'decrease';
    adjustmentQty: string;
    reasonCode: DirectAdjustReasonCode;
    esignRef: string;
  },
): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.stock_adjustments (
       org_id, count_line_id, item_id, location_id, warehouse_id, site_id, lp_id,
       adjustment_qty, direction, reason, esign_ref, applied_by
     )
     values (
       app.current_org_id(), null, $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
       $6::numeric, $7, $8, $9, $10::uuid
     )
     returning id::text`,
    [
      input.itemId,
      input.locationId,
      input.warehouseId,
      input.siteId,
      input.lpId,
      input.adjustmentQty,
      input.direction,
      input.reasonCode,
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
    siteId: string | null;
    warehouseId: string;
    locationId: string;
    itemId: string;
    lpId: string;
    adjustmentId: string;
    direction: 'increase' | 'decrease';
    quantity: string;
    uom: string;
    reasonCode: DirectAdjustReasonCode;
    reasonText: string | null;
    transactionId: string;
    esignRef: string;
    supervisorUserId: string | null;
  },
): Promise<void> {
  const signedQuantity = input.direction === 'increase' ? input.quantity : microToDecimal(-toMicro(input.quantity));
  await ctx.client.query(
    `insert into public.stock_moves (
       org_id, site_id, move_number, lp_id, move_type, from_location_id, to_location_id,
       quantity, uom, reason_code, reason_text, transaction_id, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2, $3::uuid, 'adjustment', $4::uuid, $5::uuid,
       $6::numeric, $7, $8, $9, $10::uuid, $11::jsonb, $12::uuid, $12::uuid
     )
     on conflict (org_id, transaction_id) do nothing`,
    [
      input.siteId,
      makeStockMoveNumber(input.transactionId),
      input.lpId,
      input.direction === 'decrease' ? input.locationId : null,
      input.direction === 'increase' ? input.locationId : null,
      signedQuantity,
      input.uom,
      input.reasonCode,
      input.reasonText,
      input.transactionId,
      JSON.stringify({
        stock_adjustment_id: input.adjustmentId,
        esign_ref: input.esignRef,
        direction: input.direction,
        warehouse_id: input.warehouseId,
        location_id: input.locationId,
        item_id: input.itemId,
        // BLOCKER-3: persist the distinct supervisor who approved a decrease so
        // the destructive write is auditable to a second person. null on
        // increases (no supervisor required).
        ...(input.supervisorUserId ? { supervisor_approved_by: input.supervisorUserId } : {}),
      }),
      ctx.userId,
    ],
  );
}

async function insertLpStateHistory(
  ctx: WarehouseContext,
  input: {
    siteId: string | null;
    lpId: string;
    fromState: string | null;
    toState: string;
    reasonCode: DirectAdjustReasonCode;
    reasonText: string | null;
    transactionId: string;
    ext: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.lp_state_history (
       org_id, site_id, lp_id, from_state, to_state, reason_code, reason_text,
       transaction_id, ext_jsonb, created_by
     )
     values (
       app.current_org_id(), $1::uuid, $2::uuid, $3, $4, $5, $6,
       $7::uuid, $8::jsonb, $9::uuid
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
      JSON.stringify(input.ext),
      ctx.userId,
    ],
  );
}

async function applyAdjustmentWac(
  ctx: WarehouseContext,
  input: {
    siteId: string | null;
    itemId: string;
    direction: 'increase' | 'decrease';
    quantity: string;
    uom: string;
  },
): Promise<void> {
  if (input.direction === 'increase') {
    await creditWacAtAvgCost(ctx.client, {
      orgId: ctx.orgId,
      siteId: input.siteId,
      itemId: input.itemId,
      qty: input.quantity,
      uom: input.uom,
      updatedBy: ctx.userId,
    });
    return;
  }

  await debitWac(ctx.client, {
    orgId: ctx.orgId,
    siteId: input.siteId,
    itemId: input.itemId,
    qty: input.quantity,
    uom: input.uom,
    updatedBy: ctx.userId,
  });
}

export async function applyDirectAdjustment(input: DirectAdjustInput): Promise<DirectAdjustResult> {
  const parsed = directAdjustInputSchema.safeParse(input);
  if (!parsed.success) return failure('invalid_input', 'Invalid direct adjustment input');

  const quantity = parsePositiveQuantity(parsed.data.quantity);
  if (!quantity) return failure('invalid_quantity', 'Quantity must be greater than zero');

  let expiryDate: string | null;
  try {
    expiryDate = parseOptionalIsoDate(parsed.data.expiryDate);
  } catch {
    return failure('invalid_expiry_date', 'Expiry date must be an ISO date');
  }

  const lpId = parsed.data.lpId ?? null;
  const reasonText = optionalText(parsed.data.reasonText);
  const batchNumber = optionalText(parsed.data.batchNumber);

  if (parsed.data.direction === 'increase' && lpId) {
    return failure('use_count_session');
  }

  if (parsed.data.direction === 'decrease' && (!parsed.data.supervisorUserId?.trim() || !parsed.data.supervisorPin?.trim())) {
    // BLOCKER-3: a destructive decrease requires a distinct supervisor's id AND
    // pin. The SoD (supervisor !== initiator), enrollment, pin verification and
    // elevated-permission checks run in-txn against the real initiator userId.
    return failure('supervisor_pin_required');
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<DirectAdjustResult> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_STOCK_ADJUST_PERMISSION))) {
        return failure('forbidden');
      }

      const transactionId = uuidFromSeed(parsed.data.clientOpId);

      // BLOCKER-4 idempotency race fix (mirror of reverse-consume/route.ts:507):
      // take a TRANSACTION-scoped advisory lock keyed on this op id BEFORE the
      // replay read. Two concurrent calls with the same clientOpId serialize
      // here; the loser blocks until the winner COMMITs, then its readReplay
      // sees the committed stock_move and short-circuits — so neither increase
      // (no double-mint) nor decrease (no double-reduce) double-applies.
      await ctx.client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [transactionId]);

      const replay = await readReplay(ctx.client, transactionId);
      if (replay?.adjustment_id) {
        return { ok: true, data: { adjustmentId: replay.adjustment_id, lpId: replay.lp_id } };
      }

      // For a decrease: resolve the FEFO legs BEFORE writing the e-sign receipt
      // so that an insufficient-stock determination never commits a receipt for a
      // doomed adjustment (partial-commit fix). selectLpsForDirectDecrease runs
      // FOR UPDATE inside the same transaction, so the lock is still held for the
      // subsequent writes.
      let decreaseLegs: AdjustmentLeg[] | null = null;
      if (parsed.data.direction === 'decrease') {
        decreaseLegs = await selectLpsForDirectDecrease(ctx.client, {
          warehouseId: parsed.data.warehouseId,
          locationId: parsed.data.locationId,
          itemId: parsed.data.itemId,
          lpId,
          quantity,
        });
        // Defensive guard — selectLpsForDirectDecrease throws when stock is
        // insufficient, so an empty result here is unexpected; abort without a
        // receipt so no orphaned e-sign row is committed.
        if (decreaseLegs.length === 0) throw new DirectAdjustAbort(failure('insufficient_stock'));
      }

      const signatureReceipt = await signEvent(
        {
          signerUserId: userId,
          pin: parsed.data.signature.password,
          intent: DIRECT_ADJUST_INTENT,
          reason: parsed.data.reasonCode,
          subject: {
            permission: WAREHOUSE_STOCK_ADJUST_PERMISSION,
            warehouse_id: parsed.data.warehouseId,
            location_id: parsed.data.locationId,
            item_id: parsed.data.itemId,
            lp_id: lpId,
            direction: parsed.data.direction,
            quantity,
            uom: parsed.data.uom,
            reason_code: parsed.data.reasonCode,
            client_op_id: parsed.data.clientOpId,
          },
        },
        { client: ctx.client as unknown as ESignTxOptions['client'] },
      );

      // BLOCKER-3 fix: a destructive decrease requires a DISTINCT supervisor as
      // a second person, mirroring the over-consume / reverse-consume gate
      // (reverse-consume/route.ts:536-578). The previous code verified the
      // INITIATOR's own pin (verifyPin(userId, ...)) — no second-person control.
      let supervisorUserId: string | null = null;
      if (parsed.data.direction === 'decrease') {
        const supervisorId = parsed.data.supervisorUserId ?? '';
        const supervisorPin = parsed.data.supervisorPin ?? '';

        // Separation of duties: supervisor MUST NOT be the initiator.
        if (supervisorId === userId) throw new DirectAdjustAbort(failure('supervisor_self_approval'));

        if (!(await supervisorHasPin(ctx.client, supervisorId))) {
          throw new DirectAdjustAbort(failure('supervisor_pin_not_enrolled'));
        }

        // Verify the pin against the SUPERVISOR's id (not the initiator's).
        const supervisorPinResult = await verifyPin(supervisorId, supervisorPin, { client: ctx.client });
        // Intentional commit: lockout counter must persist across txn rollback.
        if (supervisorPinResult === 'locked') return failure('supervisor_pin_locked');
        // Intentional commit: lockout counter must persist across txn rollback.
        if (supervisorPinResult !== true) return failure('supervisor_pin_invalid');

        // The supervisor must independently hold the elevated stock-adjust
        // grant in THIS org (RLS-scoped user_roles). This also proves org
        // membership — a non-member has no roles here and is rejected.
        const supervisorCtx: WarehouseContext = { userId: supervisorId, orgId, client: ctx.client };
        if (!(await hasWarehousePermission(supervisorCtx, WAREHOUSE_STOCK_ADJUST_APPROVE_PERMISSION))) {
          throw new DirectAdjustAbort(failure('supervisor_forbidden'));
        }
        supervisorUserId = supervisorId;
      }

      if (parsed.data.direction === 'increase') {
        const siteId = await resolveSiteId(ctx.client, {
          warehouseId: parsed.data.warehouseId,
          locationId: parsed.data.locationId,
          lpId,
        });
        const newLpId = await mintAdjustmentLicensePlate(ctx, {
          siteId,
          warehouseId: parsed.data.warehouseId,
          locationId: parsed.data.locationId,
          itemId: parsed.data.itemId,
          quantity,
          uom: parsed.data.uom,
          batchNumber,
          expiryDate,
        });
        const adjustmentId = await insertStockAdjustment(ctx, {
          siteId,
          warehouseId: parsed.data.warehouseId,
          locationId: parsed.data.locationId,
          itemId: parsed.data.itemId,
          lpId: newLpId,
          direction: parsed.data.direction,
          adjustmentQty: quantity,
          reasonCode: parsed.data.reasonCode,
          esignRef: signatureReceipt.signatureId,
        });
        await insertStockMove(ctx, {
          siteId,
          warehouseId: parsed.data.warehouseId,
          locationId: parsed.data.locationId,
          itemId: parsed.data.itemId,
          lpId: newLpId,
          adjustmentId,
          direction: parsed.data.direction,
          quantity,
          uom: parsed.data.uom,
          reasonCode: parsed.data.reasonCode,
          reasonText,
          transactionId,
          esignRef: signatureReceipt.signatureId,
          supervisorUserId: null,
        });
        await insertLpStateHistory(ctx, {
          siteId,
          lpId: newLpId,
          fromState: null,
          toState: 'available',
          reasonCode: parsed.data.reasonCode,
          reasonText,
          transactionId: uuidFromSeed(`${parsed.data.clientOpId}:lp_state:${newLpId}`),
          ext: { stock_adjustment_id: adjustmentId, quantity_after: quantity, esign_ref: signatureReceipt.signatureId },
        });
        await applyAdjustmentWac(ctx, {
          siteId,
          itemId: parsed.data.itemId,
          direction: parsed.data.direction,
          quantity,
          uom: parsed.data.uom,
        });
        return { ok: true, data: { adjustmentId, lpId: newLpId } };
      }

      // decreaseLegs was resolved before signEvent to prevent a receipt commit
      // for a doomed adjustment; the non-null assertion is safe because the
      // direction === 'increase' branch above returns early.
      const legs = decreaseLegs!;

      let firstAdjustmentId: string | null = null;
      let firstLpId: string | null = null;
      for (const leg of legs) {
        const updated = await reduceLicensePlate(ctx, {
          lp: leg.lp,
          quantity: leg.quantity,
          transactionId,
          reasonCode: parsed.data.reasonCode,
          reasonText,
        });
        const adjustmentId = await insertStockAdjustment(ctx, {
          siteId: leg.lp.site_id,
          warehouseId: parsed.data.warehouseId,
          locationId: parsed.data.locationId,
          itemId: parsed.data.itemId,
          lpId: leg.lp.id,
          direction: parsed.data.direction,
          adjustmentQty: leg.quantity,
          reasonCode: parsed.data.reasonCode,
          esignRef: signatureReceipt.signatureId,
        });
        firstAdjustmentId ??= adjustmentId;
        firstLpId ??= leg.lp.id;
        await insertStockMove(ctx, {
          siteId: leg.lp.site_id,
          warehouseId: parsed.data.warehouseId,
          locationId: parsed.data.locationId,
          itemId: parsed.data.itemId,
          lpId: leg.lp.id,
          adjustmentId,
          direction: parsed.data.direction,
          quantity: leg.quantity,
          uom: leg.lp.uom,
          reasonCode: parsed.data.reasonCode,
          reasonText,
          transactionId: firstAdjustmentId === adjustmentId ? transactionId : uuidFromSeed(`${parsed.data.clientOpId}:move:${leg.lp.id}`),
          esignRef: signatureReceipt.signatureId,
          supervisorUserId,
        });
        await insertLpStateHistory(ctx, {
          siteId: leg.lp.site_id,
          lpId: leg.lp.id,
          fromState: leg.lp.status,
          toState: updated.statusAfter,
          reasonCode: parsed.data.reasonCode,
          reasonText,
          transactionId: uuidFromSeed(`${parsed.data.clientOpId}:lp_state:${leg.lp.id}`),
          ext: {
            stock_adjustment_id: adjustmentId,
            adjustment_qty: leg.quantity,
            quantity_before: leg.lp.quantity,
            quantity_after: updated.quantityAfter,
            esign_ref: signatureReceipt.signatureId,
            ...(supervisorUserId ? { supervisor_approved_by: supervisorUserId } : {}),
          },
        });
      }

      await applyAdjustmentWac(ctx, {
        siteId: legs[0]?.lp.site_id ?? null,
        itemId: parsed.data.itemId,
        direction: parsed.data.direction,
        quantity,
        uom: parsed.data.uom,
      });
      // Non-null assertions are safe: legs.length was guarded > 0 before signEvent,
      // so the loop ran at least once and set both firstAdjustmentId and firstLpId.
      return { ok: true, data: { adjustmentId: firstAdjustmentId!, lpId: firstLpId! } };
    });
  } catch (error) {
    if (error instanceof DirectAdjustAbort) return error.result;
    const code = error instanceof Error ? error.message : 'error';
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'QA_HOLD_ACTIVE') {
      return failure('quality_hold_active');
    }
    if (code === 'insufficient_unreserved' || code === 'insufficient_stock') return failure(code);
    return failure('error', code);
  }
}
