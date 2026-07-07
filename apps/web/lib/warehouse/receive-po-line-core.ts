import { randomUUID } from 'node:crypto';

import type { QueryClient } from '../scanner/db';

export type DecimalString = string;

export const OPEN_PO_STATUSES = ['sent', 'confirmed', 'partially_received'] as const;
export const RECEIVE_PO_APP_VERSION = 'warehouse-scanner-receive-po-v1';

const DECIMAL_SCALE = 6n;
const DECIMAL_FACTOR = 1_000_000n;

export type ReceivePoLineCoreInput = {
  poLineId: string;
  qty: DecimalString;
  batchNumber?: string | null;
  bestBefore?: string | null;
  toLocationId?: string | null;
  /** Desktop-only explicit warehouse override. */
  warehouseId?: string | null;
  /** When qty exceeds ordered (within 110% cap), desktop requires this flag. */
  confirmOverReceive?: boolean;
};

export type ReceivePoLineCoreContext = {
  orgId: string;
  userId: string;
  /** Scanner session site — used for warehouse resolution in scanner mode. */
  siteId: string | null;
};

export type ReceivePoLineCoreOptions = {
  mode: 'scanner' | 'desktop';
  genesisReasonCode: string;
  genesisReasonText: string;
  requireOverReceiveConfirm: boolean;
  afterGrnItemInserted?: (receipt: {
    grnItemId: string;
    itemId: string;
    qty: string;
    uom: string;
    poLineId: string;
  }) => Promise<void>;
};

export type ReceivePoLineCoreSuccess = {
  ok: true;
  grnId: string;
  grnNumber: string;
  grnItemId: string;
  lpId: string;
  lpNumber: string;
  qty: DecimalString;
  uom: string;
  overReceived: boolean;
  poStatus: 'partially_received' | 'received';
  qcInspectionRequired: boolean;
  inspectionId: string | null;
  poId: string;
};

export type ReceivePoLineCoreFailure = {
  ok: false;
  code:
    | 'not_found'
    | 'invalid_qty'
    | 'over_receive_cap'
    | 'over_receive_confirm_required'
    | 'invalid_location'
    | 'no_warehouse'
    | 'supplier_blocked';
  poId?: string;
  /** Populated for over_receive_cap to allow callers to log diagnostic context. */
  orderedQty?: string;
  receivedQty?: string;
};

export type ReceivePoLineCoreResult = ReceivePoLineCoreSuccess | ReceivePoLineCoreFailure;

export class ReceivePoLineCoreError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = 'ReceivePoLineCoreError';
  }
}

type LineForReceive = {
  id: string;
  org_id: string;
  po_id: string;
  item_id: string;
  supplier_id: string;
  supplier_status: string;
  destination_warehouse_id: string | null;
  line_no: number;
  ordered_qty: string;
  uom: string;
  received_qty: string | null;
  shelf_life_days: number | null;
  shelf_life_mode: string | null;
};

type RequestedLocation = { id: string; warehouse_id: string };
type WarehouseTarget = { id: string; site_id: string | null; default_location_id: string | null };
type GrnRow = { id: string; grn_number: string };

/**
 * Shared PO-line receive transaction body. Call inside an open DB transaction
 * (withOrgContext or scanner begin/commit wrapper). Scanner and desktop wrappers
 * supply mode-specific warehouse/site resolution and post-commit audit hooks.
 */
