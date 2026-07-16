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

describe('createProject Basics boundary guards (server fail-closed)', () => {
  it('rejects past target launch, zero pack weight, zero packs per case, fractional runs', async () => {
    const pastDate = await createProject({ ...baseInput(), targetLaunch: '2020-01-01' });
    const zeroWeight = await createProject({ ...baseInput(), packWeightG: 0 });
    const zeroPacks = await createProject({ ...baseInput(), packsPerCase: 0 });
    const fractionalRuns = await createProject({ ...baseInput(), runsPerWeek: 2.5 });
    const excessPrecision = await createProject({ ...baseInput(), weeklyVolumePacks: 1234.5678 });

    expect(pastDate).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(zeroWeight).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(zeroPacks).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(fractionalRuns).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(excessPrecision).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('accepts valid boundary values', async () => {
    const result = await createProject({
      ...baseInput(),
      targetLaunch: '2099-12-31',
      packWeightG: 250.5,
      weeklyVolumePacks: 1234.567,
    });
    expect(result.ok).toBe(true);
  });
});
