'use server';

import { createHash } from 'node:crypto';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

export type ShipShipmentResult = { ok: true } | { ok: false; error: string };
export type SealShipmentResult = { ok: true } | { ok: false; error: string };

export type GenerateBolInput = {
  shipmentId: string;
  carrier?: string;
  serviceLevel?: string;
  trackingNumber?: string;
};
export type GenerateBolResult = { ok: true; bolRef: string } | { ok: false; error: string };

export type RecordPodInput = {
  shipmentId: string;
  signedPdfUrl?: string;
};
export type RecordPodResult = { ok: true } | { ok: false; error: string };

const SHIP_PACK_CLOSE = 'ship.pack.close';
const SHIP_BOL_SIGN = 'ship.bol.sign';
const SALES_ORDER_SHIPPED_STATUS = 'shipped';
const SALES_ORDER_DELIVERED_STATUS = 'delivered';
const LP_SHIPPED_EVENT_TYPE = 'warehouse.lp.shipped';

class ActionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function hasPermission(ctx: ShippingContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
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

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0);
}

async function fetchShipmentLps(ctx: ShippingContext, shipmentId: string): Promise<Array<{ lp_id: string; lp_number: string | null }>> {
  const { rows } = await ctx.client.query<{ lp_id: string; lp_number: string | null }>(
    `select distinct lp.id::text as lp_id,
            coalesce(lp.lp_code, lp.lp_number) as lp_number
       from public.shipment_box_contents sbc
       join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
        and sb.org_id = app.current_org_id()
        and sb.deleted_at is null
       join public.license_plates lp on lp.id = sbc.license_plate_id
        and lp.org_id = app.current_org_id()
      where sbc.org_id = app.current_org_id()
        and sbc.deleted_at is null
        and sb.shipment_id = $1::uuid
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

      const { rows: updatedShipmentRows } = await ctx.client.query<{ id: string }>(
        `update public.shipments
            set status = 'packed',
                packed_at = now(),
                packed_by = $2::uuid,
                updated_at = now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'packing'
            and deleted_at is null
            and exists (
              select 1
                from public.shipment_boxes sb
               where sb.org_id = app.current_org_id()
                 and sb.shipment_id = public.shipments.id
                 and sb.deleted_at is null
            )
          returning id::text`,
        [shipmentId, userId],
      );
      if (!updatedShipmentRows[0]) throw new ActionError('persistence_failed');

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
      const forbidden = await requirePermission(ctx, SHIP_PACK_CLOSE);
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

      const lpRows = await fetchShipmentLps(ctx, shipmentId);
      const lpIds = lpRows.map((row) => row.lp_id);
      if (lpIds.length === 0) return { ok: false, error: 'invalid_state' };

      const { rows: updatedShipmentRows } = await ctx.client.query<{ id: string }>(
        `update public.shipments
            set status = 'shipped',
                shipped_at = now(),
                shipped_by = $2::uuid,
                updated_at = now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'packed'
            and deleted_at is null
          returning id::text`,
        [shipmentId, userId],
      );
      if (!updatedShipmentRows[0]) throw new ActionError('persistence_failed');

      const { rows: updatedLpRows } = await ctx.client.query<{ id: string }>(
        `update public.license_plates
            set status = 'shipped',
                reserved_qty = 0,
                updated_at = now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = any($1::uuid[])
          returning id::text`,
        [lpIds, userId],
      );
      if (updatedLpRows.length !== lpIds.length) throw new ActionError('persistence_failed');

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

      const { rows: updatedSoRows } = await ctx.client.query<{ id: string }>(
        `update public.sales_orders
            set status = $2,
                shipped_at = case when $2 = 'shipped' then now() else shipped_at end,
                updated_at = now(),
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and deleted_at is null
          returning id::text`,
        [shipment.sales_order_id, SALES_ORDER_SHIPPED_STATUS, userId],
      );
      if (!updatedSoRows[0]) throw new ActionError('persistence_failed');

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
      const forbidden = await requirePermission(ctx, SHIP_PACK_CLOSE);
      if (forbidden) return forbidden;

      const lpRows = await fetchShipmentLps(ctx, input.shipmentId);
      const bolPayload = {
        shipmentId: input.shipmentId,
        orgId,
        carrier: input.carrier ?? null,
        serviceLevel: input.serviceLevel ?? null,
        trackingNumber: input.trackingNumber ?? null,
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
                bol_pdf_url = $5::text,
                ext_data = coalesce(ext_data, '{}'::jsonb) || $6::jsonb,
                updated_at = now(),
                updated_by = $7::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and deleted_at is null
          returning id::text`,
        [
          input.shipmentId,
          input.carrier ?? null,
          input.serviceLevel ?? null,
          input.trackingNumber ?? null,
          serializedPayload,
          JSON.stringify({ bol_sha256: bolHash }),
          userId,
        ],
      );
      if (!rows[0]) return { ok: false, error: 'not_found' };

      return { ok: true, bolRef: bolHash };
    });
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function recordPod(input: RecordPodInput): Promise<RecordPodResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<RecordPodResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      const forbidden = await requirePermission(ctx, SHIP_BOL_SIGN);
      if (forbidden) return forbidden;

      const { rows: shipmentRows } = await ctx.client.query<{ id: string; status: string }>(
        `select id::text, status
           from public.shipments
          where org_id = app.current_org_id()
            and id = $1::uuid
            and deleted_at is null
          limit 1`,
        [input.shipmentId],
      );
      const currentShipment = shipmentRows[0];
      if (!currentShipment || currentShipment.status !== 'shipped') {
        return { ok: false, error: 'invalid_state' };
      }

      const { rows } = await ctx.client.query<{ id: string; sales_order_id: string | null }>(
        `update public.shipments
            set status = 'delivered',
                delivered_at = now(),
                bol_signed_pdf_url = $2::text,
                updated_at = now(),
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'shipped'
            and deleted_at is null
          returning id::text, sales_order_id::text`,
        [input.shipmentId, input.signedPdfUrl ?? null, userId],
      );
      const shipment = rows[0];
      if (!shipment) throw new ActionError('persistence_failed');

      if (shipment.sales_order_id) {
        const { rows: remainingRows } = await ctx.client.query<{ remaining_count: number | string | bigint | null }>(
          `select count(*)::int as remaining_count
             from public.shipments
            where org_id = app.current_org_id()
              and sales_order_id = $1::uuid
              and deleted_at is null
              and status <> 'delivered'`,
          [shipment.sales_order_id],
        );

        if (toNumber(remainingRows[0]?.remaining_count) === 0) {
          await ctx.client.query(
            `update public.sales_orders
                set status = $2,
                    updated_at = now(),
                    updated_by = $3::uuid
              where org_id = app.current_org_id()
                and id = $1::uuid
                and deleted_at is null`,
            [shipment.sales_order_id, SALES_ORDER_DELIVERED_STATUS, userId],
          );
        }
      }

      return { ok: true };
    });
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
