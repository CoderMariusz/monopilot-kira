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

/**
 * Rebuild the caller's CURRENT url for a different stage of the same project,
 * reusing whatever locale prefix it is already on (so no client has to parse the
 * locale out of the path itself).
 *
 * Returns null — meaning "do not navigate" — when the pathname is not a
 * `/pipeline/{projectId}` route, or when the stage has no stage route at all.
 * `launched` is the live case for the latter: it is a terminal state reached
 * from handoff and has no page, so pushing `stageRoutePath()`'s passthrough
 * would navigate the user into a 404.
 */
export function pipelineStageHrefFromPathname(
  pathname: string | null | undefined,
  projectId: string,
  stageCode: string | null | undefined,
): string | null {
  const segment = STAGE_ROUTE_BY_CODE[(stageCode ?? '').trim().toLowerCase()];
  if (!segment || !pathname || !projectId) return null;
  const marker = `/pipeline/${projectId}`;
  const index = pathname.indexOf(marker);
  if (index === -1) return null;
  return `${pathname.slice(0, index + marker.length)}/${segment}`;
}
