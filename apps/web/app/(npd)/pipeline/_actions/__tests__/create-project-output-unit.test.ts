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
    if (sql.includes('insert into public.gate_checklist_items') || sql.includes('insert into public.gate_checklist_items')) {
      return { rows: [{ inserted_count: '1' }] };
    }
    if (sql.includes('from public.formulations')) return { rows: [] };
    if (sql.includes('insert into public.formulations')) return { rows: [{ id: 'form-1' }] };
    if (sql.includes('from public.formulation_versions')) return { rows: [{ n: 1 }] };
    if (sql.includes('insert into public.formulation_versions')) return { rows: [{ id: 'ver-1' }] };
    if (sql.includes('update public.formulations')) return { rows: [] };
    if (sql.includes('insert into public.outbox_events')) return { rows: [] };
    return { rows: [] };
  };
});

describe('createProject output_unit', () => {
  it('persists output_unit on insert', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('insert into public.org_sequences')) return { rows: [{ next_value: '1' }] };
      if (sql.includes('from public.npd_projects') && sql.includes('and code =')) return { rows: [] };
      if (sql.includes('from public.npd_projects') && sql.includes('draft_product_code')) return { rows: [] };
      if (sql.includes('from public.npd_projects') && sql.includes('id <>')) return { rows: [] };
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
      if (sql.includes('update public.npd_projects')) return { rows: [] };
      if (sql.includes('insert into public.products') || sql.includes('from public.products')) return { rows: [] };
      if (sql.includes('insert into public.product') || sql.includes('from public.product')) {
        return sql.includes('insert') ? { rows: [{ product_code: 'FG-001' }] } : { rows: [] };
      }
      return { rows: [] };
    };

    const result = await createProject(baseInput());
    if (!result.ok) {
      throw new Error(`createProject failed: ${result.error}`);
    }

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ code: 'NPD-001' }),
    });
    const insert = calls.find((call) => /insert into public\.npd_projects/.test(call.sql));
    expect(insert?.params).toContain('pieces');
  });

  it('rejects boxes output unit without pack factors', async () => {
    const result = await createProject({
      ...baseInput(),
      outputUnit: 'boxes',
      packWeightG: null,
      packsPerCase: null,
    });
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
});
