import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: readonly unknown[] };

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUTTING_ID = '33333333-3333-4333-8333-333333333333';
const MIXING_ID = '44444444-4444-4444-8444-444444444444';
const PROCESS_DEFAULT_ID = '55555555-5555-4555-8555-555555555555';

const harness = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  permissionGranted: true,
  operationRows: [] as Array<Record<string, unknown>>,
  processDefaultRows: [] as Array<Record<string, unknown>>,
  upsertRows: [] as Array<Record<string, unknown>>,
  roleGroupRows: [] as Array<Record<string, unknown>>,
  productRateRows: [] as Array<Record<string, unknown>>,
  existingPrefixRows: [] as Array<Record<string, unknown>>,
  takenPrefixRows: [] as Array<Record<string, unknown>>,
}));

function makeClient() {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
      harness.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from public.user_roles')) {
        return {
          rows: (harness.permissionGranted ? [{ ok: true }] : []) as T[],
          rowCount: harness.permissionGranted ? 1 : 0,
        };
      }

      if (normalized.startsWith('select mo.id::text as operation_id')) {
        return { rows: harness.processDefaultRows as T[], rowCount: harness.processDefaultRows.length };
      }

      if (normalized.startsWith('select wp.process_name')) {
        return { rows: harness.productRateRows as T[], rowCount: harness.productRateRows.length };
      }

      if (normalized.startsWith('select id::text') && normalized.includes('from "reference"."manufacturingoperations"')) {
        return { rows: harness.operationRows as T[], rowCount: harness.operationRows.length };
      }

      if (normalized.includes('from public.labor_rates')) {
        return { rows: harness.roleGroupRows as T[], rowCount: harness.roleGroupRows.length };
      }

      if (normalized.startsWith('select prefix') && normalized.includes('operation_id = $1::uuid')) {
        return { rows: harness.existingPrefixRows as T[], rowCount: harness.existingPrefixRows.length };
      }

      if (normalized.startsWith('select prefix') && normalized.includes("prefix ~ ('^' || $1 || '-[0-9]+$')")) {
        return { rows: harness.takenPrefixRows as T[], rowCount: harness.takenPrefixRows.length };
      }

      if (normalized.includes('insert into public.npd_process_defaults')) {
        return { rows: harness.upsertRows as T[], rowCount: harness.upsertRows.length };
      }

      if (normalized.includes('delete from public.npd_process_default_roles')) {
        return { rows: [] as T[], rowCount: 1 };
      }

      if (normalized.includes('insert into public.npd_process_default_roles')) {
        return { rows: [] as T[], rowCount: 1 };
      }

      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (fn: (ctx: unknown) => Promise<unknown>) =>
    fn({
      userId: USER_ID,
      orgId: ORG_ID,
      client: makeClient(),
    }),
  ),
}));

/** Base valid upsert input (W2-T1 unified-screen shape). */
function upsertInput(overrides: Record<string, unknown> = {}) {
  return {
    operationId: CUTTING_ID,
    standardCost: 0,
    costOverridden: false,
    defaultDurationHours: 1,
    setupCost: 0,
    throughputPerHour: null,
    throughputUom: null,
    yieldPct: 100,
    prefix: '',
    roles: [] as Array<{ roleGroup: string; defaultHeadcount: number }>,
    ...overrides,
  };
}

