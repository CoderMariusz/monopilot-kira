'use server';

import { z } from 'zod';

import { getActiveSiteId } from '../../../../../../../lib/site/site-context';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import {
  DEFAULT_PO_LIST_PAGE_SIZE,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../../lib/shared/pagination';
import {
  PurchaseOrderStatusSchema,
  hasPlanningWritePermission,
  hasPlanningReadPermission,
  isPgError,
  numeric3Schema,
  numeric4Schema,
  pgErrorToResult,
  toIso,
  uuidSchema,
  writeProcurementAudit,
  type OrgActionContext,
  type ProcurementError,
  type QueryClient,
} from '../../_actions/procurement-shared';
import {
  CreatePurchaseOrderInput,
  createPurchaseOrderCore,
} from './create-purchase-order-core';

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_code: string | null;
  supplier_name: string | null;
  destination_warehouse_id?: string | null;
  destination_warehouse_name?: string | null;
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
  received_qty: string | null;
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
  /** Sum of grn_items.received_qty for this PO line (non-cancelled GRNs). */
  receivedQty: string;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierCode: string | null;
  supplierName: string | null;
  destinationWarehouseId: string | null;
  destinationWarehouseName: string | null;
  status: string;
  expectedDelivery: string | null;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type PurchaseOrderDetail = PurchaseOrder & { lines: PurchaseOrderLine[] };
type PurchaseOrderError = ProcurementError | 'last_line' | 'po_has_receipts' | 'po_open_quantity' | 'no_active_site' | 'ambiguous_site' | 'supplier_blocked';
type PurchaseOrderResult<T> = { ok: true; data: T } | { ok: false; error: PurchaseOrderError; code?: PurchaseOrderError; message?: string };
type PurchaseOrderListResult =
  | { ok: true; data: PurchaseOrder[]; pagination: PaginatedResult<PurchaseOrder>; archivedCount: number }
  | { ok: false; error: ProcurementError; message?: string };

const PO_LIST_FROM = `
           from public.purchase_orders po
           left join public.suppliers s on s.org_id = app.current_org_id() and s.id = po.supplier_id
           left join public.warehouses w on w.org_id = app.current_org_id() and w.id = po.destination_warehouse_id
           left join public.org_document_settings ods
             on ods.org_id = po.org_id
            and ods.doc_type = 'po'`;

const UpdatePurchaseOrderInput = z.object({
  id: uuidSchema,
  supplierId: uuidSchema.optional(),
  expectedDelivery: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Invalid date')
    .optional(),
  currency: z.string().trim().length(3).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const AddPurchaseOrderLineInput = z.object({
  poId: uuidSchema,
  itemId: uuidSchema,
  qty: numeric3Schema,
  uom: z.string().trim().min(1).max(32),
  unitPrice: numeric4Schema,
});

const UpdatePurchaseOrderLineInput = z.object({
  poId: uuidSchema,
  lineId: uuidSchema,
  qty: numeric3Schema.optional(),
  uom: z.string().trim().min(1).max(32).optional(),
  unitPrice: numeric4Schema.optional(),
});

const DeletePurchaseOrderLineInput = z.object({
  poId: uuidSchema,
  lineId: uuidSchema,
});

function mapPurchaseOrder(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    poNumber: row.po_number,
    supplierId: row.supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    destinationWarehouseId: row.destination_warehouse_id ?? null,
    destinationWarehouseName: row.destination_warehouse_name ?? null,
    status: row.status,
    expectedDelivery: row.expected_delivery,
    currency: row.currency,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listPoWarehouses(): Promise<Array<{ id: string; code: string; name: string }>> {
  try {
    return await withOrgContext(async ({ client }) => {
      const { rows } = await (client as QueryClient).query<{ id: string; code: string; name: string }>(
        `select id, code, name
           from public.warehouses
          where org_id = app.current_org_id()
          order by code`,
      );
      return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
    });
  } catch {
    return [];
  }
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
    receivedQty: String(row.received_qty ?? '0'),
  };
}

async function fetchLines(client: QueryClient, poId: string): Promise<PurchaseOrderLine[]> {
  // Received = Σ grn_items.received_qty per PO line. GRNs are joined to scope the
  // org and to exclude cancelled receipts; DRAFT GRNs count — the scanner receive
  // flow books receipts onto a draft day-GRN and the PO status flip (receive-po.ts)
  // already counts them, so the detail page must agree with the chip/status.
  const { rows } = await client.query<PurchaseOrderLineRow>(
    `select l.id, l.po_id, l.item_id, i.item_code, i.name as item_name,
            l.qty::text as qty, l.uom, l.unit_price::text as unit_price, l.line_no,
            coalesce(rec.received_qty, 0)::text as received_qty
       from public.purchase_order_lines l
       left join public.items i on i.org_id = app.current_org_id() and i.id = l.item_id
       left join (
         select gi.po_line_id, sum(gi.received_qty) as received_qty
           from public.grn_items gi
           join public.grns g
             on g.id = gi.grn_id
            and g.org_id = app.current_org_id()
            and g.status <> 'cancelled'
          where gi.org_id = app.current_org_id()
            and gi.po_line_id is not null
            and gi.cancelled_at is null
          group by gi.po_line_id
       ) rec on rec.po_line_id = l.id
      where l.org_id = app.current_org_id()
        and l.po_id = $1::uuid
      order by l.line_no asc`,
    [poId],
  );
  return rows.map(mapLine);
}

async function fetchDraftPurchaseOrderForUpdate(client: QueryClient, poId: string): Promise<PurchaseOrderRow | null> {
  const { rows } = await client.query<PurchaseOrderRow>(
    `select po.id, po.po_number, po.supplier_id, s.code as supplier_code, s.name as supplier_name,
            null::uuid as destination_warehouse_id, null::text as destination_warehouse_name,
            po.status, po.expected_delivery::text as expected_delivery, po.currency, po.notes,
            po.created_at, po.updated_at
       from public.purchase_orders po
       left join public.suppliers s on s.org_id = app.current_org_id() and s.id = po.supplier_id
      where po.org_id = app.current_org_id()
        and po.id = $1::uuid
      limit 1
      for update of po`,
    [poId],
  );
  return rows[0] ?? null;
}

async function isPurchaseOrderFullyReceived(client: QueryClient, poId: string): Promise<boolean> {
  const { rows } = await client.query<{ is_received: boolean }>(
    `select bool_and(coalesce(rec.received_qty, 0) >= pol.qty) as is_received
       from public.purchase_order_lines pol
       left join (
         select po_line_id, sum(received_qty) as received_qty
           from public.grn_items
          where org_id = app.current_org_id()
            and po_line_id is not null
            and cancelled_at is null
          group by po_line_id
       ) rec on rec.po_line_id = pol.id
      where pol.org_id = app.current_org_id()
        and pol.po_id = $1::uuid`,
    [poId],
  );
  return rows[0]?.is_received === true;
}

async function getPurchaseOrderReceiptState(client: QueryClient, poId: string): Promise<{ activeReceivedCount: number; grnLineCount: number }> {
  const { rows } = await client.query<{ active_received_count: string | number; grn_line_count: string | number }>(
    `select count(*) filter (
              where gi.cancelled_at is null
                and coalesce(g.status, 'draft') <> 'cancelled'
                and gi.received_qty > 0
            ) as active_received_count,
            count(*) filter (
              where gi.cancelled_at is null
                and coalesce(g.status, 'draft') <> 'cancelled'
            ) as grn_line_count
       from public.grn_items gi
       left join public.grns g
         on g.org_id = app.current_org_id()
        and g.id = gi.grn_id
      where gi.org_id = app.current_org_id()
        and (
          gi.po_line_id in (
            select pol.id
              from public.purchase_order_lines pol
             where pol.org_id = app.current_org_id()
               and pol.po_id = $1::uuid
          )
          or g.po_id = $1::uuid
        )`,
    [poId],
  );
  const row = rows[0];
  return {
    activeReceivedCount: Number(row?.active_received_count ?? 0),
    grnLineCount: Number(row?.grn_line_count ?? 0),
  };
}

type SupplierOrgCheck = 'ok' | 'not_found' | 'supplier_blocked';

async function ensureSupplierInOrg(client: QueryClient, supplierId: string): Promise<SupplierOrgCheck> {
  const { rows } = await client.query<{ id: string; status: string }>(
    `select id, status
       from public.suppliers
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [supplierId],
  );
  const supplier = rows[0];
  if (!supplier) return 'not_found';
  if (supplier.status === 'blocked') return 'supplier_blocked';
  return 'ok';
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

function revalidatePurchaseOrderPaths(poId: string): void {
  try {
    revalidateLocalized('/planning/purchase-orders');
    revalidateLocalized(`/planning/purchase-orders/${poId}`);
  } catch (err) {
    if (process.env.VITEST) return;
    throw err;
  }
}

export async function listPurchaseOrders(params: unknown = {}): Promise<PurchaseOrderListResult> {
  const input = (params ?? {}) as {
    status?: unknown;
    q?: unknown;
    page?: unknown;
    offset?: unknown;
    limit?: unknown;
    archived?: unknown;
  };
  const status = typeof input.status === 'string' ? PurchaseOrderStatusSchema.safeParse(input.status) : null;
  if (status && !status.success) return { ok: false, error: 'invalid_input' };
  const q = typeof input.q === 'string' && input.q.trim() ? input.q.trim() : null;
  const archived = input.archived === true;
  const page = normalizePage({
    page: typeof input.page === 'number' ? input.page : undefined,
    offset: typeof input.offset === 'number' ? input.offset : undefined,
    limit: typeof input.limit === 'number' ? input.limit : undefined,
    defaultLimit: DEFAULT_PO_LIST_PAGE_SIZE,
    maxLimit: 200,
  });

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderListResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningReadPermission(ctx))) return { ok: false, error: 'forbidden' };

      const s = await getActiveSiteId({ client });
      const baseParams = [status?.success ? status.data : null, q, s, archived] as const;

      const [countResult, dataResult] = await Promise.all([
        (client as QueryClient).query<{ total: number }>(
          `select count(*)::int as total
             ${PO_LIST_FROM}
            where po.org_id = app.current_org_id()
              and ($3::uuid is null or po.site_id = $3::uuid)
              and ($1::text is null or po.status = $1)
              and ($2::text is null or po.po_number ilike '%' || $2 || '%' or s.code ilike '%' || $2 || '%')
              and coalesce(
                (
                  po.status in ('received', 'cancelled')
                  and ods.archive_after_days is not null
                  and po.updated_at < now() - make_interval(days => ods.archive_after_days)
                ),
                false
              ) = $4::boolean`,
          [...baseParams],
        ),
        (client as QueryClient).query<PurchaseOrderRow>(
          `select po.id, po.po_number, po.supplier_id, s.code as supplier_code, s.name as supplier_name,
                  po.destination_warehouse_id, w.name as destination_warehouse_name,
                  po.status, po.expected_delivery::text as expected_delivery, po.currency, po.notes,
                  po.created_at, po.updated_at
             ${PO_LIST_FROM}
            where po.org_id = app.current_org_id()
              and ($3::uuid is null or po.site_id = $3::uuid)
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
            order by po.expected_delivery asc nulls last, po.po_number asc, po.id asc
            limit $5::integer offset $6::integer`,
          [...baseParams, page.limit, page.offset],
        ),
      ]);
      const count = await (client as QueryClient).query<{ archived_count: string | number }>(
        `select count(*) as archived_count
           from public.purchase_orders po
           left join public.suppliers s on s.org_id = app.current_org_id() and s.id = po.supplier_id
           left join public.org_document_settings ods
             on ods.org_id = po.org_id
            and ods.doc_type = 'po'
          where po.org_id = app.current_org_id()
            and ($3::uuid is null or po.site_id = $3::uuid)
            and ($1::text is null or po.status = $1)
            and ($2::text is null or po.po_number ilike '%' || $2 || '%' or s.code ilike '%' || $2 || '%')
            and po.status in ('received', 'cancelled')
            and ods.archive_after_days is not null
            and po.updated_at < now() - make_interval(days => ods.archive_after_days)`,
        [status?.success ? status.data : null, q, s],
      );
      const rows = dataResult.rows.map(mapPurchaseOrder);
      const pagination = toPaginatedResult(rows, Number(countResult.rows[0]?.total ?? 0), page);
      return { ok: true, data: pagination.items, pagination, archivedCount: Number(count.rows[0]?.archived_count ?? 0) };
    });
  } catch (err) {
    console.error('[planning/purchase-orders] listPurchaseOrders failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderResult<PurchaseOrderDetail>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningReadPermission(ctx))) return { ok: false, error: 'forbidden' };

      const c = client as QueryClient;
      const { rows } = await c.query<PurchaseOrderRow>(
        `select po.id, po.po_number, po.supplier_id, s.code as supplier_code, s.name as supplier_name,
                po.destination_warehouse_id, w.name as destination_warehouse_name,
                po.status, po.expected_delivery::text as expected_delivery, po.currency, po.notes,
                po.created_at, po.updated_at
           from public.purchase_orders po
           left join public.suppliers s on s.org_id = app.current_org_id() and s.id = po.supplier_id
           left join public.warehouses w on w.org_id = app.current_org_id() and w.id = po.destination_warehouse_id
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
  const parsed = CreatePurchaseOrderInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      return createPurchaseOrderCore(ctx, input);
    });
    if (result.ok) revalidatePurchaseOrderPaths(result.data.id);
    return result;
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/purchase-orders] createPurchaseOrder failed', err);
    return { ok: false, error };
  }
}

