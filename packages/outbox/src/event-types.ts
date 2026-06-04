export const FA_EVENT_TYPES = [
  'fa.created',
  'fa.core_closed',
  'fa.dept_closed',
  'fa.built',
  'fa.built_reset',
  'fa.edit',
  'fa.allergens_changed',
  'brief.converted',
] as const;

export type FaEventType = (typeof FA_EVENT_TYPES)[number];

const faEventTypes = new Set<string>(FA_EVENT_TYPES);

export function isFaEventType(eventType: string): eventType is FaEventType {
  return faEventTypes.has(eventType);
}