export async function executeReceivePoLineCore(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  input: ReceivePoLineCoreInput,
  options: ReceivePoLineCoreOptions,
): Promise<ReceivePoLineCoreResult> {
  validateCoreInput(input);

  const line = await loadLineForUpdate(client, ctx.orgId, input.poLineId);
  if (!line) return { ok: false, code: 'not_found' };
  if (line.supplier_status === 'blocked') {
    return { ok: false, code: 'supplier_blocked', poId: line.po_id };
  }

  const qty = parseDecimal(input.qty);
  if (qty <= 0n) return { ok: false, code: 'invalid_qty', poId: line.po_id };
  const ordered = parseDecimal(line.ordered_qty);
  const alreadyReceived = parseDecimal(line.received_qty ?? '0');
  const afterLine = alreadyReceived + qty;
  const cap = (ordered * 110n) / 100n;
  if (afterLine > cap)
    return {
      ok: false,
      code: 'over_receive_cap',
      poId: line.po_id,
      orderedQty: line.ordered_qty,
      receivedQty: line.received_qty ?? '0',
    };

  const overReceived = afterLine > ordered;
  if (options.requireOverReceiveConfirm && overReceived && !input.confirmOverReceive) {
    return { ok: false, code: 'over_receive_confirm_required', poId: line.po_id };
  }

  let requestedLocation: RequestedLocation | null = null;
  if (input.toLocationId) {
    requestedLocation = await resolveRequestedLocation(client, ctx, input.toLocationId, options.mode);
    if (!requestedLocation) return { ok: false, code: 'invalid_location', poId: line.po_id };
  }

  const warehouse = await resolveWarehouse(
    client,
    ctx,
    input,
    line.destination_warehouse_id,
    options.mode,
    requestedLocation?.warehouse_id ?? null,
  );
  if (!warehouse) {
    return { ok: false, code: 'no_warehouse', poId: line.po_id };
  }

  if (requestedLocation && requestedLocation.warehouse_id !== warehouse.id) {
    return { ok: false, code: 'invalid_location', poId: line.po_id };
  }

  const destWarehouseId = warehouse.id;
  const destLocationId = requestedLocation?.id ?? warehouse.default_location_id;
  const lpSiteId = warehouse.site_id;

  const grn = await getOrCreateOpenGrn(client, ctx, {
    poId: line.po_id,
    supplierId: line.supplier_id,
    warehouseId: warehouse.id,
    locationId: warehouse.default_location_id,
  });

  const lpNumber = makeLpNumber();
  const expiryDate = computeExpiryDate(input.bestBefore ?? null, line.shelf_life_days);
  const lp = await insertLicensePlate(client, ctx, {
    lpNumber,
    siteId: lpSiteId,
    warehouseId: destWarehouseId,
    locationId: destLocationId,
    productId: line.item_id,
    qty: formatDecimal(qty),
    uom: line.uom,
    batchNumber: input.batchNumber ?? null,
    bestBefore: input.bestBefore ?? null,
    expiryDate,
    shelfLifeModeSnapshot: line.shelf_life_mode ?? null,
    grnId: grn.id,
  });
  await insertLpAutoPutaway(client, ctx.userId, {
    lpId: lp.id,
    transactionId: randomUUID(),
  });

  const grnItem = await insertGrnItem(client, ctx, {
    grnId: grn.id,
    productId: line.item_id,
    poLineId: line.id,
    orderedQty: line.ordered_qty,
    receivedQty: formatDecimal(qty),
    uom: line.uom,
    batchNumber: input.batchNumber ?? null,
    bestBefore: input.bestBefore ?? null,
    locationId: destLocationId,
    lpId: lp.id,
  });

  await insertLpGenesis(client, ctx, {
    lpId: lp.id,
    grnId: grn.id,
    transactionId: randomUUID(),
    reasonCode: options.genesisReasonCode,
    reasonText: options.genesisReasonText,
  });

  await emitLpReceived(client, ctx, {
    lpId: lp.id,
    grnId: grn.id,
    itemId: line.item_id,
    qty: formatDecimal(qty),
    uom: line.uom,
  });

  const qcInspectionRequired = await requiresGrnQcInspection(client, ctx.orgId);
  const inspectionId = qcInspectionRequired
    ? await insertQcInspectionForLp(client, ctx, { lpId: lp.id, productId: line.item_id, siteId: lpSiteId })
    : null;

  await options.afterGrnItemInserted?.({
    grnItemId: grnItem.id,
    itemId: line.item_id,
    qty: formatDecimal(qty),
    uom: line.uom,
    poLineId: line.id,
  });

  const poStatus = await rollupPurchaseOrderStatus(client, ctx, line.po_id, options.mode);

  return {
    ok: true,
    grnId: grn.id,
    grnNumber: grn.grn_number,
    grnItemId: grnItem.id,
    lpId: lp.id,
    lpNumber,
    qty: formatDecimal(qty),
    uom: line.uom,
    overReceived,
    poStatus,
    qcInspectionRequired,
    inspectionId,
    poId: line.po_id,
  };
}

