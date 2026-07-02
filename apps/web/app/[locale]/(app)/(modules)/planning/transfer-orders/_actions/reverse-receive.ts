'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  assertCorrectionAllowed,
  CORRECTION_REASON_CODES,
  CorrectionForbiddenError,
  CorrectionInvalidInputError,
  type CorrectionReasonCode,
} from '../../../../../../../lib/corrections/correct-ledger-entry';
import { microToDecimal, toMicro } from '../../../../../../../lib/shared/decimal';
import { makeStockMoveNumber } from '../../../../../../../lib/warehouse/lp-create';
import type { ProductionContext, QueryClient as ProductionQueryClient } from '../../../../../../../lib/production/shared';
import {
  type OrgActionContext,
  type QueryClient,
} from '../../_actions/procurement-shared';

const TRANSFER_RECEIVE_REVERSE_PERMISSION = 'warehouse.transfer.correct';
const TRANSFER_RECEIVE_REVERSE_INTENT = 'warehouse.transfer_receive.reverse';
const TRANSFER_RECEIVE_REVERSED_EVENT = 'warehouse.lp.transitioned';
const APP_VERSION = 'planning-transfer-reversal-v1';
const RETURNED_LP_STATUS = 'returned';
const SOURCE_REVERSE_BLOCKED_STATUSES = new Set(['consumed', 'destroyed']);

const uuidSchema = z.string().uuid();
const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,6})?$/)
  .refine((value) => toMicro(value) > 0n, 'quantity must be positive');

const ReverseToReceiveLineInput = z.object({
  toId: uuidSchema,
  lineId: uuidSchema,
  destLpId: uuidSchema,
  quantity: quantitySchema,
  reasonCode: z.enum(CORRECTION_REASON_CODES),
  note: z.string().trim().max(2000).optional().nullable(),
  signature: z.object({
    password: z.string().min(1),
    intent: z.string().trim().min(1).optional(),
    nonce: z.string().trim().min(1).optional(),
    signerUserId: uuidSchema.optional(),
  }),
});

export type ReverseToReceiveLineInput = z.input<typeof ReverseToReceiveLineInput>;

export type ReverseToReceiveLineResult =
  | {
      ok: true;
      data: {
        transferOrderId: string;
        lineId: string;
        sourceLpId: string;
        destinationLpId: string;
        reversedQty: string;
        status: string;
      };
    }
  | {
      ok: false;
      error:
        | 'forbidden'
        | 'not_found'
        | 'invalid_input'
        | 'invalid_state'
        | 'invalid_quantity'
        | 'lp_active'
        | 'esign_failed'
        | 'persistence_failed';
      message?: string;
    };

type ReceivedLinkRow = {
  to_id: string;
  to_number: string;
  to_status: string;
  line_id: string;
  line_uom: string;
  link_id: string;
  link_qty: string;
  source_lp_id: string;
  source_status: string;
  source_quantity: string;
  source_location_id: string | null;
  source_site_id: string | null;
  dest_lp_id: string;
  dest_status: string;
  dest_quantity: string;
  dest_reserved_qty: string;
  dest_location_id: string | null;
  dest_site_id: string | null;
};

type ReversalEventPayload = {
  correction_action: 'transfer_receive_reversed';
  transfer_order_id: string;
  transfer_order_line_id: string;
  transfer_order_line_lp_id: string;
  source_lp_id: string;
  dest_lp_id: string;
  reversed_qty: string;
  uom: string;
  reason_code: CorrectionReasonCode;
};

export type TransferReceiveReversalEvent = {
  eventType: typeof TRANSFER_RECEIVE_REVERSED_EVENT;
  aggregateType: 'license_plate';
  aggregateId: string;
  payload: ReversalEventPayload;
};

