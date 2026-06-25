'use server';

import { randomUUID } from 'node:crypto';
import { signEvent } from '@monopilot/e-sign';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

type ShippingReversalError =
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'invalid_state'
  | 'illegal_transition'
  | 'downstream_financial_record'
  | 'esign_failed'
  | 'persistence_failed';

export type ShippingReversalInput = {
  shipmentId: string;
  reasonCode?: string | null;
  note?: string | null;
  signature: {
    password: string;
    nonce?: string | null;
  };
};

export type ShippingReversalResult =
  | { ok: true }
  | { ok: false; error: ShippingReversalError; message?: string };

type ShipmentRow = {
  id: string;
  status: string;
  sales_order_id: string | null;
  sales_order_status: string | null;
  shipment_number: string | null;
  delivered_at: string | null;
  bol_signed_pdf_url: string | null;
};

type ShipmentLpRow = {
  lp_id: string;
  site_id: string | null;
  from_status: string;
  shipped_qty: string;
  reserved_qty: string;
  prior_reserved_qty: string;
};

type AllocationRow = {
  id: string;
  lp_id: string;
  qty: string;
  status: string;
};

type FinancialTableRow = {
  table_name: string;
  has_shipment_id: boolean;
  has_sales_order_id: boolean;
  has_so_id: boolean;
};

const SHIP_SO_CANCEL = 'ship.so.cancel';
const SHIP_PACK_CLOSE = 'ship.pack.close';
const SHIP_SHIP_CONFIRM = 'ship.ship.confirm';
const SHIP_BOL_SIGN = 'ship.bol.sign';

const CANCEL_SHIPMENT_INTENT = 'cancel_shipment';
const UNPACK_SHIPMENT_INTENT = 'unpack_shipment';
const VOID_POD_INTENT = 'void_pod';

const SHIPPING_SO_CANCELLED_EVENT = 'shipping.so.cancelled';
const SHIPPING_SHIPMENT_PACKED_EVENT = 'shipping.shipment.packed';
const SHIPPING_SHIPMENT_CONFIRMED_EVENT = 'shipping.shipment.confirmed';
const WAREHOUSE_LP_TRANSITIONED_EVENT = 'warehouse.lp.transitioned';

const TERMINAL_SHIPMENT_STATUSES = new Set(['delivered', 'cancelled']);
const CANCEL_BLOCKED_SO_STATUSES = new Set(['delivered', 'partially_delivered', 'cancelled']);
const UNPACK_BLOCKED_SHIPMENT_STATUSES = new Set(['shipped', 'delivered', 'cancelled']);

const reversalInputSchema = z.object({
  shipmentId: z.string().uuid(),
  reasonCode: z.string().trim().min(1).max(64).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  signature: z.object({
    password: z.string().min(1),
    nonce: z.string().trim().min(1).optional().nullable(),
  }),
});

class ActionError extends Error {
  constructor(readonly code: ShippingReversalError) {
    super(code);
  }
}

