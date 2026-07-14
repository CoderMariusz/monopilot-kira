import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));

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

import { revalidateLocalized } from '../../../../../../../../../lib/i18n/revalidate-localized';
import { updateProjectBrief } from '../update-project-brief';

const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const BEFORE = {
  id: PROJECT,
  name: 'Old product',
  type: 'Bakery',
  target_launch: '2026-02-01',
  pack_format: 'Tray',
  pack_weight_g: '250',
  packs_per_case: 12,
  output_unit: null,
  sales_channel: 'Retail',
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
  vi.mocked(revalidateLocalized).mockClear();
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

  it('persists weekly_volume_packs and runs_per_week in the brief patch', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      return handler()(sql, params);
    };

    const result = await updateProjectBrief({
      projectId: PROJECT,
      patch: { weeklyVolumePacks: '12000', runsPerWeek: '3.5' },
    });

    expect(result).toEqual({ ok: true, data: { projectId: PROJECT } });
    const update = calls.find((c) => /update public\.npd_projects/.test(c.sql));
    expect(update?.params).toContain('12000');
    expect(update?.params).toContain('3.5');
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
    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith(`/pipeline/${PROJECT}/brief`);
  });

  it('renames the linked FG product with the project brief', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      return handler()(sql, params);
    };

    const result = await updateProjectBrief({
      projectId: PROJECT,
      patch: { productName: 'New product' },
    });

    expect(result).toEqual({ ok: true, data: { projectId: PROJECT } });
    const productRename = calls.find((call) => /update public\.items/.test(call.sql));
    expect(productRename?.sql).toContain('npd_projects');
    expect(productRename?.sql).toContain('app.current_org_id()');
    expect(productRename?.params).toEqual([PROJECT, 'New product']);
  });

  it('re-syncs FG net_qty_per_each and output_uom when pack weight changes post-handoff', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('update public.npd_projects')) {
        return {
          rows: [
            {
              ...AFTER,
              pack_weight_g: '400',
              packs_per_case: 12,
              output_unit: 'pieces',
            },
          ],
        };
      }
      return handler()(sql, params);
    };

    const result = await updateProjectBrief({
      projectId: PROJECT,
      patch: { packWeightG: '400', outputUnit: 'pieces' },
    });

    expect(result).toEqual({ ok: true, data: { projectId: PROJECT } });
    const fgSync = calls.find(
      (call) =>
        /update public\.items/.test(call.sql) &&
        call.sql.includes('net_qty_per_each') &&
        call.sql.includes('output_uom'),
    );
    expect(fgSync?.params).toEqual([PROJECT, 'each', 0.4]);
    const baseUpgrade = calls.find(
      (call) => /update public\.items/.test(call.sql) && call.sql.includes("output_uom = 'each'") && call.sql.includes("output_uom = 'base'"),
    );
    expect(baseUpgrade?.params).toEqual([PROJECT]);
  });

  it('rejects boxes output unit without pack factors before persisting', async () => {
    const result = await updateProjectBrief({
      projectId: PROJECT,
      patch: { outputUnit: 'boxes', packWeightG: null, packsPerCase: 0 },
    });
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', status: 400 });
  });
});
