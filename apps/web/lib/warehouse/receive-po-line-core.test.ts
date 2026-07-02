import { describe, expect, it, vi } from 'vitest';

import {
  executeReceivePoLineCore,
  OPEN_PO_STATUSES,
  type ReceivePoLineCoreInput,
} from './receive-po-line-core';
import type { QueryClient } from '../scanner/db';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const USER_A = '00000000-0000-4000-8000-0000000000aa';
const PO_ID = '00000000-0000-4000-8000-0000000000a1';
const LINE_ID = '00000000-0000-4000-8000-0000000000b1';
const ITEM_ID = '00000000-0000-4000-8000-0000000000c1';
const SUPPLIER_ID = '00000000-0000-4000-8000-0000000000d1';
const SITE_ID = '00000000-0000-4000-8000-0000000000d2';
const WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000e1';
const LOCATION_ID = '00000000-0000-4000-8000-0000000000f1';

const baseInput: ReceivePoLineCoreInput = {
  poLineId: LINE_ID,
  qty: '10.000',
  batchNumber: 'SUP-BATCH-1',
  bestBefore: '2026-07-01',
};

describe('receive-po-line-core', () => {
  it('happy path: creates GRN, LP (batch_number), grn_item, and rolls PO status', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 11));
    const client = makeClient({ orderedQty: '10.000000', receivedQty: '0.000000', isReceived: true });

    const result = await executeReceivePoLineCore(
      client,
      { orgId: ORG_A, userId: USER_A, siteId: SITE_ID },
      baseInput,
      {
        mode: 'desktop',
        genesisReasonCode: 'desktop_receive_po',
        genesisReasonText: 'Desktop PO receipt',
        requireOverReceiveConfirm: true,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      grnId: 'grn-1',
      lpId: 'lp-1',
      qty: '10',
      uom: 'kg',
      poStatus: 'received',
    });
    expect(findCall(client, 'insert into public.license_plates')?.params).toEqual(
      expect.arrayContaining([ORG_A, SITE_ID, WAREHOUSE_ID, ITEM_ID, '10', 'kg', 'SUP-BATCH-1']),
    );
    expect(findCall(client, 'insert into public.grn_items')?.params).toEqual(
      expect.arrayContaining([ORG_A, 'grn-1', ITEM_ID, LINE_ID, '10.000000', '10', 'kg', 'SUP-BATCH-1']),
    );
  });

  it('runs desktop grn_items backfills before completing a fully received GRN', async () => {
    const client = makeClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      isReceived: true,
      throwOnGrnItemsWriteAfterCompleted: true,
    });

    const result = await executeReceivePoLineCore(
      client,
      { orgId: ORG_A, userId: USER_A, siteId: SITE_ID },
      baseInput,
      {
        mode: 'desktop',
        genesisReasonCode: 'desktop_receive_po',
        genesisReasonText: 'Desktop PO receipt',
        requireOverReceiveConfirm: true,
        async afterGrnItemInserted(receipt) {
          await client.query(
            `update public.grn_items
                set ext_jsonb = coalesce(ext_jsonb, '{}'::jsonb) || $3::jsonb,
                    updated_by = $2::uuid,
                    updated_at = now()
              where org_id = $1::uuid
                and id = $4::uuid`,
            [ORG_A, USER_A, JSON.stringify({ wac_qty_kg: receipt.qty, wac_value: '100' }), receipt.grnItemId],
          );
        },
      },
    );

    expect(result).toMatchObject({ ok: true, poStatus: 'received' });
    let grnItemsWriteIdx = -1;
    client.calls.forEach((call, index) => {
      if (call.sql.includes('insert into public.grn_items') || call.sql.includes('update public.grn_items')) {
        grnItemsWriteIdx = index;
      }
    });
    const completedIdx = client.calls.findIndex((call) =>
      call.sql.includes("update public.grns set status = 'completed'"),
    );
    expect(grnItemsWriteIdx).toBeGreaterThan(-1);
    expect(completedIdx).toBeGreaterThan(-1);
    expect(grnItemsWriteIdx).toBeLessThan(completedIdx);
  });

  it('requires explicit confirm when qty exceeds ordered but stays within 110% cap', async () => {
    const client = makeClient({ orderedQty: '10.000000', receivedQty: '0.000000' });

    const blocked = await executeReceivePoLineCore(
      client,
      { orgId: ORG_A, userId: USER_A, siteId: SITE_ID },
      { ...baseInput, qty: '10.500' },
      {
        mode: 'desktop',
        genesisReasonCode: 'desktop_receive_po',
        genesisReasonText: 'Desktop PO receipt',
        requireOverReceiveConfirm: true,
      },
    );
    expect(blocked).toEqual({ ok: false, code: 'over_receive_confirm_required', poId: PO_ID });
    expect(client.calls.some((c) => c.sql.includes('insert into public.grn_items'))).toBe(false);

    const allowed = await executeReceivePoLineCore(
      client,
      { orgId: ORG_A, userId: USER_A, siteId: SITE_ID },
      { ...baseInput, qty: '10.500', confirmOverReceive: true },
      {
        mode: 'desktop',
        genesisReasonCode: 'desktop_receive_po',
        genesisReasonText: 'Desktop PO receipt',
        requireOverReceiveConfirm: true,
      },
    );
    expect(allowed).toMatchObject({ ok: true, overReceived: true, qty: '10.5' });
  });

  it('rejects closed PO lines because load filters to open statuses only', async () => {
    const client = makeClient({ lineMissing: true });

    const result = await executeReceivePoLineCore(
      client,
      { orgId: ORG_A, userId: USER_A, siteId: SITE_ID },
      baseInput,
      {
        mode: 'desktop',
        genesisReasonCode: 'desktop_receive_po',
        genesisReasonText: 'Desktop PO receipt',
        requireOverReceiveConfirm: true,
      },
    );

    expect(result).toEqual({ ok: false, code: 'not_found' });
    const lookup = findCall(client, 'from public.purchase_order_lines pol');
    expect(lookup?.params[2]).toEqual(OPEN_PO_STATUSES);
    expect(client.calls.some((c) => c.sql.includes('insert into public.license_plates'))).toBe(false);
  });
});