function parseInput(input: ShippingReversalInput): z.infer<typeof reversalInputSchema> | null {
  const parsed = reversalInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function errorCode(error: unknown): ShippingReversalError {
  if (error instanceof ActionError) return error.code;
  const code = (error as { code?: string } | null)?.code;
  if (code === '22P02' || code === '23503' || code === '23514') return 'invalid_input';
  return 'persistence_failed';
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

async function requireAnyPermission(
  ctx: ShippingContext,
  permissions: readonly string[],
): Promise<ShippingReversalResult | null> {
  for (const permission of permissions) {
    if (await hasPermission(ctx, permission)) return null;
  }
  return { ok: false, error: 'forbidden' };
}

async function requirePermission(ctx: ShippingContext, permission: string): Promise<ShippingReversalResult | null> {
  return requireAnyPermission(ctx, [permission]);
}

async function lockShipment(ctx: ShippingContext, shipmentId: string): Promise<ShipmentRow | null> {
  const { rows } = await ctx.client.query<ShipmentRow>(
    `select sh.id::text,
            sh.status,
            sh.sales_order_id::text,
            null::text as sales_order_status,
            sh.shipment_number,
            sh.delivered_at::text,
            sh.bol_signed_pdf_url
       from public.shipments sh
      where sh.org_id = app.current_org_id()
        and sh.id = $1::uuid
        and sh.deleted_at is null
      for update of sh`,
    [shipmentId],
  );
  const shipment = rows[0] ?? null;
  if (!shipment?.sales_order_id) return shipment;

  const { rows: salesOrderRows } = await ctx.client.query<{ status: string }>(
    `select status
       from public.sales_orders
      where org_id = app.current_org_id()
        and id = $1::uuid
        and deleted_at is null
      for update`,
    [shipment.sales_order_id],
  );
  shipment.sales_order_status = salesOrderRows[0]?.status ?? null;
  return shipment;
}

async function lockShipmentLps(ctx: ShippingContext, shipmentId: string): Promise<ShipmentLpRow[]> {
  const { rows } = await ctx.client.query<ShipmentLpRow>(
    `with shipment_lps as (
       select sbc.license_plate_id,
              sum(sbc.quantity)::numeric as shipped_qty
       from public.shipment_box_contents sbc
       join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
        and sb.org_id = app.current_org_id()
        and sb.deleted_at is null
      where sbc.org_id = app.current_org_id()
        and sbc.deleted_at is null
        and sbc.quantity is not null
        and sbc.quantity > 0
        and sb.shipment_id = $1::uuid
      group by sbc.license_plate_id
     ),
     shipment_lp_snapshots as (
       select snapshot.lp_id::uuid as lp_id,
              snapshot.shipped_qty::numeric as shipped_qty,
              snapshot.prior_status,
              snapshot.prior_reserved_qty::numeric as prior_reserved_qty
         from public.shipments sh
        cross join lateral jsonb_to_recordset(coalesce(sh.ext_data->'shipped_license_plates', '[]'::jsonb))
          as snapshot(lp_id text, shipped_qty text, prior_status text, prior_reserved_qty text)
        where sh.org_id = app.current_org_id()
          and sh.id = $1::uuid
          and sh.deleted_at is null
     )
     select lp.id::text as lp_id,
            lp.site_id::text,
            coalesce(snapshot.prior_status, case when lp.status = 'shipped' then 'available' else lp.status end) as from_status,
            coalesce(snapshot.shipped_qty, shipment_lps.shipped_qty)::text as shipped_qty,
            lp.reserved_qty::text,
            coalesce(snapshot.prior_reserved_qty, lp.reserved_qty)::text as prior_reserved_qty
       from shipment_lps
       join public.license_plates lp on lp.id = shipment_lps.license_plate_id
        and lp.org_id = app.current_org_id()
       left join shipment_lp_snapshots snapshot on snapshot.lp_id = lp.id
      for update of lp`,
    [shipmentId],
  );

  const byId = new Map<string, ShipmentLpRow>();
  for (const row of rows) byId.set(row.lp_id, row);
  return Array.from(byId.values());
}

async function lockShipmentAllocations(ctx: ShippingContext, shipment: ShipmentRow): Promise<AllocationRow[]> {
  if (!shipment.sales_order_id) return [];
  const { rows } = await ctx.client.query<AllocationRow>(
    `select ia.id::text,
            ia.license_plate_id::text as lp_id,
            ia.quantity_allocated::text as qty,
            ia.status
       from public.inventory_allocations ia
       join public.sales_order_lines sol on sol.id = ia.sales_order_line_id
        and sol.org_id = app.current_org_id()
        and sol.sales_order_id = $1::uuid
        and sol.deleted_at is null
       join public.shipment_box_contents sbc on sbc.license_plate_id = ia.license_plate_id
        and sbc.org_id = app.current_org_id()
        and sbc.deleted_at is null
       join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
        and sb.org_id = app.current_org_id()
        and sb.shipment_id = $2::uuid
        and sb.deleted_at is null
      where ia.org_id = app.current_org_id()
        and ia.deleted_at is null
        and ia.status in ('allocated', 'picked')
      for update of ia`,
    [shipment.sales_order_id, shipment.id],
  );
  const byId = new Map<string, AllocationRow>();
  for (const row of rows) byId.set(row.id, row);
  return Array.from(byId.values());
}

async function signReversal(
  ctx: ShippingContext,
  parsed: z.infer<typeof reversalInputSchema>,
  intent: string,
  subject: Record<string, unknown>,
): Promise<string> {
  try {
    const receipt = await signEvent(
      {
        signerUserId: ctx.userId,
        pin: parsed.signature.password,
        intent,
        reason: parsed.reasonCode ?? undefined,
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

async function writeAuditEvent(
  ctx: ShippingContext,
  params: {
    action: string;
    shipment: ShipmentRow;
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
       $2,
       'shipment',
       $3,
       $4::jsonb,
       $5::jsonb,
       $6::uuid,
       'operational'
     )
     returning id`,
    [
      ctx.userId,
      params.action,
      params.shipment.id,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
      randomUUID(),
    ],
  );
  const auditId = rows[0]?.id;
  if (typeof auditId !== 'number') throw new ActionError('persistence_failed');
  return auditId;
}

async function emitOutboxEvent(
  ctx: ShippingContext,
  params: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { rowCount } = await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, $2, $3, $4::jsonb, coalesce(current_setting('app.app_version', true), 'dev'), $5)
     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
    [
      params.eventType,
      params.aggregateType,
      params.aggregateId,
      JSON.stringify(params.payload),
      `${params.eventType}:${params.aggregateType}:${params.aggregateId}:${params.payload.signature_id ?? randomUUID()}`,
    ],
  );
  if (rowCount == null) throw new ActionError('persistence_failed');
}

async function writeLpTransition(
  ctx: ShippingContext,
  shipment: ShipmentRow,
  lp: ShipmentLpRow,
  toStatus: string,
  reasonCode: string | null,
  note: string | null,
): Promise<void> {
  if (lp.from_status === toStatus) return;

  const transactionId = randomUUID();
  const { rowCount } = await ctx.client.query(
    `insert into public.lp_state_history (
       org_id,
       site_id,
       lp_id,
       from_state,
       to_state,
       reason_code,
       reason_text,
       source_so_id,
       transaction_id,
       ext_jsonb,
       created_by
     )
     values (
       app.current_org_id(),
       $1::uuid,
       $2::uuid,
       $3,
       $4,
       $5,
       $6,
       $7::uuid,
       $8::uuid,
       $9::jsonb,
       $10::uuid
     )`,
    [
      lp.site_id,
      lp.lp_id,
      lp.from_status,
      toStatus,
      reasonCode,
      note,
      shipment.sales_order_id,
      transactionId,
      JSON.stringify({ shipment_id: shipment.id, shipment_number: shipment.shipment_number }),
      ctx.userId,
    ],
  );
  if (rowCount !== 1) throw new ActionError('persistence_failed');

  await emitOutboxEvent(ctx, {
    eventType: WAREHOUSE_LP_TRANSITIONED_EVENT,
    aggregateType: 'license_plate',
    aggregateId: lp.lp_id,
    payload: {
      lp_id: lp.lp_id,
      shipment_id: shipment.id,
      so_id: shipment.sales_order_id,
      from_status: lp.from_status,
      to_status: toStatus,
      transaction_id: transactionId,
    },
  });
}

async function assertNoDownstreamFinancialRecords(
  ctx: ShippingContext,
  shipment: ShipmentRow,
): Promise<ShippingReversalResult | null> {
  const candidateTables = ['invoices', 'invoice_payments', 'payments', 'sales_invoices', 'ar_invoices', 'ar_payments'];
  const { rows } = await ctx.client.query<FinancialTableRow>(
    `select table_name,
            bool_or(column_name = 'shipment_id') as has_shipment_id,
            bool_or(column_name = 'sales_order_id') as has_sales_order_id,
            bool_or(column_name = 'so_id') as has_so_id
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
        and column_name in ('shipment_id', 'sales_order_id', 'so_id')
      group by table_name`,
    [candidateTables],
  );

  for (const table of rows) {
    if (!candidateTables.includes(table.table_name)) continue;
    const predicates: string[] = [];
    const params: unknown[] = [];
    if (table.has_shipment_id) {
      params.push(shipment.id);
      predicates.push(`shipment_id = $${params.length}::uuid`);
    }
    if (table.has_sales_order_id && shipment.sales_order_id) {
      params.push(shipment.sales_order_id);
      predicates.push(`sales_order_id = $${params.length}::uuid`);
    }
    if (table.has_so_id && shipment.sales_order_id) {
      params.push(shipment.sales_order_id);
      predicates.push(`so_id = $${params.length}::uuid`);
    }
    if (predicates.length === 0) continue;

    const { rows: countRows } = await ctx.client.query<{ count: string }>(
      `select count(*)::text
         from public.${table.table_name}
        where ${predicates.join(' or ')}`,
      params,
    );
    if (Number(countRows[0]?.count ?? 0) > 0) {
      return { ok: false, error: 'downstream_financial_record' };
    }
  }

  return null;
}

async function recomputeSalesOrderStatusAfterCancel(ctx: ShippingContext, shipment: ShipmentRow): Promise<string | null> {
  if (!shipment.sales_order_id) return null;

  const { rows } = await ctx.client.query<{
    shipment_count: number | string | bigint | null;
    packing_count: number | string | bigint | null;
    packed_count: number | string | bigint | null;
    manifested_count: number | string | bigint | null;
    shipped_count: number | string | bigint | null;
    delivered_count: number | string | bigint | null;
    allocation_count: number | string | bigint | null;
  }>(
    `with remaining_shipments as (
       select status
         from public.shipments
        where org_id = app.current_org_id()
          and sales_order_id = $1::uuid
          and id <> $2::uuid
          and deleted_at is null
          and status <> 'cancelled'
     ),
     remaining_allocations as (
       select count(*)::int as allocation_count
         from public.inventory_allocations ia
         join public.sales_order_lines sol on sol.id = ia.sales_order_line_id
          and sol.org_id = app.current_org_id()
          and sol.sales_order_id = $1::uuid
          and sol.deleted_at is null
        where ia.org_id = app.current_org_id()
          and ia.deleted_at is null
          and ia.status in ('allocated', 'picked')
     )
     select count(rs.status)::int as shipment_count,
            count(*) filter (where rs.status = 'packing')::int as packing_count,
            count(*) filter (where rs.status = 'packed')::int as packed_count,
            count(*) filter (where rs.status = 'manifested')::int as manifested_count,
            count(*) filter (where rs.status = 'shipped')::int as shipped_count,
            count(*) filter (where rs.status = 'delivered')::int as delivered_count,
            ra.allocation_count
       from remaining_allocations ra
       left join remaining_shipments rs on true
      group by ra.allocation_count`,
    [shipment.sales_order_id, shipment.id],
  );

  const snapshot = rows[0];
  if (!snapshot) return 'confirmed';
  const allocationCount = Number(snapshot.allocation_count ?? 0);
  if (allocationCount === 0) return 'confirmed';

  const shipmentCount = Number(snapshot.shipment_count ?? 0);
  const deliveredCount = Number(snapshot.delivered_count ?? 0);
  const shippedCount = Number(snapshot.shipped_count ?? 0);
  const manifestedCount = Number(snapshot.manifested_count ?? 0);
  const packedCount = Number(snapshot.packed_count ?? 0);
  const packingCount = Number(snapshot.packing_count ?? 0);

  if (shipmentCount > 0 && deliveredCount === shipmentCount) return 'delivered';
  if (deliveredCount > 0) return 'partially_delivered';
  if (shippedCount > 0) return 'shipped';
  if (manifestedCount > 0) return 'manifested';
  if (packedCount > 0 && packingCount === 0) return 'packed';
  if (packedCount > 0 || packingCount > 0) return 'partially_packed';
  return 'allocated';
}

export async function cancelShipment(input: ShippingReversalInput): Promise<ShippingReversalResult> {
  const parsed = parseInput(input);
  if (!parsed) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ShippingReversalResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      const forbidden = await requirePermission(ctx, SHIP_SO_CANCEL);
      if (forbidden) return forbidden;

      const shipment = await lockShipment(ctx, parsed.shipmentId);
      if (!shipment) return { ok: false, error: 'not_found' };
      if (shipment.status === 'cancelled') return { ok: true };
      if (
        shipment.status !== 'shipped' ||
        TERMINAL_SHIPMENT_STATUSES.has(shipment.status) ||
        CANCEL_BLOCKED_SO_STATUSES.has(shipment.sales_order_status ?? '')
      ) {
        return { ok: false, error: 'invalid_state' };
      }

      const lps = await lockShipmentLps(ctx, shipment.id);
      const allocations = await lockShipmentAllocations(ctx, shipment);
      const signatureId = await signReversal(ctx, parsed, CANCEL_SHIPMENT_INTENT, {
        shipment_id: shipment.id,
        sales_order_id: shipment.sales_order_id,
        shipment_status: shipment.status,
        sales_order_status: shipment.sales_order_status,
        reason_code: parsed.reasonCode ?? null,
      });

      for (const allocation of allocations) {
        const { rowCount } = await ctx.client.query(
          `update public.inventory_allocations
              set status = 'released',
                  released_at = coalesce(released_at, now()),
                  ext_data = coalesce(ext_data, '{}'::jsonb) || $2::jsonb,
                  updated_at = now(),
                  updated_by = $3::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid
              and status in ('allocated', 'picked')`,
          [
            allocation.id,
            JSON.stringify({ cancellation_signature_id: signatureId, cancelled_shipment_id: shipment.id }),
            userId,
          ],
        );
        if (rowCount !== 1) throw new ActionError('persistence_failed');

        await ctx.client.query(
          `update public.license_plates
              set reserved_qty = greatest(0, reserved_qty - $2::numeric),
                  updated_at = now(),
                  updated_by = $3::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid`,
          [allocation.lp_id, allocation.qty, userId],
        );
      }

      for (const lp of lps) {
        const { rowCount } = await ctx.client.query(
          `update public.license_plates
              set quantity = quantity + $2::numeric,
                  reserved_qty = $3::numeric,
                  status = $4,
                  source_so_id = null,
                  updated_at = now(),
                  updated_by = $5::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid
              and status = 'shipped'`,
          [lp.lp_id, lp.shipped_qty, lp.prior_reserved_qty, lp.from_status, userId],
        );
        if (rowCount !== 1) throw new ActionError('persistence_failed');
        await writeLpTransition(ctx, shipment, { ...lp, from_status: 'shipped' }, lp.from_status, parsed.reasonCode ?? null, parsed.note ?? null);
      }

      const { rowCount } = await ctx.client.query(
        `update public.shipments
            set status = 'cancelled',
                ext_data = coalesce(ext_data, '{}'::jsonb) || $2::jsonb,
                updated_at = now(),
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'shipped'
            and deleted_at is null`,
        [
          shipment.id,
          JSON.stringify({
            cancelled_at: new Date().toISOString(),
            cancelled_by: userId,
            cancellation_reason_code: parsed.reasonCode ?? null,
            cancellation_note: parsed.note ?? null,
            cancellation_signature_id: signatureId,
          }),
          userId,
        ],
      );
      if (rowCount !== 1) throw new ActionError('persistence_failed');

      const targetSoStatus = await recomputeSalesOrderStatusAfterCancel(ctx, shipment);
      if (shipment.sales_order_id && !targetSoStatus) {
        return { ok: false, error: 'illegal_transition' };
      }

      if (shipment.sales_order_id && targetSoStatus) {
        const { rowCount: soRowCount } = await ctx.client.query(
          `update public.sales_orders
              set status = $2,
                  shipped_at = case when $2 = 'shipped' then shipped_at else null end,
                  updated_at = now(),
                  updated_by = $3::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid
              and deleted_at is null`,
          [shipment.sales_order_id, targetSoStatus, userId],
        );
        if (soRowCount !== 1) throw new ActionError('persistence_failed');
      }

      const auditId = await writeAuditEvent(ctx, {
        action: 'shipping.shipment.cancelled',
        shipment,
        beforeState: {
          shipment_status: shipment.status,
          sales_order_status: shipment.sales_order_status,
          allocation_ids: allocations.map((allocation) => allocation.id),
          lp_statuses: lps.map((lp) => ({ lp_id: lp.lp_id, status: lp.from_status })),
        },
        afterState: {
          shipment_status: 'cancelled',
          sales_order_status: targetSoStatus,
          allocations_released: allocations.map((allocation) => allocation.id),
          signature_id: signatureId,
          reason_code: parsed.reasonCode ?? null,
          note: parsed.note ?? null,
        },
      });

      await emitOutboxEvent(ctx, {
        eventType: SHIPPING_SO_CANCELLED_EVENT,
        aggregateType: 'shipment',
        aggregateId: shipment.id,
        payload: {
          shipment_id: shipment.id,
          sales_order_id: shipment.sales_order_id,
          audit_event_id: auditId,
          signature_id: signatureId,
          previous_shipment_status: shipment.status,
          shipment_status: 'cancelled',
          previous_sales_order_status: shipment.sales_order_status,
          sales_order_status: targetSoStatus,
        },
      });

      return { ok: true };
    });
  } catch (error) {
    return { ok: false, error: errorCode(error) };
  }
}

export async function unpackShipment(input: ShippingReversalInput): Promise<ShippingReversalResult> {
  const parsed = parseInput(input);
  if (!parsed) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ShippingReversalResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      const forbidden = await requireAnyPermission(ctx, [SHIP_PACK_CLOSE]);
      if (forbidden) return forbidden;

      const shipment = await lockShipment(ctx, parsed.shipmentId);
      if (!shipment) return { ok: false, error: 'not_found' };
      if (UNPACK_BLOCKED_SHIPMENT_STATUSES.has(shipment.status)) return { ok: false, error: 'invalid_state' };
      if (!['packed', 'manifested'].includes(shipment.status)) return { ok: false, error: 'invalid_state' };

      const lps = await lockShipmentLps(ctx, shipment.id);
      const signatureId = await signReversal(ctx, parsed, UNPACK_SHIPMENT_INTENT, {
        shipment_id: shipment.id,
        sales_order_id: shipment.sales_order_id,
        shipment_status: shipment.status,
        sales_order_status: shipment.sales_order_status,
        reason_code: parsed.reasonCode ?? null,
      });

      await ctx.client.query(
        `update public.shipment_box_contents sbc
            set deleted_at = coalesce(deleted_at, now()),
                updated_at = now(),
                updated_by = $2::uuid,
                ext_data = coalesce(ext_data, '{}'::jsonb) || $3::jsonb
           from public.shipment_boxes sb
          where sb.id = sbc.shipment_box_id
            and sb.org_id = app.current_org_id()
            and sb.shipment_id = $1::uuid
            and sbc.org_id = app.current_org_id()
            and sbc.deleted_at is null`,
        [
          shipment.id,
          userId,
          JSON.stringify({ unpack_signature_id: signatureId, unpack_reason_code: parsed.reasonCode ?? null }),
        ],
      );

      await ctx.client.query(
        `update public.shipment_boxes
            set deleted_at = coalesce(deleted_at, now()),
                updated_at = now(),
                updated_by = $2::uuid,
                ext_data = coalesce(ext_data, '{}'::jsonb) || $3::jsonb
          where org_id = app.current_org_id()
            and shipment_id = $1::uuid
            and deleted_at is null`,
        [
          shipment.id,
          userId,
          JSON.stringify({ unpack_signature_id: signatureId, unpack_reason_code: parsed.reasonCode ?? null }),
        ],
      );

      const { rowCount } = await ctx.client.query(
        `update public.shipments
            set status = 'packing',
                packed_at = null,
                packed_by = null,
                ext_data = coalesce(ext_data, '{}'::jsonb) || $2::jsonb,
                updated_at = now(),
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status in ('packed', 'manifested')
            and deleted_at is null`,
        [
          shipment.id,
          JSON.stringify({
            unpacked_at: new Date().toISOString(),
            unpacked_by: userId,
            unpack_reason_code: parsed.reasonCode ?? null,
            unpack_note: parsed.note ?? null,
            unpack_signature_id: signatureId,
          }),
          userId,
        ],
      );
      if (rowCount !== 1) throw new ActionError('persistence_failed');

      const auditId = await writeAuditEvent(ctx, {
        action: 'shipping.shipment.unpacked',
        shipment,
        beforeState: {
          shipment_status: shipment.status,
          lp_statuses: lps.map((lp) => ({ lp_id: lp.lp_id, status: lp.from_status })),
        },
        afterState: {
          shipment_status: 'packing',
          boxes_voided: true,
          signature_id: signatureId,
          reason_code: parsed.reasonCode ?? null,
          note: parsed.note ?? null,
        },
      });

      await emitOutboxEvent(ctx, {
        eventType: SHIPPING_SHIPMENT_PACKED_EVENT,
        aggregateType: 'shipment',
        aggregateId: shipment.id,
        payload: {
          shipment_id: shipment.id,
          sales_order_id: shipment.sales_order_id,
          audit_event_id: auditId,
          signature_id: signatureId,
          reversal: 'unpack_shipment',
          previous_shipment_status: shipment.status,
          shipment_status: 'packing',
        },
      });

      return { ok: true };
    });
  } catch (error) {
    return { ok: false, error: errorCode(error) };
  }
}

export async function voidPod(input: ShippingReversalInput): Promise<ShippingReversalResult> {
  const parsed = parseInput(input);
  if (!parsed) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ShippingReversalResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      const forbidden = await requirePermission(ctx, SHIP_BOL_SIGN);
      if (forbidden) return forbidden;

      const shipment = await lockShipment(ctx, parsed.shipmentId);
      if (!shipment) return { ok: false, error: 'not_found' };
      if (shipment.status !== 'delivered') return { ok: false, error: 'invalid_state' };

      const downstream = await assertNoDownstreamFinancialRecords(ctx, shipment);
      if (downstream) return downstream;

      const signatureId = await signReversal(ctx, parsed, VOID_POD_INTENT, {
        shipment_id: shipment.id,
        sales_order_id: shipment.sales_order_id,
        shipment_status: shipment.status,
        sales_order_status: shipment.sales_order_status,
        delivered_at: shipment.delivered_at,
        bol_signed_pdf_url: shipment.bol_signed_pdf_url,
        reason_code: parsed.reasonCode ?? null,
      });

      const { rowCount } = await ctx.client.query(
        `update public.shipments
            set status = 'shipped',
                delivered_at = null,
                bol_signed_pdf_url = null,
                ext_data = coalesce(ext_data, '{}'::jsonb) || jsonb_build_object(
                  'voided_pod', jsonb_build_object(
                    'voided_at', now(),
                    'voided_by', $2::uuid,
                    'reason_code', $3::text,
                    'note', $4::text,
                    'signature_id', $5::text,
                    'previous_delivered_at', $6::text,
                    'previous_bol_signed_pdf_url', $7::text
                  )
                ),
                updated_at = now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'delivered'
            and deleted_at is null`,
        [
          shipment.id,
          userId,
          parsed.reasonCode ?? null,
          parsed.note ?? null,
          signatureId,
          shipment.delivered_at,
          shipment.bol_signed_pdf_url,
        ],
      );
      if (rowCount !== 1) throw new ActionError('persistence_failed');

      if (shipment.sales_order_id && shipment.sales_order_status === 'delivered') {
        const { rowCount: soRowCount } = await ctx.client.query(
          `update public.sales_orders
              set status = 'shipped',
                  updated_at = now(),
                  updated_by = $2::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid
              and status = 'delivered'
              and deleted_at is null`,
          [shipment.sales_order_id, userId],
        );
        if (soRowCount !== 1) throw new ActionError('persistence_failed');
      }

      const auditId = await writeAuditEvent(ctx, {
        action: 'shipping.pod.voided',
        shipment,
        beforeState: {
          shipment_status: shipment.status,
          sales_order_status: shipment.sales_order_status,
          delivered_at: shipment.delivered_at,
          bol_signed_pdf_url: shipment.bol_signed_pdf_url,
        },
        afterState: {
          shipment_status: 'shipped',
          sales_order_status: shipment.sales_order_status === 'delivered' ? 'shipped' : shipment.sales_order_status,
          pod_voided: true,
          signature_id: signatureId,
          reason_code: parsed.reasonCode ?? null,
          note: parsed.note ?? null,
        },
      });

      await emitOutboxEvent(ctx, {
        eventType: SHIPPING_SHIPMENT_CONFIRMED_EVENT,
        aggregateType: 'shipment',
        aggregateId: shipment.id,
        payload: {
          shipment_id: shipment.id,
          sales_order_id: shipment.sales_order_id,
          audit_event_id: auditId,
          signature_id: signatureId,
          reversal: 'void_pod',
          previous_shipment_status: shipment.status,
          shipment_status: 'shipped',
          previous_sales_order_status: shipment.sales_order_status,
          sales_order_status: shipment.sales_order_status === 'delivered' ? 'shipped' : shipment.sales_order_status,
        },
      });

      return { ok: true };
    });
  } catch (error) {
    return { ok: false, error: errorCode(error) };
  }
}
