'use server';

/**
 * WAVE W11 — UI-lane wiring reads for the DIRECT stock-adjustment form
 * (/warehouse/adjustments/new). These are NOT the mutation (that is
 * applyDirectAdjustment in warehouse/_actions/direct-adjust-actions.ts, owned by
 * the backend lane — imported, never authored here). They are the additive,
 * read-only lookups the form needs that no existing warehouse read provides:
 *
 *   1. getDirectAdjustFormContext — page gate: does the caller hold
 *      warehouse.stock.adjust? Mirrors the warehouse module convention of
 *      enforcing RBAC server-side and surfacing a `forbidden` reason the page
 *      renders as an access-denied panel (never a client-trusted flag).
 *
 *   2. searchEligibleSupervisors — for a DECREASE the form must capture a
 *      DISTINCT second person who ALSO holds warehouse.stock.adjust AND has an
 *      enrolled PIN (the exact gate applyDirectAdjustment re-runs in-txn:
 *      direct-adjust-actions.ts:487-510). This search powers the supervisor
 *      combobox; the server still re-verifies everything, so the list is a
 *      convenience, never the authority. The current user is excluded (SoD).
 *
 *   3. listDecreaseLps — the optional "specific pallet (LP)" picker for a
 *      decrease: the available, released, unreserved LPs at the chosen location
 *      for the chosen item (mirrors the selection the mutation makes for FEFO,
 *      direct-adjust-actions.ts:142-159), so the operator can pin one pallet.
 *
 * RBAC: every read is gated on warehouse.stock.adjust (the same elevated grant
 * the mutation requires) and runs inside withOrgContext (RLS → app_user →
 * app.current_org_id()). No mocks; real Supabase only.
 */

import { assertNoActiveHoldForLp } from '@monopilot/server/quality/holdsGuard.js';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasWarehousePermission,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from '../../_actions/shared';
import { searchItems } from '../../../../../../(npd)/fa/actions/search-items';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';
// Types live in a non-'use server' sibling — a 'use server' module may export
// ONLY async functions (exporting a type breaks `next build`).
import type { DirectAdjustFormContext, EligibleSupervisor, DecreaseLpOption } from './adjust-form-types';

const WAREHOUSE_STOCK_ADJUST_PERMISSION = 'warehouse.stock.adjust';

/**
 * Item search for the adjustment picker. Wraps the org-scoped searchItems
 * (the established items-master combobox) but widens the item-type fan-out to
 * INCLUDE finished goods + packaging — any stocked item can be adjusted, whereas
 * the recipe-component default deliberately omits fg/packaging. searchItems is
 * itself RLS-pinned per org.
 */
export async function searchAdjustItems(input: { query?: string } = {}): Promise<ItemPickerOption[]> {
  return searchItems({
    query: input.query,
    itemTypes: ['fg', 'rm', 'ingredient', 'intermediate', 'co_product', 'byproduct', 'packaging'],
  });
}

/**
 * Page gate: confirms the caller holds warehouse.stock.adjust. Returns the
 * (empty) form context on success or a `forbidden` reason the page renders as a
 * denied panel. RBAC is resolved server-side — the page never trusts a client
 * flag.
 */
