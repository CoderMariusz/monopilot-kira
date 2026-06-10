'use server';

/**
 * P2-PLANNING — thin read helpers for the Purchase Order screens.
 *
 * The reviewed write/read actions (listPurchaseOrders / getPurchaseOrder /
 * createPurchaseOrder / transitionPurchaseOrderStatus) live in ./actions.ts and
 * are imported verbatim — never rewritten. The create modal additionally needs two
 * SMALL org-scoped reads that no PO-specific action surfaces:
 *
 *   1. listPoSuppliers — the supplier <Select> loads from the REAL public.suppliers
 *      master via the reviewed listSuppliers action (planning/suppliers). Re-exported
 *      here (active-only, sorted by code) so the page imports a single PO-local seam
 *      and never trusts a hardcoded supplier list (prototype's literal <option> list
 *      is a parity deviation — see po-list-view.tsx).
 *   2. searchPoItems — the line item picker resolves a real public.items row
 *      (purchase_order_lines.item_id → items.id), reusing the org-scoped searchItems
 *      action. Never free text, never a hardcoded list.
 *
 * Both run inside withOrgContext (RLS: org_id = app.current_org_id()); no
 * service-role bypass, no mocks. createPurchaseOrder remains the source of truth and
 * re-validates supplierId / itemId, so these are convenience reads only.
 */

import { listSuppliers } from '../../suppliers/_actions/actions';
import { searchItems, type ItemPickerOption, type SearchItemsInput } from '../../../../../../(npd)/fa/actions/search-items';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export type PoSupplierOption = {
  id: string;
  code: string;
  name: string;
  currency: string;
};

/** Active suppliers for the create-PO supplier select (org-scoped, code-sorted). */
export async function listPoSuppliers(): Promise<PoSupplierOption[]> {
  const result = await listSuppliers({ status: 'active', limit: 200 });
  if (!result.ok) return [];
  return result.data.map((s) => ({ id: s.id, code: s.code, name: s.name, currency: s.currency }));
}

/** Search the org-scoped items master for the PO line picker (real items only). */
export async function searchPoItems(input: SearchItemsInput = {}): Promise<ItemPickerOption[]> {
  try {
    return await searchItems(input);
  } catch {
    return [];
  }
}

/**
 * Per-PO line counts for the list "Lines" column. listPurchaseOrders returns
 * headers only (no aggregate on mig 262), so this is a single grouped count,
 * org-scoped. Mirrors transfer-orders' listTransferOrderLineCounts.
 */
export async function listPurchaseOrderLineCounts(): Promise<Record<string, number>> {
  try {
    return await withOrgContext<Record<string, number>>(async (ctx) => {
      const { rows } = await ctx.client.query<{ po_id: string; n: string }>(
        `select po_id, count(*)::text as n
           from public.purchase_order_lines
          where org_id = app.current_org_id()
          group by po_id`,
      );
      const map: Record<string, number> = {};
      for (const r of rows) map[r.po_id] = Number(r.n);
      return map;
    });
  } catch {
    return {};
  }
}
