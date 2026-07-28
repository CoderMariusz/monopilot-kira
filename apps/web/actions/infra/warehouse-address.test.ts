/**
 * FALA 6 / R02-05 — `updateWarehouseDetails` address write.
 *
 * `public.warehouses.address` is a SHARED jsonb blob. Besides the street
 * address (`line1`/`city`/`country`) it carries the soft-delete markers written
 * by `deactivateWarehouse` (`deactivated_at`, `deactivated_by`) and the
 * capacity/usage labels the list query reads back out. A wholesale
 * `address = $n::jsonb` write would drop `deactivated_at` and silently
 * reactivate a deactivated warehouse.
 *
 * These tests pin the write to be KEY-SCOPED. They assert the emitted SQL
 * shape + bound parameters rather than emulating a jsonb engine — the
 * end-to-end persistence proof belongs to the Postgres gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

const { runWithOrgContext } = vi.hoisted(() => ({ runWithOrgContext: vi.fn() }));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

vi.mock('./_shared/outbox', () => ({ writeSettingsInfraOutbox: vi.fn(async () => undefined) }));

let calls: QueryCall[] = [];

function makeClient() {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // hasPermission → allow.
      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as T[], rowCount: 1 };

      if (normalized.startsWith('update public.warehouses')) {
        return {
          rows: [{ id: WAREHOUSE_ID, name: String(params[1]), address_label: params[2] ?? null }] as T[],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected SQL: ${normalized}`);
    },
  };
}

async function loadUpdateWarehouseDetails() {
  const mod = (await import('./warehouse')) as Record<string, unknown>;
  const action = mod.updateWarehouseDetails;
  if (typeof action !== 'function') expect.fail('warehouse.ts must export updateWarehouseDetails');
  return action as (input: unknown) => Promise<{ ok: boolean; error?: string; data?: { name: string; address: string | null } }>;
}

function updateCall() {
  const call = calls.find((c) => c.sql.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('update public.warehouses'));
  if (!call) expect.fail('expected an update against public.warehouses');
  return { ...call, normalized: call.sql.replace(/\s+/g, ' ').trim().toLowerCase() };
}

describe('updateWarehouseDetails — address is written into the shared jsonb surgically', () => {
  beforeEach(() => {
    calls = [];
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client: makeClient() }),
    );
  });

  it('edits the address through jsonb_set on the line1 key only, never replacing the object', async () => {
    const updateWarehouseDetails = await loadUpdateWarehouseDetails();

    await expect(
      updateWarehouseDetails({ warehouseId: WAREHOUSE_ID, name: 'Apex Chilled', address: 'ul. Wrocławska 12' }),
    ).resolves.toMatchObject({ ok: true, data: { name: 'Apex Chilled', address: 'ul. Wrocławska 12' } });

    const { normalized, params } = updateCall();

    // The write targets exactly one key.
    expect(normalized).toContain('jsonb_set');
    expect(normalized).toContain("'{line1}'");

    // REGRESSION GUARD: no wholesale assignment of the address column from a
    // bound parameter — that is what would wipe deactivated_at/deactivated_by.
    expect(normalized).not.toMatch(/set[^;]*\baddress\s*=\s*\$\d/);
    expect(normalized).not.toMatch(/address\s*=\s*\$\d+::jsonb/);

    // The soft-delete markers are never named by this statement, so it cannot
    // add, move or remove them.
    expect(normalized).not.toContain('deactivated_at');
    expect(normalized).not.toContain('deactivated_by');

    // The existing object is the base of every branch (coalesce, not replace).
    expect(normalized).toContain("coalesce(address, '{}'::jsonb)");

    expect(params).toEqual([WAREHOUSE_ID, 'Apex Chilled', 'ul. Wrocławska 12', true]);
  });

  it('clears only the line1 key when the address is emptied', async () => {
    const updateWarehouseDetails = await loadUpdateWarehouseDetails();

    await expect(updateWarehouseDetails({ warehouseId: WAREHOUSE_ID, name: 'Apex Chilled', address: '' })).resolves.toMatchObject({
      ok: true,
    });

    const { normalized, params } = updateCall();
    // Key subtraction, not object replacement.
    expect(normalized).toContain("- 'line1'");
    expect(normalized).not.toContain('deactivated_at');
    expect(params).toEqual([WAREHOUSE_ID, 'Apex Chilled', null, true]);
  });

  it('leaves the whole jsonb untouched when no address is supplied (name-only edit)', async () => {
    const updateWarehouseDetails = await loadUpdateWarehouseDetails();

    await expect(updateWarehouseDetails({ warehouseId: WAREHOUSE_ID, name: 'Renamed only' })).resolves.toMatchObject({
      ok: true,
      data: { name: 'Renamed only' },
    });

    const { normalized, params } = updateCall();
    // The `addressProvided` flag is false → the CASE returns `address` as-is.
    expect(params).toEqual([WAREHOUSE_ID, 'Renamed only', null, false]);
    expect(normalized).toContain('when not $4::boolean then address');
  });

  it('rejects a malformed warehouse id and an empty name before touching the database', async () => {
    const updateWarehouseDetails = await loadUpdateWarehouseDetails();

    await expect(updateWarehouseDetails({ warehouseId: 'not-a-uuid', name: 'X' })).resolves.toEqual({
      ok: false,
      error: 'invalid_input',
    });
    await expect(updateWarehouseDetails({ warehouseId: WAREHOUSE_ID, name: '   ' })).resolves.toEqual({
      ok: false,
      error: 'invalid_input',
    });
    expect(calls).toHaveLength(0);
  });

  it('reports not_found when the org-scoped update matches no row', async () => {
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({
        userId: USER_ID,
        orgId: ORG_ID,
        client: {
          async query<T>(sql: string, params: readonly unknown[] = []) {
            calls.push({ sql, params });
            if (sql.toLowerCase().includes('from public.user_roles')) return { rows: [{ ok: true }] as T[], rowCount: 1 };
            return { rows: [] as T[], rowCount: 0 };
          },
        },
      }),
    );

    const updateWarehouseDetails = await loadUpdateWarehouseDetails();
    await expect(updateWarehouseDetails({ warehouseId: WAREHOUSE_ID, name: 'Ghost' })).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});