export async function updatePurchaseOrder(rawInput: unknown): Promise<PurchaseOrderResult<PurchaseOrderDetail>> {
  const parsed = UpdatePurchaseOrderInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const before = await fetchDraftPurchaseOrderForUpdate(ctx.client, input.id);
      if (!before) return { ok: false, error: 'not_found' };
      if (before.status !== 'draft') return { ok: false, error: 'invalid_state', code: 'invalid_state' };

      if (input.supplierId) {
        const supplierCheck = await ensureSupplierInOrg(ctx.client, input.supplierId);
        if (supplierCheck === 'not_found') return { ok: false, error: 'not_found' };
        if (supplierCheck === 'supplier_blocked' && input.supplierId !== before.supplier_id) {
          return { ok: false, error: 'supplier_blocked', code: 'supplier_blocked', message: 'Supplier is blocked' };
        }
      }

      const { rows } = await ctx.client.query<PurchaseOrderRow>(
        `update public.purchase_orders
            set supplier_id = coalesce($2::uuid, supplier_id),
                expected_delivery = case when $7::boolean then nullif($3, '')::date else expected_delivery end,
                currency = coalesce($4, currency),
                notes = case when $8::boolean then nullif($5, '') else notes end,
                updated_by = $6::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'draft'
        returning id, po_number, supplier_id, null::text as supplier_code, null::text as supplier_name,
                  status, expected_delivery::text as expected_delivery, currency, notes, created_at, updated_at`,
        [
          input.id,
          input.supplierId ?? null,
          input.expectedDelivery ?? null,
          input.currency ?? null,
          input.notes ?? null,
          userId,
          input.expectedDelivery !== undefined,
          input.notes !== undefined,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'invalid_state', code: 'invalid_state' };

      await writeProcurementAudit(ctx, {
        action: 'planning.purchase_order.updated',
        resourceType: 'purchase_order',
        resourceId: row.id,
        beforeState: {
          supplierId: before.supplier_id,
          expectedDelivery: before.expected_delivery,
          currency: before.currency,
          notes: before.notes,
        },
        afterState: {
          supplierId: row.supplier_id,
          expectedDelivery: row.expected_delivery,
          currency: row.currency,
          notes: row.notes,
        },
      });
      revalidatePurchaseOrderPaths(row.id);
      return { ok: true, data: { ...mapPurchaseOrder(row), lines: await fetchLines(ctx.client, row.id) } };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/purchase-orders] updatePurchaseOrder failed', err);
    return { ok: false, error };
  }
}

