'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';
import { CORRECTION_REASON_CODES } from '../../../../../../lib/corrections/correct-ledger-entry';
import { resolveWacDeltaQtyKg, upsertWac } from '../../../../../../lib/finance/upsert-wac';
import { toMicro } from '../../../../../../lib/shared/decimal';
import {
  hasWarehousePermission,
  uuidFromSeed,
  type QueryClient,
  type WarehouseContext,
} from './shared';

const WAREHOUSE_RECEIPT_CORRECT_PERMISSION = 'warehouse.receipt.correct';
const CANCELLABLE_LP_STATUSES = new Set(['received', 'available']);
const CANCELLABLE_QA_STATUSES = new Set(['pending', 'released']);
// F5 (R3 review) — 'returned' (cancelled-receipt LPs) is terminal too: metadata
// edits on a returned pallet would rewrite evidence of a cancelled receipt.
const EDITABLE_METADATA_BLOCKED_STATUSES = new Set(['consumed', 'shipped', 'merged', 'destroyed', 'returned']);

const uuidSchema = z.string().uuid();
const reasonCodeSchema = z.enum(CORRECTION_REASON_CODES);
const optionalNoteSchema = z.string().trim().max(2000).optional().nullable();
const optionalTextSchema = z.string().trim().max(255).optional().nullable();
const optionalDateSchema = z.string().datetime({ offset: true }).optional().nullable();

const CancelGrnLineInput = z.object({
  grnItemId: uuidSchema,
  reasonCode: reasonCodeSchema,
  note: optionalNoteSchema,
});

const UpdateLpMetadataInput = z.object({
  lpId: uuidSchema,
  expiryDate: optionalDateSchema,
  batchNumber: optionalTextSchema,
  reasonCode: reasonCodeSchema,
  note: optionalNoteSchema,
}).refine((value) => value.expiryDate !== undefined || value.batchNumber !== undefined, {
  message: 'at least one metadata field is required',
});

type ReceiptCorrectionError =
  | 'forbidden'
  | 'not_found'
  | 'lp_not_cancellable'
  | 'already_cancelled'
  | 'invalid_input'
  | 'persistence_failed';

type LpMetadataError =
  | 'forbidden'
  | 'not_found'
  | 'lp_not_editable'
  | 'invalid_input'
  | 'persistence_failed';

type GrnLineForCancel = {
  id: string;
  grn_id: string;
  po_id: string | null;
  item_id: string;
  lp_id: string | null;
  received_qty: string;
  uom: string;
  unit_price: string | null;
  cancelled_at: string | null;
  qa_status_initial: string;
  ext_jsonb: unknown;
};

type LicensePlateForCancel = {
  id: string;
  lp_status: string | null;
  lp_qa_status: string | null;
  lp_quantity: string | null;
  lp_reserved_qty: string | null;
  lp_batch_number: string | null;
  lp_expiry_date: string | null;
  lp_best_before_date: string | null;
};

type LicensePlateForMetadata = {
  id: string;
  status: string;
  batch_number: string | null;
  expiry_date: string | null;
  best_before_date: string | null;
};

function normalizeNote(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// F7 (R3 review) — NUMERIC-exact comparison via the shared micro-bigint helper
// (license_plates is NUMERIC(…,6); Number() equality would alias values beyond
// float precision and admit false matches/mismatches).
function sameDecimal(a: string | null | undefined, b: string | null | undefined): boolean {
  return toMicro(a ?? '0') === toMicro(b ?? '0');
}

function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return trimmed.slice(1);
  return `-${trimmed}`;
}

function readWacContributionSnapshot(extJsonb: unknown): { wac_qty_kg: string; wac_value: string } | null {
  if (extJsonb == null || typeof extJsonb !== 'object' || Array.isArray(extJsonb)) return null;
  const snapshot = extJsonb as { wac_qty_kg?: unknown; wac_value?: unknown };
  if (typeof snapshot.wac_qty_kg !== 'string' || typeof snapshot.wac_value !== 'string') return null;
  return { wac_qty_kg: snapshot.wac_qty_kg, wac_value: snapshot.wac_value };
}

async function multiplyNumeric(client: QueryClient, left: string, right: string | null): Promise<string> {
  const { rows } = await client.query<{ value: string }>(
    `select ($1::numeric * coalesce($2::numeric, 0))::text as value`,
    [left, right ?? '0'],
  );
  return rows[0]?.value ?? '0';
}

