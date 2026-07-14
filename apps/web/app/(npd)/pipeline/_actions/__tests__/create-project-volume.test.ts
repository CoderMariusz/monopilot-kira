import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

const ctx = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  orgId: '00000000-0000-4000-8000-00000000000a',
  handler: (() => ({ rows: [] })) as Handler,
};

vi.mock('../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
vi.mock('../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
  hasAnyPermission: vi.fn(async () => true),
}));
vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: {
        query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params),
      },
    }),
}));

import { createProject } from '../create-project';

function baseInput() {
  return {
    name: 'Sliced Ham 200g',
    type: 'Meat',
    prio: 'normal' as const,
    owner: null,
    targetLaunch: null,
    notes: null,
    packFormat: null,
    packWeightG: 200,
    packsPerCase: 12,
    outputUnit: 'pieces' as const,
    weeklyVolumePacks: 5000,
    runsPerWeek: 3,
    salesChannel: 'Retail',
    targetRetailPriceEur: null,
    targetAudience: null,
    marketingClaims: null,
    constraints: null,
    startFrom: 'blank' as const,
    cloneSource: null,
    templateId: 'APEX_DEFAULT',
  };
}

beforeEach(() => {
  ctx.handler = (sql) => {
    if (sql.includes('insert into public.org_sequences')) return { rows: [{ next_value: '1' }] };
    if (sql.includes('from public.npd_projects') && sql.includes('and code =')) return { rows: [] };
    if (sql.includes('insert into public.npd_projects')) {
      return { rows: [{ id: '00000000-0000-4000-8000-0000000000c1', code: 'NPD-001' }] };
    }
    if (sql.includes('insert into public.gate_checklist_items')) return { rows: [{ inserted_count: '1' }] };
    if (sql.includes('from public.formulations')) return { rows: [] };
    if (sql.includes('insert into public.formulations')) return { rows: [{ id: 'form-1' }] };
    if (sql.includes('from public.formulation_versions')) return { rows: [{ n: 1 }] };
    if (sql.includes('insert into public.formulation_versions')) return { rows: [{ id: 'ver-1' }] };
    if (sql.includes('update public.formulations')) return { rows: [] };
    if (sql.includes('insert into public.outbox_events')) return { rows: [] };
    return { rows: [] };
  };
});

describe('createProject weekly volume / runs per week', () => {
  it('rejects weeklyVolumePacks = -1', async () => {
    const result = await createProject({ ...baseInput(), weeklyVolumePacks: -1 });
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('rejects runsPerWeek = 0', async () => {
    const result = await createProject({ ...baseInput(), runsPerWeek: 0 });
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('rejects missing weekly volume / runs', async () => {
    const missingVol = await createProject({ ...baseInput(), weeklyVolumePacks: null });
    const missingRuns = await createProject({ ...baseInput(), runsPerWeek: null });
    expect(missingVol).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(missingRuns).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('accepts weeklyVolumePacks > 0 and runsPerWeek ≥ 1', async () => {
    const result = await createProject(baseInput());
    expect(result.ok).toBe(true);
  });
});
