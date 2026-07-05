'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { type OrgContextLike } from '../../pipeline/_actions/shared';
import { materializeNpdBom } from '../../pipeline/_actions/_lib/materialize-npd-bom';
import {
  ReleasePreflightError,
  runReleasePreflight,
  requireReleasePermission,
  type ReleasePreflightBlocker,
} from '../_lib/release-preflight';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';

const RELEASED_TO_FACTORY_EVENT = 'fg.released_to_factory' as const;
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

export type ReleaseNpdProjectToFactoryResult =
  | {
      ok: true;
      data: {
        projectId: string;
        productCode: string;
        activeBomHeaderId: string;
        activeFactorySpecId: string;
        yieldPromptRequired: boolean;
        productionCode: string;
        bomHeaderId: string;
        releaseStatus: 'released_to_factory';
        factoryAvailableAt: string;
        releaseEventId: number;
        outboxEventType: typeof RELEASED_TO_FACTORY_EVENT;
      };
    }
  | {
      ok: false;
      error:
        | 'INVALID_INPUT'
        | 'FORBIDDEN'
        | 'PRECONDITION_BLOCKERS'
        | 'PACKAGING_UNLINKED'
        | 'PERSISTENCE_FAILED';
      status: number;
      blockers?: ReleasePreflightBlocker[];
      /** Present when error === 'PACKAGING_UNLINKED'. */
      unlinkedComponents?: string[];
      message?: string;
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
      });
      const release = await upsertFactoryReleaseStatus(context, {
        projectId: ready.projectId,
        productCode: ready.productCode,
        activeBomHeaderId: ready.activeBomHeaderId,
        activeFactorySpecId: ready.activeFactorySpecId,
        releaseEventId,
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
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500 };
  }
}

async function insertReleasedToFactoryEvent(
  ctx: OrgContextLike,
  input: {
    projectId: string;
    projectCode: string;
    productCode: string;
    activeBomHeaderId: string;
    activeFactorySpecId: string;
  },
): Promise<number> {
  const dedupKey = `${APP_VERSION}:${input.projectId}:released-to-factory:${input.activeBomHeaderId}:${input.activeFactorySpecId}`;
  const inserted = await ctx.client.query<{ id: string | number }>(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, 'factory_release_status', $2, $3::jsonb, $4, $5)
     on conflict (org_id, dedup_key) where dedup_key is not null
     do nothing
     returning id`,
    [
      RELEASED_TO_FACTORY_EVENT,
      input.projectId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        projectId: input.projectId,
        projectCode: input.projectCode,
        productCode: input.productCode,
        activeBomHeaderId: input.activeBomHeaderId,
        activeFactorySpecId: input.activeFactorySpecId,
        factoryApprovedBy: ctx.userId,
      }),
      APP_VERSION,
      dedupKey,
    ],
  );
  const id = inserted.rows[0]?.id ?? (await loadEventIdByDedupKey(ctx, dedupKey));
  const numericId = typeof id === 'string' ? Number(id) : id;
  if (!Number.isFinite(numericId)) throw new Error(`failed to emit ${RELEASED_TO_FACTORY_EVENT}`);
  return numericId;
}

async function loadEventIdByDedupKey(ctx: OrgContextLike, dedupKey: string): Promise<number | string | undefined> {
  const { rows } = await ctx.client.query<{ id: string | number }>(
    `select id
       from public.outbox_events
      where org_id = app.current_org_id()
        and dedup_key = $1
      limit 1`,
    [dedupKey],
  );
  return rows[0]?.id;
}

async function upsertFactoryReleaseStatus(
  ctx: OrgContextLike,
  input: {
    projectId: string;
    productCode: string;
    activeBomHeaderId: string;
    activeFactorySpecId: string;
    releaseEventId: number;
  },
): Promise<ReleaseRow> {
  const { rows } = await ctx.client.query<ReleaseRow>(
    `insert into public.factory_release_status
       (org_id, project_id, product_code, release_status, factory_available_at, factory_approved_by,
        release_event_id, active_bom_header_id, active_factory_spec_id, release_blockers, requested_by, requested_at)
     values
       (app.current_org_id(), $1::uuid, $2, 'released_to_factory', now(), $3::uuid,
        $4, $5::uuid, $6::uuid, '[]'::jsonb, $3::uuid, now())
     on conflict (org_id, project_id, product_code)
     do update set release_status = 'released_to_factory',
                   factory_available_at = coalesce(public.factory_release_status.factory_available_at, excluded.factory_available_at),
                   factory_approved_by = coalesce(public.factory_release_status.factory_approved_by, excluded.factory_approved_by),
                   release_event_id = coalesce(public.factory_release_status.release_event_id, excluded.release_event_id),
                   active_bom_header_id = excluded.active_bom_header_id,
                   active_factory_spec_id = excluded.active_factory_spec_id,
                   release_blockers = '[]'::jsonb,
                   requested_by = coalesce(public.factory_release_status.requested_by, excluded.requested_by),
                   requested_at = coalesce(public.factory_release_status.requested_at, excluded.requested_at)
     returning id, release_status, factory_available_at, factory_approved_by, release_event_id`,
    [
      input.projectId,
      input.productCode,
      ctx.userId,
      input.releaseEventId,
      input.activeBomHeaderId,
      input.activeFactorySpecId,
    ],
  );
  const release = rows[0];
  if (!release) throw new Error('factory release status upsert returned no row');
  return release;
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
        and pc.is_active = true
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
        and cb.product_code = $2
        and lower(cb.scenario) = 'target'
      limit 1`,
    [projectId, productCode],
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
