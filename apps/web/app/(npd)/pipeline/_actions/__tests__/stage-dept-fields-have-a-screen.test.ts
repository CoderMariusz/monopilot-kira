/**
 * A gate may only require what a screen can fill.
 *
 * `evaluateStageGate` blocks a transition on `requiredFieldsMissing(fromStage)` —
 * the `npd_department_field.required` rows of the stage being LEFT. The only UI
 * that renders those rows is `StageDeptSections`, mounted per stage page. When a
 * stage page forgets the mount, every required field of that stage becomes
 * structurally unfillable and the project is stuck for good (proven live: 19/19
 * projects on brief/G0 before 375f7c6a; recipe + approval were the next two).
 *
 * Test 1 is the structural guard for the whole class: EVERY stage in
 * PIPELINE_STAGE_ORDER must have a page mounting the loader for its own code.
 * Tests 2-5 are the behavioural both-directions proof for the two stages that
 * carry required fields today and had no screen: filled -> PASS, empty -> the
 * SAME HARD_BLOCKED message. The gate is never weakened, only made reachable.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PIPELINE_STAGE_ORDER, stageRoutePath } from '../../../../../lib/npd/stage-routes';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ALL_PASS_CRITERIA = { C1: 'pass', C2: 'pass', C3: 'pass', C4: 'pass', C5: 'pass', C6: 'pass', C7: 'pass' };

vi.mock('../../[projectId]/approval/_actions/evaluate-core', () => ({
  evaluateApprovalCriteriaWithClient: vi.fn(async () => ({ ok: true, data: ALL_PASS_CRITERIA })),
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
      client: { query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params) },
    }),
}));

import { evaluateStageGate } from '../_lib/evaluate-stage-gate';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function stagePageSource(stage: string): string {
  return readFileSync(
    join(APP_DIR, '[locale]', '(app)', '(npd)', 'pipeline', '[projectId]', stageRoutePath(stage), 'page.tsx'),
    'utf8',
  );
}

/**
 * Required-field rows for `stage`, shaped exactly like the gate's own query
 * output. `values` is the resolved product/project state: a field absent from it
 * is unfilled. Every other query the gate runs answers "nothing to block on" so
 * the assertion isolates the required-field branch.
 */
function wireStageRequiredFields(
  stage: string,
  fields: Array<{ dept: string; code: string; label: string }>,
  values: Record<string, unknown>,
) {
  ctx.handler = (sql) => {
    const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (q.includes('from public.npd_projects') && q.includes('for update')) {
      return {
        rows: [{
          id: 'proj-1',
          code: 'NPD-001',
          name: 'Test',
          type: 'standard',
          current_gate: stage === 'approval' ? 'G4' : 'G2',
          current_stage: stage,
          product_code: 'FG-001',
        }],
      };
    }
    // Gate-checklist auto-satisfy signals (must be matched BEFORE the recipe
    // ingredient count — this query embeds the same table as a sub-select).
    if (q.includes('linked_bom_count')) {
      return {
        rows: [{
          product_code: 'FG-001',
          recipe_ingredient_count: 2,
          has_locked_formulation: true,
          linked_bom_count: 1,
        }],
      };
    }
    // recipe stage guard: at least one ingredient on the current version.
    if (q.includes('formulation_ingredients')) return { rows: [{ n: '1' }] };
    // approval -> handoff: G4 e-sign present + a valid compliance doc.
    if (q.includes('from public.gate_approvals')) return { rows: [{ ok: true }] };
    if (q.includes('from public.compliance_docs')) return { rows: [{ valid_docs: 1 }] };
    if (q.includes('from public.gate_checklist_items')) return { rows: [] };
    if (q.includes('from public.npd_departments')) {
      return {
        rows: fields.map((field) => ({
          dept_code: field.dept,
          dept_name: field.dept,
          field_code: field.code,
          field_label: field.label,
          auto_source_field: null,
          product_json: { product_code: 'FG-001', ...values },
          project_json: { field_values: {} },
        })),
      };
    }
    return { rows: [] };
  };
}

function gateCtx() {
  return {
    userId: ctx.userId,
    orgId: ctx.orgId,
    client: { query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params) },
  } as never;
}

const RECIPE_FIELDS = [
  { dept: 'Planning', code: 'primary_ingredient_pct', label: 'Primary Ingredient Pct' },
  { dept: 'Planning', code: 'date_code_per_week', label: 'Date Code Per Week' },
  { dept: 'Technical', code: 'shelf_life', label: 'Shelf Life' },
];

