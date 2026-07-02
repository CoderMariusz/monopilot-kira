import { randomUUID } from 'node:crypto';

import { cleanupTxnOrgContext, registerTxnOrgContext } from '../../scanner/txn-org-context';

import type { QueryClient } from '../../scanner/db';
import type { ScannerSessionRow } from '../../scanner/session';

export type DecimalString = string;

export type ScannerPoSummary = {
  id: string;
  poNumber: string;
  supplierCode: string | null;
  supplierName: string;
  expectedDelivery: string | null;
  status: string;
  lineCount: number;
  receivedLineCount: number;
};

export type ScannerPoLine = {
  id: string;
  lineNo: number;
  itemCode: string;
  itemName: string;
  qty: DecimalString;
  uom: string;
  receivedQty: DecimalString;
};

export type ScannerPoDetail = {
  id: string;
  poNumber: string;
  supplierCode: string | null;
  supplierName: string;
  expectedDelivery: string | null;
  status: string;
  lines: ScannerPoLine[];
};

export type ReceiveLineInput = {
  clientOpId: string;
  poLineId: string;
  qty: DecimalString;
  batchNumber?: string | null;
  bestBefore?: string | null;
  /**
   * Lane W9-L8: optional destination location for the created LP. When set it
   * must be an org-owned location (validated in-txn); the LP then lands there
   * (with that location's warehouse_id) instead of the default warehouse
   * location. Absent/null keeps the legacy default-location behaviour.
   */
  toLocationId?: string | null;
};

export type ReceiveLineResult =
  | {
      ok: true;
      replay?: false;
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
    }
  | {
      ok: false;
      reason: string;
      message: string;
    }
  | {
      ok: true;
      replay: true;
      grnId: string | null;
      grnNumber: string | null;
      grnItemId: string | null;
      lpId: string | null;
      lpNumber: string | null;
      qty: DecimalString | null;
      uom: string | null;
      overReceived: boolean;
      poStatus: string | null;
      qcInspectionRequired: boolean;
      inspectionId: string | null;
    };

type PoSummaryRow = {
  id: string;
  po_number: string;
  supplier_code: string | null;
  supplier_name: string;
  expected_delivery: string | Date | null;
  status: string;
  line_count: string | number;
  received_line_count: string | number;
};

type PoLineRow = {
  id: string;
  line_no: number;
  item_code: string;
  item_name: string;
  qty: string;
  uom: string;
  received_qty: string | null;
};

const OPEN_PO_STATUSES = ['sent', 'confirmed', 'partially_received'] as const;
const DECIMAL_SCALE = 6n;
const DECIMAL_FACTOR = 1_000_000n;
const APP_VERSION = 'warehouse-scanner-receive-po-v1';
const NO_WAREHOUSE_FOR_SITE_MESSAGE =
  'No warehouse is configured for your site — set one in Settings -> Sites';

export async function listScannerPurchaseOrders(
  client: QueryClient,
  session: ScannerSessionRow,
): Promise<ScannerPoSummary[]> {
  const { rows } = await client.query<PoSummaryRow>(
    `select po.id,
            po.po_number,
            s.code as supplier_code,
            s.name as supplier_name,
            po.expected_delivery,
            po.status,
            count(pol.id)::int as line_count,
            count(pol.id) filter (
              where coalesce(rec.received_qty, 0) >= pol.qty
            )::int as received_line_count
       from public.purchase_orders po
       join public.suppliers s
         on s.id = po.supplier_id
        and s.org_id = po.org_id
       left join public.purchase_order_lines pol
         on pol.po_id = po.id
        and pol.org_id = po.org_id
       left join (
         select po_line_id, sum(received_qty) as received_qty
           from public.grn_items
          where org_id = $1::uuid
            and po_line_id is not null
            and cancelled_at is null
          group by po_line_id
       ) rec on rec.po_line_id = pol.id
      where po.org_id = $1::uuid
        and po.status = any($2::text[])
        and app.user_can_see_site(po.site_id)
      group by po.id, po.po_number, s.code, s.name, po.expected_delivery, po.status
      order by po.expected_delivery asc nulls last, po.po_number asc`,
    [session.org_id, OPEN_PO_STATUSES],
  );

  return rows.map((row) => ({
    id: row.id,
    poNumber: row.po_number,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    expectedDelivery: toDateString(row.expected_delivery),
    status: row.status,
    lineCount: Number(row.line_count),
    receivedLineCount: Number(row.received_line_count),
  }));
}

