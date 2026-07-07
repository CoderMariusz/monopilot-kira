import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDeliveryNoteDocument } from './delivery-note-document-actions';
import {
  buildDeliveryNoteDocumentData,
  mapDeliveryNoteContentRow,
  mapShipToAddress,
  type DeliveryNoteBoxRow,
  type DeliveryNoteContentRow,
  type DeliveryNoteHeaderRow,
} from '../../../../../../lib/documents/delivery-note-document';
import { mapOrganizationRowToCompanyHeader } from '../../../../../../lib/documents/company-header';
import type { QueryClient } from '../../../../../../lib/documents/company-header';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SHIPMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE_ID = '33333333-3333-4333-8333-333333333333';
const BOX_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let client: QueryClient;

const { getActiveSiteIdMock } = vi.hoisted(() => ({
  getActiveSiteIdMock: vi.fn(),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

const SEEDED_HEADER: DeliveryNoteHeaderRow = {
  id: SHIPMENT_ID,
  delivery_note_number: 'DN-202607-00012',
  shipment_number: 'SH-2026-00046',
  status: 'packed',
  carrier: 'DHL Freight',
  tracking_number: 'JD0146000123456789',
  packed_at: '2026-07-05T14:00:00.000Z',
  shipped_at: null,
  sales_order_number: 'SO-2026-2447',
  customer_po: 'JMP-2026-00447',
  customer_name: 'Biedronka DC Poznań',
  customer_code: 'BIED-POZ',
  address_line1: 'ul. Logistyczna 8',
  address_line2: null,
  city: 'Poznań',
  state: null,
  postal_code: '61-696',
  country_iso2: 'PL',
};

const SEEDED_BOXES: DeliveryNoteBoxRow[] = [
  { box_id: BOX_ID, box_number: 1, sscc: '050123450000000428' },
];

const SEEDED_CONTENTS: DeliveryNoteContentRow[] = [
  {
    box_id: BOX_ID,
    line_number: 1,
    item_code: 'FA5100',
    item_name: 'Kiełbasa śląska pieczona 450g',
    lot_number: 'WO-2026-0108-B1',
    lp_code: 'LP-0042',
    quantity: '120',
  },
  {
    box_id: BOX_ID,
    line_number: 2,
    item_code: 'FA5200',
    item_name: 'Pasztet drobiowy z żurawiną 180g',
    lot_number: 'WO-2026-0100-B1',
    lp_code: 'LP-0043',
    quantity: '80',
  },
];

const SEEDED_COMPANY = mapOrganizationRowToCompanyHeader({
  name: 'MonoPilot Demo Foods',
  legal_name: 'MonoPilot Demo Foods Sp. z o.o.',
  vat: 'PL1234567890',
  street: 'ul. Przemysłowa 12',
  city: 'Warsaw',
  zip: '00-001',
  country: 'Poland',
  email: 'shipping@demo.local',
  phone: '+48 22 123 4567',
});

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.includes('from public.organizations')) {
        return {
          rows: [
            {
              name: 'MonoPilot Demo Foods',
              legal_name: 'MonoPilot Demo Foods Sp. z o.o.',
              vat: 'PL1234567890',
              street: 'ul. Przemysłowa 12',
              city: 'Warsaw',
              zip: '00-001',
              country: 'Poland',
              email: 'shipping@demo.local',
              phone: '+48 22 123 4567',
            },
          ],
          rowCount: 1,
        };
      }
      if (q.includes('from public.shipments sh')) {
        return { rows: [SEEDED_HEADER], rowCount: 1 };
      }
      if (q.includes('from public.shipment_boxes sb') && !q.includes('shipment_box_contents')) {
        return { rows: SEEDED_BOXES, rowCount: SEEDED_BOXES.length };
      }
      if (q.includes('from public.shipment_box_contents sbc')) {
        return { rows: SEEDED_CONTENTS, rowCount: SEEDED_CONTENTS.length };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  getActiveSiteIdMock.mockReset();
  getActiveSiteIdMock.mockResolvedValue(SITE_ID);
  client = makeClient();
});

describe('delivery note document assembly (pure)', () => {
  it('mapShipToAddress builds address lines from customer address fields', () => {
    expect(mapShipToAddress(SEEDED_HEADER)).toEqual({
      customerName: 'Biedronka DC Poznań',
      customerCode: 'BIED-POZ',
      addressLines: ['ul. Logistyczna 8', 'Poznań, 61-696', 'PL'],
    });
  });

  it('buildDeliveryNoteDocumentData uses delivery_note_number as the stable document number', () => {
    const doc = buildDeliveryNoteDocumentData({
      header: SEEDED_HEADER,
      boxRows: SEEDED_BOXES,
      contentRows: SEEDED_CONTENTS,
      company: SEEDED_COMPANY,
      generatedAt: '2026-07-07T12:00:00.000Z',
    });

    expect(doc.documentNumber).toBe('DN-202607-00012');
    expect(doc.documentType).toBe('delivery_note');
    expect(doc.shipmentId).toBe(SHIPMENT_ID);
    expect(doc.shipmentNumber).toBe('SH-2026-00046');
    expect(doc.salesOrderNumber).toBe('SO-2026-2447');
    expect(doc.boxes).toHaveLength(1);
    expect(doc.boxes[0]?.sscc).toBe('050123450000000428');
    expect(doc.boxes[0]?.lines).toHaveLength(2);
    expect(doc.boxes[0]?.lines[0]).toEqual(
      mapDeliveryNoteContentRow(SEEDED_CONTENTS[0]!),
    );
  });

  it('document number stays stable across repeated assembly of the same shipment row', () => {
    const first = buildDeliveryNoteDocumentData({
      header: SEEDED_HEADER,
      boxRows: SEEDED_BOXES,
      contentRows: SEEDED_CONTENTS,
      company: SEEDED_COMPANY,
      generatedAt: '2026-07-07T12:00:00.000Z',
    });
    const second = buildDeliveryNoteDocumentData({
      header: { ...SEEDED_HEADER, carrier: 'Updated carrier only' },
      boxRows: SEEDED_BOXES,
      contentRows: SEEDED_CONTENTS,
      company: SEEDED_COMPANY,
      generatedAt: '2026-07-08T09:00:00.000Z',
    });
    expect(second.documentNumber).toBe(first.documentNumber);
    expect(second.generatedAt).not.toBe(first.generatedAt);
  });
});

describe('getDeliveryNoteDocument action', () => {
  it('returns assembled org+site-scoped document data for a seeded shipment', async () => {
    const result = await getDeliveryNoteDocument(SHIPMENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.documentNumber).toBe('DN-202607-00012');
    expect(result.data.shipTo.customerName).toBe('Biedronka DC Poznań');
    expect(result.data.boxes[0]?.sscc).toBe('050123450000000428');
    expect(result.data.company.tradingName).toBe('MonoPilot Demo Foods');

    const headerCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('from public.shipments sh'),
    );
    expect(headerCall?.[1]).toEqual([SHIPMENT_ID, SITE_ID]);
    expect(normalize(String(headerCall?.[0]))).toContain('app.current_org_id()');
    expect(normalize(String(headerCall?.[0]))).toContain('sh.site_id = $2::uuid');
    expect(getActiveSiteIdMock).toHaveBeenCalledWith({ client });
  });

  it('returns not_found when no active site resolves', async () => {
    getActiveSiteIdMock.mockResolvedValue(null);

    await expect(getDeliveryNoteDocument(SHIPMENT_ID)).resolves.toEqual({ ok: false, reason: 'not_found' });
    expect(
      vi.mocked(client.query).mock.calls.filter(([sql]) => normalize(String(sql)).includes('from public.shipments sh')),
    ).toHaveLength(0);
  });

  it('returns not_found when the shipment belongs to a non-active site', async () => {
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);
    vi.mocked(client.query).mockImplementation(async (sql: string, params?: unknown[]) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (q.includes('from public.organizations')) {
        return {
          rows: [
            {
              name: 'MonoPilot Demo Foods',
              legal_name: null,
              vat: null,
              street: null,
              city: null,
              zip: null,
              country: null,
              email: null,
              phone: null,
            },
          ],
        };
      }
      if (q.includes('from public.shipments sh')) {
        expect(params).toEqual([SHIPMENT_ID, SITE_ID]);
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(getDeliveryNoteDocument(SHIPMENT_ID)).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns not_found when the shipment header is missing', async () => {
    vi.mocked(client.query).mockImplementation(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (q.includes('from public.organizations')) {
        return {
          rows: [
            {
              name: 'MonoPilot Demo Foods',
              legal_name: null,
              vat: null,
              street: null,
              city: null,
              zip: null,
              country: null,
              email: null,
              phone: null,
            },
          ],
        };
      }
      if (q.includes('from public.shipments sh')) return { rows: [] };
      return { rows: [] };
    });

    await expect(getDeliveryNoteDocument(SHIPMENT_ID)).resolves.toEqual({ ok: false, reason: 'not_found' });
  });
});
