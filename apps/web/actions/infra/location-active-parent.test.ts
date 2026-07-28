/**
 * FALA 6 / T2 — R02-03: an active location must never sit under an inactive parent.
 *
 * Invariant design (see _meta/plans/.../FALA-06/rep-T2.md):
 *   - write path CLAMPS: active := requested && parent.is_active — never rejects, so a
 *     pre-existing non-compliant row stays editable and self-heals on save;
 *   - the reverse transition (active → inactive while active children exist) is BLOCKED with a
 *     named reason instead of cascading, because a cascade cannot be undone.
 *
 * Separate file from crud.test.ts on purpose: that file is shared with the lines/warehouses
 * tracks and its fake client does not model is_active.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333';

const ZONE_ID = '44444444-4444-4444-8444-444444444444'; // L1, active
const AISLE_ID = '55555555-5555-4555-8555-555555555555'; // L2, active, child of ZONE
const BIN1_ID = '66666666-6666-4666-8666-666666666666'; // L2, INACTIVE, child of ZONE
const SUB1_ID = '77777777-7777-4777-8777-777777777777'; // L3, ACTIVE under the inactive BIN1 — legacy row

// [L-1] The three-node shape from the cross-review: an active INTERMEDIATE node under an
// inactive root, carrying an active child of its own. Editing L2 used to be impossible.
const L1_ID = '88888888-8888-4888-8888-888888888888'; // L1, INACTIVE
const L2_ID = '99999999-9999-4999-8999-999999999999'; // L2, ACTIVE under the inactive L1
const L3_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // L3, ACTIVE under L2

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

type FakeClient = {
  calls: Array<{ sql: string; params: readonly unknown[] }>;
  locations: Map<string, Row>;
  outbox: Array<{ event_type: string; payload: Record<string, unknown> }>;
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

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    locations: new Map<string, Row>([
      [ZONE_ID, row({ id: ZONE_ID, code: 'R02-ZONE', level: 1, path: 'R02-ZONE' })],
      [AISLE_ID, row({ id: AISLE_ID, code: 'R02-AISLE', level: 2, path: 'R02-ZONE.R02-AISLE', parent_id: ZONE_ID })],
      [BIN1_ID, row({ id: BIN1_ID, code: 'R02-BIN1', level: 2, path: 'R02-ZONE.R02-BIN1', parent_id: ZONE_ID, is_active: false })],
      // The exact shape the audit observed in production: active child of an inactive parent.
      [SUB1_ID, row({ id: SUB1_ID, code: 'R02-SUB1', level: 3, path: 'R02-ZONE.R02-BIN1.R02-SUB1', parent_id: BIN1_ID, is_active: true })],
      [L1_ID, row({ id: L1_ID, code: 'R02-L1', level: 1, path: 'R02-L1', is_active: false })],
      [L2_ID, row({ id: L2_ID, code: 'R02-L2', level: 2, path: 'R02-L1.R02-L2', parent_id: L1_ID, is_active: true })],
      [L3_ID, row({ id: L3_ID, code: 'R02-L3', level: 3, path: 'R02-L1.R02-L2.R02-L3', parent_id: L2_ID, is_active: true })],
    ]),
    outbox: [],
    async query<T>(sql: string, params: readonly unknown[] = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as T[], rowCount: 1 };

      if (normalized.startsWith('insert into public.outbox_events')) {
        client.outbox.push({ event_type: String(params[1]), payload: JSON.parse(String(params[4])) });
        return { rows: [] as T[], rowCount: 1 };
      }

      // Must be matched before the generic locations select — it also reads public.locations.
      if (normalized.includes('active_children')) {
        const parentId = String(params[0]);
        const count = Array.from(client.locations.values()).filter((l) => l.parent_id === parentId && l.is_active).length;
        return { rows: [{ active_children: count }] as T[], rowCount: 1 };
      }

      if (normalized.startsWith('select') && normalized.includes('from public.locations')) {
        const found = client.locations.get(String(params[0]));
        return { rows: (found ? [found] : []) as T[], rowCount: found ? 1 : 0 };
      }

      if (normalized.startsWith('insert into public.locations')) {
        // upsertLocation param order: id, warehouseId, parentId, code, name, type, level, path, barcode, active
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

      throw new Error(`Unexpected SQL in R02-03 fake client: ${normalized}`);
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
type UpsertResult = { ok: boolean; error?: string; data?: { id: string; path: string; level: number; active: boolean } };

let currentClient: FakeClient;

async function upsert(input: UpsertInput): Promise<UpsertResult> {
  const mod = (await import(`${__dirname}/location.ts`)) as { upsertLocation: (i: unknown) => Promise<UpsertResult> };
  return mod.upsertLocation(input);
}

function savedRowByCode(code: string): Row | undefined {
  return Array.from(currentClient.locations.values()).find((l) => l.code === code);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
});

describe('R02-03 · locations: active child under an inactive parent', () => {
  it('clamps a new child of an INACTIVE parent to inactive even though the client asked for active', async () => {
    const result = await upsert({
      warehouseId: WAREHOUSE_ID,
      parentId: BIN1_ID,
      code: 'R02-SUB2',
      name: 'Sub 2',
      level: 3,
      locationType: 'bin',
      active: true,
    });

    expect(result).toMatchObject({ ok: true });
    expect(savedRowByCode('R02-SUB2')?.is_active).toBe(false);
  });

  it('is a trust boundary: the clamp holds on the raw server input, not just in the dialog', async () => {
    await upsert({ warehouseId: WAREHOUSE_ID, parentId: BIN1_ID, code: 'R02-SUB3', name: 'Sub 3', level: 3, locationType: 'bin', active: true });

    // The is_active bind ($10) that actually reached Postgres must be false…
    const insert = currentClient.calls.find((call) => call.sql.toLowerCase().trim().startsWith('insert into public.locations'));
    expect(insert?.params[9]).toBe(false);
    // …and the projection other modules consume must not advertise it as active.
    expect(currentClient.outbox.at(-1)).toMatchObject({ event_type: 'settings.location.upserted', payload: { active: false } });
  });

  it('still creates an ACTIVE child under an ACTIVE parent (anti-regression)', async () => {
    const result = await upsert({
      warehouseId: WAREHOUSE_ID,
      parentId: ZONE_ID,
      code: 'R02-DOCK',
      name: 'Dock',
      level: 2,
      locationType: 'storage',
      active: true,
    });

    expect(result).toMatchObject({ ok: true, data: { level: 2, path: 'R02-ZONE.R02-DOCK' } });
    expect(savedRowByCode('R02-DOCK')?.is_active).toBe(true);
    expect(currentClient.outbox.at(-1)).toMatchObject({ payload: { active: true } });
  });

  it('keeps a PRE-EXISTING non-compliant LEAF editable and preserves its flag (anti-over-blocking)', async () => {
    const result = await upsert({
      id: SUB1_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: BIN1_ID,
      code: 'R02-SUB1',
      name: 'Renamed while parent is inactive',
      level: 3,
      locationType: 'bin',
      active: true,
    });

    // Not rejected, and renaming a row is not a request to switch it off: with the parent link
    // untouched the stored flag survives the edit. The repair stays explicit (reactivate BIN1).
    expect(result).toMatchObject({ ok: true, data: { active: true } });
    expect(currentClient.locations.get(SUB1_ID)).toMatchObject({
      name: 'Renamed while parent is inactive',
      is_active: true,
    });
  });

  // ── [L-1] the case the previous round called "friction" ─────────────────────────────────────
  it('lets an active INTERMEDIATE node under an inactive parent be renamed (L1 inactive → L2 active → L3 active)', async () => {
    // `active: false` is exactly what the old dialog sent for L2 (it cannot tick a box under an
    // inactive parent). Combined with L2 having an active child, the server answered
    // has_active_children and the record could not be edited at all.
    const result = await upsert({
      id: L2_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: L1_ID,
      code: 'R02-L2',
      name: 'Renamed L2',
      level: 2,
      locationType: 'storage',
      active: false,
    });

    expect(result).toMatchObject({ ok: true, data: { active: true } });
    expect(currentClient.locations.get(L2_ID)).toMatchObject({ name: 'Renamed L2', is_active: true });
    // Nothing else moved: L1 stays off, L3 keeps its own flag, no cascade fired.
    expect(currentClient.locations.get(L1_ID)?.is_active).toBe(false);
    expect(currentClient.locations.get(L3_ID)?.is_active).toBe(true);
  });

  it('preserves the flag whichever activity the dialog sends for that node', async () => {
    const result = await upsert({
      id: L2_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: L1_ID,
      code: 'R02-L2',
      name: 'Renamed L2 again',
      level: 2,
      locationType: 'storage',
      active: true, // what the repaired dialog now sends
    });

    expect(result).toMatchObject({ ok: true, data: { active: true } });
    expect(currentClient.locations.get(L2_ID)).toMatchObject({ name: 'Renamed L2 again', is_active: true });
  });

  it('still clamps when the SAME row is MOVED under an inactive parent (the carve-out is link-scoped)', async () => {
    // AISLE is active with no children of its own, so nothing blocks the move — but changing the
    // parent link is a fresh decision, and the clamp must own it.
    const result = await upsert({
      id: AISLE_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: BIN1_ID,
      code: 'R02-AISLE',
      name: 'R02-AISLE',
      level: 3,
      locationType: 'storage',
      active: true,
    });

    expect(result).toMatchObject({ ok: true, data: { active: false } });
    expect(currentClient.locations.get(AISLE_ID)).toMatchObject({ parent_id: BIN1_ID, is_active: false });
  });

  it('lets an already-inactive parent that carries legacy active children be edited without tripping the guard', async () => {
    const result = await upsert({
      id: BIN1_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: ZONE_ID,
      code: 'R02-BIN1',
      name: 'Renamed inactive bin',
      level: 2,
      locationType: 'storage',
      active: false,
    });

    expect(result).toMatchObject({ ok: true });
    expect(currentClient.locations.get(BIN1_ID)).toMatchObject({ name: 'Renamed inactive bin', is_active: false });
    // The guard is transition-scoped: no active-children probe runs for a row that was already off.
    expect(currentClient.calls.some((call) => call.sql.includes('active_children'))).toBe(false);
  });

  it('offers reactivating the parent as the repair path for legacy rows', async () => {
    const result = await upsert({
      id: BIN1_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: ZONE_ID,
      code: 'R02-BIN1',
      name: 'R02-BIN1',
      level: 2,
      locationType: 'storage',
      active: true,
    });

    expect(result).toMatchObject({ ok: true });
    expect(currentClient.locations.get(BIN1_ID)?.is_active).toBe(true);
    // SUB1 was never touched and is now compliant again.
    expect(currentClient.locations.get(SUB1_ID)?.is_active).toBe(true);
  });

  it('blocks deactivating a parent that still has active children, with a named reason', async () => {
    const result = await upsert({
      id: ZONE_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'R02-ZONE',
      name: 'R02-ZONE',
      level: 1,
      locationType: 'storage',
      active: false,
    });

    expect(result).toMatchObject({ ok: false, error: 'has_active_children' });
    // Nothing was cascaded: the active child keeps its own flag, so the block is undoable.
    expect(currentClient.locations.get(ZONE_ID)?.is_active).toBe(true);
    expect(currentClient.locations.get(AISLE_ID)?.is_active).toBe(true);
  });

  it('allows deactivating a parent once its children are inactive', async () => {
    currentClient.locations.get(AISLE_ID)!.is_active = false;

    const result = await upsert({
      id: ZONE_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: null,
      code: 'R02-ZONE',
      name: 'R02-ZONE',
      level: 1,
      locationType: 'storage',
      active: false,
    });

    expect(result).toMatchObject({ ok: true });
    expect(currentClient.locations.get(ZONE_ID)?.is_active).toBe(false);
  });

  it('blocks re-parenting an active subtree under an inactive parent instead of silently stranding it', async () => {
    // AISLE (active, has no children yet) gains an active child first.
    await upsert({ warehouseId: WAREHOUSE_ID, parentId: AISLE_ID, code: 'R02-RACK', name: 'Rack', level: 3, locationType: 'rack', active: true });

    const moved = await upsert({
      id: AISLE_ID,
      warehouseId: WAREHOUSE_ID,
      parentId: BIN1_ID, // inactive → AISLE would be clamped inactive, orphaning its active child
      code: 'R02-AISLE',
      name: 'R02-AISLE',
      level: 3,
      locationType: 'storage',
      active: true,
    });

    expect(moved).toMatchObject({ ok: false, error: 'has_active_children' });
    expect(currentClient.locations.get(AISLE_ID)?.parent_id).toBe(ZONE_ID);
  });

  it('locks every row it reasons about, ancestor-first, before writing (lock protocol)', async () => {
    await upsert({ id: SUB1_ID, warehouseId: WAREHOUSE_ID, parentId: BIN1_ID, code: 'R02-SUB1', name: 'Lock order', level: 3, locationType: 'bin', active: true });

    const rowReads = currentClient.calls.filter((call) => call.sql.includes('id::text = $1'));
    // The parent comes first and the edited row second — the order CSV import also uses, so the
    // two writers queue behind each other instead of taking the same pair of locks head-on.
    expect(rowReads.map((call) => String(call.params[0]))).toEqual([BIN1_ID, SUB1_ID]);
    for (const call of rowReads) expect(call.sql.toLowerCase()).toContain('for update');

    const writeIndex = currentClient.calls.findIndex((call) => call.sql.toLowerCase().trim().startsWith('insert into public.locations'));
    const lastReadIndex = currentClient.calls.lastIndexOf(rowReads[rowReads.length - 1]!);
    expect(writeIndex).toBeGreaterThan(lastReadIndex);
  });
});

// ── [L-2] parent-deactivation ↔ child-creation race ───────────────────────────────────────────
// A fake that models `for update` as a real row lock held to commit. Without the lock both
// transactions decide on the same stale snapshot and the run ends with an active child under an
// inactive parent — the exact R02-03 state. With it, whichever transaction takes the parent lock
// first forces the other to re-read, so both possible orderings end compliant.

type Txn = { client: { query: <T>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; rowCount: number }> }; commit: () => void };

function makeLockWorld(seed: Row[]) {
  const locations = new Map<string, Row>(seed.map((r) => [r.id, { ...r }] as [string, Row]));
  const heldBy = new Map<string, number>();
  let waiters: Array<() => void> = [];
  let nextTxnId = 1;
  let generated = 0;

  function release(txnId: number) {
    for (const [rowId, owner] of Array.from(heldBy.entries())) if (owner === txnId) heldBy.delete(rowId);
    const pending = waiters;
    waiters = [];
    for (const wake of pending) wake();
  }

  async function acquire(txnId: number, rowId: string) {
    while (heldBy.has(rowId) && heldBy.get(rowId) !== txnId) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    heldBy.set(rowId, txnId);
  }

  function begin(): Txn {
    const txnId = nextTxnId++;
    return {
      commit: () => release(txnId),
      client: {
        async query<T>(sql: string, params: readonly unknown[] = []) {
          await Promise.resolve(); // yield, so the two transactions genuinely interleave
          const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

          if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as T[], rowCount: 1 };
          if (normalized.startsWith('insert into public.outbox_events')) return { rows: [] as T[], rowCount: 1 };

          if (normalized.includes('active_children')) {
            const parentId = String(params[0]);
            const count = Array.from(locations.values()).filter((l) => l.parent_id === parentId && l.is_active).length;
            return { rows: [{ active_children: count }] as T[], rowCount: 1 };
          }

          if (normalized.startsWith('select') && normalized.includes('from public.locations')) {
            const id = String(params[0]);
            // Block first, read after — a locking read must observe the winner's committed state.
            if (normalized.includes('for update')) await acquire(txnId, id);
            const found = locations.get(id);
            return { rows: (found ? [{ ...found }] : []) as T[], rowCount: found ? 1 : 0 };
          }

          if (normalized.startsWith('insert into public.locations')) {
            const id = (params[0] as string | null) ?? `generated-${++generated}`;
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
            locations.set(id, saved);
            return { rows: [saved] as T[], rowCount: 1 };
          }

          if (normalized.startsWith('update public.locations')) return { rows: [] as T[], rowCount: 0 };
          throw new Error(`Unexpected SQL in lock world: ${normalized}`);
        },
      },
    };
  }

  return { locations, begin };
}

function invariantViolations(locations: Map<string, Row>): string[] {
  return Array.from(locations.values())
    .filter((l) => l.is_active && l.parent_id && locations.get(l.parent_id)?.is_active === false)
    .map((l) => l.code);
}

describe('R02-03 · locations: concurrent parent deactivation and child creation', () => {
  it('serialises on the parent row so the pair can never strand an active child', async () => {
    const world = makeLockWorld([
      row({ id: ZONE_ID, code: 'R02-ZONE', level: 1, path: 'R02-ZONE' }),
      // Inactive, so ZONE itself is deactivatable at the moment both transactions start.
      row({ id: AISLE_ID, code: 'R02-AISLE', level: 2, path: 'R02-ZONE.R02-AISLE', parent_id: ZONE_ID, is_active: false }),
    ]);

    _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) => {
      const txn = world.begin();
      try {
        return await action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: txn.client });
      } finally {
        txn.commit();
      }
    });

    const [deactivateParent, createActiveChild] = await Promise.all([
      upsert({ id: ZONE_ID, warehouseId: WAREHOUSE_ID, parentId: null, code: 'R02-ZONE', name: 'R02-ZONE', level: 1, locationType: 'storage', active: false }),
      upsert({ warehouseId: WAREHOUSE_ID, parentId: ZONE_ID, code: 'R02-RACE', name: 'Race', level: 2, locationType: 'storage', active: true }),
    ]);

    expect(invariantViolations(world.locations)).toEqual([]);

    const zoneActive = world.locations.get(ZONE_ID)?.is_active;
    const child = Array.from(world.locations.values()).find((l) => l.code === 'R02-RACE');
    if (zoneActive === false) {
      // The deactivation took the lock first; the child write re-read the parent and was clamped.
      expect(deactivateParent).toMatchObject({ ok: true });
      expect(child?.is_active).toBe(false);
    } else {
      // The child took it first; the deactivation then SAW that child and refused by name.
      expect(child?.is_active).toBe(true);
      expect(createActiveChild).toMatchObject({ ok: true, data: { active: true } });
      expect(deactivateParent).toMatchObject({ ok: false, error: 'has_active_children' });
    }
  });
});
