import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFirstWarehouse } from './create-first-warehouse';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '33333333-3333-4333-8333-333333333333';
const WAREHOUSE_ID = '44444444-4444-4444-8444-444444444444';

const state = vi.hoisted(() => ({
  activeSites: [] as Array<{ id: string; is_default: boolean }>,
  queries: [] as Array<{ sql: string; params: readonly unknown[] }>,
  mutateOnboarding: vi.fn(async () => ({ ok: true })),
}));

const client = {
  query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    state.queries.push({ sql, params });
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.includes('from public.organizations')) {
      return { rows: [{ onboarding_completed_at: null }], rowCount: 1 };
    }
    if (normalized.includes('from public.sites')) {
      const rows = normalized.includes('and is_default')
        ? state.activeSites.filter((site) => site.is_default)
        : state.activeSites;
      return { rows, rowCount: rows.length };
    }
    if (normalized.startsWith('insert into public.warehouses')) {
      return { rows: [{ id: WAREHOUSE_ID, org_id: ORG_ID }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
};

vi.mock('./advance', () => ({
  hasOnboardingPermission: vi.fn(async () => true),
  mutateOnboarding: state.mutateOnboarding,
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

beforeEach(() => {
  state.activeSites = [{ id: SITE_ID, is_default: true }];
  state.queries = [];
  state.mutateOnboarding.mockClear();
  client.query.mockClear();
});

describe('createFirstWarehouse site stamping', () => {
  it('persists the resolved site on the onboarding warehouse', async () => {
    const result = await createFirstWarehouse({
      orgId: ORG_ID,
      name: 'Raw materials',
      code: 'RAW',
      type: 'raw',
    });

    expect(result).toMatchObject({ ok: true, warehouse: { id: WAREHOUSE_ID } });
    const insert = state.queries.find(({ sql }) =>
      sql.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('insert into public.warehouses'),
    );
    expect(insert?.sql.replace(/\s+/g, ' ').toLowerCase()).toContain(
      '(org_id, site_id, code, name, warehouse_type, address)',
    );
    expect(insert?.params).toEqual([SITE_ID, 'RAW', 'Raw materials', 'raw', null]);
  });

  it('refuses before insert and onboarding advance when no site can be resolved', async () => {
    state.activeSites = [];

    const result = await createFirstWarehouse({
      orgId: ORG_ID,
      name: 'Raw materials',
      code: 'RAW',
      type: 'raw',
    });

    expect(result).toEqual({
      ok: false,
      error: 'PERSISTENCE_FAILED',
      message: 'No active site is available. Create or activate a site before creating a warehouse.',
    });
    expect(
      state.queries.some(({ sql }) =>
        sql.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('insert into public.warehouses'),
      ),
    ).toBe(false);
    expect(state.mutateOnboarding).not.toHaveBeenCalled();
  });
});
