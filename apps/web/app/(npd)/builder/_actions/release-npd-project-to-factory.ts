'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { type OrgContextLike } from '../../pipeline/_actions/shared';
import { materializeNpdBom } from '../../pipeline/_actions/_lib/materialize-npd-bom';
import {
  RELEASED_TO_FACTORY_EVENT,
  insertReleasedToFactoryEvent,
  transitionFactorySpecToReleased,
  upsertFactoryReleaseStatus,
} from '../../../../lib/technical/factory-release-persistence';
import {
  ReleasePreflightError,
  runReleasePreflight,
  requireReleasePermission,
  type ReleasePreflightBlocker,
} from '../_lib/release-preflight';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';
import type { ReleaseNpdProjectToFactoryResult } from './release-npd-project-to-factory-types';

const APP_VERSION = 't-096';

const inputSchema = z.union([
  z.string().uuid().transform((projectId) => ({ projectId, activeFactorySpecId: undefined as string | undefined })),
  z.object({
    projectId: z.string().uuid(),
    activeFactorySpecId: z.string().uuid().optional().nullable(),
  }),
]);

type ReleaseRow = {
  id: string;
  release_status: 'released_to_factory';
  factory_available_at: Date | string;
  factory_approved_by: string;
  release_event_id: string | number;
};

export async function releaseNpdProjectToFactory(
  rawInput: unknown,
  existingContext?: OrgContextLike,
): Promise<ReleaseNpdProjectToFactoryResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    const runRelease = async (ctx: OrgContextLike): Promise<ReleaseNpdProjectToFactoryResult> => {
      const context = ctx as OrgContextLike;
      await requireReleasePermission(context);

      const unlinkedComponents = await loadUnlinkedPackagingComponents(context, parsed.data.projectId);
      if (unlinkedComponents.length > 0) {
        const names = unlinkedComponents.join(', ');
        return {
          ok: false,
          error: 'PACKAGING_UNLINKED',
          status: 409,
          unlinkedComponents,
          message: `packaging components not linked to items: ${names}`,
        };
      }

      const materialized = await materializeNpdBom(context, { projectId: parsed.data.projectId });
      if (materialized.code === 'PRODUCTION_CODE_CONFLICT') {
        return {
          ok: false,
          error: 'PRECONDITION_BLOCKERS',
          status: 409,
          blockers: [
            {
              code: 'ACTIVE_SHARED_BOM_REQUIRED',
              message: `Production code ${materialized.productionCode} is already used outside this NPD project.`,
            },
          ],
        };
      }
      if (materialized.code === 'PACKS_PER_BOX_REQUIRED') {
        // The production BOM is materialized PER BOX, so packs-per-box must be set first.
        // materializeNpdBom returns BEFORE any product/item write on this path (no wedge), so
        // surface a packs-specific blocker rather than letting the preflight emit the generic
        // ACTIVE_SHARED_BOM_REQUIRED for the (correctly) absent BOM.
        return {
          ok: false,
          error: 'PRECONDITION_BLOCKERS',
          status: 409,
          blockers: [
            {
              code: 'ACTIVE_SHARED_BOM_REQUIRED',
              message: 'Set packs-per-box on the FG before generating the production BOM.',
            },
          ],
        };
      }
      const ready = await runReleasePreflight(context, parsed.data);

      const releaseEventId = await insertReleasedToFactoryEvent(context, {
        projectId: ready.projectId,
        projectCode: ready.projectCode,
        productCode: ready.productCode,
        activeBomHeaderId: ready.activeBomHeaderId,
        activeFactorySpecId: ready.activeFactorySpecId,
        releaseAttemptKey: ready.factorySpecApprovedAt,
      });
      const release = await upsertFactoryReleaseStatus(context, {
        projectId: ready.projectId,
        productCode: ready.productCode,
        activeBomHeaderId: ready.activeBomHeaderId,
        activeFactorySpecId: ready.activeFactorySpecId,
        releaseEventId,
      });

      await transitionFactorySpecToReleased(context, {
        factorySpecId: ready.activeFactorySpecId,
      });

      await persistPromotedItemPricesAndCost(context, ready.projectId, ready.productCode);

      safeRevalidatePath(`/npd/pipeline/${ready.projectId}`);
      safeRevalidatePath(`/npd/fg/${ready.productCode}`);
      // materializeNpdBom wrote fresh rows to public.items, public.bom_headers/
      // bom_lines and public.factory_specs — refresh the Technical lists so the
      // newly-minted FG / BOM / spec appear without a manual reload.
      safeRevalidatePath('/technical/items');
      safeRevalidatePath('/technical/bom');
      safeRevalidatePath('/technical/factory-specs');

      return {
        ok: true,
        data: {
          projectId: ready.projectId,
          productCode: ready.productCode,
          activeBomHeaderId: ready.activeBomHeaderId,
          activeFactorySpecId: ready.activeFactorySpecId,
          yieldPromptRequired: materialized.yieldPromptRequired,
          productionCode: materialized.productionCode ?? ready.productCode,
          bomHeaderId: materialized.bomHeaderId ?? ready.activeBomHeaderId,
          releaseStatus: release.release_status,
          factoryAvailableAt: toIso(release.factory_available_at),
          releaseEventId: Number(release.release_event_id),
          outboxEventType: RELEASED_TO_FACTORY_EVENT,
        },
      };
    };

    if (existingContext) {
      return await runRelease(existingContext);
    }

    return await withOrgContext<ReleaseNpdProjectToFactoryResult>(async (ctx) => runRelease(ctx as OrgContextLike));
  } catch (error) {
    if (error instanceof ReleasePreflightError) {
      return {
        ok: false,
        error: error.status === 403 ? 'FORBIDDEN' : 'PRECONDITION_BLOCKERS',
        status: error.status,
        blockers: error.status === 403 ? undefined : error.blockers,
      };
    }
    console.error('[releaseNpdProjectToFactory] persistence_failed', {
      appVersion: APP_VERSION,
      error: error instanceof Error ? error.message : String(error),
    });
    // Truthful copy (walk-6 HIGH-2): carry the DB failure identity to the caller
    // so the promote banner can show WHAT failed instead of a bare wrapper code.
    const pg = error as { code?: string; constraint?: string; message?: string };
    const detail = [pg.code, pg.constraint ?? pg.message?.slice(0, 160)].filter(Boolean).join(' ');
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500, message: detail || undefined };
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

