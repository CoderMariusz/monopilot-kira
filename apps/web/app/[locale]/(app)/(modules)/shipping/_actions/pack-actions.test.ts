import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createShipment, getShipment, packLpIntoBox } from './pack-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SO_ID = '33333333-3333-4333-8333-333333333333';
const SHIPMENT_ID = '44444444-4444-4444-8444-444444444444';
const BOX_ID = '55555555-5555-4555-8555-555555555555';
const CUSTOMER_ID = '66666666-6666-4666-8666-666666666666';
const ADDRESS_ID = '77777777-7777-4777-8777-777777777777';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const LINE_ID = '99999999-9999-4999-8999-999999999999';
const ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LP_CODE = 'LP-0001';

let client: QueryClient;
let allowPermission = true;
let salesOrderStatus = 'allocated';
let shipmentStatus = 'packing';
let generatedSscc = '';
let insertedShipments: Array<Record<string, unknown>> = [];
let insertedBoxes: Array<Record<string, unknown>> = [];
let insertedContents: Array<Record<string, unknown>> = [];
let linkedLicensePlates: Array<Record<string, unknown>> = [];
let existingPackedContent = false;
let allocationExists = true;
let lpBlocked = false;
let lpCodeLookupId: string | null = LP_ID;
let detailBoxes: Array<{ id: string; box_number: number; sscc: string | null }> = [];
let detailContents: Array<{
  box_id: string;
  lp_code: string | null;
  item_code: string | null;
  item_name: string | null;
  qty: string | null;
}> = [];
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function computeMod10(digits: string): string {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const posFromRight = digits.length - i;
    const weight = posFromRight % 2 === 1 ? 3 : 1;
    sum += Number.parseInt(digits[i], 10) * weight;
  }
  return String((10 - (sum % 10)) % 10);
}

function makeSscc(): string {
  const body = '00123450000000001';
  return `${body}${computeMod10(body)}`;
}