export async function getScannerPurchaseOrder(
  client: QueryClient,
  session: ScannerSessionRow,
  poId: string,
): Promise<ScannerPoDetail | null> {
  const { rows } = await client.query<PoSummaryRow & PoLineRow>(
    `select po.id as po_id,
            po.po_number,
            s.code as supplier_code,
            s.name as supplier_name,
            po.expected_delivery,
            po.status,
            pol.id,
            pol.line_no,
            i.item_code,
            i.name as item_name,
            pol.qty::text as qty,
            pol.uom,
            coalesce(rec.received_qty, 0)::text as received_qty,
            0::int as line_count,
            0::int as received_line_count
       from public.purchase_orders po
       join public.suppliers s
         on s.id = po.supplier_id
        and s.org_id = po.org_id
       join public.purchase_order_lines pol
         on pol.po_id = po.id
        and pol.org_id = po.org_id
       join public.items i
         on i.id = pol.item_id
        and i.org_id = pol.org_id
       left join (
         select po_line_id, sum(received_qty) as received_qty
           from public.grn_items
          where org_id = $1::uuid
            and po_line_id is not null
            and cancelled_at is null
          group by po_line_id
       ) rec on rec.po_line_id = pol.id
      where po.org_id = $1::uuid
        and po.id = $2::uuid
        and po.status = any($3::text[])
        and app.user_can_see_site(po.site_id)
      order by pol.line_no asc`,
    [session.org_id, poId, OPEN_PO_STATUSES],
  );

  if (!rows[0]) return null;
  return {
    id: String((rows[0] as unknown as { po_id: string }).po_id),
    poNumber: rows[0].po_number,
    supplierCode: rows[0].supplier_code,
    supplierName: rows[0].supplier_name,
    expectedDelivery: toDateString(rows[0].expected_delivery),
    status: rows[0].status,
    lines: rows.map((row) => ({
      id: row.id,
      lineNo: row.line_no,
      itemCode: row.item_code,
      itemName: row.item_name,
      qty: normalizeDecimal(row.qty),
      uom: row.uom,
      receivedQty: normalizeDecimal(row.received_qty ?? '0'),
    })),
  };
}

