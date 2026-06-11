/**
 * W9-L6 — NPD gate-machine honesty (audit F-C09 + clickthrough §3).
 *
 * 1. The gates timeline / advance modal must derive their forward claims from the
 *    STAGE machine (advanceTransitionForStage), never from static per-gate metadata.
 *    VERDICT on the "G0→G2, G1 unreachable" finding: INTENDED SKIP — the 2026-06-06
 *    stage-pivot comment in gate-helpers.ts explicitly collapses G1 (Feasibility)
 *    into the brief stage ("The FIRST advance (brief→recipe) moves gate G0→G2 …
 *    G1 is collapsed into the brief stage"). These tests pin the honest claims:
 *    G1 is NEVER a forward advance target from any stage.
 *
 * 2. advanceProjectGate's terminal short-circuit (ALREADY_CLOSED) used to return
 *    ok:false with status 200 — a silent fail when clicked live. It must now carry
 *    an honest 409 so no caller can mistake it for success.
 */
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

import {
  STAGE_ORDER,
  advanceTransitionForStage,
  gateForStage,
  nextStage,
} from '../_lib/gate-helpers';
import { advanceProjectGate } from '../advance-project-gate';

describe('advanceTransitionForStage — the single honest source for "advance to …" claims', () => {
  it('brief (gate G0) advances to recipe which derives G2 — G1 is the intended skip', () => {
    const transition = advanceTransitionForStage('brief');
    expect(transition).toEqual({
      nextStage: 'recipe',
      targetGate: 'G2',
      requiresESign: false,
    });
  });

  it('G1 is NEVER a forward advance target from any stage (gates timeline honesty)', () => {
    const allStages = [...STAGE_ORDER, 'launched'];
    for (const stage of allStages) {
      const transition = advanceTransitionForStage(stage);
      if (transition) {
        expect(transition.targetGate).not.toBe('G1');
        // …and never G0 either: forward derivation starts at G2.
        expect(transition.targetGate).not.toBe('G0');
      }
    }
  });

  it('stage steps inside G3 keep the gate at G3 (packaging→trial→sensory→pilot)', () => {
    expect(advanceTransitionForStage('packaging')?.targetGate).toBe('G3');
    expect(advanceTransitionForStage('trial')?.targetGate).toBe('G3');
    expect(advanceTransitionForStage('sensory')?.targetGate).toBe('G3');
    // pilot → approval crosses into G4.
    expect(advanceTransitionForStage('pilot')?.targetGate).toBe('G4');
  });

  it('only approval→handoff is the enforced e-sign checkpoint', () => {
    const allStages = [...STAGE_ORDER, 'launched'];
    for (const stage of allStages) {
      const transition = advanceTransitionForStage(stage);
      if (!transition) continue;
      expect(transition.requiresESign).toBe(stage === 'approval');
    }
  });

  it('handoff advances to the terminal launched stage; launched has no transition', () => {
    expect(advanceTransitionForStage('handoff')).toEqual({
      nextStage: 'launched',
      targetGate: 'Launched',
      requiresESign: false,
    });
    expect(advanceTransitionForStage('launched')).toBeNull();
    expect(advanceTransitionForStage('not-a-stage')).toBeNull();
  });

  it('stays consistent with nextStage/gateForStage (no second source of truth)', () => {
    for (const stage of STAGE_ORDER) {
      const transition = advanceTransitionForStage(stage);
      expect(transition?.nextStage).toBe(nextStage(stage));
      expect(transition?.targetGate).toBe(gateForStage(nextStage(stage)!));
    }
  });
});

describe('advanceProjectGate — ALREADY_CLOSED is an honest failure (F-C09)', () => {
  const PROJECT = '00000000-0000-4000-8000-0000000000b1';

  beforeEach(() => {
    ctx.handler = () => ({ rows: [] });
  });

  it('returns ok:false with status 409 (NOT the old silent 200) on a launched project', async () => {
    ctx.handler = (sql) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [
            {
              id: PROJECT,
              code: 'NPD-001',
              name: 'Launched thing',
              type: 'single',
              current_gate: 'Launched',
              current_stage: 'launched',
              product_code: 'FG-NPD-001',
            },
          ],
        };
      }
      return { rows: [] };
    };

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'launched' });
    expect(result).toEqual({ ok: false, error: 'ALREADY_CLOSED', status: 409 });
  });

  it('rejects a non-adjacent stage jump with ADJACENCY_VIOLATION 422 (surfaced, never silent)', async () => {
    ctx.handler = (sql) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [
            {
              id: PROJECT,
              code: 'NPD-002',
              name: 'Brief thing',
              type: 'single',
              current_gate: 'G0',
              current_stage: 'brief',
              product_code: null,
            },
          ],
        };
      }
      return { rows: [] };
    };

    // brief's only legal target is 'recipe' — jumping to 'packaging' must fail loudly.
    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'packaging' });
    expect(result).toMatchObject({ ok: false, error: 'ADJACENCY_VIOLATION', status: 422 });
  });
});
