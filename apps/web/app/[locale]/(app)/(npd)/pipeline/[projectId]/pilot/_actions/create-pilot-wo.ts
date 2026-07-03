'use server';

/**
 * NPD PILOT stage — create (or return) the pilot work order for a project.
 *
 * Calls the canonical planning work-order core (08-production / planning owner)
 * inside this org transaction — never inserts into work_orders directly. Links the WO back on
 * `product.private_jsonb.npd_project_pilot_wo_id`, which close-out reads
 * (`close-out-legacy-stages.ts:resolvePilotEvidence`).
 */

import { z } from 'zod';

import { createWorkOrderCore } from '../../../../../../../../app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-core';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import { hasPilotPermission } from './get-pilot-run';
import { buildPilotWoNumber } from './_helpers';

const Input = z.object({
  projectId: z.string().uuid(),
});

type CreatePilotWoError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'no_linked_fg'
  | 'recipe_not_ready'
  | 'no_planned_quantity'
  | 'line_required'
  | 'no_active_site'
  | 'forbidden_planning_write'
  | 'document_mask_missing'
  | 'fg_item_missing'
  | 'wo_create_failed'
  | 'persistence_failed';

type PilotWorkOrderLink = {
  id: string;
  woNumber: string;
};

type CreatePilotWoResult =
  | { ok: true; data: PilotWorkOrderLink; created: boolean }
  | { ok: false; error: CreatePilotWoError; message?: string; planningError?: string };

const WRITE_PERMISSION = 'npd.pilot.write';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

type OrgCtx = { userId: string; orgId: string; client: QueryClient };

type ProjectRow = {
  id: string;
  product_code: string | null;
};

type ProductRow = {
  private_jsonb: Record<string, unknown> | null;
};

type ItemRow = {
  id: string;
  item_code: string;
};

type PilotRunQtyRow = {
  batch_size_kg: string | null;
  planned_date: string | null;
  line: string | null;
};

type LineRow = {
  id: string;
  site_id: string | null;
};

