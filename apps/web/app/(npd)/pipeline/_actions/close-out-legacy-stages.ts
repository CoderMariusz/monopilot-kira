import {
  APP_VERSION,
  GateActionError,
  emitOutbox,
  type GateProjectRow,
} from './_lib/gate-helpers';
import { LEGACY_STAGES_CLOSED_EVENT, type OrgContextLike } from './shared';
import { materializeNpdBom } from './_lib/materialize-npd-bom';

type ExistingCloseoutRow = {
  id: string;
  fg_product_code: string;
};

type ReleaseRow = {
  release_status: string;
  release_event_id: string | number | null;
  active_bom_header_id: string | null;
  active_factory_spec_id: string | null;
};

type ProductCloseoutRow = {
  shelf_life: string | null;
  closed_mrp: string | null;
  box: string | null;
  top_label: string | null;
  bottom_label: string | null;
  web: string | null;
  mrp_box: string | null;
  mrp_labels: string | null;
  mrp_films: string | null;
  mrp_sleeves: string | null;
  mrp_cartons: string | null;
  private_jsonb: Record<string, unknown> | null;
};

type G4ApprovalRow = {
  id: string;
};

type BomRow = {
  id: string;
  status: string;
};

type PilotEvidence = {
  id: string;
  source: 'work_order' | 'pilot_run';
  woReference: string | null;
};

type PilotRunEvidenceRow = {
  id: string;
  wo_reference: string | null;
};

type CloseoutInsertRow = {
  id: string;
  fg_product_code: string;
};

export async function closeOutLegacyStagesForLaunch(
  ctx: OrgContextLike,
  project: GateProjectRow,
): Promise<CloseoutInsertRow> {
  const existing = await loadExistingCloseout(ctx, project.id);
  if (existing) throw new GateActionError('ALREADY_CLOSED', 409);

  if (!project.product_code) throw new GateActionError('HANDOFF_BOM_NOT_APPROVED', 409);

  // Idempotent self-heal: projects promoted BEFORE the materializer learned to
  // stamp the allergen-recompute timestamp (walk-5) would 409 here forever.
  // Re-running fills only what is missing (BOM/spec/stamps already present are
  // left untouched).
  await materializeNpdBom(ctx, { projectId: project.id });

  const [release, product, g4Approval] = await Promise.all([
    loadRelease(ctx, project),
    loadProduct(ctx, project.product_code),
    loadG4Approval(ctx, project.id),
  ]);

  if (!release || !isApprovedFactoryStatus(release.release_status) || !release.active_bom_header_id || !release.release_event_id) {
    throw new GateActionError('HANDOFF_BOM_NOT_APPROVED', 409);
  }
  if (!g4Approval) throw new GateActionError('HANDOFF_BOM_NOT_APPROVED', 409);
  if (!product || !product.shelf_life?.trim()) throw new GateActionError('TRIAL_SHELF_LIFE_MISSING', 409);

  const allergenRecomputedAt = await resolveAllergenRecomputedAt(ctx, project.product_code, product.private_jsonb);
  if (!allergenRecomputedAt) throw new GateActionError('TRIAL_SHELF_LIFE_MISSING', 409);

  const pilotEvidence = await resolvePilotEvidence(ctx, project.id, product.private_jsonb);
  if (!pilotEvidence) throw new GateActionError('PILOT_WO_NOT_LINKED', 409);

  const bom = await loadBom(ctx, release.active_bom_header_id, project.id, project.product_code);
  if (!bom || !['active', 'technical_approved'].includes(bom.status)) {
    throw new GateActionError('HANDOFF_BOM_NOT_APPROVED', 409);
  }

  const packagingMrpComplete = product.closed_mrp === 'Yes';
  if (!packagingMrpComplete) throw new GateActionError('PACKAGING_MRP_INCOMPLETE', 409);

  const packagingSnapshot = buildPackagingSnapshot(project.product_code, product);
  const inserted = await ctx.client.query<CloseoutInsertRow>(
    `insert into public.npd_legacy_closeout
       (org_id, npd_project_id, fg_product_code, closed_by, release_event_id,
        trial_shelf_life_set, trial_allergens_cascade_recomputed_at, pilot_wo_id,
        handoff_g4_esign_id, handoff_bom_header_id, packaging_snapshot_jsonb,
        packaging_mrp_complete, created_by_user, app_version)
     values
       (app.current_org_id(), $1::uuid, $2, $3::uuid, $4::bigint,
        true, $5::timestamptz, $6::uuid, $7::uuid, $8::uuid, $9::jsonb,
        true, $3::uuid, $10)
     on conflict (npd_project_id) do nothing
     returning id, fg_product_code`,
    [
      project.id,
      project.product_code,
      ctx.userId,
      release.release_event_id,
      allergenRecomputedAt,
      pilotEvidence.id,
      g4Approval.id,
      bom.id,
      JSON.stringify(packagingSnapshot),
      APP_VERSION,
    ],
  );

  const closeout = inserted.rows[0] ?? await loadExistingCloseout(ctx, project.id);
  if (!closeout) throw new Error('npd_legacy_closeout insert returned no row');
  if (!inserted.rows[0]) throw new GateActionError('ALREADY_CLOSED', 409);

  await emitOutbox(ctx, {
    eventType: LEGACY_STAGES_CLOSED_EVENT,
    aggregateType: 'npd_project',
    aggregateId: project.id,
    payload: {
      org_id: ctx.orgId,
      actor_user_id: ctx.userId,
      project_id: project.id,
      project_code: project.code,
      fg_product_code: project.product_code,
      closeout_id: closeout.id,
      trial: {
        shelf_life_set: true,
        allergens_cascade_recomputed_at: allergenRecomputedAt,
      },
      pilot: {
        evidence_id: pilotEvidence.id,
        source: pilotEvidence.source,
        wo_reference: pilotEvidence.woReference,
      },
      handoff: {
        g4_esign_id: g4Approval.id,
        bom_header_id: bom.id,
      },
      packaging: {
        mrp_complete: true,
        snapshot: packagingSnapshot,
      },
      release_event_id: Number(release.release_event_id),
    },
    dedupKey: `${LEGACY_STAGES_CLOSED_EVENT}:${project.id}`,
  });

  return closeout;
}

