import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

const ctx = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  orgId: '00000000-0000-4000-8000-00000000000a',
  handler: (() => ({ rows: [] })) as Handler,
};

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: {
        query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params),
      },
    }),
}));

import { revalidatePath } from 'next/cache';
import { updateProjectBrief } from '../update-project-brief';

const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const BEFORE = {
  id: PROJECT,
  name: 'Old product',
  type: 'Bakery',
  target_launch: '2026-02-01',
  pack_format: 'Tray',
  pack_weight_g: '250',
  sales_channel: 'Retail',
  expected_volume: '1000 packs',
  target_retail_price_eur: '3.99',
  target_audience: 'Families',
  marketing_claims: 'Source of fibre',
  constraints: 'No nuts',
  notes: 'Old note',
};

const AFTER = {
  ...BEFORE,
  name: 'New product',
  target_launch: '2026-03-01',
  pack_weight_g: '300',
  target_retail_price_eur: '4.25',
  notes: 'Updated note',
};

function handler(opts: { perm?: boolean; found?: boolean; failUpdate?: boolean } = {}): Handler {
  return (sql) => {
    if (sql.includes('from public.user_roles')) {
      return { rows: opts.perm === false ? [] : [{ ok: true }] };
    }
    if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
      return { rows: opts.found === false ? [] : [BEFORE] };
    }
    if (sql.includes('update public.npd_projects')) {
      return { rows: opts.failUpdate ? [] : [AFTER] };
    }
    if (sql.includes('insert into public.audit_events')) return { rows: [] };
    return { rows: [] };
  };
}

beforeEach(() => {
  ctx.handler = handler();
  vi.mocked(revalidatePath).mockClear();
});

describe('updateProjectBrief', () => {
  it('rejects invalid input before DB work', async () => {
    const result = await updateProjectBrief({ projectId: 'not-a-uuid', patch: { productName: 'x' } });
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', status: 400 });
  });

  it('requires at least one patch field', async () => {
    const result = await updateProjectBrief({ projectId: PROJECT, patch: {} });
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', status: 400 });
  });

  it('returns forbidden without npd.core.write', async () => {
    ctx.handler = handler({ perm: false });
    const result = await updateProjectBrief({ projectId: PROJECT, patch: { productName: 'New product' } });
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN', status: 403 });
  });

  it('returns not_found when the project is outside the current org', async () => {
    ctx.handler = handler({ found: false });
    const result = await updateProjectBrief({ projectId: PROJECT, patch: { productName: 'New product' } });
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND', status: 404 });
  });

  it('updates the folded npd_projects brief columns, audits, and revalidates', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      return handler()(sql, params);
    };

    const result = await updateProjectBrief({
      projectId: PROJECT,
      patch: {
        productName: 'New product',
        targetLaunchDate: '2026-03-01',
        packWeightG: '300',
        targetRetailPriceEur: '4.25',
        notes: 'Updated note',
      },
    });

    expect(result).toEqual({ ok: true, data: { projectId: PROJECT } });
    expect(calls.some((call) => /update public\.npd_projects/.test(call.sql))).toBe(true);
    expect(calls.some((call) => /insert into public\.audit_events/.test(call.sql))).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith(`/pipeline/${PROJECT}/brief`);
  });
});
