import { randomUUID } from 'node:crypto';

import { isGateChecklistItemResolved } from '../../_lib/gate-checklist-auto-satisfy';
import { loadGateChecklistAutoSignals } from '../../_lib/gate-checklist-signals';
import {
  assertG3ESignForApproval,
  assertG4ESignForHandoff,
  checkCostingNutritionReady,
  getBlockers,
  loadProjectForUpdate,
  resolveAdvanceTransition,
  resolveGateReadiness,
  type AnyStage,
  type GateBlocker,
  type GateProjectRow,
} from './gate-helpers';
import { type OrgContextLike, type ProjectGate } from '../shared';

export type StageGateEvaluation =
  | { status: 'PASS' }
  | { status: 'SOFT_GATE_BLOCKED'; missing: string[] }
  | { status: 'HARD_BLOCKED'; hardReason: string; blockers?: GateBlocker[] };

export type EvaluateStageGateOptions = {
  /** Formal G3/G4 e-sign approval — enforces checklist/evidence without soft override. */
  mode?: 'advance' | 'formal_approve';
  approveGateCode?: 'G3' | 'G4';
};

type RequiredFieldRow = {
  dept_code: string | null;
  dept_name: string | null;
  field_code: string | null;
  field_label: string | null;
  auto_source_field: string | null;
  product_json: Record<string, unknown> | null;
  project_json: Record<string, unknown> | null;
};

