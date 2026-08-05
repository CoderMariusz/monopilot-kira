/**
 * 03-technical Where-used: shared constants.
 *
 * Plain (non-`'use server'`) module. A `'use server'` module may only export
 * async functions, so the row cap lives here — imported by the action that
 * queries with it and by the page that names it in the truncation warning.
 * Mirrors technical/cost/_actions/shared.ts.
 */

/**
 * The list is capped. That is fine; hiding the cap is not — this screen is used
 * during recalls to decide which finished goods a component reaches, and a list
 * that silently stops at 100 reads as "these are all of them". So we ask for
 * WHERE_USED_LIMIT + 1 rows and report `truncated` when the extra one comes back.
 */
export const WHERE_USED_LIMIT = 100;
