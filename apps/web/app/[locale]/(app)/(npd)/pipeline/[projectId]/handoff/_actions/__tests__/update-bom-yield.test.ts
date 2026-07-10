import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateBomYield } from '../update-bom-yield';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

const BOM_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '11111111-1111-4111-8111-111111111111';

let client: QueryClient;
let headerStatus = 'active';
let handoffPromotePending = true;
let yieldPctUnset = true;
let allowPermission = true;

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

vi.mock('../get-handoff', () => ({
  hasHandoffPermission: vi.fn(async () => allowPermission),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.startsWith('select bh.id, bh.status')) {
        return { rows: headerStatus ? [{ id: BOM_ID, status: headerStatus }] : [] };
      }
      if (q.includes('handoff_checklists') && q.includes('promote_to_production_date')) {
        const eligible =
          handoffPromotePending || (headerStatus === 'active' && yieldPctUnset);
        return { rows: eligible ? [{ ok: true }] : [] };
      }
      if (q.startsWith('update public.bom_headers') && q.includes('yield_pct')) {
        return { rows: [{ id: BOM_ID }] };
      }
      if (q.startsWith('insert into public.audit_events')) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

describe('updateBomYield', () => {
  beforeEach(() => {
    allowPermission = true;
    headerStatus = 'active';
    handoffPromotePending = true;
    yieldPctUnset = true;
    client = makeClient();
  });

  it('updates yield on an NPD handoff BOM before promote completes', async () => {
    const result = await updateBomYield({ bomHeaderId: BOM_ID, yieldPct: 96 });

    expect(result).toEqual({ ok: true });
  });

  it('allows yield save after promote when yield_pct is still unset (post-promote prompt window)', async () => {
    handoffPromotePending = false;
    yieldPctUnset = true;

    const result = await updateBomYield({ bomHeaderId: BOM_ID, yieldPct: 96 });

    expect(result).toEqual({ ok: true });
    const eligibility = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => normalize(String(sql)).includes('handoff_checklists'));
    expect(normalize(String(eligibility?.[0]))).toContain('bh.yield_pct is null');
  });

  it('refuses yield edits on a promoted ACTIVE BOM once yield_pct is set', async () => {
    handoffPromotePending = false;
    yieldPctUnset = false;

    const result = await updateBomYield({ bomHeaderId: BOM_ID, yieldPct: 96 });

    expect(result).toEqual({ ok: false, code: 'active_bom_requires_eco' });
    const yieldUpdate = vi
      .mocked(client.query)
      .mock.calls.find(
        ([sql]) =>
          normalize(String(sql)).startsWith('update public.bom_headers') &&
          normalize(String(sql)).includes('yield_pct'),
      );
    expect(yieldUpdate).toBeUndefined();
  });

  it('allows yield edits on draft headers', async () => {
    headerStatus = 'draft';
    handoffPromotePending = false;
    yieldPctUnset = false;

    const result = await updateBomYield({ bomHeaderId: BOM_ID, yieldPct: 96 });

    expect(result).toEqual({ ok: true });
  });
});
