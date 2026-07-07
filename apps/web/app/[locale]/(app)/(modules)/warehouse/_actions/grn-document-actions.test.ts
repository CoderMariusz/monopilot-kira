import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getGrnDocument } from './grn-document-actions';
import {
  buildGrnDocumentData,
  mapGrnLineRow,
  mapGrnTotalsRows,
  type GrnHeaderRow,
  type GrnLineRow,
  type GrnTotalsRow,
} from '../../../../../../lib/documents/grn-document';
import { mapOrganizationRowToCompanyHeader } from '../../../../../../lib/documents/company-header';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const GRN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE_ID = '33333333-3333-4333-8333-333333333333';

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

const SEEDED_HEADER: GrnHeaderRow = {
  id: GRN_ID,
  grn_number: 'GRN-2026-00042',
  source_type: 'po',
  status: 'completed',
  supplier_name: 'Acme Ingredients Ltd',
  warehouse_code: 'WH-01',
  receipt_date: '2026-06-15T10:00:00.000Z',
  completed_at: '2026-06-15T11:30:00.000Z',
  notes: 'Dock 3 delivery',
  po_number: 'PO-202606-0012',
};

const SEEDED_LINES: GrnLineRow[] = [
  {
    line_number: 1,
    item_code: 'RM-001',
    item_name: 'Wheat flour',
    ordered_qty: '1000',
    received_qty: '1000',
    uom: 'kg',
    batch_number: 'BATCH-A',
    expiry_date: '2027-01-31',
    lp_number: 'LP-0001',
    cancelled: false,
  },
  {
    line_number: 2,
    item_code: 'RM-002',
    item_name: 'Sugar',
    ordered_qty: '500',
    received_qty: '500',
    uom: 'kg',
    batch_number: 'BATCH-B',
    expiry_date: '2027-06-30',
    lp_number: 'LP-0002',
    cancelled: false,
  },
  {
    line_number: 3,
    item_code: 'RM-003',
    item_name: 'Salt',
    ordered_qty: '50',
    received_qty: '50',
    uom: 'kg',
    batch_number: null,
    expiry_date: null,
    lp_number: null,
    cancelled: true,
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
  email: 'warehouse@demo.local',
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
              email: 'warehouse@demo.local',
              phone: '+48 22 123 4567',
            },
          ],
          rowCount: 1,
        };
      }
      if (q.includes('from public.grns g')) {
        return { rows: [SEEDED_HEADER], rowCount: 1 };
      }
      if (q.includes('from public.grn_items gi') && q.includes('sum(gi.received_qty)')) {
        return {
          rows: [{ uom: 'kg', total_received: '1500' }] satisfies GrnTotalsRow[],
          rowCount: 1,
        };
      }
      if (q.includes('from public.grn_items gi')) {
        return { rows: SEEDED_LINES, rowCount: SEEDED_LINES.length };
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

describe('GRN document assembly (pure)', () => {
  it('mapGrnTotalsRows excludes cancelled lines from liveLineCount and maps SQL totals', () => {
    const pieceLines: GrnLineRow[] = [
      {
        line_number: 1,
        item_code: 'PK-001',
        item_name: 'Caps',
        ordered_qty: '10',
        received_qty: '10',
        uom: 'ea',
        batch_number: null,
        expiry_date: null,
        lp_number: null,
        cancelled: false,
      },
      {
        line_number: 2,
        item_code: 'PK-002',
        item_name: 'Lids',
        ordered_qty: '5',
        received_qty: '5',
        uom: 'szt',
        batch_number: null,
        expiry_date: null,
        lp_number: null,
        cancelled: false,
      },
      {
        line_number: 3,
        item_code: 'PK-003',
        item_name: 'Boxes',
        ordered_qty: '3',
        received_qty: '3',
        uom: 'pcs',
        batch_number: null,
        expiry_date: null,
        lp_number: null,
        cancelled: false,
      },
      {
        line_number: 4,
        item_code: 'PK-004',
        item_name: 'Voided',
        ordered_qty: '99',
        received_qty: '99',
        uom: 'pcs',
        batch_number: null,
        expiry_date: null,
        lp_number: null,
        cancelled: true,
      },
    ];
    const lines = pieceLines.map(mapGrnLineRow);
    expect(mapGrnTotalsRows(lines, [{ uom: 'pcs', total_received: '18' }])).toEqual({
      lineCount: 4,
      liveLineCount: 3,
      receivedByUom: [{ uom: 'pcs', totalReceived: '18' }],
    });
  });

  it('mapGrnTotalsRows renders SQL NUMERIC strings verbatim', () => {
    const lines = SEEDED_LINES.map(mapGrnLineRow);
    expect(
      mapGrnTotalsRows(lines, [{ uom: 'kg', total_received: '1500.125' }]).receivedByUom,
    ).toEqual([{ uom: 'kg', totalReceived: '1500.125' }]);
  });

  it('buildGrnDocumentData uses grn_number as the stable document number', () => {
    const doc = buildGrnDocumentData({
      header: SEEDED_HEADER,
      lineRows: SEEDED_LINES,
      totalsRows: [{ uom: 'kg', total_received: '1500' }],
      company: SEEDED_COMPANY,
      generatedAt: '2026-07-07T12:00:00.000Z',
    });

    expect(doc.documentNumber).toBe('GRN-2026-00042');
    expect(doc.documentType).toBe('grn');
    expect(doc.grnId).toBe(GRN_ID);
    expect(doc.sourceDocumentNumber).toBe('PO-202606-0012');
    expect(doc.company.tradingName).toBe('MonoPilot Demo Foods');
    expect(doc.lines).toHaveLength(3);
    expect(doc.lines[2]?.cancelled).toBe(true);
    expect(doc.totals.liveLineCount).toBe(2);
  });

  it('document number stays stable across repeated assembly of the same GRN row', () => {
    const first = buildGrnDocumentData({
      header: SEEDED_HEADER,
      lineRows: SEEDED_LINES,
      totalsRows: [{ uom: 'kg', total_received: '1500' }],
      company: SEEDED_COMPANY,
      generatedAt: '2026-07-07T12:00:00.000Z',
    });
    const second = buildGrnDocumentData({
      header: { ...SEEDED_HEADER, notes: 'Updated note only' },
      lineRows: SEEDED_LINES,
      totalsRows: [{ uom: 'kg', total_received: '1500' }],
      company: SEEDED_COMPANY,
      generatedAt: '2026-07-08T09:00:00.000Z',
    });
    expect(second.documentNumber).toBe(first.documentNumber);
    expect(second.generatedAt).not.toBe(first.generatedAt);
  });
});

describe('getGrnDocument action', () => {
  it('returns assembled org-scoped document data for a seeded GRN', async () => {
    const result = await getGrnDocument(GRN_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.documentNumber).toBe('GRN-2026-00042');
    expect(result.data.supplierName).toBe('Acme Ingredients Ltd');
    expect(result.data.warehouseCode).toBe('WH-01');
    expect(result.data.lines).toHaveLength(3);
    expect(result.data.company.addressLines).toEqual(['ul. Przemysłowa 12', '00-001 Warsaw', 'Poland']);

    const headerCall = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).includes('from public.grns g'));
    expect(headerCall?.[1]).toEqual([GRN_ID, SITE_ID]);
    expect(normalize(String(headerCall?.[0]))).toContain('app.current_org_id()');
    expect(normalize(String(headerCall?.[0]))).toContain('g.site_id = $2::uuid');
    expect(getActiveSiteIdMock).toHaveBeenCalledWith({ client });

    const totalsCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('sum(gi.received_qty)'),
    );
    expect(totalsCall).toBeDefined();
    expect(normalize(String(totalsCall?.[0]))).toContain("when trim(gi.uom) in ('szt', 'ea') then 'pcs'");
    expect(totalsCall?.[1]).toEqual([GRN_ID]);
  });

  it('returns not_found when no active site resolves', async () => {
    getActiveSiteIdMock.mockResolvedValue(null);

    await expect(getGrnDocument(GRN_ID)).resolves.toEqual({ ok: false, reason: 'not_found' });
    expect(vi.mocked(client.query).mock.calls.filter(([sql]) => normalize(String(sql)).includes('from public.grns g'))).toHaveLength(0);
  });

  it('returns not_found when the GRN belongs to a non-active site', async () => {
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
      if (q.includes('from public.grns g')) {
        expect(params).toEqual([GRN_ID, SITE_ID]);
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(getGrnDocument(GRN_ID)).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns not_found when the GRN header is missing', async () => {
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
      if (q.includes('from public.grns g')) return { rows: [] };
      return { rows: [] };
    });

    await expect(getGrnDocument(GRN_ID)).resolves.toEqual({ ok: false, reason: 'not_found' });
  });
});
