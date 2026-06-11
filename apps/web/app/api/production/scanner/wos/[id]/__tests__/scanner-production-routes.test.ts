import { beforeEach, describe, expect, it, vi } from 'vitest';

import { scannerTransactionId } from '../../../_support';

import type { ScannerSessionRow } from '../../../../../../../lib/scanner/session';

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

const fakeClient = {
  query: vi.fn(),
};

const registerOutputMock = vi.fn();
const recordWasteMock = vi.fn();
const startWoMock = vi.fn();
const findUserByEmailMock = vi.fn();
const userHasPinMock = vi.fn();
const verifyPinMock = vi.fn();
// withScannerOrg has two overloads: (session, fn) for service calls (start/
// output/waste) and (client, session, fn) for scoped queries (lps). Dispatch
// on arity, mirroring the real signature.
const withScannerOrgMock = vi.fn(async (...args: unknown[]) => {
  if (typeof args[2] === 'function') {
    return (args[2] as (ctx: unknown) => Promise<unknown>)({
      client: fakeClient,
      session,
      orgId: session.org_id,
      userId: session.user_id,
    });
  }
  return (args[1] as (ctx: unknown) => Promise<unknown>)({
    userId: session.user_id,
    orgId: session.org_id,
    client: fakeClient,
  });
});

vi.mock('../../../../../../../lib/scanner/guard', () => ({
  requireScannerSession: vi.fn(async (_request, _body, _operation, fn) =>
    fn({ client: fakeClient, session, token: 'token' }),
  ),
}));

vi.mock('../../../../../../../lib/scanner/auth', () => ({
  findUserByEmail: (...args: unknown[]) => findUserByEmailMock(...args),
  userHasPin: (...args: unknown[]) => userHasPinMock(...args),
  verifyPin: (...args: unknown[]) => verifyPinMock(...args),
}));

vi.mock('../../../../../../../lib/scanner/with-scanner-org', () => ({
  withScannerOrg: (...args: unknown[]) => withScannerOrgMock(...args),
}));

vi.mock('../../../../../../../lib/production/output/register-output', () => ({
  registerOutput: (...args: unknown[]) => registerOutputMock(...args),
}));

vi.mock('../../../../../../../lib/production/waste/record-waste', () => ({
  recordWaste: (...args: unknown[]) => recordWasteMock(...args),
}));

vi.mock('../../../../../../../lib/production/start-wo', () => ({
  startWo: (...args: unknown[]) => startWoMock(...args),
}));

function request(body: Record<string, unknown>): Request {
  return new Request('https://web.test/api/production/scanner/wos/wo-id/action', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(query = ''): Request {
  return new Request(`https://web.test/api/production/scanner/wos/wo-id/action${query}`, {
    method: 'GET',
    headers: { authorization: 'Bearer token' },
  });
}

const context = { params: { id: '60000000-0000-0000-0000-000000000001' } };
const approverUserId = '30000000-0000-0000-0000-000000000099';

function materialGate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '70000000-0000-0000-0000-000000000001',
    product_id: '80000000-0000-0000-0000-000000000001',
    material_name: 'Sugar',
    required_qty: '10.000',
    consumed_qty: '5.000',
    uom: 'kg',
    threshold_pct: '0',
    warn_pct: '0',
    over_limit: false,
    over_warn: false,
    over_pct: '-25.0000000000000000',
    ...overrides,
  };
}

