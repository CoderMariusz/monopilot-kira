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

      if (normalized.startsWith('select id::text') && normalized.includes('from "reference"."manufacturingoperations"')) {
        return { rows: harness.operationRows as T[], rowCount: harness.operationRows.length };
      }

      if (normalized.includes('from public.labor_rates')) {
        return { rows: harness.roleGroupRows as T[], rowCount: harness.roleGroupRows.length };
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

describe('process defaults actions', () => {
  beforeEach(() => {
    harness.calls = [];
    harness.permissionGranted = true;
    harness.operationRows = [{ id: CUTTING_ID }];
    harness.processDefaultRows = [
      {
        operation_id: CUTTING_ID,
        operation_name: 'Cutting',
        standard_cost: '0',
        default_duration_hours: '0',
        roles: [],
      },
      {
        operation_id: MIXING_ID,
        operation_name: 'Mixing',
        standard_cost: '125.5000',
        default_duration_hours: '2.2500',
        roles: [{ roleGroup: 'operator', defaultHeadcount: 2 }],
      },
    ];
    harness.upsertRows = [{ id: PROCESS_DEFAULT_ID }];
    harness.roleGroupRows = [
      { role_group: 'operator' },
      { role_group: 'packer' },
      { role_group: 'supervisor' },
    ];
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

  it('listProcessDefaults includes active operations without configured defaults as zeros and empty roles', async () => {
    const { listProcessDefaults } = await import('./process-defaults-actions');

    const res = await listProcessDefaults();

    expect(res).toEqual({
      ok: true,
      data: [
        {
          operationId: CUTTING_ID,
          operationName: 'Cutting',
          standardCost: 0,
          defaultDurationHours: 0,
          roles: [],
        },
        {
          operationId: MIXING_ID,
          operationName: 'Mixing',
          standardCost: 125.5,
          defaultDurationHours: 2.25,
          roles: [{ roleGroup: 'operator', defaultHeadcount: 2 }],
        },
      ],
    });

    const listCall = harness.calls.find((entry) => entry.sql.includes('left join public.npd_process_defaults'));
    expect(listCall?.sql).toContain('"Reference"."ManufacturingOperations"');
    expect(listCall?.sql).toContain('left join public.npd_process_default_roles');
    expect(listCall?.sql).toContain('mo.org_id = app.current_org_id()');
    expect(listCall?.sql).toContain('and mo.is_active = true');
  });

  it('upsertProcessDefaults upserts the parent, replace-sets roles, scopes by org, and is RBAC-gated', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');
    harness.processDefaultRows = [
      {
        operation_id: CUTTING_ID,
        operation_name: 'Cutting',
        standard_cost: '42.2500',
        default_duration_hours: '1.5000',
        roles: [
          { roleGroup: 'operator', defaultHeadcount: 2 },
          { roleGroup: 'supervisor', defaultHeadcount: 1 },
        ],
      },
    ];

    const res = await upsertProcessDefaults({
      operationId: CUTTING_ID,
      standardCost: 42.25,
      defaultDurationHours: 1.5,
      roles: [
        { roleGroup: 'operator', defaultHeadcount: 2 },
        { roleGroup: 'supervisor', defaultHeadcount: 1 },
      ],
    });

    expect(res).toEqual({ ok: true });

    const permissionCall = harness.calls.find((entry) => entry.sql.includes('from public.user_roles'));
    expect(permissionCall?.params).toEqual([USER_ID, ORG_ID, 'npd.schema.edit']);

    const operationCall = harness.calls.find((entry) => entry.sql.includes('from "Reference"."ManufacturingOperations"'));
    expect(operationCall?.sql).toContain('org_id = app.current_org_id()');
    expect(operationCall?.sql).toContain('is_active = true');
    expect(operationCall?.params).toEqual([CUTTING_ID]);

    const upsertCall = harness.calls.find((entry) => entry.sql.includes('insert into public.npd_process_defaults'));
    expect(upsertCall?.sql).toContain('values (app.current_org_id(), $1::uuid, $2::numeric, $3::numeric)');
    expect(upsertCall?.sql).toContain('on conflict (org_id, operation_id)');
    expect(upsertCall?.params).toEqual([CUTTING_ID, 42.25, 1.5]);

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

  it('upsertProcessDefaults rejects a roleGroup not present in labor_rates', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults({
      operationId: CUTTING_ID,
      standardCost: 10,
      defaultDurationHours: 1,
      roles: [{ roleGroup: 'welder', defaultHeadcount: 1 }],
    });

    expect(res).toEqual({
      ok: false,
      error: 'Unknown role group: welder. Configure it in labor rates first.',
    });
    expect(harness.calls.some((entry) => entry.sql.includes('insert into public.npd_process_defaults'))).toBe(false);
  });

  it('upsertProcessDefaults normalizes roleGroup casing to the canonical labor_rates value', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults({
      operationId: CUTTING_ID,
      standardCost: 10,
      defaultDurationHours: 1,
      roles: [{ roleGroup: 'OPERATOR', defaultHeadcount: 2 }],
    });

    expect(res).toEqual({ ok: true });
    const roleInsert = harness.calls.find((entry) =>
      entry.sql.includes('insert into public.npd_process_default_roles'),
    );
    expect(roleInsert?.params).toEqual([PROCESS_DEFAULT_ID, 'operator', 2]);
  });

  it('upsertProcessDefaults rejects duplicate roleGroup input with a clean validation error', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');

    const res = await upsertProcessDefaults({
      operationId: CUTTING_ID,
      standardCost: 10,
      defaultDurationHours: 1,
      roles: [
        { roleGroup: 'operator', defaultHeadcount: 1 },
        { roleGroup: 'Operator', defaultHeadcount: 2 },
      ],
    });

    expect(res).toEqual({ ok: false, error: 'Invalid process defaults input: roleGroup values must be unique.' });
    expect(harness.calls).toEqual([]);
  });

  it('upsertProcessDefaults rejects an operationId outside the current org with a clean error', async () => {
    const { upsertProcessDefaults } = await import('./process-defaults-actions');
    harness.operationRows = [];

    const res = await upsertProcessDefaults({
      operationId: CUTTING_ID,
      standardCost: 10,
      defaultDurationHours: 1,
      roles: [{ roleGroup: 'operator', defaultHeadcount: 1 }],
    });

    expect(res).toEqual({ ok: false, error: 'Manufacturing operation not found.' });

    const permissionCall = harness.calls.find((entry) => entry.sql.includes('from public.user_roles'));
    expect(permissionCall?.params).toEqual([USER_ID, ORG_ID, 'npd.schema.edit']);
    expect(harness.calls.some((entry) => entry.sql.includes('insert into public.npd_process_defaults'))).toBe(false);
    expect(harness.calls.some((entry) => entry.sql.includes('delete from public.npd_process_default_roles'))).toBe(false);
  });
});
