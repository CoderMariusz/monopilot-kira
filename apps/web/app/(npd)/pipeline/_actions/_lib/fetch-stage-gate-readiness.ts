import { withOrgContext } from '../../../../../lib/auth/with-org-context';
import {
  applyGateChecklistAutoSatisfy,
  buildGateChecklistAutoSignals,
  type GateChecklistAutoItem,
} from '../../_lib/gate-checklist-auto-satisfy';
import { evaluateStageGate } from './evaluate-stage-gate';
import {
  formalApprovalGateCode,
  formalApprovalTargetStage,
  loadProject,
  resolveAdvanceTransition,
  resolveGateReadiness,
  type AnyStage,
  type GateProjectRow,
} from './gate-helpers';
import {
  buildAuthoritativeAdvanceGateInfo,
  mapStageGateEvaluationToView,
  type StageGateReadinessView,
} from './map-stage-gate-readiness';
import type { AdvanceGateInfo, AdvanceGateItem } from '../../../_modals/advance-gate-modal';
import type { ChecklistGate, OrgContextLike } from '../shared';

export type StageGateReadinessBundle = {
  gateInfo: AdvanceGateInfo;
  readiness: StageGateReadinessView;
  items: AdvanceGateItem[];
  formalApprovalGateCode?: 'G3' | 'G4' | null;
};

export type StageGateReadinessPurpose = 'advance' | 'formal_approve';

const DEGRADED_READINESS: StageGateReadinessView = {
  status: 'HARD_BLOCKED',
  blockers: [{ id: 'readiness-unavailable', text: 'Could not evaluate gate readiness. Try again.', code: 'READINESS_UNAVAILABLE' }],
  softMissing: [],
  requiredDone: 0,
  requiredTotal: 1,
  canAdvance: false,
};