const APPROVAL_FIELDS = [
  { dept: 'Commercial', code: 'article_number', label: 'Article Number' },
  { dept: 'Commercial', code: 'bar_codes', label: 'Bar Codes' },
  { dept: 'Commercial', code: 'cases_per_week_w1', label: 'Cases Per Week W1' },
  { dept: 'Commercial', code: 'cases_per_week_w2', label: 'Cases Per Week W2' },
  { dept: 'Commercial', code: 'cases_per_week_w3', label: 'Cases Per Week W3' },
  { dept: 'Commercial', code: 'department_number', label: 'Department Number' },
  { dept: 'Commercial', code: 'launch_date', label: 'Launch Date' },
];

const RECIPE_FILLED = {
  primary_ingredient_pct: '72.5',
  date_code_per_week: 'Mon/Thu',
  shelf_life: '28 days',
};

const APPROVAL_FILLED = {
  article_number: 'ART-9001',
  bar_codes: '5901234123457',
  cases_per_week_w1: '120',
  cases_per_week_w2: '140',
  cases_per_week_w3: '160',
  department_number: 'DEP-14',
  launch_date: '2026-09-01',
};

beforeEach(() => {
  ctx.handler = () => ({ rows: [] });
});

describe('every pipeline stage has a screen for its own gate-required fields', () => {
  it.each(PIPELINE_STAGE_ORDER)('stage "%s" page mounts StageDeptSections for its own stage code', (stage) => {
    const source = stagePageSource(stage);
    expect(source).toContain('StageDeptSections');
    expect(source).toContain(`loadStageDeptSections({ projectId, stage: '${stage}' })`);
    expect(source).toContain(`stage="${stage}"`);
  });
});

describe('recipe -> packaging gate (Planning + Technical fields)', () => {
  it('blocks when the fields are empty, naming every one of them', async () => {
    wireStageRequiredFields('recipe', RECIPE_FIELDS, {});

    const evaluation = await evaluateStageGate('proj-1', 'recipe', 'packaging', gateCtx());

    expect(evaluation).toEqual({
      status: 'HARD_BLOCKED',
      hardReason: 'REQUIRED_EVIDENCE_BLOCKED',
      blockers: [
        { code: 'REQUIRED_EVIDENCE_MISSING', message: 'Planning: Primary Ingredient Pct', itemText: 'Planning: Primary Ingredient Pct' },
        { code: 'REQUIRED_EVIDENCE_MISSING', message: 'Planning: Date Code Per Week', itemText: 'Planning: Date Code Per Week' },
        { code: 'REQUIRED_EVIDENCE_MISSING', message: 'Technical: Shelf Life', itemText: 'Technical: Shelf Life' },
      ],
    });
  });

  it('still blocks on a whitespace-only value (the gate is not weakened)', async () => {
    wireStageRequiredFields('recipe', RECIPE_FIELDS, { ...RECIPE_FILLED, shelf_life: '   ' });

    const evaluation = await evaluateStageGate('proj-1', 'recipe', 'packaging', gateCtx());

    expect(evaluation).toEqual({
      status: 'HARD_BLOCKED',
      hardReason: 'REQUIRED_EVIDENCE_BLOCKED',
      blockers: [
        { code: 'REQUIRED_EVIDENCE_MISSING', message: 'Technical: Shelf Life', itemText: 'Technical: Shelf Life' },
      ],
    });
  });

  it('passes once the screen has written all three', async () => {
    wireStageRequiredFields('recipe', RECIPE_FIELDS, RECIPE_FILLED);

    expect(await evaluateStageGate('proj-1', 'recipe', 'packaging', gateCtx())).toEqual({ status: 'PASS' });
  });
});

describe('approval -> handoff gate (Commercial fields, last stop before the factory)', () => {
  it('blocks when the fields are empty, naming every one of them', async () => {
    wireStageRequiredFields('approval', APPROVAL_FIELDS, {});

    const evaluation = await evaluateStageGate('proj-1', 'approval', 'handoff', gateCtx());

    expect(evaluation).toEqual({
      status: 'HARD_BLOCKED',
      hardReason: 'REQUIRED_EVIDENCE_BLOCKED',
      blockers: APPROVAL_FIELDS.map((field) => ({
        code: 'REQUIRED_EVIDENCE_MISSING',
        message: `Commercial: ${field.label}`,
        itemText: `Commercial: ${field.label}`,
      })),
    });
  });

  it('passes once the screen has written all seven', async () => {
    wireStageRequiredFields('approval', APPROVAL_FIELDS, APPROVAL_FILLED);

    expect(await evaluateStageGate('proj-1', 'approval', 'handoff', gateCtx())).toEqual({ status: 'PASS' });
  });
});