function normalizeNote(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

async function loadReceivedLinkForUpdate(
  client: QueryClient,
  input: z.infer<typeof ReverseToReceiveLineInput>,
): Promise<ReceivedLinkRow | null> {
  const { rows } = await client.query<ReceivedLinkRow>(
    `select t.id::text as to_id,
            t.to_number,
            t.status as to_status,
            l.id::text as line_id,
            l.uom as line_uom,
            tll.id::text as link_id,
            tll.qty::text as link_qty,
            src.id::text as source_lp_id,
            src.status as source_status,
            src.quantity::text as source_quantity,
            src.location_id::text as source_location_id,
            src.site_id::text as source_site_id,
            dst.id::text as dest_lp_id,
            dst.status as dest_status,
            dst.quantity::text as dest_quantity,
            dst.reserved_qty::text as dest_reserved_qty,
            dst.location_id::text as dest_location_id,
            dst.site_id::text as dest_site_id
       from public.transfer_orders t
       join public.transfer_order_lines l
         on l.org_id = app.current_org_id()
        and l.to_id = t.id
       join public.transfer_order_line_lps tll
         on tll.org_id = app.current_org_id()
        and tll.to_id = t.id
        and tll.to_line_id = l.id
       join public.license_plates src
         on src.org_id = app.current_org_id()
        and src.id = tll.source_lp_id
       join public.license_plates dst
         on dst.org_id = app.current_org_id()
        and dst.id = tll.dest_lp_id
      where t.org_id = app.current_org_id()
        and t.id = $1::uuid
        and l.id = $2::uuid
        and tll.dest_lp_id = $3::uuid
      limit 1
      for update of t, l, tll, src, dst`,
    [input.toId, input.lineId, input.destLpId],
  );
  return rows[0] ?? null;
}

async function getDestinationLpBlockers(ctx: OrgActionContext, destLpId: string): Promise<string[]> {
  const { rows } = await ctx.client.query<{ blockers: string[] }>(
    `select array_remove(array[
       case when exists (
         select 1
           from public.inventory_allocations ia
          where ia.org_id = app.current_org_id()
            and ia.license_plate_id = $1::uuid
       ) then 'allocations'::text end,
       case when exists (
         select 1
           from public.shipment_box_contents sbc
          where sbc.org_id = app.current_org_id()
            and sbc.license_plate_id = $1::uuid
       ) or exists (
         select 1
           from public.license_plates lp
          where lp.org_id = app.current_org_id()
            and lp.id = $1::uuid
            and (lp.status = 'shipped' or lp.source_so_id is not null)
       ) then 'outbound_shipments'::text end,
       case when exists (
         select 1
           from public.wo_material_consumption wmc
          where wmc.org_id = app.current_org_id()
            and wmc.lp_id = $1::uuid
            and wmc.correction_of_id is null
       ) then 'consumed_wo_inputs'::text end
     ], null) as blockers`,
    [destLpId],
  );
  return rows[0]?.blockers ?? [];
}

async function rerollTransferOrderStatus(ctx: OrgActionContext, toId: string): Promise<string> {
  const { rows } = await ctx.client.query<{ received_count: string }>(
    `select count(*) filter (where dest_lp_id is not null)::text as received_count
       from public.transfer_order_line_lps
      where org_id = app.current_org_id()
        and to_id = $1::uuid`,
    [toId],
  );
  const nextStatus = Number(rows[0]?.received_count ?? '0') > 0 ? 'partially_received' : 'in_transit';
  await ctx.client.query(
    `update public.transfer_orders
        set status = $2,
            updated_by = $3::uuid
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [toId, nextStatus, ctx.userId],
  );
  return nextStatus;
}

async function writeLpHistory(
  ctx: OrgActionContext,
  params: {
    siteId: string | null;
    lpId: string;
    fromState: string;
    toState: string;
    reasonText: string | null;
    transactionId: string;
    ext: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.lp_state_history
       (org_id, site_id, lp_id, from_state, to_state, reason_code, reason_text,
        transaction_id, ext_jsonb, created_by)
     values
       (app.current_org_id(), $1::uuid, $2::uuid, $3, $4, 'transfer_receive_reversed',
        $5, $6::uuid, $7::jsonb, $8::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [
      params.siteId,
      params.lpId,
      params.fromState,
      params.toState,
      params.reasonText,
      params.transactionId,
      JSON.stringify(params.ext),
      ctx.userId,
    ],
  );
}

async function writeStockMove(
  ctx: OrgActionContext,
  params: {
    siteId: string | null;
    lpId: string;
    fromLocationId: string | null;
    toLocationId: string | null;
    quantity: string;
    uom: string;
    reasonText: string;
    transactionId: string;
    ext: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.stock_moves
       (org_id, site_id, move_number, lp_id, move_type, from_location_id, to_location_id,
        quantity, uom, reason_code, reason_text, transaction_id, ext_jsonb, created_by, updated_by)
     values
       (app.current_org_id(), $1::uuid, $2, $3::uuid, 'adjustment', $4::uuid, $5::uuid,
        $6::numeric, $7, 'transfer_receive_reversed', $8, $9::uuid, $10::jsonb, $11::uuid, $11::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [
      params.siteId,
      makeStockMoveNumber(params.transactionId),
      params.lpId,
      params.fromLocationId,
      params.toLocationId,
      params.quantity,
      params.uom,
      params.reasonText,
      params.transactionId,
      JSON.stringify(params.ext),
      ctx.userId,
    ],
  );
}

async function writeReversalAudit(
  ctx: OrgActionContext,
  params: {
    link: ReceivedLinkRow;
    reasonCode: CorrectionReasonCode;
    note: string | null;
    reversedQty: string;
    nextStatus: string;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       (app.current_org_id(), $1::uuid, 'user', 'planning.transfer_order.receive_reversed',
        'transfer_order', $2, $3::jsonb, $4::jsonb, $5::uuid, 'operational')`,
    [
      ctx.userId,
      params.link.to_id,
      JSON.stringify({
        transfer_order_id: params.link.to_id,
        transfer_order_line_id: params.link.line_id,
        transfer_order_line_lp_id: params.link.link_id,
        source_lp_id: params.link.source_lp_id,
        dest_lp_id: params.link.dest_lp_id,
        dest_lp_status: params.link.dest_status,
        dest_lp_quantity: params.link.dest_quantity,
        to_status: params.link.to_status,
      }),
      JSON.stringify({
        correction_action: 'transfer_receive_reversed',
        reason_code: params.reasonCode,
        note: params.note,
        reversed_qty: params.reversedQty,
        dest_lp_status: RETURNED_LP_STATUS,
        dest_lp_quantity: '0',
        to_status: params.nextStatus,
      }),
      randomUUID(),
    ],
  );
}

async function emitReversalEvent(
  ctx: OrgActionContext,
  params: {
    link: ReceivedLinkRow;
    reasonCode: CorrectionReasonCode;
    reversedQty: string;
  },
): Promise<void> {
  const payload: ReversalEventPayload = {
    correction_action: 'transfer_receive_reversed',
    transfer_order_id: params.link.to_id,
    transfer_order_line_id: params.link.line_id,
    transfer_order_line_lp_id: params.link.link_id,
    source_lp_id: params.link.source_lp_id,
    dest_lp_id: params.link.dest_lp_id,
    reversed_qty: params.reversedQty,
    uom: params.link.line_uom,
    reason_code: params.reasonCode,
  };

  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'license_plate', $2, $3::jsonb, $4)`,
    [
      TRANSFER_RECEIVE_REVERSED_EVENT,
      params.link.dest_lp_id,
      JSON.stringify({ org_id: ctx.orgId, actor_user_id: ctx.userId, ...payload }),
      APP_VERSION,
    ],
  );
}

export async function consumeTransferReceiveReversalEvent(
  event: TransferReceiveReversalEvent,
): Promise<{ ok: true; handled: boolean }> {
  if (
    event.eventType !== TRANSFER_RECEIVE_REVERSED_EVENT ||
    event.aggregateType !== 'license_plate' ||
    event.payload.correction_action !== 'transfer_receive_reversed'
  ) {
    return { ok: true, handled: false };
  }

  return { ok: true, handled: true };
}

/**
 * R4-CL1 — Server-side probe for the TO-detail UI: does the caller hold the
 * `warehouse.transfer.correct` permission? Used to gate the "Reverse receipt"
 * affordance. RBAC stays server-authored — the client never trusts its own check.
 */
export async function canReverseTransferReceipt(): Promise<boolean> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      return hasPermission(ctx, TRANSFER_RECEIVE_REVERSE_PERMISSION);
    });
  } catch (error) {
    console.error('[planning/transfer-orders] canReverseTransferReceipt failed', error);
    return false;
  }
}

export async function reverseToReceiveLine(rawInput: unknown): Promise<ReverseToReceiveLineResult> {
  const parsed = ReverseToReceiveLineInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;
  const note = normalizeNote(input.note);
  const reversedMicro = toMicro(input.quantity);

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<ReverseToReceiveLineResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, TRANSFER_RECEIVE_REVERSE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const link = await loadReceivedLinkForUpdate(ctx.client, input);
      if (!link) return { ok: false, error: 'not_found' };
      if (!['received', 'partially_received', 'in_transit'].includes(link.to_status)) {
        return {
          ok: false,
          error: 'invalid_state',
          message: `transfer_order is ${link.to_status}; expected received/partially_received/in_transit`,
        };
      }

      if (toMicro(link.link_qty) !== reversedMicro || toMicro(link.dest_quantity) !== reversedMicro) {
        return {
          ok: false,
          error: 'invalid_quantity',
          message: 'Reverse quantity must equal the received destination LP quantity.',
        };
      }

      if (toMicro(link.dest_reserved_qty) !== 0n) {
        return { ok: false, error: 'lp_active', message: 'Destination LP has reserved quantity and cannot be reversed.' };
      }

      const blockers = await getDestinationLpBlockers(ctx, link.dest_lp_id);
      if (blockers.length > 0) {
        return {
          ok: false,
          error: 'lp_active',
          message: `Destination LP cannot be reversed because it has ${blockers.join(', ')}.`,
        };
      }

      if (SOURCE_REVERSE_BLOCKED_STATUSES.has(link.source_status)) {
        return {
          ok: false,
          error: 'invalid_state',
          message: `Source LP is ${link.source_status}; receive reversal would create phantom stock.`,
        };
      }

      try {
        await assertCorrectionAllowed(
          { userId, orgId, client: client as unknown as ProductionQueryClient } satisfies ProductionContext,
          {
            permission: TRANSFER_RECEIVE_REVERSE_PERMISSION,
            requireEsign: true,
            signature: {
              pin: input.signature.password,
              intent: input.signature.intent ?? TRANSFER_RECEIVE_REVERSE_INTENT,
              reason: input.reasonCode,
              nonce: input.signature.nonce,
              signerUserId: input.signature.signerUserId,
              subject: {
                transfer_order_id: link.to_id,
                transfer_order_line_id: link.line_id,
                transfer_order_line_lp_id: link.link_id,
                source_lp_id: link.source_lp_id,
                dest_lp_id: link.dest_lp_id,
                reversed_qty: input.quantity,
              },
            },
          },
        );
      } catch (error) {
        if (error instanceof CorrectionForbiddenError) return { ok: false, error: 'forbidden' };
        if (error instanceof CorrectionInvalidInputError) return { ok: false, error: 'invalid_input' };
        return { ok: false, error: 'esign_failed' };
      }

      const destHistoryTxn = randomUUID();
      const sourceHistoryTxn = randomUUID();
      const destMoveTxn = randomUUID();
      const sourceMoveTxn = randomUUID();
      const reversedQty = microToDecimal(reversedMicro);
      const reasonText = note ?? `TO receive reversal ${link.to_number}`;

      await ctx.client.query(
        `update public.license_plates
            set status = $2,
                quantity = 0,
                reserved_qty = 0,
                updated_by = $3::uuid,
                updated_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [link.dest_lp_id, RETURNED_LP_STATUS, userId],
      );

      await writeLpHistory(ctx, {
        siteId: link.dest_site_id,
        lpId: link.dest_lp_id,
        fromState: link.dest_status,
        toState: RETURNED_LP_STATUS,
        reasonText,
        transactionId: destHistoryTxn,
        ext: {
          transfer_order_id: link.to_id,
          transfer_order_line_id: link.line_id,
          transfer_order_line_lp_id: link.link_id,
          source_lp_id: link.source_lp_id,
          reversed_qty: reversedQty,
          correction_reason_code: input.reasonCode,
        },
      });

      await ctx.client.query(
        `update public.license_plates
            set quantity = quantity + $2::numeric,
                status = CASE WHEN status = 'shipped' THEN 'available' ELSE status END,
                updated_by = $3::uuid,
                updated_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [link.source_lp_id, reversedQty, userId],
      );

      if (link.source_status === 'shipped') {
        await writeLpHistory(ctx, {
          siteId: link.source_site_id,
          lpId: link.source_lp_id,
          fromState: 'shipped',
          toState: 'available',
          reasonText,
          transactionId: sourceHistoryTxn,
          ext: {
            transfer_order_id: link.to_id,
            transfer_order_line_id: link.line_id,
            transfer_order_line_lp_id: link.link_id,
            dest_lp_id: link.dest_lp_id,
            reversed_qty: reversedQty,
            correction_reason_code: input.reasonCode,
          },
        });
      }

      await writeStockMove(ctx, {
        siteId: link.dest_site_id,
        lpId: link.dest_lp_id,
        fromLocationId: link.dest_location_id,
        toLocationId: null,
        quantity: microToDecimal(-reversedMicro),
        uom: link.line_uom,
        reasonText,
        transactionId: destMoveTxn,
        ext: {
          correction_action: 'transfer_receive_reversed',
          transfer_order_id: link.to_id,
          transfer_order_line_lp_id: link.link_id,
          direction: 'dest_lp_void',
        },
      });

      await writeStockMove(ctx, {
        siteId: link.source_site_id,
        lpId: link.source_lp_id,
        fromLocationId: null,
        toLocationId: link.source_location_id,
        quantity: reversedQty,
        uom: link.line_uom,
        reasonText,
        transactionId: sourceMoveTxn,
        ext: {
          correction_action: 'transfer_receive_reversed',
          transfer_order_id: link.to_id,
          transfer_order_line_lp_id: link.link_id,
          direction: 'source_lp_credit',
        },
      });

      await ctx.client.query(
        `update public.transfer_order_line_lps
            set dest_lp_id = null,
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [link.link_id, userId],
      );

      const nextStatus = await rerollTransferOrderStatus(ctx, link.to_id);
      await writeReversalAudit(ctx, {
        link,
        reasonCode: input.reasonCode,
        note,
        reversedQty,
        nextStatus,
      });
      await emitReversalEvent(ctx, { link, reasonCode: input.reasonCode, reversedQty });

      return {
        ok: true,
        data: {
          transferOrderId: link.to_id,
          lineId: link.line_id,
          sourceLpId: link.source_lp_id,
          destinationLpId: link.dest_lp_id,
          reversedQty,
          status: nextStatus,
        },
      };
    });

    if (result.ok) {
      revalidatePath('/planning/transfer-orders');
      revalidatePath(`/planning/transfer-orders/${result.data.transferOrderId}`);
      revalidatePath('/warehouse/license-plates');
    }

    return result;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23514' || code === '23503' || code === '22P02') return { ok: false, error: 'invalid_input' };
    console.error('[planning/transfer-orders] reverseToReceiveLine failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
