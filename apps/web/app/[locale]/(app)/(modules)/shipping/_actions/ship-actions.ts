'use server';

import { createHash, randomUUID } from 'node:crypto';

import { signEvent } from '@monopilot/e-sign';
import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { debitWac } from '../../../../../../lib/finance/upsert-wac';
import { LIVE_ALLOCATION_SQL, SHIP_CLOSED_ALLOCATION_REASON } from './so-transitions';
import type { SalesOrderStatus } from './so-transitions';
import { readLockedSalesOrderStatus, writeSalesOrderStatusInContext, writeShipmentStatusInContext } from './so-status-write';
import type {
  GenerateBolInput,
  GenerateBolResult,
  RecordPodInput,
  RecordPodResult,
  SealShipmentResult,
  ShipShipmentResult,
} from './ship-actions-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

const SHIP_PACK_CLOSE = 'ship.pack.close';
const SHIP_SHIP_CONFIRM = 'ship.ship.confirm';
const SHIP_BOL_SIGN = 'ship.bol.sign';
const LP_SHIPPED_EVENT_TYPE = 'warehouse.lp.shipped';
const RECORD_POD_INTENT = 'record_pod';

const recordPodInputSchema = z.object({
  shipmentId: z.string().uuid(),
  signedPdfUrl: z.string().trim().url(),
  reason: z.string().trim().min(1).max(1000),
  signature: z.object({
    password: z.string().min(1),
    nonce: z.string().trim().min(1).optional().nullable(),
  }),
});

class ActionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function requirePermission(ctx: ShippingContext, permission: string): Promise<{ ok: false; error: string } | null> {
  if (!(await hasPermission(ctx, permission))) {
    return { ok: false, error: 'forbidden' };
  }
  return null;
}

function errorCode(err: unknown): string {
  return err instanceof ActionError ? err.code : 'persistence_failed';
}

function parseRecordPodInput(input: RecordPodInput): z.infer<typeof recordPodInputSchema> | null {
  const parsed = recordPodInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

async function signPodDelivery(
  ctx: ShippingContext,
  parsed: z.infer<typeof recordPodInputSchema>,
  subject: Record<string, unknown>,
): Promise<string> {
  try {
    const receipt = await signEvent(
      {
        signerUserId: ctx.userId,
        pin: parsed.signature.password,
        intent: RECORD_POD_INTENT,
        reason: parsed.reason,
        nonce: parsed.signature.nonce ?? undefined,
        subject,
      },
      { client: ctx.client as never },
    );
    return receipt.signatureId;
  } catch {
    throw new ActionError('esign_failed');
  }
}

async function writePodAuditEvent(
  ctx: ShippingContext,
  params: {
    shipmentId: string;
    signatureId: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
  },
): Promise<number> {
  const { rows } = await ctx.client.query<{ id: number }>(
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
       'shipping.pod.recorded',
       'shipment',
       $2,
       $3::jsonb,
       $4::jsonb,
       $5::uuid,
       'operational'
     )
     returning id`,
    [
      ctx.userId,
      params.shipmentId,
      JSON.stringify(params.beforeState),
      JSON.stringify({ ...params.afterState, signature_id: params.signatureId }),
      randomUUID(),
    ],
  );
  const auditId = rows[0]?.id;
  if (typeof auditId !== 'number') throw new ActionError('persistence_failed');
  return auditId;
}

async function writeBolCarrierAuditEvent(
  ctx: ShippingContext,
  params: {
    shipmentId: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
  },
): Promise<void> {
  const { rows } = await ctx.client.query<{ id: number }>(
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
       'shipping.bol.carrier_updated',
       'shipment',
       $2,
       $3::jsonb,
       $4::jsonb,
       $5::uuid,
       'operational'
     )
     returning id`,
    [
      ctx.userId,
      params.shipmentId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
      randomUUID(),
    ],
  );
  if (typeof rows[0]?.id !== 'number') throw new ActionError('persistence_failed');
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0);
}

type ShipmentLpRow = {
  lp_id: string;
  lp_number: string | null;
  product_id: string;
  uom: string;
  shipped_qty: string;
  prior_status: string;
  prior_reserved_qty: string;
};