function validateCoreInput(input: ReceivePoLineCoreInput): void {
  if (!isUuid(input.poLineId)) throw new ReceivePoLineCoreError('invalid_po_line_id', 400);
  parseDecimal(input.qty);
  if (input.bestBefore && !/^\d{4}-\d{2}-\d{2}$/.test(input.bestBefore)) {
    throw new ReceivePoLineCoreError('invalid_best_before', 400);
  }
  if (input.toLocationId && !isUuid(input.toLocationId)) {
    throw new ReceivePoLineCoreError('invalid_location', 422);
  }
  if (input.warehouseId && !isUuid(input.warehouseId)) {
    throw new ReceivePoLineCoreError('invalid_warehouse', 400);
  }
}

async function loadLineForUpdate(
  client: QueryClient,
  orgId: string,
  poLineId: string,
): Promise<LineForReceive | null> {
  const { rows } = await client.query<LineForReceive>(
    `select pol.id,
            pol.org_id,
            pol.po_id,
            pol.item_id,
            po.supplier_id,
            s.status as supplier_status,
            po.destination_warehouse_id,
            pol.line_no,
            pol.qty::text as ordered_qty,
            pol.uom,
            (
              select coalesce(sum(gi.received_qty), 0)::text
                from public.grn_items gi
               where gi.po_line_id = pol.id
                 and gi.org_id = pol.org_id
                 and gi.cancelled_at is null
            ) as received_qty,
            i.shelf_life_days,
            i.shelf_life_mode
       from public.purchase_order_lines pol
       join public.purchase_orders po
         on po.id = pol.po_id
        and po.org_id = pol.org_id
       join public.suppliers s
         on s.id = po.supplier_id
        and s.org_id = po.org_id
       left join public.items i
         on i.id = pol.item_id
        and i.org_id = pol.org_id
      where pol.org_id = $1::uuid
        and pol.id = $2::uuid
        and po.status = any($3::text[])
        and app.user_can_see_site(po.site_id)
      for update of pol, po`,
    [orgId, poLineId, OPEN_PO_STATUSES],
  );
  return rows[0] ?? null;
}

async function resolveRequestedLocation(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  locationId: string,
  mode: 'scanner' | 'desktop',
): Promise<RequestedLocation | null> {
  if (mode === 'scanner' && !ctx.siteId) return null;

  const { rows } = await client.query<RequestedLocation>(
    `select l.id, l.warehouse_id
       from public.locations l
       join public.warehouses w
         on w.id = l.warehouse_id
        and w.org_id = l.org_id
      where l.org_id = $1::uuid
        and l.id = $2::uuid
        and app.user_can_see_site(w.site_id)
        and ($3::uuid is null or w.site_id = $3::uuid)
      limit 1`,
    [ctx.orgId, locationId, mode === 'scanner' ? ctx.siteId : null],
  );
  return rows[0] ?? null;
}

async function resolveWarehouse(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  input: ReceivePoLineCoreInput,
  poDestinationWarehouseId: string | null,
  mode: 'scanner' | 'desktop',
  explicitWarehouseId: string | null = null,
): Promise<WarehouseTarget | null> {
  if (mode === 'desktop' && input.warehouseId) {
    const { rows } = await client.query<WarehouseTarget>(
      `select w.id,
              w.site_id,
              (select l.id
                 from public.locations l
                where l.org_id = w.org_id
                  and l.warehouse_id = w.id
                order by l.level asc, l.code asc
                limit 1) as default_location_id
         from public.warehouses w
        where w.org_id = app.current_org_id()
          and w.id = $1::uuid
        limit 1`,
      [input.warehouseId],
    );
    return rows[0] ?? null;
  }

  if (mode === 'desktop' && input.toLocationId) {
    const { rows } = await client.query<WarehouseTarget>(
      `select w.id,
              w.site_id,
              (select l.id
                 from public.locations l
                where l.org_id = w.org_id
                  and l.warehouse_id = w.id
                order by l.level asc, l.code asc
                limit 1) as default_location_id
         from public.locations requested
         join public.warehouses w
           on w.id = requested.warehouse_id
          and w.org_id = requested.org_id
        where requested.org_id = app.current_org_id()
          and requested.id = $1::uuid
        limit 1`,
      [input.toLocationId],
    );
    if (rows[0]) return rows[0];
  }

  if (mode === 'desktop' && poDestinationWarehouseId) {
    const { rows } = await client.query<WarehouseTarget>(
      `select w.id,
              w.site_id,
              (select l.id
                 from public.locations l
                where l.org_id = w.org_id
                  and l.warehouse_id = w.id
                order by l.level asc, l.code asc
                limit 1) as default_location_id
         from public.warehouses w
        where w.org_id = app.current_org_id()
          and w.id = $1::uuid
        limit 1`,
      [poDestinationWarehouseId],
    );
    if (rows[0]) return rows[0];
  }

  if (mode === 'scanner') {
    if (!ctx.siteId) return null;

    const { rows } = await client.query<WarehouseTarget & { default_location_id: string | null }>(
      `select w.id,
              w.site_id,
              (select l.id
                 from public.locations l
                where l.org_id = w.org_id
                  and l.warehouse_id = w.id
                order by l.level asc, l.code asc
                limit 1) as default_location_id
         from public.warehouses w
        where w.org_id = app.current_org_id()
          and w.site_id = $3::uuid
          and app.user_can_see_site(w.site_id)
        order by case
                   when $1::uuid is not null and w.id = $1::uuid then 0
                   when $2::uuid is not null and w.id = $2::uuid then 1
                   else 2
                 end,
                 w.is_default desc,
                 w.created_at asc,
                 w.id asc
        limit 1`,
      [explicitWarehouseId, poDestinationWarehouseId, ctx.siteId],
    );
    return rows[0] ?? null;
  }

  const { rows } = await client.query<WarehouseTarget>(
    `select w.id,
            w.site_id,
            (select l.id
               from public.locations l
              where l.org_id = w.org_id
                and l.warehouse_id = w.id
              order by l.level asc, l.code asc
              limit 1) as default_location_id
       from public.warehouses w
      where w.org_id = app.current_org_id()
      order by w.is_default desc,
               w.created_at asc,
               w.id asc
      limit 1`,
  );
  return rows[0] ?? null;
}

