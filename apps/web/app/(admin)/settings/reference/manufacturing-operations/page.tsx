import { redirect } from 'next/navigation';

/**
 * Legacy non-localized Manufacturing Operations route.
 *
 * Structural consolidation (F4): the canonical SET-055 Manufacturing Operations
 * screen now lives in the localized tree at
 * `app/[locale]/(app)/(admin)/settings/reference/manufacturing-operations/page.tsx`,
 * a Server Component loader that reads real org-scoped manufacturing operations
 * via `listManufacturingOperations`. The client island lives alongside it at
 * `./manufacturing-operations-screen.client.tsx`. This file is a thin redirect
 * so the bare `/settings/reference/manufacturing-operations` URL keeps resolving
 * to the canonical localized route.
 */
export default function LegacyManufacturingOperationsPage() {
  redirect('/en/settings/reference/manufacturing-operations');
}
