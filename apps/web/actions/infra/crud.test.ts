import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_WAREHOUSE_ID = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '12121212-1212-4212-8212-121212121212';
const ZONE_ID = '55555555-5555-4555-8555-555555555555';
const AISLE_ID = '66666666-6666-4666-8666-666666666666';
const BIN_ID = '77777777-7777-4777-8777-777777777777';
const WRONG_WAREHOUSE_PARENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MACHINE_ID = '88888888-8888-4888-8888-888888888888';
const LINE_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: readonly unknown[] };
type InfraLocation = { id: string; warehouse_id: string; parent_id: string | null; code: string; level: number; path: string };
type InfraLine = { id: string; status: string; machine_ids: string[]; default_output_location_id: string | null };
type InfraWarehouse = { id: string; is_active: boolean; code?: string; name?: string; site_id?: string; address_label?: string | null };

type FakeClient = {
  calls: QueryCall[];
  locations: Map<string, InfraLocation>;
  lines: Map<string, InfraLine>;
  warehouses: Map<string, InfraWarehouse>;
  activeWorkOrders: Set<string>;
  onHandStock: Set<string>;
  reservations: Set<string>;
  outboxEntries: Array<{ event_type: string; aggregate_id: string; payload: unknown }>;
  query: <T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

type FakeClientOptions = {
  outboxAllowedEventTypes?: Set<string>;
  requireCurrentOrgFunctionForInfraTables?: boolean;
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
      [WRONG_WAREHOUSE_PARENT_ID, { id: WRONG_WAREHOUSE_PARENT_ID, warehouse_id: OTHER_WAREHOUSE_ID, parent_id: null, code: 'ZONE-B', level: 1, path: 'ZONE-B' }],
    ]),
    lines: new Map<string, InfraLine>([[LINE_ID, { id: LINE_ID, status: 'draft', machine_ids: [], default_output_location_id: null }]]),
    warehouses: new Map<string, InfraWarehouse>([[WAREHOUSE_ID, { id: WAREHOUSE_ID, is_active: true, site_id: SITE_ID }]]),
    activeWorkOrders: new Set<string>(),
    onHandStock: new Set<string>(),
    reservations: new Set<string>(),
    outboxEntries: [],
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      const paramsText = params.map(String).join(' ');

      if (options.requireCurrentOrgFunctionForInfraTables) {
        assertInfraQueryUsesCurrentOrgFunction(normalized, paramsText);
      }

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

      if (normalized.startsWith('delete from public.locations')) {
        const id = params.map(String).find((value) => client.locations.has(value));
        const row = id ? client.locations.get(id) : undefined;
        if (id) client.locations.delete(id);
        return { rows: row ? [row] as never[] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes('public.license_plates') && normalized.includes('public.production_lines')) {
        const warehouseId = params.map(String).find((value) => client.warehouses.has(value));
        return {
          rows: [{
            on_hand_stock: warehouseId && client.onHandStock.has(warehouseId) ? 1 : 0,
            open_work_orders: warehouseId && client.activeWorkOrders.has(warehouseId) ? 2 : 0,
            reservations: warehouseId && client.reservations.has(warehouseId) ? 1 : 0,
          }] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('count(*)') && normalized.includes('parent_id')) {
        const parentId = params.map(String).find((value) => client.locations.has(value));
        const count = parentId ? Array.from(client.locations.values()).filter((location) => location.parent_id === parentId).length : 0;
        return { rows: [{ child_count: count }] as never[], rowCount: 1 };
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

      if (normalized.includes('from public.production_lines') && normalized.includes('upper(code)')) {
        return { rows: [] as never[], rowCount: 0 };
      }

      if (normalized.startsWith('insert into public.production_lines') || normalized.startsWith('update public.production_lines')) {
        const id = params.map(String).find((value) => client.lines.has(value)) ?? LINE_ID;
        const status = paramsText.includes('active') ? 'active' : 'draft';
        const defaultOutputLocationId = normalized.includes('default_output_location_id') && typeof params[3] === 'string' ? String(params[3]) : null;
        const row = { id, status, machine_ids: [], default_output_location_id: defaultOutputLocationId };
        client.lines.set(id, row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.includes('from public.work_orders')) {
        const warehouseId = params.map(String).find((value) => client.warehouses.has(value));
        const count = warehouseId && client.activeWorkOrders.has(warehouseId) ? 2 : 0;
        return { rows: [{ active_count: count, count }] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.warehouses')) {
        const siteId = String(params[0]);
        const code = String(params[1]);
        const name = String(params[2]);
        const address = safeJsonParse(params[3]) as { line1?: string } | null;
        const row = {
          id: OTHER_WAREHOUSE_ID,
          is_active: true,
          code,
          name,
          site_id: siteId,
          address_label: address?.line1 ?? null,
        };
        client.warehouses.set(row.id, row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.warehouses')) {
        const id = params.map(String).find((value) => client.warehouses.has(value)) ?? WAREHOUSE_ID;
        const current = client.warehouses.get(id) ?? { id, is_active: true };
        const row = normalized.includes('set name =')
          ? { ...current, name: String(params[1]) }
          : { id, is_active: false };
        client.warehouses.set(id, row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('delete from public.warehouses')) {
        const id = params.map(String).find((value) => client.warehouses.has(value));
        if (id) client.warehouses.delete(id);
        return { rows: id ? [{ id }] as never[] : [], rowCount: id ? 1 : 0 };
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

function assertInfraQueryUsesCurrentOrgFunction(normalizedSql: string, paramsText: string): void {
  const touchesInfraBusinessTable = [
    'public.locations',
    'public.production_lines',
    'public.warehouses',
    'public.work_orders',
  ].some((tableName) => normalizedSql.includes(tableName));
  if (!touchesInfraBusinessTable) return;

  if (/current_setting\('app\.(tenant_id|current_org_id)'/.test(normalizedSql)) {
    throw new Error(`Infra CRUD runtime org-context invariant failed: raw context GUC used in SQL; params=${paramsText}`);
  }
  if (!normalizedSql.includes('app.current_org_id()')) {
    throw new Error(`Infra CRUD runtime org-context invariant failed: missing app.current_org_id() in SQL; params=${paramsText}`);
  }
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
      upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: WRONG_WAREHOUSE_PARENT_ID, code: 'AISLE-X', name: 'Wrong warehouse', level: 2, locationType: 'aisle' }),
    ).resolves.toMatchObject({ ok: false, error: 'invalid_parent_location' });
    // Level is now DERIVED from the parent (client-sent level is ignored), so a stale/wrong
    // level no longer rejects on its own. Depth is capped at 3: a parent already at/over the
    // cap is rejected before any write (this BIN parent is level 4 → child would be level 5).
    await expect(upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: BIN_ID, code: 'BIN-DEEP', name: 'Too deep', level: 4, locationType: 'bin' })).resolves.toMatchObject({
      ok: false,
      error: 'depth_exceeded',
    });

    const created = await upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: AISLE_ID, code: 'RACK-02', name: 'Rack 02', level: 3, locationType: 'rack' });
    expect(created).toMatchObject({ ok: true, data: { level: 3, path: 'ZONE-A.AISLE-01.RACK-02' } });
    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.location.upserted')).toBe(true);
    expect(currentClient.calls.some((call) => call.sql.includes('app.current_org_id()'))).toBe(true);
  });

  it('deletes a leaf location through settings.infra.update, rejects parent locations with children, and emits outbox', async () => {
    const deleteLocation = await loadAction<
      (input: { locationId: string; warehouseId: string }) => Promise<{ ok: boolean; error?: string; data?: { locationId: string; warehouseId: string } }>
    >('location.ts', 'deleteLocation', () => import(`${__dirname}/location.ts`) as Promise<Record<string, unknown>>);

    await expect(deleteLocation({ locationId: ZONE_ID, warehouseId: WAREHOUSE_ID })).resolves.toMatchObject({
      ok: false,
      error: 'has_child_locations',
    });

    const deleted = await deleteLocation({ locationId: BIN_ID, warehouseId: WAREHOUSE_ID });
    expect(deleted).toMatchObject({ ok: true, data: { locationId: BIN_ID, warehouseId: WAREHOUSE_ID } });
    expect(currentClient.locations.has(BIN_ID)).toBe(false);
    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.location.deleted')).toBe(true);
    expect(currentClient.calls.some((call) => call.sql.includes('app.current_org_id()'))).toBe(true);
  });

  it('activates lines without machine preconditions and only deactivates warehouses without active dependents', async () => {
    const upsertLine = await loadAction<
      (input: { id?: string; code: string; name: string; status: 'draft' | 'active'; defaultOutputLocationId?: string | null }) => Promise<{ ok: boolean; error?: string; data?: { status: string } }>
    >('line.ts', 'upsertLine', () => import(`${__dirname}/line.ts`) as Promise<Record<string, unknown>>);
    const deactivateWarehouse = await loadAction<
      (input: { warehouseId: string }) => Promise<{ ok: boolean; error?: string; dependents?: { onHandStock: number; openWorkOrders: number; reservations: number }; data?: { isActive: boolean } }>
    >('warehouse.ts', 'deactivateWarehouse', () => import(`${__dirname}/warehouse.ts`) as Promise<Record<string, unknown>>);

    // Wave 1 consolidation: an ACTIVE line no longer requires a machine.
    await expect(upsertLine({ code: 'LINE-1', name: 'Line 1', status: 'active' })).resolves.toMatchObject({
      ok: true,
      data: { status: 'active' },
    });

    const activeLine = await upsertLine({ id: LINE_ID, code: 'LINE-1', name: 'Line 1', status: 'active' });
    expect(activeLine).toMatchObject({ ok: true, data: { status: 'active' } });
    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.line.upserted')).toBe(true);
    // No legacy line↔machine junction writes from the line upsert path (Wave 3).
    const lineMachineJunction = ['line', 'machines'].join('_');
    expect(currentClient.calls.some((call) => call.sql.toLowerCase().includes(lineMachineJunction))).toBe(false);

    currentClient.activeWorkOrders.clear();
    await expect(deactivateWarehouse({ warehouseId: WAREHOUSE_ID })).resolves.toMatchObject({
      ok: true,
      data: { isActive: false },
    });

    currentClient.warehouses.set(WAREHOUSE_ID, { id: WAREHOUSE_ID, is_active: true });
    currentClient.onHandStock.add(WAREHOUSE_ID);
    currentClient.activeWorkOrders.add(WAREHOUSE_ID);
    currentClient.reservations.add(WAREHOUSE_ID);
    await expect(deactivateWarehouse({ warehouseId: WAREHOUSE_ID })).resolves.toMatchObject({
      ok: false,
      error: 'has_dependents',
      dependents: { onHandStock: 1, openWorkOrders: 2, reservations: 1 },
    });
    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.warehouse.deactivated')).toBe(true);
    const preflight = currentClient.calls.find((call) => call.sql.includes('public.license_plates'))?.sql ?? '';
    expect(preflight).toContain('wo.production_line_id');
    expect(preflight).toContain('pl.warehouse_id');
    expect(preflight).toContain('lp.reserved_qty');
  });

  it('creates warehouses with a required site_id and persists it into public.warehouses', async () => {
    const createWarehouse = await loadAction<
      (input: { code: string; name: string; site_id?: string; address?: string | null }) => Promise<{ ok: boolean; error?: string; data?: { site_id?: string } }>
    >('warehouse.ts', 'createWarehouse', () => import(`${__dirname}/warehouse.ts`) as Promise<Record<string, unknown>>);

    await expect(createWarehouse({ code: 'WH-NOSITE', name: 'Missing site warehouse' })).resolves.toMatchObject({
      ok: false,
      error: 'invalid_input',
    });
    expect(_runWithOrgContext).not.toHaveBeenCalled();

    const result = await createWarehouse({ code: 'wh-site', name: 'Site warehouse', site_id: SITE_ID, address: 'Dock 9' });

    expect(result).toMatchObject({ ok: true, data: { site_id: SITE_ID } });
    const insertCall = currentClient.calls.find((call) => call.sql.toLowerCase().startsWith('insert into public.warehouses'));
    expect(insertCall?.sql.toLowerCase()).toContain('site_id');
    expect(insertCall?.params).toEqual([SITE_ID, 'WH-SITE', 'Site warehouse', JSON.stringify({ line1: 'Dock 9' })]);
    expect(currentClient.warehouses.get(OTHER_WAREHOUSE_ID)?.site_id).toBe(SITE_ID);
  });

  it('renames an org-scoped warehouse and blocks deletion while it has dependents', async () => {
    const renameWarehouse = await loadAction<
      (input: { warehouseId: string; name: string }) => Promise<{ ok: boolean; error?: string; data?: { name: string } }>
    >('warehouse.ts', 'renameWarehouse', () => import(`${__dirname}/warehouse.ts`) as Promise<Record<string, unknown>>);
    const deleteWarehouse = await loadAction<
      (input: { warehouseId: string }) => Promise<{ ok: boolean; error?: string; data?: { warehouseId: string } }>
    >('warehouse.ts', 'deleteWarehouse', () => import(`${__dirname}/warehouse.ts`) as Promise<Record<string, unknown>>);

    await expect(renameWarehouse({ warehouseId: WAREHOUSE_ID, name: 'Renamed warehouse' })).resolves.toMatchObject({
      ok: true,
      data: { name: 'Renamed warehouse' },
    });
    currentClient.onHandStock.add(WAREHOUSE_ID);
    await expect(deleteWarehouse({ warehouseId: WAREHOUSE_ID })).resolves.toMatchObject({ ok: false, error: 'has_dependents' });

    currentClient.onHandStock.clear();
    await expect(deleteWarehouse({ warehouseId: WAREHOUSE_ID })).resolves.toMatchObject({
      ok: true,
      data: { warehouseId: WAREHOUSE_ID },
    });
  });

  it('creates a DRAFT line with a default output location and never touches the line-machine junction', async () => {
    const upsertLine = await loadAction<
      (input: {
        id?: string;
        code: string;
        name: string;
        status: 'draft' | 'active';
        warehouseId?: string | null;
        defaultOutputLocationId?: string | null;
      }) => Promise<{ ok: boolean; error?: string; data?: { status: string } }>
    >('line.ts', 'upsertLine', () => import(`${__dirname}/line.ts`) as Promise<Record<string, unknown>>);

    const draft = await upsertLine({ id: LINE_ID, code: 'LINE-DRAFT', name: 'Draft line', status: 'draft', warehouseId: WAREHOUSE_ID, defaultOutputLocationId: BIN_ID });
    expect(draft).toMatchObject({ ok: true, data: { status: 'draft' } });
    expect(currentClient.lines.get(LINE_ID)?.default_output_location_id).toBe(BIN_ID);
    const lineUpsertCall = currentClient.calls.find((call) => call.sql.toLowerCase().startsWith('insert into public.production_lines'));
    expect(lineUpsertCall?.sql.toLowerCase()).toContain('default_output_location_id');
    expect(lineUpsertCall?.params).toContain(BIN_ID);
    // Wave 1 consolidation: junction table is never written from the line upsert path.
    const lineMachineJunction = ['line', 'machines'].join('_');
    expect(currentClient.calls.some((call) => call.sql.toLowerCase().includes(lineMachineJunction))).toBe(false);

    await expect(
      upsertLine({
        id: LINE_ID,
        code: 'LINE-DRAFT',
        name: 'Draft line',
        status: 'draft',
        warehouseId: WAREHOUSE_ID,
        defaultOutputLocationId: WRONG_WAREHOUSE_PARENT_ID,
      }),
    ).resolves.toMatchObject({ ok: false, error: 'invalid_location_reference' });
  });

  it('Outbox on mutations persists only event types accepted by outbox_events_event_type_check', async () => {
    currentClient = makeClient({ outboxAllowedEventTypes: currentOutboxConstraintEventTypes() });

    const upsertLocation = await loadAction<
      (input: { id?: string; warehouseId: string; parentId: string | null; code: string; name: string; level: number; locationType: string }) => Promise<{ ok: boolean; error?: string }>
    >('location.ts', 'upsertLocation', () => import(`${__dirname}/location.ts`) as Promise<Record<string, unknown>>);
    const deleteLocation = await loadAction<
      (input: { locationId: string; warehouseId: string }) => Promise<{ ok: boolean; error?: string }>
    >('location.ts', 'deleteLocation', () => import(`${__dirname}/location.ts`) as Promise<Record<string, unknown>>);
    const upsertLine = await loadAction<
      (input: { id?: string; code: string; name: string; status: 'draft' | 'active' }) => Promise<{ ok: boolean; error?: string }>
    >('line.ts', 'upsertLine', () => import(`${__dirname}/line.ts`) as Promise<Record<string, unknown>>);
    const deactivateWarehouse = await loadAction<
      (input: { warehouseId: string; force?: boolean }) => Promise<{ ok: boolean; error?: string }>
    >('warehouse.ts', 'deactivateWarehouse', () => import(`${__dirname}/warehouse.ts`) as Promise<Record<string, unknown>>);

    const mutationResults = [
      { eventType: 'settings.location.upserted', result: await upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: AISLE_ID, code: 'RACK-03', name: 'Rack 03', level: 3, locationType: 'rack' }) },
      { eventType: 'settings.line.upserted', result: await upsertLine({ id: LINE_ID, code: 'LINE-1', name: 'Line 1', status: 'active' }) },
      { eventType: 'settings.warehouse.deactivated', result: await deactivateWarehouse({ warehouseId: WAREHOUSE_ID }) },
      { eventType: 'settings.location.deleted', result: await deleteLocation({ locationId: BIN_ID, warehouseId: WAREHOUSE_ID }) },
    ].map(({ eventType, result }) => ({ eventType, ok: result.ok, error: result.ok ? undefined : result.error }));

    expect(
      mutationResults,
      'Infra CRUD outbox event types must be admitted by the real outbox_events_event_type_check constraint; 23514 maps to persistence_failed and rolls back mutations.',
    ).toEqual([
      { eventType: 'settings.location.upserted', ok: true, error: undefined },
      { eventType: 'settings.line.upserted', ok: true, error: undefined },
      { eventType: 'settings.warehouse.deactivated', ok: true, error: undefined },
      { eventType: 'settings.location.deleted', ok: true, error: undefined },
    ]);
    expect(currentClient.outboxEntries.map((entry) => entry.event_type)).toEqual([
      'settings.location.upserted',
      'settings.line.upserted',
      'settings.warehouse.deactivated',
      'settings.location.deleted',
    ]);
  });

  it('runtime SQL for infra business tables uses app.current_org_id() instead of raw org ids or GUC reads', async () => {
    currentClient = makeClient({ requireCurrentOrgFunctionForInfraTables: true });

    const upsertLocation = await loadAction<
      (input: { id?: string; warehouseId: string; parentId: string | null; code: string; name: string; level: number; locationType: string }) => Promise<{ ok: boolean; error?: string }>
    >('location.ts', 'upsertLocation', () => import(`${__dirname}/location.ts`) as Promise<Record<string, unknown>>);
    const deleteLocation = await loadAction<
      (input: { locationId: string; warehouseId: string }) => Promise<{ ok: boolean; error?: string }>
    >('location.ts', 'deleteLocation', () => import(`${__dirname}/location.ts`) as Promise<Record<string, unknown>>);
    const upsertLine = await loadAction<
      (input: { id?: string; code: string; name: string; status: 'draft' | 'active' }) => Promise<{ ok: boolean; error?: string }>
    >('line.ts', 'upsertLine', () => import(`${__dirname}/line.ts`) as Promise<Record<string, unknown>>);
    const deactivateWarehouse = await loadAction<
      (input: { warehouseId: string; force?: boolean }) => Promise<{ ok: boolean; error?: string }>
    >('warehouse.ts', 'deactivateWarehouse', () => import(`${__dirname}/warehouse.ts`) as Promise<Record<string, unknown>>);

    const results = [
      await upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: AISLE_ID, code: 'RACK-04', name: 'Rack 04', level: 3, locationType: 'rack' }),
      await upsertLine({ id: LINE_ID, code: 'LINE-1', name: 'Line 1', status: 'active' }),
      await deactivateWarehouse({ warehouseId: WAREHOUSE_ID }),
      await deleteLocation({ locationId: BIN_ID, warehouseId: WAREHOUSE_ID }),
    ];

    expect(results.map((result) => ({ ok: result.ok, error: result.ok ? undefined : result.error }))).toEqual([
      { ok: true, error: undefined },
      { ok: true, error: undefined },
      { ok: true, error: undefined },
      { ok: true, error: undefined },
    ]);
    expect(_runWithOrgContext).toHaveBeenCalledTimes(4);
    expect(
      currentClient.calls.filter((call) =>
        ['public.locations', 'public.production_lines', 'public.warehouses', 'public.work_orders'].some((tableName) => call.sql.toLowerCase().includes(tableName)),
      ).length,
    ).toBeGreaterThanOrEqual(8);
  });
});