async function fetchShipmentLps(ctx: ShippingContext, shipmentId: string): Promise<ShipmentLpRow[]> {
  const { rows } = await ctx.client.query<ShipmentLpRow>(
    `select lp.id::text as lp_id,
            coalesce(lp.lp_code, lp.lp_number) as lp_number,
            lp.product_id::text as product_id,
            lp.uom,
            sum(sbc.quantity)::text as shipped_qty,
            lp.status as prior_status,
            lp.reserved_qty::text as prior_reserved_qty
       from public.shipment_box_contents sbc
       join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
        and sb.org_id = app.current_org_id()
        and sb.deleted_at is null
       join public.license_plates lp on lp.id = sbc.license_plate_id
        and lp.org_id = app.current_org_id()
      where sbc.org_id = app.current_org_id()
        and sbc.deleted_at is null
        and sbc.quantity is not null
        and sbc.quantity > 0
        and sb.shipment_id = $1::uuid
      group by lp.id, lp.lp_code, lp.lp_number, lp.product_id, lp.uom, lp.status, lp.reserved_qty
      order by lp.id::text`,
    [shipmentId],
  );
  return rows;
}

export async function sealShipment(shipmentId: string): Promise<SealShipmentResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<SealShipmentResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      const forbidden = await requirePermission(ctx, SHIP_PACK_CLOSE);
      if (forbidden) return forbidden;

      const { rows: shipmentRows } = await ctx.client.query<{
        id: string;
        status: string;
        box_count: number | string | bigint | null;
      }>(
        `select sh.id::text,
                sh.status,
                count(distinct sb.id)::int as box_count
           from public.shipments sh
           left join public.shipment_boxes sb on sb.shipment_id = sh.id
            and sb.org_id = app.current_org_id()
            and sb.deleted_at is null
          where sh.org_id = app.current_org_id()
            and sh.id = $1::uuid
            and sh.deleted_at is null
          group by sh.id, sh.status
          limit 1`,
        [shipmentId],
      );
      const shipment = shipmentRows[0];
      if (!shipment || shipment.status !== 'packing') {
        return { ok: false, error: 'invalid_state' };
      }
      if (toNumber(shipment.box_count) < 1) {
        return { ok: false, error: 'no_boxes' };
      }

      const sealResult = await writeShipmentStatusInContext(ctx, shipmentId, 'packed', {
        currentStatus: 'packing',
      });
      if (sealResult !== 'ok') throw new ActionError('persistence_failed');

      await ctx.client.query(
        `update public.shipments
            set packed_at = now(),
                packed_by = $2::uuid,
                updated_at = now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'packed'
            and deleted_at is null`,
        [shipmentId, userId],
      );

      return { ok: true };
    });
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function shipShipment(shipmentId: string): Promise<ShipShipmentResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ShipShipmentResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      const forbidden = await requirePermission(ctx, SHIP_SHIP_CONFIRM);
      if (forbidden) return forbidden;

      const { rows: shipmentRows } = await ctx.client.query<{
        id: string;
        status: string;
        sales_order_id: string | null;
        box_count: number | string | bigint | null;
      }>(
        `select sh.id::text,
                sh.status,
                sh.sales_order_id::text,
                count(distinct sb.id)::int as box_count
           from public.shipments sh
           left join public.shipment_boxes sb on sb.shipment_id = sh.id
            and sb.org_id = app.current_org_id()
            and sb.deleted_at is null
          where sh.org_id = app.current_org_id()
            and sh.id = $1::uuid
            and sh.deleted_at is null
          group by sh.id, sh.status, sh.sales_order_id
          limit 1`,
        [shipmentId],
      );
      const shipment = shipmentRows[0];
      if (!shipment || shipment.status !== 'packed' || !shipment.sales_order_id || toNumber(shipment.box_count) < 1) {
        return { ok: false, error: 'invalid_state' };
      }

      const soStatus = await readLockedSalesOrderStatus(ctx, shipment.sales_order_id);
      if (soStatus === 'not_found' || soStatus === 'cancelled') {
        return { ok: false, error: 'invalid_state' };
      }

      const lpRows = await fetchShipmentLps(ctx, shipmentId);
      const lpIds = lpRows.map((row) => row.lp_id);
      if (lpIds.length === 0) return { ok: false, error: 'invalid_state' };

      const shipTransition = await writeShipmentStatusInContext(ctx, shipmentId, 'shipped', {
        currentStatus: 'packed',
      });
      if (shipTransition !== 'ok') throw new ActionError('persistence_failed');

      await ctx.client.query(
        `update public.shipments
            set shipped_at = now(),
                shipped_by = $2::uuid,
                updated_at = now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'shipped'
            and deleted_at is null`,
        [shipmentId, userId],
      );

      // Food-safety re-assert (G-QA-01 / G-SHIP-06 / owner per-rule = BLOCK): a
      // quality hold, a QA-status reversion, or an expiry can land AFTER
      // allocation but BEFORE ship. Re-check every LP in the shipment and REFUSE
      // to ship if any is on an active hold (v_active_holds, T-064), not
      // QA-released, or past its expiry date — held/expired goods must not leave
      // the building. Same transaction → throwing here rolls back the
      // packing→packed flip too, so the shipment can be re-shipped after the
      // hold/expiry is resolved.
      const { rows: blockedLps } = await ctx.client.query<{ lp_number: string; reason: string }>(
        `select lp.lp_number,
                case when h.hold_id is not null then 'hold'
                     when lp.qa_status is distinct from 'released' then 'qa'
                     else 'expired' end as reason
           from public.shipment_box_contents sbc
           join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
            and sb.org_id = app.current_org_id() and sb.deleted_at is null
           join public.license_plates lp on lp.id = sbc.license_plate_id
            and lp.org_id = app.current_org_id()
           left join lateral (
             select hold_id from public.v_active_holds h
              where h.org_id = app.current_org_id()
                and h.reference_type = 'lp' and h.reference_id = lp.id
              limit 1
           ) h on true
          where sbc.org_id = app.current_org_id() and sbc.deleted_at is null
            and sb.shipment_id = $1::uuid
            and sbc.quantity is not null and sbc.quantity > 0
            and ( h.hold_id is not null
                  or lp.qa_status is distinct from 'released'
                  or (lp.expiry_date is not null and lp.expiry_date < current_date) )
          limit 5`,
        [shipmentId],
      );
      if (blockedLps.length > 0) throw new ActionError('lp_blocked_for_ship');

      const { rows: updatedLpRows } = await ctx.client.query<{
        id: string;
        shipped_qty: string;
        prior_status: string;
        prior_reserved_qty: string;
      }>(
        `with shipment_lps as (
           select sbc.license_plate_id as lp_id,
                  sum(sbc.quantity)::numeric as shipped_qty,
                  lp.status as prior_status,
                  lp.reserved_qty as prior_reserved_qty
             from public.shipment_box_contents sbc
             join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
              and sb.org_id = app.current_org_id()
              and sb.deleted_at is null
             join public.license_plates lp on lp.id = sbc.license_plate_id
              and lp.org_id = app.current_org_id()
            where sbc.org_id = app.current_org_id()
              and sbc.deleted_at is null
              and sbc.quantity is not null
              and sbc.quantity > 0
              and sb.shipment_id = $1::uuid
            group by sbc.license_plate_id, lp.status, lp.reserved_qty
         )
         update public.license_plates lp
            set quantity = lp.quantity - shipment_lps.shipped_qty,
                reserved_qty = greatest(0, lp.reserved_qty - shipment_lps.shipped_qty),
                -- Only flip the whole LP to 'shipped' when the shipment consumes
                -- its full quantity. On a partial ship the remainder must stay in
                -- its prior (pickable) status, otherwise it is frozen: a 'shipped'
                -- LP with leftover qty can be neither split nor destroyed → lost stock.
                status = case
                           when lp.quantity = shipment_lps.shipped_qty then 'shipped'
                           else lp.status
                         end,
                updated_at = now(),
                updated_by = $2::uuid
           from shipment_lps
          where lp.org_id = app.current_org_id()
            and lp.id = shipment_lps.lp_id
            and lp.quantity >= shipment_lps.shipped_qty
          returning lp.id::text,
                    shipment_lps.shipped_qty::text,
                    shipment_lps.prior_status,
                    shipment_lps.prior_reserved_qty::text`,
        [shipmentId, userId],
      );
      if (updatedLpRows.length !== lpIds.length) throw new ActionError('persistence_failed');

      const wacDebits: Array<{
        lp_id: string;
        item_id: string;
        qty_kg?: string;
        wac_value?: string;
        wac_excluded?: string;
      }> = [];
      for (const lp of lpRows) {
        const wacDebit = await debitWac(ctx.client, {
          orgId,
          siteId: null,
          itemId: lp.product_id,
          qty: lp.shipped_qty,
          uom: lp.uom,
          updatedBy: userId,
          sourceRef: {
            aggregateType: 'shipment',
            aggregateId: shipmentId,
            dedupKey: `shipping-ship:${shipmentId}:${lp.lp_id}`,
          },
        });
        if (wacDebit.applied) {
          wacDebits.push({
            lp_id: lp.lp_id,
            item_id: lp.product_id,
            qty_kg: wacDebit.qtyKg,
            wac_value: wacDebit.valueDebited,
          });
        } else if (wacDebit.excluded === 'unresolved_uom') {
          wacDebits.push({
            lp_id: lp.lp_id,
            item_id: lp.product_id,
            wac_excluded: 'unresolved_uom',
          });
        }
      }

      await ctx.client.query(
        `update public.inventory_allocations ia
            set status = 'released',
                released_at = now(),
                ext_data = coalesce(ia.ext_data, '{}'::jsonb) || jsonb_build_object('closed_reason', $3::text),
                updated_by = $2::uuid
           from public.shipment_box_contents sbc
           join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
            and sb.org_id = app.current_org_id()
            and sb.shipment_id = $1::uuid
            and sb.deleted_at is null
           join public.shipments sh on sh.id = sb.shipment_id
            and sh.org_id = app.current_org_id()
            and sh.deleted_at is null
           join public.sales_order_lines sol on sol.id = sbc.sales_order_line_id
            and sol.org_id = app.current_org_id()
            and sol.deleted_at is null
            and sol.sales_order_id = sh.sales_order_id
          where ia.license_plate_id = sbc.license_plate_id
            and ia.sales_order_line_id = sbc.sales_order_line_id
            and sbc.org_id = app.current_org_id()
            and sbc.deleted_at is null
            and ia.org_id = app.current_org_id()
            and ${LIVE_ALLOCATION_SQL}`,
        [shipmentId, userId, SHIP_CLOSED_ALLOCATION_REASON],
      );

      const { rows: shippedLineRows } = await ctx.client.query<{
        sales_order_line_id: string;
        shipped_qty: string;
      }>(
        `select sbc.sales_order_line_id::text,
                sum(sbc.quantity)::text as shipped_qty
           from public.shipment_box_contents sbc
           join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
            and sb.org_id = app.current_org_id()
            and sb.shipment_id = $1::uuid
            and sb.deleted_at is null
          where sbc.org_id = app.current_org_id()
            and sbc.deleted_at is null
            and sbc.quantity is not null
            and sbc.quantity > 0
          group by sbc.sales_order_line_id`,
        [shipmentId],
      );
      for (const line of shippedLineRows) {
        await ctx.client.query(
          `update public.sales_order_lines
              set quantity_allocated = greatest(0, quantity_allocated - $2::numeric),
                  updated_by = $3::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid`,
          [line.sales_order_line_id, line.shipped_qty, userId],
        );
      }

      const { rowCount: snapshotRowCount } = await ctx.client.query(
        `update public.shipments
            set ext_data = coalesce(ext_data, '{}'::jsonb) || $2::jsonb,
                updated_at = now(),
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'shipped'
            and deleted_at is null`,
        [
          shipmentId,
          JSON.stringify({
            shipped_license_plates: updatedLpRows.map((row) => ({
              lp_id: row.id,
              shipped_qty: row.shipped_qty,
              prior_status: row.prior_status,
              prior_reserved_qty: row.prior_reserved_qty,
            })),
            ...(wacDebits.length > 0 ? { wac_debits: wacDebits } : {}),
          }),
          userId,
        ],
      );
      if (snapshotRowCount !== 1) throw new ActionError('persistence_failed');

      for (const lpId of lpIds) {
        await ctx.client.query(
          `insert into public.outbox_events
             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
           values
             (app.current_org_id(), '${LP_SHIPPED_EVENT_TYPE}', 'license_plate', $1::uuid, $2::jsonb, coalesce(current_setting('app.app_version', true), 'dev'))`,
          [
            lpId,
            JSON.stringify({
              lp_id: lpId,
              shipment_id: shipmentId,
              so_id: shipment.sales_order_id,
              org_id: orgId,
            }),
          ],
        );
      }

      const { rows: remainingRows } = await ctx.client.query<{ remaining_count: number | string | bigint | null }>(
        `select count(*)::int as remaining_count
           from public.shipments
          where org_id = app.current_org_id()
            and sales_order_id = $1::uuid
            and deleted_at is null
            and status not in ('shipped', 'cancelled')`,
        [shipment.sales_order_id],
      );

      if (toNumber(remainingRows[0]?.remaining_count) === 0) {
        const soWrite = await writeSalesOrderStatusInContext(ctx, shipment.sales_order_id, 'shipped', {
          currentStatus: soStatus,
        });
        if (soWrite !== 'ok') throw new ActionError('invalid_state');
      }

      return { ok: true };
    });
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function generateBol(input: GenerateBolInput): Promise<GenerateBolResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<GenerateBolResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      const forbidden = await requirePermission(ctx, SHIP_SHIP_CONFIRM);
      if (forbidden) return forbidden;

      const { rows: shipmentRows } = await ctx.client.query<{
        id: string;
        status: string;
        carrier: string | null;
        service_level: string | null;
        tracking_number: string | null;
        box_count: number | string | bigint | null;
      }>(
        `select sh.id::text,
                sh.status,
                sh.carrier,
                sh.service_level,
                sh.tracking_number,
                count(distinct sb.id)::int as box_count
           from public.shipments sh
           left join public.shipment_boxes sb on sb.shipment_id = sh.id
            and sb.org_id = app.current_org_id()
            and sb.deleted_at is null
          where sh.org_id = app.current_org_id()
            and sh.id = $1::uuid
            and sh.deleted_at is null
          group by sh.id, sh.status, sh.carrier, sh.service_level, sh.tracking_number
          limit 1
          for update of sh`,
        [input.shipmentId],
      );
      const shipment = shipmentRows[0];
      if (!shipment || !['packed', 'shipped'].includes(shipment.status)) {
        return { ok: false, error: 'invalid_state' };
      }
      if (toNumber(shipment.box_count) < 1) {
        return { ok: false, error: 'no_boxes' };
      }

      const lockedStatus = shipment.status;
      const nextCarrier = input.carrier ?? null;
      const nextServiceLevel = input.serviceLevel ?? null;
      const nextTrackingNumber = input.trackingNumber ?? null;

      if (lockedStatus === 'shipped') {
        const bolSignForbidden = await requirePermission(ctx, SHIP_BOL_SIGN);
        if (bolSignForbidden) return bolSignForbidden;

        const carrierFieldsChanged =
          nextCarrier !== shipment.carrier ||
          nextServiceLevel !== shipment.service_level ||
          nextTrackingNumber !== shipment.tracking_number;

        if (carrierFieldsChanged) {
          await writeBolCarrierAuditEvent(ctx, {
            shipmentId: input.shipmentId,
            beforeState: {
              carrier: shipment.carrier,
              service_level: shipment.service_level,
              tracking_number: shipment.tracking_number,
            },
            afterState: {
              carrier: nextCarrier,
              service_level: nextServiceLevel,
              tracking_number: nextTrackingNumber,
            },
          });
        }
      }

      const lpRows = await fetchShipmentLps(ctx, input.shipmentId);
      const bolPayload = {
        shipmentId: input.shipmentId,
        orgId,
        carrier: nextCarrier,
        serviceLevel: nextServiceLevel,
        trackingNumber: nextTrackingNumber,
        generatedAt: new Date().toISOString(),
        licensePlates: lpRows.map((lp) => ({
          lpId: lp.lp_id,
          lpNumber: lp.lp_number,
        })),
      };
      const serializedPayload = JSON.stringify(bolPayload);
      const bolHash = createHash('sha256').update(serializedPayload).digest('hex');

      const { rows } = await ctx.client.query<{ id: string }>(
        `update public.shipments
            set carrier = $2::text,
                service_level = $3::text,
                tracking_number = $4::text,
                bol_payload = $5::jsonb,
                ext_data = coalesce(ext_data, '{}'::jsonb) || $6::jsonb,
                updated_at = now(),
                updated_by = $7::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = $8::text
            and deleted_at is null
          returning id::text`,
        [
          input.shipmentId,
          nextCarrier,
          nextServiceLevel,
          nextTrackingNumber,
          serializedPayload,
          JSON.stringify({ bol_sha256: bolHash }),
          userId,
          lockedStatus,
        ],
      );
      if (!rows[0]) throw new ActionError('not_found');

      return { ok: true, bolRef: bolHash };
    });
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function recordPod(input: RecordPodInput): Promise<RecordPodResult> {
  const parsed = parseRecordPodInput(input);
  if (!parsed) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<RecordPodResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      const forbidden = await requirePermission(ctx, SHIP_BOL_SIGN);
      if (forbidden) return forbidden;

      const { rows: shipmentRows } = await ctx.client.query<{
        id: string;
        status: string;
        sales_order_id: string | null;
        bol_signed_pdf_url: string | null;
      }>(
        `select id::text,
                status,
                sales_order_id::text,
                bol_signed_pdf_url
           from public.shipments
          where org_id = app.current_org_id()
            and id = $1::uuid
            and deleted_at is null
          limit 1`,
        [parsed.shipmentId],
      );
      const currentShipment = shipmentRows[0];
      if (!currentShipment || currentShipment.status !== 'shipped') {
        return { ok: false, error: 'invalid_state' };
      }

      const signatureId = await signPodDelivery(ctx, parsed, {
        shipment_id: parsed.shipmentId,
        signed_pdf_url: parsed.signedPdfUrl,
        reason: parsed.reason,
      });

      const podTransition = await writeShipmentStatusInContext(ctx, parsed.shipmentId, 'delivered', {
        currentStatus: 'shipped',
      });
      if (podTransition !== 'ok') throw new ActionError('persistence_failed');

      const { rows } = await ctx.client.query<{ id: string; sales_order_id: string | null }>(
        `update public.shipments
            set delivered_at = now(),
                bol_signed_pdf_url = $2::text,
                updated_at = now(),
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'delivered'
            and deleted_at is null
          returning id::text, sales_order_id::text`,
        [parsed.shipmentId, parsed.signedPdfUrl, userId],
      );
      const shipment = rows[0];
      if (!shipment) throw new ActionError('persistence_failed');

      let targetSoStatus: SalesOrderStatus | null = null;
      if (shipment.sales_order_id) {
        const soStatus = await readLockedSalesOrderStatus(ctx, shipment.sales_order_id);
        if (soStatus === 'not_found' || soStatus === 'cancelled') {
          throw new ActionError('invalid_state');
        }

        const { rows: remainingRows } = await ctx.client.query<{ remaining_count: number | string | bigint | null }>(
          `select count(*)::int as remaining_count
             from public.shipments
            where org_id = app.current_org_id()
              and sales_order_id = $1::uuid
              and deleted_at is null
              and status not in ('delivered', 'cancelled')`,
          [shipment.sales_order_id],
        );

        targetSoStatus = toNumber(remainingRows[0]?.remaining_count) === 0 ? 'delivered' : 'partially_delivered';
        const soWrite = await writeSalesOrderStatusInContext(ctx, shipment.sales_order_id, targetSoStatus, {
          currentStatus: soStatus,
        });
        if (soWrite !== 'ok') throw new ActionError('invalid_state');
      }

      await writePodAuditEvent(ctx, {
        shipmentId: parsed.shipmentId,
        signatureId,
        beforeState: {
          shipment_status: currentShipment.status,
          sales_order_id: currentShipment.sales_order_id,
          bol_signed_pdf_url: currentShipment.bol_signed_pdf_url,
        },
        afterState: {
          shipment_status: 'delivered',
          sales_order_status: targetSoStatus,
          bol_signed_pdf_url: parsed.signedPdfUrl,
          reason: parsed.reason,
        },
      });

      return { ok: true };
    });
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
