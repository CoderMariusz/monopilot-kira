'use server';

/**
 * 03-technical Routings surface (TEC-060/062, T-051/T-052): page-load action.
 *
 * Lists the org's items for the routing page's item picker and resolves the
 * caller's routing-authoring (`technical.bom.create`) and approve
 * (`technical.bom.approve`) permissions (routings reuse the BOM RBAC family —
 * see _actions/shared.ts). Also lists the org's production lines so
 * the routing-edit modal can bind each operation to a real line FK
 * (never free text). Org-scoped via withOrgContext + RLS (`app.current_org_id()`).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type OrgActionContext,
  type QueryClient,
  ROUTING_APPROVE_PERMISSION,
  ROUTING_WRITE_PERMISSION,
} from './shared';

export type RoutingItemOption = { id: string; itemCode: string; name: string };

/**
 * PF-R06-07: a line option carries its SITE identity. Line codes repeat across
 * plants (`LINE01` exists in every site), so `code · name` alone cannot tell the
 * operator which physical plant owns the line — and the picker offered lines the
 * server then rejects with V-TEC-64. `siteId` is what the edit modal filters on;
 * `siteCode`/`siteName` are what the operator reads. All three are null for
 * org-wide lines (`production_lines.site_id is null`). Same shape as the NPD
 * pilot line picker (npd/pipeline/.../_actions/list-production-lines.ts).
 */
export type ResourceOption = {
  id: string;
  code: string;
  name: string;
  siteId: string | null;
  siteCode: string | null;
  siteName: string | null;
};

export type ListRoutingItemsState = 'ready' | 'empty' | 'error';

export type ListRoutingItemsResult = {
  items: RoutingItemOption[];
  lines: ResourceOption[];
  operationNames: string[];
  canWrite: boolean;
  canApprove: boolean;
  state: ListRoutingItemsState;
};

type ItemRow = { id: string; item_code: string; name: string };
type ResourceRow = {
  id: string;
  code: string;
  name: string;
  site_id: string | null;
  site_code: string | null;
  site_name: string | null;
};
type OpNameRow = { operation_name: string };

const ITEM_LOOKUP_LIMIT = 500;
const OPERATION_NAME_LOOKUP_LIMIT = 200;

export async function listRoutingItems(): Promise<ListRoutingItemsResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListRoutingItemsResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };

      const [itemRows, lineRows, opRows, canWrite, canApprove] = await Promise.all([
        qc.query<ItemRow>(
          `select id, item_code, name from public.items
            where org_id = app.current_org_id() order by item_code asc limit $1`,
          [ITEM_LOOKUP_LIMIT],
        ),
        // Production lines live in 02-settings (production_lines).
        // Tolerate their absence so the page still renders if a fresh org has none.
        // PF-R06-07: left join public.sites so every option can name its plant.
        // LEFT join, never inner — an org-wide line (site_id is null) is a legal
        // routing resource and must stay in the list.
        //
        // R-8: NO `limit`. This list is a picker the edit modal then narrows to the
        // routing's site, so a global cap applied BEFORE that narrowing silently
        // truncated the wrong end: an org whose alphabetically earlier sites filled
        // the first 200 rows left a routing pinned to a later site with an EMPTY
        // line picker and no way to edit its operations. The routing's site is not
        // known at page load (one page lists several routings, each with its own
        // pin), so the predicate cannot move into this query — and a per-site cap
        // would truncate a large site just the same. The set is bounded by
        // physical plant: the NPD line picker
        // ((npd)/pipeline/[projectId]/pilot/_actions/list-production-lines.ts) has
        // shipped unbounded against the same table.
        // ponytail: unbounded read of an org's active lines. If an org ever holds
        // thousands, add server-side search here — not a cap, which reintroduces
        // exactly this bug.
        qc
          .query<ResourceRow>(
            `select pl.id, pl.code, pl.name,
                    pl.site_id::text as site_id,
                    s.site_code,
                    s.name as site_name
               from public.production_lines pl
               left join public.sites s
                 on s.id = pl.site_id
                and s.org_id = pl.org_id
              where pl.org_id = app.current_org_id() and pl.status = 'active'
              order by s.site_code nulls last, pl.code asc`,
          )
          .catch(() => ({ rows: [] as ResourceRow[] })),
        qc
          .query<OpNameRow>(
            `select operation_name from "Reference"."ManufacturingOperations"
              where org_id = app.current_org_id() and is_active = true order by operation_name asc limit $1`,
            [OPERATION_NAME_LOOKUP_LIMIT],
          )
          .catch(() => ({ rows: [] as OpNameRow[] })),
        hasPermission(ctx, ROUTING_WRITE_PERMISSION),
        hasPermission(ctx, ROUTING_APPROVE_PERMISSION),
      ]);

      const items: RoutingItemOption[] = itemRows.rows.map((r) => ({
        id: String(r.id),
        itemCode: r.item_code,
        name: r.name,
      }));

      return {
        items,
        lines: lineRows.rows.map((r) => ({
          id: String(r.id),
          code: r.code,
          name: r.name,
          siteId: r.site_id ?? null,
          siteCode: r.site_code ?? null,
          siteName: r.site_name ?? null,
        })),
        operationNames: opRows.rows.map((r) => r.operation_name),
        canWrite,
        canApprove,
        state: items.length ? 'ready' : 'empty',
      };
    });
  } catch (error) {
    console.error('[technical/routings] listRoutingItems load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return {
      items: [],
      lines: [],
      operationNames: [],
      canWrite: false,
      canApprove: false,
      state: 'error',
    };
  }
}
