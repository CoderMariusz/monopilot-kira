import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../../../../../lib/scanner/session';

const state = vi.hoisted(() => {
  const session: ScannerSessionRow = {
    id: '10000000-0000-0000-0000-000000000001',
    org_id: '20000000-0000-0000-0000-000000000001',
    user_id: '30000000-0000-0000-0000-000000000001',
    device_id: '40000000-0000-0000-0000-000000000001',
    site_id: null,
    line_id: '50000000-0000-0000-0000-000000000001',
    shift: 'A',
    mode: 'personal',
    session_token_hash: 'hash',
    expires_at: new Date('2030-01-01T00:00:00Z'),
    ended_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    last_seen_at: new Date('2026-01-01T00:00:00Z'),
  };

  return {
    session,
    fakeClient: {
      query: vi.fn(),
    },
    hasPermission: vi.fn(async () => true),
    auditAttempt: vi.fn(async () => undefined),
  };
});

const ids = {
  shipment: '60000000-0000-4000-8000-000000000001',
  salesOrder: '70000000-0000-4000-8000-000000000001',
  site: '80000000-0000-4000-8000-000000000001',
  lp: '90000000-0000-4000-8000-000000000001',
  salesOrderLine: 'a0000000-0000-4000-8000-000000000001',
  product: 'b0000000-0000-4000-8000-000000000001',
  box: 'c0000000-0000-4000-8000-000000000001',
};

type QueryCall = { sql: string; params: readonly unknown[] };

const queryLog: QueryCall[] = [];
const insertedBoxes: Array<Record<string, unknown>> = [];
const insertedContents: Array<Record<string, unknown>> = [];

vi.mock('../../../../../../lib/scanner/guard', () => ({
  requireScannerSession: vi.fn(async (_request, _body, _operation, fn) =>
    fn({ client: state.fakeClient, session: state.session, token: 'token' }),
  ),
}));

vi.mock('../../../../../../lib/scanner/with-scanner-org', () => ({
  withScannerOrg: vi.fn(async (_client, _session, fn) =>
    fn({
      client: state.fakeClient,
      session: state.session,
      orgId: state.session.org_id,
      userId: state.session.user_id,
    }),
  ),
}));

vi.mock('../../../../../../lib/production/shared', () => ({
  hasPermission: (...args: unknown[]) => state.hasPermission(...args),
  ProductionActionError: class ProductionActionError extends Error {},
  QualityHoldError: class QualityHoldError extends Error {},
}));

