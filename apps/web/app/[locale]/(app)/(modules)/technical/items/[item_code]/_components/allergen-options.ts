/**
 * T-047 — shared allergen enum constants for the profile-editor client islands.
 * Mirrors the CHECK constraints in packages/db/migrations/161-allergen-tables.sql
 * and the PROFILE_SOURCES / INTENSITIES / CONFIDENCES enums in
 * apps/web/lib/technical/allergens/shared.ts (single source of truth — kept in
 * sync, no float / no ad-hoc strings).
 */

import type { BadgeVariant } from '@monopilot/ui/Badge';

export const INTENSITY_OPTIONS = ['contains', 'may_contain', 'trace'] as const;
export const CONFIDENCE_OPTIONS = ['declared', 'tested', 'assumed'] as const;
export const PROFILE_SOURCE_OPTIONS = [
  'brief_declared',
  'supplier_spec',
  'lab_result',
  'cascaded',
  'manual_override',
] as const;

export type IntensityValue = (typeof INTENSITY_OPTIONS)[number];
export type ConfidenceValue = (typeof CONFIDENCE_OPTIONS)[number];
export type ProfileSourceValue = (typeof PROFILE_SOURCE_OPTIONS)[number];

/** Source → badge variant (cascaded read-only vs manual override vs lab/declared). */
export const SOURCE_VARIANT: Record<string, BadgeVariant> = {
  brief_declared: 'info',
  supplier_spec: 'secondary',
  lab_result: 'success',
  cascaded: 'muted',
  manual_override: 'warning',
};

/** A source is auto-cascaded (read-only) iff it is the cascade engine's output. */
export function isCascaded(source: string): boolean {
  return source === 'cascaded';
}
