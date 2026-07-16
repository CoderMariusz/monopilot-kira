/**
 * W3 L10 — WIP library page loaders (data + RBAC flags).
 */

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getWipDefinition, listWipDefinitions } from '../_actions/wip-definition-actions';
import type { ListWipDefinitionsInput } from '../_actions/wip-definition-schemas';
import {
  WIP_CREATE_PERMISSION,
  WIP_DEACTIVATE_PERMISSION,
  WIP_EDIT_PERMISSION,
  type OperationOption,
  type WipDefinitionDetail,
  type WipDefinitionListItem,
  type WipIngredientRow,
  type WipProcessRow,
  type WipWhereUsedRow,
} from './wip-definition-contract';
import {
  mapDefinition,
  mapIngredient,
  mapListItem,
  mapProcess,
  mapWhereUsed,
} from './map-wip-api';

export type WipListPageState = 'ready' | 'empty' | 'error';

export type WipListPageResult = {
  definitions: WipDefinitionListItem[];
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  state: WipListPageState;
};

export type WipDetailPageResult = {
  ok: boolean;
  definition: WipDefinitionDetail | null;
  ingredients: WipIngredientRow[];
  processes: WipProcessRow[];
  whereUsed: WipWhereUsedRow[];
  operations: OperationOption[];
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  state: 'ready' | 'error' | 'not_found';
  /** When a stale/archived id was requested, the active definition id to redirect to. */
  redirectToId?: string;
};

type OpRow = { id: string; operation_name: string };

export async function loadWipListPage(filter?: ListWipDefinitionsInput): Promise<WipListPageResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx = { userId, orgId, client };
      const [listResult, canCreate, canEdit, canDeactivate] = await Promise.all([
        listWipDefinitions(filter),
        hasPermission(ctx, WIP_CREATE_PERMISSION),
        hasPermission(ctx, WIP_EDIT_PERMISSION),
        hasPermission(ctx, WIP_DEACTIVATE_PERMISSION),
      ]);

      if (!listResult.ok) {
        return {
          definitions: [],
          canCreate,
          canEdit,
          canDeactivate,
          state: 'error',
        };
      }

      const definitions = listResult.definitions
        .map(mapListItem)
        .filter((row): row is WipDefinitionListItem => row !== null);

      return {
        definitions,
        canCreate,
        canEdit,
        canDeactivate,
        state: definitions.length ? 'ready' : 'empty',
      };
    });
  } catch (error) {
    console.error('[technical/wip-library] loadWipListPage failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return {
      definitions: [],
      canCreate: false,
      canEdit: false,
      canDeactivate: false,
      state: 'error',
    };
  }
}

export async function loadWipDetailPage(id: string): Promise<WipDetailPageResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx = { userId, orgId, client };
      const [detailResult, canCreate, canEdit, canDeactivate, opRows] = await Promise.all([
        getWipDefinition(id),
        hasPermission(ctx, WIP_CREATE_PERMISSION),
        hasPermission(ctx, WIP_EDIT_PERMISSION),
        hasPermission(ctx, WIP_DEACTIVATE_PERMISSION),
        client
          .query<OpRow>(
            `select id, operation_name
               from "Reference"."ManufacturingOperations"
              where org_id = app.current_org_id()
                and is_active = true
              order by operation_name asc
              limit 200`,
          )
          .catch(() => ({ rows: [] as OpRow[] })),
      ]);

      const operations: OperationOption[] = opRows.rows.map((row) => ({
        id: String(row.id),
        operationName: row.operation_name,
      }));

      if (!detailResult.ok) {
        return {
          ok: false,
          definition: null,
          ingredients: [],
          processes: [],
          whereUsed: [],
          operations,
          canCreate,
          canEdit,
          canDeactivate,
          state: 'not_found',
        };
      }

      const definition = mapDefinition(detailResult.definition);
      if (!definition) {
        return {
          ok: false,
          definition: null,
          ingredients: [],
          processes: [],
          whereUsed: [],
          operations,
          canCreate,
          canEdit,
          canDeactivate,
          state: 'not_found',
        };
      }

      const resolvedFromId =
        detailResult.ok && 'resolvedFromId' in detailResult && typeof detailResult.resolvedFromId === 'string'
          ? detailResult.resolvedFromId
          : undefined;

      return {
        ok: true,
        definition,
        ingredients: detailResult.ingredients
          .map(mapIngredient)
          .filter((row): row is WipIngredientRow => row !== null),
        processes: detailResult.processes
          .map(mapProcess)
          .filter((row): row is WipProcessRow => row !== null),
        whereUsed: detailResult.whereUsed
          .map(mapWhereUsed)
          .filter((row): row is WipWhereUsedRow => row !== null),
        operations,
        canCreate,
        canEdit,
        canDeactivate,
        state: 'ready',
        ...(resolvedFromId ? { redirectToId: definition.id } : {}),
      };
    });
  } catch (error) {
    console.error('[technical/wip-library] loadWipDetailPage failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      definition: null,
      ingredients: [],
      processes: [],
      whereUsed: [],
      operations: [],
      canCreate: false,
      canEdit: false,
      canDeactivate: false,
      state: 'error',
    };
  }
}
