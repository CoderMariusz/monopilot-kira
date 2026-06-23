'use server';

/**
 * Wave-shipping — thin read helpers for the Sales Order screens.
 *
 * The reviewed write/read actions (listSalesOrders / getSalesOrder /
 * createSalesOrder / transitionSalesOrderStatus / allocateSalesOrder /
 * deallocateSalesOrder) live in ./so-actions.ts and are imported verbatim — never
 * rewritten. The create-SO modal additionally needs two SMALL org-scoped reads that
 * no SO-specific action surfaces:
 *
 *   1. listSoCustomers — the customer <Select> loads from the REAL public.customers
 *      master (active, code-sorted) so a sales order is raised against a real
 *      customer — never a hardcoded list (the prototype's static <option> list is a
 *      documented parity deviation).
 *   2. searchSoItems — the line item picker resolves a real public.items row
 *      (sales_order_lines.product_id → items.id). A sales order ships FINISHED GOODS,
 *      so the picker is restricted to fg items. Never free text, never a hardcoded
 *      list.
 *
 * Both run inside withOrgContext (RLS: org_id = app.current_org_id()); no
 * service-role bypass, no mocks. createSalesOrder remains the source of truth and
 * re-validates customer_id / item_id, so these are convenience reads only.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { searchItems, type ItemPickerOption, type SearchItemsInput } from '../../../../../(npd)/fa/actions/search-items';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type SoCustomerOption = {
  id: string;
  code: string;
  name: string;
};

/** Active customers for the create-SO customer select (org-scoped, code-sorted). */
export async function listSoCustomers(): Promise<SoCustomerOption[]> {
  try {
    return await withOrgContext<SoCustomerOption[]>(async (ctx) => {
      const { rows } = await (ctx.client as unknown as QueryClient).query<{
        id: string;
        customer_code: string | null;
        name: string | null;
      }>(
        `select c.id::text,
                c.customer_code,
                c.name
           from public.customers c
          where c.org_id = app.current_org_id()
            and c.deleted_at is null
            and c.is_active = true
          order by c.customer_code asc, c.name asc
          limit 200`,
      );
      return rows.map((r) => ({ id: r.id, code: r.customer_code ?? '', name: r.name ?? '' }));
    });
  } catch {
    return [];
  }
}

/** Finished goods a sales order can ship. searchItems' default fan-out is
 *  recipe/component-only and excludes fg, so the SO picker must request fg
 *  explicitly. Never free text, never a hardcoded list. */
export async function searchSoItems(input: SearchItemsInput = {}): Promise<ItemPickerOption[]> {
  try {
    const itemTypes = input.itemTypes && input.itemTypes.length > 0 ? input.itemTypes : (['fg'] as const);
    return await searchItems({ ...input, itemTypes: [...itemTypes] });
  } catch {
    return [];
  }
}

export type SoCapabilities = {
  /** ship.so.create — gates [Allocate]/[Deallocate] (the reviewed actions reuse the
   *  create permission for allocate/deallocate; see so-actions.ts SHIP_SO_ALLOCATE). */
  canAllocate: boolean;
  /** ship.so.confirm — gates [Confirm]. */
  canConfirm: boolean;
  /** ship.so.cancel — gates [Cancel]. */
  canCancel: boolean;
};

/**
 * Server-side RBAC capability probe for the SO detail action buttons, so a control
 * the user can never use renders disabled + tooltip rather than failing on click.
 * Mirrors the permission map enforced inside the reviewed so-actions.ts (the action
 * remains the source of truth and re-checks server-side; this is advisory UI gating
 * only and is NEVER client-trusted). Reads public.user_roles / role_permissions
 * org-scoped via withOrgContext. Falls back to all-false on read failure (deny-safe).
 */
export async function getSoCapabilities(): Promise<SoCapabilities> {
  const PERMS = {
    canAllocate: 'ship.so.create',
    canConfirm: 'ship.so.confirm',
    canCancel: 'ship.so.cancel',
  } as const;
  try {
    return await withOrgContext<SoCapabilities>(async (ctx) => {
      const granted = new Set<string>();
      // Same shape as the hasPermission() helper inside so-actions.ts: explicit
      // userId/orgId params (no app.current_user_id() SQL helper exists), and a
      // role that grants either via role_permissions rows OR the legacy
      // roles.permissions jsonb array.
      const { rows } = await (ctx.client as unknown as QueryClient).query<{ permission: string }>(
        `select distinct rp.permission
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           join public.role_permissions rp on rp.role_id = r.id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
          union
         select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid`,
        [ctx.userId, ctx.orgId],
      );
      for (const row of rows) granted.add(row.permission);
      return {
        canAllocate: granted.has(PERMS.canAllocate),
        canConfirm: granted.has(PERMS.canConfirm),
        canCancel: granted.has(PERMS.canCancel),
      };
    });
  } catch {
    return { canAllocate: false, canConfirm: false, canCancel: false };
  }
}
