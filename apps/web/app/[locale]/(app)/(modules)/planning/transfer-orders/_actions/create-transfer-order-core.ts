import { z } from 'zod';

import { nextDocumentNumber } from '../../../../../../../lib/documents/numbering';
import {
  TransferOrderCreateInput,
  requireActionPermission,
  PLANNING_TO_MANAGE_PERMISSION,
  isPgError,
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
  receivedDestLpId: string | null;
  receivedDestLpNumber: string | null;
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

export type TransferOrderDetail = TransferOrder & { lines: TransferOrderLine[] };

export type TransferOrderError = ProcurementError | 'last_line';

export type TransferOrderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: TransferOrderError; code?: TransferOrderError; message?: string };

export const CreateTransferOrderInput = TransferOrderCreateInput;

export type CreateTransferOrderInputType = z.infer<typeof CreateTransferOrderInput>;

export type CreateTransferOrderCoreContext = OrgActionContext;

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
  const { rows } = await client.query<TransferOrderLineRow>(
    `select l.id, l.to_id, l.item_id, i.item_code, i.name as item_name,
            l.qty::text as qty, l.uom, l.line_no,
            null::text as received_dest_lp_id,
            null::text as received_dest_lp_number,
            null::text as received_qty,
            false as can_reverse,
            null::text as reverse_block_reason
       from public.transfer_order_lines l
       left join public.items i on i.org_id = app.current_org_id() and i.id = l.item_id
      where l.org_id = app.current_org_id()
        and l.to_id = $1::uuid
      order by l.line_no asc`,
    [toId],
  );
  return rows.map(mapLine);
}

export async function createTransferOrderCore(
  ctx: CreateTransferOrderCoreContext,
  input: CreateTransferOrderInputType,
): Promise<TransferOrderResult<TransferOrderDetail>> {
  const { userId, orgId } = ctx;
  const perm = await requireActionPermission(ctx, PLANNING_TO_MANAGE_PERMISSION);
  if (!perm.ok) return perm;

  const fromWarehouseId = input.fromWarehouseId ?? null;
  const toWarehouseId = input.toWarehouseId ?? null;
  if (fromWarehouseId != null && toWarehouseId != null && fromWarehouseId === toWarehouseId) {
    return { ok: false, error: 'same_warehouse' };
  }

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
}
