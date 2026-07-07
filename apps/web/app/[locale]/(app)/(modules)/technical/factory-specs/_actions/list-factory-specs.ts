'use server';

/**
 * T-060 — Factory Specs list Server Action (TEC-086).
 *
 * Org-scoped read of public.factory_specs (the Technical-owned, versioned
 * production spec — migration 165) joined to the FG item master (items, mig 153)
 * and the paired shared-BOM SSOT header (bom_headers, mig 090). All reads run under
 * withOrgContext + RLS (`app.current_org_id()`); no service-role bypass, no mocks.
 *
 * Backing domain is `factory_specs`/`internal_product_spec` — NOT a generic
 * `reference_tables.specifications` store (AC6 red line).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  canApproveFactorySpec,
  canRecallFactorySpec,
  type FactorySpecListItem,
  isFactorySpecStatus,
  type OrgActionContext,
  type QueryClient,
} from './shared';

export type ListFactorySpecsState = 'ready' | 'empty' | 'error';

export type ListFactorySpecsResult = {
  specs: FactorySpecListItem[];
  canApprove: boolean;
  /** R4-CL2 — caller holds technical.factory_spec.recall (gates "Recall to draft"). */
  canRecall: boolean;
  state: ListFactorySpecsState;
};

type SpecRow = {
  id: string;
  spec_code: string;
  version: number;
  status: string;
  source: string;
  fg_item_id: string;
  fg_item_code: string;
  fg_name: string;
  product_group: string | null;
  shelf_life_days: number | null;
  bom_header_id: string | null;
  bom_version: number | null;
  bom_status: string | null;
  d365_item_id: string | null;
  fg_npd_project_id: string | null;
  updated_at: string | Date;
};

function mapRow(row: SpecRow): FactorySpecListItem | null {
  if (!isFactorySpecStatus(row.status)) return null;
  return {
    id: String(row.id),
    specCode: row.spec_code,
    version: Number(row.version),
    status: row.status,
    source: row.source,
    fgItemId: String(row.fg_item_id),
    fgItemCode: row.fg_item_code,
    fgName: row.fg_name,
    productGroup: row.product_group,
    shelfLifeDays: row.shelf_life_days === null ? null : Number(row.shelf_life_days),
    bomHeaderId: row.bom_header_id === null ? null : String(row.bom_header_id),
    bomVersion: row.bom_version === null ? null : Number(row.bom_version),
    bomStatus: row.bom_status,
    d365ItemId: row.d365_item_id,
    fgNpdProjectId: row.fg_npd_project_id === null ? null : String(row.fg_npd_project_id),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listFactorySpecs(): Promise<ListFactorySpecsResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListFactorySpecsResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const [specsResult, canApprove, canRecall] = await Promise.all([
        (client as QueryClient).query<SpecRow>(
          `select fs.id,
                  fs.spec_code,
                  fs.version,
                  fs.status,
                  fs.source,
                  fs.fg_item_id,
                  i.item_code as fg_item_code,
                  i.name as fg_name,
                  i.product_group,
                  i.shelf_life_days,
                  fs.bom_header_id,
                  fs.bom_version,
                  bh.status as bom_status,
                  fs.d365_item_id,
                  i.npd_project_id::text as fg_npd_project_id,
                  fs.updated_at
             from public.factory_specs fs
             join public.items i on i.id = fs.fg_item_id
             left join public.bom_headers bh on bh.id = fs.bom_header_id
            where fs.org_id = app.current_org_id()
            order by i.item_code asc, fs.version desc`,
        ),
        canApproveFactorySpec(ctx),
        canRecallFactorySpec(ctx),
      ]);

      const specs = specsResult.rows
        .map(mapRow)
        .filter((row): row is FactorySpecListItem => row !== null);

      return { specs, canApprove, canRecall, state: specs.length ? 'ready' : 'empty' };
    });
  } catch (error) {
    console.error('[technical/factory-specs] listFactorySpecs load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { specs: [], canApprove: false, canRecall: false, state: 'error' };
  }
}