async function getOrCreateOpenGrn(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  input: { poId: string; supplierId: string; warehouseId: string; locationId: string | null },
): Promise<GrnRow> {
  await client.query(
    `select pg_advisory_xact_lock(hashtextextended($1::text || ':grn-day:' || to_char(current_date, 'YYYYMMDD'), 0))`,
    [ctx.orgId],
  );
  const existing = await client.query<GrnRow>(
    `select id, grn_number
       from public.grns
      where org_id = $1::uuid
        and po_id = $2::uuid
        and source_type = 'po'
        and status = 'draft'
        and receipt_date >= date_trunc('day', now())
        and receipt_date < date_trunc('day', now()) + interval '1 day'
      order by created_at asc
      limit 1
      for update`,
    [ctx.orgId, input.poId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const grnNumber = await nextGrnNumber(client, ctx.orgId);
  const inserted = await client.query<GrnRow>(
    `insert into public.grns (
       org_id, source_type, po_id, supplier_id, warehouse_id, default_location_id,
       grn_number, status, received_by, created_by, updated_by
     )
     values ($1::uuid, 'po', $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'draft', $7::uuid, $7::uuid, $7::uuid)
     returning id, grn_number`,
    [ctx.orgId, input.poId, input.supplierId, input.warehouseId, input.locationId, grnNumber, ctx.userId],
  );
  return inserted.rows[0]!;
}

async function nextGrnNumber(client: QueryClient, orgId: string): Promise<string> {
  const { rows } = await client.query<{ seq: number }>(
    `select coalesce(max(substring(grn_number from 'GRN-[0-9]{8}-([0-9]+)$')::int), 0) + 1 as seq
       from public.grns
      where org_id = $1::uuid
        and grn_number like 'GRN-' || to_char(current_date, 'YYYYMMDD') || '-%'`,
    [orgId],
  );
  return `GRN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(rows[0]?.seq ?? 1).padStart(4, '0')}`;
}

async function insertLicensePlate(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  input: {
    lpNumber: string;
    siteId: string | null;
    warehouseId: string;
    locationId: string | null;
    productId: string;
    qty: string;
    uom: string;
    batchNumber: string | null;
    bestBefore: string | null;
    expiryDate: string | null;
    shelfLifeModeSnapshot: string | null;
    grnId: string;
  },
): Promise<{ id: string }> {
  const { rows } = await client.query<{ id: string }>(
    `insert into public.license_plates (
       org_id, site_id, warehouse_id, lp_number, product_id, quantity, uom,
       status, qa_status, batch_number, best_before_date, expiry_date,
       shelf_life_mode_snapshot, location_id, origin,
       grn_id, created_by, updated_by
     )
     values (
       $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::numeric, $7,
       'available', 'pending', $8, $9::timestamptz, $10::timestamptz,
       $11, $12::uuid, 'grn',
       $13::uuid, $14::uuid, $14::uuid
     )
     returning id`,
    [
      ctx.orgId,
      input.siteId,
      input.warehouseId,
      input.lpNumber,
      input.productId,
      input.qty,
      input.uom,
      input.batchNumber,
      input.bestBefore,
      input.expiryDate,
      input.shelfLifeModeSnapshot,
      input.locationId,
      input.grnId,
      ctx.userId,
    ],
  );
  return rows[0]!;
}

async function insertLpAutoPutaway(
  client: QueryClient,
  userId: string,
  input: { lpId: string; transactionId: string },
): Promise<void> {
  await client.query(
    `insert into public.lp_state_history
       (org_id, lp_id, from_state, to_state, reason_code, stock_move_id, transaction_id, created_by)
     values
       (app.current_org_id(), $1::uuid, 'received', 'available', $2, $3::uuid, $4::uuid, $5::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [input.lpId, 'auto_putaway_po_receive', null, input.transactionId, userId],
  );
}

async function insertGrnItem(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  input: {
    grnId: string;
    productId: string;
    poLineId: string;
    orderedQty: string;
    receivedQty: string;
    uom: string;
    batchNumber: string | null;
    bestBefore: string | null;
    locationId: string | null;
    lpId: string;
  },
): Promise<{ id: string }> {
  const lineNumber = await nextGrnItemLineNumber(client, ctx.orgId, input.grnId);
  const { rows } = await client.query<{ id: string }>(
    `insert into public.grn_items (
       org_id, grn_id, line_number, product_id, po_line_id,
       ordered_qty, received_qty, uom, batch_number, best_before_date,
       location_id, qa_status_initial, lp_id, created_by, updated_by
     )
     values (
       $1::uuid, $2::uuid, $3::int, $4::uuid, $5::uuid,
       $6::numeric, $7::numeric, $8, $9, $10::timestamptz,
       $11::uuid, 'pending', $12::uuid, $13::uuid, $13::uuid
     )
     returning id`,
    [
      ctx.orgId,
      input.grnId,
      lineNumber,
      input.productId,
      input.poLineId,
      input.orderedQty,
      input.receivedQty,
      input.uom,
      input.batchNumber,
      input.bestBefore,
      input.locationId,
      input.lpId,
      ctx.userId,
    ],
  );
  return rows[0]!;
}

async function nextGrnItemLineNumber(client: QueryClient, orgId: string, grnId: string): Promise<number> {
  const { rows } = await client.query<{ line_number: number }>(
    `select coalesce(max(line_number), 0) + 1 as line_number
       from public.grn_items
      where org_id = $1::uuid
        and grn_id = $2::uuid`,
    [orgId, grnId],
  );
  return Number(rows[0]?.line_number ?? 1);
}

async function insertLpGenesis(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  input: { lpId: string; grnId: string; transactionId: string; reasonCode: string; reasonText: string },
): Promise<void> {
  await client.query(
    `insert into public.lp_state_history (
       org_id, lp_id, from_state, to_state, reason_code, reason_text,
       grn_id, transaction_id, created_by
     )
     values ($1::uuid, $2::uuid, null, 'received', $3, $4, $5::uuid, $6::uuid, $7::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [ctx.orgId, input.lpId, input.reasonCode, input.reasonText, input.grnId, input.transactionId, ctx.userId],
  );
}

async function emitLpReceived(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  input: { lpId: string; grnId: string; itemId: string; qty: string; uom: string },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, $2, $3::uuid, $4::jsonb, $5)`,
    [
      'warehouse.lp.received',
      'license_plate',
      input.lpId,
      JSON.stringify({
        lp_id: input.lpId,
        grn_id: input.grnId,
        item_id: input.itemId,
        qty: input.qty,
        uom: input.uom,
        org_id: ctx.orgId,
        actor: ctx.userId,
      }),
      RECEIVE_PO_APP_VERSION,
    ],
  );
}

async function requiresGrnQcInspection(client: QueryClient, orgId: string): Promise<boolean> {
  const { rows } = await client.query<{ require_qc: boolean }>(
    `select (tv.feature_flags->>'require_grn_qc_inspection') = 'true' as require_qc
       from public.tenant_variations tv
      where tv.org_id = $1::uuid`,
    [orgId],
  );
  return rows[0]?.require_qc === true;
}

async function insertQcInspectionForLp(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  input: { lpId: string; productId: string; siteId: string | null },
): Promise<string | null> {
  if (input.siteId) {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.quality_inspections (
         org_id, site_id, inspection_number, reference_type, reference_id, product_id, status, created_by
       )
       select $1::uuid, lp.site_id, public.next_quality_inspection_number($1::uuid), 'lp', $2::uuid, $3::uuid, 'pending', $4::uuid
         from public.license_plates lp
        where lp.org_id = app.current_org_id()
          and lp.id = $2::uuid
          and app.user_can_see_site(lp.site_id)
          and not exists (
            select 1
              from public.quality_inspections qi
             where qi.org_id = $1::uuid
               and qi.reference_type = 'lp'
               and qi.reference_id = $2::uuid
               and qi.status = 'pending'
          )
        limit 1
       returning id`,
      [ctx.orgId, input.lpId, input.productId, ctx.userId],
    );
    return rows[0]?.id ?? null;
  }

  const { rows } = await client.query<{ id: string }>(
    `insert into public.quality_inspections (
       org_id, site_id, inspection_number, reference_type, reference_id, product_id, status, created_by
     )
     select $1::uuid, $5::uuid, public.next_quality_inspection_number($1::uuid), 'lp', $2::uuid, $3::uuid, 'pending', $4::uuid
      where not exists (
        select 1
          from public.quality_inspections qi
         where qi.org_id = $1::uuid
           and qi.reference_type = 'lp'
           and qi.reference_id = $2::uuid
           and qi.status = 'pending'
      )
     returning id`,
    [ctx.orgId, input.lpId, input.productId, ctx.userId, input.siteId],
  );
  return rows[0]?.id ?? null;
}