export async function addPurchaseOrderLine(rawInput: unknown): Promise<PurchaseOrderResult<PurchaseOrderDetail>> {
  const parsed = AddPurchaseOrderLineInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const header = await fetchDraftPurchaseOrderForUpdate(ctx.client, input.poId);
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status !== 'draft') return { ok: false, error: 'invalid_state', code: 'invalid_state' };
      if (!(await ensureItemInOrg(ctx.client, input.itemId))) return { ok: false, error: 'not_found' };

      const insertLineOnce = async (): Promise<{ id: string; line_no: number } | null> => {
        await ctx.client.query('savepoint po_line_append');
        try {
          const { rows } = await ctx.client.query<{ id: string; line_no: number }>(
            `insert into public.purchase_order_lines
               (org_id, po_id, item_id, qty, uom, unit_price, line_no, created_by, updated_by)
             select app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5::numeric,
                    coalesce((select max(line_no)
                                from public.purchase_order_lines
                               where org_id = app.current_org_id()
                                 and po_id = $1::uuid), 0) + 1,
                    $6::uuid, $6::uuid
              where exists (
                    select 1
                      from public.purchase_orders
                     where org_id = app.current_org_id()
                       and id = $1::uuid
                       and status = 'draft'
                  )
            returning id, line_no`,
            [input.poId, input.itemId, input.qty, input.uom, input.unitPrice, userId],
          );
          await ctx.client.query('release savepoint po_line_append');
          return rows[0] ?? null;
        } catch (err) {
          if (isPgError(err) && err.code === '23505') {
            await ctx.client.query('rollback to savepoint po_line_append');
            return null;
          }
          throw err;
        }
      };

      let inserted = await insertLineOnce();
      if (!inserted) inserted = await insertLineOnce();
      if (!inserted) return { ok: false, error: 'invalid_state', code: 'invalid_state' };

      await writeProcurementAudit(ctx, {
        action: 'planning.purchase_order.line_added',
        resourceType: 'purchase_order',
        resourceId: header.id,
        afterState: {
          lineId: inserted.id,
          lineNo: Number(inserted.line_no),
          itemId: input.itemId,
          qty: input.qty,
          uom: input.uom,
          unitPrice: input.unitPrice,
        },
      });
      revalidatePurchaseOrderPaths(header.id);
      return { ok: true, data: { ...mapPurchaseOrder(header), lines: await fetchLines(ctx.client, header.id) } };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/purchase-orders] addPurchaseOrderLine failed', err);
    return { ok: false, error };
  }
}

