/** Fixed NPD pipeline stage order (9 dots). */
export const PIPELINE_STAGE_ORDER = [
  'brief',
  'recipe',
  'packaging',
  'costing_nutrition',
  'trial',
  'sensory',
  'pilot',
  'approval',
  'handoff',
] as const;

export type PipelineStageCode = (typeof PIPELINE_STAGE_ORDER)[number];

const STAGE_ROUTE_BY_CODE: Record<string, string> = {
  brief: 'brief',
  recipe: 'formulation',
  packaging: 'packaging',
  costing_nutrition: 'costing-nutrition',
  trial: 'trial',
  sensory: 'sensory',
  pilot: 'pilot',
  approval: 'approval',
  handoff: 'handoff',
};

/** Locale-aware pipeline stage path segment (no leading slash). */
export function stageRoutePath(stageCode: string): string {
  const normalized = (stageCode ?? '').trim().toLowerCase();
  return STAGE_ROUTE_BY_CODE[normalized] ?? normalized;
}

export function stageOrderIndex(stageCode: string): number {
  const normalized = (stageCode ?? '').trim().toLowerCase();
  const index = PIPELINE_STAGE_ORDER.indexOf(normalized as PipelineStageCode);
  return index === -1 ? PIPELINE_STAGE_ORDER.length + 1 : index;
}

/** Canonical close-dept enum value expected by closeDeptSection / getRequiredFieldsForDept. */
export function deptCodeToCloseDept(deptCode: string): string {
  const code = (deptCode ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    core: 'Core',
    planning: 'Planning',
    commercial: 'Commercial',
    production: 'Production',
    technical: 'Technical',
    mrp: 'MRP',
    procurement: 'Procurement',
  };
  return map[code] ?? deptCode.charAt(0).toUpperCase() + deptCode.slice(1);
}

export function pipelineStageHref(locale: string, projectId: string, stageCode: string): string {
  const prefix = locale ? `/${locale}` : '';
  return `${prefix}/pipeline/${projectId}/${stageRoutePath(stageCode)}`;
}
