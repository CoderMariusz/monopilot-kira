/**
 * Shared, framework-agnostic data for the NPD project 8-step workbench stepper.
 *
 * IMPORTANT (Next 16 RSC): this module MUST NOT carry a 'use client' directive.
 * It is imported by BOTH the client `<ProjectStepper>` AND the SERVER
 * `pipeline/[projectId]/layout.tsx`. A plain value (PROJECT_STAGES) exported from
 * a 'use client' module becomes a client-reference proxy when imported into a
 * Server Component in the production bundle (`PROJECT_STAGES.reduce` → runtime
 * TypeError, a 500 that vitest does NOT catch). Keeping it here, with no client
 * directive, lets the server import the real array.
 */

/** The fixed 9 workflow stages, in order, with their route segment + i18n key. */
export const PROJECT_STAGES = [
  { key: 'brief', segment: 'brief', i18nKey: 'brief' },
  { key: 'recipe', segment: 'formulation', i18nKey: 'recipe' },
  { key: 'packaging', segment: 'packaging', i18nKey: 'packaging' },
  { key: 'costing_nutrition', segment: 'costing-nutrition', i18nKey: 'costing_nutrition' },
  { key: 'trial', segment: 'trial', i18nKey: 'trial' },
  { key: 'sensory', segment: 'sensory', i18nKey: 'sensory' },
  { key: 'pilot', segment: 'pilot', i18nKey: 'pilot' },
  { key: 'approval', segment: 'approval', i18nKey: 'approval' },
  { key: 'handoff', segment: 'handoff', i18nKey: 'handoff' },
] as const;

export type ProjectStageKey = (typeof PROJECT_STAGES)[number]['key'];
