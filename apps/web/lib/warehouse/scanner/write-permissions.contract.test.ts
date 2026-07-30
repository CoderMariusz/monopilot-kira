import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../scanner/session';

const state = vi.hoisted(() => ({
  grantedPermission: null as string | null,
  permissionChecks: vi.fn(),
  auditAttempt: vi.fn(),
  sessionAudit: vi.fn(),
  fakeClient: { query: vi.fn() },
}));

const session: ScannerSessionRow = {
  id: '10000000-0000-4000-8000-000000000001',
  org_id: '20000000-0000-4000-8000-000000000001',
  user_id: '30000000-0000-4000-8000-000000000001',
  device_id: null,
  site_id: '40000000-0000-4000-8000-000000000001',
  line_id: null,
  shift: null,
  mode: 'personal',
  session_token_hash: 'hash',
  expires_at: new Date('2030-01-01T00:00:00.000Z'),
  ended_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  last_seen_at: new Date('2026-01-01T00:00:00.000Z'),
};

const ids = {
  lp: '50000000-0000-4000-8000-000000000001',
  location: '60000000-0000-4000-8000-000000000001',
  shipment: '70000000-0000-4000-8000-000000000001',
  wo: '80000000-0000-4000-8000-000000000001',
  material: '90000000-0000-4000-8000-000000000001',
};

vi.mock('../../scanner/guard', () => ({
  requireScannerSession: vi.fn(async (_request, _body, _operation, fn) =>
    fn({ client: state.fakeClient, session, token: 'token' }),
  ),
}));

vi.mock('../../scanner/with-scanner-org', () => ({
  withScannerOrg: vi.fn(async (_client, _session, fn) =>
    fn({ client: state.fakeClient, session, orgId: session.org_id, userId: session.user_id }),
  ),
}));

vi.mock('../../scanner/txn-org-context', () => ({
  withTxnOrgContext: vi.fn(async (_client, _orgId, _userId, fn) => fn()),
}));

async function checkPermission(_ctx: unknown, permission: string): Promise<boolean> {
  state.permissionChecks(permission);
  return state.grantedPermission === permission;
}

vi.mock('../../production/shared', () => ({
  hasPermission: checkPermission,
  ProductionActionError: class ProductionActionError extends Error {},
  QualityHoldError: class QualityHoldError extends Error {},
}));

vi.mock('../../auth/has-permission', () => ({ hasPermission: checkPermission }));

vi.mock('../../scanner/audit', () => ({
  writeScannerSessionAudit: (...args: unknown[]) => state.sessionAudit(...args),
}));

vi.mock('../../../app/api/production/scanner/_support', () => ({
  auditAttempt: (...args: unknown[]) => state.auditAttempt(...args),
}));

vi.mock('./movement', () => ({
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  getScannerLpDetail: vi.fn(async () => ({ id: ids.lp, lpNumber: 'LP-001' })),
  moveScannerLp: vi.fn(async () => ({ ok: true, moveId: 'move-1' })),
  pickScannerLp: vi.fn(async () => ({ ok: true, moveId: 'move-1' })),
  WarehouseScannerError: class WarehouseScannerError extends Error {
    code = 'scanner_error';
    status = 409;
  },
}));

vi.mock('./receive-po', () => ({
  listScannerPurchaseOrders: vi.fn(async () => []),
  lookupScannerPurchaseOrder: vi.fn(async () => ({ kind: 'ok', po: { id: 'po-1' } })),
}));

vi.mock('../../shipping/pack-lp-into-box', () => ({
  packLpIntoBoxCore: vi.fn(async () => ({ ok: true, boxId: 'box-1' })),
}));

vi.mock('../../../app/api/scanner/site-access', () => ({
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  scannerLocationSiteAccess: vi.fn(async () => 'ok'),
  scannerLpSiteAccess: vi.fn(async () => 'ok'),
}));