async function loadRecipeIngredientCount(ctx: OrgContextLike, projectId: string): Promise<number> {
  const { rows } = await ctx.client.query<{ count: string }>(
    `select count(fi.id)::text as count
       from public.formulations f
       join public.formulation_versions fv on fv.id = f.current_version_id
       join public.formulation_ingredients fi on fi.version_id = fv.id
      where f.org_id = app.current_org_id()
        and f.project_id = $1::uuid`,
    [projectId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function loadChecklistItemsForGate(
  ctx: OrgContextLike,
  project: GateProjectRow,
  gateCode: ChecklistGate,
): Promise<AdvanceGateItem[]> {
  const [checklistRes, ingredientCount, productMeta] = await Promise.all([
    ctx.client.query<{ id: string; item_text: string; required: boolean; completed_at: string | null }>(
      `select gci.id,
              gci.item_text,
              gci.required,
              gci.completed_at::text as completed_at
         from public.gate_checklist_items gci
        where gci.org_id = app.current_org_id()
          and gci.project_id = $1::uuid
          and gci.gate_code = $2::text
        order by gci.created_at, gci.id`,
      [project.id, gateCode],
    ),
    project.current_stage === 'recipe' ? loadRecipeIngredientCount(ctx, project.id) : Promise.resolve(0),
    ctx.client.query<{
      product_code: string | null;
      recipe_ingredient_count: number;
      has_locked_formulation: boolean;
      linked_bom_count: number;
    }>(
      `select p.product_code,
              (select count(fi.id)::int
                 from public.formulations f
                 join public.formulation_versions fv on fv.id = f.current_version_id
                 join public.formulation_ingredients fi on fi.version_id = fv.id
                where f.org_id = app.current_org_id()
                  and f.project_id = p.id) as recipe_ingredient_count,
              exists (
                select 1
                  from public.formulations f
                  join public.formulation_versions fv on fv.id = f.current_version_id
                 where f.org_id = app.current_org_id()
                   and f.project_id = p.id
                   and fv.state = 'locked'
              ) as has_locked_formulation,
              (select count(bh.id)::int
                 from public.bom_headers bh
                where bh.org_id = app.current_org_id()
                  and bh.npd_project_id = p.id) as linked_bom_count
         from public.npd_projects p
        where p.org_id = app.current_org_id()
          and p.id = $1::uuid
        limit 1`,
      [project.id],
    ),
  ]);

  const meta = productMeta.rows[0];
  const autoSignals = buildGateChecklistAutoSignals({
    product_code: meta?.product_code ?? project.product_code,
    recipe_ingredient_count: Number(meta?.recipe_ingredient_count ?? ingredientCount),
    has_locked_formulation: meta?.has_locked_formulation === true,
    linked_bom_count: Number(meta?.linked_bom_count ?? 0),
  });

  if (project.current_stage === 'recipe') {
    return [
      {
        id: 'recipe-has-ingredient',
        text: 'At least one ingredient in the formulation',
        required: true,
        done: ingredientCount > 0,
      },
    ];
  }

  const checklist = applyGateChecklistAutoSatisfy(
    checklistRes.rows.map(
      (row): GateChecklistAutoItem & { id: string; required: boolean } => ({
        id: row.id,
        itemText: row.item_text,
        required: row.required,
        done: row.completed_at !== null,
        completedAt: row.completed_at,
      }),
    ),
    autoSignals,
  );

  return checklist.map((item) => ({
    id: item.id,
    text: item.itemText,
    required: item.required,
    done: item.done,
  }));
}

export async function loadAdvanceGateItems(
  ctx: OrgContextLike,
  project: GateProjectRow,
): Promise<AdvanceGateItem[]> {
  const readiness = resolveGateReadiness(project);
  const gate = readiness.checklistGate;
  if (gate === 'Launched') return [];
  return loadChecklistItemsForGate(ctx, project, gate);
}

export async function fetchStageGateReadinessForProject(
  project: GateProjectRow,
  options?: {
    gateLabels?: Parameters<typeof buildAuthoritativeAdvanceGateInfo>[0]['gateLabels'];
    stageLabels?: Record<string, string>;
    db?: OrgContextLike;
    purpose?: StageGateReadinessPurpose;
  },
): Promise<StageGateReadinessBundle | null> {
  try {
    const purpose = options?.purpose ?? 'advance';
    const transition = resolveAdvanceTransition(project);
    if (!transition) return null;

    const evaluate = async (db: OrgContextLike) => {
      const items = await loadAdvanceGateItems(db, project);
      const readinessMeta = resolveGateReadiness(project);
      const gateInfo = buildAuthoritativeAdvanceGateInfo({
        currentGate: readinessMeta.currentGate,
        currentStage: project.current_stage,
        transition,
        gateLabels: options?.gateLabels,
        stageLabels: options?.stageLabels,
      });

      if (purpose === 'formal_approve') {
        const gateCode = formalApprovalGateCode(project);
        if (!gateCode) return null;
        const targetStage = formalApprovalTargetStage(project.current_stage, gateCode);
        if (!targetStage) return null;
        const approvalGate = gateCode;
        const checklistItems = await loadChecklistItemsForGate(db, project, approvalGate);
        const evaluation = await evaluateStageGate(
          project.id,
          project.current_stage as AnyStage,
          targetStage,
          db,
          project,
          { mode: 'formal_approve', approveGateCode: gateCode },
        );
        return {
          gateInfo,
          readiness: mapStageGateEvaluationToView(evaluation, checklistItems),
          items: checklistItems,
          formalApprovalGateCode: gateCode,
        };
      }

      const evaluation = await evaluateStageGate(
        project.id,
        project.current_stage as AnyStage,
        transition.nextStage,
        db,
        project,
        { mode: 'readiness' },
      );
      return {
        gateInfo,
        readiness: mapStageGateEvaluationToView(evaluation, items),
        items,
        formalApprovalGateCode: formalApprovalGateCode(project),
      };
    };

    return options?.db
      ? await evaluate(options.db)
      : await withOrgContext(async (rawCtx) => evaluate(rawCtx as OrgContextLike));
  } catch (error) {
    console.error('[fetchStageGateReadinessForProject] degraded after failure:', error);
    const transition = resolveAdvanceTransition(project);
    if (!transition) return null;
    const readinessMeta = resolveGateReadiness(project);
    const gateInfo = buildAuthoritativeAdvanceGateInfo({
      currentGate: readinessMeta.currentGate,
      currentStage: project.current_stage,
      transition,
      gateLabels: options?.gateLabels,
      stageLabels: options?.stageLabels,
    });
    return {
      gateInfo,
      readiness: DEGRADED_READINESS,
      items: [],
      formalApprovalGateCode: formalApprovalGateCode(project),
    };
  }
}

export async function fetchStageGateReadinessByProjectId(
  projectId: string,
  options?: {
    gateLabels?: Parameters<typeof buildAuthoritativeAdvanceGateInfo>[0]['gateLabels'];
    stageLabels?: Record<string, string>;
    purpose?: StageGateReadinessPurpose;
  },
): Promise<StageGateReadinessBundle | null> {
  return withOrgContext(async (rawCtx) => {
    const db = rawCtx as OrgContextLike;
    const project = await loadProject(db, projectId);
    if (!project) return null;
    return fetchStageGateReadinessForProject(project, { ...options, db });
  });
}
