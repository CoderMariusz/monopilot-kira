'use server';

/**
 * Wave-shipping — RMA Server Actions (create / approve / receive / process / close).
 *
 * RBAC: ship.so.create (create), ship.so.confirm (approve/receive), ship.rma.disposition (process).
 * Tables: public.rma_requests + public.rma_lines (migration 508).
 */

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';

import {
  CreateRmaInput,
  ProcessRmaInput,
  RMA_LINE_SELECT,
  RMA_SELECT,
  ReceiveRmaInput,
  RmaIdInput,
  SHIP_RMA_APPROVE,
  SHIP_RMA_DISPOSITION,
  SHIP_RMA_WRITE,
  type RmaDetail,
  type RmaDisposition,
  type RmaLineSummary,
  type RmaListItem,
  type RmaResult,
  type RmaStatus,
} from './rma-actions-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

class RmaAbort extends Error {
  constructor(readonly result: Extract<RmaResult<unknown>, { ok: false }>) {
    super(result.error);
    this.name = 'RmaAbort';
  }
}

type RmaRow = {
  id: string;
  rma_number: string | null;
  customer_id: string;
  customer_name: string | null;
  customer_code: string | null;
  sales_order_id: string | null;
  sales_order_number: string | null;
  shipment_id: string | null;
  reason_code: string;
  reason_label: string | null;
  status: string;
  total_value_gbp: string | null;
  disposition: string | null;
  notes: string | null;
  approved_at: string | Date | null;
  received_at: string | Date | null;
  processed_at: string | Date | null;
  closed_at: string | Date | null;
  created_at: string | Date;
  line_count: number | string;
};

type RmaLineRow = {
  id: string;
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  quantity_expected: string;
  quantity_received: string;
  lot_number: string | null;
  reason_notes: string | null;
  disposition: string | null;
};

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRmaListItem(row: RmaRow): RmaListItem {
  return {
    id: row.id,
    rmaNumber: row.rma_number ?? '',
    customerId: row.customer_id,
    customerName: row.customer_name ?? '',
    customerCode: row.customer_code ?? '',
    salesOrderId: row.sales_order_id,
    salesOrderNumber: row.sales_order_number,
    shipmentId: row.shipment_id,
    reasonCode: row.reason_code,
    reasonLabel: row.reason_label,
    status: row.status as RmaStatus,
    lineCount: Number(row.line_count ?? 0),
    totalValueGbp: row.total_value_gbp,
    disposition: (row.disposition as RmaDisposition | null) ?? null,
    createdAt: toIso(row.created_at) ?? '',
  };
}

function mapRmaLine(row: RmaLineRow): RmaLineSummary {
  return {
    id: row.id,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    quantityExpected: row.quantity_expected,
    quantityReceived: row.quantity_received,
    lotNumber: row.lot_number,
    reasonNotes: row.reason_notes,
    disposition: (row.disposition as RmaDisposition | null) ?? null,
  };
}

function mapRmaDetail(row: RmaRow, lines: RmaLineSummary[]): RmaDetail {
  return {
    ...mapRmaListItem(row),
    notes: row.notes,
    approvedAt: toIso(row.approved_at),
    receivedAt: toIso(row.received_at),
    processedAt: toIso(row.processed_at),
    closedAt: toIso(row.closed_at),
    lines,
  };
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
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

async function writeRmaAudit(
  ctx: OrgActionContext,
  input: { action: string; resourceId: string; afterState: Record<string, unknown> },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       ($1::uuid, $2::uuid, 'user', $3, 'rma_request', $4,
        null, $5::jsonb, $6::uuid, 'operational')`,
    [ctx.orgId, ctx.userId, input.action, input.resourceId, JSON.stringify(input.afterState), randomUUID()],
  );
}

async function emitOutbox(ctx: OrgActionContext, eventType: string, aggregateId: string, payload: Record<string, unknown>): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'rma_request', $2::uuid, $3::jsonb, coalesce(current_setting('app.app_version', true), 'dev'))`,
    [eventType, aggregateId, JSON.stringify({ ...payload, org_id: ctx.orgId })],
  );
}

function revalidateRmaRoutes(rmaId?: string): void {
  revalidateLocalized('/shipping/rma');
  if (rmaId) revalidateLocalized(`/shipping/rma/${rmaId}`);
}

const RMA_FROM = `
  from public.rma_requests r
  join public.customers c
    on c.id = r.customer_id
   and c.org_id = app.current_org_id()
   and c.deleted_at is null
  left join public.sales_orders so
    on so.id = r.sales_order_id
   and so.org_id = app.current_org_id()
   and so.deleted_at is null
  left join public.rma_reason_codes rc
    on rc.org_id = app.current_org_id()
   and rc.code = r.reason_code
   and rc.is_active
 where r.org_id = app.current_org_id()
   and r.deleted_at is null`;