export async function receiveScannerPoLine(
  client: QueryClient,
  session: ScannerSessionRow,
  input: ReceiveLineInput,
): Promise<ReceiveLineResult> {
  validateReceiveInput(input);

  const replay = await findReplay(client, session, input.clientOpId);
  if (replay) return replay;

  await client.query('begin');
  let orgContextToken: string | null = null;
  try {
    // Review fix F1: register a TRANSACTION-scoped org context right after BEGIN.
    // The QC-flag branch below calls public.next_quality_inspection_number($org)
    // which raises 28000 unless app.current_org_id() = $org, and
    // app.current_org_id() resolves via app.active_org_contexts keyed on the
    // CURRENT txid (migration 002) — the autocommit set_config done by
    // withScannerOrg's 3-arg overload never reaches it. See
    // lib/scanner/txn-org-context.ts for the full rationale.
    // Audit note: most scanner SQL passes session.org_id explicitly ($1::uuid),
    // while the outbox insert below and QC allocator rely on app.current_org_id().
    orgContextToken = await registerTxnOrgContext(client, session.org_id, session.user_id);

    const inTxnReplay = await findReplay(client, session, input.clientOpId);
    if (inTxnReplay) {
      await client.query('commit');
      return inTxnReplay;
    }

    const line = await loadLineForUpdate(client, session, input.poLineId);
    if (!line) {
      await insertAudit(client, session, input.clientOpId, 'not_found', {});
      await client.query('commit');
      throw new ReceivePoError('po_line_not_found', 404);
    }

    const qty = parseDecimal(input.qty);
    if (qty <= 0n) throw new ReceivePoError('invalid_qty', 400);
    const ordered = parseDecimal(line.ordered_qty);
    const alreadyReceived = parseDecimal(line.received_qty ?? '0');
    const afterLine = alreadyReceived + qty;
    const cap = (ordered * 110n) / 100n;
    if (afterLine > cap) {
      await insertAudit(client, session, input.clientOpId, 'over_receive_cap', {
        poLineId: input.poLineId,
        requestedQty: input.qty,
        orderedQty: line.ordered_qty,
        receivedQty: line.received_qty ?? '0',
      });
      await client.query('commit');
      throw new ReceivePoError('over_receive_cap', 409);
    }

    // Lane W9-L8: optional explicit destination. Validated INSIDE the txn,
    // org-scoped (l.org_id = session.org_id) — a location from another org or
    // a vanished id is indistinguishable from "not found" → 422
    // invalid_location, audited like the other in-txn rejections.
    let requestedLocation: RequestedLocation | null = null;
    if (input.toLocationId) {
      requestedLocation = await resolveRequestedLocation(client, session, input.toLocationId);
      if (!requestedLocation) {
        await insertAudit(client, session, input.clientOpId, 'invalid_location', {
          poLineId: input.poLineId,
          toLocationId: input.toLocationId,
        });
        await client.query('commit');
        throw new ReceivePoError('invalid_location', 422);
      }
    }

    const warehouse = await resolveWarehouse(client, session, {
      explicitWarehouseId: requestedLocation?.warehouse_id ?? null,
      poDestinationWarehouseId: line.destination_warehouse_id,
    });
    if (!warehouse) {
      await insertAudit(client, session, input.clientOpId, 'no_warehouse_for_site', {
        poLineId: input.poLineId,
        siteId: session.site_id,
      });
      await client.query('commit');
      return {
        ok: false,
        reason: 'no_warehouse_for_site',
        message: NO_WAREHOUSE_FOR_SITE_MESSAGE,
      };
    }

    if (requestedLocation && requestedLocation.warehouse_id !== warehouse.id) {
      await insertAudit(client, session, input.clientOpId, 'invalid_location', {
        poLineId: input.poLineId,
        toLocationId: input.toLocationId,
      });
      await client.query('commit');
      throw new ReceivePoError('invalid_location', 422);
    }

    // Destination for the new LP (and its GRN item line): explicit destination
    // location, PO destination warehouse, then the session-site/default fallback.
    // The GRN header uses the same resolved warehouse target.
    const destWarehouseId = warehouse.id;
    const destLocationId = requestedLocation?.id ?? warehouse.default_location_id;

    const grn = await getOrCreateOpenGrn(client, session, {
      poId: line.po_id,
      supplierId: line.supplier_id,
      warehouseId: warehouse.id,
      locationId: warehouse.default_location_id,
    });

    const lpNumber = makeLpNumber();
    // Canonical expiry (audit F-B07, owner decision W9-K-I): every reader
    // (v_inventory_available FEFO ordering, expiry tiers, alerts) reads
    // expiry_date, so that is what receive writes. Source: the operator's
    // explicit best-before input when provided, else computed from
    // items.shelf_life_days (mig 153) off the receive date; best_before_date
    // stays populated for back-compat and shelf_life_mode is snapshotted.
    const expiryDate = computeExpiryDate(input.bestBefore ?? null, line.shelf_life_days);
    const lp = await insertLicensePlate(client, session, {
      lpNumber,
      siteId: session.site_id,
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
    await insertLpAutoPutaway(client, session, {
      lpId: lp.id,
      transactionId: randomUUID(),
    });

    const grnItem = await insertGrnItem(client, session, {
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

    await insertLpGenesis(client, session, {
      lpId: lp.id,
      grnId: grn.id,
      transactionId: randomUUID(),
    });

    await emitLpReceived(client, session, {
      lpId: lp.id,
      grnId: grn.id,
      itemId: line.item_id,
      qty: formatDecimal(qty),
      uom: line.uom,
    });

    // Audit finding #4: honor tenant_variations.feature_flags->require_grn_qc_inspection.
    // The LP above is always inserted with qa_status='pending' (never auto-released);
    // when the flag is ON we additionally open a pending quality inspection for the LP.
    const qcInspectionRequired = await requiresGrnQcInspection(client, session);
    const inspectionId = qcInspectionRequired
      ? await insertQcInspectionForLp(client, session, { lpId: lp.id, productId: line.item_id })
      : null;

    const poStatus = await rollupPurchaseOrderStatus(client, session, line.po_id);
    const overReceived = afterLine > ordered;
    await insertAudit(client, session, input.clientOpId, 'ok', {
      poId: line.po_id,
      poLineId: line.id,
      grnId: grn.id,
      grnItemId: grnItem.id,
      lpId: lp.id,
      lpNumber,
      qty: formatDecimal(qty),
      uom: line.uom,
      overReceived,
      poStatus,
      qcInspectionRequired,
      inspectionId,
    });

    await client.query('commit');
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
    };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    // After COMMIT the session token row persists — delete it (no-op after
    // ROLLBACK, where the in-txn insert already vanished).
    await cleanupTxnOrgContext(client, orgContextToken);
  }
}

export class ReceivePoError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = 'ReceivePoError';
  }
}

type LineForReceive = {
  id: string;
  org_id: string;
  po_id: string;
  item_id: string;
  supplier_id: string;
  destination_warehouse_id: string | null;
  line_no: number;
  ordered_qty: string;
  uom: string;
  received_qty: string | null;
  shelf_life_days: number | null;
  shelf_life_mode: string | null;
};

async function loadLineForUpdate(
  client: QueryClient,
  session: ScannerSessionRow,
  poLineId: string,
): Promise<LineForReceive | null> {
  // LIVE 500 fix: Postgres forbids FOR UPDATE with GROUP BY ("FOR UPDATE is
  // not allowed with GROUP BY clause"). The received-qty aggregate moves into
  // a correlated scalar subquery so the row-lock applies to plain pol/po rows.
  // (The unit tests mock the client, so only the live walk caught this.)
  // Expiry (audit F-B07): items.shelf_life_days + shelf_life_mode (migration
  // 153, 03-Technical item master) ride along so the receive can compute the
  // canonical expiry_date. LEFT JOIN — a missing item must not block the
  // receive — and i stays OUT of `for update of pol, po` (the nullable side of
  // an outer join cannot be row-locked).
  const { rows } = await client.query<LineForReceive>(
    `select pol.id,
            pol.org_id,
            pol.po_id,
            pol.item_id,
            po.supplier_id,
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
       left join public.items i
         on i.id = pol.item_id
        and i.org_id = pol.org_id
      where pol.org_id = $1::uuid
        and pol.id = $2::uuid
        and po.status = any($3::text[])
      for update of pol, po`,
    [session.org_id, poLineId, OPEN_PO_STATUSES],
  );
  return rows[0] ?? null;
}

type RequestedLocation = { id: string; warehouse_id: string };

// Lane W9-L8: org-scoped lookup of the operator-chosen destination. Runs
// inside the receive txn so the validity check and the LP insert see the same
// snapshot. Filters by session.org_id explicitly (org_id discipline — the
// scanner pool is BYPASSRLS).
async function resolveRequestedLocation(
  client: QueryClient,
  session: ScannerSessionRow,
  locationId: string,
): Promise<RequestedLocation | null> {
  const { rows } = await client.query<RequestedLocation>(
    `select l.id, l.warehouse_id
       from public.locations l
      where l.org_id = $1::uuid
        and l.id = $2::uuid
      limit 1`,
    [session.org_id, locationId],
  );
  return rows[0] ?? null;
}

type WarehouseTarget = { id: string; default_location_id: string | null };

async function resolveWarehouse(
  client: QueryClient,
  session: ScannerSessionRow,
  input: { explicitWarehouseId?: string | null; poDestinationWarehouseId?: string | null } = {},
): Promise<WarehouseTarget | null> {
  const { rows } = await client.query<WarehouseTarget>(
    `select w.id,
            (select l.id
               from public.locations l
              where l.org_id = w.org_id
                and l.warehouse_id = w.id
              order by l.level asc, l.code asc
              limit 1) as default_location_id
       from public.warehouses w
      where w.org_id = app.current_org_id()
      order by case
                 when $1::uuid is not null and w.id = $1::uuid then 0
                 when $2::uuid is not null and w.id = $2::uuid then 1
                 when $3::uuid is not null and w.site_id = $3::uuid then 2
                 else 3
               end,
               w.is_default desc,
               w.created_at asc,
               w.id asc
      limit 1`,
    [input.explicitWarehouseId ?? null, input.poDestinationWarehouseId ?? null, session.site_id],
  );
  return rows[0] ?? null;
}

type GrnRow = { id: string; grn_number: string };

async function getOrCreateOpenGrn(
  client: QueryClient,
  session: ScannerSessionRow,
  input: { poId: string; supplierId: string; warehouseId: string; locationId: string | null },
): Promise<GrnRow> {
  await client.query(
    `select pg_advisory_xact_lock(hashtextextended($1::text || ':grn-day:' || to_char(current_date, 'YYYYMMDD'), 0))`,
    [session.org_id],
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
    [session.org_id, input.poId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const grnNumber = await nextGrnNumber(client, session);
  const inserted = await client.query<GrnRow>(
    `insert into public.grns (
       org_id, source_type, po_id, supplier_id, warehouse_id, default_location_id,
       grn_number, status, received_by, created_by, updated_by
     )
     values ($1::uuid, 'po', $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'draft', $7::uuid, $7::uuid, $7::uuid)
     returning id, grn_number`,
    [
      session.org_id,
      input.poId,
      input.supplierId,
      input.warehouseId,
      input.locationId,
      grnNumber,
      session.user_id,
    ],
  );
  return inserted.rows[0]!;
}

async function nextGrnNumber(client: QueryClient, session: ScannerSessionRow): Promise<string> {
  const { rows } = await client.query<{ seq: number }>(
    `select coalesce(max(substring(grn_number from 'GRN-[0-9]{8}-([0-9]+)$')::int), 0) + 1 as seq
       from public.grns
      where org_id = $1::uuid
        and grn_number like 'GRN-' || to_char(current_date, 'YYYYMMDD') || '-%'`,
    [session.org_id],
  );
  return `GRN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(rows[0]?.seq ?? 1).padStart(4, '0')}`;
}

async function insertLicensePlate(
  client: QueryClient,
  session: ScannerSessionRow,
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
      session.org_id,
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
      session.user_id,
    ],
  );
  return rows[0]!;
}

async function insertLpAutoPutaway(
  client: QueryClient,
  session: ScannerSessionRow,
  input: { lpId: string; transactionId: string },
): Promise<void> {
  await client.query(
    `insert into public.lp_state_history
       (org_id, lp_id, from_state, to_state, reason_code, stock_move_id, transaction_id, created_by)
     values
       (app.current_org_id(), $1::uuid, 'received', 'available', $2, $3::uuid, $4::uuid, $5::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [input.lpId, 'auto_putaway_po_receive', null, input.transactionId, session.user_id],
  );
}

async function insertGrnItem(
  client: QueryClient,
  session: ScannerSessionRow,
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
  const lineNumber = await nextGrnItemLineNumber(client, session, input.grnId);
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
      session.org_id,
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
      session.user_id,
    ],
  );
  return rows[0]!;
}

async function nextGrnItemLineNumber(client: QueryClient, session: ScannerSessionRow, grnId: string): Promise<number> {
  const { rows } = await client.query<{ line_number: number }>(
    `select coalesce(max(line_number), 0) + 1 as line_number
       from public.grn_items
      where org_id = $1::uuid
        and grn_id = $2::uuid`,
    [session.org_id, grnId],
  );
  return Number(rows[0]?.line_number ?? 1);
}

async function insertLpGenesis(
  client: QueryClient,
  session: ScannerSessionRow,
  input: { lpId: string; grnId: string; transactionId: string },
): Promise<void> {
  await client.query(
    `insert into public.lp_state_history (
       org_id, lp_id, from_state, to_state, reason_code, reason_text,
       grn_id, transaction_id, created_by
     )
     values ($1::uuid, $2::uuid, null, 'received', 'scanner_receive_po', 'Scanner PO receipt', $3::uuid, $4::uuid, $5::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [session.org_id, input.lpId, input.grnId, input.transactionId, session.user_id],
  );
}

async function emitLpReceived(
  client: QueryClient,
  session: ScannerSessionRow,
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
        org_id: session.org_id,
        actor: session.user_id,
      }),
      APP_VERSION,
    ],
  );
}