function resolveGateFieldValues(row: RequiredFieldRow): Record<string, unknown> {
  if (row.product_json) return row.product_json;
  const projectJson = row.project_json ?? {};
  const rawFieldValues = projectJson.field_values;
  const fieldValues =
    typeof rawFieldValues === 'object' && rawFieldValues !== null && !Array.isArray(rawFieldValues)
      ? (rawFieldValues as Record<string, unknown>)
      : {};
  const values: Record<string, unknown> = { ...fieldValues };
  for (const [key, value] of Object.entries(projectJson)) {
    if (key !== 'field_values') values[key] = value;
  }
  values.product_name = projectJson.name ?? null;
  return values;
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function missingToBlockers(missing: string[]): GateBlocker[] {
  return missing.map((item) => ({
    code: 'REQUIRED_EVIDENCE_MISSING',
    message: item,
    itemText: item,
  }));
}

async function incompleteRequiredChecklistItems(
  ctx: OrgContextLike,
  projectId: string,
  gateCode: ProjectGate,
): Promise<string[]> {
  if (gateCode === 'Launched') return [];
  const [signals, checklist] = await Promise.all([
    loadGateChecklistAutoSignals(ctx.client, projectId),
    ctx.client.query<{ item_text: string; completed_at: string | null }>(
      `select gci.item_text,
              gci.completed_at::text as completed_at
         from public.gate_checklist_items gci
        where gci.org_id = app.current_org_id()
          and gci.project_id = $1::uuid
          and gci.gate_code = $2::text
          and gci.required = true
        order by gci.item_text asc`,
      [projectId, gateCode],
    ),
  ]);
  return checklist.rows
    .filter((row) => !isGateChecklistItemResolved(row.item_text, row.completed_at, signals))
    .map((row) => `Checklist: ${row.item_text.trim()}`);
}

async function requiredFieldsMissing(
  ctx: OrgContextLike,
  projectId: string,
  stage: AnyStage,
): Promise<string[]> {
  if (stage === 'launched') return [];
  const { rows } = await ctx.client.query<RequiredFieldRow>(
    `select
        d.code as dept_code,
        d.name as dept_name,
        f.code as field_code,
        f.label as field_label,
        f.auto_source_field,
        case when p.product_code is not null then to_jsonb(p.*) end as product_json,
        to_jsonb(np.*) as project_json
       from public.npd_departments d
       join public.npd_department_field df
         on df.department_id = d.id
        and df.org_id = d.org_id
       join public.npd_field_catalog f
         on f.id = df.field_id
        and f.org_id = df.org_id
       join public.npd_projects np
         on np.id = $1::uuid
        and np.org_id = app.current_org_id()
       left join public.product p
         on p.org_id = app.current_org_id()
        and p.product_code = np.product_code
      where d.org_id = app.current_org_id()
        and d.active = true
        and d.stage_code = $2::text
        and df.visible = true
        and df.required = true
        and f.active = true
      order by d.display_order asc, d.code asc, df.display_order asc, f.code asc`,
    [projectId, stage],
  );

  const missing: string[] = [];
  for (const row of rows) {
    const fieldCode = (row.field_code ?? '').trim().toLowerCase();
    if (!fieldCode) continue;
    const autoSource = (row.auto_source_field ?? '').trim().toLowerCase();
    const values = resolveGateFieldValues(row);
    const value = autoSource && autoSource in values ? values[autoSource] : values[fieldCode];
    if (!isFilled(value)) {
      const dept = (row.dept_name ?? row.dept_code ?? 'Stage field').trim();
      const field = (row.field_label ?? fieldCode).trim();
      missing.push(`${dept}: ${field}`);
    }
  }
  return missing;
}

export async function writeGateOverrideAudit(
  ctx: OrgContextLike,
  params: {
    projectId: string;
    fromStage: AnyStage;
    toStage: AnyStage;
    missing: string[];
    note: string;
  },
): Promise<void> {
  const payload = {
    fromStage: params.fromStage,
    toStage: params.toStage,
    missing: params.missing,
    note: params.note,
    actor: ctx.userId,
  };
  await ctx.client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values (app.current_org_id(), $1::uuid, 'user', 'npd.stage.gate_overridden',
             'npd_project', $2, null, $3::jsonb, $4::uuid, 'operational')`,
    [ctx.userId, params.projectId, JSON.stringify(payload), randomUUID()],
  );
}

export async function evaluateStageGate(
  projectId: string,
  fromStage: AnyStage,
  toStage: AnyStage,
  db: OrgContextLike,
  project?: GateProjectRow,
  options?: EvaluateStageGateOptions,
): Promise<StageGateEvaluation> {
  const mode = options?.mode ?? 'advance';
  const projectRow = project ?? await loadProjectForUpdate(db, projectId);
  const readiness = resolveGateReadiness(projectRow);
  const checklistGate = mode === 'formal_approve' && options?.approveGateCode
    ? options.approveGateCode
    : readiness.checklistGate;

  const blockers = await getBlockers(db, projectRow, toStage);
  if (blockers.length > 0) {
    return { status: 'HARD_BLOCKED', hardReason: blockers[0]?.code ?? 'BLOCKERS_PRESENT', blockers };
  }

  if (mode === 'advance') {
    if (readiness.currentGate === 'G3' && resolveAdvanceTransition(projectRow)?.targetGate === 'G4') {
      await assertG3ESignForApproval(db, projectId);
    }
    if (fromStage === 'approval' && toStage === 'handoff') {
      await assertG4ESignForHandoff(db, projectId);
    }
  }

  const requiredEvidenceMissing: string[] = [
    ...(await incompleteRequiredChecklistItems(db, projectId, checklistGate)),
    ...(await requiredFieldsMissing(db, projectId, fromStage)),
  ];
  if (requiredEvidenceMissing.length > 0) {
    return {
      status: 'HARD_BLOCKED',
      hardReason: 'REQUIRED_EVIDENCE_BLOCKED',
      blockers: missingToBlockers(requiredEvidenceMissing),
    };
  }

  if (mode === 'advance' && fromStage === 'costing_nutrition' && toStage === 'trial') {
    const advisoryMissing: string[] = [];
    const readinessCheck = await checkCostingNutritionReady(db, projectId);
    if (!readinessCheck.costReady) advisoryMissing.push('Cost breakdown computed');
    if (!readinessCheck.nutritionReady) advisoryMissing.push('Nutrition computed');
    if (advisoryMissing.length > 0) {
      return { status: 'SOFT_GATE_BLOCKED', missing: advisoryMissing };
    }
  }

  return { status: 'PASS' };
}
