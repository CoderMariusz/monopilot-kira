'use server';

/**
 * 03-technical Routings surface (TEC-060/062, T-051/T-052): page-load action.
 *
 * Lists the org's items for the routing page's item picker and resolves the
 * caller's routing-authoring (`technical.bom.create`) and approve
 * (`technical.bom.approve`) permissions (routings reuse the BOM RBAC family —
 * see _actions/shared.ts). Also lists the org's production lines + machines so
 * the routing-edit modal can bind each operation to a real line/equipment FK
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
export type ResourceOption = { id: string; code: string; name: string };

export type ListRoutingItemsState = 'ready' | 'empty' | 'error';

export type ListRoutingItemsResult = {
  items: RoutingItemOption[];
  lines: ResourceOption[];
  machines: ResourceOption[];
  operationNames: string[];
  canWrite: boolean;
  canApprove: boolean;
  state: ListRoutingItemsState;
};

type ItemRow = { id: string; item_code: string; name: string };
type ResourceRow = { id: string; code: string; name: string };
type OpNameRow = { operation_name: string };

const ITEM_LOOKUP_LIMIT = 500;
const RESOURCE_LOOKUP_LIMIT = 200;

export async function listRoutingItems(): Promise<ListRoutingItemsResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListRoutingItemsResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };

      const [itemRows, lineRows, machineRows, opRows, canWrite, canApprove] = await Promise.all([
        qc.query<ItemRow>(
          `select id, item_code, name from public.items
            where org_id = app.current_org_id() order by item_code asc limit $1`,
          [ITEM_LOOKUP_LIMIT],
        ),
        // Production lines + machines live in 02-settings (production_lines / machines).
        // Tolerate their absence so the page still renders if a fresh org has none.
        qc
          .query<ResourceRow>(
            `select id, code, name from public.production_lines
              where org_id = app.current_org_id() and status = 'active' order by code asc limit $1`,
            [RESOURCE_LOOKUP_LIMIT],
          )
          .catch(() => ({ rows: [] as ResourceRow[] })),
        qc
          .query<ResourceRow>(
            `select id, code, name from public.machines
              where org_id = app.current_org_id() and status = 'active' order by code asc limit $1`,
            [RESOURCE_LOOKUP_LIMIT],
          )
          .catch(() => ({ rows: [] as ResourceRow[] })),
        qc
          .query<OpNameRow>(
            `select operation_name from "Reference"."ManufacturingOperations"
              where org_id = app.current_org_id() and is_active = true order by operation_name asc limit $1`,
            [RESOURCE_LOOKUP_LIMIT],
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
        lines: lineRows.rows.map((r) => ({ id: String(r.id), code: r.code, name: r.name })),
        machines: machineRows.rows.map((r) => ({ id: String(r.id), code: r.code, name: r.name })),
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
      machines: [],
      operationNames: [],
      canWrite: false,
      canApprove: false,
      state: 'error',
    };
  }
}
