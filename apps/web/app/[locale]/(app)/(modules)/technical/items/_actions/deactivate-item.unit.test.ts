import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

const { runWithOrgContext, revalidatePath } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(options: { canDeactivate: boolean; itemExists: boolean }) {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      const normalized = normalizeSql(sql);
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: options.canDeactivate }] as T[], rowCount: 1 };
      }
      if (normalized.startsWith('select status from public.items')) {
        return {
          rows: (options.itemExists ? [{ status: 'active' }] : []) as T[],
          rowCount: options.itemExists ? 1 : 0,
        };
      }
      if (normalized.startsWith('update public.items')) {
        return { rows: [{ id: ITEM_ID, status: 'blocked' }] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: normalized.startsWith('insert into public.audit_log') ? 1 : 0 };
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('deactivateItem P0 contracts', () => {
  it('TEC-057 returns forbidden before item access without technical.items.deactivate', async () => {
    const client = makeClient({ canDeactivate: false, itemExists: true });
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { deactivateItem } = await import('./deactivate-item');

    await expect(deactivateItem({ id: ITEM_ID })).resolves.toEqual({ ok: false, error: 'forbidden' });
    expect(client.calls[0]?.params[2]).toBe('technical.items.deactivate');
    expect(client.calls.some((call) => normalizeSql(call.sql).includes('from public.items'))).toBe(false);
  });

  it('TEC-057 returns not_found for an item outside the current org scope', async () => {
    const client = makeClient({ canDeactivate: true, itemExists: false });
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { deactivateItem } = await import('./deactivate-item');

    await expect(deactivateItem({ id: ITEM_ID })).resolves.toEqual({ ok: false, error: 'not_found' });
    const scopedRead = client.calls.find((call) => normalizeSql(call.sql).startsWith('select status from public.items'));
    expect(normalizeSql(scopedRead!.sql)).toContain('where org_id = app.current_org_id() and id = $1::uuid');
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('update public.items'))).toBe(false);
  });

  it('TEC-057 deactivates a visible item for an authorized actor', async () => {
    const client = makeClient({ canDeactivate: true, itemExists: true });
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { deactivateItem } = await import('./deactivate-item');

    await expect(deactivateItem({ id: ITEM_ID, reason: 'discontinued' })).resolves.toEqual({
      ok: true,
      data: { id: ITEM_ID, status: 'blocked' },
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('update public.items'))).toBe(true);
  });
});
