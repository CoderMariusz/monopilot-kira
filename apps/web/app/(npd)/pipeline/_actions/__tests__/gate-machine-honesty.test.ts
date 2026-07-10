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
  advanceTransitionForStage,
  gateForStage,
  nextStage,
} from '../_lib/gate-helpers';
import { advanceProjectGate } from '../advance-project-gate';
import { approveProjectGate } from '../approve-project-gate';

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

describe('advanceProjectGate — ONE gate system soft and hard gates', () => {
  const PROJECT = '00000000-0000-4000-8000-0000000000d1';

  beforeEach(() => {
    ctx.handler = () => ({ rows: [] });
  });

  it('returns SOFT_GATE_BLOCKED when required stage fields are missing and no override is supplied', async () => {
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
      error: 'SOFT_GATE_BLOCKED',
      status: 409,
      missing: ['Packaging: Box'],
    });
    expect(calls.some((sql) => /update public\.npd_projects/.test(sql))).toBe(false);
    expect(calls.some((sql) => /insert into public\.audit_log/.test(sql))).toBe(false);
  });

  it('allows a soft gate override with a non-empty note and writes audit_log', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-SOFT-002',
            name: 'Soft gate override project',
            type: 'single',
            current_gate: 'G3',
            current_stage: 'packaging',
            product_code: 'FG-SOFT-002',
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

    const result = await advanceProjectGate({
      projectId: PROJECT,
      targetStage: 'costing_nutrition',
      override: { note: 'Proceeding for pilot timing; packaging data owner notified.' },
    });
    expect(result).toMatchObject({ ok: true, data: { currentStage: 'costing_nutrition' } });

    const audit = calls.find((call) => /insert into public\.audit_log/.test(call.sql));
    expect(audit).toBeTruthy();
    expect(audit?.sql).toContain('npd.stage.gate_overridden');
    expect(JSON.parse(audit?.params?.[2] as string)).toEqual({
      fromStage: 'packaging',
      toStage: 'costing_nutrition',
      missing: ['Packaging: Box'],
      note: 'Proceeding for pilot timing; packaging data owner notified.',
      actor: ctx.userId,
    });
    expect(calls.some((call) => /update public\.npd_projects/.test(call.sql))).toBe(true);
  });

  it('F6.1 regression: pre-FG brief advance PASSES without override when required Core values live on the project', async () => {
    // The Gate-5b logic walk caught this: the action's own requiredFieldsMissing
    // read values ONLY from product_json, so a pre-FG project (product_code null)
    // could never satisfy the Brief gate even with values saved on the project.
    // The three rows below exercise all three project-side resolution paths:
    // product_name via the name alias, pack_size via a direct column, and
    // recipe_components via field_values jsonb.
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
            current_gate: 'G0',
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
      return { rows: [] };
    };

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'recipe' });
    expect(result).toMatchObject({ ok: true });
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

  it('soft-blocks costing_nutrition → trial when costing and nutrition are not computed', async () => {
    ctx.handler = (sql) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-CN-001',
            name: 'Cost nutrition project',
            type: 'single',
            current_gate: 'G3',
            current_stage: 'costing_nutrition',
            product_code: 'FG-CN-001',
          }],
        };
      }
      if (sql.includes('costing_breakdowns') && sql.includes('nutri_score_results')) {
        return { rows: [{ cost_ready: false, nutrition_ready: false }] };
      }
      if (sql.includes('from public.npd_departments')) return { rows: [] };
      return { rows: [] };
    };

    const result = await advanceProjectGate({ projectId: PROJECT, targetStage: 'trial' });
    expect(result).toEqual({
      ok: false,
      error: 'SOFT_GATE_BLOCKED',
      status: 409,
      missing: ['Cost breakdown computed', 'Nutrition computed'],
    });
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

  it('pilot→approval with override note but NO gate_approvals row returns ESIGN_REQUIRED 403 and issues no update/audit_log', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      // Permission check
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      // loadProjectForUpdate
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
      // assertG3ESignForApproval queries gate_approvals — return empty (no e-sign)
      if (sql.includes('from public.gate_approvals')) return { rows: [] };
      return { rows: [] };
    };

    const result = await advanceProjectGate({
      projectId: PROJECT,
      targetStage: 'approval',
      override: { note: 'x' },
    });

    expect(result).toEqual({ ok: false, error: 'ESIGN_REQUIRED', status: 403 });
    expect(calls.some(({ sql }) => /update\s+public\.npd_projects/.test(sql))).toBe(false);
    expect(calls.some(({ sql }) => /insert into public\.audit_log/.test(sql))).toBe(false);
  });

  it('approval→handoff with override note but NO gate_approvals row returns ESIGN_REQUIRED 403 and issues no update/audit_log', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      // Permission check
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      // loadProjectForUpdate
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT,
            code: 'NPD-ESIGN-002',
            name: 'Approval esign project',
            type: 'single',
            current_gate: 'G4',
            current_stage: 'approval',
            product_code: 'FG-ESIGN-002',
          }],
        };
      }
      // assertG4ESignForHandoff queries gate_approvals — return empty (no e-sign)
      if (sql.includes('from public.gate_approvals')) return { rows: [] };
      return { rows: [] };
    };

    const result = await advanceProjectGate({
      projectId: PROJECT,
      targetStage: 'handoff',
      override: { note: 'x' },
    });

    expect(result).toEqual({ ok: false, error: 'ESIGN_REQUIRED', status: 403 });
    expect(calls.some(({ sql }) => /update\s+public\.npd_projects/.test(sql))).toBe(false);
    expect(calls.some(({ sql }) => /insert into public\.audit_log/.test(sql))).toBe(false);
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
