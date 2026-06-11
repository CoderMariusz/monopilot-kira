'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { nextDocumentNumber } from '../../../../../../../lib/documents/numbering';
import {
  PurchaseOrderCreateInput,
  PurchaseOrderStatusSchema,
  hasPlanningWritePermission,
  isPgError,
  pgErrorToResult,
  toIso,
  writeProcurementAudit,
  type OrgActionContext,
  type ProcurementError,
  type QueryClient,
} from '../../_actions/procurement-shared';

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_code: string | null;
  supplier_name: string | null;
  status: string;
  expected_delivery: string | null;
  currency: string;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type PurchaseOrderLineRow = {
  id: string;
  po_id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  qty: string;
  uom: string;
  unit_price: string;
  line_no: number;
};

type PurchaseOrderLine = {
  id: string;
  poId: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  unitPrice: string;
  lineNo: number;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierCode: string | null;
  supplierName: string | null;
  status: string;
  expectedDelivery: string | null;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type PurchaseOrderDetail = PurchaseOrder & { lines: PurchaseOrderLine[] };
type PurchaseOrderResult<T> = { ok: true; data: T } | { ok: false; error: ProcurementError; message?: string };
type PurchaseOrderListResult =
  | { ok: true; data: PurchaseOrder[]; archivedCount: number }
  | { ok: false; error: ProcurementError; message?: string };

function mapPurchaseOrder(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    poNumber: row.po_number,
    supplierId: row.supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    status: row.status,
    expectedDelivery: row.expected_delivery,
    currency: row.currency,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapLine(row: PurchaseOrderLineRow): PurchaseOrderLine {
  return {
    id: row.id,
    poId: row.po_id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    qty: String(row.qty),
    uom: row.uom,
    unitPrice: String(row.unit_price),
    lineNo: Number(row.line_no),
  };
}

async function fetchLines(client: QueryClient, poId: string): Promise<PurchaseOrderLine[]> {
  const { rows } = await client.query<PurchaseOrderLineRow>(
    `select l.id, l.po_id, l.item_id, i.item_code, i.name as item_name,
            l.qty::text as qty, l.uom, l.unit_price::text as unit_price, l.line_no
       from public.purchase_order_lines l
       left join public.items i on i.org_id = app.current_org_id() and i.id = l.item_id
      where l.org_id = app.current_org_id()
        and l.po_id = $1::uuid
      order by l.line_no asc`,
    [poId],
  );
  return rows.map(mapLine);
}

export async function listPurchaseOrders(params: unknown = {}): Promise<PurchaseOrderListResult> {
  const input = (params ?? {}) as { status?: unknown; q?: unknown; limit?: unknown; archived?: unknown };
  const status = typeof input.status === 'string' ? PurchaseOrderStatusSchema.safeParse(input.status) : null;
  if (status && !status.success) return { ok: false, error: 'invalid_input' };
  const q = typeof input.q === 'string' && input.q.trim() ? input.q.trim() : null;
  const limit = typeof input.limit === 'number' && Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 200) : 100;
  const archived = input.archived === true;

  try {
    return await withOrgContext(async ({ client }): Promise<PurchaseOrderListResult> => {
      const { rows } = await (client as QueryClient).query<PurchaseOrderRow>(
        `select po.id, po.po_number, po.supplier_id, s.code as supplier_code, s.name as supplier_name,
                po.status, po.expected_delivery::text as expected_delivery, po.currency, po.notes,
                po.created_at, po.updated_at
           from public.purchase_orders po
           left join public.suppliers s on s.org_id = app.current_org_id() and s.id = po.supplier_id
           left join public.org_document_settings ods
             on ods.org_id = po.org_id
            and ods.doc_type = 'po'
          where po.org_id = app.current_org_id()
            and ($1::text is null or po.status = $1)
            and ($2::text is null or po.po_number ilike '%' || $2 || '%' or s.code ilike '%' || $2 || '%')
            and coalesce(
              (
                po.status in ('received', 'cancelled')
                and ods.archive_after_days is not null
                and po.updated_at < now() - make_interval(days => ods.archive_after_days)
              ),
              false
            ) = $4::boolean
          order by po.expected_delivery asc nulls last, po.po_number asc
          limit $3::integer`,
        [status?.success ? status.data : null, q, limit, archived],
      );
      const count = await (client as QueryClient).query<{ archived_count: string | number }>(
        `select count(*) as archived_count
           from public.purchase_orders po
           left join public.suppliers s on s.org_id = app.current_org_id() and s.id = po.supplier_id
           left join public.org_document_settings ods
             on ods.org_id = po.org_id
            and ods.doc_type = 'po'
          where po.org_id = app.current_org_id()
            and ($1::text is null or po.status = $1)
            and ($2::text is null or po.po_number ilike '%' || $2 || '%' or s.code ilike '%' || $2 || '%')
            and po.status in ('received', 'cancelled')
            and ods.archive_after_days is not null
            and po.updated_at < now() - make_interval(days => ods.archive_after_days)`,
        [status?.success ? status.data : null, q],
      );
      return { ok: true, data: rows.map(mapPurchaseOrder), archivedCount: Number(count.rows[0]?.archived_count ?? 0) };
    });
  } catch (err) {
    console.error('[planning/purchase-orders] listPurchaseOrders failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderResult<PurchaseOrderDetail>> {
  try {
    return await withOrgContext(async ({ client }): Promise<PurchaseOrderResult<PurchaseOrderDetail>> => {
      const c = client as QueryClient;
      const { rows } = await c.query<PurchaseOrderRow>(
        `select po.id, po.po_number, po.supplier_id, s.code as supplier_code, s.name as supplier_name,
                po.status, po.expected_delivery::text as expected_delivery, po.currency, po.notes,
                po.created_at, po.updated_at
           from public.purchase_orders po
           left join public.suppliers s on s.org_id = app.current_org_id() and s.id = po.supplier_id
          where po.org_id = app.current_org_id()
            and po.id = $1::uuid
          limit 1`,
        [id],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      return { ok: true, data: { ...mapPurchaseOrder(row), lines: await fetchLines(c, id) } };
    });
  } catch (err) {
    console.error('[planning/purchase-orders] getPurchaseOrder failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createPurchaseOrder(rawInput: unknown): Promise<PurchaseOrderResult<PurchaseOrderDetail>> {
  const parsed = PurchaseOrderCreateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      async function insertHeader(poNumber: string) {
        return ctx.client.query<PurchaseOrderRow>(
          `insert into public.purchase_orders
             (org_id, po_number, supplier_id, status, expected_delivery, currency, notes, created_by, updated_by)
           values
             (app.current_org_id(), $1, $2::uuid, $3, $4::date, $5, $6, $7::uuid, $7::uuid)
           returning id, po_number, supplier_id, null::text as supplier_code, null::text as supplier_name,
                     status, expected_delivery::text as expected_delivery, currency, notes, created_at, updated_at`,
          [
            poNumber,
            input.supplierId,
            input.status,
            input.expectedDelivery ?? null,
            input.currency,
            input.notes ?? null,
            userId,
          ],
        );
      }

      const initialPoNumber = input.poNumber ?? (await nextDocumentNumber(ctx.client, orgId, 'po', new Date()));
      let insertResult: Awaited<ReturnType<typeof insertHeader>>;
      try {
        insertResult = await insertHeader(initialPoNumber);
      } catch (error) {
        if (input.poNumber || !isPgError(error) || error.code !== '23505') throw error;
        insertResult = await insertHeader(await nextDocumentNumber(ctx.client, orgId, 'po', new Date()));
      }

      const { rows } = insertResult;
      const header = rows[0];
      if (!header) return { ok: false, error: 'persistence_failed' };

      for (const line of input.lines) {
        await ctx.client.query(
          `insert into public.purchase_order_lines
             (org_id, po_id, item_id, qty, uom, unit_price, line_no, created_by, updated_by)
           values
             (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5::numeric, $6::integer, $7::uuid, $7::uuid)`,
          [header.id, line.itemId, line.qty, line.uom, line.unitPrice, line.lineNo, userId],
        );
      }

      await writeProcurementAudit(ctx, {
        action: 'planning.purchase_order.created',
        resourceType: 'purchase_order',
        resourceId: header.id,
        afterState: { poNumber: header.po_number, status: header.status, lineCount: input.lines.length },
      });
      return { ok: true, data: { ...mapPurchaseOrder(header), lines: await fetchLines(ctx.client, header.id) } };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/purchase-orders] createPurchaseOrder failed', err);
    return { ok: false, error };
  }
}

// Server-side state machine for PO status. Terminal states (received, cancelled)
// have no legal successors. The client surfaces only legal transitions, but we
// re-validate here so a forged/stale request can never apply an illegal jump.
const PO_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export async function transitionPurchaseOrderStatus(id: string, status: string): Promise<PurchaseOrderResult<PurchaseOrder>> {
  const parsed = PurchaseOrderStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrder>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const before = await ctx.client.query<{ status: string }>(
        `select status from public.purchase_orders where org_id = app.current_org_id() and id = $1::uuid limit 1`,
        [id],
      );
      const previous = before.rows[0];
      if (!previous) return { ok: false, error: 'not_found' };

      // Guard the transition server-side against the legal state machine.
      const allowed = PO_TRANSITIONS[previous.status] ?? [];
      if (!allowed.includes(parsed.data)) return { ok: false, error: 'invalid_state' };

      const { rows } = await ctx.client.query<PurchaseOrderRow>(
        `update public.purchase_orders
            set status = $2,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id, po_number, supplier_id, null::text as supplier_code, null::text as supplier_name,
                  status, expected_delivery::text as expected_delivery, currency, notes, created_at, updated_at`,
        [id, parsed.data, userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      await writeProcurementAudit(ctx, {
        action: 'planning.purchase_order.status_changed',
        resourceType: 'purchase_order',
        resourceId: row.id,
        beforeState: { status: previous.status },
        afterState: { status: row.status },
      });
      return { ok: true, data: mapPurchaseOrder(row) };
    });
  } catch (err) {
    console.error('[planning/purchase-orders] transitionPurchaseOrderStatus failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