type PackagingUnlinkedRow = { component_name: string };

async function loadUnlinkedPackagingComponents(ctx: OrgContextLike, projectId: string): Promise<string[]> {
  const { rows } = await ctx.client.query<PackagingUnlinkedRow>(
    `select component_name
       from public.packaging_components
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and item_id is null
      order by display_order, component_name`,
    [projectId],
  );
  return rows.map((row) => row.component_name);
}

type PersistedWaterfallRow = {
  fg_item_id: string;
  total_cost_per_pack: string;
  pack_weight_kg: string;
  current_cost_per_kg: string | null;
};

/**
 * T8 — after a successful factory release, write target retail price to the FG item
 * and snapshot NPD costing waterfall total cost per kg when a persisted breakdown exists.
 * Idempotent: re-running release skips rows that already match.
 */
async function persistPromotedItemPricesAndCost(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string,
): Promise<void> {
  await ctx.client.query(
    `update public.items i
        set list_price_gbp = p.target_retail_price_eur
       from public.npd_projects p
      where i.org_id = app.current_org_id()
        and p.org_id = app.current_org_id()
        and p.id = $1::uuid
        and i.item_code = p.product_code
        and p.target_retail_price_eur is not null
        and i.list_price_gbp is distinct from p.target_retail_price_eur`,
    [projectId],
  );

  // L8 MED-2: NPD stores the category LABEL on npd_projects.type (legacy parity)
  // while items carry the Reference code — backfill the code at promote so the
  // BOM list resolves the LIVE label instead of the stale project snapshot.
  await ctx.client.query(
    `update public.items i
        set category_code = pc.code
       from public.npd_projects p
       join "Reference"."ProductCategories" pc
         on pc.org_id = p.org_id
        and pc.label = p.type
      where i.org_id = app.current_org_id()
        and p.org_id = app.current_org_id()
        and p.id = $1::uuid
        and i.item_code = p.product_code
        and i.category_code is null`,
    [projectId],
  );

  const { rows } = await ctx.client.query<PersistedWaterfallRow>(
    `select i.id::text as fg_item_id,
            cws.value_eur::text as total_cost_per_pack,
            cb.params->'units'->>'packWeightKg' as pack_weight_kg,
            i.cost_per_kg::text as current_cost_per_kg
       from public.costing_breakdowns cb
       join public.costing_waterfall_steps cws
         on cws.breakdown_id = cb.id
        and cws.step_name = 'Total cost'
       join public.items i
         on i.org_id = cb.org_id
        and i.item_code = cb.product_code
      where cb.org_id = app.current_org_id()
        and cb.product_code = $1
        and lower(cb.scenario) = 'target'
      limit 1`,
    [productCode],
  );
  const snapshot = rows[0];
  if (!snapshot?.total_cost_per_pack || !snapshot.pack_weight_kg) return;

  const computed = await ctx.client.query<{ cost_per_kg: string }>(
    `select ($1::numeric / nullif($2::numeric, 0))::text as cost_per_kg`,
    [snapshot.total_cost_per_pack, snapshot.pack_weight_kg],
  );
  const costPerKg = computed.rows[0]?.cost_per_kg;
  if (!costPerKg) return;
  if (snapshot.current_cost_per_kg === costPerKg) return;

  await ctx.client.query(
    `update public.item_cost_history
        set effective_to = greatest((current_date - interval '1 day')::date, effective_from)
      where org_id = app.current_org_id()
        and item_id = $1::uuid
        and effective_to is null`,
    [snapshot.fg_item_id],
  );
  await ctx.client.query(
    `insert into public.item_cost_history
       (org_id, item_id, cost_per_kg, currency, effective_from, source)
     values
       (app.current_org_id(), $1::uuid, $2::numeric, 'GBP', current_date, 'manual')`,
    [snapshot.fg_item_id, costPerKg],
  );
  await ctx.client.query(
    `update public.items
        set cost_per_kg = $2::numeric
      where org_id = app.current_org_id()
        and id = $1::uuid
        and cost_per_kg is distinct from $2::numeric`,
    [snapshot.fg_item_id, costPerKg],
  );
}