async function loadExistingCloseout(ctx: OrgContextLike, projectId: string): Promise<ExistingCloseoutRow | null> {
  const { rows } = await ctx.client.query<ExistingCloseoutRow>(
    `select id, fg_product_code
       from public.npd_legacy_closeout
      where org_id = app.current_org_id()
        and npd_project_id = $1::uuid
      limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function loadRelease(ctx: OrgContextLike, project: GateProjectRow): Promise<ReleaseRow | null> {
  const { rows } = await ctx.client.query<ReleaseRow>(
    `select release_status, release_event_id, active_bom_header_id, active_factory_spec_id
       from public.factory_release_status
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and product_code = $2
      order by updated_at desc, created_at desc
      limit 1`,
    [project.id, project.product_code],
  );
  return rows[0] ?? null;
}

async function loadProduct(ctx: OrgContextLike, productCode: string): Promise<ProductCloseoutRow | null> {
  const { rows } = await ctx.client.query<ProductCloseoutRow>(
    `select shelf_life, closed_mrp, box, top_label, bottom_label, web,
            mrp_box, mrp_labels, mrp_films, mrp_sleeves, mrp_cartons, private_jsonb
       from public.product
      where org_id = app.current_org_id()
        and product_code = $1
        and deleted_at is null
      limit 1`,
    [productCode],
  );
  return rows[0] ?? null;
}

async function loadG4Approval(ctx: OrgContextLike, projectId: string): Promise<G4ApprovalRow | null> {
  const { rows } = await ctx.client.query<G4ApprovalRow>(
    `select id
       from public.gate_approvals
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and gate_code = 'G4'
        and decision = 'approved'
        and esigned_at is not null
        and esign_hash is not null
      order by created_at desc
      limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function resolveAllergenRecomputedAt(
  ctx: OrgContextLike,
  productCode: string,
  privateJsonb: Record<string, unknown> | null,
): Promise<string | null> {
  const explicit = stringFromPrivateJson(privateJsonb, 'trial_allergens_cascade_recomputed_at');
  if (explicit) return explicit;
  const { rows } = await ctx.client.query<{ processed_at: string | Date | null }>(
    `select processed_at
       from public.allergen_cascade_rebuild_jobs
      where org_id = app.current_org_id()
        and product_code = $1
        and status = 'processed'
        and processed_at is not null
      order by processed_at desc
      limit 1`,
    [productCode],
  );
  const processedAt = rows[0]?.processed_at;
  if (!processedAt) return null;
  return processedAt instanceof Date ? processedAt.toISOString() : new Date(processedAt).toISOString();
}

async function resolvePilotEvidence(
  ctx: OrgContextLike,
  projectId: string,
  privateJsonb: Record<string, unknown> | null,
): Promise<PilotEvidence | null> {
  const pilotWoId = stringFromPrivateJson(privateJsonb, 'npd_project_pilot_wo_id')
    ?? stringFromPrivateJson(privateJsonb, 'pilot_wo_id');
  if (pilotWoId && isUuid(pilotWoId) && await pilotWorkOrderExists(ctx, pilotWoId)) {
    return { id: pilotWoId, source: 'work_order', woReference: null };
  }

  const pilotRun = await loadCompletedPilotRun(ctx, projectId);
  return pilotRun ? { id: pilotRun.id, source: 'pilot_run', woReference: pilotRun.wo_reference } : null;
}

async function pilotWorkOrderExists(ctx: OrgContextLike, pilotWoId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.work_orders
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [pilotWoId],
  );
  return rows.length > 0;
}

async function loadCompletedPilotRun(ctx: OrgContextLike, projectId: string): Promise<PilotRunEvidenceRow | null> {
  const { rows } = await ctx.client.query<PilotRunEvidenceRow>(
    `select id, wo_reference
       from public.pilot_runs
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and status = 'completed'
      order by planned_date desc nulls last, created_at desc
      limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function loadBom(
  ctx: OrgContextLike,
  bomHeaderId: string,
  projectId: string,
  productCode: string,
): Promise<BomRow | null> {
  const { rows } = await ctx.client.query<BomRow>(
    `select id, status
       from public.bom_headers
      where org_id = app.current_org_id()
        and id = $1::uuid
        and product_id = $2
        and npd_project_id = $3::uuid
      limit 1`,
    [bomHeaderId, productCode, projectId],
  );
  return rows[0] ?? null;
}

function buildPackagingSnapshot(
  productCode: string,
  product: ProductCloseoutRow,
): Record<string, unknown> {
  // NPD pivot Phase 2C (mig 243): the standalone public.brief / public.brief_lines
  // tables were dropped — the brief is now merged into npd_projects, which does NOT
  // carry the granular C14-C19 packaging-line fields (those only ever lived in
  // brief_lines). The packaging snapshot is therefore sourced entirely from the
  // product's own packaging columns (the live system-of-record for packaging).
  return {
    source: 'product',
    product_code: productCode,
    C14: product.box ?? product.mrp_box,
    C15: product.mrp_cartons,
    C16: product.web,
    C17: null,
    C18: product.top_label,
    C19: product.mrp_sleeves ?? product.mrp_cartons,
    product_mrp: {
      box: product.mrp_box,
      labels: product.mrp_labels,
      films: product.mrp_films,
      sleeves: product.mrp_sleeves,
      cartons: product.mrp_cartons,
      top_label: product.top_label,
      bottom_label: product.bottom_label,
    },
  };
}

function isApprovedFactoryStatus(value: string): boolean {
  return value === 'approved_for_factory' || value === 'released_to_factory';
}

function stringFromPrivateJson(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
