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
import { searchItems } from '../../../../../../(npd)/fa/actions/search-items';
import type { ItemPickerOption, SearchItemsInput } from '../../../../../../(npd)/fa/actions/search-items-types';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { listOrgUnits, type OrgUnitOption, type QueryClient } from '../../_actions/procurement-shared';

export type PoSupplierOption = {
  id: string;
  code: string;
  name: string;
  currency: string;
};

type SupplierPriceRow = {
  unit_price: string | null;
  currency: string | null;
};

type SupplierRow = {
  code: string | null;
  currency: string | null;
};

type ItemListPriceRow = {
  unit_price: string | null;
};

export type ItemSupplierPrice = {
  unitPrice: string | null;
  currency: string | null;
  source: 'spec' | 'list_price' | 'none';
};

/** Active suppliers for the create-PO supplier select (org-scoped, code-sorted). */
export async function listPoSuppliers(): Promise<PoSupplierOption[]> {
  const result = await listSuppliers({ status: 'active', limit: 200 });
  if (!result.ok) return [];
  return result.data.map((s) => ({ id: s.id, code: s.code, name: s.name, currency: s.currency }));
}

/** Physical goods a purchase order can buy: ALL stockable item types, including
 *  packaging (a packaging PO line is legitimate). searchItems' default fan-out is
 *  recipe/component-only and excludes packaging, so the PO picker must widen it
 *  explicitly — otherwise packaging is unorderable. Explicit caller filters win. */
const PO_PURCHASABLE_ITEM_TYPES = [
  'rm',
  'ingredient',
  'intermediate',
  'co_product',
  'byproduct',
  'packaging',
] as const;

/** Search the org-scoped items master for the PO line picker (real items only).
 *  When the caller passes no `itemTypes`, default to ALL purchasable physical
 *  goods (purchasing buys everything, packaging included); explicit filters from
 *  the caller are preserved as-is. */
export async function searchPoItems(input: SearchItemsInput & { supplierId?: string } = {}): Promise<ItemPickerOption[]> {
  try {
    const itemTypes =
      input.itemTypes && input.itemTypes.length > 0 ? input.itemTypes : [...PO_PURCHASABLE_ITEM_TYPES];
    if (!input.supplierId) {
      return await searchItems({ ...input, itemTypes });
    }

    const supplierCode = await withOrgContext<string | undefined>(async (ctx) => {
      const { rows } = await ctx.client.query<{ code: string | null }>(
        `select code
           from public.suppliers
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [input.supplierId],
      );
      return rows[0]?.code ?? undefined;
    });

    return await searchItems({ ...input, itemTypes, supplierCode });
  } catch {
    return [];
  }
}

export async function getItemSupplierPrice(
  input: { itemId: string; supplierId?: string | null; date?: string | null }
): Promise<{ ok: true; data: ItemSupplierPrice } | { ok: false; error: string }> {
  try {
    const data = await withOrgContext<ItemSupplierPrice>(async (ctx) => {
      let supplier: SupplierRow | null = null;

      if (input.supplierId) {
        const supplierResult = await ctx.client.query<SupplierRow>(
          `select code,
                  currency
             from public.suppliers
            where org_id = app.current_org_id()
              and id = $1::uuid
            limit 1`,
          [input.supplierId],
        );
        supplier = supplierResult.rows[0] ?? null;

        if (supplier?.code) {
          const specResult = await ctx.client.query<SupplierPriceRow>(
            `select ss.unit_price::text as unit_price,
                    coalesce(ss.price_currency, $3::text) as currency
               from public.supplier_specs ss
              where ss.org_id = app.current_org_id()
                and ss.item_id = $1::uuid
                and ss.supplier_code = $2
                and ss.lifecycle_status = 'active'
                and ss.review_status = 'approved'
                and ss.unit_price is not null
                and ss.effective_from <= coalesce($4::date, current_date)
                and (ss.expiry_date is null or ss.expiry_date >= coalesce($4::date, current_date))
              order by ss.effective_from desc
              limit 1`,
            [input.itemId, supplier.code, supplier.currency, input.date ?? null],
          );
          const spec = specResult.rows[0];
          if (spec?.unit_price) {
            return {
              unitPrice: spec.unit_price,
              currency: spec.currency,
              source: 'spec',
            };
          }
        }
      }

      const itemResult = await ctx.client.query<ItemListPriceRow>(
        `select list_price_gbp::text as unit_price
           from public.items
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [input.itemId],
      );
      const item = itemResult.rows[0];
      if (item?.unit_price) {
        return {
          unitPrice: item.unit_price,
          currency: supplier?.currency ?? 'GBP',
          source: 'list_price',
        };
      }

      return {
        unitPrice: null,
        currency: null,
        source: 'none',
      };
    });

    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Failed to resolve item supplier price' };
  }
}

/**
 * Active units of measure for the PO line UoM picker, read from the REAL
 * public.unit_of_measure master (org-scoped). Replaces the page's old hardcoded
 * {kg,g,l,…} list, so units an admin adds in Settings → Units appear here. Falls
 * back to an empty list (the caller then keeps the canonical defaults) on read
 * failure rather than throwing.
 */
export async function listPoUnits(): Promise<OrgUnitOption[]> {
  try {
    return await withOrgContext<OrgUnitOption[]>(async (ctx) =>
      listOrgUnits(ctx.client as unknown as QueryClient),
    );
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