export async function getDirectAdjustFormContext(): Promise<WarehouseResult<DirectAdjustFormContext>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<DirectAdjustFormContext>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_STOCK_ADJUST_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }
      return { ok: true, data: { canAdjust: true } };
    });
  } catch (error) {
    console.error('[warehouse] getDirectAdjustFormContext failed', error);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Search the org's users who can act as the supervisor for a DECREASE: a
 * DISTINCT person (≠ caller) who holds warehouse.stock.adjust AND has an enrolled
 * PIN. Matches name / email (case-insensitive). Capped at 20. The mutation
 * re-verifies SoD + grant + PIN in-txn, so this list is advisory only.
 */
export async function searchEligibleSupervisors(
  input: { query?: string } = {},
): Promise<WarehouseResult<EligibleSupervisor[]>> {
  const term = typeof input.query === 'string' && input.query.trim().length > 0 ? input.query.trim() : null;
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<EligibleSupervisor[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      // The caller must themselves hold the grant to even open the adjust form.
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_STOCK_ADJUST_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const like = term ? `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;
      const { rows } = await ctx.client.query<{ id: string; name: string | null; email: string }>(
        `select distinct u.id::text, u.name, u.email::text as email
           from public.users u
           join public.user_roles ur
             on ur.user_id = u.id
            and ur.org_id = $1::uuid
           join public.roles r
             on r.id = ur.role_id
            and r.org_id = $1::uuid
           left join public.role_permissions rp
             on rp.role_id = r.id
            and rp.permission = $2
          where u.is_active = true
            and u.id <> $3::uuid
            and exists (select 1 from public.user_pins up where up.user_id = u.id)
            and (
              rp.permission is not null
              or coalesce(r.permissions, '[]'::jsonb) ? $2
            )
            and ($4::text is null or u.name ilike $4 escape '\\' or u.email::text ilike $4 escape '\\')
          order by u.name nulls last, u.email::text
          limit 20`,
        [orgId, WAREHOUSE_STOCK_ADJUST_PERMISSION, userId, like],
      );

      return {
        ok: true,
        data: rows.map((r) => ({ id: r.id, name: r.name, email: r.email })),
      };
    });
  } catch (error) {
    console.error('[warehouse] searchEligibleSupervisors failed', error);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Available, released, unreserved LPs at a location for an item — the candidate
 * pallets the operator can pin for a DECREASE (mirrors the mutation's FEFO
 * selection, direct-adjust-actions.ts:142-159: status='available',
 * qa_status='released', quantity>reserved_qty). Ordered FEFO (earliest expiry
 * first) so the default top option matches what the auto path would take.
 */
export async function listDecreaseLps(
  input: { locationId: string; itemId: string },
): Promise<WarehouseResult<DecreaseLpOption[]>> {
  const locationId = typeof input.locationId === 'string' ? input.locationId.trim() : '';
  const itemId = typeof input.itemId === 'string' ? input.itemId.trim() : '';
  if (locationId === '' || itemId === '') return { ok: true, data: [] };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<DecreaseLpOption[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_STOCK_ADJUST_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const { rows } = await ctx.client.query<{
        id: string;
        lp_number: string;
        available_qty: string;
        uom: string;
        batch_number: string | null;
        expiry_date: string | null;
      }>(
        `select lp.id::text,
                lp.lp_number,
                (lp.quantity - lp.reserved_qty)::text as available_qty,
                lp.uom,
                lp.batch_number,
                lp.expiry_date::text as expiry_date
           from public.license_plates lp
          where lp.org_id = app.current_org_id()
            and lp.location_id = $1::uuid
            and lp.product_id = $2::uuid
            and lp.status = 'available'
            and lp.qa_status = 'released'
            and lp.quantity > lp.reserved_qty
          order by lp.expiry_date asc nulls last, lp.lp_number asc
          limit 100`,
        [locationId, itemId],
      );

      const releasableRows = [];
      for (const row of rows) {
        try {
          await assertNoActiveHoldForLp(row.id, ctx.client);
          releasableRows.push(row);
        } catch (error) {
          if (typeof error !== 'object' || error === null || (error as { code?: string }).code !== 'QA_HOLD_ACTIVE') {
            throw error;
          }
        }
      }

      return {
        ok: true,
        data: releasableRows.map((r) => ({
          id: r.id,
          lpNumber: r.lp_number,
          availableQty: r.available_qty,
          uom: r.uom,
          batchNumber: r.batch_number,
          expiryDate: r.expiry_date,
        })),
      };
    });
  } catch (error) {
    console.error('[warehouse] listDecreaseLps failed', error);
    return { ok: false, reason: 'error' };
  }
}