function stringFromPrivateJson(source: Record<string, unknown> | null, key: string): string | null {
  if (!source || typeof source !== 'object') return null;
  const value = source[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function loadProject(ctx: OrgCtx, projectId: string): Promise<ProjectRow | null> {
  const { rows } = await ctx.client.query<ProjectRow>(
    `select id, product_code
       from public.npd_projects
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function loadProductPrivateJson(ctx: OrgCtx, productCode: string): Promise<ProductRow | null> {
  const { rows } = await ctx.client.query<ProductRow>(
    `select private_jsonb
       from public.product
      where org_id = app.current_org_id()
        and product_code = $1
        and deleted_at is null
      limit 1`,
    [productCode],
  );
  return rows[0] ?? null;
}

async function loadWorkOrderById(ctx: OrgCtx, woId: string): Promise<PilotWorkOrderLink | null> {
  const { rows } = await ctx.client.query<{ id: string; wo_number: string }>(
    `select id::text as id, wo_number
       from public.work_orders
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [woId],
  );
  const row = rows[0];
  return row ? { id: row.id, woNumber: row.wo_number } : null;
}

async function loadWorkOrderByNumber(ctx: OrgCtx, woNumber: string): Promise<PilotWorkOrderLink | null> {
  const { rows } = await ctx.client.query<{ id: string; wo_number: string }>(
    `select id::text as id, wo_number
       from public.work_orders
      where org_id = app.current_org_id()
        and wo_number = $1
      limit 1`,
    [woNumber],
  );
  const row = rows[0];
  return row ? { id: row.id, woNumber: row.wo_number } : null;
}

async function linkPilotWoToProduct(ctx: OrgCtx, productCode: string, woId: string): Promise<void> {
  await ctx.client.query(
    `update public.product
        set private_jsonb = coalesce(private_jsonb, '{}'::jsonb)
          || jsonb_build_object('npd_project_pilot_wo_id', $2::text)
      where org_id = app.current_org_id()
        and product_code = $1
        and deleted_at is null`,
    [productCode, woId],
  );
}

async function resolveExistingPilotWo(
  ctx: OrgCtx,
  productCode: string,
  privateJsonb: Record<string, unknown> | null,
): Promise<PilotWorkOrderLink | null> {
  const linkedId =
    stringFromPrivateJson(privateJsonb, 'npd_project_pilot_wo_id')
    ?? stringFromPrivateJson(privateJsonb, 'pilot_wo_id');
  if (linkedId && isUuid(linkedId)) {
    const linked = await loadWorkOrderById(ctx, linkedId);
    if (linked) return linked;
  }

  return loadWorkOrderByNumber(ctx, buildPilotWoNumber(productCode));
}

async function loadFgItem(ctx: OrgCtx, productCode: string): Promise<ItemRow | null> {
  const { rows } = await ctx.client.query<ItemRow>(
    `select id::text as id, item_code
       from public.items
      where org_id = app.current_org_id()
        and item_code = $1
      limit 1`,
    [productCode],
  );
  return rows[0] ?? null;
}

async function hasLockedRecipe(ctx: OrgCtx, projectId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.formulation_versions fv
       -- formulation_versions has NO org_id; org scoping flows through the parent
       -- formulations row (caught live by the W1 Gate-5b walk: 42703 fv.org_id).
       join public.formulations f
         on f.id = fv.formulation_id
      where f.project_id = $1::uuid
        and f.org_id = app.current_org_id()
        and fv.state = 'locked'
      limit 1`,
    [projectId],
  );
  return rows.length > 0;
}

async function hasActiveProductionBom(ctx: OrgCtx, productCode: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.bom_headers
      where org_id = app.current_org_id()
        and product_id = $1
        and status = 'active'
      limit 1`,
    [productCode],
  );
  return rows.length > 0;
}

async function loadLatestPilotRunPlan(ctx: OrgCtx, projectId: string): Promise<PilotRunQtyRow | null> {
  const { rows } = await ctx.client.query<PilotRunQtyRow>(
    `select batch_size_kg::text as batch_size_kg,
            planned_date::text as planned_date,
            line
       from public.pilot_runs
      where org_id = app.current_org_id()
        and project_id = $1::uuid
      order by planned_date desc nulls last, created_at desc
      limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function resolveProductionLine(ctx: OrgCtx, lineCode: string): Promise<LineRow | null> {
  const lineRes = await ctx.client.query<LineRow>(
    `select id::text as id, site_id::text as site_id
       from public.production_lines
      where org_id = app.current_org_id()
        and code = $1
        and status = 'active'
      limit 1`,
    [lineCode],
  );
  return lineRes.rows[0] ?? null;
}

/** Read the linked pilot WO for display (idempotent with closeout evidence). */
export async function getPilotWorkOrderLink(projectId: string): Promise<PilotWorkOrderLink | null> {
  const parsed = Input.safeParse({ projectId });
  if (!parsed.success) return null;

  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgCtx;
      if (!(await hasPilotPermission(ctx, 'npd.pilot.read'))) return null;

      const project = await loadProject(ctx, parsed.data.projectId);
      if (!project?.product_code?.trim()) return null;

      const product = await loadProductPrivateJson(ctx, project.product_code);
      const existing = await resolveExistingPilotWo(ctx, project.product_code, product?.private_jsonb ?? null);
      if (!existing) return null;

      await linkPilotWoToProduct(ctx, project.product_code, existing.id);
      return existing;
    });
  } catch {
    return null;
  }
}

export async function createPilotWorkOrder(raw: unknown): Promise<CreatePilotWoResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const { projectId } = parsed.data;

  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgCtx;

      if (!(await hasPilotPermission(ctx, WRITE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const project = await loadProject(ctx, projectId);
      if (!project) return { ok: false as const, error: 'not_found' as const };

      const productCode = project.product_code?.trim();
      if (!productCode) return { ok: false as const, error: 'no_linked_fg' as const };

      const product = await loadProductPrivateJson(ctx, productCode);
      const existing = await resolveExistingPilotWo(ctx, productCode, product?.private_jsonb ?? null);
      if (existing) {
        await linkPilotWoToProduct(ctx, productCode, existing.id);
        return { ok: true as const, data: existing, created: false };
      }

      const [lockedRecipe, activeBom, item, pilotRun] = await Promise.all([
        hasLockedRecipe(ctx, projectId),
        hasActiveProductionBom(ctx, productCode),
        loadFgItem(ctx, productCode),
        loadLatestPilotRunPlan(ctx, projectId),
      ]);

      if (!lockedRecipe && !activeBom) {
        return { ok: false as const, error: 'recipe_not_ready' as const };
      }
      if (!item) {
        return { ok: false as const, error: 'fg_item_missing' as const };
      }

      const plannedQuantity = pilotRun?.batch_size_kg?.trim() ?? '';
      if (!/^\d+(\.\d{1,4})?$/.test(plannedQuantity) || Number(plannedQuantity) <= 0) {
        return { ok: false as const, error: 'no_planned_quantity' as const };
      }

      const targetWoNumber = buildPilotWoNumber(productCode);
      const lineCode = pilotRun?.line?.trim();
      if (!lineCode) return { ok: false as const, error: 'line_required' as const };

      const productionLine = await resolveProductionLine(ctx, lineCode);
      if (!productionLine) return { ok: false as const, error: 'line_required' as const };
      if (!productionLine.site_id) return { ok: false as const, error: 'no_active_site' as const };

      const createResult = await createWorkOrderCore(ctx, {
        productId: item.id,
        itemCode: item.item_code,
        documentNumber: targetWoNumber,
        siteId: productionLine.site_id,
        plannedQuantity,
        scheduledStartTime: pilotRun?.planned_date ? `${pilotRun.planned_date}T00:00:00.000Z` : undefined,
        productionLineId: productionLine.id,
        notes: `NPD pilot WO for project ${projectId}`,
      });

      if (!createResult.ok) {
        const error = createResult.error === 'forbidden'
          ? 'forbidden_planning_write'
          : createResult.error === 'no_active_site'
            ? 'no_active_site'
            : createResult.error === 'document_mask_missing'
              ? 'document_mask_missing'
              : 'wo_create_failed';
        return {
          ok: false as const,
          error,
          planningError: createResult.error,
          message: createResult.error,
        };
      }

      const link = { id: createResult.workOrder.id, woNumber: createResult.workOrder.woNumber };
      await linkPilotWoToProduct(ctx, productCode, link.id);

      revalidateLocalized(`/pipeline/${projectId}/pilot`);
      revalidateLocalized('/planning/work-orders');
      revalidateLocalized(`/production/wos/${link.id}`);

      return { ok: true as const, data: link, created: true };
    });
  } catch (error) {
    console.error('[createPilotWorkOrder] failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
