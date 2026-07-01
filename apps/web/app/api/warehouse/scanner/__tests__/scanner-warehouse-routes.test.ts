import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../../../../lib/scanner/session';

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

const ids = {
  lp: '60000000-0000-4000-8000-000000000001',
  location: '70000000-0000-4000-8000-000000000001',
  move: '80000000-0000-4000-8000-000000000001',
  wo: '90000000-0000-4000-8000-000000000001',
  material: 'a0000000-0000-4000-8000-000000000001',
  product: 'b0000000-0000-4000-8000-000000000001',
  site: 'c0000000-0000-4000-8000-000000000001',
  warehouse: 'd0000000-0000-4000-8000-000000000001',
};

const fakeClient = {
  query: vi.fn(),
};

const withScannerOrgMock = vi.fn(async (...args: unknown[]) => {
  return (args[2] as (ctx: unknown) => Promise<unknown>)({
    client: fakeClient,
    session,
    orgId: session.org_id,
    userId: session.user_id,
  });
});

vi.mock('../../../../../lib/scanner/guard', () => ({
  requireScannerSession: vi.fn(async (_request, _body, _operation, fn) =>
    fn({ client: fakeClient, session, token: 'token' }),
  ),
}));

vi.mock('../../../../../lib/scanner/with-scanner-org', () => ({
  withScannerOrg: (...args: unknown[]) => withScannerOrgMock(...args),
}));

// Review fix F2: the write routes gate on warehouse.stock.move via
// lib/production/shared hasPermission — toggled per test (default allowed).
let allowStockMove = true;
vi.mock('../../../../../lib/production/shared', () => ({
  hasPermission: vi.fn(async () => allowStockMove),
  ProductionActionError: class ProductionActionError extends Error {},
  QualityHoldError: class QualityHoldError extends Error {},
}));

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

function mockMoveQueries(options: {
  replay?: boolean;
  locked?: boolean;
  materialStagingLocationId?: string | null;
  isPick?: boolean;
  qaStatus?: string;
  status?: string;
  expired?: boolean;
  onHold?: boolean;
  holdsViewMissing?: boolean;
}) {
  fakeClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('from public.scanner_audit_log')) {
      return options.replay ? { rows: [{ ext: { moveId: ids.move } }] } : { rows: [] };
    }
    if (options.isPick && sql.includes('from public.wo_materials mat')) {
      return {
        rows: [{
          product_id: ids.product,
          site_id: ids.site,
          uom: 'kg',
          staging_location_id:
            'materialStagingLocationId' in options ? options.materialStagingLocationId : ids.location,
        }],
      };
    }
    // G-WH-01 active-hold gate reads v_active_holds (T-064). Simulate the view
    // being absent (42P01 → fail-open) or returning an active hold row.
    if (sql.includes('from public.v_active_holds')) {
      if (options.holdsViewMissing) {
        const err = new Error('relation "public.v_active_holds" does not exist') as Error & { code?: string };
        err.code = '42P01';
        throw err;
      }
      return options.onHold ? { rows: [{ hold_id: 'f0000000-0000-4000-8000-000000000001' }] } : { rows: [] };
    }
    if (sql.includes('from public.license_plates lp') && sql.includes('for update')) {
      return {
        rows: [{
          id: ids.lp,
          product_id: ids.product,
          site_id: ids.site,
          quantity: '10.000',
          available_qty: '8.000',
          reserved_qty: '2.000',
          uom: 'kg',
          status: options.status ?? 'available',
          qa_status: options.qaStatus ?? 'released',
          expired: options.expired === true,
          location_id: '71000000-0000-4000-8000-000000000001',
          locked_by: options.locked ? '99999999-0000-4000-8000-000000000001' : null,
          lock_is_active_for_other_user: options.locked === true,
        }],
      };
    }
    if (sql.includes('from public.locations')) {
      return { rows: [{ id: ids.location, warehouse_id: ids.warehouse, site_id: ids.site }] };
    }
    if (sql.includes('insert into public.stock_moves')) return { rows: [{ id: ids.move }] };
    // putaway promotion UPDATE (audit F-A01): guarded received→available with RETURNING
    if (sql.includes("set status = 'available'") && sql.includes('returning id::text, lp_number')) {
      return options.status === 'received' ? { rows: [{ id: ids.lp, lp_number: 'LP-001' }] } : { rows: [] };
    }
    if (sql.includes('update public.license_plates')) return { rows: [] };
    if (sql.includes('insert into public.lp_state_history')) return { rows: [] };
    if (sql.includes('insert into public.outbox_events')) return { rows: [] };
    if (sql.includes('insert into public.scanner_audit_log')) return { rows: [] };
    return { rows: [] };
  });
}

