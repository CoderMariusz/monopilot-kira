/**
 * Sensory WRITE constants (NON-'use server' sibling).
 *
 * Parity source = the existing sensory READ screens + Technical modal conventions
 * (there is NO standalone sensory JSX prototype — confirmed by grep).
 *
 * A `'use server'` module may only export async functions — a runtime
 * `export const` there compiles under tsc/vitest but breaks `next build`
 * ("A 'use server' file can only export async functions"). The RBAC permission
 * string, the subject/status enums and the seed attribute list therefore live in
 * this plain module so record-sensory-evaluation.ts can import them safely (the
 * same split getSensoryPanel.ts uses for SENSORY_READ_PERMISSION in constants.ts).
 */

// BYTE-IDENTICAL to the seeded GRANT string (migration 347 grants
// 'technical.sensory.write' to the org-admin family across all 3 sensory tables).
export const SENSORY_WRITE_PERMISSION = 'technical.sensory.write';

// Mirrors technical_sensory_evaluations_subject_type_check (migration 166).
export const SENSORY_SUBJECT_TYPES = ['product', 'project', 'work_order', 'item'] as const;
export type SensorySubjectTypeWrite = (typeof SENSORY_SUBJECT_TYPES)[number];

// Mirrors technical_sensory_evaluations_status_check (migration 166).
export const SENSORY_STATUSES = [
  'required',
  'pending',
  'pass',
  'fail',
  'hold',
  'not_required',
] as const;
export type SensoryStatusWrite = (typeof SENSORY_STATUSES)[number];

// A "verdict" status records WHO evaluated + WHEN (evaluated_at / evaluated_by).
export const SENSORY_VERDICT_STATUSES = ['pass', 'fail', 'hold'] as const;

/**
 * Canonical seed attribute rows for the record form. These match the attribute
 * names the NPD radar reads (sensory-radar.tsx) so a recorded panel renders on
 * the radar. There is no shared canonical list in code, so this is the default
 * documented in the task (Appearance, Aroma, Texture, Flavour, Aftertaste, Overall).
 */
export const DEFAULT_SENSORY_ATTRIBUTES = [
  'Appearance',
  'Aroma',
  'Texture',
  'Flavour',
  'Aftertaste',
  'Overall',
] as const;

export const SENSORY_REVALIDATE_PATHS = ['/technical/sensory', '/en/technical/sensory'] as const;