describe('production scanner WO routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient.query.mockReset();
    registerOutputMock.mockResolvedValue({
      output_id: 'out-1',
      lp_id: null,
      batch_number: 'B-1',
      expiry_date: null,
      catch_weight_summary: null,
      label_pdf_url: null,
    });
    recordWasteMock.mockResolvedValue({
      waste_id: 'waste-1',
      category_id: 'cat-1',
      category_code: 'TRIM',
      qty_kg: '1.250',
    });
    findUserByEmailMock.mockResolvedValue({
      id: approverUserId,
      org_id: session.org_id,
      email: 'supervisor@example.com',
      name: 'Supervisor',
    });
    userHasPinMock.mockResolvedValue(true);
    verifyPinMock.mockResolvedValue(true);
  });

  it('consume happy path increments material, decrements LP, and writes idempotency audit in one transaction', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.scanner_audit_log')) return { rows: [] };
      if (sql.includes('for update of wm')) return { rows: [materialGate()] };
      if (sql.includes('update public.wo_materials')) {
        return {
          rows: [{
            id: '70000000-0000-0000-0000-000000000001',
            product_id: '80000000-0000-0000-0000-000000000001',
            material_name: 'Sugar',
            consumed_qty: '2.500',
            uom: 'kg',
          }],
        };
      }
      if (sql.includes('update public.license_plates')) return { rows: [{ id: 'lp-1', quantity: '7.500' }] };
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-1',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '2.500',
        lpId: '90000000-0000-0000-0000-000000000001',
      }) as never,
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, replay: false, consumedQty: '2.500' });
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['begin', 'commit']));
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('client_op_id'))).toBe(true);
  });

  it('consume replay returns ok without reapplying material update and reconstructs the original response from the stored ext', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.scanner_audit_log')) {
        return {
          rows: [{
            ext: {
              materialId: '70000000-0000-0000-0000-000000000001',
              materialName: 'Sugar',
              qty: '1.000',
              consumedQty: '11.000',
              uom: 'kg',
              approverUserId: null,
              overPct: 10,
              warned: true,
              warnPct: 5,
            },
          }],
        };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-replay',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
      }) as never,
      context,
    );

    expect(response.status).toBe(200);
    // Replay fidelity: the replayed consume carries the ORIGINAL payload
    // (consumedQty/uom/warning/approverUserId), not a bare { replay: true }.
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      replay: true,
      materialId: '70000000-0000-0000-0000-000000000001',
      consumedQty: '11.000',
      uom: 'kg',
      approverUserId: null,
      warning: { overconsumed: true, overPct: 10, warnPct: 5 },
    });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('update public.wo_materials'))).toBe(false);
  });

  it('consume replay of a non-warned consume omits the warning payload', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.scanner_audit_log')) {
        return {
          rows: [{
            ext: {
              materialId: '70000000-0000-0000-0000-000000000001',
              qty: '2.500',
              consumedQty: '2.500',
              uom: 'kg',
              approverUserId: '60000000-0000-0000-0000-000000000099',
              overPct: null,
            },
          }],
        };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-replay-plain',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '2.500',
      }) as never,
      context,
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      replay: true,
      consumedQty: '2.500',
      uom: 'kg',
      approverUserId: '60000000-0000-0000-0000-000000000099',
    });
    expect(json.warning).toBeUndefined();
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('update public.wo_materials'))).toBe(false);
  });

  it('consume rejects an unknown/cross-org material (org filter bound to the SESSION org)', async () => {
    const { POST } = await import('../consume/route');
    let materialParams: unknown[] | null = null;
    fakeClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.scanner_audit_log')) return { rows: [] };
      if (sql.includes('for update of wm')) {
        materialParams = params ?? null;
        return { rows: [] };
      }
      if (sql.includes('update public.wo_materials')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-cross-org',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
      }) as never,
      context,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_material' });
    // The org filter is the ONLY isolation on this RLS-bypassed path — prove it
    // binds the SESSION org id, not anything from the request body.
    expect(materialParams).not.toBeNull();
    expect(materialParams![0]).toBe(session.org_id);
  });

  it('consume returns 403 forbidden (audited) when the session user lacks production.consumption.write', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [] };
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-forbidden',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
      }) as never,
      context,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'forbidden' });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('update public.wo_materials'))).toBe(false);
  });

  it('consume rejects LP underflow with 409 lp_unavailable and rolls the txn back', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.scanner_audit_log')) return { rows: [] };
      if (sql.includes('for update of wm')) return { rows: [materialGate()] };
      if (sql.includes('update public.wo_materials')) {
        return {
          rows: [{
            id: '70000000-0000-0000-0000-000000000001',
            product_id: '80000000-0000-0000-0000-000000000001',
            material_name: 'Sugar',
            consumed_qty: '2.500',
            uom: 'kg',
          }],
        };
      }
      // LP conditional UPDATE returns no row: quantity - qty < reserved_qty (or < 0)
      if (sql.includes('update public.license_plates')) return { rows: [] };
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-underflow',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '999',
        lpId: '90000000-0000-0000-0000-000000000001',
      }) as never,
      context,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_unavailable' });
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['rollback']));
    // No success audit row may be committed for the failed attempt inside the txn.
    const okAudit = fakeClient.query.mock.calls.some(
      (call) => String(call[0]).includes('insert into public.scanner_audit_log') && JSON.stringify(call[1] ?? []).includes('"ok"'),
    );
    expect(okAudit).toBe(false);
  });

  it('consume blocks over-consumption at 0 threshold without an approver', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.scanner_audit_log')) return { rows: [] };
      if (sql.includes('for update of wm')) {
        expect(params).toEqual([session.org_id, context.params.id, '70000000-0000-0000-0000-000000000001', '1.000']);
        return { rows: [materialGate({ required_qty: '10.000', consumed_qty: '10.000', over_limit: true, over_pct: '10.0000000000000000' })] };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-over-blocked',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
      }) as never,
      context,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'overconsume_approval_required',
      requiredQty: 10,
      consumedQty: 10,
      attemptedQty: 1,
      thresholdPct: 0,
      overPct: 10,
    });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('update public.wo_materials'))).toBe(false);
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['rollback']));
  });

  it('consume allows over required quantity within the configured threshold', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.scanner_audit_log')) return { rows: [] };
      if (sql.includes('for update of wm')) {
        return { rows: [materialGate({ required_qty: '10.000', consumed_qty: '10.000', threshold_pct: '10', over_limit: false, over_pct: '10.0000000000000000' })] };
      }
      if (sql.includes('update public.wo_materials')) {
        return {
          rows: [{
            id: '70000000-0000-0000-0000-000000000001',
            product_id: '80000000-0000-0000-0000-000000000001',
            material_name: 'Sugar',
            consumed_qty: '11.000',
            uom: 'kg',
          }],
        };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-over-threshold',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
      }) as never,
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, replay: false, consumedQty: '11.000' });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('insert into public.scanner_audit_log'))).toBe(true);
  });

  it('consume in the WARN band (over warn_pct, ≤ threshold_pct) proceeds with a warning payload and flags the audit ext', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.scanner_audit_log')) return { rows: [] };
      if (sql.includes('for update of wm')) {
        // 10% over required: above warn (5%) but within the approval tier (20%).
        return {
          rows: [materialGate({
            required_qty: '10.000',
            consumed_qty: '10.000',
            threshold_pct: '20',
            warn_pct: '5',
            over_limit: false,
            over_warn: true,
            over_pct: '10.0000000000000000',
          })],
        };
      }
      if (sql.includes('update public.wo_materials')) {
        return {
          rows: [{
            id: '70000000-0000-0000-0000-000000000001',
            product_id: '80000000-0000-0000-0000-000000000001',
            material_name: 'Sugar',
            consumed_qty: '11.000',
            uom: 'kg',
          }],
        };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-warn-band',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
      }) as never,
      context,
    );

    // The consume PROCEEDS (no approver involved) …
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      replay: false,
      consumedQty: '11.000',
      warning: { overconsumed: true, overPct: 10, warnPct: 5 },
    });
    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(verifyPinMock).not.toHaveBeenCalled();
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['commit']));
    // … and the event is logged: audit ext carries warned:true + overPct.
    const auditCall = fakeClient.query.mock.calls.find((call) => String(call[0]).includes('insert into public.scanner_audit_log'));
    const extParam = (auditCall?.[1] as unknown[] | undefined)?.find(
      (p) => typeof p === 'string' && p.includes('materialId'),
    ) as string | undefined;
    expect(extParam).toBeDefined();
    expect(JSON.parse(extParam ?? '{}')).toMatchObject({ warned: true, overPct: 10, approverUserId: null });
  });

  it('consume accepts over-consumption with a valid different approver PIN and permission', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('from public.user_roles')) {
        return { rows: params?.[2] === 'production.consumption.override_approve' || params?.[2] === 'production.consumption.write' ? [{ ok: true }] : [] };
      }
      if (sql.includes('from public.scanner_audit_log')) return { rows: [] };
      if (sql.includes('for update of wm')) {
        return { rows: [materialGate({ required_qty: '10.000', consumed_qty: '10.000', over_limit: true, over_pct: '10.0000000000000000' })] };
      }
      if (sql.includes('update public.wo_materials')) {
        return {
          rows: [{
            id: '70000000-0000-0000-0000-000000000001',
            product_id: '80000000-0000-0000-0000-000000000001',
            material_name: 'Sugar',
            consumed_qty: '11.000',
            uom: 'kg',
          }],
        };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-over-approved',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
        approver: { email: 'supervisor@example.com', pin: '1234' },
      }) as never,
      context,
    );

    expect(response.status).toBe(200);
    expect(findUserByEmailMock).toHaveBeenCalledWith(fakeClient, 'supervisor@example.com');
    expect(verifyPinMock).toHaveBeenCalledWith(approverUserId, '1234', { client: fakeClient });
    await expect(response.json()).resolves.toMatchObject({ ok: true, replay: false, consumedQty: '11.000' });
    const auditCall = fakeClient.query.mock.calls.find((call) => String(call[0]).includes('insert into public.scanner_audit_log'));
    const extParam = (auditCall?.[1] as unknown[] | undefined)?.find(
      (p) => typeof p === 'string' && p.includes('materialId'),
    ) as string | undefined;
    expect(extParam).toBeDefined();
    expect(JSON.parse(extParam ?? '{}')).toMatchObject({ approverUserId, overPct: 10 });
  });

  it('consume rejects over-consumption approval with a wrong approver PIN', async () => {
    const { POST } = await import('../consume/route');
    verifyPinMock.mockResolvedValueOnce(false);
    fakeClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.scanner_audit_log')) return { rows: [] };
      if (sql.includes('for update of wm')) {
        return { rows: [materialGate({ required_qty: '10.000', consumed_qty: '10.000', over_limit: true, over_pct: '10.0000000000000000' })] };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-over-wrong-pin',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
        approver: { email: 'supervisor@example.com', pin: '9999' },
      }) as never,
      context,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_pin' });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('update public.wo_materials'))).toBe(false);
    // The failed-attempt branch must COMMIT (not rollback) so verifyPin's
    // lockout counter persists — otherwise consume becomes a PIN brute-force oracle.
    expect(fakeClient.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['commit']));
    expect(fakeClient.query.mock.calls.map((call) => call[0])).not.toEqual(expect.arrayContaining(['rollback']));
  });

  it('consume rejects over-consumption when approver lacks production.consumption.override_approve', async () => {
    const { POST } = await import('../consume/route');
    fakeClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('from public.user_roles')) {
        return { rows: params?.[2] === 'production.consumption.write' ? [{ ok: true }] : [] };
      }
      if (sql.includes('from public.scanner_audit_log')) return { rows: [] };
      if (sql.includes('for update of wm')) {
        return { rows: [materialGate({ required_qty: '10.000', consumed_qty: '10.000', over_limit: true, over_pct: '10.0000000000000000' })] };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-over-no-permission',
        materialId: '70000000-0000-0000-0000-000000000001',
        qty: '1.000',
        approver: { email: 'supervisor@example.com', pin: '1234' },
      }) as never,
      context,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'approver_forbidden' });
    expect(fakeClient.query.mock.calls.some((call) => String(call[0]).includes('update public.wo_materials'))).toBe(false);
  });

  it('output derives deterministic transaction_id from clientOpId', async () => {
    const { POST } = await import('../output/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.work_orders')) {
        return { rows: [{ product_id: '80000000-0000-0000-0000-000000000001' }] };
      }
      return { rows: [] };
    });

    const response = await POST(
      request({
        clientOpId: 'op-output-1',
        qtyUnits: '10',
        unitsUom: 'each',
        actualWeightKg: '5.250',
      }) as never,
      context,
    );

    expect(response.status).toBe(200);
    const expectedTxn = scannerTransactionId('output', 'op-output-1');
    expect(registerOutputMock).toHaveBeenCalledWith(
      expect.anything(),
      context.params.id,
      expect.objectContaining({ transaction_id: expectedTxn, product_id: '80000000-0000-0000-0000-000000000001' }),
    );
    await expect(response.json()).resolves.toMatchObject({ ok: true, transactionId: expectedTxn });
  });

  it('detail returns producedBaseKg + producedUnits as decimal strings ("0" honest zero before any output)', async () => {
    const { GET } = await import('../route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.work_orders wo')) {
        return {
          rows: [{
            id: context.params.id,
            wo_number: 'WO-2026-0108',
            status: 'released',
            item_code: 'FG-001',
            product_name: 'Kabanos',
            planned_qty: '20',
            qty_entered: '20',
            qty_entered_uom: 'box',
            uom_snapshot: null,
            scheduled_start: null,
            produced_base_kg: '0',
            produced_units: '0',
            allergen_flag: false,
          }],
        };
      }
      if (sql.includes('from public.wo_materials')) return { rows: [] };
      if (sql.includes('from public.wo_outputs')) return { rows: [] };
      return { rows: [] };
    });

    const response = await GET(getRequest() as never, context);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.header).toMatchObject({ producedBaseKg: '0', producedUnits: '0' });
    expect(typeof json.header.producedBaseKg).toBe('string');
    expect(typeof json.header.producedUnits).toBe('string');
  });

  it('start derives deterministic transaction_id from clientOpId and calls startWo under the scanner org', async () => {
    const { POST } = await import('../start/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      return { rows: [] };
    });
    startWoMock.mockResolvedValue({
      ok: true,
      data: {
        woId: context.params.id,
        status: 'in_progress',
        startedAt: null,
        bomSnapshotId: 'snap-1',
        outputsMaterialized: 1,
        allergenGateRequired: false,
      },
    });

    const response = await POST(request({ clientOpId: 'op-start-1' }) as never, context);

    expect(response.status).toBe(200);
    const expectedTxn = scannerTransactionId('start', 'op-start-1');
    expect(startWoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ woId: context.params.id, transactionId: expectedTxn }),
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      transactionId: expectedTxn,
      replay: false,
    });
  });

  it('start returns 403 forbidden (audited) when the session user lacks production.wo.start', async () => {
    const { POST } = await import('../start/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [] };
      return { rows: [] };
    });

    const response = await POST(request({ clientOpId: 'op-start-forbidden' }) as never, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'forbidden' });
    expect(startWoMock).not.toHaveBeenCalled();
  });

  it('start maps incomplete allergen changeover gate to scanner-specific 409 payload', async () => {
    const { POST } = await import('../start/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      return { rows: [] };
    });
    startWoMock.mockResolvedValue({
      ok: false,
      error: 'allergen_changeover_required',
      status: 409,
      details: {
        code: 'changeover_signoff_required',
        changeoverId: '44444444-4444-4444-8444-444444444444',
      },
    });

    const response = await POST(request({ clientOpId: 'op-start-changeover' }) as never, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'changeover_signoff_required',
      changeoverId: '44444444-4444-4444-8444-444444444444',
    });
  });

  it('lps returns FEFO candidates for the material in route order with decimal-string qty + ISO expiry', async () => {
    const { GET } = await import('../lps/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.wo_materials')) {
        return { rows: [{ product_id: '80000000-0000-0000-0000-000000000001', uom: 'kg' }] };
      }
      if (sql.includes('from public.v_inventory_available')) {
        // FEFO order is the SQL's contract (expiry asc nulls last); the route
        // must preserve it 1:1 in the response.
        return {
          rows: [
            { lp_id: 'lp-1', lp_number: 'LP-0001', available_qty: '40.000', uom: 'kg', expiry_date: '2026-06-12' },
            { lp_id: 'lp-2', lp_number: 'LP-0002', available_qty: '80.000', uom: 'kg', expiry_date: '2026-06-20' },
            { lp_id: 'lp-3', lp_number: 'LP-0003', available_qty: '25.000', uom: 'kg', expiry_date: null },
          ],
        };
      }
      return { rows: [] };
    });

    const response = await GET(
      getRequest('?materialId=70000000-0000-0000-0000-000000000001') as never,
      context,
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.lps).toEqual([
      { lpId: 'lp-1', lpNumber: 'LP-0001', qty: '40.000', uom: 'kg', expiry: '2026-06-12' },
      { lpId: 'lp-2', lpNumber: 'LP-0002', qty: '80.000', uom: 'kg', expiry: '2026-06-20' },
      { lpId: 'lp-3', lpNumber: 'LP-0003', qty: '25.000', uom: 'kg', expiry: null },
    ]);

    // Org-scoping mechanism (RF4): both queries filter on app.current_org_id(),
    // which is NULL in autocommit (migration 002 keys app.active_org_contexts on
    // txid_current_if_assigned()). The route must therefore run them INSIDE a
    // transaction with the context registered for the SESSION org, then clean up.
    const sqls = fakeClient.query.mock.calls.map((call) => String(call[0]));
    const beginIdx = sqls.indexOf('begin');
    const registerIdx = sqls.findIndex((sql) => sql.includes('insert into app.session_org_contexts'));
    const setCtxIdx = sqls.findIndex((sql) => sql.includes('app.set_org_context'));
    const materialIdx = sqls.findIndex((sql) => sql.includes('from public.wo_materials'));
    const lpIdx = sqls.findIndex((sql) => sql.includes('from public.v_inventory_available'));
    const commitIdx = sqls.indexOf('commit');
    const cleanupIdx = sqls.findIndex((sql) => sql.includes('delete from app.session_org_contexts'));
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(registerIdx).toBeGreaterThan(beginIdx);
    expect(setCtxIdx).toBeGreaterThan(registerIdx);
    expect(materialIdx).toBeGreaterThan(setCtxIdx);
    expect(lpIdx).toBeGreaterThan(materialIdx);
    expect(commitIdx).toBeGreaterThan(lpIdx);
    expect(cleanupIdx).toBeGreaterThan(commitIdx);
    // Context is registered for the SESSION org (never anything from the request) …
    expect((fakeClient.query.mock.calls[registerIdx][1] as unknown[])[1]).toBe(session.org_id);
    expect((fakeClient.query.mock.calls[setCtxIdx][1] as unknown[])[1]).toBe(session.org_id);
    // … and the queries themselves carry NO org bind — app.current_org_id() is the only org filter.
    expect(sqls[materialIdx]).toContain('app.current_org_id()');
    expect(sqls[lpIdx]).toContain('app.current_org_id()');
    expect(fakeClient.query.mock.calls[materialIdx][1]).toEqual([context.params.id, '70000000-0000-0000-0000-000000000001']);
  });

  it('lps rejects a missing materialId with 400 missing_fields', async () => {
    const { GET } = await import('../lps/route');

    const response = await GET(getRequest() as never, context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'missing_fields' });
  });

  it('waste rejects non-string regulated qty before calling service', async () => {
    const { POST } = await import('../waste/route');
    const response = await POST(
      request({
        clientOpId: 'op-waste-1',
        categoryCode: 'TRIM',
        qtyKg: 1.25,
      }) as never,
      context,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_qty' });
    expect(recordWasteMock).not.toHaveBeenCalled();
  });

  it('waste-categories returns live active scanner category codes', async () => {
    const { GET } = await import('../../../waste-categories/route');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.waste_categories')) {
        return {
          rows: [
            { code: 'SPILL', name: 'Spill' },
            { code: 'TRIM', name: 'Trim / offcut' },
          ],
        };
      }
      return { rows: [] };
    });

    const response = await GET(
      new Request('https://web.test/api/production/scanner/waste-categories', {
        method: 'GET',
        headers: { authorization: 'Bearer token' },
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      categories: [
        { code: 'SPILL', name: 'Spill' },
        { code: 'TRIM', name: 'Trim / offcut' },
      ],
    });

    // Org-scoping mechanism (RF4): the SELECT filters on app.current_org_id(),
    // which is NULL in autocommit — it must run inside a transaction with the
    // org context registered for the SESSION org (txn-org-context), then clean up.
    const sqls = fakeClient.query.mock.calls.map((call) => String(call[0]));
    const beginIdx = sqls.indexOf('begin');
    const registerIdx = sqls.findIndex((sql) => sql.includes('insert into app.session_org_contexts'));
    const setCtxIdx = sqls.findIndex((sql) => sql.includes('app.set_org_context'));
    const selectIdx = sqls.findIndex((sql) => sql.includes('from public.waste_categories'));
    const commitIdx = sqls.indexOf('commit');
    const cleanupIdx = sqls.findIndex((sql) => sql.includes('delete from app.session_org_contexts'));
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(registerIdx).toBeGreaterThan(beginIdx);
    expect(setCtxIdx).toBeGreaterThan(registerIdx);
    expect(selectIdx).toBeGreaterThan(setCtxIdx);
    expect(commitIdx).toBeGreaterThan(selectIdx);
    expect(cleanupIdx).toBeGreaterThan(commitIdx);
    expect((fakeClient.query.mock.calls[registerIdx][1] as unknown[])[1]).toBe(session.org_id);
    expect((fakeClient.query.mock.calls[setCtxIdx][1] as unknown[])[1]).toBe(session.org_id);
    expect(sqls[selectIdx]).toContain('app.current_org_id()');
  });
});
