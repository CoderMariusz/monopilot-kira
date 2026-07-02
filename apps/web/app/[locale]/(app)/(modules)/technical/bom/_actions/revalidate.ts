import 'server-only';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

/**
 * revalidatePath throws outside a Next request/static-generation store (e.g. when
 * vitest imports the Server Action directly). This server-only helper swallows that
 * so the action still returns its result. Mirrors the items `_actions/revalidate.ts`.
 */
export function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // no-op outside a Next request store (integration tests).
  }
}
