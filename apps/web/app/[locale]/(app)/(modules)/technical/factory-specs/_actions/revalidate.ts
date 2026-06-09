import 'server-only';

import { revalidatePath } from 'next/cache';

export function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // no-op outside a Next request/static-generation store (unit tests).
  }
}