type FakeClient = QueryClient & { calls: Array<{ sql: string; params: readonly unknown[] }> };

function makeClient(options: {
  orderedQty?: string;
  receivedQty?: string;
  isReceived?: boolean;
  lineMissing?: boolean;
  throwOnGrnItemsWriteAfterCompleted?: boolean;
}): FakeClient {
  const calls: FakeClient['calls'] = [];
  let grnCompleted = false;
  return {
    calls,
    async query<T = unknown>(sql: string, params: readonly unknown[] = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      if (
        options.throwOnGrnItemsWriteAfterCompleted &&
        grnCompleted &&
        (normalized.includes('insert into public.grn_items') || normalized.includes('update public.grn_items'))
      ) {
        throw new Error('V-WH-GRN-001');
      }
      calls.push({ sql: normalized, params });
      if (normalized.includes("update public.grns set status = 'completed'")) {
        grnCompleted = true;
      }

      if (normalized.includes('from public.purchase_order_lines pol') && normalized.includes('for update of pol, po')) {
        return {
          rows: options.lineMissing
            ? ([] as T[])
            : ([
                {
                  id: LINE_ID,
                  org_id: ORG_A,
                  po_id: PO_ID,
                  item_id: ITEM_ID,
                  supplier_id: SUPPLIER_ID,
                  destination_warehouse_id: null,
                  line_no: 1,
                  ordered_qty: options.orderedQty ?? '10.000000',
                  uom: 'kg',
                  received_qty: options.receivedQty ?? '0.000000',
                  shelf_life_days: null,
                  shelf_life_mode: null,
                },
              ] as T[]),
        };
      }
      if (normalized.includes('from public.warehouses w')) {
        return {
          rows: [{ id: WAREHOUSE_ID, site_id: SITE_ID, default_location_id: LOCATION_ID }] as T[],
        };
      }
      if (normalized.includes('from public.grns') && normalized.includes('status =')) {
        return { rows: [] as T[] };
      }
      if (normalized.includes("substring(grn_number from 'GRN-")) {
        return { rows: [{ seq: 1 }] as T[] };
      }
      if (normalized.includes('insert into public.grns')) {
        return { rows: [{ id: 'grn-1', grn_number: 'GRN-20260611-0001' }] as T[] };
      }
      if (normalized.includes('insert into public.license_plates')) {
        return { rows: [{ id: 'lp-1' }] as T[] };
      }
      if (normalized.includes('insert into public.grn_items')) {
        return { rows: [{ id: 'grn-item-1' }] as T[] };
      }
      if (normalized.includes('bool_and(coalesce(rec.received_qty')) {
        return { rows: [{ is_received: options.isReceived ?? false }] as T[] };
      }
      if (normalized.includes('from public.tenant_variations')) {
        return { rows: [{ require_qc: false }] as T[] };
      }
      return { rows: [] as T[], rowCount: 1 };
    },
  };
}

function findCall(client: FakeClient, fragment: string) {
  return client.calls.find((call) => call.sql.includes(fragment));
}
