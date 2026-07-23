/**
 * W9-L6 + C025 — NPD gate-machine honesty.
 *
 * Pins the real G0→G1→G2→G3 sequence, a single resolveGateReadiness selector shared by
 * UI and advanceProjectGate, and rejection of every multi-gate skip.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: 'sig-fc1',
    signedAt: '2026-07-05T10:00:00.000Z',
  })),
}));

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
  assertHonestGateAdvance,
  nextHonestGate,
  nextStage,
  previewGateStageSkewRepairs,
  repairGateStageSkew,
  resolveAdvanceTransition,
  resolveGateReadiness,
} from '../_lib/gate-helpers';
import { advanceProjectGate } from '../advance-project-gate';
import { approveProjectGate } from '../approve-project-gate';

const G0_BRIEF = { current_gate: 'G0' as const, current_stage: 'brief' };
const G1_BRIEF = { current_gate: 'G1' as const, current_stage: 'brief' };
const G2_RECIPE = { current_gate: 'G2' as const, current_stage: 'recipe' };

describe('resolveGateReadiness — single selector for UI + advance validation', () => {
  it('G0+brief: current/checklist G0, advance target G1 on brief (gate-only)', () => {
    const readiness = resolveGateReadiness(G0_BRIEF);
    expect(readiness.currentGate).toBe('G0');
    expect(readiness.checklistGate).toBe('G0');
    expect(readiness.advance).toEqual({
      kind: 'gate',
      nextStage: 'brief',
      targetGate: 'G1',
      requiresESign: false,
    });
  });

  it('G1+brief: current/checklist G1, advance target G2 via recipe', () => {
    const readiness = resolveGateReadiness(G1_BRIEF);
    expect(readiness.currentGate).toBe('G1');
    expect(readiness.checklistGate).toBe('G1');
    expect(readiness.advance).toEqual({
      kind: 'stage',
      nextStage: 'recipe',
      targetGate: 'G2',
      requiresESign: false,
    });
  });

  it('G2+recipe: current/checklist G2, advance target G3 via packaging', () => {
    const readiness = resolveGateReadiness(G2_RECIPE);
    expect(readiness.currentGate).toBe('G2');
    expect(readiness.checklistGate).toBe('G2');
    expect(readiness.advance).toEqual({
      kind: 'stage',
      nextStage: 'packaging',
      targetGate: 'G3',
      requiresESign: false,
    });
  });

  it('rejects G0→G2 and G0→G3 as advance targets from brief', () => {
    expect(() => assertHonestGateAdvance(G0_BRIEF, 'recipe')).toThrowError(
      expect.objectContaining({ code: 'ADJACENCY_VIOLATION', status: 422 }),
    );
    expect(() => assertHonestGateAdvance(G0_BRIEF, 'packaging')).toThrowError(
      expect.objectContaining({ code: 'ADJACENCY_VIOLATION', status: 422 }),
    );
  });

  it('stage steps inside G3 keep the gate at G3 until pilot→approval', () => {
    expect(resolveAdvanceTransition({ current_gate: 'G3', current_stage: 'packaging' })?.targetGate).toBe('G3');
    expect(resolveAdvanceTransition({ current_gate: 'G3', current_stage: 'trial' })?.targetGate).toBe('G3');
    expect(resolveAdvanceTransition({ current_gate: 'G3', current_stage: 'sensory' })?.targetGate).toBe('G3');
    expect(resolveAdvanceTransition({ current_gate: 'G3', current_stage: 'pilot' })?.targetGate).toBe('G4');
  });

  it('only approval→handoff is the enforced e-sign checkpoint', () => {
    for (const stage of [...STAGE_ORDER, 'launched']) {
      const transition = resolveAdvanceTransition({
        current_gate: stage === 'brief' ? 'G1' : 'G3',
        current_stage: stage,
      });
      if (!transition) continue;
      expect(transition.requiresESign).toBe(stage === 'approval');
    }
  });
});

describe('nextHonestGate + assertHonestGateAdvance — C025 sequence guard', () => {
  it('advances one gate at a time: G0→G1→G2→G3', () => {
    expect(nextHonestGate('G0')).toBe('G1');
    expect(nextHonestGate('G1')).toBe('G2');
    expect(nextHonestGate('G2')).toBe('G3');
    expect(nextHonestGate('G3')).toBe('G4');
  });

  it('allows G0+brief→brief/G1 (gate-only)', () => {
    expect(() => assertHonestGateAdvance(G0_BRIEF, 'brief')).not.toThrow();
  });

  it('allows G1+brief→recipe/G2', () => {
    expect(() => assertHonestGateAdvance(G1_BRIEF, 'recipe')).not.toThrow();
  });

  it('throws GATE_STATE_MISMATCH for the blank-project G0+recipe skew', () => {
    expect(() =>
      assertHonestGateAdvance(
        { current_gate: 'G0', current_stage: 'recipe' },
        'packaging',
      ),
    ).toThrowError(expect.objectContaining({ code: 'GATE_STATE_MISMATCH', status: 409 }));
  });
});

describe('advanceProjectGate — C025 gate sequence end-to-end', () => {
  const PROJECT = '00000000-0000-4000-8000-0000000000f1';

  beforeEach(() => {
    ctx.handler = () => ({ rows: [] });
  });

  function mockProject(row: Record<string, unknown>) {
    ctx.handler = (sql) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return { rows: [row] };
      }
      if (sql.includes('from public.npd_departments')) return { rows: [] };
      if (sql.includes('gate_checklist_items')) return { rows: [] };
      return { rows: [] };
    };
  }

  it('rejects G0+brief→recipe (G0→G2 skip)', async () => {
    mockProject({
      id: PROJECT,
      code: 'NPD-SKIP-G2',
      name: 'Skip G1',
      type: 'single',
      current_gate: 'G0',
      current_stage: 'brief',
      product_code: null,
    });

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'recipe' });
    expect(result).toMatchObject({ ok: false, error: 'ADJACENCY_VIOLATION', status: 422 });
  });

  it('rejects G0+brief→packaging (G0→G3 skip)', async () => {
    mockProject({
      id: PROJECT,
      code: 'NPD-SKIP-G3',
      name: 'Skip G1/G2',
      type: 'single',
      current_gate: 'G0',
      current_stage: 'brief',
      product_code: null,
    });

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'packaging' });
    expect(result).toMatchObject({ ok: false, error: 'ADJACENCY_VIOLATION', status: 422 });
  });

  it('rejects the blank-project G0+recipe bypass (GATE_STATE_MISMATCH)', async () => {
    const calls: string[] = [];
    ctx.handler = (sql) => {
      calls.push(sql);
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-C025',
            name: 'Blank bypass project',
            type: 'single',
            current_gate: 'G0',
            current_stage: 'recipe',
            product_code: null,
          }],
        };
      }
      return { rows: [] };
    };

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'packaging' });
    expect(result).toEqual({ ok: false, error: 'GATE_STATE_MISMATCH', status: 409 });
    expect(calls.some((sql) => /update public\.npd_projects/.test(sql))).toBe(false);
  });

  it('G0→G1 gate advance validates G0 checklist then lands on G1+brief', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-G01',
            name: 'G0 project',
            type: 'single',
            current_gate: 'G0',
            current_stage: 'brief',
            product_code: null,
          }],
        };
      }
      if (sql.includes('gate_checklist_items') && sql.includes("'G0'")) {
        return { rows: [{ item_text: 'G0 required item', completed_at: '2026-01-01' }] };
      }
      if (sql.includes('from public.npd_departments')) return { rows: [] };
      return { rows: [] };
    };

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'brief' });
    expect(result).toMatchObject({
      ok: true,
      data: { currentGate: 'G1', currentStage: 'brief', previousGate: 'G0' },
    });
    const gateUpdate = calls.find((call) => /update public\.npd_projects/.test(call.sql) && call.sql.includes('current_gate = $2'));
    expect(gateUpdate?.params).toEqual([PROJECT, 'G1']);
  });

  it('G1→G2 stage advance validates G1 checklist then lands on G2+recipe', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-G12',
            name: 'G1 project',
            type: 'single',
            current_gate: 'G1',
            current_stage: 'brief',
            product_code: null,
          }],
        };
      }
      if (sql.includes('gate_checklist_items') && sql.includes("'G1'")) {
        return { rows: [{ item_text: 'G1 required item', completed_at: '2026-01-01' }] };
      }
      if (sql.includes('from public.npd_departments')) return { rows: [] };
      return { rows: [] };
    };

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'recipe' });
    expect(result).toMatchObject({
      ok: true,
      data: { currentGate: 'G2', currentStage: 'recipe', previousGate: 'G1' },
    });
    const stageUpdate = calls.find((call) => /update public\.npd_projects/.test(call.sql) && call.sql.includes('current_stage = $2'));
    expect(stageUpdate?.params).toEqual([PROJECT, 'recipe', 'G2']);
  });
});

describe('previewGateStageSkewRepairs + repairGateStageSkew — data-fix path', () => {
  it('previews G0+recipe skew and repairs to G0+brief', async () => {
    const skewId = '00000000-0000-4000-8000-0000000000c1';
    ctx.handler = (sql) => {
      if (sql.includes('from public.npd_projects') && sql.includes('current_gate <>')) {
        return {
          rows: [{
            id: skewId,
            code: 'NPD-SKEW',
            name: 'Skewed blank project',
            current_gate: 'G0',
            current_stage: 'recipe',
          }],
        };
      }
      if (sql.includes('update public.npd_projects')) return { rows: [] };
      return { rows: [] };
    };

    const preview = await previewGateStageSkewRepairs({
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: { query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params) },
    } as never);

    expect(preview).toEqual([{
      id: skewId,
      code: 'NPD-SKEW',
      name: 'Skewed blank project',
      current_gate: 'G0',
      current_stage: 'recipe',
      repair_gate: 'G0',
      repair_stage: 'brief',
      reason: 'G0 gate requires brief stage — reset skewed stage so G0→G1→G2 can run',
    }]);

    const dryRun = await repairGateStageSkew({
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: { query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params) },
    } as never, { dryRun: true });
    expect(dryRun.repairedIds).toEqual([skewId]);
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
});

describe('advanceProjectGate — ONE gate system soft and hard gates', () => {
  const PROJECT = '00000000-0000-4000-8000-0000000000d1';

  beforeEach(() => {
    ctx.handler = () => ({ rows: [] });
  });

  it('returns BLOCKERS_PRESENT when required stage fields are missing', async () => {
    const calls: string[] = [];
    ctx.handler = (sql) => {
      calls.push(sql);
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-SOFT-001',
            name: 'Soft gate project',
            type: 'single',
            current_gate: 'G3',
            current_stage: 'packaging',
            product_code: 'FG-SOFT-001',
          }],
        };
      }
      if (sql.includes('from public.npd_departments')) {
        return {
          rows: [{
            dept_code: 'PKG',
            dept_name: 'Packaging',
            field_code: 'box',
            field_label: 'Box',
            auto_source_field: null,
            product_json: {},
          }],
        };
      }
      return { rows: [] };
    };

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'costing_nutrition' });
    expect(result).toEqual({
      ok: false,
      error: 'BLOCKERS_PRESENT',
      status: 409,
      blockers: [{
        code: 'REQUIRED_EVIDENCE_MISSING',
        message: 'Packaging: Box',
        itemText: 'Packaging: Box',
      }],
    });
    expect(calls.some((sql) => /update public\.npd_projects/.test(sql))).toBe(false);
  });

  it('F6.1 regression: G1+brief advance PASSES when required Core values live on the project', async () => {
    const calls: string[] = [];
    const projectJson = {
      name: 'E2E Pre-FG product',
      pack_size: '250g',
      field_values: { recipe_components: 'RM1' },
    };
    ctx.handler = (sql) => {
      calls.push(sql);
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-PREFG-001',
            name: 'E2E Pre-FG product',
            type: 'single',
            current_gate: 'G1',
            current_stage: 'brief',
            product_code: null,
          }],
        };
      }
      if (sql.includes('from public.npd_departments')) {
        return {
          rows: [
            { dept_code: 'Core', dept_name: 'Core', field_code: 'Product_Name', field_label: 'Product Name', auto_source_field: null, product_json: null, project_json: projectJson },
            { dept_code: 'Core', dept_name: 'Core', field_code: 'Pack_Size', field_label: 'Pack Size', auto_source_field: null, product_json: null, project_json: projectJson },
            { dept_code: 'Core', dept_name: 'Core', field_code: 'Recipe_Components', field_label: 'Recipe Components', auto_source_field: null, product_json: null, project_json: projectJson },
          ],
        };
      }
      if (sql.includes('gate_checklist_items')) return { rows: [] };
      return { rows: [] };
    };

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'recipe' });
    expect(result).toMatchObject({ ok: true, data: { currentGate: 'G2', currentStage: 'recipe' } });
    expect(calls.some((sql) => /insert into public\.audit_log/.test(sql))).toBe(false);
  });

  it('does not allow override of a hard recipe ingredient gate', async () => {
    const calls: string[] = [];
    ctx.handler = (sql) => {
      calls.push(sql);
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-HARD-001',
            name: 'Hard gate project',
            type: 'single',
            current_gate: 'G2',
            current_stage: 'recipe',
            product_code: null,
          }],
        };
      }
      if (sql.includes('count(fi.id)::text as n')) return { rows: [{ n: '0' }] };
      return { rows: [] };
    };

    const result = await advanceProjectGate({
      projectId: PROJECT,
      targetStage: 'packaging',
      override: { note: 'This must not bypass recipe ingredients.' },
    });
    expect(result).toMatchObject({
      ok: false,
      error: 'BLOCKERS_PRESENT',
      status: 409,
      blockers: [{ code: 'RECIPE_INGREDIENTS_REQUIRED' }],
    });
    expect(calls.some((sql) => /insert into public\.audit_log/.test(sql))).toBe(false);
    expect(calls.some((sql) => /update public\.npd_projects/.test(sql))).toBe(false);
  });
});

describe('approveProjectGate — FC1 approval completion advances the project', () => {
  const PROJECT = '00000000-0000-4000-8000-0000000005b1';

  beforeEach(() => {
    ctx.handler = () => ({ rows: [] });
  });

  it('records G3 e-sign from packaging without skipping to approval (adjacency enforced)', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-032',
            name: 'FC1 approval project',
            type: 'standard',
            current_gate: 'G3',
            current_stage: 'packaging',
            product_code: 'FG-NPD-032',
          }],
        };
      }
      if (sql.includes('insert into public.gate_approvals')) {
        return { rows: [{ id: '00000000-0000-4000-8000-0000000005a1' }] };
      }
      return { rows: [] };
    };

    const result = await approveProjectGate({
      projectId: PROJECT,
      gateCode: 'G3',
      decision: 'approved',
      notes: 'All approval criteria satisfied.',
      password: '123456',
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        approvedGate: 'G3',
        currentGate: 'G3',
        currentStage: 'packaging',
      },
    });
    expect(calls.some((call) => /update public\.npd_projects/.test(call.sql))).toBe(false);
  });

  it('advances pilot→approval when G3 is approved at the adjacent stage', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-032',
            name: 'FC1 approval project',
            type: 'standard',
            current_gate: 'G3',
            current_stage: 'pilot',
            product_code: 'FG-NPD-032',
          }],
        };
      }
      if (sql.includes('insert into public.gate_approvals')) {
        return { rows: [{ id: '00000000-0000-4000-8000-0000000005a1' }] };
      }
      return { rows: [] };
    };

    const result = await approveProjectGate({
      projectId: PROJECT,
      gateCode: 'G3',
      decision: 'approved',
      notes: 'All approval criteria satisfied.',
      password: '123456',
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        approvedGate: 'G3',
        currentGate: 'G4',
        currentStage: 'approval',
      },
    });
    const stageUpdate = calls.find((call) => /update public\.npd_projects/.test(call.sql));
    expect(stageUpdate?.params).toEqual([PROJECT, 'approval', 'G4']);
  });
});

describe('advanceProjectGate — e-sign non-overridability (assertG3/G4ESignForApproval/Handoff)', () => {
  const PROJECT = '00000000-0000-4000-8000-0000000000e1';

  beforeEach(() => {
    ctx.handler = () => ({ rows: [] });
  });

  it('pilot→approval with override note but NO gate_approvals row returns ESIGN_REQUIRED 403', async () => {
    ctx.handler = (sql) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-ESIGN-001',
            name: 'Pilot esign project',
            type: 'single',
            current_gate: 'G3',
            current_stage: 'pilot',
            product_code: 'FG-ESIGN-001',
          }],
        };
      }
      if (sql.includes('from public.gate_approvals')) return { rows: [] };
      return { rows: [] };
    };

    const result = await advanceProjectGate({
      projectId: PROJECT,
      targetStage: 'approval',
      override: { note: 'x' },
    });

    expect(result).toEqual({ ok: false, error: 'ESIGN_REQUIRED', status: 403 });
  });
});

describe('closeOutLegacyStagesForLaunch — MRP closeout gate uses closed_mrp only', () => {
  it('has no done_mrp code path in the closeout action', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/(npd)/pipeline/_actions/close-out-legacy-stages.ts'),
      'utf8',
    );
    expect(source).not.toContain('done_mrp');
    expect(source).toContain("product.closed_mrp === 'Yes'");
  });
});
