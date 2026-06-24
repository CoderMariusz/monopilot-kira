import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerSessionRow } from '../../../../../../../lib/scanner/session';

const operatorUserId = '30000000-0000-0000-0000-000000000001';
const supervisorUserId = '30000000-0000-0000-0000-000000000099';
const orgId = '20000000-0000-0000-0000-000000000001';
const woId = '60000000-0000-0000-0000-000000000001';
const consumptionId = '71000000-0000-0000-0000-000000000001';
const reverseConsumptionId = '72000000-0000-0000-0000-000000000001';
const lpId = '90000000-0000-0000-0000-000000000001';
const componentId = '80000000-0000-0000-0000-000000000001';
const materialLineAId = '70000000-0000-0000-0000-000000000001';
const materialLineBId = '70000000-0000-0000-0000-000000000002';

const session: ScannerSessionRow = {
  id: '10000000-0000-0000-0000-000000000001',
  org_id: orgId,
  user_id: operatorUserId,
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

const findUserByEmailMock = vi.fn();
const userHasPinMock = vi.fn();
const verifyPinMock = vi.fn();
const hasPermissionMock = vi.fn();

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

vi.mock('../../../../../../../lib/production/shared', () => ({
  hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
}));

const context = { params: { id: woId } };

function request(body: Record<string, unknown>): Request {
  return new Request(`https://web.test/api/production/scanner/wos/${woId}/reverse-consume`, {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    clientOpId: 'reverse-op-1',
    consumptionId,
    operatorPin: '1234',
    reasonCode: 'wrong_quantity',
    note: 'scanner correction',
    ...overrides,
  };
}

function supervisorBody(overrides: Record<string, unknown> = {}) {
  return body({
    supervisorEmail: 'supervisor@example.com',
    supervisorPin: '9876',
    ...overrides,
  });
}

function originalConsumption(overrides: Record<string, unknown> = {}) {
  return {
    id: consumptionId,
    transaction_id: '73000000-0000-0000-0000-000000000001',
    site_id: '74000000-0000-0000-0000-000000000001',
    wo_id: woId,
    component_id: componentId,
    lp_id: lpId,
    qty_consumed: '2.500',
    uom: 'kg',
    operator_id: operatorUserId,
    fefo_adherence_flag: true,
    fefo_deviation_reason: null,
    over_consumption_flag: false,
    over_consumption_approved_by: null,
    over_consumption_approved_at: null,
    over_consumption_reason_code: null,
    ext_jsonb: {},
    consumed_at: '2026-01-01T00:00:00.000Z',
    wo_status: 'in_progress',
    ...overrides,
  };
}

function restorableLp(overrides: Record<string, unknown> = {}) {
  return {
    id: lpId,
    site_id: '74000000-0000-0000-0000-000000000001',
    status: 'consumed',
    qa_status: 'released',
    quantity: '0.000',
    reserved_qty: '0.000',
    ...overrides,
  };
}

type QueryOptions = {
  requireSupervisor?: boolean;
  replayExt?: Record<string, unknown> | null;
  original?: Record<string, unknown> | null;
  existingCorrection?: boolean;
  lp?: Record<string, unknown> | null;
  duplicateCorrectionInsert?: boolean;
  canDecrement?: boolean;
  materialRows?: Array<{ id: string; product_id: string; consumed_qty: string }>;
};

function installQueryMock(options: QueryOptions = {}) {
  fakeClient.query.mockImplementation(async (sqlInput: string, paramsInput?: unknown[]) => {
    const sql = String(sqlInput);
    const params = paramsInput ?? [];
    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [] };
    if (sql.includes('insert into app.session_org_contexts')) return { rows: [] };
    if (sql.includes('select app.set_org_context')) return { rows: [] };
    if (sql.includes('delete from app.session_org_contexts')) return { rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('from public.scanner_audit_log') && sql.includes('select ext')) {
      return { rows: options.replayExt ? [{ ext: options.replayExt }] : [] };
    }
    if (sql.includes('from public.tenant_variations')) {
      return { rows: [{ require_supervisor: options.requireSupervisor === false ? 'false' : 'true' }] };
    }
    if (sql.includes('from public.wo_material_consumption c')) {
      return { rows: options.original === null ? [] : [options.original ?? originalConsumption()] };
    }
    if (sql.includes('from public.wo_material_consumption') && sql.includes('correction_of_id = $1::uuid')) {
      return { rows: options.existingCorrection ? [{ ok: true }] : [] };
    }
    if (sql.includes('from public.license_plates')) {
      return { rows: options.lp === null ? [] : [options.lp ?? restorableLp()] };
    }
    if (sql.includes('(consumed_qty - $3::numeric >= 0) as can_decrement')) {
      if (options.materialRows) {
        const scopedId = String(params[1]);
        const qty = Number(params[2]);
        const scopeKey = sql.includes('and id = $2::uuid') ? 'id' : 'product_id';
        const matchingRows = options.materialRows.filter((row) => row[scopeKey] === scopedId);
        return {
          rows: matchingRows
            .filter((row) => Number(row.consumed_qty) - qty >= 0)
            .map((row) => ({ id: row.id, can_decrement: true, matching_line_count: String(matchingRows.length) })),
        };
      }
      return {
        rows: [{
          id: '70000000-0000-0000-0000-000000000001',
          can_decrement: options.canDecrement ?? true,
          matching_line_count: '1',
        }],
      };
    }
    if (sql.includes('insert into public.wo_material_consumption')) {
      if (options.duplicateCorrectionInsert) throw Object.assign(new Error('duplicate correction'), { code: '23505' });
      return { rows: [{ id: reverseConsumptionId }] };
    }
    if (sql.includes('update public.wo_materials')) {
      if (options.materialRows) {
        const scopedId = String(params[1]);
        const qty = Number(params[2]);
        const scopeKey = sql.includes('and id = $2::uuid') ? 'id' : 'product_id';
        const matchingRows = options.materialRows.filter((row) => row[scopeKey] === scopedId);
        const updated = options.materialRows
          .filter((row) => row[scopeKey] === scopedId)
          .filter(() => scopeKey === 'id' || matchingRows.length === 1)
          .filter((row) => Number(row.consumed_qty) - qty >= 0);
        for (const row of updated) {
          row.consumed_qty = (Number(row.consumed_qty) - qty).toFixed(3);
        }
        return { rows: updated.map((row) => ({ id: row.id })) };
      }
      return { rows: [{ id: '70000000-0000-0000-0000-000000000001' }] };
    }
    if (sql.includes('update public.license_plates')) return { rows: [{ id: lpId }] };
    return { rows: [] };
  });
}

function mutationSqls() {
  return fakeClient.query.mock.calls.map((call) => String(call[0]));
}

function expectNoReverseWrites() {
  const sqls = mutationSqls();
  expect(sqls.some((sql) => sql.includes('insert into public.wo_material_consumption'))).toBe(false);
  expect(sqls.some((sql) => sql.includes('update public.wo_materials'))).toBe(false);
  expect(sqls.some((sql) => sql.includes('update public.license_plates'))).toBe(false);
}

describe('scanner reverse-consume route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient.query.mockReset();
    findUserByEmailMock.mockResolvedValue({
      id: supervisorUserId,
      org_id: orgId,
      email: 'supervisor@example.com',
      name: 'Supervisor',
    });
    userHasPinMock.mockResolvedValue(true);
    verifyPinMock.mockResolvedValue(true);
    hasPermissionMock.mockResolvedValue(true);
    installQueryMock();
  });

  it('operator-PIN-only happy path reverses consumption and records no supervisor', async () => {
    const { POST } = await import('../reverse-consume/route');
    installQueryMock({ requireSupervisor: false });

    const response = await POST(request(body()) as never, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      success: true,
      replay: false,
      consumption_id: consumptionId,
      reverse_consumption_id: reverseConsumptionId,
      lp_status_after: 'available',
    });
    expect(hasPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: operatorUserId, orgId }),
      'production.consumption.correct',
    );
    expect(hasPermissionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: supervisorUserId }),
      expect.any(String),
    );
    const sqls = mutationSqls();
    const counterIndex = sqls.findIndex((sql) => sql.includes('insert into public.wo_material_consumption'));
    const decrementIndex = sqls.findIndex((sql) => sql.includes('update public.wo_materials'));
    const restoreIndex = sqls.findIndex((sql) => sql.includes('update public.license_plates'));
    const historyIndex = sqls.findIndex((sql) => sql.includes('insert into public.lp_state_history'));
    expect(counterIndex).toBeGreaterThan(-1);
    expect(decrementIndex).toBeGreaterThan(counterIndex);
    expect(restoreIndex).toBeGreaterThan(decrementIndex);
    expect(historyIndex).toBeGreaterThan(restoreIndex);
  });

  it('scopes duplicate component decrement to the consumed material line id', async () => {
    const { POST } = await import('../reverse-consume/route');
    const materialRows = [
      { id: materialLineAId, product_id: componentId, consumed_qty: '5.000' },
      { id: materialLineBId, product_id: componentId, consumed_qty: '7.000' },
    ];
    installQueryMock({
      requireSupervisor: false,
      materialRows,
      original: originalConsumption({
        component_id: componentId,
        qty_consumed: '2.000',
        ext_jsonb: { materialId: materialLineAId },
      }),
    });

    const response = await POST(request(body({ clientOpId: 'reverse-op-dup-line' })) as never, context);

    expect(response.status).toBe(200);
    expect(materialRows).toEqual([
      { id: materialLineAId, product_id: componentId, consumed_qty: '3.000' },
      { id: materialLineBId, product_id: componentId, consumed_qty: '7.000' },
    ]);
    const woMaterialSqls = fakeClient.query.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.includes('public.wo_materials'));
    expect(woMaterialSqls).toHaveLength(2);
    expect(woMaterialSqls.every((sql) => sql.includes('and id = $2::uuid'))).toBe(true);
    const decrementCall = fakeClient.query.mock.calls.find((call) => String(call[0]).includes('update public.wo_materials'));
    expect(decrementCall?.[1]).toEqual([woId, materialLineAId, '2.000']);
  });

  it('rejects legacy consumption on duplicate component lines without decrementing any material row', async () => {
    const { POST } = await import('../reverse-consume/route');
    const materialRows = [
      { id: materialLineAId, product_id: componentId, consumed_qty: '5.000' },
      { id: materialLineBId, product_id: componentId, consumed_qty: '7.000' },
    ];
    installQueryMock({
      requireSupervisor: false,
      materialRows,
      original: originalConsumption({
        component_id: componentId,
        qty_consumed: '2.000',
        ext_jsonb: { source: 'legacy' },
      }),
    });

    const response = await POST(request(body({ clientOpId: 'reverse-op-legacy-dup' })) as never, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'inconsistent_ledger' });
    expect(materialRows).toEqual([
      { id: materialLineAId, product_id: componentId, consumed_qty: '5.000' },
      { id: materialLineBId, product_id: componentId, consumed_qty: '7.000' },
    ]);
    const woMaterialSqls = fakeClient.query.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.includes('public.wo_materials'));
    expect(woMaterialSqls).toHaveLength(1);
    expect(woMaterialSqls[0]).toContain('product_id = $2::uuid');
    expect(woMaterialSqls[0]).toContain('for update');
    expect(mutationSqls().some((sql) => sql.includes('insert into public.wo_material_consumption'))).toBe(false);
    expect(mutationSqls().some((sql) => sql.includes('update public.wo_materials'))).toBe(false);
  });

  it('allows legacy consumption on a single component line and decrements that line', async () => {
    const { POST } = await import('../reverse-consume/route');
    const materialRows = [{ id: materialLineAId, product_id: componentId, consumed_qty: '5.000' }];
    installQueryMock({
      requireSupervisor: false,
      materialRows,
      original: originalConsumption({
        component_id: componentId,
        qty_consumed: '2.000',
        ext_jsonb: { source: 'legacy' },
      }),
    });

    const response = await POST(request(body({ clientOpId: 'reverse-op-legacy-single' })) as never, context);

    expect(response.status).toBe(200);
    expect(materialRows).toEqual([{ id: materialLineAId, product_id: componentId, consumed_qty: '3.000' }]);
    const decrementCall = fakeClient.query.mock.calls.find((call) => String(call[0]).includes('update public.wo_materials'));
    expect(String(decrementCall?.[0])).toContain('(select count(*) from locked_materials) = 1');
    expect(decrementCall?.[1]).toEqual([woId, componentId, '2.000']);
  });

  it('supervisor-required happy path requires dual-control override approval', async () => {
    const { POST } = await import('../reverse-consume/route');
    installQueryMock({ requireSupervisor: true });

    const response = await POST(request(supervisorBody()) as never, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, success: true, replay: false });
    expect(hasPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: operatorUserId, orgId }),
      'production.consumption.correct',
    );
    expect(hasPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: supervisorUserId, orgId }),
      'production.consumption.override_approve',
    );
  });

  it('rejects missing or invalid operator PIN before reverse writes', async () => {
    const { POST } = await import('../reverse-consume/route');

    const missing = await POST(request(body({ operatorPin: undefined })) as never, context);
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ ok: false, error: 'missing_fields' });

    verifyPinMock.mockResolvedValueOnce(false);
    const invalid = await POST(request(body({ clientOpId: 'reverse-op-invalid-pin' })) as never, context);
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({ ok: false, error: 'invalid_pin' });
    expectNoReverseWrites();
  });

  it('rejects missing, wrong, or locked supervisor PIN before reverse writes', async () => {
    const { POST } = await import('../reverse-consume/route');
    installQueryMock({ requireSupervisor: true });

    const missing = await POST(request(body({ clientOpId: 'reverse-op-missing-supervisor' })) as never, context);
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toMatchObject({ ok: false, error: 'invalid_supervisor' });

    verifyPinMock.mockImplementation(async (userId: string) => (userId === supervisorUserId ? false : true));
    const wrong = await POST(request(supervisorBody({ clientOpId: 'reverse-op-wrong-supervisor' })) as never, context);
    expect(wrong.status).toBe(401);
    await expect(wrong.json()).resolves.toMatchObject({ ok: false, error: 'invalid_pin' });

    verifyPinMock.mockImplementation(async (userId: string) => (userId === supervisorUserId ? 'locked' : true));
    const locked = await POST(request(supervisorBody({ clientOpId: 'reverse-op-locked-supervisor' })) as never, context);
    expect(locked.status).toBe(423);
    await expect(locked.json()).resolves.toMatchObject({ ok: false, error: 'pin_locked' });
    expectNoReverseWrites();
  });

  it('rejects supervisor same as operator for separation of duties', async () => {
    const { POST } = await import('../reverse-consume/route');
    findUserByEmailMock.mockResolvedValueOnce({
      id: operatorUserId,
      org_id: orgId,
      email: 'operator@example.com',
      name: 'Operator',
    });

    const response = await POST(request(supervisorBody()) as never, context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_supervisor' });
    expectNoReverseWrites();
  });

  it('rejects a cross-org supervisor before reverse writes', async () => {
    const { POST } = await import('../reverse-consume/route');
    findUserByEmailMock.mockResolvedValueOnce({
      id: supervisorUserId,
      org_id: '20000000-0000-0000-0000-000000000099',
      email: 'supervisor@example.com',
      name: 'Supervisor',
    });

    const response = await POST(request(supervisorBody()) as never, context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_supervisor' });
    expectNoReverseWrites();
  });

  it('rejects an operator without production.consumption.correct in operator-PIN-only mode', async () => {
    const { POST } = await import('../reverse-consume/route');
    installQueryMock({ requireSupervisor: false });
    hasPermissionMock.mockImplementation(async (_ctx: unknown, permission: string) => permission !== 'production.consumption.correct');

    const response = await POST(request(body()) as never, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'forbidden' });
    expect(hasPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: operatorUserId, orgId }),
      'production.consumption.correct',
    );
    expectNoReverseWrites();
  });

  it('rejects closed-WO correction when the operator lacks production.corrections.closed_wo', async () => {
    const { POST } = await import('../reverse-consume/route');
    installQueryMock({
      requireSupervisor: false,
      original: originalConsumption({ wo_status: 'closed' }),
    });
    hasPermissionMock.mockImplementation(async (_ctx: unknown, permission: string) => permission !== 'production.corrections.closed_wo');

    const response = await POST(request(body()) as never, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'closed_wo_correction_forbidden' });
    expect(hasPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: operatorUserId, orgId }),
      'production.corrections.closed_wo',
    );
    expectNoReverseWrites();
  });

  it('maps duplicate correction insert 23505 to already_corrected when no replay audit is found', async () => {
    const { POST } = await import('../reverse-consume/route');
    installQueryMock({ requireSupervisor: false, duplicateCorrectionInsert: true });

    const response = await POST(request(body()) as never, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'already_corrected' });
    const sqls = mutationSqls();
    expect(sqls.some((sql) => sql.includes('insert into public.wo_material_consumption'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('update public.wo_materials'))).toBe(false);
    expect(sqls.some((sql) => sql.includes('update public.license_plates'))).toBe(false);
  });

  it('rejects lp_not_restorable before reverse writes', async () => {
    const { POST } = await import('../reverse-consume/route');
    installQueryMock({ requireSupervisor: false, lp: restorableLp({ status: 'quarantined' }) });

    const response = await POST(request(body()) as never, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'lp_not_restorable' });
    expectNoReverseWrites();
  });

  it('returns idempotent replay from client_op_id without reapplying writes', async () => {
    const { POST } = await import('../reverse-consume/route');
    installQueryMock({
      replayExt: {
        success: true,
        consumption_id: consumptionId,
        reverse_consumption_id: reverseConsumptionId,
        lp_status_after: 'available',
      },
    });

    const response = await POST(request(body()) as never, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      success: true,
      replay: true,
      consumption_id: consumptionId,
      reverse_consumption_id: reverseConsumptionId,
      lp_status_after: 'available',
    });
    expect(verifyPinMock).not.toHaveBeenCalled();
    expectNoReverseWrites();
  });
});
