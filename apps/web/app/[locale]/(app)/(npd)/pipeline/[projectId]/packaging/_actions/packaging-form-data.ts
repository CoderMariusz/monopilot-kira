'use server';

/**
 * NPD PACKAGING — thin read helpers for the packaging component modal.
 *
 * The write actions live in ./_actions/upsertPackagingComponent.ts. The modal
 * needs org-scoped supplier options from the REAL public.suppliers master —
 * never free text, never a hardcoded list (mirrors planning/purchase-orders
 * listPoSuppliers).
 */

import { listSuppliers } from '../../../../../(modules)/planning/suppliers/_actions/actions';

export type PackagingSupplierOption = {
  id: string;
  code: string;
  name: string;
};

/** Active suppliers for the packaging component supplier select (org-scoped, code-sorted). */
export async function listPackagingSuppliers(): Promise<PackagingSupplierOption[]> {
  const result = await listSuppliers({ status: 'active', limit: 200 });
  if (!result.ok) return [];
  return result.data.map((s: { id: string; code: string; name: string }) => ({
    id: s.id,
    code: s.code,
    name: s.name,
  }));
}
