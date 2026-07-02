import 'server-only';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

export function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // no-op outside a Next request/static-generation store (unit tests).
  }
}