async function loadRmaById(client: QueryClient, rmaId: string): Promise<RmaDetail | null> {
  const { rows } = await client.query<RmaRow>(
    `select ${RMA_SELECT} ${RMA_FROM} and r.id = $1::uuid limit 1`,
    [rmaId],
  );
  const row = rows[0];
  if (!row) return null;

  const { rows: lineRows } = await client.query<RmaLineRow>(
    `select ${RMA_LINE_SELECT}
       from public.rma_lines rl
       left join public.items i
         on i.id = rl.product_id
        and i.org_id = app.current_org_id()
      where rl.org_id = app.current_org_id()
        and rl.rma_request_id = $1::uuid
        and rl.deleted_at is null
      order by rl.created_at asc`,
    [rmaId],
  );

  return mapRmaDetail(row, lineRows.map(mapRmaLine));
}

async function assertReasonCode(ctx: OrgActionContext, reasonCode: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.rma_reason_codes
      where org_id = app.current_org_id()
        and code = $1
        and is_active
      limit 1`,
    [reasonCode],
  );
  return rows.length > 0;
}

export async function listRmaReasonCodes(): Promise<RmaResult<Array<{ code: string; label: string }>>> {
  try {
    return await withOrgContext(async ({ client }) => {
      const { rows } = await (client as QueryClient).query<{ code: string; label_en: string }>(
        `select code, label_en
           from public.rma_reason_codes
          where org_id = app.current_org_id()
            and is_active
          order by display_order asc, code asc`,
      );
      return { ok: true, data: rows.map((r) => ({ code: r.code, label: r.label_en })) };
    });
  } catch (err) {
    console.error('[shipping/rma] listRmaReasonCodes failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function listRmas(params: unknown = {}): Promise<RmaResult<RmaListItem[]>> {
  const input = (params ?? {}) as { status?: unknown };
  const status = typeof input.status === 'string' && input.status.trim() ? input.status.trim() : null;
  const allowed = new Set(['pending', 'approved', 'receiving', 'received', 'processed', 'closed']);
  const statusFilter = status && allowed.has(status) ? status : null;

  try {
    return await withOrgContext(async ({ client }) => {
      const { rows } = await (client as QueryClient).query<RmaRow>(
        `select ${RMA_SELECT} ${RMA_FROM}
           and ($1::text is null or r.status = $1)
         order by r.created_at desc
         limit 200`,
        [statusFilter],
      );
      return { ok: true, data: rows.map(mapRmaListItem) };
    });
  } catch (err) {
    console.error('[shipping/rma] listRmas failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getRma(rmaId: unknown): Promise<RmaResult<RmaDetail>> {
  const parsed = RmaIdInput.safeParse({ rmaId });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ client }) => {
      const detail = await loadRmaById(client as QueryClient, parsed.data.rmaId);
      if (!detail) return { ok: false, error: 'not_found' };
      return { ok: true, id: detail.id, data: detail };
    });
  } catch (err) {
    console.error('[shipping/rma] getRma failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createRma(rawInput: unknown): Promise<RmaResult<RmaDetail>> {
  const parsed = CreateRmaInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, SHIP_RMA_WRITE))) return { ok: false, error: 'forbidden' };
      if (!(await assertReasonCode(ctx, input.reasonCode))) return { ok: false, error: 'invalid_input' };

      const { rows: customerRows } = await ctx.client.query<{ id: string }>(
        `select id::text as id
           from public.customers
          where id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
          limit 1`,
        [input.customerId],
      );
      if (customerRows.length === 0) return { ok: false, error: 'not_found' };

      if (input.salesOrderId) {
        const { rows: soRows } = await ctx.client.query<{ customer_id: string }>(
          `select customer_id::text as customer_id
             from public.sales_orders
            where id = $1::uuid
              and org_id = app.current_org_id()
              and deleted_at is null
            limit 1`,
          [input.salesOrderId],
        );
        if (soRows.length === 0) return { ok: false, error: 'not_found' };
        if (soRows[0]!.customer_id !== input.customerId) return { ok: false, error: 'invalid_input' };
      }

      if (input.shipmentId) {
        const { rows: shRows } = await ctx.client.query<{ customer_id: string; sales_order_id: string | null }>(
          `select customer_id::text as customer_id, sales_order_id::text as sales_order_id
             from public.shipments
            where id = $1::uuid
              and org_id = app.current_org_id()
              and deleted_at is null
            limit 1`,
          [input.shipmentId],
        );
        if (shRows.length === 0) return { ok: false, error: 'not_found' };
        if (shRows[0]!.customer_id !== input.customerId) return { ok: false, error: 'invalid_input' };
        if (input.salesOrderId && shRows[0]!.sales_order_id && shRows[0]!.sales_order_id !== input.salesOrderId) {
          return { ok: false, error: 'invalid_input' };
        }
      }

      try {
        const { rows: headerRows } = await ctx.client.query<{ id: string }>(
          `insert into public.rma_requests
             (org_id, customer_id, sales_order_id, shipment_id, reason_code, notes, created_by, updated_by)
           values
             (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid, $6::uuid)
           returning id::text`,
          [
            input.customerId,
            input.salesOrderId ?? null,
            input.shipmentId ?? null,
            input.reasonCode,
            input.notes ?? null,
            userId,
          ],
        );
        const rmaId = headerRows[0]?.id;
        if (!rmaId) throw new RmaAbort({ ok: false, error: 'persistence_failed' });

        for (const line of input.lines) {
          const { rows: priceRows } = await ctx.client.query<{ unit_price: string | null }>(
            `select sol.unit_price_gbp::text as unit_price
               from public.sales_order_lines sol
              where sol.org_id = app.current_org_id()
                and sol.product_id = $1::uuid
                and ($2::uuid is null or sol.sales_order_id = $2::uuid)
                and sol.deleted_at is null
              order by sol.created_at desc
              limit 1`,
            [line.productId, input.salesOrderId ?? null],
          );
          const unitPrice = priceRows[0]?.unit_price ?? null;

          await ctx.client.query(
            `insert into public.rma_lines
               (org_id, rma_request_id, product_id, quantity_expected, lot_number, reason_notes, unit_price_gbp, created_by, updated_by)
             values
               (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5, $6::numeric, $7::uuid, $7::uuid)`,
            [
              rmaId,
              line.productId,
              line.quantityExpected,
              line.lotNumber ?? null,
              line.reasonNotes ?? null,
              unitPrice,
              userId,
            ],
          );
        }

        await ctx.client.query(
          `update public.rma_requests r
              set total_value_gbp = (
                    select coalesce(sum(rl.quantity_expected * coalesce(rl.unit_price_gbp, 0)), 0)
                      from public.rma_lines rl
                     where rl.rma_request_id = r.id
                       and rl.org_id = app.current_org_id()
                       and rl.deleted_at is null
                  ),
                  updated_by = $2::uuid
            where r.id = $1::uuid
              and r.org_id = app.current_org_id()`,
          [rmaId, userId],
        );

        await writeRmaAudit(ctx, {
          action: 'shipping.rma.created',
          resourceId: rmaId,
          afterState: { customer_id: input.customerId, reason_code: input.reasonCode, line_count: input.lines.length },
        });
        await emitOutbox(ctx, 'shipping.rma.created', rmaId, {
          rma_id: rmaId,
          customer_id: input.customerId,
          sales_order_id: input.salesOrderId ?? null,
        });

        revalidateRmaRoutes(rmaId);
        const detail = await loadRmaById(ctx.client, rmaId);
        if (!detail) throw new RmaAbort({ ok: false, error: 'persistence_failed' });
        return { ok: true, id: rmaId, data: detail };
      } catch (err) {
        if (err instanceof RmaAbort) return err.result;
        throw err;
      }
    });
  } catch (err) {
    console.error('[shipping/rma] createRma failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function approveRma(rawInput: unknown): Promise<RmaResult<RmaDetail>> {
  const parsed = RmaIdInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, SHIP_RMA_APPROVE))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string; status: string }>(
        `update public.rma_requests
            set status = 'approved',
                approved_at = pg_catalog.now(),
                approved_by = $2::uuid,
                updated_by = $2::uuid
          where id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
            and status = 'pending'
        returning id::text, status`,
        [parsed.data.rmaId, userId],
      );
      if (rows.length === 0) return { ok: false, error: 'invalid_state' };

      await writeRmaAudit(ctx, { action: 'shipping.rma.approved', resourceId: parsed.data.rmaId, afterState: { status: 'approved' } });
      await emitOutbox(ctx, 'shipping.rma.approved', parsed.data.rmaId, { rma_id: parsed.data.rmaId });

      revalidateRmaRoutes(parsed.data.rmaId);
      const detail = await loadRmaById(ctx.client, parsed.data.rmaId);
      if (!detail) return { ok: false, error: 'not_found' };
      return { ok: true, id: parsed.data.rmaId, data: detail };
    });
  } catch (err) {
    console.error('[shipping/rma] approveRma failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function receiveRma(rawInput: unknown): Promise<RmaResult<RmaDetail>> {
  const parsed = ReceiveRmaInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, SHIP_RMA_APPROVE))) return { ok: false, error: 'forbidden' };

      const { rows: headerRows } = await ctx.client.query<{ status: string }>(
        `select status
           from public.rma_requests
          where id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
          limit 1`,
        [parsed.data.rmaId],
      );
      if (headerRows.length === 0) return { ok: false, error: 'not_found' };
      const currentStatus = headerRows[0]!.status;
      if (currentStatus !== 'approved' && currentStatus !== 'receiving') {
        return { ok: false, error: 'invalid_state' };
      }

      for (const line of parsed.data.lines) {
        const { rowCount } = await ctx.client.query(
          `update public.rma_lines
              set quantity_received = $3::numeric,
                  updated_by = $4::uuid
            where id = $2::uuid
              and rma_request_id = $1::uuid
              and org_id = app.current_org_id()
              and deleted_at is null`,
          [parsed.data.rmaId, line.lineId, line.quantityReceived, userId],
        );
        if (!rowCount) return { ok: false, error: 'not_found' };
      }

      await ctx.client.query(
        `update public.rma_requests
            set status = 'received',
                received_at = pg_catalog.now(),
                received_by = $2::uuid,
                updated_by = $2::uuid
          where id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null`,
        [parsed.data.rmaId, userId],
      );

      await writeRmaAudit(ctx, { action: 'shipping.rma.received', resourceId: parsed.data.rmaId, afterState: { status: 'received' } });
      await emitOutbox(ctx, 'shipping.rma.received', parsed.data.rmaId, { rma_id: parsed.data.rmaId });

      revalidateRmaRoutes(parsed.data.rmaId);
      const detail = await loadRmaById(ctx.client, parsed.data.rmaId);
      if (!detail) return { ok: false, error: 'not_found' };
      return { ok: true, id: parsed.data.rmaId, data: detail };
    });
  } catch (err) {
    console.error('[shipping/rma] receiveRma failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function processRma(rawInput: unknown): Promise<RmaResult<RmaDetail>> {
  const parsed = ProcessRmaInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, SHIP_RMA_DISPOSITION))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string }>(
        `update public.rma_requests
            set status = 'processed',
                disposition = $2,
                processed_at = pg_catalog.now(),
                processed_by = $3::uuid,
                updated_by = $3::uuid
          where id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
            and status = 'received'
        returning id::text`,
        [parsed.data.rmaId, parsed.data.disposition, userId],
      );
      if (rows.length === 0) return { ok: false, error: 'invalid_state' };

      await ctx.client.query(
        `update public.rma_lines
            set disposition = $2,
                updated_by = $3::uuid
          where rma_request_id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
            and disposition is null`,
        [parsed.data.rmaId, parsed.data.disposition, userId],
      );

      await writeRmaAudit(ctx, {
        action: 'shipping.rma.processed',
        resourceId: parsed.data.rmaId,
        afterState: { status: 'processed', disposition: parsed.data.disposition },
      });
      await emitOutbox(ctx, 'shipping.rma.processed', parsed.data.rmaId, {
        rma_id: parsed.data.rmaId,
        disposition: parsed.data.disposition,
      });

      revalidateRmaRoutes(parsed.data.rmaId);
      const detail = await loadRmaById(ctx.client, parsed.data.rmaId);
      if (!detail) return { ok: false, error: 'not_found' };
      return { ok: true, id: parsed.data.rmaId, data: detail };
    });
  } catch (err) {
    console.error('[shipping/rma] processRma failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function closeRma(rawInput: unknown): Promise<RmaResult<RmaDetail>> {
  const parsed = RmaIdInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, SHIP_RMA_APPROVE))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string }>(
        `update public.rma_requests
            set status = 'closed',
                closed_at = pg_catalog.now(),
                closed_by = $2::uuid,
                updated_by = $2::uuid
          where id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
            and status = 'processed'
        returning id::text`,
        [parsed.data.rmaId, userId],
      );
      if (rows.length === 0) return { ok: false, error: 'invalid_state' };

      await writeRmaAudit(ctx, { action: 'shipping.rma.closed', resourceId: parsed.data.rmaId, afterState: { status: 'closed' } });

      revalidateRmaRoutes(parsed.data.rmaId);
      const detail = await loadRmaById(ctx.client, parsed.data.rmaId);
      if (!detail) return { ok: false, error: 'not_found' };
      return { ok: true, id: parsed.data.rmaId, data: detail };
    });
  } catch (err) {
    console.error('[shipping/rma] closeRma failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