async function requiresGrnQcInspection(client: QueryClient, session: ScannerSessionRow): Promise<boolean> {
  const { rows } = await client.query<{ require_qc: boolean }>(
    `select (tv.feature_flags->>'require_grn_qc_inspection') = 'true' as require_qc
       from public.tenant_variations tv
      where tv.org_id = $1::uuid`,
    [session.org_id],
  );
  return rows[0]?.require_qc === true;
}

async function insertQcInspectionForLp(
  client: QueryClient,
  session: ScannerSessionRow,
  input: { lpId: string; productId: string },
): Promise<string | null> {
  // Idempotency: the receive itself is guarded by scanner_audit_log(org_id, client_op_id)
  // replay detection, so this only runs once per client operation. The NOT EXISTS guard is
  // belt-and-suspenders against a second pending inspection ever being opened for the same LP.
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
    [session.org_id, input.lpId, input.productId, session.user_id],
  );
  return rows[0]?.id ?? null;
}

async function rollupPurchaseOrderStatus(
  client: QueryClient,
  session: ScannerSessionRow,
  poId: string,
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
    [session.org_id, poId],
  );
  const status = rows[0]?.is_received ? 'received' : 'partially_received';
  await client.query(
    `update public.purchase_orders
        set status = $3,
            updated_by = $4::uuid,
            updated_at = now()
      where org_id = $1::uuid
        and id = $2::uuid`,
    [session.org_id, poId, status, session.user_id],
  );

  // Receipt finalisation (the missing status flip): the ONLY honest
  // "fully received" signal in this flow is the PO rolling up to 'received'
  // (every line's summed received_qty >= ordered qty — see is_received above).
  // At that moment the open draft GRN(s) for this PO represent the finalised
  // receipt, so flip them to 'completed' + stamp completed_at. A partial
  // receipt leaves the PO 'partially_received' and the GRN stays 'draft' by
  // design. The update is idempotent (only 'draft' rows flip), org-scoped, and
  // runs inside the receive txn after the grn_item insert, so the
  // grn_items_block_completed_grn freeze (mig 193/299) never sees a conflict.
  // getOrCreateOpenGrn only reuses *same-day* drafts, so a multi-day receipt
  // can leave several draft GRNs for one PO — completing them all is correct
  // because the PO is now fully received.
  if (status === 'received') {
    await completeFullyReceivedGrns(client, session, poId);
  }

  return status;
}

