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

describe('evaluateStageGate checklist enforcement (S18)', () => {
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
              current_gate: 'G0',
              current_stage: 'brief',
              product_code: null,
            },
          ],
        };
      }
      if (q.includes('from public.gate_checklist_items') && q.includes('completed_at is null')) {
        return {
          rows: [{ item_text: 'Brief complete' }, { item_text: 'Stakeholders aligned' }],
        };
      }
      if (q.includes('from public.npd_departments')) return { rows: [] };
      return { rows: [] };
    };
  });

  it('soft-blocks advance when required checklist rows for the current gate are incomplete', async () => {
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