export async function updatePurchaseOrderLine(rawInput: unknown): Promise<PurchaseOrderResult<PurchaseOrderDetail>> {
  const parsed = UpdatePurchaseOrderLineInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const header = await fetchDraftPurchaseOrderForUpdate(ctx.client, input.poId);
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status !== 'draft') return { ok: false, error: 'invalid_state', code: 'invalid_state' };

      const { rows: beforeRows } = await ctx.client.query<PurchaseOrderLineRow>(
        `select l.id, l.po_id, l.item_id, null::text as item_code, null::text as item_name,
                l.qty::text as qty, l.uom, l.unit_price::text as unit_price, l.line_no,
                null::text as received_qty
           from public.purchase_order_lines l
          where l.org_id = app.current_org_id()
            and l.po_id = $1::uuid
            and l.id = $2::uuid
          limit 1`,
        [input.poId, input.lineId],
      );
      const before = beforeRows[0];
      if (!before) return { ok: false, error: 'not_found' };

      const { rowCount } = await ctx.client.query(
        `update public.purchase_order_lines l
            set qty = coalesce($3::numeric, qty),
                uom = coalesce($4, uom),
                unit_price = coalesce($5::numeric, unit_price),
                updated_by = $6::uuid
           from public.purchase_orders po
          where l.org_id = app.current_org_id()
            and po.org_id = app.current_org_id()
            and po.id = l.po_id
            and po.id = $1::uuid
            and po.status = 'draft'
            and l.id = $2::uuid`,
        [input.poId, input.lineId, input.qty ?? null, input.uom ?? null, input.unitPrice ?? null, userId],
      );
      if (rowCount !== 1) return { ok: false, error: 'invalid_state', code: 'invalid_state' };

      await writeProcurementAudit(ctx, {
        action: 'planning.purchase_order.line_updated',
        resourceType: 'purchase_order',
        resourceId: header.id,
        beforeState: { lineId: before.id, qty: before.qty, uom: before.uom, unitPrice: before.unit_price },
        afterState: {
          lineId: before.id,
          qty: input.qty ?? before.qty,
          uom: input.uom ?? before.uom,
          unitPrice: input.unitPrice ?? before.unit_price,
        },
      });
      revalidatePurchaseOrderPaths(header.id);
      return { ok: true, data: { ...mapPurchaseOrder(header), lines: await fetchLines(ctx.client, header.id) } };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/purchase-orders] updatePurchaseOrderLine failed', err);
    return { ok: false, error };
  }
}

