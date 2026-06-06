/**
 * Fala-3 — Sensory stage constants (NON-'use server' sibling).
 *
 * A `'use server'` module may only export async functions — a runtime
 * `export const` there compiles under tsc/vitest but fails `next build`
 * ("A 'use server' file can only export async functions"). The RBAC permission
 * string lives here so getSensoryPanel.ts can import it without breaking the
 * Vercel build.
 *
 * BYTE-IDENTICAL to the seeded GRANT string (packages/db/migrations/236) and the
 * enum TECHNICAL_SENSORY_READ (packages/rbac/src/permissions.enum.ts).
 */
export const SENSORY_READ_PERMISSION = 'technical.sensory.read';
