import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  orgId: '00000000-0000-4000-8000-00000000000a',
  handler: (() => ({ rows: [] })) as (sql: string, params?: readonly unknown[]) => { rows: unknown[] },
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
    if (sql.includes('insert into public.org_sequences')) return { rows: [{ next_value: '12' }] };
    if (sql.includes('from public.npd_projects') && sql.includes('and code =')) return { rows: [] };
    if (sql.includes('insert into public.npd_projects')) return { rows: [{ id: 'proj-1', code: 'NPD-012' }] };
    if (sql.includes('insert into public.gate_checklist_items')) return { rows: [{ inserted_count: '1' }] };
    if (sql.includes('from public.product')) return { rows: [] };
    if (sql.includes('insert into public.product')) return { rows: [{ product_code: 'FG-012' }] };
    if (sql.includes('update public.npd_projects') && sql.includes('product_code')) return { rows: [] };
    if (sql.includes('from public.formulations')) return { rows: [] };
    if (sql.includes('insert into public.formulations')) return { rows: [{ id: 'form-1' }] };
    if (sql.includes('from public.formulation_versions')) return { rows: [{ n: 1 }] };
    if (sql.includes('insert into public.formulation_versions')) return { rows: [{ id: 'ver-1' }] };
    if (sql.includes('update public.formulations')) return { rows: [] };
    if (sql.includes('insert into public.outbox_events')) return { rows: [] };
    return { rows: [] };
  };
});

describe('createProject blank recipe bootstrap (S23)', () => {
  it('seeds brief stage (G0), FG product code, and formulation header for blank starts', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('insert into public.org_sequences')) return { rows: [{ next_value: '12' }] };
      if (sql.includes('from public.npd_projects') && sql.includes('and code =')) return { rows: [] };
      if (sql.includes('insert into public.npd_projects')) return { rows: [{ id: 'proj-1', code: 'NPD-012' }] };
      if (sql.includes('insert into public.gate_checklist_items')) return { rows: [{ inserted_count: '1' }] };
      if (sql.includes('from public.product')) return { rows: [] };
      if (sql.includes('insert into public.product')) return { rows: [{ product_code: 'FG-012' }] };
      if (sql.includes('update public.npd_projects') && sql.includes('product_code')) return { rows: [] };
      if (sql.includes('from public.formulations')) return { rows: [] };
      if (sql.includes('insert into public.formulations')) return { rows: [{ id: 'form-1' }] };
      if (sql.includes('from public.formulation_versions')) return { rows: [{ n: 1 }] };
      if (sql.includes('insert into public.formulation_versions')) return { rows: [{ id: 'ver-1' }] };
      if (sql.includes('update public.formulations')) return { rows: [] };
      if (sql.includes('insert into public.outbox_events')) return { rows: [] };
      return { rows: [] };
    };

    const result = await createProject(baseInput());

    expect(result.ok).toBe(true);
    const projectInsert = calls.find((call) => call.sql.includes('insert into public.npd_projects'));
    expect(projectInsert?.params).toContain('brief');
    const productInsert = calls.find((call) => call.sql.includes('insert into public.product'));
    expect(productInsert?.params?.[0]).toBe('FG-012');
    const formulationInsert = calls.find((call) => call.sql.includes('insert into public.formulations'));
    expect(formulationInsert?.params?.[1]).toBe('FG-012');
  });

  it('allocates the next free FG code when the derived code belongs to another project', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('insert into public.org_sequences')) return { rows: [{ next_value: '12' }] };
      if (sql.includes('from public.npd_projects') && sql.includes('and code =')) return { rows: [] };
      if (sql.includes('from public.npd_projects') && sql.includes('product_code =')) {
        return params?.[1] === 'FG-012' ? { rows: [{ id: 'other-project' }] } : { rows: [] };
      }
      if (sql.includes('from public.formulations') && sql.includes('product_code =')) return { rows: [] };
      if (sql.includes('insert into public.npd_projects')) return { rows: [{ id: 'proj-1', code: 'NPD-012' }] };
      if (sql.includes('insert into public.gate_checklist_items')) return { rows: [{ inserted_count: '1' }] };
      if (sql.includes('from public.product')) return { rows: [] };
      if (sql.includes('insert into public.product')) return { rows: [{ product_code: 'FG-013' }] };
      if (sql.includes('update public.npd_projects') && sql.includes('product_code')) return { rows: [] };
      if (sql.includes('from public.formulations') && !sql.includes('product_code =')) return { rows: [] };
      if (sql.includes('insert into public.formulations')) return { rows: [{ id: 'form-1' }] };
      if (sql.includes('from public.formulation_versions')) return { rows: [{ n: 1 }] };
      if (sql.includes('insert into public.formulation_versions')) return { rows: [{ id: 'ver-1' }] };
      if (sql.includes('update public.formulations')) return { rows: [] };
      if (sql.includes('insert into public.outbox_events')) return { rows: [] };
      return { rows: [] };
    };

    const result = await createProject(baseInput());

    expect(result.ok).toBe(true);
    const productInsert = calls.find((call) => call.sql.includes('insert into public.product'));
    expect(productInsert?.params?.[0]).toBe('FG-013');
    const formulationInsert = calls.find((call) => call.sql.includes('insert into public.formulations'));
    expect(formulationInsert?.params?.[1]).toBe('FG-013');
  });
});