import { POST as pick } from '../../../app/api/warehouse/scanner/pick/route';
import { GET as listPickLps } from '../../../app/api/warehouse/scanner/pick/lps/route';
import { POST as move } from '../../../app/api/warehouse/scanner/move/route';
import { POST as putaway } from '../../../app/api/warehouse/scanner/putaway/route';
import { POST as lockLp } from '../../../app/api/scanner/lock-lp/route';
import { POST as pack } from '../../../app/api/warehouse/scanner/ship/route';
import { GET as listShipments } from '../../../app/api/warehouse/scanner/ship/shipments/route';
import { GET as lookupLp } from '../../../app/api/warehouse/scanner/lp/route';
import { GET as listPos } from '../../../app/api/warehouse/scanner/pos/route';
import { GET as getPo } from '../../../app/api/warehouse/scanner/pos/[id]/route';
import { POST as labor } from '../../../app/api/scanner/labor/route';
import { POST as printLabel } from '../../../app/api/scanner/print-label/route';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function request(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Request {
  return new Request(`https://web.test${path}`, {
    method,
    headers: { authorization: 'Bearer token', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

type RouteCase = {
  name: string;
  permission: string;
  invoke(): Promise<Response>;
  printPermission?: boolean;
};

const routeCases: RouteCase[] = [
  {
    name: 'pick',
    permission: 'warehouse.stock.move',
    invoke: () =>
      pick(
        request('/api/warehouse/scanner/pick', 'POST', {
          clientOpId: 'pick-1',
          woId: 'not-a-uuid',
          materialId: 'not-a-uuid',
          lpId: 'not-a-uuid',
        }) as never,
      ),
  },
  {
    name: 'move',
    permission: 'warehouse.stock.move',
    invoke: () =>
      move(
        request('/api/warehouse/scanner/move', 'POST', {
          clientOpId: 'move-1',
          lpId: 'not-a-uuid',
          toLocationId: 'not-a-uuid',
        }) as never,
      ),
  },
  {
    name: 'putaway',
    permission: 'warehouse.stock.move',
    invoke: () =>
      putaway(
        request('/api/warehouse/scanner/putaway', 'POST', {
          clientOpId: 'putaway-1',
          lpId: 'not-a-uuid',
          toLocationId: 'not-a-uuid',
        }) as never,
      ),
  },
  {
    name: 'lock-lp',
    permission: 'warehouse.stock.move',
    invoke: () => lockLp(request('/api/scanner/lock-lp', 'POST', { lpId: ids.lp, acquire: true }) as never),
  },
  {
    name: 'ship pack',
    permission: 'ship.pack.close',
    invoke: () =>
      pack(
        request('/api/warehouse/scanner/ship', 'POST', {
          clientOpId: 'pack-1',
          shipmentId: 'not-a-uuid',
          lpId: 'not-a-uuid',
        }) as never,
      ),
  },
  {
    name: 'shipments list',
    permission: 'ship.pack.close',
    invoke: () => listShipments(request('/api/warehouse/scanner/ship/shipments', 'GET') as never),
  },
  {
    name: 'LP lookup',
    permission: 'warehouse.inventory.read',
    invoke: () => lookupLp(request('/api/warehouse/scanner/lp?code=LP-001', 'GET') as never),
  },
  {
    name: 'PO list',
    permission: 'warehouse.inventory.read',
    invoke: () => listPos(request('/api/warehouse/scanner/pos', 'GET') as never),
  },
  {
    name: 'PO detail',
    permission: 'warehouse.inventory.read',
    invoke: () =>
      getPo(request('/api/warehouse/scanner/pos/po-1', 'GET') as never, {
        params: Promise.resolve({ id: 'po-1' }),
      }),
  },
  {
    name: 'labor write',
    permission: 'production.consumption.write',
    invoke: () =>
      labor(
        request('/api/scanner/labor', 'POST', {
          action: 'out',
          woId: ids.wo,
          lineId: null,
        }) as never,
      ),
  },
  {
    name: 'print label',
    permission: 'warehouse.stock.move',
    printPermission: true,
    invoke: () => printLabel(request('/api/scanner/print-label', 'POST', { lpId: ids.lp }) as never),
  },
];

function auditCount(): number {
  const auditQueries = state.fakeClient.query.mock.calls.filter(([sql]) =>
    normalize(String(sql)).includes('insert into public.scanner_audit_log'),
  ).length;
  return state.auditAttempt.mock.calls.length + state.sessionAudit.mock.calls.length + auditQueries;
}

describe('WH-079 scanner write permission matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.grantedPermission = null;
    state.fakeClient.query.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        const requested = params?.[2] as string[] | undefined;
        return { rows: state.grantedPermission && requested?.includes(state.grantedPermission) ? [{ ok: true }] : [] };
      }
      if (q.includes('from public.work_orders wo')) return { rows: [{ allowed: true }] };
      if (q.includes('from public.license_plates') && q.includes('as entity_id')) {
        return {
          rows: [{
            entity_id: ids.lp,
            site_id: session.site_id,
            lp_code: 'LP-001',
            item_id: ids.material,
            gs1_gtin: null,
            batch_lot: null,
            expiry_date: null,
            catch_weight_kg: null,
          }],
        };
      }
      if (q.includes('from public.license_plates')) return { rows: [{ id: ids.lp }] };
      if (q.startsWith('insert into public.print_jobs')) {
        return { rows: [{ id: 'job-1', status: 'sent', result_url: 'data:text/plain,ok' }] };
      }
      if (q.includes('update public.license_plates lp')) return { rows: [{ stolen: false }] };
      return { rows: [] };
    });
  });

  it.each(routeCases)('$name denies the operation with 403 and audits forbidden', async (routeCase) => {
    const response = await routeCase.invoke();

    expect(response.status).toBe(403);
    expect(auditCount()).toBeGreaterThan(0);
  });

  it.each(routeCases)('$name accepts its exact permission', async (routeCase) => {
    state.grantedPermission = routeCase.permission;

    const response = await routeCase.invoke();

    expect(response.status).toBe(200);
    if (routeCase.printPermission) {
      const permissionQuery = state.fakeClient.query.mock.calls.find(([sql]) =>
        normalize(String(sql)).includes('from public.user_roles'),
      );
      expect(permissionQuery?.[1]?.[2]).toEqual([
        'settings.org.update',
        'warehouse.grn.receive',
        'warehouse.stock.move',
        'production.output.write',
      ]);
    } else {
      expect(state.permissionChecks).toHaveBeenCalledWith(routeCase.permission);
    }
  });
});

describe('WH-128 expired LP visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.fakeClient.query.mockImplementation(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.v_inventory_available inv')) {
        const filtersExpired = q.includes('expiry_date') && q.includes('current_date');
        return {
          rows: filtersExpired
            ? []
            : [{
                lp_id: ids.lp,
                lp_number: 'LP-EXPIRED',
                available_qty: '5',
                uom: 'kg',
                expiry_date: '2026-01-01',
                location_code: 'A-01',
              }],
        };
      }
      return { rows: [] };
    });
  });

  it('keeps an expired released LP in the scanner FEFO candidate response', async () => {
    const response = await listPickLps(
      request(`/api/warehouse/scanner/pick/lps?productId=${ids.material}&uom=kg`, 'GET') as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      lps: [expect.objectContaining({ id: ids.lp, lpNumber: 'LP-EXPIRED', expiryDate: '2026-01-01' })],
    });
  });

  it('rejects malformed FEFO candidate input', async () => {
    const response = await listPickLps(
      request('/api/warehouse/scanner/pick/lps?productId=not-a-uuid&uom=kg', 'GET') as never,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_input' });
  });
});
