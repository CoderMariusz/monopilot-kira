'use server';

import { randomUUID } from 'node:crypto';

import { assertNoActiveHoldForLp } from '@monopilot/server/quality/holdsGuard.js';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import { resolveWriteSiteId } from '../../../../../../../lib/site/site-context';
import {
  DEFAULT_TO_LIST_PAGE_SIZE,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../../lib/shared/pagination';
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
  requireActionPermission,
  PLANNING_TO_MANAGE_PERMISSION,
  isPgError,
  numeric6PositiveSchema,
  normalizeProcurementLine,
  pgErrorToResult,
  toIso,
  uuidSchema,
  writeProcurementAudit,
  type OrgActionContext,
  type ProcurementError,
  type QueryClient,
} from '../../_actions/procurement-shared';
import { createTransferOrderCore } from './create-transfer-order-core';
import {
  assertAllLinesFullyReceived,
  assertTransferOrderMatterConserved,
  loadTransferOrderItemUoms,
  loadTransferOrderLineReceiveState,
  resolveTransferOrderStatusFromLines,
  snapshotTransferOrderMatterBalance,
  TransferOrderConservationError,
} from './to-conservation';
import {
  baseMicro6ToQty,
  qtyToBaseMicro6,
  type TransferItemUomRow,
} from './transfer-uom-base';

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
  can_reverse: boolean;
  reverse_block_reason: string | null;
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
  canReverse: boolean;
  reverseBlockReason: string | null;
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
  | {
      ok: true;
      data: TransferOrder[];
      pagination: PaginatedResult<TransferOrder>;
      archivedCount: number;
      statusCounts: ToStatusCounts;
    }
  | { ok: false; error: ProcurementError; message?: string };

const TO_LIST_STATUSES = ['draft', 'in_transit', 'partially_received', 'received', 'cancelled'] as const;
export type ToListStatus = (typeof TO_LIST_STATUSES)[number];
export type ToStatusCounts = Record<ToListStatus, number> & { all: number };

function buildToStatusCounts(rows: Array<{ status: string; n: number }>): ToStatusCounts {
  const counts = TO_LIST_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<ToListStatus, number>,
  );
  let all = 0;
  for (const row of rows) {
    const key = row.status.toLowerCase();
    if ((TO_LIST_STATUSES as readonly string[]).includes(key)) {
      counts[key as ToListStatus] = row.n;
      all += row.n;
    }
  }
  return { ...counts, all };
}

const TO_LIST_FILTER_WHERE = `
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
              ) = $3::boolean`;

const TO_LIST_FROM = `from public.transfer_orders transfer_orders
           left join public.org_document_settings ods
             on ods.org_id = transfer_orders.org_id
            and ods.doc_type = 'to'`;

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
  quantity: numeric6PositiveSchema,
  uom: z.string().trim().min(1).max(32),
  notes: z.string().trim().max(2000).optional(),
});

