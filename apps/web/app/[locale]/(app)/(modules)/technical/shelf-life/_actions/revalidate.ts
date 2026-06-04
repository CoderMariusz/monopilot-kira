import 'server-only';

import { revalidatePath } from 'next/cache';

/**
 * revalidatePath throws outside a Next request/static-generation store (e.g.
 * when vitest imports the Server Action directly). This server-only helper
 * swallows that so the action still returns its result. Mirrors the items
 * action's safeRevalidatePath. Kept out of `shared.ts` so the client island can
 * import the shared enums/types without pulling `next/cache` into a Client
 * Component.
 */
export function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // no-op outside a Next request store (integration tests).
  }
}