describe('process defaults actions', () => {
  beforeEach(() => {
    harness.calls = [];
    harness.permissionGranted = true;
    harness.operationRows = [{ id: CUTTING_ID, process_suffix: 'PREP' }];
    harness.processDefaultRows = [
      {
        operation_id: CUTTING_ID,
        operation_name: 'Cutting',
        process_suffix: 'PREP',
        configured: false,
        prefix: null,
        standard_cost: '0',
        cost_overridden: false,
        default_duration_hours: '0',
        setup_cost: '0',
        throughput_per_hour: null,
        throughput_uom: null,
        yield_pct: '100',
        roles: [],
      },
      {
        operation_id: MIXING_ID,
        operation_name: 'Mixing',
        process_suffix: 'MIX',
        configured: true,
        prefix: 'MIX-01',
        standard_cost: '125.5000',
        cost_overridden: true,
        default_duration_hours: '2.2500',
        setup_cost: '10.0000',
        throughput_per_hour: '250.0000',
        throughput_uom: 'kg',
        yield_pct: '97.500',
        roles: [{ roleGroup: 'operator', defaultHeadcount: 2 }],
      },
    ];
    harness.upsertRows = [{ id: PROCESS_DEFAULT_ID }];
    harness.roleGroupRows = [
      { role_group: 'operator', rate_per_hour: '14.5000' },
      { role_group: 'packer', rate_per_hour: '12.0000' },
      { role_group: 'supervisor', rate_per_hour: '20.0000' },
    ];
    harness.productRateRows = [];
    harness.existingPrefixRows = [];
    harness.takenPrefixRows = [];
    vi.clearAllMocks();
  });

  it('listLaborRateRoleGroups returns org-scoped distinct role groups effective today', async () => {
    const { listLaborRateRoleGroups } = await import('./process-defaults-actions');

    const res = await listLaborRateRoleGroups();

    expect(res).toEqual({ ok: true, data: ['operator', 'packer', 'supervisor'] });

    const call = harness.calls.find((entry) => entry.sql.includes('from public.labor_rates'));
    expect(call?.sql).toContain('distinct on (lower(role_group))');
    expect(call?.sql).toContain('org_id = app.current_org_id()');
    expect(call?.sql).toContain('effective_from <= current_date');
  });

  it('listLaborRateRoleGroupRates returns groups WITH their effective hourly rate', async () => {
    const { listLaborRateRoleGroupRates } = await import('./process-defaults-actions');

    const res = await listLaborRateRoleGroupRates();

    expect(res).toEqual({
      ok: true,
      data: [
        { roleGroup: 'operator', ratePerHour: 14.5 },
        { roleGroup: 'packer', ratePerHour: 12 },
        { roleGroup: 'supervisor', ratePerHour: 20 },
      ],
    });
  });

  it('listProcessDefaults returns operations with suffix/prefix/cost-override/setup/throughput/yield', async () => {
    const { listProcessDefaults } = await import('./process-defaults-actions');

    const res = await listProcessDefaults();

    expect(res).toEqual({
      ok: true,
      data: [
        {
          operationId: CUTTING_ID,
          operationName: 'Cutting',
          processSuffix: 'PREP',
          prefix: null,
          standardCost: 0,
          costOverridden: false,
          defaultDurationHours: 0,
          setupCost: 0,
          throughputPerHour: null,
          throughputUom: null,
          yieldPct: 100,
          roles: [],
          productRates: [],
        },
        {
          operationId: MIXING_ID,
          operationName: 'Mixing',
          processSuffix: 'MIX',
          prefix: 'MIX-01',
          standardCost: 125.5,
          costOverridden: true,
          defaultDurationHours: 2.25,
          setupCost: 10,
          throughputPerHour: 250,
          throughputUom: 'kg',
          yieldPct: 97.5,
          roles: [{ roleGroup: 'operator', defaultHeadcount: 2 }],
          productRates: [],
        },
      ],
    });

    const listCall = harness.calls.find((entry) => entry.sql.includes('left join public.npd_process_defaults'));
    expect(listCall?.sql).toContain('"Reference"."ManufacturingOperations"');
    expect(listCall?.sql).toContain('left join public.npd_process_default_roles');
    expect(listCall?.sql).toContain('mo.org_id = app.current_org_id()');
    expect(listCall?.sql).toContain('and mo.is_active = true');
  });

  it('listProcessDefaults surfaces read-only per-product rates from npd_wip_processes by name', async () => {
    harness.productRateRows = [
      {
        process_name: 'mixing',
        product_code: 'FG-0001',
        throughput_per_hour: '120.0000',
        throughput_uom: 'kg',
        setup_cost: '5.0000',
        yield_pct: '95.000',
      },
    ];
    const { listProcessDefaults } = await import('./process-defaults-actions');

    const res = await listProcessDefaults();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const mixing = res.data.find((row) => row.operationName === 'Mixing');
    expect(mixing?.productRates).toEqual([
      { productCode: 'FG-0001', throughputPerHour: 120, throughputUom: 'kg', setupCost: 5, yieldPct: 95 },
    ]);

    const rateCall = harness.calls.find((entry) => entry.sql.includes('from public.npd_wip_processes'));
    expect(rateCall?.sql).toContain('join public.prod_detail');
    expect(rateCall?.sql).toContain('wp.org_id = app.current_org_id()');
  });

  it('upsertProcessDefaults upserts all fields, replace-sets roles, scopes by org, and is RBAC-gated', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults(
      upsertInput({
        standardCost: 42.25,
        costOverridden: true,
        defaultDurationHours: 1.5,
        setupCost: 7.5,
        throughputPerHour: 300,
        throughputUom: 'kg',
        yieldPct: 96,
        prefix: 'PREP-09',
        roles: [
          { roleGroup: 'operator', defaultHeadcount: 2 },
          { roleGroup: 'supervisor', defaultHeadcount: 1 },
        ],
      }),
    );

    expect(res).toEqual({ ok: true });

    const permissionCall = harness.calls.find((entry) => entry.sql.includes('from public.user_roles'));
    expect(permissionCall?.params).toEqual([USER_ID, ORG_ID, 'npd.schema.edit']);

    const operationCall = harness.calls.find((entry) => entry.sql.includes('from "Reference"."ManufacturingOperations"'));
    expect(operationCall?.sql).toContain('org_id = app.current_org_id()');
    expect(operationCall?.sql).toContain('is_active = true');
    expect(operationCall?.params).toEqual([CUTTING_ID]);

    const upsertCall = harness.calls.find((entry) => entry.sql.includes('insert into public.npd_process_defaults'));
    expect(upsertCall?.sql).toContain('on conflict (org_id, operation_id)');
    expect(upsertCall?.sql).toContain('cost_overridden = excluded.cost_overridden');
    expect(upsertCall?.sql).toContain('prefix = excluded.prefix');
    // manual prefix wins — no auto-number scan
    expect(upsertCall?.params).toEqual([CUTTING_ID, 42.25, true, 1.5, 7.5, 300, 'kg', 96, 'PREP-09']);

    const deleteCall = harness.calls.find((entry) => entry.sql.includes('delete from public.npd_process_default_roles'));
    expect(deleteCall?.sql).toContain('org_id = app.current_org_id()');
    expect(deleteCall?.params).toEqual([PROCESS_DEFAULT_ID]);

    const roleInsertCalls = harness.calls.filter((entry) =>
      entry.sql.includes('insert into public.npd_process_default_roles'),
    );
    expect(roleInsertCalls).toHaveLength(2);
    expect(roleInsertCalls[0]?.sql).toContain('values (app.current_org_id(), $1::uuid, $2::text, $3::int)');
    expect(roleInsertCalls[0]?.params).toEqual([PROCESS_DEFAULT_ID, 'operator', 2]);
    expect(roleInsertCalls[1]?.params).toEqual([PROCESS_DEFAULT_ID, 'supervisor', 1]);
  });

  it('upsertProcessDefaults COMPUTES standard_cost = Σ(headcount × rate) when not overridden', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults(
      upsertInput({
        // tampered client value must be ignored when costOverridden is false
        standardCost: 999,
        costOverridden: false,
        prefix: 'PREP-01',
        roles: [
          { roleGroup: 'operator', defaultHeadcount: 2 }, // 2 × 14.5 = 29
          { roleGroup: 'packer', defaultHeadcount: 3 }, // 3 × 12 = 36
        ],
      }),
    );

    expect(res).toEqual({ ok: true });
    const upsertCall = harness.calls.find((entry) => entry.sql.includes('insert into public.npd_process_defaults'));
    expect(upsertCall?.params?.[1]).toBe(65); // Σ = 29 + 36
    expect(upsertCall?.params?.[2]).toBe(false);
  });

  it('upsertProcessDefaults keeps the manual cost when costOverridden is true (survives rate changes)', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults(
      upsertInput({
        standardCost: 77.77,
        costOverridden: true,
        prefix: 'PREP-01',
        roles: [{ roleGroup: 'operator', defaultHeadcount: 2 }],
      }),
    );

    expect(res).toEqual({ ok: true });
    const upsertCall = harness.calls.find((entry) => entry.sql.includes('insert into public.npd_process_defaults'));
    expect(upsertCall?.params?.[1]).toBe(77.77);
    expect(upsertCall?.params?.[2]).toBe(true);
  });

  it('upsertProcessDefaults auto-numbers a blank prefix per the operation process_suffix (PREP-01 → PREP-02)', async () => {
    harness.takenPrefixRows = [{ prefix: 'PREP-01' }];
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults(upsertInput({ prefix: '' }));

    expect(res).toEqual({ ok: true });
    const upsertCall = harness.calls.find((entry) => entry.sql.includes('insert into public.npd_process_defaults'));
    expect(upsertCall?.params?.[8]).toBe('PREP-02');

    const scanCall = harness.calls.find((entry) => entry.sql.includes("prefix ~ ('^' || $1 || '-[0-9]+$')"));
    expect(scanCall?.sql).toContain('org_id = app.current_org_id()');
    expect(scanCall?.params).toEqual(['PREP']);
  });

  it('upsertProcessDefaults keeps an already-assigned prefix when the input is blank', async () => {
    harness.existingPrefixRows = [{ prefix: 'PREP-03' }];
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults(upsertInput({ prefix: '' }));

    expect(res).toEqual({ ok: true });
    const upsertCall = harness.calls.find((entry) => entry.sql.includes('insert into public.npd_process_defaults'));
    expect(upsertCall?.params?.[8]).toBe('PREP-03');
    expect(harness.calls.some((entry) => entry.sql.includes("prefix ~ ('^' || $1 || '-[0-9]+$')"))).toBe(false);
  });

  it('upsertProcessDefaults rejects a roleGroup not present in labor_rates', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults(
      upsertInput({ standardCost: 10, roles: [{ roleGroup: 'welder', defaultHeadcount: 1 }] }),
    );

    expect(res).toEqual({
      ok: false,
      error: 'Unknown role group: welder. Configure it in labor rates first.',
    });
    expect(harness.calls.some((entry) => entry.sql.includes('insert into public.npd_process_defaults'))).toBe(false);
  });

  it('upsertProcessDefaults normalizes roleGroup casing to the canonical labor_rates value', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults(
      upsertInput({ prefix: 'PREP-01', roles: [{ roleGroup: 'OPERATOR', defaultHeadcount: 2 }] }),
    );

    expect(res).toEqual({ ok: true });
    const roleInsert = harness.calls.find((entry) =>
      entry.sql.includes('insert into public.npd_process_default_roles'),
    );
    expect(roleInsert?.params).toEqual([PROCESS_DEFAULT_ID, 'operator', 2]);
  });

  it('upsertProcessDefaults rejects duplicate roleGroup input with a clean validation error', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults(
      upsertInput({
        roles: [
          { roleGroup: 'operator', defaultHeadcount: 1 },
          { roleGroup: 'Operator', defaultHeadcount: 2 },
        ],
      }),
    );

    expect(res).toEqual({ ok: false, error: 'Invalid process defaults input: roleGroup values must be unique.' });
    expect(harness.calls).toEqual([]);
  });

  it('upsertProcessDefaults rejects an out-of-range yieldPct with a clean validation error', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults(upsertInput({ yieldPct: 0 }));

    expect(res.ok).toBe(false);
    expect(harness.calls).toEqual([]);
  });

  it('upsertProcessDefaults rejects an operationId outside the current org with a clean error', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');
    harness.operationRows = [];

    const res = await upsertProcessDefaults(
      upsertInput({ standardCost: 10, roles: [{ roleGroup: 'operator', defaultHeadcount: 1 }] }),
    );

    expect(res).toEqual({ ok: false, error: 'Manufacturing operation not found.' });

    const permissionCall = harness.calls.find((entry) => entry.sql.includes('from public.user_roles'));
    expect(permissionCall?.params).toEqual([USER_ID, ORG_ID, 'npd.schema.edit']);
    expect(harness.calls.some((entry) => entry.sql.includes('insert into public.npd_process_defaults'))).toBe(false);
    expect(harness.calls.some((entry) => entry.sql.includes('delete from public.npd_process_default_roles'))).toBe(false);
  });

  it('getProcessDefault returns null for an operation with no configured default', async () => {
    harness.processDefaultRows = [harness.processDefaultRows[0] as Record<string, unknown>];
    const { getProcessDefault } = await import('./process-defaults-actions');

    const res = await getProcessDefault(CUTTING_ID);

    expect(res).toEqual({ ok: true, data: null });
  });

  it('getProcessDefault returns the configured row incl. the new W2-T1 fields', async () => {
    harness.processDefaultRows = [harness.processDefaultRows[1] as Record<string, unknown>];
    const { getProcessDefault } = await import('./process-defaults-actions');

    const res = await getProcessDefault(MIXING_ID);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      operationId: MIXING_ID,
      operationName: 'Mixing',
      processSuffix: 'MIX',
      prefix: 'MIX-01',
      standardCost: 125.5,
      costOverridden: true,
      setupCost: 10,
      throughputPerHour: 250,
      throughputUom: 'kg',
      yieldPct: 97.5,
    });
  });
});