export async function deletePurchaseOrderLine(rawInput: unknown): Promise<PurchaseOrderResult<PurchaseOrderDetail>> {
  const parsed = DeletePurchaseOrderLineInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrderDetail>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const header = await fetchDraftPurchaseOrderForUpdate(ctx.client, input.poId);
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status !== 'draft') return { ok: false, error: 'invalid_state', code: 'invalid_state' };

      const { rows: beforeRows } = await ctx.client.query<PurchaseOrderLineRow>(
        `select l.id, l.po_id, l.item_id, null::text as item_code, null::text as item_name,
                l.qty::text as qty, l.uom, l.unit_price::text as unit_price, l.line_no,
                null::text as received_qty
           from public.purchase_order_lines l
          where l.org_id = app.current_org_id()
            and l.po_id = $1::uuid
            and l.id = $2::uuid
          limit 1`,
        [input.poId, input.lineId],
      );
      const before = beforeRows[0];
      if (!before) return { ok: false, error: 'not_found' };

      const { rows: countRows } = await ctx.client.query<{ line_count: string | number }>(
        `select count(*) as line_count
           from public.purchase_order_lines
          where org_id = app.current_org_id()
            and po_id = $1::uuid`,
        [input.poId],
      );
      if (Number(countRows[0]?.line_count ?? 0) <= 1) {
        return { ok: false, error: 'last_line', code: 'last_line', message: 'Cannot delete the last purchase order line' };
      }

      const { rowCount } = await ctx.client.query(
        `delete from public.purchase_order_lines l
          using public.purchase_orders po
          where l.org_id = app.current_org_id()
            and po.org_id = app.current_org_id()
            and po.id = l.po_id
            and po.id = $1::uuid
            and po.status = 'draft'
            and l.id = $2::uuid`,
        [input.poId, input.lineId],
      );
      if (rowCount !== 1) return { ok: false, error: 'invalid_state', code: 'invalid_state' };

      await ctx.client.query(
        `with ranked as (
           select id, row_number() over (order by line_no asc, id asc) as rn
             from public.purchase_order_lines
            where org_id = app.current_org_id()
              and po_id = $1::uuid
         )
         update public.purchase_order_lines pol
            set line_no = ranked.rn,
                updated_by = $2::uuid
           from ranked
          where pol.id = ranked.id
            and pol.org_id = app.current_org_id()
            and pol.po_id = $1::uuid
            and pol.line_no <> ranked.rn`,
        [input.poId, userId],
      );

      await writeProcurementAudit(ctx, {
        action: 'planning.purchase_order.line_deleted',
        resourceType: 'purchase_order',
        resourceId: header.id,
        beforeState: { lineId: before.id, lineNo: Number(before.line_no), itemId: before.item_id, qty: before.qty, uom: before.uom },
        afterState: null,
      });
      revalidatePurchaseOrderPaths(header.id);
      return { ok: true, data: { ...mapPurchaseOrder(header), lines: await fetchLines(ctx.client, header.id) } };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/purchase-orders] deletePurchaseOrderLine failed', err);
    return { ok: false, error };
  }
}

