/**
 * FALA 8 / T1 — R08-01: a location holding live stock must not be switched off.
 *
 * Observed: `NIGHT-R08-1400` held one live LP (2.345 kg, Available + Released). Unticking
 * "Is active" saved without a word. Because the scanner refuses an inactive location as a move
 * target (lib/warehouse/scanner/movement.ts loadLocationScope → location_inactive 422), that
 * pallet became unhandleable: it could not be moved out of the location it was stranded in.
 *
 * Guard design mirrors the has_active_children rule that already lives beside it:
 *   - TRANSITION-scoped (was active → becomes inactive), never edit-scoped, so an already
 *     inactive location carrying legacy stock stays renameable;
 *   - refuses with a NAMED error carrying the exact dependency count, instead of cascading or
 *     silently moving stock;
 *   - "live" = the definition the locations page counts with (page.tsx lp_counts CTE) and that
 *     stock-move-actions.ts / scanner movement.ts share: every status but the terminal four
 *     (consumed, merged, shipped, destroyed — mig 294 license_plates_status_check).
 *
 * Separate file from location-active-parent.test.ts on purpose: that file's fake client does not
 * model license_plates, and crud.test.ts is shared with the lines/warehouses tracks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333';

const STOCKED_ID = '44444444-4444-4444-8444-444444444444'; // active, holds live LPs
const EMPTY_ID = '55555555-5555-4555-8555-555555555555'; // active, no LPs
const OFF_STOCKED_ID = '66666666-6666-4666-8666-666666666666'; // ALREADY inactive, holds live LPs
const TERMINAL_ONLY_ID = '77777777-7777-4777-8777-777777777777'; // active, only terminal LPs
const MERGED_ONLY_ID = '88888888-8888-4888-8888-888888888888'; // active, only merged LPs (prod RECV case)

type Row = {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  location_type: string;
  level: number;
  path: string;
  barcode: string | null;
  is_active: boolean;
};

type Lp = { location_id: string; status: string };

type FakeClient = {
  calls: Array<{ sql: string; params: readonly unknown[] }>;
  locations: Map<string, Row>;
  lps: Lp[];
  query: <T>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

const { _runWithOrgContext } = vi.hoisted(() => ({ _runWithOrgContext: vi.fn() }));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

function row(overrides: Partial<Row> & Pick<Row, 'id' | 'code' | 'level' | 'path'>): Row {
  return {
    warehouse_id: WAREHOUSE_ID,
    parent_id: null,
    name: overrides.code,
    location_type: 'storage',
    barcode: null,
    is_active: true,
    ...overrides,
  };
}

// Terminal statuses from mig 294 license_plates_status_check — no longer handleable stock at a bin.
const TERMINAL = ['consumed', 'merged', 'shipped', 'destroyed'];

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    locations: new Map<string, Row>([
      [STOCKED_ID, row({ id: STOCKED_ID, code: 'NIGHT-R08-1400', level: 1, path: 'NIGHT-R08-1400' })],
      [EMPTY_ID, row({ id: EMPTY_ID, code: 'NIGHT-R08-EMPTY', level: 1, path: 'NIGHT-R08-EMPTY' })],
      [OFF_STOCKED_ID, row({ id: OFF_STOCKED_ID, code: 'NIGHT-R08-OFF', level: 1, path: 'NIGHT-R08-OFF', is_active: false })],
      [TERMINAL_ONLY_ID, row({ id: TERMINAL_ONLY_ID, code: 'NIGHT-R08-TERM', level: 1, path: 'NIGHT-R08-TERM' })],
      [MERGED_ONLY_ID, row({ id: MERGED_ONLY_ID, code: 'NIGHT-R08-MERGE', level: 1, path: 'NIGHT-R08-MERGE' })],
    ]),
    lps: [
      // The observed pallet, plus two more so the reported count is not confusable with a boolean.
      { location_id: STOCKED_ID, status: 'available' },
      { location_id: STOCKED_ID, status: 'received' },
      { location_id: STOCKED_ID, status: 'quarantine' },
      { location_id: OFF_STOCKED_ID, status: 'available' },
      { location_id: TERMINAL_ONLY_ID, status: 'consumed' },
      { location_id: TERMINAL_ONLY_ID, status: 'merged' },
      { location_id: TERMINAL_ONLY_ID, status: 'shipped' },
      { location_id: TERMINAL_ONLY_ID, status: 'destroyed' },
      { location_id: MERGED_ONLY_ID, status: 'merged' },
      { location_id: MERGED_ONLY_ID, status: 'merged' },
    ],
    async query<T>(sql: string, params: readonly unknown[] = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as T[], rowCount: 1 };
      if (normalized.startsWith('insert into public.outbox_events')) return { rows: [] as T[], rowCount: 1 };

      if (normalized.includes('active_children')) {
        const parentId = String(params[0]);
        const count = Array.from(client.locations.values()).filter((l) => l.parent_id === parentId && l.is_active).length;
        return { rows: [{ active_children: count }] as T[], rowCount: 1 };
      }

      // R08-01 probe. Modelled the way Postgres would answer the real predicate, so a guard that
      // forgot `status not in (...)` or scoped by the wrong column fails here.
      if (normalized.includes('live_lps')) {
        expect(normalized).toContain('from public.license_plates');
        expect(normalized).toContain("status not in ('consumed', 'merged', 'shipped', 'destroyed')");
        const locationId = String(params[0]);
        const count = client.lps.filter((lp) => lp.location_id === locationId && !TERMINAL.includes(lp.status)).length;
        return { rows: [{ live_lps: count }] as T[], rowCount: 1 };
      }

      if (normalized.startsWith('select') && normalized.includes('from public.locations')) {
        const found = client.locations.get(String(params[0]));
        return { rows: (found ? [found] : []) as T[], rowCount: found ? 1 : 0 };
      }

      if (normalized.startsWith('insert into public.locations')) {
        const id = (params[0] as string | null) ?? `generated-${client.locations.size + 1}`;
        const saved: Row = {
          id,
          warehouse_id: String(params[1]),
          parent_id: (params[2] as string | null) ?? null,
          code: String(params[3]),
          name: String(params[4]),
          location_type: String(params[5]),
          level: Number(params[6]),
          path: String(params[7]),
          barcode: (params[8] as string | null) ?? null,
          is_active: Boolean(params[9]),
        };
        client.locations.set(id, saved);
        return { rows: [saved] as T[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.locations')) return { rows: [] as T[], rowCount: 0 };

      throw new Error(`Unexpected SQL in R08-01 fake client: ${normalized}`);
    },
  };
  return client;
}

type UpsertInput = {
  id?: string;
  warehouseId: string;
  parentId: string | null;
  code: string;
  name: string;
  level: number;
  locationType: string;
  active?: boolean;
};
type UpsertResult = { ok: boolean; error?: string; lpCount?: number; data?: { id: string; path: string; level: number; active: boolean } };

let currentClient: FakeClient;

async function upsert(input: UpsertInput): Promise<UpsertResult> {
  const mod = (await import(`${__dirname}/location.ts`)) as { upsertLocation: (i: unknown) => Promise<UpsertResult> };
  return mod.upsertLocation(input);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
});

describe('R08-01 · locations: deactivating a location that still holds stock', () => {
  it('refuses the active → inactive transition and reports the exact dependency count', async () => {
    const result = await upsert({
      id: STOCKED_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'NIGHT-R08-1400',
      name: 'Night R08 1400',
      level: 1,
      locationType: 'storage',
      active: false,
    });

    // available + received + quarantine — three live pallets, the terminal ones do not count.
    expect(result).toMatchObject({ ok: false, error: 'has_stock', lpCount: 3 });
    // Nothing was written: the location keeps its flag and the stock keeps its home.
    expect(currentClient.locations.get(STOCKED_ID)?.is_active).toBe(true);
    expect(currentClient.calls.some((call) => call.sql.trim().toLowerCase().startsWith('insert into public.locations'))).toBe(false);
  });

  it('lets an EMPTY location be deactivated (anti-regression)', async () => {
    const result = await upsert({
      id: EMPTY_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'NIGHT-R08-EMPTY',
      name: 'Empty',
      level: 1,
      locationType: 'storage',
      active: false,
    });

    expect(result).toMatchObject({ ok: true, data: { active: false } });
    expect(currentClient.locations.get(EMPTY_ID)?.is_active).toBe(false);
  });

  it('counts only LIVE stock — consumed / merged / shipped / destroyed pallets do not block', async () => {
    const result = await upsert({
      id: TERMINAL_ONLY_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'NIGHT-R08-TERM',
      name: 'Terminal only',
      level: 1,
      locationType: 'storage',
      active: false,
    });

    expect(result).toMatchObject({ ok: true, data: { active: false } });
    expect(currentClient.locations.get(TERMINAL_ONLY_ID)?.is_active).toBe(false);
  });

  it('lets a location with ONLY merged pallets be deactivated (prod RECV false block)', async () => {
    const result = await upsert({
      id: MERGED_ONLY_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'NIGHT-R08-MERGE',
      name: 'Merged only',
      level: 1,
      locationType: 'storage',
      active: false,
    });

    expect(result).toMatchObject({ ok: true, data: { active: false } });
    expect(currentClient.locations.get(MERGED_ONLY_ID)?.is_active).toBe(false);
  });

  it('keeps an ALREADY-inactive location with live stock editable (anti-over-blocking)', async () => {
    // The rule blocks the TRANSITION, not the record. A location that is already off — and whose
    // stranded stock is exactly the thing an operator is trying to document — must stay
    // renameable/recodeable, otherwise the repair path is closed too.
    const result = await upsert({
      id: OFF_STOCKED_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'NIGHT-R08-OFF-2',
      name: 'Renamed while off and stocked',
      level: 1,
      locationType: 'storage',
      active: false,
    });

    expect(result).toMatchObject({ ok: true });
    expect(currentClient.locations.get(OFF_STOCKED_ID)).toMatchObject({
      name: 'Renamed while off and stocked',
      code: 'NIGHT-R08-OFF-2',
      is_active: false,
    });
    // No stock probe runs at all for a row that was already off.
    expect(currentClient.calls.some((call) => call.sql.includes('live_lps'))).toBe(false);
  });

  it('does not block REACTIVATING a stocked location, or editing one that stays active', async () => {
    const reactivated = await upsert({
      id: OFF_STOCKED_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'NIGHT-R08-OFF',
      name: 'Back on',
      level: 1,
      locationType: 'storage',
      active: true,
    });
    expect(reactivated).toMatchObject({ ok: true, data: { active: true } });

    const renamed = await upsert({
      id: STOCKED_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'NIGHT-R08-1400',
      name: 'Renamed but still active',
      level: 1,
      locationType: 'storage',
      active: true,
    });
    expect(renamed).toMatchObject({ ok: true, data: { active: true } });
    expect(currentClient.locations.get(STOCKED_ID)?.name).toBe('Renamed but still active');
  });

  it('checks the location it is switching off, scoped by location_id', async () => {
    await upsert({
      id: STOCKED_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'NIGHT-R08-1400',
      name: 'Night R08 1400',
      level: 1,
      locationType: 'storage',
      active: false,
    });

    const probe = currentClient.calls.find((call) => call.sql.includes('live_lps'));
    expect(probe?.params[0]).toBe(STOCKED_ID);
    expect(probe?.sql.toLowerCase()).toContain('location_id = $1::uuid');
    // org scoping is not optional on a cross-tenant table.
    expect(probe?.sql.toLowerCase()).toContain('org_id = app.current_org_id()');
  });

  it('still blocks on active children first — the two guards do not shadow each other', async () => {
    // A stocked location that is ALSO a parent of an active child: whichever guard answers, the
    // save must not go through.
    currentClient.locations.set('child-1', row({ id: 'child-1', code: 'CHILD', level: 2, path: 'NIGHT-R08-1400.CHILD', parent_id: STOCKED_ID }));

    const result = await upsert({
      id: STOCKED_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'NIGHT-R08-1400',
      name: 'Night R08 1400',
      level: 1,
      locationType: 'storage',
      active: false,
    });

    expect(result).toMatchObject({ ok: false, error: 'has_active_children' });
    expect(currentClient.locations.get(STOCKED_ID)?.is_active).toBe(true);
  });
});
