import 'server-only';
import { revalidateLocalized } from '../../../lib/i18n/revalidate-localized';

/**
 * revalidatePath throws outside a Next request/static-generation store (e.g. when vitest
 * imports the Server Action directly). This server-only helper swallows that so the
 * action still returns its result. Mirrors the technical/items revalidate helper.
 */
export function safeRevalidateBundlePaths(factorySpecId: string): void {
  for (const path of ['/technical/factory-specs', `/technical/factory-specs/${factorySpecId}`]) {
    try {
      revalidateLocalized(path);
    } catch {
      // no-op outside a Next request store (integration tests).
    }
  }
}