function expectValidSscc(sscc: string): void {
  expect(sscc).toHaveLength(18);
  expect(sscc.startsWith('00')).toBe(true);
  expect(sscc.slice(-1)).toBe(computeMod10(sscc.slice(0, 17)));
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }

      if (q.startsWith('select so.status')) {
        return {
          rows: [
            {
              status: salesOrderStatus,
              customer_id: CUSTOMER_ID,
              shipping_address_id: ADDRESS_ID,
              site_id: SITE_ID,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('insert into public.shipments')) {
        insertedShipments.push({
          org_id: params[0],
          site_id: params[1],
          sales_order_id: params[2],
          customer_id: params[3],
          shipping_address_id: params[4],
          created_by: params[5],
        });
        return { rows: [{ id: SHIPMENT_ID }], rowCount: 1 };
      }

      if (q.startsWith('select sh.id::text, sh.sales_order_id::text')) {
        return {
          rows: [{ id: SHIPMENT_ID, sales_order_id: SO_ID, site_id: SITE_ID, status: shipmentStatus }],
          rowCount: 1,
        };
      }

      if (q.startsWith('select id::text as id from public.license_plates')) {
        return {
          rows: lpCodeLookupId ? [{ id: lpCodeLookupId }] : [],
          rowCount: lpCodeLookupId ? 1 : 0,
        };
      }

      if (q.startsWith('select sbc.id::text')) {
        return {
          rows: existingPackedContent ? [{ id: 'packed-content-id' }] : [],
          rowCount: existingPackedContent ? 1 : 0,
        };
      }

      if (q.startsWith('select ia.sales_order_line_id::text')) {
        return {
          rows: allocationExists
            ? [
                {
                  sales_order_line_id: LINE_ID,
                  site_id: SITE_ID,
                  product_id: ITEM_ID,
                  lot_number: 'BATCH-001',
                  quantity_allocated: '10.000',
                },
              ]
            : [],
          rowCount: allocationExists ? 1 : 0,
        };
      }

      if (q.startsWith('select case when h.hold_id')) {
        return {
          rows: lpBlocked ? [{ reason: 'hold' }] : [],
          rowCount: lpBlocked ? 1 : 0,
        };
      }

      if (q.includes('public.generate_sscc')) {
        return { rows: [{ sscc: generatedSscc }], rowCount: 1 };
      }

      if (q.startsWith('select coalesce(max(sb.box_number)')) {
        return { rows: [{ next_box_number: 1 }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.shipment_boxes')) {
        insertedBoxes.push({
          org_id: params[0],
          site_id: params[1],
          shipment_id: params[2],
          box_number: params[3],
          sscc: params[4],
          created_by: params[5],
        });
        return { rows: [{ id: BOX_ID }], rowCount: 1 };
      }

      if (q.startsWith('select sb.site_id::text')) {
        return { rows: [{ site_id: SITE_ID }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.shipment_box_contents')) {
        insertedContents.push({
          org_id: params[0],
          site_id: params[1],
          shipment_box_id: params[2],
          sales_order_line_id: params[3],
          product_id: params[4],
          license_plate_id: params[5],
          lot_number: params[6],
          quantity: params[7],
          created_by: params[8],
        });
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.license_plates') && q.includes('source_so_id')) {
        linkedLicensePlates.push({
          license_plate_id: params[0],
          source_so_id: params[1],
          updated_by: params[2],
        });
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select sh.id::text') && q.includes('sh.shipment_number') && q.includes('box_count')) {
        return {
          rows: [
            {
              id: SHIPMENT_ID,
              shipment_number: 'SH-2026-00001',
              status: 'packing',
              sales_order_number: 'SO-202606-00001',
              customer_name: 'Acme Foods',
              customer_code: 'ACME',
              box_count: detailBoxes.length,
              created_at: '2026-06-22T10:00:00.000Z',
              packed_at: null,
              shipped_at: null,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select sb.id::text')) {
        return { rows: detailBoxes, rowCount: detailBoxes.length };
      }

      if (q.startsWith('select sbc.shipment_box_id::text')) {
        return { rows: detailContents, rowCount: detailContents.length };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  salesOrderStatus = 'allocated';
  shipmentStatus = 'packing';
  generatedSscc = makeSscc();
  insertedShipments = [];
  insertedBoxes = [];
  insertedContents = [];
  linkedLicensePlates = [];
  existingPackedContent = false;
  allocationExists = true;
  lpBlocked = false;
  lpCodeLookupId = LP_ID;
  detailBoxes = [{ id: BOX_ID, box_number: 1, sscc: generatedSscc }];
  detailContents = [
    {
      box_id: BOX_ID,
      lp_code: 'LP-0001',
      item_code: 'FG-001',
      item_name: 'Finished Good 001',
      qty: '10.000',
    },
  ];
  queryLog = [];
  client = makeClient();
});

describe('createShipment', () => {
  it('inserts a shipments row for an allocated sales order', async () => {
    const result = await createShipment(SO_ID);

    expect(result).toEqual({ ok: true, shipmentId: SHIPMENT_ID });
    expect(insertedShipments).toEqual([
      {
        org_id: ORG_ID,
        site_id: SITE_ID,
        sales_order_id: SO_ID,
        customer_id: CUSTOMER_ID,
        shipping_address_id: ADDRESS_ID,
        created_by: USER_ID,
      },
    ]);
    expect(queryLog.some((entry) => normalize(entry.sql).includes("'packing'"))).toBe(true);
  });

  it('returns invalid_state for an unallocated sales order', async () => {
    salesOrderStatus = 'confirmed';

    const result = await createShipment(SO_ID);

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(insertedShipments).toEqual([]);
  });
});

describe('packLpIntoBox', () => {
  it('creates a shipment box with a valid SSCC-18 and inserts box contents', async () => {
    const result = await packLpIntoBox({ shipmentId: SHIPMENT_ID, lpId: LP_ID });

    expect(result).toEqual({ ok: true, boxId: BOX_ID });
    expect(insertedBoxes).toHaveLength(1);
    expectValidSscc(insertedBoxes[0].sscc as string);
    expect(insertedBoxes[0]).toMatchObject({
      org_id: ORG_ID,
      site_id: SITE_ID,
      shipment_id: SHIPMENT_ID,
      box_number: 1,
      created_by: USER_ID,
    });
    expect(insertedContents).toEqual([
      {
        org_id: ORG_ID,
        site_id: SITE_ID,
        shipment_box_id: BOX_ID,
        sales_order_line_id: LINE_ID,
        product_id: ITEM_ID,
        license_plate_id: LP_ID,
        lot_number: 'BATCH-001',
        quantity: '10.000',
        created_by: USER_ID,
      },
    ]);
    expect(linkedLicensePlates).toEqual([{ license_plate_id: LP_ID, source_so_id: SO_ID, updated_by: USER_ID }]);
  });

  it('resolves a scanned LP code to its UUID before packing', async () => {
    const result = await packLpIntoBox({ shipmentId: SHIPMENT_ID, lpId: LP_CODE });

    expect(result).toEqual({ ok: true, boxId: BOX_ID });
    expect(
      queryLog.some(
        (entry) =>
          normalize(entry.sql).startsWith('select id::text as id from public.license_plates') &&
          entry.params[0] === LP_CODE,
      ),
    ).toBe(true);
    expect(insertedContents[0]).toMatchObject({
      license_plate_id: LP_ID,
    });
    expect(
      queryLog.some(
        (entry) =>
          normalize(entry.sql).startsWith('select ia.sales_order_line_id::text') &&
          entry.params[0] === LP_ID,
      ),
    ).toBe(true);
  });

  it('refuses to pack an LP that is on hold / QA-unreleased / expired (food-safety guard)', async () => {
    lpBlocked = true;

    const result = await packLpIntoBox({ shipmentId: SHIPMENT_ID, lpId: LP_ID });

    expect(result).toEqual({ ok: false, error: 'lp_blocked_for_pack' });
    expect(insertedBoxes).toEqual([]);
    expect(insertedContents).toEqual([]);
  });

  it('returns lp_not_found for an unknown scanned LP code without throwing a UUID cast error', async () => {
    lpCodeLookupId = null;

    const result = await packLpIntoBox({ shipmentId: SHIPMENT_ID, lpId: 'LP-9999' });

    expect(result).toEqual({ ok: false, error: 'lp_not_found' });
    expect(insertedBoxes).toEqual([]);
    expect(insertedContents).toEqual([]);
    expect(queryLog.some((entry) => normalize(entry.sql).startsWith('select sbc.id::text'))).toBe(false);
    expect(queryLog.some((entry) => normalize(entry.sql).startsWith('select ia.sales_order_line_id::text'))).toBe(false);
  });

  it.each(['shipped', 'cancelled', 'delivered'] as const)(
    'rejects packing when the shipment is %s',
    async (status) => {
      shipmentStatus = status;

      const result = await packLpIntoBox({ shipmentId: SHIPMENT_ID, lpId: LP_ID });

      expect(result).toEqual({ ok: false, error: 'invalid_state' });
      expect(insertedBoxes).toEqual([]);
      expect(insertedContents).toEqual([]);
    },
  );
});

describe('getShipment', () => {
  it('returns boxes and contents with human-readable references', async () => {
    const result = await getShipment(SHIPMENT_ID);

    expect(result).toMatchObject({
      ok: true,
      data: {
        shipment: {
          shipmentNumber: 'SH-2026-00001',
          salesOrderNumber: 'SO-202606-00001',
          customerName: 'Acme Foods',
        },
        boxes: [
          {
            boxNumber: 1,
            sscc: generatedSscc,
            contents: [
              {
                lpCode: 'LP-0001',
                itemCode: 'FG-001',
                itemName: 'Finished Good 001',
                qty: '10.000',
              },
            ],
          },
        ],
      },
    });
    if (!result.ok) throw new Error('expected ok result');
    const content = result.data.boxes[0].contents[0];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(content.lpCode).not.toMatch(uuidPattern);
    expect(content.itemCode).not.toMatch(uuidPattern);
  });
});
