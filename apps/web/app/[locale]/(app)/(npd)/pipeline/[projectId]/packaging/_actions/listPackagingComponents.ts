'use server';

/**
 * NPD PACKAGING stage — `listPackagingComponents` read Server Action.
 *
 * Org-scoped read of public.packaging_components for a project. Wrapped in
 * withOrgContext (RLS via app.current_org_id() as app_user). RBAC: requires
 * `npd.packaging.read`. cost_per_unit is cast ::text → decimal STRING (never a
 * JS float). Returns the whitelisted read-model only.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  ListPackagingComponentsSchema,
  PACKAGING_READ_PERMISSION,
  hasPermission,
  type ListPackagingResult,
  type PackagingComponentRow,
  type PackagingStatus,
  type PackagingTier,
  type QueryClient,
} from './shared';

type LoaderRow = {
  id: string;
  tier: string;
  component_name: string;
  material: string | null;
  supplier_code: string | null;
  supplier_id: string | null;
  spec: string | null;
  cost_per_unit: string | null;
  /** NUMERIC(5,2) — the pg driver may hand this back as a string; coerced on map. */
  scrap_pct: string | number | null;
  waste_pct: string | number | null;
  qty_per_pack: string | number | null;
  status: string;
  artwork_file_id: string | null;
  artwork_status: string | null;
  display_order: number;
};

export async function listPackagingComponents(raw: unknown): Promise<ListPackagingResult> {
  const parsed = ListPackagingComponentsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const { projectId } = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      const canRead = await hasPermission(queryClient, userId, orgId, PACKAGING_READ_PERMISSION);
      if (!canRead) return { ok: false as const, error: 'forbidden' as const };

      // Confirm the project belongs to this org (RLS already scopes, but a
      // not_found is the correct surface for a foreign/absent project).
      const proj = await queryClient.query<{ id: string }>(
        `select id from public.npd_projects
          where id = $1::uuid and org_id = app.current_org_id() limit 1`,
        [projectId],
      );
      if (proj.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

      const { rows } = await queryClient.query<LoaderRow>(
        `select id,
                tier,
                component_name,
                material,
                supplier_id::text as supplier_id,
                supplier_code,
                spec,
                cost_per_unit::text as cost_per_unit,
                coalesce(scrap_pct, 0) as scrap_pct,
                coalesce(waste_pct, 0) as waste_pct,
                qty_per_pack,
                status,
                artwork_file_id,
                artwork_status,
                display_order
           from public.packaging_components
          where org_id = app.current_org_id()
            and project_id = $1::uuid
          order by tier asc, display_order asc, component_name asc`,
        [projectId],
      );

      const data: PackagingComponentRow[] = rows.map((r) => ({
        id: r.id,
        tier: r.tier as PackagingTier,
        componentName: r.component_name,
        material: r.material,
        supplierId: r.supplier_id,
        supplierCode: r.supplier_code,
        spec: r.spec,
        costPerUnit: r.cost_per_unit,
        scrapPct: Number(r.scrap_pct ?? 0),
        wastePct: Number(r.waste_pct ?? 0),
        qtyPerPack: r.qty_per_pack == null ? null : Number(r.qty_per_pack),
        status: r.status as PackagingStatus,
        artworkFileId: r.artwork_file_id,
        artworkStatus: r.artwork_status,
        displayOrder: r.display_order,
      }));

      return { ok: true as const, data };
    });
  } catch (error) {
    console.error('[listPackagingComponents] org-scoped read failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