describe('warehouse scanner routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient.query.mockReset();
    allowStockMove = true;
  });

  it('lp lookup returns LP detail with genealogy', async () => {
    const { GET } = await import('../lp/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.license_plates lp') && sql.includes('last_move_at')) {
        return {
          rows: [{
            id: ids.lp,
            lp_number: 'LP-001',
            product_id: ids.product,
            item_code: 'RM-001',
            item_name: 'Sugar',
            quantity: '10.000',
            reserved_qty: '2.000',
            available_qty: '8.000',
            uom: 'kg',
            status: 'available',
            qa_status: 'released',
            expiry_date: '2026-07-01T00:00:00.000Z',
            batch_number: 'B-1',
            location_id: ids.location,
            location_code: 'A-01',
            warehouse_id: 'c0000000-0000-4000-8000-000000000001',
            warehouse_code: 'WH-1',
            last_move_at: '2026-06-01T12:00:00.000Z',
          }],
        };
      }
      if (sql.includes('with recursive parents')) {
        return { rows: [{ id: 'd0000000-0000-4000-8000-000000000001', lp_number: 'LP-PARENT' }] };
      }
      if (sql.includes('parent_lp_id')) {
        return { rows: [{ id: 'e0000000-0000-4000-8000-000000000001', lp_number: 'LP-CHILD' }] };
      }
      return { rows: [] };
    });

    const response = await GET(getRequest('/api/warehouse/scanner/lp?code=LP-001') as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      lp: {
        id: ids.lp,
        lpNumber: 'LP-001',
        productId: ids.product,
        productCode: 'RM-001',
        availableQty: '8.000',
        expiryDate: '2026-07-01',
        parents: [{ lpNumber: 'LP-PARENT' }],
        children: [{ lpNumber: 'LP-CHILD' }],
      },
    });
  });

  it('lp lookup returns 404 for unknown LP', async () => {
    const { GET } = await import('../lp/route');
    fakeClient.query.mockResolvedValue({ rows: [] });

    const response = await GET(getRequest('/api/warehouse/scanner/lp?code=MISSING') as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_not_found' });
  });

  it('pick LP list only returns LPs the pick POST can accept', async () => {
    const { GET } = await import('../pick/lps/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.v_inventory_available inv')) {
        return {
          rows: [{
            lp_id: ids.lp,
            lp_number: 'LP-001',
            available_qty: '8.000',
            uom: 'kg',
            expiry_date: '2026-07-01T00:00:00.000Z',
            location_code: 'A-01',
          }],
        };
      }
      return { rows: [] };
    });

    const response = await GET(
      getRequest(`/api/warehouse/scanner/pick/lps?productId=${ids.product}&uom=kg`) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      lps: [{
        id: ids.lp,
        lpNumber: 'LP-001',
        availableQty: '8.000',
        uom: 'kg',
        expiryDate: '2026-07-01',
        locationCode: 'A-01',
      }],
    });

    const pickListSql = String(
      fakeClient.query.mock.calls.find((call) => String(call[0]).includes('from public.v_inventory_available inv'))?.[0],
    );
    expect(pickListSql).toContain("lp.qa_status = 'released'");
    expect(pickListSql).toContain("lp.expiry_date::date >= current_date");
    expect(pickListSql).toContain('from public.v_active_holds h');
    expect(pickListSql).toContain('h.reference_type = ');
    expect(pickListSql).toContain('h.reference_id = inv.lp_id');
  });

  it('putaway writes a putaway stock move, updates LP location, and audits idempotency', async () => {
    const { POST } = await import('../putaway/route');
    mockMoveQueries({});

    const response = await POST(
      postRequest('/api/warehouse/scanner/putaway', {
        clientOpId: 'op-putaway-1',
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, moveId: ids.move });
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['begin', 'commit']));
    const insert = fakeClient.query.mock.calls.find((call) => String(call[0]).includes('insert into public.stock_moves'));
    expect(insert?.[1]).toEqual(expect.arrayContaining(['putaway']));
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('insert into public.scanner_audit_log'))).toBe(
      true,
    );
  });

  it('putaway replay returns stored moveId without moving the LP again', async () => {
    const { POST } = await import('../putaway/route');
    mockMoveQueries({ replay: true });

    const response = await POST(
      postRequest('/api/warehouse/scanner/putaway', {
        clientOpId: 'op-putaway-replay',
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, moveId: ids.move, replay: true });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('update public.license_plates'))).toBe(
      false,
    );
  });

  it('putaway rejects LPs locked by another active scanner session', async () => {
    const { POST } = await import('../putaway/route');
    mockMoveQueries({ locked: true });

    const response = await POST(
      postRequest('/api/warehouse/scanner/putaway', {
        clientOpId: 'op-putaway-locked',
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_not_movable' });
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['rollback']));
  });

  it('putaway promotes a received LP to available with a ledger row (audit F-A01)', async () => {
    const { POST } = await import('../putaway/route');
    mockMoveQueries({ status: 'received', qaStatus: 'pending' });

    const response = await POST(
      postRequest('/api/warehouse/scanner/putaway', {
        clientOpId: 'op-putaway-promote',
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, moveId: ids.move });
    const sqls = fakeClient.query.mock.calls.map((call) => String(call[0]));
    // guarded promotion: only flips status when it is still 'received'
    const promote = fakeClient.query.mock.calls.find(
      (call) => String(call[0]).includes("set status = 'available'") && String(call[0]).includes("and status = 'received'"),
    );
    expect(promote).toBeTruthy();
    // ledger row: received → available, putaway reason
    const history = fakeClient.query.mock.calls.find((call) =>
      String(call[0]).includes('insert into public.lp_state_history'),
    );
    expect(history).toBeTruthy();
    expect(String(history?.[0])).toContain("'received', 'available'");
    expect(history?.[1]).toEqual(expect.arrayContaining([ids.lp, 'putaway', ids.move]));
    // outbox event mirrors the transition
    const outbox = fakeClient.query.mock.calls.find((call) =>
      String(call[0]).includes('insert into public.outbox_events'),
    );
    expect(outbox).toBeTruthy();
    expect(String(outbox?.[1]?.[1])).toContain('"status_to":"available"');
    // qa_status is never touched by the warehouse transition
    expect(sqls.some((sql) => sql.includes('set qa_status'))).toBe(false);
  });

  it('putaway of an already-available LP does not write a promotion or ledger row', async () => {
    const { POST } = await import('../putaway/route');
    mockMoveQueries({});

    const response = await POST(
      postRequest('/api/warehouse/scanner/putaway', {
        clientOpId: 'op-putaway-noop-promote',
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(200);
    const sqls = fakeClient.query.mock.calls.map((call) => String(call[0]));
    expect(sqls.some((sql) => sql.includes("set status = 'available'"))).toBe(false);
    expect(sqls.some((sql) => sql.includes('insert into public.lp_state_history'))).toBe(false);
  });

  it('move (transfer) of a received LP never promotes — putaway is the transition', async () => {
    const { POST } = await import('../move/route');
    mockMoveQueries({ status: 'received', qaStatus: 'pending' });

    const response = await POST(
      postRequest('/api/warehouse/scanner/move', {
        clientOpId: 'op-move-received',
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(200);
    const sqls = fakeClient.query.mock.calls.map((call) => String(call[0]));
    expect(sqls.some((sql) => sql.includes("set status = 'available'"))).toBe(false);
    expect(sqls.some((sql) => sql.includes('insert into public.lp_state_history'))).toBe(false);
  });

  it('move writes a transfer stock move', async () => {
    const { POST } = await import('../move/route');
    mockMoveQueries({});

    const response = await POST(
      postRequest('/api/warehouse/scanner/move', {
        clientOpId: 'op-move-1',
        lpId: ids.lp,
        toLocationId: ids.location,
        reason: 'scanner relocation',
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, moveId: ids.move });
    const insert = fakeClient.query.mock.calls.find((call) => String(call[0]).includes('insert into public.stock_moves'));
    expect(insert?.[1]).toEqual(expect.arrayContaining(['transfer', 'scanner relocation']));
  });

  it('pick writes a physical issue move and updates only LP location', async () => {
    const { POST } = await import('../pick/route');
    mockMoveQueries({ isPick: true });

    const response = await POST(
      postRequest('/api/warehouse/scanner/pick', {
        clientOpId: 'op-pick-1',
        woId: ids.wo,
        materialId: ids.material,
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, moveId: ids.move });
    const insert = fakeClient.query.mock.calls.find((call) => String(call[0]).includes('insert into public.stock_moves'));
    expect(insert?.[1]).toEqual(expect.arrayContaining(['issue', ids.wo, ids.material]));
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('update public.wo_materials'))).toBe(
      false,
    );
  });

  it('pick returns 422 destination_required when no toLocationId is provided and no staging fallback exists', async () => {
    const { POST } = await import('../pick/route');
    mockMoveQueries({ isPick: true, materialStagingLocationId: null });

    const response = await POST(
      postRequest('/api/warehouse/scanner/pick', {
        clientOpId: 'op-pick-missing-location',
        woId: ids.wo,
        materialId: ids.material,
        lpId: ids.lp,
      }) as never,
    );

    expect(response.status).toBe(422);
    // Review fix F4: distinct code — the screen only reveals the destination
    // field for THIS body code, other 422s render a generic error.
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'destination_required' });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('insert into public.stock_moves'))).toBe(
      false,
    );
  });

  it('pick rejects an LP that is not QA-released with 409 lp_not_released (review fix F3)', async () => {
    const { POST } = await import('../pick/route');
    mockMoveQueries({ isPick: true, qaStatus: 'pending' });

    const response = await POST(
      postRequest('/api/warehouse/scanner/pick', {
        clientOpId: 'op-pick-held-lp',
        woId: ids.wo,
        materialId: ids.material,
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_not_released' });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('insert into public.stock_moves'))).toBe(
      false,
    );
  });

  it('putaway still moves a held LP (QA gate is pick-only)', async () => {
    const { POST } = await import('../putaway/route');
    mockMoveQueries({ qaStatus: 'on_hold' });

    const response = await POST(
      postRequest('/api/warehouse/scanner/putaway', {
        clientOpId: 'op-putaway-held',
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, moveId: ids.move });
  });

  it('pick rejects an expired LP with 409 lp_expired (G-WH-01) and writes no stock move', async () => {
    const { POST } = await import('../pick/route');
    mockMoveQueries({ isPick: true, expired: true });

    const response = await POST(
      postRequest('/api/warehouse/scanner/pick', {
        clientOpId: 'op-pick-expired-lp',
        woId: ids.wo,
        materialId: ids.material,
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_expired' });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('insert into public.stock_moves'))).toBe(
      false,
    );
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['rollback']));
  });

  it('pick rejects an LP on an active quality hold with 409 lp_on_hold (G-WH-01) and writes no stock move', async () => {
    const { POST } = await import('../pick/route');
    mockMoveQueries({ isPick: true, onHold: true });

    const response = await POST(
      postRequest('/api/warehouse/scanner/pick', {
        clientOpId: 'op-pick-held-active-hold',
        woId: ids.wo,
        materialId: ids.material,
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_on_hold' });
    // the active-hold gate read the canonical v_active_holds view, not quality_holds
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('from public.v_active_holds'))).toBe(true);
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('quality_holds'))).toBe(false);
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('insert into public.stock_moves'))).toBe(
      false,
    );
  });

  it('pick ALLOWS a clean QA-released, in-date, hold-free LP (G-WH-01 happy path)', async () => {
    const { POST } = await import('../pick/route');
    mockMoveQueries({ isPick: true });

    const response = await POST(
      postRequest('/api/warehouse/scanner/pick', {
        clientOpId: 'op-pick-clean-lp',
        woId: ids.wo,
        materialId: ids.material,
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, moveId: ids.move });
    // the active-hold gate ran (and found nothing), so the move proceeded
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('from public.v_active_holds'))).toBe(true);
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('insert into public.stock_moves'))).toBe(
      true,
    );
  });

  it('pick fails OPEN when v_active_holds is absent (42P01) — clean LP still picks', async () => {
    const { POST } = await import('../pick/route');
    mockMoveQueries({ isPick: true, holdsViewMissing: true });

    const response = await POST(
      postRequest('/api/warehouse/scanner/pick', {
        clientOpId: 'op-pick-holds-view-missing',
        woId: ids.wo,
        materialId: ids.material,
        lpId: ids.lp,
        toLocationId: ids.location,
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, moveId: ids.move });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('insert into public.stock_moves'))).toBe(
      true,
    );
  });

  const writeRouteLoaders = {
    putaway: () => import('../putaway/route'),
    move: () => import('../move/route'),
    pick: () => import('../pick/route'),
  } as const;

  it.each([
    ['putaway', { clientOpId: 'op-forbidden', lpId: ids.lp, toLocationId: ids.location }],
    ['move', { clientOpId: 'op-forbidden', lpId: ids.lp, toLocationId: ids.location }],
    ['pick', { clientOpId: 'op-forbidden', woId: ids.wo, materialId: ids.material, lpId: ids.lp }],
  ] as const)(
    '%s returns 403 + audits the forbidden attempt without warehouse.stock.move (review fix F2)',
    async (name, body) => {
      const { POST } = await writeRouteLoaders[name]();
      mockMoveQueries({ isPick: name === 'pick' });
      allowStockMove = false;

      const response = await POST(postRequest(`/api/warehouse/scanner/${name}`, body as never) as never);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'forbidden' });
      // no inventory mutation happened
      expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('insert into public.stock_moves'))).toBe(false);
      expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('update public.license_plates'))).toBe(false);
      // the attempt is audited as forbidden (mirrors the quality inspect route)
      const forbiddenAudit = fakeClient.query.mock.calls.find(
        (call) =>
          String(call[0]).includes('insert into public.scanner_audit_log') &&
          (call[1] as unknown[] | undefined)?.includes('forbidden'),
      );
      expect(forbiddenAudit).toBeTruthy();
    },
  );
});