async function completeFullyReceivedGrns(
  client: QueryClient,
  session: ScannerSessionRow,
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
    [session.org_id, poId, session.user_id],
  );
}

async function insertAudit(
  client: QueryClient,
  session: ScannerSessionRow,
  clientOpId: string,
  resultCode: string,
  ext: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `insert into public.scanner_audit_log (
       org_id, session_id, user_id, device_id, operation, result_code, client_op_id, ext
     )
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'scanner.receive_po', $5, $6, $7::jsonb)
     on conflict (org_id, operation, client_op_id) where client_op_id is not null and operation not like 'client.%' do nothing`,
    [session.org_id, session.id, session.user_id, session.device_id, resultCode, clientOpId, JSON.stringify(ext)],
  );
}

async function findReplay(
  client: QueryClient,
  session: ScannerSessionRow,
  clientOpId: string,
): Promise<ReceiveLineResult | null> {
  const { rows } = await client.query<{ result_code: string | null; ext: Record<string, unknown> | string | null }>(
    `select result_code, ext
       from public.scanner_audit_log
      where org_id = $1::uuid
        and client_op_id = $2
        and operation = 'scanner.receive_po'
      limit 1`,
    [session.org_id, clientOpId],
  );
  const row = rows[0];
  if (!row) return null;
  const ext = typeof row.ext === 'string' ? (JSON.parse(row.ext) as Record<string, unknown>) : (row.ext ?? {});
  if (row.result_code !== 'ok') {
    return {
      ok: false,
      reason: stringOrNull(ext.reason) ?? row.result_code ?? 'failed',
      message: stringOrNull(ext.message) ?? 'Previous receive attempt failed',
    };
  }
  return {
    ok: true,
    replay: true,
    grnId: stringOrNull(ext.grnId),
    grnNumber: stringOrNull(ext.grnNumber),
    grnItemId: stringOrNull(ext.grnItemId),
    lpId: stringOrNull(ext.lpId),
    lpNumber: stringOrNull(ext.lpNumber),
    qty: stringOrNull(ext.qty),
    uom: stringOrNull(ext.uom),
    overReceived: ext.overReceived === true,
    poStatus: stringOrNull(ext.poStatus),
    qcInspectionRequired: ext.qcInspectionRequired === true,
    inspectionId: stringOrNull(ext.inspectionId),
  };
}

