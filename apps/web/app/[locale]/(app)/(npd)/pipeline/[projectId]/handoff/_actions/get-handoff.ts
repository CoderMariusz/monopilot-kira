'use server';

/**
 * NPD HANDOFF stage — `getHandoff` read Server Action.
 *
 * Reads the (single, per-project) handoff checklist + its line items + the
 * destination-BOM facts surfaced on the screen (destination_bom_code, the
 * project's product code/SKU, promote_to_production_date, the destination
 * warehouse name, and the factory-release linkage if the project was already
 * released). Org-scoped via withOrgContext → RLS engaged with
 * app.current_org_id(). RBAC read gate = `npd.handoff.read` (BYTE-IDENTICAL to
 * the seeded permission string in migration 236).
 *
 * No mocks, no hard-coded rows. `ready` (the green "Ready to promote" bar) is
 * derived here as "every checklist item is checked" so the screen never
 * re-derives the gate.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

const Input = z.object({
  projectId: z.string().uuid(),
});
export type GetHandoffInput = z.infer<typeof Input>;

export type HandoffChecklistItemDto = {
  id: string;
  label: string;
  isChecked: boolean;
  displayOrder: number;
};

export type HandoffDestinationBomDto = {
  /** destination_bom_code (soft-ref to bom_headers, 03-technical). */
  bomCode: string | null;
  /** Product SKU = npd_projects.product_code. */
  productSku: string | null;
  /** Product display name (when the FG candidate is mapped). */
  productName: string | null;
  /** promote_to_production_date (date, nullable). */
  effectiveFrom: string | null;
  /** Destination warehouse name (resolved from destination_warehouse_id). */
  warehouseName: string | null;
  /** Factory-release linkage (set once the project is released to factory). */
  releaseStatus: string | null;
  releaseBomHeaderId: string | null;
};

export type HandoffData = {
  checklistId: string;
  projectId: string;
  bomVerificationStatus: string | null;
  promoteToProductionDate: string | null;
  /** True ⇔ a checklist exists with ≥1 item and every item is checked. */
  ready: boolean;
  /** True once the factory release has been recorded for this project. */
  promoted: boolean;
  checklist: HandoffChecklistItemDto[];
  destinationBom: HandoffDestinationBomDto;
};

export type GetHandoffError = 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed';

export type GetHandoffResult =
  | { ok: true; data: HandoffData }
  | { ok: false; error: GetHandoffError; message?: string };

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

const READ_PERMISSION = 'npd.handoff.read';

/**
 * Shared RBAC probe for the handoff stage. Checks BOTH normalized
 * role_permissions and the legacy roles.permissions jsonb cache (some orgs are
 * seeded only via the jsonb path — mirrors pipeline/_actions/shared.hasPermission).
 */
export async function hasHandoffPermission(
  ctx: { userId: string; orgId: string; client: QueryClient },
  permission: string,
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

type ChecklistRow = {
  id: string;
  bom_verification_status: string | null;
  destination_bom_code: string | null;
  promote_to_production_date: string | null;
  destination_warehouse_id: string | null;
};

type ItemRow = {
  id: string;
  label: string;
  is_checked: boolean;
  display_order: number;
};

type ProjectRow = {
  product_code: string | null;
  product_name: string | null;
};

type WarehouseRow = { name: string };

type ReleaseRow = {
  release_status: string | null;
  active_bom_header_id: string | null;
};

export async function getHandoff(raw: unknown): Promise<GetHandoffResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const { projectId } = parsed.data;

  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

      if (!(await hasHandoffPermission(ctx, READ_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const checklistRes = await ctx.client.query<ChecklistRow>(
        `select id,
                bom_verification_status,
                destination_bom_code,
                promote_to_production_date::text as promote_to_production_date,
                destination_warehouse_id
           from public.handoff_checklists
          where project_id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const checklist = checklistRes.rows[0];
      if (!checklist) {
        return { ok: false as const, error: 'not_found' as const };
      }

      const itemsRes = await ctx.client.query<ItemRow>(
        `select id, label, is_checked, display_order
           from public.handoff_checklist_items
          where handoff_checklist_id = $1::uuid
            and org_id = app.current_org_id()
          order by display_order asc, label asc`,
        [checklist.id],
      );

      const projectRes = await ctx.client.query<ProjectRow>(
        `select np.product_code,
                p.product_name
           from public.npd_projects np
           left join public.product p
             on p.product_code = np.product_code
            and p.org_id = np.org_id
          where np.id = $1::uuid
            and np.org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const project = projectRes.rows[0] ?? { product_code: null, product_name: null };

      let warehouseName: string | null = null;
      if (checklist.destination_warehouse_id) {
        const whRes = await ctx.client.query<WarehouseRow>(
          `select name
             from public.warehouses
            where id = $1::uuid
              and org_id = app.current_org_id()
            limit 1`,
          [checklist.destination_warehouse_id],
        );
        warehouseName = whRes.rows[0]?.name ?? null;
      }

      const releaseRes = await ctx.client.query<ReleaseRow>(
        `select release_status, active_bom_header_id
           from public.factory_release_status
          where project_id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const release = releaseRes.rows[0] ?? null;

      const items = itemsRes.rows.map((r) => ({
        id: r.id,
        label: r.label,
        isChecked: r.is_checked,
        displayOrder: r.display_order,
      }));
      const ready = items.length > 0 && items.every((i) => i.isChecked);
      const promoted =
        release?.release_status === 'released_to_factory' ||
        checklist.promote_to_production_date !== null;

      return {
        ok: true as const,
        data: {
          checklistId: checklist.id,
          projectId,
          bomVerificationStatus: checklist.bom_verification_status,
          promoteToProductionDate: checklist.promote_to_production_date,
          ready,
          promoted,
          checklist: items,
          destinationBom: {
            bomCode: checklist.destination_bom_code ?? release?.active_bom_header_id ?? null,
            productSku: project.product_code,
            productName: project.product_name,
            effectiveFrom: checklist.promote_to_production_date,
            warehouseName,
            releaseStatus: release?.release_status ?? null,
            releaseBomHeaderId: release?.active_bom_header_id ?? null,
          },
        },
      };
    });
  } catch (error) {
    console.error('[getHandoff] org-scoped read failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
