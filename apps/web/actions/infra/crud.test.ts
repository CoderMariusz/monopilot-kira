import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_WAREHOUSE_ID = '44444444-4444-4444-8444-444444444444';
const ZONE_ID = '55555555-5555-4555-8555-555555555555';
const AISLE_ID = '66666666-6666-4666-8666-666666666666';
const BIN_ID = '77777777-7777-4777-8777-777777777777';
const MACHINE_ID = '88888888-8888-4888-8888-888888888888';
const LINE_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: readonly unknown[] };
type InfraLocation = { id: string; warehouse_id: string; parent_id: string | null; code: string; level: number; path: string };
type InfraMachine = { id: string; location_id: string | null; status: string };
type InfraLine = { id: string; status: string; machine_ids: string[] };
type InfraWarehouse = { id: string; is_active: boolean };

type FakeClient = {
  calls: QueryCall[];
  locations: Map<string, InfraLocation>;
  machines: Map<string, InfraMachine>;
  lines: Map<string, InfraLine>;
  warehouses: Map<string, InfraWarehouse>;
  activeWorkOrders: Set<string>;
  outboxEntries: Array<{ event_type: string; aggregate_id: string; payload: unknown }>;
  query: <T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

type FakeClientOptions = {
  outboxAllowedEventTypes?: Set<string>;
};

const { _runWithOrgContext } = vi.hoisted(() => ({
  _runWithOrgContext: vi.fn(),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

function makeClient(options: FakeClientOptions = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    locations: new Map<string, InfraLocation>([
      [ZONE_ID, { id: ZONE_ID, warehouse_id: WAREHOUSE_ID, parent_id: null, code: 'ZONE-A', level: 1, path: 'ZONE-A' }],
      [AISLE_ID, { id: AISLE_ID, warehouse_id: WAREHOUSE_ID, parent_id: ZONE_ID, code: 'AISLE-01', level: 2, path: 'ZONE-A.AISLE-01' }],
      [
        BIN_ID,
        { id: BIN_ID, warehouse_id: WAREHOUSE_ID, parent_id: AISLE_ID, code: 'BIN-01', level: 4, path: 'ZONE-A.AISLE-01.RACK-01.BIN-01' },
      ],
      ['wrong-warehouse-parent', { id: 'wrong-warehouse-parent', warehouse_id: OTHER_WAREHOUSE_ID, parent_id: null, code: 'ZONE-B', level: 1, path: 'ZONE-B' }],
    ]),
    machines: new Map<string, InfraMachine>([[MACHINE_ID, { id: MACHINE_ID, location_id: BIN_ID, status: 'active' }]]),
    lines: new Map<string, InfraLine>([[LINE_ID, { id: LINE_ID, status: 'draft', machine_ids: [] }]]),
    warehouses: new Map<string, InfraWarehouse>([[WAREHOUSE_ID, { id: WAREHOUSE_ID, is_active: true }]]),
    activeWorkOrders: new Set<string>([WAREHOUSE_ID]),
    outboxEntries: [],
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      const paramsText = params.map(String).join(' ');

      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as never[], rowCount: 1 };

      if (normalized.startsWith('insert into public.outbox_events')) {
        const eventType = String(params.find((value) => typeof value === 'string' && value.includes('.')) ?? 'infra.unknown.changed');
        if (options.outboxAllowedEventTypes && !options.outboxAllowedEventTypes.has(eventType)) {
          const error = new Error(`outbox_events_event_type_check rejected ${eventType}`) as Error & { code: string; constraint: string };
          error.code = '23514';
          error.constraint = 'outbox_events_event_type_check';
          throw error;
        }
        const aggregateId = String(params.find((value) => typeof value === 'string' && isUuid(value)) ?? 'unknown');
        const payloadRaw = params[params.length - 1];
        client.outboxEntries.push({ event_type: eventType, aggregate_id: aggregateId, payload: safeJsonParse(payloadRaw) });
        return { rows: [{ id: `outbox-${client.outboxEntries.length}` }] as never[], rowCount: 1 };
      }

      if (normalized.includes('from public.locations')) {
        const id = params.map(String).find((value) => client.locations.has(value));
        const rows = id ? [client.locations.get(id)] : [];
        return { rows: rows.filter(Boolean) as never[], rowCount: rows.filter(Boolean).length };
      }

      if (normalized.startsWith('insert into public.locations') || normalized.startsWith('update public.locations')) {
        const id = String(params.find((value) => typeof value === 'string' && isUuid(value)) ?? 'new-location-id');
        const parentId = params.map(String).find((value) => client.locations.has(value)) ?? null;
        const parent = parentId ? client.locations.get(parentId) : null;
        const warehouseId = params.map(String).includes(OTHER_WAREHOUSE_ID) ? OTHER_WAREHOUSE_ID : WAREHOUSE_ID;
        const code = String(params.find((value) => typeof value === 'string' && /bin|aisle|zone|rack/i.test(value)) ?? 'BIN-NEW');
        const explicitLevel = Number(params.find((value) => typeof value === 'number'));
        const level = Number.isInteger(explicitLevel) ? explicitLevel : (parent?.level ?? 0) + 1;
        const row = { id, warehouse_id: warehouseId, parent_id: parentId, code, level, path: parent ? `${parent.path}.${code}` : code };
        client.locations.set(id, row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.includes('from public.machines')) {
        if (normalized.includes('count(') || normalized.includes('line_machines')) {
          const lineId = params.map(String).find((value) => client.lines.has(value));
          const count = lineId ? client.lines.get(lineId)?.machine_ids.length ?? 0 : 0;
          return { rows: [{ machine_count: count, count }] as never[], rowCount: 1 };
        }
        const id = params.map(String).find((value) => client.machines.has(value));
        const rows = id ? [client.machines.get(id)] : [];
        return { rows: rows.filter(Boolean) as never[], rowCount: rows.filter(Boolean).length };
      }

      if (normalized.startsWith('insert into public.machines') || normalized.startsWith('update public.machines')) {
        const locationId = params.map(String).find((value) => client.locations.has(value)) ?? null;
        const row = { id: MACHINE_ID, location_id: locationId, status: 'active' };
        client.machines.set(row.id, row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.includes('from public.line_machines')) {
        const lineId = params.map(String).find((value) => client.lines.has(value));
        const line = lineId ? client.lines.get(lineId) : undefined;
        return { rows: (line?.machine_ids ?? []).map((machine_id) => ({ machine_id })) as never[], rowCount: line?.machine_ids.length ?? 0 };
      }

      if (normalized.startsWith('insert into public.production_lines') || normalized.startsWith('update public.production_lines')) {
        const id = params.map(String).find((value) => client.lines.has(value)) ?? LINE_ID;
        const machineIds = params.map(String).filter((value) => client.machines.has(value));
        const status = paramsText.includes('active') ? 'active' : 'draft';
        const row = { id, status, machine_ids: machineIds };
        client.lines.set(id, row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.includes('from public.work_orders')) {
        const warehouseId = params.map(String).find((value) => client.warehouses.has(value));
        const count = warehouseId && client.activeWorkOrders.has(warehouseId) ? 2 : 0;
        return { rows: [{ active_count: count, count }] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.warehouses')) {
        const id = params.map(String).find((value) => client.warehouses.has(value)) ?? WAREHOUSE_ID;
        const row = { id, is_active: false };
        client.warehouses.set(id, row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.includes('from public.warehouses')) {
        const id = params.map(String).find((value) => client.warehouses.has(value));
        const rows = id ? [client.warehouses.get(id)] : [];
        return { rows: rows.filter(Boolean) as never[], rowCount: rows.filter(Boolean).length };
      }

      throw new Error(`Unexpected SQL in infra CRUD RED fake client: ${normalized}; params=${paramsText}`);
    },
  };
  return client;
}

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function currentOutboxConstraintEventTypes(): Set<string> {
  const migrationsDir = path.resolve(__dirname, '../../../../packages/db/migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  let latestConstraintBody = '';
  for (const fileName of migrationFiles) {
    const sql = readFileSync(path.join(migrationsDir, fileName), 'utf8');
    const addConstraintIndex = sql.toLowerCase().lastIndexOf('add constraint outbox_events_event_type_check check');
    if (addConstraintIndex === -1) continue;
    latestConstraintBody = sql.slice(addConstraintIndex);
  }

  if (!latestConstraintBody) {
    expect.fail('Infra CRUD RED contract: outbox_events_event_type_check must exist in migrations before infra mutations can emit outbox rows');
  }

  return new Set(Array.from(latestConstraintBody.matchAll(/'([^']+)'/g), (match) => match[1]));
}

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
});

async function loadAction<T extends (...args: never[]) => unknown>(
  moduleLabel: string,
  exportName: string,
  importer: () => Promise<Record<string, unknown>>,
): Promise<T> {
  try {
    const mod = await importer();
    const action = mod[exportName];
    if (typeof action !== 'function') {
      expect.fail(`Infra CRUD RED contract: ${moduleLabel} must export ${exportName} Server Action`);
    }
    return action as T;
  } catch (error) {
    expect.fail(
      `Infra CRUD RED contract: ${moduleLabel} must be implemented and export ${exportName}; got ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

describe('infrastructure CRUD Server Actions (T-029 RED)', () => {
  it('V-SET-60 materializes ltree path and rejects parent locations outside the same warehouse or level chain', async () => {
    const upsertLocation = await loadAction<
      (input: {
        id?: string;
        warehouseId: string;
        parentId: string | null;
        code: string;
        name: string;
        level: number;
        locationType: string;
      }) => Promise<{ ok: boolean; error?: string; data?: { id: string; path: string; level: number } }>
    >('location.ts', 'upsertLocation', () => import(`${__dirname}/location.ts`) as Promise<Record<string, unknown>>);

    await expect(
      upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: 'wrong-warehouse-parent', code: 'AISLE-X', name: 'Wrong warehouse', level: 2, locationType: 'aisle' }),
    ).resolves.toMatchObject({ ok: false, error: 'invalid_parent_location' });
    await expect(upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: ZONE_ID, code: 'BIN-BAD', name: 'Wrong level', level: 4, locationType: 'bin' })).resolves.toMatchObject({
      ok: false,
      error: 'invalid_parent_level',
    });

    const created = await upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: AISLE_ID, code: 'RACK-02', name: 'Rack 02', level: 3, locationType: 'rack' });
    expect(created).toMatchObject({ ok: true, data: { level: 3, path: 'ZONE-A.AISLE-01.RACK-02' } });
    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.location.upserted')).toBe(true);
    expect(currentClient.calls.some((call) => call.sql.includes('app.current_org_id()'))).toBe(true);
  });

  it('V-SET-61 rejects machine placement outside bin-level locations and emits outbox for valid machine mutations', async () => {
    const upsertMachine = await loadAction<
      (input: { id?: string; code: string; name: string; machineType: string; locationId: string }) => Promise<{ ok: boolean; error?: string; data?: { locationId: string } }>
    >('machine.ts', 'upsertMachine', () => import(`${__dirname}/machine.ts`) as Promise<Record<string, unknown>>);

    await expect(upsertMachine({ code: 'MIX-01', name: 'Mixer', machineType: 'mixer', locationId: AISLE_ID })).resolves.toMatchObject({
      ok: false,
      error: 'location_must_be_bin_level',
    });

    const result = await upsertMachine({ id: MACHINE_ID, code: 'MIX-01', name: 'Mixer', machineType: 'mixer', locationId: BIN_ID });
    expect(result).toMatchObject({ ok: true, data: { locationId: BIN_ID } });
    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.machine.upserted')).toBe(true);
  });

  it('V-SET-62/V-SET-63 block empty line activation and require force to deactivate warehouses with active WOs', async () => {
    const upsertLine = await loadAction<
      (input: { id?: string; code: string; name: string; status: 'draft' | 'active'; machineIds: string[] }) => Promise<{ ok: boolean; error?: string; data?: { status: string } }>
    >('line.ts', 'upsertLine', () => import(`${__dirname}/line.ts`) as Promise<Record<string, unknown>>);
    const deactivateWarehouse = await loadAction<
      (input: { warehouseId: string; force?: boolean }) => Promise<{ ok: boolean; error?: string; warning?: { code: string; activeWorkOrders?: number }; data?: { isActive: boolean } }>
    >('warehouse.ts', 'deactivateWarehouse', () => import(`${__dirname}/warehouse.ts`) as Promise<Record<string, unknown>>);

    await expect(upsertLine({ code: 'LINE-1', name: 'Line 1', status: 'active', machineIds: [] })).resolves.toMatchObject({
      ok: false,
      error: 'line_requires_machine',
    });

    const activeLine = await upsertLine({ id: LINE_ID, code: 'LINE-1', name: 'Line 1', status: 'active', machineIds: [MACHINE_ID] });
    expect(activeLine).toMatchObject({ ok: true, data: { status: 'active' } });
    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.line.upserted')).toBe(true);

    await expect(deactivateWarehouse({ warehouseId: WAREHOUSE_ID })).resolves.toMatchObject({
      ok: false,
      error: 'active_work_orders_reference_warehouse',
      warning: { code: 'ACTIVE_WO_REFERENCES', activeWorkOrders: 2 },
    });

    const forced = await deactivateWarehouse({ warehouseId: WAREHOUSE_ID, force: true });
    expect(forced).toMatchObject({ ok: true, data: { isActive: false }, warning: { code: 'ACTIVE_WO_REFERENCES', activeWorkOrders: 2 } });
    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.warehouse.deactivated')).toBe(true);
  });

  it('Outbox on mutations persists only event types accepted by outbox_events_event_type_check', async () => {
    currentClient = makeClient({ outboxAllowedEventTypes: currentOutboxConstraintEventTypes() });

    const upsertLocation = await loadAction<
      (input: { id?: string; warehouseId: string; parentId: string | null; code: string; name: string; level: number; locationType: string }) => Promise<{ ok: boolean; error?: string }>
    >('location.ts', 'upsertLocation', () => import(`${__dirname}/location.ts`) as Promise<Record<string, unknown>>);
    const upsertMachine = await loadAction<
      (input: { id?: string; code: string; name: string; machineType: string; locationId: string }) => Promise<{ ok: boolean; error?: string }>
    >('machine.ts', 'upsertMachine', () => import(`${__dirname}/machine.ts`) as Promise<Record<string, unknown>>);
    const upsertLine = await loadAction<
      (input: { id?: string; code: string; name: string; status: 'draft' | 'active'; machineIds: string[] }) => Promise<{ ok: boolean; error?: string }>
    >('line.ts', 'upsertLine', () => import(`${__dirname}/line.ts`) as Promise<Record<string, unknown>>);
    const deactivateWarehouse = await loadAction<
      (input: { warehouseId: string; force?: boolean }) => Promise<{ ok: boolean; error?: string }>
    >('warehouse.ts', 'deactivateWarehouse', () => import(`${__dirname}/warehouse.ts`) as Promise<Record<string, unknown>>);

    const mutationResults = [
      { eventType: 'settings.location.upserted', result: await upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: AISLE_ID, code: 'RACK-03', name: 'Rack 03', level: 3, locationType: 'rack' }) },
      { eventType: 'settings.machine.upserted', result: await upsertMachine({ id: MACHINE_ID, code: 'MIX-01', name: 'Mixer', machineType: 'mixer', locationId: BIN_ID }) },
      { eventType: 'settings.line.upserted', result: await upsertLine({ id: LINE_ID, code: 'LINE-1', name: 'Line 1', status: 'active', machineIds: [MACHINE_ID] }) },
      { eventType: 'settings.warehouse.deactivated', result: await deactivateWarehouse({ warehouseId: WAREHOUSE_ID, force: true }) },
    ].map(({ eventType, result }) => ({ eventType, ok: result.ok, error: result.ok ? undefined : result.error }));

    expect(
      mutationResults,
      'Infra CRUD outbox event types must be admitted by the real outbox_events_event_type_check constraint; 23514 maps to persistence_failed and rolls back mutations.',
    ).toEqual([
      { eventType: 'settings.location.upserted', ok: true, error: undefined },
      { eventType: 'settings.machine.upserted', ok: true, error: undefined },
      { eventType: 'settings.line.upserted', ok: true, error: undefined },
      { eventType: 'settings.warehouse.deactivated', ok: true, error: undefined },
    ]);
    expect(currentClient.outboxEntries.map((entry) => entry.event_type)).toEqual([
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.line.upserted',
      'settings.warehouse.deactivated',
    ]);
  });
});