async function loadGrnLineForUpdate(ctx: WarehouseContext, grnItemId: string): Promise<GrnLineForCancel | null> {
  const { rows } = await ctx.client.query<GrnLineForCancel>(
    `select gi.id::text,
            gi.grn_id::text,
            coalesce(g.po_id, pol.po_id)::text as po_id,
            gi.product_id::text as item_id,
            gi.lp_id::text,
            gi.received_qty::text,
            gi.uom,
            pol.unit_price::text as unit_price,
            gi.cancelled_at::text,
            gi.qa_status_initial,
            gi.ext_jsonb
       from public.grn_items gi
       left join public.grns g
         on g.org_id = gi.org_id
        and g.id = gi.grn_id
       left join public.purchase_order_lines pol
         on pol.org_id = gi.org_id
        and pol.id = gi.po_line_id
      where gi.org_id = app.current_org_id()
        and gi.id = $1::uuid
      limit 1
      for update of gi`,
    [grnItemId],
  );
  return rows[0] ?? null;
}

async function rollupPurchaseOrderStatus(ctx: WarehouseContext, poId: string): Promise<void> {
  const { rows } = await ctx.client.query<{ is_received: boolean }>(
    `select bool_and(coalesce(rec.received_qty, 0) >= pol.qty) as is_received
       from public.purchase_order_lines pol
       left join (
         select po_line_id, sum(received_qty) as received_qty
           from public.grn_items
          where org_id = app.current_org_id()
            and po_line_id is not null
            and cancelled_at is null
          group by po_line_id
       ) rec on rec.po_line_id = pol.id
      where pol.org_id = app.current_org_id()
        and pol.po_id = $1::uuid`,
    [poId],
  );
  const status = rows[0]?.is_received ? 'received' : 'partially_received';
  await ctx.client.query(
    `update public.purchase_orders
        set status = $2,
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid
        and status in ('confirmed', 'partially_received', 'received')`,
    [poId, status, ctx.userId],
  );
}

async function loadLpForCancel(ctx: WarehouseContext, lpId: string): Promise<LicensePlateForCancel | null> {
  const { rows } = await ctx.client.query<LicensePlateForCancel>(
    `select lp.id::text,
            lp.status as lp_status,
            lp.qa_status as lp_qa_status,
            lp.quantity::text as lp_quantity,
            lp.reserved_qty::text as lp_reserved_qty,
            lp.batch_number as lp_batch_number,
            lp.expiry_date::text as lp_expiry_date,
            lp.best_before_date::text as lp_best_before_date
       from public.license_plates lp
      where lp.org_id = app.current_org_id()
        and lp.id = $1::uuid
      limit 1
      for update`,
    [lpId],
  );
  return rows[0] ?? null;
}

async function lpHasConsumptionOrChildren(ctx: WarehouseContext, lpId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ blocked: boolean }>(
    `select (
       exists (
         select 1
           from public.license_plates child
          where child.org_id = app.current_org_id()
            and child.parent_lp_id = $1::uuid
       )
       or (
         select coalesce(sum(wmc.qty_consumed), 0)
           from public.wo_material_consumption wmc
          where wmc.org_id = app.current_org_id()
            and wmc.lp_id = $1::uuid
       ) > 0
     ) as blocked`,
    [lpId],
  );
  return rows[0]?.blocked === true;
}