function validateReceiveInput(input: ReceiveLineInput): void {
  if (!input.clientOpId || input.clientOpId.length > 120) throw new ReceivePoError('invalid_client_op_id', 400);
  if (!isUuid(input.poLineId)) throw new ReceivePoError('invalid_po_line_id', 400);
  parseDecimal(input.qty);
  if (input.bestBefore && !/^\d{4}-\d{2}-\d{2}$/.test(input.bestBefore)) {
    throw new ReceivePoError('invalid_best_before', 400);
  }
  // Lane W9-L8: a malformed destination id can never resolve → same 422 as an
  // org-invalid one (the route also shape-checks; this is defence in depth).
  if (input.toLocationId && !isUuid(input.toLocationId)) {
    throw new ReceivePoError('invalid_location', 422);
  }
}

export function parseDecimal(input: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(input)) throw new ReceivePoError('invalid_qty', 400);
  const [whole, frac = ''] = input.split('.');
  return BigInt(whole) * DECIMAL_FACTOR + BigInt(frac.padEnd(Number(DECIMAL_SCALE), '0'));
}

export function formatDecimal(value: bigint): string {
  const whole = value / DECIMAL_FACTOR;
  const frac = (value % DECIMAL_FACTOR).toString().padStart(Number(DECIMAL_SCALE), '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

function normalizeDecimal(value: string): string {
  return formatDecimal(parseDecimal(String(value).replace(/0+$/, '').replace(/\.$/, '') || '0'));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Audit F-B07: canonical expiry source. Operator-entered best-before wins;
// otherwise receive date (today, UTC) + items.shelf_life_days; null when the
// item has no shelf life configured (FEFO then orders it last via NULLS LAST).
export function computeExpiryDate(bestBefore: string | null, shelfLifeDays: number | null): string | null {
  if (bestBefore) return bestBefore;
  if (shelfLifeDays == null || !Number.isFinite(shelfLifeDays) || shelfLifeDays < 0) return null;
  const expiry = new Date(Date.now() + Math.trunc(shelfLifeDays) * 86_400_000);
  return expiry.toISOString().slice(0, 10);
}

function makeLpNumber(): string {
  return `LP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')}`;
}

function toDateString(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
