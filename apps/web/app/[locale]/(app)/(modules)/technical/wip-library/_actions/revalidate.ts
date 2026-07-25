import 'server-only';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

/**
 * PF-R05-09 — every WIP-definition lifecycle mutation (save / archive / publish)
 * has to drop the cached RSC payload for the library list AND the definition
 * detail route, otherwise a back/forward navigation replays the pre-mutation
 * page: an archived definition still rendering the reusable switch and a live
 * Archive button.
 *
 * revalidatePath throws outside a Next request/static-generation store (e.g. when
 * vitest imports the Server Action directly). This server-only helper swallows
 * that so the action still returns its result. Mirrors the items/bom
 * `_actions/revalidate.ts`.
 */
export function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // no-op outside a Next request store (integration tests).
  }
}