vi.mock('../../../../production/scanner/_support', () => ({
  auditAttempt: (...args: unknown[]) => state.auditAttempt(...args),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getRequest(path: string): Request {
  return new Request(`https://web.test${path}`, {
    method: 'GET',
    headers: { authorization: 'Bearer token' },
  });
}

function postRequest(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://web.test${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockPackQueries(options: {
  allocationExists?: boolean;
  blockedForPack?: boolean;
  lpLookupId?: string | null;
  shipmentStatus?: string;
}) {
  state.fakeClient.query.mockImplementation(async (sql: string, params: readonly unknown[] = []) => {
    queryLog.push({ sql, params });
    const q = normalize(sql);

    if (
      q === 'begin' ||
      q === 'commit' ||
      q === 'rollback' ||
      q.startsWith('insert into app.session_org_contexts') ||
      q.startsWith('select app.set_org_context') ||
      q.startsWith('delete from app.session_org_contexts')
    ) {
      return { rows: [], rowCount: 0 };
    }

    if (q.startsWith('select sh.id::text, sh.sales_order_id::text')) {
      return {
        rows: [
          {
            id: ids.shipment,
            sales_order_id: ids.salesOrder,
            site_id: ids.site,
            status: options.shipmentStatus ?? 'packing',
          },
        ],
        rowCount: 1,
      };
    }

    if (q.startsWith('select id::text as id from public.license_plates')) {
      const lpLookupId = options.lpLookupId === undefined ? ids.lp : options.lpLookupId;
      return { rows: lpLookupId ? [{ id: lpLookupId }] : [], rowCount: lpLookupId ? 1 : 0 };
    }

    if (q.startsWith('select sbc.id::text')) {
      return { rows: [], rowCount: 0 };
    }

    if (q.startsWith('select ia.sales_order_line_id::text')) {
      if (options.allocationExists === false) return { rows: [], rowCount: 0 };
      return {
        rows: [
          {
            sales_order_line_id: ids.salesOrderLine,
            site_id: ids.site,
            product_id: ids.product,
            lot_number: 'LOT-001',
            quantity_allocated: '10.000',
          },
        ],
        rowCount: 1,
      };
    }

    if (q.startsWith('select case when h.hold_id')) {
      return options.blockedForPack
        ? { rows: [{ reason: 'hold' }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }

    if (q.includes('public.generate_sscc')) {
      return { rows: [{ sscc: '001234500000000015' }], rowCount: 1 };
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
      return { rows: [{ id: ids.box }], rowCount: 1 };
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

    if (q.startsWith('update public.license_plates set source_so_id')) {
      return { rows: [], rowCount: 1 };
    }

    // Shipment site-gate (select app.user_can_see_site(sh.site_id) from public.shipments)
    if (q.startsWith('select app.user_can_see_site(sh.site_id)')) {
      return { rows: [{ allowed: true }], rowCount: 1 };
    }

    // scannerLpSiteAccess: site-gate LP query (no for update)
    if (q.startsWith('select app.user_can_see_site(lp.site_id)')) {
      return { rows: [{ allowed: true }], rowCount: 1 };
    }

    throw new Error(`unexpected query: ${q}`);
  });
}

function mockShipmentListQueries() {
  state.fakeClient.query.mockImplementation(async (sql: string, params: readonly unknown[] = []) => {
    queryLog.push({ sql, params });
    const q = normalize(sql);

    if (
      q === 'begin' ||
      q === 'commit' ||
      q === 'rollback' ||
      q.startsWith('insert into app.session_org_contexts') ||
      q.startsWith('select app.set_org_context') ||
      q.startsWith('delete from app.session_org_contexts')
    ) {
      return { rows: [], rowCount: 0 };
    }

    if (q.startsWith('select sh.id::text') && q.includes('sh.shipment_number') && q.includes('packed_lp_count')) {
      return {
        rows: [
          {
            id: ids.shipment,
            shipment_number: 'SH-2026-00001',
            sales_order_number: 'SO-2026-00001',
            customer_name: 'Acme Foods',
            box_count: '2',
            packed_lp_count: 3,
          },
        ],
        rowCount: 1,
      };
    }

    throw new Error(`unexpected query: ${q}`);
  });
}

describe('scanner ship routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.fakeClient.query.mockReset();
    state.hasPermission.mockResolvedValue(true);
    queryLog.length = 0;
    insertedBoxes.length = 0;
    insertedContents.length = 0;
  });

  describe('POST /api/warehouse/scanner/ship', () => {
    it('returns 403 and audits the forbidden attempt when caller lacks ship.pack.close', async () => {
      const { POST } = await import('../route');
      state.hasPermission.mockResolvedValue(false);

      const response = await POST(
        postRequest('/api/warehouse/scanner/ship', {
          clientOpId: 'op-forbidden',
          shipmentId: ids.shipment,
          lpId: ids.lp,
        }) as never,
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'forbidden' });
      expect(state.auditAttempt).toHaveBeenCalledWith(
        state.fakeClient,
        state.session,
        'warehouse.scanner.ship',
        'forbidden',
        { lpId: ids.lp, clientOpId: 'op-forbidden' },
      );
      expect(state.fakeClient.query).not.toHaveBeenCalled();
    });

    it('returns 422 invalid_input when shipmentId or lpId is missing', async () => {
      const { POST } = await import('../route');

      const response = await POST(
        postRequest('/api/warehouse/scanner/ship', {
          clientOpId: 'op-invalid',
          lpId: ids.lp,
        }) as never,
      );

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_input' });
      expect(state.hasPermission).not.toHaveBeenCalled();
      expect(state.fakeClient.query).not.toHaveBeenCalled();
    });

    it('packs an allocated clean LP into a shipment box', async () => {
      const { POST } = await import('../route');
      mockPackQueries({});

      const response = await POST(
        postRequest('/api/warehouse/scanner/ship', {
          clientOpId: 'op-pack',
          shipmentId: ids.shipment,
          lpId: 'LP-0001',
        }) as never,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, boxId: ids.box });
      expect(insertedBoxes).toHaveLength(1);
      expect(insertedContents).toEqual([
        {
          org_id: state.session.org_id,
          site_id: ids.site,
          shipment_box_id: ids.box,
          sales_order_line_id: ids.salesOrderLine,
          product_id: ids.product,
          license_plate_id: ids.lp,
          lot_number: 'LOT-001',
          quantity: '10.000',
          created_by: state.session.user_id,
        },
      ]);
      expect(queryLog.map((call) => normalize(call.sql))).toEqual(expect.arrayContaining(['begin', 'commit']));
    });

    it('returns 409 lp_blocked_for_pack when food-safety guard blocks the LP', async () => {
      const { POST } = await import('../route');
      mockPackQueries({ blockedForPack: true });

      const response = await POST(
        postRequest('/api/warehouse/scanner/ship', {
          clientOpId: 'op-blocked',
          shipmentId: ids.shipment,
          lpId: 'LP-0001',
        }) as never,
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_blocked_for_pack' });
      expect(insertedBoxes).toEqual([]);
      expect(insertedContents).toEqual([]);
    });

    it('returns 409 lp_not_allocated when the LP is not allocated to the shipment SO', async () => {
      const { POST } = await import('../route');
      mockPackQueries({ allocationExists: false });

      const response = await POST(
        postRequest('/api/warehouse/scanner/ship', {
          clientOpId: 'op-not-allocated',
          shipmentId: ids.shipment,
          lpId: 'LP-0001',
        }) as never,
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_not_allocated' });
      expect(insertedBoxes).toEqual([]);
      expect(insertedContents).toEqual([]);
    });

    it('returns 409 invalid_state when the shipment is already shipped', async () => {
      const { POST } = await import('../route');
      mockPackQueries({ shipmentStatus: 'shipped' });

      const response = await POST(
        postRequest('/api/warehouse/scanner/ship', {
          clientOpId: 'op-shipped',
          shipmentId: ids.shipment,
          lpId: 'LP-0001',
        }) as never,
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_state' });
      expect(insertedBoxes).toEqual([]);
      expect(insertedContents).toEqual([]);
    });
  });

  describe('GET /api/warehouse/scanner/ship/shipments', () => {
    it('returns 403 when caller lacks ship.pack.close', async () => {
      const { GET } = await import('../shipments/route');
      state.hasPermission.mockResolvedValue(false);

      const response = await GET(getRequest('/api/warehouse/scanner/ship/shipments') as never);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'forbidden' });
      expect(state.fakeClient.query).not.toHaveBeenCalled();
    });

    it('returns the open shipment list shape', async () => {
      const { GET } = await import('../shipments/route');
      mockShipmentListQueries();

      const response = await GET(getRequest('/api/warehouse/scanner/ship/shipments') as never);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        shipments: [
          {
            id: ids.shipment,
            shipmentNumber: 'SH-2026-00001',
            salesOrderNumber: 'SO-2026-00001',
            customerName: 'Acme Foods',
            boxCount: 2,
            packedLpCount: 3,
          },
        ],
      });
      expect(queryLog.map((call) => normalize(call.sql))).toEqual(expect.arrayContaining(['begin', 'commit']));
    });
  });
});
