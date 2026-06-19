'use server';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { nextDocumentNumber } from '../../../../../../../lib/documents/numbering';
import {
  makeLpNumber,
  makeStockMoveNumber,
  resolveDefaultLocation,
} from '../../../../../../../lib/warehouse/lp-create';
import {
  TransferOrderCreateInput,
  TransferOrderStatusSchema,
  dateSchema,
  hasPlanningWritePermission,
  isPgError,
  numeric3Schema,
  pgErrorToResult,
  toIso,
  uuidSchema,
  writeProcurementAudit,
  type OrgActionContext,
  type ProcurementError,
  type QueryClient,
} from '../../_actions/procurement-shared';

type TransferOrderRow = {
  id: string;
  to_number: string;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  status: string;
  scheduled_date: string | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type TransferOrderLineRow = {
  id: string;
  to_id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  qty: string;
  uom: string;
  line_no: number;
  // R4-CL1 reversibility: the received destination LP (if this line has been
  // received). Sourced from the transfer_order_line_lps join — the same link table
  // reverseToReceiveLine operates on. Null until the line is received.
  received_dest_lp_id: string | null;
  received_dest_lp_number: string | null;
  received_qty: string | null;
};

type TransferOrderLine = {
  id: string;
  toId: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  lineNo: number;
  /** R4-CL1: the received destination LP id (null until received). */
  receivedDestLpId: string | null;
  /** R4-CL1: the received destination LP human-readable code (LP number). */
  receivedDestLpNumber: string | null;
  /** R4-CL1: the received destination LP quantity, as a decimal string. */
  receivedQty: string | null;
};

type TransferOrder = {
  id: string;
  toNumber: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  status: string;
  scheduledDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type TransferOrderDetail = TransferOrder & { lines: TransferOrderLine[] };
type TransferOrderError = ProcurementError | 'last_line';
type TransferOrderResult<T> = { ok: true; data: T } | { ok: false; error: TransferOrderError; code?: TransferOrderError; message?: string };
type TransferOrderListResult =
  | { ok: true; data: TransferOrder[]; archivedCount: number }
  | { ok: false; error: ProcurementError; message?: string };

const UpdateTransferOrderInput = z.object({
  id: uuidSchema,
  fromWarehouseId: uuidSchema.optional(),
  toWarehouseId: uuidSchema.optional(),
  expectedDate: dateSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});

const AddTransferOrderLineInput = z.object({
  toId: uuidSchema,
  itemId: uuidSchema,
  quantity: numeric3Schema,
  uom: z.string().trim().min(1).max(32),
  notes: z.string().trim().max(2000).optional(),
});

const UpdateTransferOrderLineInput = z.object({
  toId: uuidSchema,
  lineId: uuidSchema,
  quantity: numeric3Schema.optional(),
  uom: z.string().trim().min(1).max(32).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const DeleteTransferOrderLineInput = z.object({
  toId: uuidSchema,
  lineId: uuidSchema,
});

function mapTransferOrder(row: TransferOrderRow): TransferOrder {
  return {
    id: row.id,
    toNumber: row.to_number,
    fromWarehouseId: row.from_warehouse_id,
    toWarehouseId: row.to_warehouse_id,
    status: row.status,
    scheduledDate: row.scheduled_date,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapLine(row: TransferOrderLineRow): TransferOrderLine {
  return {
    id: row.id,
    toId: row.to_id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    qty: String(row.qty),
    uom: row.uom,
    lineNo: Number(row.line_no),
    receivedDestLpId: row.received_dest_lp_id ?? null,
    receivedDestLpNumber: row.received_dest_lp_number ?? null,
    receivedQty: row.received_qty == null ? null : String(row.received_qty),
  };
}

async function fetchLines(client: QueryClient, toId: string): Promise<TransferOrderLine[]> {
  // The transfer_order_line_lps link carries the received destination LP per line
  // (one received LP per line in the current receive flow — the same row
  // reverseToReceiveLine loads). LEFT JOIN keeps not-yet-received lines visible
  // with null LP fields. dst.quantity is the received qty the reversal action
  // validates against (it must equal the link qty).
  const { rows } = await client.query<TransferOrderLineRow>(
    `select l.id, l.to_id, l.item_id, i.item_code, i.name as item_name,
            l.qty::text as qty, l.uom, l.line_no,
            tll.dest_lp_id::text as received_dest_lp_id,
            dst.lp_number as received_dest_lp_number,
            dst.quantity::text as received_qty
       from public.transfer_order_lines l
       left join public.items i on i.org_id = app.current_org_id() and i.id = l.item_id
       left join public.transfer_order_line_lps tll
         on tll.org_id = app.current_org_id()
        and tll.to_id = l.to_id
        and tll.to_line_id = l.id
        and tll.dest_lp_id is not null
       left join public.license_plates dst
         on dst.org_id = app.current_org_id()
        and dst.id = tll.dest_lp_id
      where l.org_id = app.current_org_id()
        and l.to_id = $1::uuid
      order by l.line_no asc`,
    [toId],
  );
  return rows.map(mapLine);
}

async function fetchDraftTransferOrderForUpdate(client: QueryClient, toId: string): Promise<TransferOrderRow | null> {
  const { rows } = await client.query<TransferOrderRow>(
    `select id, to_number, from_warehouse_id, to_warehouse_id, status,
            scheduled_date::text as scheduled_date, notes, created_at, updated_at
       from public.transfer_orders
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1
      for update`,
    [toId],
  );
  return rows[0] ?? null;
}

async function ensureWarehouseInOrg(client: QueryClient, warehouseId: string): Promise<boolean> {
  const { rows } = await client.query<{ id: string }>(
    `select id
       from public.warehouses
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [warehouseId],
  );
  return rows.length > 0;
}

async function ensureItemInOrg(client: QueryClient, itemId: string): Promise<boolean> {
  const { rows } = await client.query<{ id: string }>(
    `select id
       from public.items
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [itemId],
  );
  return rows.length > 0;
}

async function denseRenumberTransferOrderLines(client: QueryClient, toId: string): Promise<void> {
  await client.query(
    `with numbered as (
       select id, row_number() over (order by line_no asc, created_at asc, id asc)::integer as next_line_no
         from public.transfer_order_lines
        where org_id = app.current_org_id()
          and to_id = $1::uuid
     )
     update public.transfer_order_lines l
        set line_no = numbered.next_line_no
       from numbered
      where l.org_id = app.current_org_id()
        and l.id = numbered.id
        and l.line_no is distinct from numbered.next_line_no`,
    [toId],
  );
}

export async function listTransferOrders(params: unknown = {}): Promise<TransferOrderListResult> {
  const input = (params ?? {}) as { status?: unknown; q?: unknown; limit?: unknown; archived?: unknown };
  const status = typeof input.status === 'string' ? TransferOrderStatusSchema.safeParse(input.status) : null;
  if (status && !status.success) return { ok: false, error: 'invalid_input' };
  const q = typeof input.q === 'string' && input.q.trim() ? input.q.trim() : null;
  const limit = typeof input.limit === 'number' && Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 200) : 100;
  const archived = input.archived === true;

  try {
    return await withOrgContext(async ({ client }): Promise<TransferOrderListResult> => {
      const { rows } = await (client as QueryClient).query<TransferOrderRow>(
        `select transfer_orders.id, transfer_orders.to_number, transfer_orders.from_warehouse_id,
                transfer_orders.to_warehouse_id, transfer_orders.status,
                transfer_orders.scheduled_date::text as scheduled_date, transfer_orders.notes,
                transfer_orders.created_at, transfer_orders.updated_at
           from public.transfer_orders transfer_orders
           left join public.org_document_settings ods
             on ods.org_id = transfer_orders.org_id
            and ods.doc_type = 'to'
          where transfer_orders.org_id = app.current_org_id()
            and ($1::text is null or transfer_orders.status = $1)
            and ($2::text is null or transfer_orders.to_number ilike '%' || $2 || '%')
            and coalesce(
              (
                transfer_orders.status in ('received', 'cancelled')
                and ods.archive_after_days is not null
                and transfer_orders.updated_at < now() - make_interval(days => ods.archive_after_days)
              ),
              false
            ) = $4::boolean
          order by transfer_orders.scheduled_date asc nulls last, transfer_orders.to_number asc
          limit $3::integer`,
        [status?.success ? status.data : null, q, limit, archived],
      );
      const count = await (client as QueryClient).query<{ archived_count: string | number }>(
        `select count(*) as archived_count
           from public.transfer_orders transfer_orders
           left join public.org_document_settings ods
             on ods.org_id = transfer_orders.org_id
            and ods.doc_type = 'to'
          where transfer_orders.org_id = app.current_org_id()
            and ($1::text is null or transfer_orders.status = $1)
            and ($2::text is null or transfer_orders.to_number ilike '%' || $2 || '%')
            and transfer_orders.status in ('received', 'cancelled')
            and ods.archive_after_days is not null
            and transfer_orders.updated_at < now() - make_interval(days => ods.archive_after_days)`,
        [status?.success ? status.data : null, q],
      );
      return { ok: true, data: rows.map(mapTransferOrder), archivedCount: Number(count.rows[0]?.archived_count ?? 0) };
    });
  } catch (err) {
    console.error('[planning/transfer-orders] listTransferOrders failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getTransferOrder(id: string): Promise<TransferOrderResult<TransferOrderDetail>> {
  try {
    return await withOrgContext(async ({ client }): Promise<TransferOrderResult<TransferOrderDetail>> => {
      const c = client as QueryClient;
      const { rows } = await c.query<TransferOrderRow>(
        `select id, to_number, from_warehouse_id, to_warehouse_id, status,
                scheduled_date::text as scheduled_date, notes, created_at, updated_at
           from public.transfer_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [id],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      return { ok: true, data: { ...mapTransferOrder(row), lines: await fetchLines(c, id) } };
    });
  } catch (err) {
    console.error('[planning/transfer-orders] getTransferOrder failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createTransferOrder(rawInput: unknown): Promise<TransferOrderResult<TransferOrderDetail>> {
  const parsed = TransferOrderCreateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TransferOrderResult<TransferOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      async function insertHeader(toNumber: string) {
        return ctx.client.query<TransferOrderRow>(
          `insert into public.transfer_orders
             (org_id, to_number, from_warehouse_id, to_warehouse_id, status, scheduled_date, notes, created_by, updated_by)
           values
             (app.current_org_id(), $1, $2::uuid, $3::uuid, $4, $5::date, $6, $7::uuid, $7::uuid)
           returning id, to_number, from_warehouse_id, to_warehouse_id, status,
                     scheduled_date::text as scheduled_date, notes, created_at, updated_at`,
          [
            toNumber,
            input.fromWarehouseId ?? null,
            input.toWarehouseId ?? null,
            input.status,
            input.scheduledDate ?? null,
            input.notes ?? null,
            userId,
          ],
        );
      }

      const initialToNumber = input.toNumber ?? (await nextDocumentNumber(ctx.client, orgId, 'to', new Date()));
      let insertResult: Awaited<ReturnType<typeof insertHeader>>;
      try {
        insertResult = await insertHeader(initialToNumber);
      } catch (error) {
        if (input.toNumber || !isPgError(error) || error.code !== '23505') throw error;
        insertResult = await insertHeader(await nextDocumentNumber(ctx.client, orgId, 'to', new Date()));
      }

      const { rows } = insertResult;
      const header = rows[0];
      if (!header) return { ok: false, error: 'persistence_failed' };

      for (const line of input.lines) {
        await ctx.client.query(
          `insert into public.transfer_order_lines
             (org_id, to_id, item_id, qty, uom, line_no, created_by, updated_by)
           values
             (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5::integer, $6::uuid, $6::uuid)`,
          [header.id, line.itemId, line.qty, line.uom, line.lineNo, userId],
        );
      }

      await writeProcurementAudit(ctx, {
        action: 'planning.transfer_order.created',
        resourceType: 'transfer_order',
        resourceId: header.id,
        afterState: { toNumber: header.to_number, status: header.status, lineCount: input.lines.length },
      });
      return { ok: true, data: { ...mapTransferOrder(header), lines: await fetchLines(ctx.client, header.id) } };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/transfer-orders] createTransferOrder failed', err);
    return { ok: false, error };
  }
}

export async function updateTransferOrder(rawInput: unknown): Promise<TransferOrderResult<TransferOrder>> {
  const parsed = UpdateTransferOrderInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TransferOrderResult<TransferOrder>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const previous = await fetchDraftTransferOrderForUpdate(ctx.client, input.id);
      if (!previous) return { ok: false, error: 'not_found' };
      if (previous.status !== 'draft') return { ok: false, error: 'invalid_state' };

      const nextFromWarehouseId = input.fromWarehouseId ?? previous.from_warehouse_id;
      const nextToWarehouseId = input.toWarehouseId ?? previous.to_warehouse_id;
      if (input.fromWarehouseId && !(await ensureWarehouseInOrg(ctx.client, input.fromWarehouseId))) {
        return { ok: false, error: 'forbidden' };
      }
      if (input.toWarehouseId && !(await ensureWarehouseInOrg(ctx.client, input.toWarehouseId))) {
        return { ok: false, error: 'forbidden' };
      }
      if (nextFromWarehouseId && nextToWarehouseId && nextFromWarehouseId === nextToWarehouseId) {
        return { ok: false, error: 'invalid_input' };
      }

      const updated = await ctx.client.query<TransferOrderRow>(
        `update public.transfer_orders
            set from_warehouse_id = $2::uuid,
                to_warehouse_id = $3::uuid,
                scheduled_date = $4::date,
                notes = $5,
                updated_by = $6::uuid,
                updated_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'draft'
        returning id, to_number, from_warehouse_id, to_warehouse_id, status,
                  scheduled_date::text as scheduled_date, notes, created_at, updated_at`,
        [
          input.id,
          nextFromWarehouseId,
          nextToWarehouseId,
          input.expectedDate ?? previous.scheduled_date,
          input.notes ?? previous.notes,
          userId,
        ],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, error: 'invalid_state' };

      await writeProcurementAudit(ctx, {
        action: 'planning.transfer_order.updated',
        resourceType: 'transfer_order',
        resourceId: row.id,
        beforeState: {
          fromWarehouseId: previous.from_warehouse_id,
          toWarehouseId: previous.to_warehouse_id,
          scheduledDate: previous.scheduled_date,
          notes: previous.notes,
        },
        afterState: {
          fromWarehouseId: row.from_warehouse_id,
          toWarehouseId: row.to_warehouse_id,
          scheduledDate: row.scheduled_date,
          notes: row.notes,
        },
      });
      return { ok: true, data: mapTransferOrder(row) };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/transfer-orders] updateTransferOrder failed', err);
    return { ok: false, error };
  }
}

export async function addTransferOrderLine(id: string, rawInput: unknown): Promise<TransferOrderResult<TransferOrderDetail>> {
  const parsed = AddTransferOrderLineInput.safeParse({ ...(rawInput as Record<string, unknown>), toId: id });
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TransferOrderResult<TransferOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const header = await fetchDraftTransferOrderForUpdate(ctx.client, input.toId);
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status !== 'draft') return { ok: false, error: 'invalid_state' };
      if (!(await ensureItemInOrg(ctx.client, input.itemId))) return { ok: false, error: 'forbidden' };

      await denseRenumberTransferOrderLines(ctx.client, input.toId);
      async function insertLine() {
        const next = await ctx.client.query<{ line_no: number }>(
          `select coalesce(max(line_no), 0) + 1 as line_no
             from public.transfer_order_lines
            where org_id = app.current_org_id()
              and to_id = $1::uuid`,
          [input.toId],
        );
        return ctx.client.query(
          `insert into public.transfer_order_lines
             (org_id, to_id, item_id, qty, uom, line_no, created_by, updated_by)
           values
             (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5::integer, $6::uuid, $6::uuid)`,
          [input.toId, input.itemId, input.quantity, input.uom, next.rows[0]?.line_no ?? 1, userId],
        );
      }
      try {
        await insertLine();
      } catch (error) {
        if (!isPgError(error) || error.code !== '23505') throw error;
        await denseRenumberTransferOrderLines(ctx.client, input.toId);
        await insertLine();
      }

      await writeProcurementAudit(ctx, {
        action: 'planning.transfer_order.line_added',
        resourceType: 'transfer_order',
        resourceId: input.toId,
        afterState: { itemId: input.itemId, quantity: input.quantity, uom: input.uom, notes: input.notes ?? null },
      });
      return { ok: true, data: { ...mapTransferOrder(header), lines: await fetchLines(ctx.client, input.toId) } };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/transfer-orders] addTransferOrderLine failed', err);
    return { ok: false, error };
  }
}

export async function updateTransferOrderLine(
  id: string,
  lineId: string,
  rawInput: unknown,
): Promise<TransferOrderResult<TransferOrderDetail>> {
  const parsed = UpdateTransferOrderLineInput.safeParse({ ...(rawInput as Record<string, unknown>), toId: id, lineId });
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TransferOrderResult<TransferOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const header = await fetchDraftTransferOrderForUpdate(ctx.client, input.toId);
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status !== 'draft') return { ok: false, error: 'invalid_state' };

      const current = await ctx.client.query<{ id: string; qty: string; uom: string }>(
        `select id, qty::text as qty, uom
           from public.transfer_order_lines
          where org_id = app.current_org_id()
            and to_id = $1::uuid
            and id = $2::uuid
          limit 1
          for update`,
        [input.toId, input.lineId],
      );
      const previous = current.rows[0];
      if (!previous) return { ok: false, error: 'not_found' };

      const updated = await ctx.client.query(
        `update public.transfer_order_lines l
            set qty = $3::numeric,
                uom = $4,
                updated_by = $5::uuid,
                updated_at = now()
           from public.transfer_orders t
          where l.org_id = app.current_org_id()
            and t.org_id = app.current_org_id()
            and t.id = l.to_id
            and t.id = $1::uuid
            and t.status = 'draft'
            and l.id = $2::uuid`,
        [input.toId, input.lineId, input.quantity ?? previous.qty, input.uom ?? previous.uom, userId],
      );
      if ((updated.rowCount ?? 0) === 0) return { ok: false, error: 'invalid_state' };

      await writeProcurementAudit(ctx, {
        action: 'planning.transfer_order.line_updated',
        resourceType: 'transfer_order',
        resourceId: input.toId,
        beforeState: { lineId: input.lineId, quantity: previous.qty, uom: previous.uom },
        afterState: {
          lineId: input.lineId,
          quantity: input.quantity ?? previous.qty,
          uom: input.uom ?? previous.uom,
          notes: input.notes ?? null,
        },
      });
      return { ok: true, data: { ...mapTransferOrder(header), lines: await fetchLines(ctx.client, input.toId) } };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/transfer-orders] updateTransferOrderLine failed', err);
    return { ok: false, error };
  }
}

export async function deleteTransferOrderLine(id: string, lineId: string): Promise<TransferOrderResult<TransferOrderDetail>> {
  const parsed = DeleteTransferOrderLineInput.safeParse({ toId: id, lineId });
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TransferOrderResult<TransferOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const header = await fetchDraftTransferOrderForUpdate(ctx.client, input.toId);
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status !== 'draft') return { ok: false, error: 'invalid_state' };

      const lines = await ctx.client.query<{ id: string }>(
        `select id
           from public.transfer_order_lines
          where org_id = app.current_org_id()
            and to_id = $1::uuid
          order by line_no asc, id asc
          for update`,
        [input.toId],
      );
      if (!lines.rows.some((line) => line.id === input.lineId)) return { ok: false, error: 'not_found' };
      if (lines.rows.length <= 1) return { ok: false, error: 'last_line', code: 'last_line' };

      const deleted = await ctx.client.query(
        `delete from public.transfer_order_lines l
          using public.transfer_orders t
          where l.org_id = app.current_org_id()
            and t.org_id = app.current_org_id()
            and t.id = l.to_id
            and t.id = $1::uuid
            and t.status = 'draft'
            and l.id = $2::uuid`,
        [input.toId, input.lineId],
      );
      if ((deleted.rowCount ?? 0) === 0) return { ok: false, error: 'invalid_state' };
      await denseRenumberTransferOrderLines(ctx.client, input.toId);

      await writeProcurementAudit(ctx, {
        action: 'planning.transfer_order.line_deleted',
        resourceType: 'transfer_order',
        resourceId: input.toId,
        beforeState: { lineId: input.lineId },
      });
      return { ok: true, data: { ...mapTransferOrder(header), lines: await fetchLines(ctx.client, input.toId) } };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/transfer-orders] deleteTransferOrderLine failed', err);
    return { ok: false, error };
  }
}

// Server-side state machine for TO status. Terminal states (received, cancelled)
// have no legal successors. Re-validated server-side so a forged/stale request
// can never apply an illegal jump.
const TO_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['in_transit', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  partially_received: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

// ─── NUMERIC-exact decimal helpers (scale 6 — license_plates quantity) ─────────
// LP quantities never round-trip through a JS float: text in, bigint micro-units
// for arithmetic, text out.
const QTY_SCALE = 1_000_000n;

function toMicro6(decimal: string): bigint {
  const neg = decimal.startsWith('-');
  const body = neg ? decimal.slice(1) : decimal;
  const [intPart, fracRaw = ''] = body.split('.');
  const frac = (fracRaw + '000000').slice(0, 6);
  const micro = BigInt(intPart || '0') * QTY_SCALE + BigInt(frac || '0');
  return neg ? -micro : micro;
}

function microToText6(micro: bigint): string {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const frac = (abs % QTY_SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  const out = frac ? `${abs / QTY_SCALE}.${frac}` : `${abs / QTY_SCALE}`;
  return neg && abs !== 0n ? `-${out}` : out;
}

type ToHeaderForUpdate = {
  id: string;
  to_number: string;
  status: string;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
};

type SourceLpRow = {
  id: string;
  quantity: string;
  reserved_qty: string;
  location_id: string | null;
};

type PlannedPick = {
  lineId: string;
  lineNo: number;
  lpId: string;
  lpLocationId: string | null;
  takeMicro: bigint;
  newQtyMicro: bigint;
  uom: string;
};

/**
 * SHIP (draft → in_transit) — W9-K-II / F-C05. Real stock leaves the source:
 *   1. Validate FIRST, write after — sum of pickable stock (status 'available',
 *      qa_status 'released', matching uom, available = quantity - reserved_qty)
 *      at from_warehouse must cover every line, else 'insufficient_stock' and
 *      NOTHING is written (withOrgContext commits even on ok:false returns).
 *   2. Pick FEFO (expiry asc NULLS LAST, lp_number asc) with row locks.
 *   3. Decrement each picked LP; full depletion → status 'shipped' (+ ledger row).
 *   4. Record every pick in transfer_order_line_lps (source_lp_id + qty) — the
 *      in-transit truth that receive() materializes at the destination.
 *   5. stock_moves row per pick (move_type 'transfer', from = LP's location).
 */
async function shipTransferOrder(
  ctx: OrgActionContext,
  to: ToHeaderForUpdate,
): Promise<{ ok: true; pickCount: number } | { ok: false; error: ProcurementError; message?: string }> {
  if (!to.from_warehouse_id) {
    return { ok: false, error: 'invalid_state', message: 'from_warehouse_required' };
  }

  const lines = await ctx.client.query<{ id: string; item_id: string; qty: string; uom: string; line_no: number }>(
    `select id, item_id, qty::text as qty, uom, line_no
       from public.transfer_order_lines
      where org_id = app.current_org_id()
        and to_id = $1::uuid
      order by line_no asc
      for update`,
    [to.id],
  );
  if (lines.rows.length === 0) {
    return { ok: false, error: 'invalid_state', message: 'no_lines' };
  }

  // Phase 1 — plan all picks (locks the candidate LPs), no writes yet.
  const picks: PlannedPick[] = [];
  for (const line of lines.rows) {
    const lps = await ctx.client.query<SourceLpRow>(
      `select id, quantity::text as quantity, reserved_qty::text as reserved_qty, location_id
         from public.license_plates
        where org_id = app.current_org_id()
          and warehouse_id = $1::uuid
          and product_id = $2::uuid
          and uom = $3
          and status = 'available'
          and qa_status = 'released'
          and (quantity - reserved_qty) > 0
        order by expiry_date asc nulls last, lp_number asc
        for update`,
      [to.from_warehouse_id, line.item_id, line.uom],
    );

    let remaining = toMicro6(line.qty);
    for (const lp of lps.rows) {
      if (remaining <= 0n) break;
      const availableMicro = toMicro6(lp.quantity) - toMicro6(lp.reserved_qty);
      if (availableMicro <= 0n) continue;
      const take = availableMicro < remaining ? availableMicro : remaining;
      picks.push({
        lineId: line.id,
        lineNo: line.line_no,
        lpId: lp.id,
        lpLocationId: lp.location_id,
        takeMicro: take,
        newQtyMicro: toMicro6(lp.quantity) - take,
        uom: line.uom,
      });
      remaining -= take;
    }
    if (remaining > 0n) {
      return {
        ok: false,
        error: 'insufficient_stock',
        message: `line ${line.line_no}: short by ${microToText6(remaining)} ${line.uom} at source warehouse`,
      };
    }
  }

  // Phase 2 — apply the plan (all-or-nothing inside the withOrgContext txn).
  for (const pick of picks) {
    const fullyDepleted = pick.newQtyMicro === 0n;
    await ctx.client.query(
      `update public.license_plates
          set quantity = $2::numeric,
              status = case when $3::boolean then 'shipped' else status end,
              updated_by = $4::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [pick.lpId, microToText6(pick.newQtyMicro), fullyDepleted, ctx.userId],
    );
    if (fullyDepleted) {
      await ctx.client.query(
        `insert into public.lp_state_history
           (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
         values (app.current_org_id(), $1::uuid, 'available', 'shipped', 'transfer_ship',
                 $2, $3::uuid, jsonb_build_object('to_id', $4::uuid), $5::uuid)
         on conflict (org_id, transaction_id) do nothing`,
        [pick.lpId, `TO ship ${to.to_number}`, randomUUID(), to.id, ctx.userId],
      );
    }
    const moveTxn = randomUUID();
    await ctx.client.query(
      `insert into public.stock_moves
         (org_id, move_number, lp_id, move_type, from_location_id, to_location_id,
          quantity, uom, reason_text, transaction_id, created_by, updated_by)
       values (app.current_org_id(), $1, $2::uuid, 'transfer', $3::uuid, null,
               $4::numeric, $5, $6, $7::uuid, $8::uuid, $8::uuid)
       on conflict (org_id, transaction_id) do nothing`,
      [
        makeStockMoveNumber(moveTxn),
        pick.lpId,
        pick.lpLocationId,
        microToText6(pick.takeMicro),
        pick.uom,
        `TO ship ${to.to_number}`,
        moveTxn,
        ctx.userId,
      ],
    );
    await ctx.client.query(
      `insert into public.transfer_order_line_lps
         (org_id, to_id, to_line_id, source_lp_id, qty, uom, created_by, updated_by)
       values (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5, $6::uuid, $6::uuid)`,
      [to.id, pick.lineId, pick.lpId, microToText6(pick.takeMicro), pick.uom, ctx.userId],
    );
  }

  return { ok: true, pickCount: picks.length };
}

/**
 * RECEIVE (in_transit → received) — W9-K-II / F-C05. Stock appears at the
 * destination for real: every transfer_order_line_lps row (dest_lp_id null)
 * materializes as a NEW destination LP at to_warehouse:
 *   - origin 'transfer', parent_lp_id = source LP (genealogy chain across sites);
 *   - batch/expiry/shelf-life snapshot carried over from the source LP;
 *   - status 'available' + qa_status carried from the source: ship only picks
 *     qa 'released' stock, and an internal transfer is not a new QA event, so
 *     the goods stay released and pickable (NOT re-quarantined) — deliberate
 *     contrast with GRN/production LPs which are born received/pending;
 *   - location = destination warehouse's default (first by level, code);
 *   - stock_moves 'transfer' row into that location + genesis ledger row.
 */
async function receiveTransferOrder(
  ctx: OrgActionContext,
  to: ToHeaderForUpdate,
): Promise<{ ok: true; lpCount: number } | { ok: false; error: ProcurementError; message?: string }> {
  if (!to.to_warehouse_id) {
    return { ok: false, error: 'invalid_state', message: 'to_warehouse_required' };
  }
  const destLocationId = await resolveDefaultLocation(ctx.client, to.to_warehouse_id);

  const pending = await ctx.client.query<{
    id: string;
    source_lp_id: string;
    qty: string;
    uom: string;
    product_id: string;
    batch_number: string | null;
    supplier_batch_number: string | null;
    expiry_date: string | null;
    best_before_date: string | null;
    shelf_life_mode_snapshot: string | null;
    qa_status: string;
  }>(
    `select tll.id, tll.source_lp_id, tll.qty::text as qty, tll.uom,
            lp.product_id, lp.batch_number, lp.supplier_batch_number,
            lp.expiry_date, lp.best_before_date, lp.shelf_life_mode_snapshot, lp.qa_status
       from public.transfer_order_line_lps tll
       join public.license_plates lp
         on lp.org_id = app.current_org_id()
        and lp.id = tll.source_lp_id
      where tll.org_id = app.current_org_id()
        and tll.to_id = $1::uuid
        and tll.dest_lp_id is null
      order by tll.created_at asc, tll.id asc
      for update of tll`,
    [to.id],
  );

  for (const row of pending.rows) {
    const lpNumber = makeLpNumber();
    const inserted = await ctx.client.query<{ id: string }>(
      `insert into public.license_plates (
         org_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
         status, qa_status, batch_number, supplier_batch_number,
         expiry_date, best_before_date, shelf_life_mode_snapshot,
         origin, parent_lp_id, ext_jsonb, created_by, updated_by
       )
       values (
         app.current_org_id(), $1::uuid, $2::uuid, $3, $4::uuid, $5::numeric, $6,
         'available', $7, $8, $9,
         $10::timestamptz, $11::timestamptz, $12,
         'transfer', $13::uuid, jsonb_build_object('transfer_order_id', $14::uuid), $15::uuid, $15::uuid
       )
       returning id`,
      [
        to.to_warehouse_id,
        destLocationId,
        lpNumber,
        row.product_id,
        row.qty,
        row.uom,
        row.qa_status,
        row.batch_number,
        row.supplier_batch_number,
        row.expiry_date,
        row.best_before_date,
        row.shelf_life_mode_snapshot,
        row.source_lp_id,
        to.id,
        ctx.userId,
      ],
    );
    const destLp = inserted.rows[0];
    if (!destLp) return { ok: false, error: 'persistence_failed' };

    await ctx.client.query(
      `insert into public.lp_state_history
         (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
       values (app.current_org_id(), $1::uuid, null, 'available', 'transfer_receive',
               $2, $3::uuid, jsonb_build_object('to_id', $4::uuid, 'source_lp_id', $5::uuid), $6::uuid)
       on conflict (org_id, transaction_id) do nothing`,
      [destLp.id, `TO receive ${to.to_number}`, randomUUID(), to.id, row.source_lp_id, ctx.userId],
    );
    const moveTxn = randomUUID();
    await ctx.client.query(
      `insert into public.stock_moves
         (org_id, move_number, lp_id, move_type, from_location_id, to_location_id,
          quantity, uom, reason_text, transaction_id, created_by, updated_by)
       values (app.current_org_id(), $1, $2::uuid, 'transfer', null, $3::uuid,
               $4::numeric, $5, $6, $7::uuid, $8::uuid, $8::uuid)
       on conflict (org_id, transaction_id) do nothing`,
      [makeStockMoveNumber(moveTxn), destLp.id, destLocationId, row.qty, row.uom, `TO receive ${to.to_number}`, moveTxn, ctx.userId],
    );
    await ctx.client.query(
      `update public.transfer_order_line_lps
          set dest_lp_id = $2::uuid,
              updated_by = $3::uuid
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [row.id, destLp.id, ctx.userId],
    );
  }

  return { ok: true, lpCount: pending.rows.length };
}

/**
 * CANCEL while in transit — reverse the ship for rows that have not been
 * received yet: restore each source LP's quantity (un-deplete 'shipped' →
 * 'available') and drop the un-received linkage rows. Received destination LPs
 * must be handled by reverseToReceiveLine before the final cancel path is used.
 */
async function cancelInTransitTransferOrder(
  ctx: OrgActionContext,
  to: ToHeaderForUpdate,
): Promise<{ ok: true }> {
  const pending = await ctx.client.query<{ id: string; source_lp_id: string; qty: string; lp_quantity: string; lp_status: string }>(
    `select tll.id, tll.source_lp_id, tll.qty::text as qty,
            lp.quantity::text as lp_quantity, lp.status as lp_status
       from public.transfer_order_line_lps tll
       join public.license_plates lp
         on lp.org_id = app.current_org_id()
        and lp.id = tll.source_lp_id
      where tll.org_id = app.current_org_id()
        and tll.to_id = $1::uuid
        and tll.dest_lp_id is null
      order by tll.created_at asc, tll.id asc
      for update`,
    [to.id],
  );

  for (const row of pending.rows) {
    const restored = microToText6(toMicro6(row.lp_quantity) + toMicro6(row.qty));
    const unDeplete = row.lp_status === 'shipped';
    await ctx.client.query(
      `update public.license_plates
          set quantity = $2::numeric,
              status = case when $3::boolean then 'available' else status end,
              updated_by = $4::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [row.source_lp_id, restored, unDeplete, ctx.userId],
    );
    if (unDeplete) {
      await ctx.client.query(
        `insert into public.lp_state_history
           (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
         values (app.current_org_id(), $1::uuid, 'shipped', 'available', 'transfer_cancel',
                 $2, $3::uuid, jsonb_build_object('to_id', $4::uuid), $5::uuid)
         on conflict (org_id, transaction_id) do nothing`,
        [row.source_lp_id, `TO cancel ${to.to_number}`, randomUUID(), to.id, ctx.userId],
      );
    }
    await ctx.client.query(
      `delete from public.transfer_order_line_lps
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [row.id],
    );
  }
  return { ok: true };
}

export async function transitionTransferOrderStatus(id: string, status: string): Promise<TransferOrderResult<TransferOrder>> {
  const parsed = TransferOrderStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TransferOrderResult<TransferOrder>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      // FOR UPDATE: serialize concurrent transitions of the same TO — the loser
      // re-reads a terminal/changed status and fails the state-machine guard
      // instead of double-shipping / double-receiving.
      const before = await ctx.client.query<ToHeaderForUpdate>(
        `select id, to_number, status, from_warehouse_id, to_warehouse_id
           from public.transfer_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1
          for update`,
        [id],
      );
      const previous = before.rows[0];
      if (!previous) return { ok: false, error: 'not_found' };

      // Guard the transition server-side against the legal state machine.
      const allowed = TO_TRANSITIONS[previous.status] ?? [];
      if (!allowed.includes(parsed.data)) return { ok: false, error: 'invalid_state' };

      // W9-K-II (F-C05): status flips carry REAL stock movements now.
      let stockEffect: Record<string, unknown> = {};
      if (previous.status === 'draft' && parsed.data === 'in_transit') {
        const shipped = await shipTransferOrder(ctx, previous);
        if (!shipped.ok) return shipped;
        stockEffect = { picks: shipped.pickCount };
      } else if (previous.status === 'in_transit' && parsed.data === 'received') {
        const received = await receiveTransferOrder(ctx, previous);
        if (!received.ok) return received;
        stockEffect = { destLps: received.lpCount };
      } else if (['in_transit', 'partially_received'].includes(previous.status) && parsed.data === 'cancelled') {
        // F3 / Wave R4: a TO with already-received destination LPs must NOT be cancelled
        // directly — the received stock has to be reversed first via reverseToReceiveLine
        // (the "Reverse receipt" action on TO detail). Cancelling directly would orphan
        // already-received goods from a cancelled document. Only un-received lines may be
        // unwound here (source stock restored).
        const receivedCheck = await ctx.client.query<{ received_count: string }>(
          `select count(*)::text as received_count
             from public.transfer_order_line_lps
            where org_id = app.current_org_id()
              and to_id = $1::uuid
              and dest_lp_id is not null`,
          [previous.id],
        );
        if (Number(receivedCheck.rows[0]?.received_count ?? '0') > 0) {
          return {
            ok: false,
            error: 'partially_received',
            message:
              'Transfer order has already-received destination stock; cancel is not allowed. Receive the remainder or reverse the received LPs first.',
          };
        }
        await cancelInTransitTransferOrder(ctx, previous);
        stockEffect = { restored: true };
      } else if (previous.status === 'partially_received' && parsed.data === 'received') {
        const received = await receiveTransferOrder(ctx, previous);
        if (!received.ok) return received;
        stockEffect = { destLps: received.lpCount };
      }

      const { rows } = await ctx.client.query<TransferOrderRow>(
        `update public.transfer_orders
            set status = $2,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id, to_number, from_warehouse_id, to_warehouse_id, status,
                  scheduled_date::text as scheduled_date, notes, created_at, updated_at`,
        [id, parsed.data, userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      await writeProcurementAudit(ctx, {
        action: 'planning.transfer_order.status_changed',
        resourceType: 'transfer_order',
        resourceId: row.id,
        beforeState: { status: previous.status },
        afterState: { status: row.status, ...stockEffect },
      });
      return { ok: true, data: mapTransferOrder(row) };
    });
  } catch (err) {
    console.error('[planning/transfer-orders] transitionTransferOrderStatus failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
