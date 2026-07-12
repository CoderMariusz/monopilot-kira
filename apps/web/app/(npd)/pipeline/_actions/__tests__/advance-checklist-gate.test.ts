import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

const ctx = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  orgId: '00000000-0000-4000-8000-00000000000a',
  handler: (() => ({ rows: [] })) as Handler,
};

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

import { evaluateStageGate } from '../advance-project-gate';

const G3_AUTO_ITEMS = [
  { item_text: 'Formulation created and locked', completed_at: null },
  { item_text: 'FG candidate created or mapped in system', completed_at: null },
  { item_text: 'Initial shared BOM ready and linked to NPD project', completed_at: null },
];

function satisfiedSignalsQuery() {
  return {
    rows: [
      {
        product_code: 'FG-001',
        recipe_ingredient_count: 2,
        has_locked_formulation: true,
        linked_bom_count: 1,
      },
    ],
  };
}

function unsatisfiedBomSignalsQuery() {
  return {
    rows: [
      {
        product_code: 'FG-001',
        recipe_ingredient_count: 2,
        has_locked_formulation: true,
        linked_bom_count: 0,
      },
    ],
  };
}

describe('evaluateStageGate checklist enforcement (S18 + D1)', () => {
  beforeEach(() => {
    ctx.handler = (sql) => {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (q.includes('from public.npd_projects') && q.includes('for update')) {
        return {
          rows: [
            {
              id: 'proj-1',
              code: 'NPD-001',
              name: 'Test',
              type: 'standard',
              current_gate: 'G3',
              current_stage: 'packaging',
              product_code: 'FG-001',
            },
          ],
        };
      }
      if (q.includes('from public.gate_checklist_items') && q.includes('gci.required = true')) {
        return { rows: G3_AUTO_ITEMS };
      }
      if (q.includes('from public.npd_projects p') && q.includes('linked_bom_count')) {
        return satisfiedSignalsQuery();
      }
      if (q.includes('from public.npd_departments')) return { rows: [] };
      return { rows: [] };
    };
  });

  it('passes G3 advance when auto-satisfiable required items have completed_at NULL but live signals match', async () => {
    const evaluation = await evaluateStageGate('proj-1', 'packaging', 'costing_nutrition', {
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: { query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params) },
    } as never);

    expect(evaluation).toEqual({ status: 'PASS' });
  });

  it('soft-blocks when ingredients exist but no linked BOM (linked_bom_count=0)', async () => {
    ctx.handler = (sql) => {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (q.includes('from public.npd_projects') && q.includes('for update')) {
        return {
          rows: [
            {
              id: 'proj-1',
              code: 'NPD-001',
              name: 'Test',
              type: 'standard',
              current_gate: 'G3',
              current_stage: 'packaging',
              product_code: 'FG-001',
            },
          ],
        };
      }
      if (q.includes('from public.gate_checklist_items') && q.includes('gci.required = true')) {
        return { rows: G3_AUTO_ITEMS };
      }
      if (q.includes('from public.npd_projects p') && q.includes('linked_bom_count')) {
        return unsatisfiedBomSignalsQuery();
      }
      if (q.includes('from public.npd_departments')) return { rows: [] };
      return { rows: [] };
    };

    const evaluation = await evaluateStageGate('proj-1', 'packaging', 'costing_nutrition', {
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: { query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params) },
    } as never);

    expect(evaluation).toEqual({
      status: 'SOFT_GATE_BLOCKED',
      missing: ['Checklist: Initial shared BOM ready and linked to NPD project'],
    });
  });

  it('soft-blocks when a genuinely incomplete non-auto item is required', async () => {
    ctx.handler = (sql) => {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (q.includes('from public.npd_projects') && q.includes('for update')) {
        return {
          rows: [
            {
              id: 'proj-1',
              code: 'NPD-001',
              name: 'Test',
              type: 'standard',
              current_gate: 'G0',
              current_stage: 'brief',
              product_code: null,
            },
          ],
        };
      }
      if (q.includes('from public.gate_checklist_items') && q.includes('gci.required = true')) {
        return {
          rows: [
            { item_text: 'Brief complete', completed_at: null },
            { item_text: 'Stakeholders aligned', completed_at: null },
          ],
        };
      }
      if (q.includes('from public.npd_projects p') && q.includes('linked_bom_count')) {
        return {
          rows: [
            {
              product_code: null,
              recipe_ingredient_count: 0,
              has_locked_formulation: false,
              linked_bom_count: 0,
            },
          ],
        };
      }
      if (q.includes('from public.npd_departments')) return { rows: [] };
      return { rows: [] };
    };

    const evaluation = await evaluateStageGate('proj-1', 'brief', 'recipe', {
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: { query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params) },
    } as never);

    expect(evaluation).toEqual({
      status: 'SOFT_GATE_BLOCKED',
      missing: ['Checklist: Brief complete', 'Checklist: Stakeholders aligned'],
    });
  });
});
