'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';
import { bookReceiptWacAfterGrnItem, BookReceiptWacError } from '../../../../../../lib/finance/book-receipt-wac';
import { getActiveSiteId } from '../../../../../../lib/site/site-context';
import {
  executeReceivePoLineCore,
  OPEN_PO_STATUSES,
  parseDecimal,
  ReceivePoLineCoreError,
} from '../../../../../../lib/warehouse/receive-po-line-core';

import { hasWarehousePermission } from './shared';
import type { DesktopReceiveInput, DesktopReceiveResult, PoReceiveDetail } from './receive-po-line.types';

const WAREHOUSE_GRN_RECEIVE_PERMISSION = 'warehouse.grn.receive';
const WAREHOUSE_READ_PERMISSION = 'warehouse.inventory.read';

export async function receivePoLineDesktop(input: DesktopReceiveInput): Promise<DesktopReceiveResult> {
  const validationError = validateReceiveInput(input);
  if (validationError) return validationError;

  try {
    const result = await withOrgContext(async (ctx): Promise<DesktopReceiveResult & { poId?: string }> => {
      const { client, userId, orgId } = ctx;

      if (!(await hasWarehousePermission({ client, userId, orgId }, WAREHOUSE_GRN_RECEIVE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const activeSiteId = await getActiveSiteId({ client });

      const coreResult = await executeReceivePoLineCore(
        client,
        { orgId, userId, siteId: activeSiteId },
        {
          poLineId: input.poLineId,
          qty: input.qty,
          batchNumber: input.batchNumber ?? null,
          bestBefore: input.bestBefore ?? null,
          toLocationId: input.toLocationId ?? null,
          warehouseId: input.warehouseId ?? null,
          confirmOverReceive: input.confirmOverReceive ?? false,
        },
        {
          mode: 'desktop',
          genesisReasonCode: 'desktop_receive_po',
          genesisReasonText: 'Desktop PO receipt',
          requireOverReceiveConfirm: true,
          afterGrnItemInserted(receipt) {
            return bookReceiptWacAfterGrnItem(client, { orgId, userId, siteId: activeSiteId }, receipt);
          },
        },
      );

      if (!coreResult.ok) {
        const map: Record<string, DesktopReceiveResult> = {
          not_found: { ok: false, error: 'not_found' },
          invalid_qty: { ok: false, error: 'invalid_qty' },
          over_receive_cap: { ok: false, error: 'over_receive_cap' },
          over_receive_confirm_required: { ok: false, error: 'over_receive_confirm_required' },
          no_warehouse: { ok: false, error: 'no_warehouse' },
          invalid_location: { ok: false, error: 'invalid_location' },
        };
        const mapped = map[coreResult.code] ?? { ok: false, error: 'error' as const };
        return { ...mapped, poId: coreResult.poId };
      }

      return {
        ok: true,
        grnId: coreResult.grnId,
        grnNumber: coreResult.grnNumber,
        lpId: coreResult.lpId,
        lpNumber: coreResult.lpNumber,
        qty: coreResult.qty,
        uom: coreResult.uom,
        overReceived: coreResult.overReceived,
        poStatus: coreResult.poStatus,
        qcInspectionRequired: coreResult.qcInspectionRequired,
        inspectionId: coreResult.inspectionId,
        poId: coreResult.poId,
      };
    });

    if (result.poId) {
      revalidateReceivePaths(result.poId);
    }
    const { poId: _poId, ...publicResult } = result;
    return publicResult;
  } catch (err) {
    if (err instanceof ReceivePoLineCoreError && err.code === 'invalid_qty') {
      return { ok: false, error: 'invalid_qty' };
    }
    if (err instanceof BookReceiptWacError && err.code === 'unresolved_uom') {
      return { ok: false, error: 'wac_unresolved_uom' };
    }
    if (err instanceof BookReceiptWacError && err.code === 'unknown_currency') {
      return { ok: false, error: 'error' };
    }
    if (err instanceof Error && err.message === 'invalid_qty') return { ok: false, error: 'invalid_qty' };
    console.error('[warehouse] receivePoLineDesktop failed', err);
    return { ok: false, error: 'error' };
  }
}

export async function getPoForReceive(poId: string): Promise<
  | { ok: true; data: PoReceiveDetail }
  | { ok: false; error: 'forbidden' | 'not_found' | 'invalid_state' | 'error' }
> {
  if (!isUuid(poId)) return { ok: false, error: 'not_found' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      if (!(await hasWarehousePermission({ client, userId, orgId }, WAREHOUSE_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await client.query<{
        id: string;
        po_number: string;
        supplier_name: string | null;
        status: string;
        line_id: string;
        line_no: number;
        item_code: string | null;
        item_name: string | null;
        ordered_qty: string;
        received_qty: string;
        uom: string;
        shelf_life_days: number | null;
      }>(
        `select po.id::text,
                po.po_number,
                s.name as supplier_name,
                po.status,
                pol.id::text as line_id,
                pol.line_no,
                i.item_code,
                i.name as item_name,
                pol.qty::text as ordered_qty,
                coalesce(rec.received_qty, 0)::text as received_qty,
                pol.uom,
                i.shelf_life_days
           from public.purchase_orders po
           left join public.suppliers s
             on s.id = po.supplier_id
            and s.org_id = po.org_id
           join public.purchase_order_lines pol
             on pol.po_id = po.id
            and pol.org_id = po.org_id
           left join public.items i
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
        [orgId, poId, OPEN_PO_STATUSES],
      );

      if (!rows[0]) {
        const closed = await client.query<{ id: string }>(
          `select id::text from public.purchase_orders where org_id = $1::uuid and id = $2::uuid and app.user_can_see_site(site_id) limit 1`,
          [orgId, poId],
        );
        if (closed.rows[0]) return { ok: false, error: 'invalid_state' };
        return { ok: false, error: 'not_found' };
      }

      return {
        ok: true,
        data: {
          id: rows[0].id,
          poNumber: rows[0].po_number,
          supplierName: rows[0].supplier_name,
          status: rows[0].status,
          lines: rows.map((row) => ({
            id: row.line_id,
            lineNo: row.line_no,
            itemCode: row.item_code,
            itemName: row.item_name,
            orderedQty: row.ordered_qty,
            receivedQty: row.received_qty,
            uom: row.uom,
            shelfLifeDays: row.shelf_life_days,
          })),
        },
      };
    });
  } catch (err) {
    console.error('[warehouse] getPoForReceive failed', err);
    return { ok: false, error: 'error' };
  }
}

function validateReceiveInput(input: DesktopReceiveInput): DesktopReceiveResult | null {
  if (!isUuid(input.poLineId)) return { ok: false, error: 'not_found' };
  try {
    parseDecimal(input.qty);
  } catch {
    return { ok: false, error: 'invalid_qty' };
  }
  if (input.bestBefore && !/^\d{4}-\d{2}-\d{2}$/.test(input.bestBefore)) return { ok: false, error: 'invalid_qty' };
  if (input.toLocationId && !isUuid(input.toLocationId)) return { ok: false, error: 'invalid_location' };
  if (input.warehouseId && !isUuid(input.warehouseId)) return { ok: false, error: 'no_warehouse' };
  return null;
}

function revalidateReceivePaths(poId: string): void {
  try {
    revalidateLocalized('/warehouse/grns');
    revalidateLocalized('/warehouse/inbound');
    revalidateLocalized(`/warehouse/receive-po/${poId}`);
    revalidateLocalized('/planning/purchase-orders');
    revalidateLocalized(`/planning/purchase-orders/${poId}`);
  } catch (err) {
    if (process.env.VITEST) return;
    throw err;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export type { DesktopReceiveInput, DesktopReceiveResult, PoReceiveDetail } from './receive-po-line.types';