// Server-side state machine for PO status. Terminal states (received, cancelled)
// have no legal successors. The client surfaces only legal transitions, but we
// re-validate here so a forged/stale request can never apply an illegal jump.
const PO_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['draft', 'confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  partially_received: ['cancelled'],
  received: [],
  cancelled: [],
};

export async function reopenPurchaseOrder(poId: string): Promise<PurchaseOrderResult<PurchaseOrder>> {
  const parsed = uuidSchema.safeParse(poId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrder>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const before = await fetchDraftPurchaseOrderForUpdate(ctx.client, parsed.data);
      if (!before) return { ok: false, error: 'not_found' };
      // Reopen un-sends a SENT po OR un-cancels a CANCELLED po, both back to
      // draft (the detail UI shows "Przywróć do wersji roboczej" for cancelled).
      // PO_TRANSITIONS treats cancelled as terminal, so this is the dedicated
      // reopen path; the po_has_receipts guard below still blocks reopening a po
      // that has receipts.
      if (before.status !== 'sent' && before.status !== 'cancelled') {
        return { ok: false, error: 'invalid_state', code: 'invalid_state' };
      }

      const receiptState = await getPurchaseOrderReceiptState(ctx.client, parsed.data);
      if (receiptState.activeReceivedCount > 0 || receiptState.grnLineCount > 0) {
        return { ok: false, error: 'po_has_receipts', code: 'po_has_receipts' };
      }

      const { rows } = await ctx.client.query<PurchaseOrderRow>(
        `update public.purchase_orders
            set status = 'draft',
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status in ('sent', 'cancelled')
            and not exists (
              select 1
                from public.grn_items gi
                left join public.grns g
                  on g.org_id = app.current_org_id()
                 and g.id = gi.grn_id
               where gi.org_id = app.current_org_id()
                 and gi.cancelled_at is null
                 and coalesce(g.status, 'draft') <> 'cancelled'
                 and (
                   gi.po_line_id in (
                     select pol.id
                       from public.purchase_order_lines pol
                      where pol.org_id = app.current_org_id()
                        and pol.po_id = $1::uuid
                   )
                   or g.po_id = $1::uuid
                 )
            )
        returning id, po_number, supplier_id, null::text as supplier_code, null::text as supplier_name,
                  status, expected_delivery::text as expected_delivery, currency, notes, created_at, updated_at`,
        [parsed.data, userId],
      );
      const row = rows[0];
      if (!row) {
        const currentReceiptState = await getPurchaseOrderReceiptState(ctx.client, parsed.data);
        if (currentReceiptState.activeReceivedCount > 0 || currentReceiptState.grnLineCount > 0) {
          return { ok: false, error: 'po_has_receipts', code: 'po_has_receipts' };
        }
        return { ok: false, error: 'invalid_state', code: 'invalid_state' };
      }

      await writeProcurementAudit(ctx, {
        action: 'planning.purchase_order.status_changed',
        resourceType: 'purchase_order',
        resourceId: row.id,
        beforeState: { status: before.status },
        afterState: { status: row.status },
      });
      revalidatePurchaseOrderPaths(row.id);
      return { ok: true, data: mapPurchaseOrder(row) };
    });
  } catch (err) {
    console.error('[planning/purchase-orders] reopenPurchaseOrder failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function transitionPurchaseOrderStatus(id: string, status: string): Promise<PurchaseOrderResult<PurchaseOrder>> {
  const parsed = PurchaseOrderStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PurchaseOrderResult<PurchaseOrder>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const before = await ctx.client.query<{ status: string }>(
        `select status
           from public.purchase_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1
          for update`,
        [id],
      );
      const previous = before.rows[0];
      if (!previous) return { ok: false, error: 'not_found' };

      if (parsed.data === 'received' || parsed.data === 'partially_received') {
        const receiptState = await getPurchaseOrderReceiptState(ctx.client, id);
        if (parsed.data === 'partially_received' && receiptState.activeReceivedCount === 0) {
          return { ok: false, error: 'po_open_quantity', code: 'po_open_quantity' };
        }
        if (parsed.data === 'received' && !(await isPurchaseOrderFullyReceived(ctx.client, id))) {
          return { ok: false, error: 'po_open_quantity', code: 'po_open_quantity' };
        }
      }

      // Guard the transition server-side against the legal state machine.
      const allowed = PO_TRANSITIONS[previous.status] ?? [];
      if (!allowed.includes(parsed.data)) return { ok: false, error: 'invalid_state' };
      if (parsed.data === 'cancelled') {
        const receiptState = await getPurchaseOrderReceiptState(ctx.client, id);
        if (receiptState.activeReceivedCount > 0) return { ok: false, error: 'po_has_receipts', code: 'po_has_receipts' };
      }

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
      revalidatePurchaseOrderPaths(row.id);
      return { ok: true, data: mapPurchaseOrder(row) };
    });
  } catch (err) {
    console.error('[planning/purchase-orders] transitionPurchaseOrderStatus failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
