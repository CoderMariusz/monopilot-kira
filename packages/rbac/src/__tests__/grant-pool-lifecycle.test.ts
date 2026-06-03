import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const poolEvents = vi.hoisted(() => {
  type QueryResult<Row = unknown> = {
    rows: Row[];
    rowCount: number;
  };

  type QueryCall = {
    sql: string;
    params?: unknown[];
  };

  type FakeClient = {
    query: ReturnType<typeof vi.fn<(sql: string, params?: unknown[]) => Promise<QueryResult>>>;
    release: ReturnType<typeof vi.fn<() => void>>;
  };

  type FakePool = {
    id: number;
    queries: QueryCall[];
    connect: ReturnType<typeof vi.fn<() => Promise<FakeClient>>>;
    end: ReturnType<typeof vi.fn<() => Promise<void>>>;
  };

  let nextPoolId = 1;
  const createdPools: FakePool[] = [];

  function result<Row = unknown>(rows: Row[], rowCount = rows.length): QueryResult<Row> {
    return { rows, rowCount };
  }

  function createClient(pool: FakePool): FakeClient {
    return {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        pool.queries.push({ sql, params });
        if (sql.includes('FROM public.users')) return result([{ '?column?': 1 }], 1);
        if (sql.includes('FROM public.org_security_policies')) {
          return result([{ dual_control_required: false }]);
        }
        if (sql.includes('FROM public.user_roles ur')) return result([]);
        if (sql.includes('SELECT id FROM public.roles')) return result([{ id: 'role-id' }]);
        return result([]);
      }),
      release: vi.fn(),
    };
  }

  function createPool(): FakePool {
    const pool: FakePool = {
      id: nextPoolId,
      queries: [],
      connect: vi.fn(),
      end: vi.fn(async () => undefined),
    };
    nextPoolId += 1;
    pool.connect.mockImplementation(async () => createClient(pool));
    createdPools.push(pool);
    return pool;
  }

  return {
    createdPools,
    getOwnerConnection: vi.fn(createPool),
    reset() {
      nextPoolId = 1;
      createdPools.splice(0, createdPools.length);
      this.getOwnerConnection.mockClear();
    },
  };
});

vi.mock('../../../db/src/clients.js', () => ({
  getOwnerConnection: poolEvents.getOwnerConnection,
}));

const { grantRole, closeRbacPool } = await import('../grant.js');

const grantInput = {
  actorUserId: '11111111-1111-4111-8111-111111111111',
  targetUserId: '22222222-2222-4222-8222-222222222222',
  orgId: '33333333-3333-4333-8333-333333333333',
  roleSlug: 'production.line_lead',
};

describe('grantRole owner pool lifecycle', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalOwnerUrl = process.env.DATABASE_URL_OWNER;
  let unhandledRejections: unknown[];

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://owner@example.invalid/monopilot';
    delete process.env.DATABASE_URL_OWNER;
    unhandledRejections = [];
    process.on('unhandledRejection', collectUnhandledRejection);
    poolEvents.reset();
  });

  afterEach(async () => {
    process.off('unhandledRejection', collectUnhandledRejection);
    await closeRbacPool();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalOwnerUrl === undefined) {
      delete process.env.DATABASE_URL_OWNER;
    } else {
      process.env.DATABASE_URL_OWNER = originalOwnerUrl;
    }
  });

  afterAll(async () => {
    await closeRbacPool();
  });

  function collectUnhandledRejection(reason: unknown) {
    unhandledRejections.push(reason);
  }

  it('reuses the same Pool reference across consecutive grants', async () => {
    await expect(grantRole(grantInput)).resolves.toEqual({ success: true });
    await expect(grantRole(grantInput)).resolves.toEqual({ success: true });

    expect(poolEvents.getOwnerConnection).toHaveBeenCalledTimes(1);
    expect(poolEvents.createdPools).toHaveLength(1);
    expect(poolEvents.createdPools[0]!.connect).toHaveBeenCalledTimes(2);
    expect(poolEvents.createdPools[0]!.end).not.toHaveBeenCalled();
  });

  it('creates a fresh Pool after closeRbacPool is awaited', async () => {
    await expect(grantRole(grantInput)).resolves.toEqual({ success: true });
    const firstPool = poolEvents.createdPools[0]!;

    await closeRbacPool();

    await expect(grantRole(grantInput)).resolves.toEqual({ success: true });
    const secondPool = poolEvents.createdPools[1]!;

    expect(firstPool).not.toBe(secondPool);
    expect(firstPool.end).toHaveBeenCalledTimes(1);
    expect(poolEvents.getOwnerConnection).toHaveBeenCalledTimes(2);
    expect(secondPool.end).not.toHaveBeenCalled();
  });

  it('awaits closeRbacPool without pg-pool unhandled rejections', async () => {
    await expect(grantRole(grantInput)).resolves.toEqual({ success: true });

    await expect(closeRbacPool()).resolves.toBeUndefined();

    await new Promise((resolve) => setImmediate(resolve));
    expect(unhandledRejections).toEqual([]);
  });
});