async function writeLpHistory(
  ctx: WarehouseContext,
  params: {
    lpId: string;
    fromState: string;
    toState: string;
    reasonCode: string;
    note: string | null;
    grnId?: string | null;
    ext: Record<string, unknown>;
    seed: string;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.lp_state_history
       (org_id, lp_id, from_state, to_state, reason_code, reason_text, grn_id, transaction_id, ext_jsonb, created_by)
     values
       (app.current_org_id(), $1::uuid, $2, $3, $4, $5, $6::uuid, $7::uuid, $8::jsonb, $9::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [
      params.lpId,
      params.fromState,
      params.toState,
      params.reasonCode,
      params.note,
      params.grnId ?? null,
      uuidFromSeed(params.seed),
      JSON.stringify(params.ext),
      ctx.userId,
    ],
  );
}

async function writeReceiptCorrectionAudit(
  ctx: WarehouseContext,
  params: {
    action: string;
    resourceType: string;
    resourceId: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
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
       $2,
       $3,
       $4,
       $5::jsonb,
       $6::jsonb,
       $7::uuid,
       'operational'
     )`,
    [
      ctx.userId,
      params.action,
      params.resourceType,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
      randomUUID(),
    ],
  );
}

async function loadLpForMetadataUpdate(ctx: WarehouseContext, lpId: string): Promise<LicensePlateForMetadata | null> {
  const { rows } = await ctx.client.query<LicensePlateForMetadata>(
    `select id::text,
            status,
            batch_number,
            expiry_date::text as expiry_date,
            best_before_date::text as best_before_date
       from public.license_plates
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1
      for update`,
    [lpId],
  );
  return rows[0] ?? null;
}

export async function cancelGrnLine(input: unknown): Promise<
  | { ok: true }
  | { ok: false; error: ReceiptCorrectionError; message?: string }
> {
  const parsed = CancelGrnLineInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const note = normalizeNote(parsed.data.note);

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_RECEIPT_CORRECT_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const line = await loadGrnLineForUpdate(ctx, parsed.data.grnItemId);
      if (!line) return { ok: false, error: 'not_found' };
      if (line.cancelled_at) return { ok: false, error: 'already_cancelled' };
      if (!line.lp_id) return { ok: false, error: 'lp_not_cancellable' };
      const lp = await loadLpForCancel(ctx, line.lp_id);
      if (!lp?.lp_status || !lp.lp_qa_status) return { ok: false, error: 'lp_not_cancellable' };
      if (!CANCELLABLE_LP_STATUSES.has(lp.lp_status) || !CANCELLABLE_QA_STATUSES.has(lp.lp_qa_status)) {
        return { ok: false, error: 'lp_not_cancellable' };
      }
      if (!sameDecimal(lp.lp_reserved_qty, '0') || !sameDecimal(lp.lp_quantity, line.received_qty)) {
        return { ok: false, error: 'lp_not_cancellable' };
      }
      if (await lpHasConsumptionOrChildren(ctx, line.lp_id)) {
        return { ok: false, error: 'lp_not_cancellable' };
      }

      await ctx.client.query(
        `update public.license_plates
            set status = 'returned',
                quantity = 0,
                reserved_qty = 0,
                updated_by = $2::uuid,
                updated_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [line.lp_id, userId],
      );

      await ctx.client.query(
        `update public.grn_items
            set cancelled_at = now(),
                cancelled_by = $2::uuid,
                cancellation_reason_code = $3,
                cancellation_note = $4,
                updated_by = $2::uuid,
                updated_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid
            and cancelled_at is null`,
        [line.id, userId, parsed.data.reasonCode, note],
      );

      const wacSnapshot = readWacContributionSnapshot(line.ext_jsonb);
      let deltaQtyKg: string;
      let deltaValue: string;
      if (wacSnapshot) {
        deltaQtyKg = negateDecimalString(wacSnapshot.wac_qty_kg);
        deltaValue = negateDecimalString(wacSnapshot.wac_value);
      } else {
        console.warn('[wac] reversal_fallback', { grnItemId: line.id });
        const { qtyKg: receivedQtyKg } = await resolveWacDeltaQtyKg(ctx.client, {
          itemId: line.item_id,
          qty: line.received_qty,
          uom: line.uom,
        });
        const receivedValue = await multiplyNumeric(ctx.client, line.received_qty, line.unit_price);
        deltaQtyKg = negateDecimalString(receivedQtyKg);
        deltaValue = negateDecimalString(receivedValue);
      }
      await upsertWac(ctx.client, {
        orgId,
        siteId: null,
        itemId: line.item_id,
        deltaQtyKg,
        deltaValue,
        updatedBy: userId,
      });

      if (line.po_id) await rollupPurchaseOrderStatus(ctx, line.po_id);

      await writeLpHistory(ctx, {
        lpId: line.lp_id,
        fromState: lp.lp_status,
        toState: 'returned',
        reasonCode: 'receipt_cancelled',
        note,
        grnId: line.grn_id,
        seed: `warehouse.receipt.cancel:${orgId}:${line.id}`,
        ext: {
          grn_item_id: line.id,
          correction_reason_code: parsed.data.reasonCode,
          received_qty: line.received_qty,
        },
      });

      await writeReceiptCorrectionAudit(ctx, {
        action: 'warehouse.receipt.corrected',
        resourceType: 'grn_item',
        resourceId: line.id,
        beforeState: {
          grn_item_id: line.id,
          grn_id: line.grn_id,
          lp_id: line.lp_id,
          received_qty: line.received_qty,
          lp_status: lp.lp_status,
          lp_quantity: lp.lp_quantity,
        },
        afterState: {
          cancelled: true,
          reason_code: parsed.data.reasonCode,
          note,
          lp_status: 'returned',
          lp_quantity: '0',
        },
      });

      revalidateLocalized('/warehouse/grns');
      revalidateLocalized('/planning/purchase-orders');
      return { ok: true };
    });
  } catch (error) {
    console.error('[warehouse] cancelGrnLine failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateLpMetadata(input: unknown): Promise<
  | { ok: true }
  | { ok: false; error: LpMetadataError; message?: string }
> {
  const parsed = UpdateLpMetadataInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const note = normalizeNote(parsed.data.note);
  const expiryDate = parsed.data.expiryDate;
  const batchNumber = normalizeNullableText(parsed.data.batchNumber);

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_RECEIPT_CORRECT_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const lp = await loadLpForMetadataUpdate(ctx, parsed.data.lpId);
      if (!lp) return { ok: false, error: 'not_found' };
      if (EDITABLE_METADATA_BLOCKED_STATUSES.has(lp.status)) {
        return { ok: false, error: 'lp_not_editable' };
      }

      const updateParams: unknown[] = [lp.id];
      const updateAssignments: string[] = [];
      if (expiryDate !== undefined) {
        updateParams.push(expiryDate);
        updateAssignments.push(`expiry_date = $${updateParams.length}::timestamptz`);
      }
      if (batchNumber !== undefined) {
        updateParams.push(batchNumber);
        updateAssignments.push(
          batchNumber === null
            ? `batch_number = $${updateParams.length}`
            : `batch_number = coalesce($${updateParams.length}, batch_number)`,
        );
      }
      updateParams.push(userId);
      updateAssignments.push(`updated_by = $${updateParams.length}::uuid`, 'updated_at = now()');

      await ctx.client.query(
        `update public.license_plates
            set ${updateAssignments.join(',\n                ')}
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        updateParams,
      );

      const nextExpiryDate = expiryDate === undefined ? lp.expiry_date : expiryDate;
      const nextBatchNumber = batchNumber === undefined ? lp.batch_number : batchNumber;
      const expiryDateSeedValue = expiryDate === undefined ? 'unchanged' : (expiryDate ?? 'cleared');
      const batchNumberSeedValue = batchNumber === undefined ? 'unchanged' : (batchNumber ?? 'cleared');

      await writeLpHistory(ctx, {
        lpId: lp.id,
        fromState: lp.status,
        toState: lp.status,
        reasonCode: 'metadata_corrected',
        note,
        seed: `warehouse.lp.metadata:${orgId}:${lp.id}:${parsed.data.reasonCode}:${expiryDateSeedValue}:${batchNumberSeedValue}`,
        ext: {
          correction_reason_code: parsed.data.reasonCode,
          expiry_date_from: lp.expiry_date,
          expiry_date_to: nextExpiryDate,
          best_before_date_from: lp.best_before_date,
          best_before_date_to: lp.best_before_date,
          batch_number_from: lp.batch_number,
          batch_number_to: nextBatchNumber,
        },
      });

      await writeReceiptCorrectionAudit(ctx, {
        action: 'warehouse.lp.metadata_corrected',
        resourceType: 'license_plate',
        resourceId: lp.id,
        beforeState: {
          lp_id: lp.id,
          status: lp.status,
          expiry_date: lp.expiry_date,
          best_before_date: lp.best_before_date,
          batch_number: lp.batch_number,
        },
        afterState: {
          reason_code: parsed.data.reasonCode,
          note,
          expiry_date: nextExpiryDate,
          best_before_date: lp.best_before_date,
          batch_number: nextBatchNumber,
        },
      });

      revalidateLocalized('/warehouse/license-plates');
      revalidateLocalized(`/warehouse/license-plates/${lp.id}`);
      return { ok: true };
    });
  } catch (error) {
    console.error('[warehouse] updateLpMetadata failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