async function rollupPurchaseOrderStatus(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  poId: string,
  mode: 'scanner' | 'desktop',
): Promise<'partially_received' | 'received'> {
  const { rows } = await client.query<{ is_received: boolean }>(
    `select bool_and(coalesce(rec.received_qty, 0) >= pol.qty) as is_received
       from public.purchase_order_lines pol
       left join (
         select po_line_id, sum(received_qty) as received_qty
           from public.grn_items
          where org_id = $1::uuid
            and po_line_id is not null
            and cancelled_at is null
          group by po_line_id
       ) rec on rec.po_line_id = pol.id
      where pol.org_id = $1::uuid
        and pol.po_id = $2::uuid`,
    [ctx.orgId, poId],
  );
  const status = rows[0]?.is_received ? 'received' : 'partially_received';
  const statusFilter =
    mode === 'desktop'
      ? `and status in ('sent', 'confirmed', 'partially_received')`
      : '';
  await client.query(
    `update public.purchase_orders
        set status = $3,
            updated_by = $4::uuid,
            updated_at = now()
      where org_id = $1::uuid
        and id = $2::uuid
        ${statusFilter}`,
    [ctx.orgId, poId, status, ctx.userId],
  );

  if (status === 'received') {
    await completeFullyReceivedGrns(client, ctx, poId);
  }

  return status;
}

