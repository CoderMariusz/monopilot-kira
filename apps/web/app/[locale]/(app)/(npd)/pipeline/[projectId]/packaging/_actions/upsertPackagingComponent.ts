'use server';

/**
 * NPD PACKAGING stage — `upsertPackagingComponent` write Server Action.
 *
 * INSERT (no id) or UPDATE (id present) a packaging component. Org-scoped via
 * withOrgContext (RLS as app_user). RBAC: requires `npd.packaging.write`. Writes
 * an audit_log row in the SAME txn and revalidates the packaging route.
 *
 * NUMERIC-exact: cost_per_unit is bound as a decimal STRING ::numeric, never a
 * JS float. Red lines: zod-validate before the txn; map DB errors to the closed
 * enum; never echo internal columns.
 */

import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  PACKAGING_WRITE_PERMISSION,
  UpsertPackagingComponentSchema,
  hasPermission,
  writeAudit,
  type QueryClient,
  type UpsertPackagingResult,
} from './shared';

export async function upsertPackagingComponent(raw: unknown): Promise<UpsertPackagingResult> {
  const parsed = UpsertPackagingComponentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      const canWrite = await hasPermission(queryClient, userId, orgId, PACKAGING_WRITE_PERMISSION);
      if (!canWrite) return { ok: false as const, error: 'forbidden' as const };

      // The project must belong to this org (FK + RLS scope).
      const proj = await queryClient.query<{ id: string }>(
        `select id from public.npd_projects
          where id = $1::uuid and org_id = app.current_org_id() limit 1`,
        [input.projectId],
      );
      if (proj.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

      const material = input.material ?? null;
      const supplierCode = input.supplierCode ?? null;
      const spec = input.spec ?? null;
      const costPerUnit = input.costPerUnit ?? null;
      const scrapPct = input.scrapPct;
      const qtyPerPack = input.qtyPerPack ?? null;
      const displayOrder = input.displayOrder ?? 0;
      const itemId = input.itemId ?? null;

      if (itemId) {
        const item = await queryClient.query<{ id: string }>(
          `select id from public.items
            where id = $1::uuid
              and org_id = app.current_org_id()
              and item_type = 'packaging'
            limit 1`,
          [itemId],
        );
        if (item.rows.length === 0) return { ok: false as const, error: 'invalid_input' as const };
      }

      if (input.id) {
        // ─── UPDATE ───────────────────────────────────────────────────────────
        const before = await queryClient.query<Record<string, unknown>>(
          `select id, tier, component_name, material, supplier_code, spec, item_id,
                  cost_per_unit::text as cost_per_unit, scrap_pct, qty_per_pack, status, display_order
             from public.packaging_components
            where id = $1::uuid and org_id = app.current_org_id() limit 1`,
          [input.id],
        );
        if (before.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

        const updated = await queryClient.query<{ id: string }>(
          `update public.packaging_components
              set tier          = $2,
                  component_name = $3,
                  material       = $4,
                  supplier_code  = $5,
                  spec           = $6,
                  cost_per_unit  = $7::numeric,
                  scrap_pct      = $8::numeric,
                  qty_per_pack   = $9::numeric,
                  status         = $10,
                  display_order  = $11,
                  item_id        = $12::uuid,
                  updated_by     = $13::uuid
            where id = $1::uuid and org_id = app.current_org_id()
            returning id`,
          [
            input.id,
            input.tier,
            input.componentName,
            material,
            supplierCode,
            spec,
            costPerUnit,
            scrapPct,
            qtyPerPack,
            input.status,
            displayOrder,
            itemId,
            userId,
          ],
        );
        const id = updated.rows[0]?.id;
        if (!id) return { ok: false as const, error: 'not_found' as const };

        await writeAudit(queryClient, {
          orgId,
          actorUserId: userId,
          action: 'npd.packaging.component.updated',
          resourceId: id,
          beforeState: before.rows[0],
          afterState: {
            tier: input.tier,
            componentName: input.componentName,
            material,
            supplierCode,
            spec,
            costPerUnit,
            scrapPct,
            qtyPerPack,
            status: input.status,
            displayOrder,
            itemId,
          },
        });

        revalidatePath(`/[locale]/pipeline/${input.projectId}/packaging`, 'page');
        return { ok: true as const, data: { id } };
      }

      // ─── INSERT ─────────────────────────────────────────────────────────────
      const inserted = await queryClient.query<{ id: string }>(
        `insert into public.packaging_components
           (org_id, project_id, tier, component_name, material, supplier_code, spec,
            cost_per_unit, scrap_pct, qty_per_pack, status, display_order, item_id, created_by, updated_by)
         values
           (app.current_org_id(), $1::uuid, $2, $3, $4, $5, $6,
            $7::numeric, $8::numeric, $9::numeric, $10, $11, $12::uuid, $13::uuid, $14::uuid)
         returning id`,
        [
          input.projectId,
          input.tier,
          input.componentName,
          material,
          supplierCode,
          spec,
          costPerUnit,
          scrapPct,
          qtyPerPack,
          input.status,
          displayOrder,
          itemId,
          userId,
          userId,
        ],
      );
      const id = inserted.rows[0]?.id;
      if (!id) return { ok: false as const, error: 'persistence_failed' as const };

      await writeAudit(queryClient, {
        orgId,
        actorUserId: userId,
        action: 'npd.packaging.component.created',
        resourceId: id,
        beforeState: null,
        afterState: {
          projectId: input.projectId,
          tier: input.tier,
          componentName: input.componentName,
          material,
          supplierCode,
          spec,
          costPerUnit,
          scrapPct,
          qtyPerPack,
          status: input.status,
          displayOrder,
          itemId,
        },
      });

      revalidatePath(`/[locale]/pipeline/${input.projectId}/packaging`, 'page');
      return { ok: true as const, data: { id } };
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '23503') return { ok: false, error: 'not_found' };
    console.error('[upsertPackagingComponent] persistence_failed', {
      projectId: input.projectId,
      id: input.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
