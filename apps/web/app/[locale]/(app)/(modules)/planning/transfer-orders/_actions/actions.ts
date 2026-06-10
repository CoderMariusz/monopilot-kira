'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  TransferOrderCreateInput,
  TransferOrderStatusSchema,
  hasPlanningWritePermission,
  pgErrorToResult,
  toIso,
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
type TransferOrderResult<T> = { ok: true; data: T } | { ok: false; error: ProcurementError; message?: string };

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
  };
}

async function fetchLines(client: QueryClient, toId: string): Promise<TransferOrderLine[]> {
  const { rows } = await client.query<TransferOrderLineRow>(
    `select l.id, l.to_id, l.item_id, i.item_code, i.name as item_name,
            l.qty::text as qty, l.uom, l.line_no
       from public.transfer_order_lines l
       left join public.items i on i.org_id = app.current_org_id() and i.id = l.item_id
      where l.org_id = app.current_org_id()
        and l.to_id = $1::uuid
      order by l.line_no asc`,
    [toId],
  );
  return rows.map(mapLine);
}

export async function listTransferOrders(params: unknown = {}): Promise<TransferOrderResult<TransferOrder[]>> {
  const input = (params ?? {}) as { status?: unknown; q?: unknown; limit?: unknown };
  const status = typeof input.status === 'string' ? TransferOrderStatusSchema.safeParse(input.status) : null;
  if (status && !status.success) return { ok: false, error: 'invalid_input' };
  const q = typeof input.q === 'string' && input.q.trim() ? input.q.trim() : null;
  const limit = typeof input.limit === 'number' && Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 200) : 100;

  try {
    return await withOrgContext(async ({ client }): Promise<TransferOrderResult<TransferOrder[]>> => {
      const { rows } = await (client as QueryClient).query<TransferOrderRow>(
        `select id, to_number, from_warehouse_id, to_warehouse_id, status,
                scheduled_date::text as scheduled_date, notes, created_at, updated_at
           from public.transfer_orders
          where org_id = app.current_org_id()
            and ($1::text is null or status = $1)
            and ($2::text is null or to_number ilike '%' || $2 || '%')
          order by scheduled_date asc nulls last, to_number asc
          limit $3::integer`,
        [status?.success ? status.data : null, q, limit],
      );
      return { ok: true, data: rows.map(mapTransferOrder) };
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

      const { rows } = await ctx.client.query<TransferOrderRow>(
        `insert into public.transfer_orders
           (org_id, to_number, from_warehouse_id, to_warehouse_id, status, scheduled_date, notes, created_by, updated_by)
         values
           (app.current_org_id(), $1, $2::uuid, $3::uuid, $4, $5::date, $6, $7::uuid, $7::uuid)
         returning id, to_number, from_warehouse_id, to_warehouse_id, status,
                   scheduled_date::text as scheduled_date, notes, created_at, updated_at`,
        [
          input.toNumber,
          input.fromWarehouseId ?? null,
          input.toWarehouseId ?? null,
          input.status,
          input.scheduledDate ?? null,
          input.notes ?? null,
          userId,
        ],
      );
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

export async function transitionTransferOrderStatus(id: string, status: string): Promise<TransferOrderResult<TransferOrder>> {
  const parsed = TransferOrderStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TransferOrderResult<TransferOrder>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const before = await ctx.client.query<{ status: string }>(
        `select status from public.transfer_orders where org_id = app.current_org_id() and id = $1::uuid limit 1`,
        [id],
      );
      const previous = before.rows[0];
      if (!previous) return { ok: false, error: 'not_found' };

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
        afterState: { status: row.status },
      });
      return { ok: true, data: mapTransferOrder(row) };
    });
  } catch (err) {
    console.error('[planning/transfer-orders] transitionTransferOrderStatus failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
