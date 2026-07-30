/**
 * R02-01 + R02-04 — the production line default output location.
 *
 * R02-01: the write targeted `default_output_location_id` while every reader read
 * `default_location_id`, so a saved location reported success and came back as
 * "— none —". These tests pin the write to the column that is read back.
 *
 * R02-04: inactive locations must not be selectable as a new target, but a line
 * that ALREADY points at a since-deactivated location must stay editable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WAREHOUSE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_WAREHOUSE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LINE_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVE_LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const INACTIVE_LOCATION_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_INACTIVE_LOCATION_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_WAREHOUSE_LOCATION_ID = '55555555-5555-4555-8555-555555555555';

type StoredLocation = { id: string; warehouse_id: string; is_active: boolean };

const LOCATIONS: StoredLocation[] = [
  { id: ACTIVE_LOCATION_ID, warehouse_id: WAREHOUSE_ID, is_active: true },
  { id: INACTIVE_LOCATION_ID, warehouse_id: WAREHOUSE_ID, is_active: false },
  { id: OTHER_INACTIVE_LOCATION_ID, warehouse_id: WAREHOUSE_ID, is_active: false },
  { id: OTHER_WAREHOUSE_LOCATION_ID, warehouse_id: OTHER_WAREHOUSE_ID, is_active: true },
];

vi.mock('../../lib/auth/with-org-context', () => ({ withOrgContext: vi.fn() }));
vi.mock('../../lib/auth/has-permission', () => ({ hasPermission: vi.fn(async () => true) }));
vi.mock('../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
vi.mock('./_shared/outbox', () => ({ writeSettingsInfraOutbox: vi.fn(async () => undefined) }));

import { withOrgContext } from '../../lib/auth/with-org-context';
import { upsertLine } from './line';

type Query = { sql: string; params: readonly unknown[] };

/**
 * Minimal production_lines + locations store. The line row is keyed by the
 * CANONICAL column name, so a write to the old duplicate column would leave
 * `default_location_id` untouched and the assertions below would fail.
 */
function mockDb(storedLine?: { id: string; default_location_id: string | null }) {
  const calls: Query[] = [];
  const lines = new Map<string, { id: string; default_location_id: string | null }>();
  if (storedLine) lines.set(storedLine.id, { ...storedLine });

  vi.mocked(withOrgContext).mockImplementation(async (fn) =>
    fn({
      userId: USER_ID,
      orgId: ORG_ID,
      client: {
        query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
          calls.push({ sql, params });
          const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

          if (normalized.startsWith('insert into public.production_lines')) {
            const id = (params[0] as string | null) ?? LINE_ID;
            // Bind $4 is the location; the column it lands in is whatever the
            // INSERT names — that is exactly what this test is about.
            const column = normalized.includes('(id, org_id, site_id, warehouse_id, default_location_id,')
              ? 'default_location_id'
              : 'unknown_column';
            const row = { id, default_location_id: column === 'default_location_id' ? ((params[3] as string | null) ?? null) : null };
            lines.set(id, row);
            return { rows: [{ id, code: params[4], name: params[5], status: params[6], default_location_id: row.default_location_id }], rowCount: 1 };
          }

          // duplicate-code pre-check
          if (normalized.includes('from public.production_lines') && normalized.includes('upper(code)')) {
            return { rows: [], rowCount: 0 };
          }

          // stored default location of the line being edited
          if (normalized.includes('from public.production_lines') && normalized.includes('default_location_id')) {
            const row = lines.get(String(params[0]));
            return { rows: row ? [{ default_location_id: row.default_location_id }] : [], rowCount: row ? 1 : 0 };
          }

          // site-ownership guard (lib/site/assert-site-in-org.ts) — SITE_ID is this org's.
          if (normalized.includes('from public.sites')) {
            const own = String(params[0]) === SITE_ID;
            return { rows: own ? [{ id: SITE_ID }] : [], rowCount: own ? 1 : 0 };
          }

          if (normalized.includes('from public.warehouses')) {
            return { rows: [{ id: WAREHOUSE_ID, site_id: SITE_ID }], rowCount: 1 };
          }

          if (normalized.includes('from public.locations')) {
            const row = LOCATIONS.find((location) => location.id === String(params[0]));
            return { rows: row ? [{ warehouse_id: row.warehouse_id, is_active: row.is_active }] : [], rowCount: row ? 1 : 0 };
          }

          return { rows: [], rowCount: 0 };
        }),
      },
    }),
  );

  return { calls, lines };
}

const baseInput = { siteId: SITE_ID, warehouseId: WAREHOUSE_ID, code: 'N17R02L1', name: 'Line 1', status: 'active' as const };

describe('R02-01 default output location is written to the column that is read back', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes default_location_id, not the dead default_output_location_id', async () => {
    const { calls, lines } = mockDb();

    const result = await upsertLine({ ...baseInput, defaultOutputLocationId: ACTIVE_LOCATION_ID });

    expect(result).toMatchObject({ ok: true });
    const insert = calls.find((call) => /insert into public\.production_lines/i.test(call.sql));
    expect(insert?.sql).toContain('default_location_id');
    expect(insert?.sql).not.toContain('default_output_location_id');
    // Round-trip: the value is readable from the column the screens select.
    expect(lines.get(LINE_ID)?.default_location_id).toBe(ACTIVE_LOCATION_ID);
  });

  it('clears the location when none is selected', async () => {
    const { lines } = mockDb();

    await upsertLine({ ...baseInput, defaultOutputLocationId: null });

    expect(lines.get(LINE_ID)?.default_location_id).toBeNull();
  });
});

