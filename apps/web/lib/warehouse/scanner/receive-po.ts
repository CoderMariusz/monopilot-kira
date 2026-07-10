import { hasPermission } from '../../auth/has-permission';
import { cleanupTxnOrgContext, registerTxnOrgContext } from '../../scanner/txn-org-context';
import {
  bookReceiptWacAfterGrnItem,
  BookReceiptWacError,
  preflightReceiptWacResolvability,
} from '../../finance/book-receipt-wac';

const WAREHOUSE_GRN_RECEIVE_PERMISSION = 'warehouse.grn.receive';

import {
  computeExpiryDate,
  executeReceivePoLineCore,
  formatDecimal,
  makeLpNumber,
  OPEN_PO_STATUSES,
  parseDecimal,
  ReceivePoLineCoreError,
  RECEIVE_PO_APP_VERSION,
  type ReceivePoLineCoreInput,
} from '../receive-po-line-core';

import type { QueryClient } from '../../scanner/db';
import type { ScannerSessionRow } from '../../scanner/session';

export type DecimalString = string;

export { computeExpiryDate, formatDecimal, parseDecimal };

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

  if (
    !(await hasPermission(
      { client, userId: session.user_id, orgId: session.org_id },
      WAREHOUSE_GRN_RECEIVE_PERMISSION,
    ))
  ) {
    throw new ReceivePoError('forbidden', 403);
  }

  const replay = await findReplay(client, session, input.clientOpId);
  if (replay) return replay;

  await client.query('begin');
  let orgContextToken: string | null = null;
  try {
    orgContextToken = await registerTxnOrgContext(client, session.org_id, session.user_id);

    const inTxnReplay = await findReplay(client, session, input.clientOpId);
    if (inTxnReplay) {
      await client.query('commit');
      return inTxnReplay;
    }

    const coreInput: ReceivePoLineCoreInput = {
      poLineId: input.poLineId,
      qty: input.qty,
      batchNumber: input.batchNumber ?? null,
      bestBefore: input.bestBefore ?? null,
      toLocationId: input.toLocationId ?? null,
      confirmOverReceive: true,
    };

    const coreResult = await executeReceivePoLineCore(
      client,
      { orgId: session.org_id, userId: session.user_id, siteId: session.site_id },
      coreInput,
      {
        mode: 'scanner',
        genesisReasonCode: 'scanner_receive_po',
        genesisReasonText: 'Scanner PO receipt',
        requireOverReceiveConfirm: false,
        preflightBeforeReceiptWrites(receipt) {
          return preflightReceiptWacResolvability(
            client,
            { orgId: session.org_id, userId: session.user_id, siteId: session.site_id },
            receipt,
          );
        },
        afterGrnItemInserted(receipt) {
          return bookReceiptWacAfterGrnItem(
            client,
            { orgId: session.org_id, userId: session.user_id, siteId: session.site_id },
            receipt,
          );
        },
      },
    );

    if (!coreResult.ok) {
      if (coreResult.code === 'not_found') {
        await insertAudit(client, session, input.clientOpId, 'not_found', {});
        await client.query('commit');
        throw new ReceivePoError('po_line_not_found', 404);
      }
      if (coreResult.code === 'invalid_qty') {
        throw new ReceivePoError('invalid_qty', 400);
      }
      if (coreResult.code === 'over_receive_cap') {
        await insertAudit(client, session, input.clientOpId, 'over_receive_cap', {
          poLineId: input.poLineId,
          requestedQty: input.qty,
          orderedQty: coreResult.orderedQty,
          receivedQty: coreResult.receivedQty,
        });
        await client.query('commit');
        throw new ReceivePoError('over_receive_cap', 409);
      }
      if (coreResult.code === 'invalid_location') {
        await insertAudit(client, session, input.clientOpId, 'invalid_location', {
          poLineId: input.poLineId,
          toLocationId: input.toLocationId,
        });
        await client.query('commit');
        throw new ReceivePoError('invalid_location', 422);
      }
      if (coreResult.code === 'no_warehouse') {
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
      throw new ReceivePoError(coreResult.code, 400);
    }

    await insertAudit(client, session, input.clientOpId, 'ok', {
      poId: coreResult.poId,
      poLineId: input.poLineId,
      grnId: coreResult.grnId,
      grnItemId: coreResult.grnItemId,
      lpId: coreResult.lpId,
      lpNumber: coreResult.lpNumber,
      qty: coreResult.qty,
      uom: coreResult.uom,
      overReceived: coreResult.overReceived,
      poStatus: coreResult.poStatus,
      qcInspectionRequired: coreResult.qcInspectionRequired,
      inspectionId: coreResult.inspectionId,
    });

    await client.query('commit');
    return {
      ok: true,
      grnId: coreResult.grnId,
      grnNumber: coreResult.grnNumber,
      grnItemId: coreResult.grnItemId,
      lpId: coreResult.lpId,
      lpNumber: coreResult.lpNumber,
      qty: coreResult.qty,
      uom: coreResult.uom,
      overReceived: coreResult.overReceived,
      poStatus: coreResult.poStatus,
      qcInspectionRequired: coreResult.qcInspectionRequired,
      inspectionId: coreResult.inspectionId,
    };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    if (err instanceof BookReceiptWacError && err.code === 'unresolved_uom') {
      throw new ReceivePoError('unresolved_uom', 422);
    }
    if (err instanceof BookReceiptWacError && (err.code === 'unsupported_currency' || err.code === 'unknown_currency')) {
      throw new ReceivePoError(err.code, 422);
    }
    throw err;
  } finally {
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
  try {
    parseDecimal(input.qty);
  } catch (err) {
    if (err instanceof ReceivePoLineCoreError) throw new ReceivePoError(err.code, err.status);
    throw err;
  }
  if (input.bestBefore && !/^\d{4}-\d{2}-\d{2}$/.test(input.bestBefore)) {
    throw new ReceivePoError('invalid_best_before', 400);
  }
  if (input.toLocationId && !isUuid(input.toLocationId)) {
    throw new ReceivePoError('invalid_location', 422);
  }
}

function normalizeDecimal(value: string): string {
  return formatDecimal(parseDecimal(String(value).replace(/0+$/, '').replace(/\.$/, '') || '0'));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toDateString(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// Re-export for tests that assert APP_VERSION via outbox — core owns the constant.
export const APP_VERSION = RECEIVE_PO_APP_VERSION;

// Tests spy on makeLpNumber via receive-po module path — re-export core helper.
export { makeLpNumber };