const UpdateTransferOrderLineInput = z.object({
  toId: uuidSchema,
  lineId: uuidSchema,
  quantity: numeric6PositiveSchema.optional(),
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
    canReverse: row.can_reverse === true,
    reverseBlockReason: row.reverse_block_reason ?? null,
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
            dst.quantity::text as received_qty,
            coalesce((
              t.status in ('received', 'partially_received', 'in_transit')
              and tll.dest_lp_id is not null
              and src.id is not null
              and dst.id is not null
              and tll.qty = dst.quantity
              and dst.reserved_qty = 0::numeric
              and cardinality(coalesce(lp_blockers.blockers, array[]::text[])) = 0
            ), false) as can_reverse,
            case
              when tll.dest_lp_id is null then null
              when t.status not in ('received', 'partially_received', 'in_transit')
                then 'Transfer order status does not allow reversal.'
              when src.id is null or dst.id is null
                then 'Received pallet link is no longer reversible.'
              when tll.qty <> dst.quantity
                then 'Reverse quantity must equal the received destination pallet quantity.'
              when dst.reserved_qty <> 0::numeric
                then 'Destination pallet has reserved quantity and cannot be reversed.'
              when cardinality(coalesce(lp_blockers.blockers, array[]::text[])) > 0
                then 'Destination pallet cannot be reversed because it has ' || array_to_string(lp_blockers.blockers, ', ') || '.'
              else null
            end as reverse_block_reason
       from public.transfer_order_lines l
       join public.transfer_orders t
         on t.org_id = app.current_org_id()
        and t.id = l.to_id
       left join public.items i on i.org_id = app.current_org_id() and i.id = l.item_id
       left join public.transfer_order_line_lps tll
         on tll.org_id = app.current_org_id()
        and tll.to_id = l.to_id
        and tll.to_line_id = l.id
        and tll.dest_lp_id is not null
       left join public.license_plates src
         on src.org_id = app.current_org_id()
        and src.id = tll.source_lp_id
       left join public.license_plates dst
         on dst.org_id = app.current_org_id()
        and dst.id = tll.dest_lp_id
       left join lateral (
         select array_remove(array[
           case when exists (
             select 1
               from public.inventory_allocations ia
              where ia.org_id = app.current_org_id()
                and ia.license_plate_id = tll.dest_lp_id
           ) then 'allocations'::text end,
           case when exists (
             select 1
               from public.shipment_box_contents sbc
              where sbc.org_id = app.current_org_id()
                and sbc.license_plate_id = tll.dest_lp_id
           ) or (dst.status = 'shipped' or dst.source_so_id is not null)
           then 'outbound_shipments'::text end,
           case when exists (
             select 1
               from public.wo_material_consumption wmc
              where wmc.org_id = app.current_org_id()
                and wmc.lp_id = tll.dest_lp_id
                and wmc.correction_of_id is null
                and not exists (
                  select 1
                    from public.wo_material_consumption correction
                   where correction.org_id = wmc.org_id
                     and correction.correction_of_id = wmc.id
                )
           ) then 'consumed_wo_inputs'::text end
         ], null) as blockers
       ) lp_blockers on tll.dest_lp_id is not null
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

function revalidateTransferOrderPaths(toId: string): void {
  try {
    revalidateLocalized('/planning/transfer-orders');
    revalidateLocalized(`/planning/transfer-orders/${toId}`);
  } catch (err) {
    if (process.env.VITEST) return;
    throw err;
  }
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
  const input = (params ?? {}) as {
    status?: unknown;
    q?: unknown;
    page?: unknown;
    offset?: unknown;
    limit?: unknown;
    archived?: unknown;
  };
  const status = typeof input.status === 'string' ? TransferOrderStatusSchema.safeParse(input.status) : null;
  if (status && !status.success) return { ok: false, error: 'invalid_input' };
  const q = typeof input.q === 'string' && input.q.trim() ? input.q.trim() : null;
  const archived = input.archived === true;
  const page = normalizePage({
    page: typeof input.page === 'number' ? input.page : undefined,
    offset: typeof input.offset === 'number' ? input.offset : undefined,
    limit: typeof input.limit === 'number' ? input.limit : undefined,
    defaultLimit: DEFAULT_TO_LIST_PAGE_SIZE,
    maxLimit: 200,
  });

  try {
    return await withOrgContext(async ({ client }): Promise<TransferOrderListResult> => {
      const listParams = [status?.success ? status.data : null, q, archived] as const;
      const countParams = [null, q, archived] as const;

      const [countResult, dataResult, statusCountResult] = await Promise.all([
        (client as QueryClient).query<{ total: number }>(
          `select count(*)::int as total
             ${TO_LIST_FROM}
            ${TO_LIST_FILTER_WHERE}`,
          [...listParams],
        ),
        (client as QueryClient).query<TransferOrderRow>(
          `select transfer_orders.id, transfer_orders.to_number, transfer_orders.from_warehouse_id,
                  transfer_orders.to_warehouse_id, transfer_orders.status,
                  transfer_orders.scheduled_date::text as scheduled_date, transfer_orders.notes,
                  transfer_orders.created_at, transfer_orders.updated_at
             ${TO_LIST_FROM}
            ${TO_LIST_FILTER_WHERE}
            order by transfer_orders.scheduled_date asc nulls last, transfer_orders.to_number asc, transfer_orders.id asc
            limit $4::integer offset $5::integer`,
          [...listParams, page.limit, page.offset],
        ),
        (client as QueryClient).query<{ status: string; n: number }>(
          `select transfer_orders.status, count(*)::int as n
             ${TO_LIST_FROM}
            ${TO_LIST_FILTER_WHERE}
            group by transfer_orders.status`,
          [...countParams],
        ),
      ]);
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
      const rows = dataResult.rows.map(mapTransferOrder);
      const pagination = toPaginatedResult(rows, Number(countResult.rows[0]?.total ?? 0), page);
      return {
        ok: true,
        data: pagination.items,
        pagination,
        archivedCount: Number(count.rows[0]?.archived_count ?? 0),
        statusCounts: buildToStatusCounts(statusCountResult.rows),
      };
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
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<TransferOrderResult<TransferOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      return createTransferOrderCore(ctx, input);
    });
    if (result.ok) revalidateTransferOrderPaths(result.data.id);
    return result;
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
    // Revalidate after withOrgContext commits (same as create) so refresh cannot
    // race an uncommitted UPDATE.
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<TransferOrderResult<TransferOrder>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const perm = await requireActionPermission(ctx, PLANNING_TO_MANAGE_PERMISSION);
      if (!perm.ok) return perm;

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
                notes = case when $7::boolean then nullif($5, '') else notes end,
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
          input.notes ?? null,
          userId,
          input.notes !== undefined,
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
    if (result.ok) revalidateTransferOrderPaths(result.data.id);
    return result;
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
      const perm = await requireActionPermission(ctx, PLANNING_TO_MANAGE_PERMISSION);
      if (!perm.ok) return perm;

      const header = await fetchDraftTransferOrderForUpdate(ctx.client, input.toId);
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status !== 'draft') return { ok: false, error: 'invalid_state' };
      if (!(await ensureItemInOrg(ctx.client, input.itemId))) return { ok: false, error: 'forbidden' };
      const normalizedLine = await normalizeProcurementLine(ctx.client, {
        itemId: input.itemId,
        quantity: input.quantity,
        uom: input.uom,
      });
      if (!normalizedLine) {
        return {
          ok: false,
          error: 'line_uom_not_convertible',
          code: 'line_uom_not_convertible',
        };
      }
      // Zawężenie z guardu nie sięga do ciała deklaracji funkcji poniżej — przypinamy je aliasem.
      const line = normalizedLine;

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
          [
            input.toId,
            input.itemId,
            line.quantity,
            line.uom,
            next.rows[0]?.line_no ?? 1,
            userId,
          ],
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
        afterState: {
          itemId: input.itemId,
          quantity: normalizedLine.quantity,
          uom: normalizedLine.uom,
          notes: input.notes ?? null,
        },
      });
      revalidateTransferOrderPaths(input.toId);
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
      const perm = await requireActionPermission(ctx, PLANNING_TO_MANAGE_PERMISSION);
      if (!perm.ok) return perm;

      const header = await fetchDraftTransferOrderForUpdate(ctx.client, input.toId);
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status !== 'draft') return { ok: false, error: 'invalid_state' };

      const current = await ctx.client.query<{ id: string; item_id: string; qty: string; uom: string }>(
        `select id, item_id::text, qty::text as qty, uom
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

      const normalizedLine =
        input.quantity !== undefined || input.uom !== undefined
          ? await normalizeProcurementLine(ctx.client, {
              itemId: previous.item_id,
              quantity: input.quantity ?? previous.qty,
              uom: input.uom ?? previous.uom,
            })
          : null;
      if ((input.quantity !== undefined || input.uom !== undefined) && !normalizedLine) {
        return {
          ok: false,
          error: 'line_uom_not_convertible',
          code: 'line_uom_not_convertible',
        };
      }

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
        [
          input.toId,
          input.lineId,
          normalizedLine?.quantity ?? previous.qty,
          normalizedLine?.uom ?? previous.uom,
          userId,
        ],
      );
      if ((updated.rowCount ?? 0) === 0) return { ok: false, error: 'invalid_state' };

      await writeProcurementAudit(ctx, {
        action: 'planning.transfer_order.line_updated',
        resourceType: 'transfer_order',
        resourceId: input.toId,
        beforeState: { lineId: input.lineId, quantity: previous.qty, uom: previous.uom },
        afterState: {
          lineId: input.lineId,
          quantity: normalizedLine?.quantity ?? previous.qty,
          uom: normalizedLine?.uom ?? previous.uom,
          notes: input.notes ?? null,
        },
      });
      revalidateTransferOrderPaths(input.toId);
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
      const perm = await requireActionPermission(ctx, PLANNING_TO_MANAGE_PERMISSION);
      if (!perm.ok) return perm;

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
      revalidateTransferOrderPaths(input.toId);
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
  lp_number: string;
  quantity: string;
  reserved_qty: string;
  location_id: string | null;
  uom: string;
};

type SkippedHeldLp = { lpId: string; lpCode: string; qty: string; uom: string };

type PlannedPick = {
  lineId: string;
  lineNo: number;
  itemId: string;
  lpId: string;
  lpLocationId: string | null;
  /** Quantity removed from the source LP (LP native UoM, micro-6). */
  takeLpMicro: bigint;
  lpUom: string;
  /** Quantity recorded on the in-transit junction row (item base UoM, micro-6). */
  recordMicro: bigint;
  recordUom: string;
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
): Promise<{ ok: true; pickCount: number; skippedHeldLps: SkippedHeldLp[] } | { ok: false; error: ProcurementError; message?: string; heldQty?: string }> {
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

  const itemIds = [...new Set(lines.rows.map((row) => row.item_id))];
  const itemRows = await ctx.client.query<TransferItemUomRow>(
    `select i.id::text as id,
            i.uom_base,
            i.net_qty_per_each::text as net_qty_per_each,
            i.each_per_box::text as each_per_box
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = any($1::uuid[])`,
    [itemIds],
  );
  const itemById = new Map(itemRows.rows.map((row) => [row.id, row]));

  // Phase 1 — plan all picks (locks the candidate LPs), no writes yet.
  // C058: shadow LP quantity across ALL lines — duplicate-product lines must not
  // each plan against the pre-ship DB quantity independently.
  // PF-R10-01: convertible UoMs (e.g. kg LP + g line) are normalized to item base
  // at micro-6 before allocation and materialization.
  const picks: PlannedPick[] = [];
  const normalizedLines = new Map<string, { quantity: string; uom: string }>();
  const skippedHeldLps: SkippedHeldLp[] = [];
  const lpQtyShadow = new Map<string, bigint>();
  for (const line of lines.rows) {
    const item = itemById.get(line.item_id);
    if (!item) {
      return { ok: false, error: 'invalid_state', message: `line ${line.line_no}: item_not_found` };
    }
    const lineNeedBase = qtyToBaseMicro6(item, line.qty, line.uom);
    if (lineNeedBase === null) {
      return {
        ok: false,
        error: 'invalid_state',
        message: `line ${line.line_no}: unconvertible_uom ${line.uom}`,
      };
    }
    normalizedLines.set(line.id, {
      quantity: microToText6(lineNeedBase),
      uom: item.uom_base,
    });

    const lps = await ctx.client.query<SourceLpRow>(
      `select lp.id, lp.lp_number, lp.quantity::text as quantity, lp.reserved_qty::text as reserved_qty,
              lp.location_id, lp.uom
         from public.license_plates lp
        where lp.org_id = app.current_org_id()
          and lp.warehouse_id = $1::uuid
          and lp.product_id = $2::uuid
          and lp.status = 'available'
          and lp.qa_status = 'released'
          and (lp.quantity - lp.reserved_qty) > 0
        order by lp.expiry_date asc nulls last, lp.lp_number asc
        for update`,
      [to.from_warehouse_id, line.item_id],
    );

    let remainingBase = lineNeedBase;
    for (const lp of lps.rows) {
      if (remainingBase <= 0n) break;
      try {
        await assertNoActiveHoldForLp(lp.id, ctx.client);
      } catch (error) {
        if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'QA_HOLD_ACTIVE') {
          const shadowQty = lpQtyShadow.get(lp.id) ?? toMicro6(lp.quantity);
          const availableHeld = shadowQty - toMicro6(lp.reserved_qty);
          skippedHeldLps.push({
            lpId: lp.id,
            lpCode: lp.lp_number,
            qty: microToText6(availableHeld),
            uom: lp.uom,
          });
          continue;
        }
        throw error;
      }
      const currentLpQty = lpQtyShadow.get(lp.id) ?? toMicro6(lp.quantity);
      if (!lpQtyShadow.has(lp.id)) lpQtyShadow.set(lp.id, currentLpQty);
      const availableLpMicro = currentLpQty - toMicro6(lp.reserved_qty);
      if (availableLpMicro <= 0n) continue;
      const availableBase = qtyToBaseMicro6(item, microToText6(availableLpMicro), lp.uom);
      if (availableBase === null || availableBase <= 0n) continue;

      const takeBase = availableBase < remainingBase ? availableBase : remainingBase;
      const takeLpMicro = baseMicro6ToQty(item, takeBase, lp.uom);
      if (takeLpMicro === null || takeLpMicro <= 0n || takeBase <= 0n) {
        continue;
      }

      lpQtyShadow.set(lp.id, currentLpQty - takeLpMicro);
      picks.push({
        lineId: line.id,
        lineNo: line.line_no,
        itemId: line.item_id,
        lpId: lp.id,
        lpLocationId: lp.location_id,
        takeLpMicro,
        lpUom: lp.uom,
        recordMicro: takeBase,
        recordUom: item.uom_base,
      });
      remainingBase -= takeBase;
    }
    if (remainingBase > 0n) {
      return {
        ok: false,
        error: skippedHeldLps.length > 0 ? 'insufficient_stock_holds' : 'insufficient_stock',
        message: `line ${line.line_no}: short by ${microToText6(remainingBase)} ${item.uom_base} at source warehouse`,
        heldQty: skippedHeldLps.length > 0 ? microToText6(skippedHeldLps.reduce((acc, s) => acc + toMicro6(s.qty), 0n)) : undefined,
      };
    }
  }

  const lineTotalBase = lines.rows.reduce((acc, line) => {
    const item = itemById.get(line.item_id);
    if (!item) return acc;
    return acc + (qtyToBaseMicro6(item, line.qty, line.uom) ?? 0n);
  }, 0n);
  const pickTotalBase = picks.reduce((acc, pick) => {
    const item = itemById.get(pick.itemId);
    if (!item) return acc;
    return acc + (qtyToBaseMicro6(item, microToText6(pick.takeLpMicro), pick.lpUom) ?? 0n);
  }, 0n);
  if (lineTotalBase !== pickTotalBase) {
    throw new TransferOrderConservationError(
      `TO ship pick plan does not cover lines: planned ${microToText6(pickTotalBase)} ${itemById.values().next().value?.uom_base ?? 'base'}, required ${microToText6(lineTotalBase)}`,
    );
  }

  // Phase 2 — apply the plan (all-or-nothing inside the withOrgContext txn).
  for (const line of lines.rows) {
    const normalized = normalizedLines.get(line.id);
    if (!normalized) continue;
    if (toMicro6(line.qty) === toMicro6(normalized.quantity) && line.uom.toLowerCase() === normalized.uom.toLowerCase()) {
      continue;
    }
    await ctx.client.query(
      `update public.transfer_order_lines
          set qty = $2::numeric,
              uom = $3,
              updated_by = $4::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [line.id, normalized.quantity, normalized.uom, ctx.userId],
    );
  }

  const pickedLpIds = [...new Set(picks.map((pick) => pick.lpId))];
  for (const lpId of pickedLpIds) {
    const finalQtyMicro = lpQtyShadow.get(lpId);
    if (finalQtyMicro === undefined) continue;
    const fullyDepleted = finalQtyMicro === 0n;
    await ctx.client.query(
      `update public.license_plates
          set quantity = $2::numeric,
              status = case when $3::boolean then 'shipped' else status end,
              updated_by = $4::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [lpId, microToText6(finalQtyMicro), fullyDepleted, ctx.userId],
    );
    if (fullyDepleted) {
      await ctx.client.query(
        `insert into public.lp_state_history
           (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
         values (app.current_org_id(), $1::uuid, 'available', 'shipped', 'transfer_ship',
                 $2, $3::uuid, jsonb_build_object('to_id', $4::uuid), $5::uuid)
         on conflict (org_id, transaction_id) do nothing`,
        [lpId, `TO ship ${to.to_number}`, randomUUID(), to.id, ctx.userId],
      );
    }
  }
  for (const pick of picks) {
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
        microToText6(pick.takeLpMicro),
        pick.lpUom,
        `TO ship ${to.to_number}`,
        moveTxn,
        ctx.userId,
      ],
    );
    await ctx.client.query(
      `insert into public.transfer_order_line_lps
         (org_id, to_id, to_line_id, source_lp_id, qty, uom, created_by, updated_by)
       values (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5, $6::uuid, $6::uuid)`,
      [to.id, pick.lineId, pick.lpId, microToText6(pick.recordMicro), pick.recordUom, ctx.userId],
    );
  }

  return { ok: true, pickCount: picks.length, skippedHeldLps };
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
  const destWarehouse = await ctx.client.query<{ site_id: string | null }>(
    `select w.site_id::text as site_id
       from public.warehouses w
      where w.org_id = app.current_org_id()
        and w.id = $1::uuid
      limit 1`,
    [to.to_warehouse_id],
  );
  const siteResolution = await resolveWriteSiteId(
    ctx.client,
    destWarehouse.rows[0]?.site_id ?? null,
  );
  if (!siteResolution.ok) {
    return {
      ok: false,
      error: 'invalid_state',
      message:
        'No site could be resolved for the destination warehouse. Assign it in Settings -> Sites or select an active site in the top bar, then try again.',
    };
  }
  const destSiteId = siteResolution.siteId;

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
    uom_base: string;
    net_qty_per_each: string | null;
    each_per_box: string | null;
  }>(
    `select tll.id, tll.source_lp_id, tll.qty::text as qty, tll.uom,
            lp.product_id, lp.batch_number, lp.supplier_batch_number,
            lp.expiry_date, lp.best_before_date, lp.shelf_life_mode_snapshot, lp.qa_status,
            i.uom_base, i.net_qty_per_each::text as net_qty_per_each,
            i.each_per_box::text as each_per_box
       from public.transfer_order_line_lps tll
       join public.license_plates lp
         on lp.org_id = app.current_org_id()
        and lp.id = tll.source_lp_id
       join public.items i
         on i.org_id = app.current_org_id()
        and i.id = lp.product_id
      where tll.org_id = app.current_org_id()
        and tll.to_id = $1::uuid
        and tll.dest_lp_id is null
      order by tll.created_at asc, tll.id asc
      for update of tll`,
    [to.id],
  );

  const normalizedPending = pending.rows.map((row) => {
    const item: TransferItemUomRow = {
      id: row.product_id,
      uom_base: row.uom_base,
      net_qty_per_each: row.net_qty_per_each,
      each_per_box: row.each_per_box,
    };
    const quantityBase = qtyToBaseMicro6(item, row.qty, row.uom);
    if (quantityBase === null || quantityBase <= 0n) {
      throw new TransferOrderConservationError(
        `Cannot receive junction ${row.id}: ${row.qty} ${row.uom} is not convertible to ${row.uom_base}`,
      );
    }
    return {
      ...row,
      materializedQty: microToText6(quantityBase),
      materializedUom: row.uom_base,
    };
  });

  for (const row of normalizedPending) {
    const lpNumber = makeLpNumber();
    const inserted = await ctx.client.query<{ id: string }>(
      `insert into public.license_plates (
         org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
         status, qa_status, batch_number, supplier_batch_number,
         expiry_date, best_before_date, shelf_life_mode_snapshot,
         origin, parent_lp_id, ext_jsonb, created_by, updated_by
       )
       values (
         app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::numeric, $7,
         'available', $8, $9, $10,
         $11::timestamptz, $12::timestamptz, $13,
         'transfer', $14::uuid, jsonb_build_object('transfer_order_id', $15::uuid), $16::uuid, $16::uuid
       )
       returning id`,
      [
        destSiteId,
        to.to_warehouse_id,
        destLocationId,
        lpNumber,
        row.product_id,
        row.materializedQty,
        row.materializedUom,
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
      `insert into public.lp_genealogy (org_id, child_lp_id, parent_lp_id, relation_type, qty, uom)
       values (app.current_org_id(), $1::uuid, $2::uuid, 'derived', $3::numeric, $4)
       on conflict (org_id, child_lp_id, parent_lp_id, relation_type) do nothing`,
      [destLp.id, row.source_lp_id, row.materializedQty, row.materializedUom],
    );

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
      [
        makeStockMoveNumber(moveTxn),
        destLp.id,
        destLocationId,
        row.materializedQty,
        row.materializedUom,
        `TO receive ${to.to_number}`,
        moveTxn,
        ctx.userId,
      ],
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

  const lineState = await loadTransferOrderLineReceiveState(ctx, to.id);
  const receiveCheck = assertAllLinesFullyReceived(lineState);
  if (!receiveCheck.ok) {
    throw new TransferOrderConservationError(receiveCheck.message);
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
  const pending = await ctx.client.query<{
    id: string;
    source_lp_id: string;
    qty: string;
    junction_uom: string;
    item_id: string;
    uom_base: string;
    net_qty_per_each: string | null;
    each_per_box: string | null;
    lp_uom: string;
    lp_status: string;
    lp_location_id: string | null;
  }>(
    `select tll.id, tll.source_lp_id, tll.qty::text as qty, tll.uom as junction_uom,
            tol.item_id::text as item_id,
            i.uom_base, i.net_qty_per_each::text as net_qty_per_each, i.each_per_box::text as each_per_box,
            lp.uom as lp_uom, lp.status as lp_status, lp.location_id::text as lp_location_id
       from public.transfer_order_line_lps tll
       join public.transfer_order_lines tol
         on tol.org_id = tll.org_id
        and tol.id = tll.to_line_id
       join public.items i
         on i.org_id = tll.org_id
        and i.id = tol.item_id
       join public.license_plates lp
         on lp.org_id = app.current_org_id()
        and lp.id = tll.source_lp_id
      where tll.org_id = app.current_org_id()
        and tll.to_id = $1::uuid
        and tll.dest_lp_id is null
      order by tll.created_at asc, tll.id asc
      for update of tll, lp`,
    [to.id],
  );

  // C058: aggregate restore per source LP — duplicate-product lines can share one
  // source LP; restoring row-by-row using a stale join snapshot double-credits.
  // Junction qty is in line UoM; license_plates.quantity is in LP native UoM.
  const restoreBySourceLp = new Map<
    string,
    { restoreMicro: bigint; lpUom: string; locationId: string | null; linkIds: string[]; wasShipped: boolean }
  >();
  for (const row of pending.rows) {
    const item: TransferItemUomRow = {
      id: row.item_id,
      uom_base: row.uom_base,
      net_qty_per_each: row.net_qty_per_each,
      each_per_box: row.each_per_box,
    };
    const baseMicro = qtyToBaseMicro6(item, row.qty, row.junction_uom);
    const restoreLpMicro = baseMicro === null ? null : baseMicro6ToQty(item, baseMicro, row.lp_uom);
    if (restoreLpMicro === null) {
      throw new TransferOrderConservationError(
        `Cannot restore cancel qty for junction ${row.id}: ${row.qty} ${row.junction_uom} → LP ${row.lp_uom}`,
      );
    }
    const existing = restoreBySourceLp.get(row.source_lp_id);
    if (existing) {
      existing.restoreMicro += restoreLpMicro;
      existing.linkIds.push(row.id);
      existing.wasShipped = existing.wasShipped || row.lp_status === 'shipped';
    } else {
      restoreBySourceLp.set(row.source_lp_id, {
        restoreMicro: restoreLpMicro,
        lpUom: row.lp_uom,
        locationId: row.lp_location_id,
        linkIds: [row.id],
        wasShipped: row.lp_status === 'shipped',
      });
    }
  }

  for (const [sourceLpId, { restoreMicro, lpUom, locationId, linkIds, wasShipped }] of restoreBySourceLp) {
    const locked = await ctx.client.query<{ quantity: string; status: string }>(
      `select quantity::text as quantity, status
         from public.license_plates
        where org_id = app.current_org_id()
          and id = $1::uuid
        for update`,
      [sourceLpId],
    );
    const lpRow = locked.rows[0];
    if (!lpRow) continue;
    const restored = microToText6(toMicro6(lpRow.quantity) + restoreMicro);
    const unDeplete = wasShipped || lpRow.status === 'shipped';
    await ctx.client.query(
      `update public.license_plates
          set quantity = $2::numeric,
              status = case when $3::boolean then 'available' else status end,
              updated_by = $4::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [sourceLpId, restored, unDeplete, ctx.userId],
    );
    if (unDeplete) {
      await ctx.client.query(
        `insert into public.lp_state_history
           (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
         values (app.current_org_id(), $1::uuid, 'shipped', 'available', 'transfer_cancel',
                 $2, $3::uuid, jsonb_build_object('to_id', $4::uuid), $5::uuid)
         on conflict (org_id, transaction_id) do nothing`,
        [sourceLpId, `TO cancel ${to.to_number}`, randomUUID(), to.id, ctx.userId],
      );
    }
    const cancelMoveTxn = randomUUID();
    await ctx.client.query(
      `insert into public.stock_moves
         (org_id, move_number, lp_id, move_type, from_location_id, to_location_id,
          quantity, uom, reason_text, transaction_id, created_by, updated_by)
       values (app.current_org_id(), $1, $2::uuid, 'transfer', null, $3::uuid,
               $4::numeric, $5, $6, $7::uuid, $8::uuid, $8::uuid)
       on conflict (org_id, transaction_id) do nothing`,
      [
        makeStockMoveNumber(cancelMoveTxn),
        sourceLpId,
        locationId,
        microToText6(restoreMicro),
        lpUom,
        `TO cancel ${to.to_number}`,
        cancelMoveTxn,
        ctx.userId,
      ],
    );
    await ctx.client.query(
      `delete from public.transfer_order_line_lps
        where org_id = app.current_org_id()
          and id = any($1::uuid[])`,
      [linkIds],
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
      const perm = await requireActionPermission(ctx, PLANNING_TO_MANAGE_PERMISSION);
      if (!perm.ok) return perm;

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
      const toItemUoms = await loadTransferOrderItemUoms(ctx, previous.id);
      const matterBaseline = await snapshotTransferOrderMatterBalance(ctx, previous.id, toItemUoms);
      let stockEffect: Record<string, unknown> = {};
      let nextStatus = parsed.data;
      if (previous.status === 'draft' && parsed.data === 'in_transit') {
        const shipped = await shipTransferOrder(ctx, previous);
        if (!shipped.ok) return shipped;
        await assertTransferOrderMatterConserved(ctx, previous.id, toItemUoms, matterBaseline, 'ship');
        stockEffect = { picks: shipped.pickCount };
      } else if (
        (previous.status === 'in_transit' || previous.status === 'partially_received') &&
        parsed.data === 'received'
      ) {
        const received = await receiveTransferOrder(ctx, previous);
        if (!received.ok) return received;
        const conservationContext =
          previous.status === 'partially_received' ? 'receive_remainder' : 'receive';
        await assertTransferOrderMatterConserved(ctx, previous.id, toItemUoms, matterBaseline, conservationContext);
        stockEffect = { destLps: received.lpCount };
        nextStatus = 'received';
      } else if (['in_transit', 'partially_received'].includes(previous.status) && parsed.data === 'cancelled') {
        const linesBefore = await loadTransferOrderLineReceiveState(ctx, previous.id);
        const anyReceived = linesBefore.some((line) => line.receivedMicro > 0n);
        const anyPending = linesBefore.some((line) => line.pendingMicro > 0n);
        const shortWithoutAllocation = linesBefore.some(
          (line) => line.receivedMicro < line.lineMicro && line.pendingMicro === 0n,
        );
        if (shortWithoutAllocation) {
          return {
            ok: false,
            error: 'invalid_state',
            message:
              'No outstanding in-transit allocation to cancel. Receive the remainder or reverse receipts before closing.',
          };
        }
        if (anyPending) {
          await cancelInTransitTransferOrder(ctx, previous);
          await assertTransferOrderMatterConserved(
            ctx,
            previous.id,
            toItemUoms,
            matterBaseline,
            anyReceived ? 'cancel_remainder' : 'cancel',
          );
          stockEffect = anyReceived ? { remainderCancelled: true } : { restored: true };
        }
        nextStatus = resolveTransferOrderStatusFromLines(
          await loadTransferOrderLineReceiveState(ctx, previous.id),
        );
      }

      const { rows } = await ctx.client.query<TransferOrderRow>(
        `update public.transfer_orders
            set status = $2,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id, to_number, from_warehouse_id, to_warehouse_id, status,
                  scheduled_date::text as scheduled_date, notes, created_at, updated_at`,
        [id, nextStatus, userId],
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
      revalidateTransferOrderPaths(row.id);
      return { ok: true, data: mapTransferOrder(row) };
    });
  } catch (err) {
    if (err instanceof TransferOrderConservationError) {
      console.error('[planning/transfer-orders] transitionTransferOrderStatus conservation failed', err);
      const incompleteReceive = err.message.includes('not fully received');
      return {
        ok: false,
        error: incompleteReceive ? 'invalid_state' : 'persistence_failed',
        message: err.message,
      };
    }
    console.error('[planning/transfer-orders] transitionTransferOrderStatus failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