describe('R02-04 inactive locations are refused server-side', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a deactivated location even when passed explicitly', async () => {
    // The picker hides it; a hand-crafted request must not get through either.
    const { calls } = mockDb();

    const result = await upsertLine({ ...baseInput, defaultOutputLocationId: INACTIVE_LOCATION_ID });

    expect(result).toEqual({ ok: false, error: 'inactive_location_reference' });
    expect(calls.some((call) => /insert into public\.production_lines/i.test(call.sql))).toBe(false);
  });

  it('keeps a line editable when its assigned location was deactivated', async () => {
    // Anti-regression: R02-04 must not freeze lines that already point at a
    // location someone deactivated afterwards.
    const { calls, lines } = mockDb({ id: LINE_ID, default_location_id: INACTIVE_LOCATION_ID });

    const result = await upsertLine({
      ...baseInput,
      id: LINE_ID,
      name: 'Renamed while its location is inactive',
      defaultOutputLocationId: INACTIVE_LOCATION_ID,
    });

    expect(result).toMatchObject({ ok: true });
    expect(calls.some((call) => /insert into public\.production_lines/i.test(call.sql))).toBe(true);
    expect(lines.get(LINE_ID)?.default_location_id).toBe(INACTIVE_LOCATION_ID);
  });

  it('still refuses swapping one inactive location for another', async () => {
    const { calls } = mockDb({ id: LINE_ID, default_location_id: INACTIVE_LOCATION_ID });

    const result = await upsertLine({
      ...baseInput,
      id: LINE_ID,
      defaultOutputLocationId: OTHER_INACTIVE_LOCATION_ID,
    });

    expect(result).toEqual({ ok: false, error: 'inactive_location_reference' });
    expect(calls.some((call) => /insert into public\.production_lines/i.test(call.sql))).toBe(false);
  });

  it('lets a line move off its inactive location onto an active one', async () => {
    const { lines } = mockDb({ id: LINE_ID, default_location_id: INACTIVE_LOCATION_ID });

    const result = await upsertLine({ ...baseInput, id: LINE_ID, defaultOutputLocationId: ACTIVE_LOCATION_ID });

    expect(result).toMatchObject({ ok: true });
    expect(lines.get(LINE_ID)?.default_location_id).toBe(ACTIVE_LOCATION_ID);
  });

  it('rejects a location belonging to another warehouse', async () => {
    mockDb();

    const result = await upsertLine({ ...baseInput, defaultOutputLocationId: OTHER_WAREHOUSE_LOCATION_ID });

    expect(result).toEqual({ ok: false, error: 'invalid_location_reference' });
  });

  it('rejects an unknown location id even when the line has no warehouse', async () => {
    // The old guard skipped validation entirely when warehouseId was null.
    mockDb();

    const result = await upsertLine({
      ...baseInput,
      warehouseId: null,
      defaultOutputLocationId: '66666666-6666-4666-8666-666666666666',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_location_reference' });
  });
});

describe('a location can only be accepted against the line warehouse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a KNOWN, active location when the line has no warehouse', async () => {
    // The gap: only an unknown id was refused without a warehouse. A location
    // that exists sailed through, because the "does it belong to this warehouse"
    // check was skipped whenever there was no warehouse to compare against — so
    // any location in the org could be stored as a line's output target.
    const { calls } = mockDb();

    const result = await upsertLine({ ...baseInput, warehouseId: null, defaultOutputLocationId: ACTIVE_LOCATION_ID });

    // Named reason, not a generic rejection: the user has to know to pick a
    // warehouse first.
    expect(result).toEqual({ ok: false, error: 'location_requires_warehouse' });
    expect(calls.some((call) => /insert into public\.production_lines/i.test(call.sql))).toBe(false);
  });

  it('still saves an existing warehouse-less line whose stored location is unchanged', async () => {
    // Anti-regression, same carve-out as the inactive-location rule: rows that
    // predate the check must stay editable, or a rename/status change from the
    // sites screen (which carries the stored location through untouched) would
    // be impossible on them.
    const { calls, lines } = mockDb({ id: LINE_ID, default_location_id: ACTIVE_LOCATION_ID });

    const result = await upsertLine({
      ...baseInput,
      id: LINE_ID,
      warehouseId: null,
      name: 'Renamed legacy line with no warehouse',
      defaultOutputLocationId: ACTIVE_LOCATION_ID,
    });

    expect(result).toMatchObject({ ok: true });
    expect(calls.some((call) => /insert into public\.production_lines/i.test(call.sql))).toBe(true);
    expect(lines.get(LINE_ID)?.default_location_id).toBe(ACTIVE_LOCATION_ID);
  });

  it('locks the line row before deciding whether the location is unchanged', async () => {
    // Both "unchanged value still passes" carve-outs read the stored value and
    // then write. Without the row lock two concurrent saves decide on the same
    // stale snapshot and the later COMMIT wins over a check that never saw it.
    const { calls } = mockDb({ id: LINE_ID, default_location_id: ACTIVE_LOCATION_ID });

    await upsertLine({ ...baseInput, id: LINE_ID, defaultOutputLocationId: ACTIVE_LOCATION_ID });

    const storedRead = calls.find(
      (call) => /from public\.production_lines/i.test(call.sql) && /default_location_id/i.test(call.sql) && !/insert into/i.test(call.sql),
    );
    expect(storedRead?.sql).toMatch(/for update/i);
  });
});