async function completeFullyReceivedGrns(
  client: QueryClient,
  ctx: ReceivePoLineCoreContext,
  poId: string,
): Promise<void> {
  await client.query(
    `update public.grns
        set status = 'completed',
            completed_at = now(),
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = $1::uuid
        and po_id = $2::uuid
        and source_type = 'po'
        and status = 'draft'`,
    [ctx.orgId, poId, ctx.userId],
  );
}

export function parseDecimal(input: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(input)) throw new ReceivePoLineCoreError('invalid_qty', 400);
  const [whole, frac = ''] = input.split('.');
  return BigInt(whole) * DECIMAL_FACTOR + BigInt(frac.padEnd(Number(DECIMAL_SCALE), '0'));
}

export function formatDecimal(value: bigint): string {
  const whole = value / DECIMAL_FACTOR;
  const frac = (value % DECIMAL_FACTOR).toString().padStart(Number(DECIMAL_SCALE), '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function computeExpiryDate(bestBefore: string | null, shelfLifeDays: number | null): string | null {
  if (bestBefore) return bestBefore;
  if (shelfLifeDays == null || !Number.isFinite(shelfLifeDays) || shelfLifeDays < 0) return null;
  const expiry = new Date(Date.now() + Math.trunc(shelfLifeDays) * 86_400_000);
  return expiry.toISOString().slice(0, 10);
}

export function makeLpNumber(): string {
  return `LP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
