import { cascadeAllergensForChangedItem } from '../../../../../lib/technical/allergens/cascade';
import { type GateProjectRow } from './gate-helpers';
import { type OrgContextLike } from '../shared';

// FG-002 rename DEFERRED. The production-vs-NPD code split (FG-NPD-002 → FG-002) is
// entangled with the product→items merge (owner decision #1): the release-gate probe
// (release-gate-status.ts) AND the real preflight (release-preflight.ts) look up the
// active BOM + factory_spec by the NPD product_code, so deriving a different code here
// makes materialize create a BOM the preflight can't find → promote rolls back. Until
// the merge lands, the production code stays = the NPD product_code (identity).
function deriveProductionCode(npdCode: string): string { return npdCode; }

type MaterializeNpdBomInput = {
  projectId: string;
};

type ProjectRow = GateProjectRow & {
  pack_weight_g: string | null;
};

type LockedFormulationRow = {
  formulation_id: string;
  version_id: string;
  version_number: number;
  target_yield_pct: string | null;
};

type IngredientRow = {
  rm_code: string;
  item_id: string | null;
  qty_kg: string | null;
  sequence: number;
};

type PackagingComponentRow = {
  component_name: string;
  item_id: string;
  qty: string;
};

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  shelf_life_days: number | null;
};

type BomHeaderRow = {
  id: string;
  version: number;
};

type FactorySpecRow = {
  id: string;
};

type PilotEvidenceRow = {
  id: string;
  wo_reference: string | null;
  status: string;
};

type DbErrorLike = {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
};

export type MaterializeNpdBomResult = {
  code?: 'PRODUCTION_CODE_CONFLICT';
  projectId: string;
  productCode: string | null;
  productionCode: string | null;
  itemId: string | null;
  bomHeaderId: string | null;
  factorySpecId: string | null;
  yieldPromptRequired: boolean;
  createdBom: boolean;
  createdFactorySpec: boolean;
};

export async function materializeNpdBom(
  ctx: OrgContextLike,
  input: MaterializeNpdBomInput,
): Promise<MaterializeNpdBomResult> {
  const project = await loadProject(ctx, input.projectId);
  if (!project?.product_code) {
    return emptyResult(input.projectId, project?.product_code ?? null, null);
  }

  const productionCode = deriveProductionCode(project.product_code);
  if (await hasProductionCodeConflict(ctx, productionCode, project.id)) {
    return {
      code: 'PRODUCTION_CODE_CONFLICT',
      ...emptyResult(project.id, project.product_code, productionCode),
    };
  }

  const formulation = await loadLockedFormulation(ctx, project.id);
  if (!formulation) {
    await ensureFgItemAndProduct(ctx, project, null);
    return emptyResult(project.id, project.product_code, productionCode);
  }

  const ingredients = await loadIngredients(ctx, formulation.version_id);
  const item = await ensureFgItemAndProduct(ctx, project, formulation);
  await stampProductCloseoutInputs(ctx, project, item);

  const existingBom = await loadExistingActiveNpdBom(ctx, project.id, productionCode);
  const bom = existingBom ?? (ingredients.length > 0
    ? await createActiveNpdBom(ctx, project, formulation, ingredients)
    : null);

  const existingSpec = bom ? await loadApprovedFactorySpec(ctx, item.id) : null;
  const createdSpec = !existingSpec && bom
    ? await createApprovedFactorySpec(ctx, project, item.id, bom)
    : null;

  // Recompute the allergen cascade over the just-materialized BOM and stamp the
  // close-out timestamp — closeOutLegacyStagesForLaunch requires
  // trial_allergens_cascade_recomputed_at, and nothing else in the pipeline ever
  // writes it (live walk-5: every project 409'd at handoff→launched on it). The
  // stamp is honest: the recompute genuinely ran here, right after the BOM landed.
  if (bom) {
    for (const ingredient of ingredients) {
      if (!ingredient.item_id) continue;
      await cascadeAllergensForChangedItem(
        ctx.client as Parameters<typeof cascadeAllergensForChangedItem>[0],
        ctx.orgId,
        ingredient.item_id,
      );
    }
    await ctx.client.query(
      `update public.product
          set private_jsonb = private_jsonb
            || jsonb_build_object('trial_allergens_cascade_recomputed_at', now())
        where org_id = app.current_org_id()
          and product_code = $1
          and (private_jsonb -> 'trial_allergens_cascade_recomputed_at') is null`,
      [productionCode],
    );
  }

  return {
    projectId: project.id,
    productCode: project.product_code,
    productionCode,
    itemId: item.id,
    bomHeaderId: bom?.id ?? null,
    factorySpecId: existingSpec?.id ?? createdSpec?.id ?? null,
    yieldPromptRequired: !formulation.target_yield_pct,
    createdBom: !existingBom && !!bom,
    createdFactorySpec: !!createdSpec,
  };
}

async function loadProject(ctx: OrgContextLike, projectId: string): Promise<ProjectRow | null> {
  const { rows } = await ctx.client.query<ProjectRow>(
    `select id, code, name, type, current_gate, current_stage, product_code, pack_weight_g::text as pack_weight_g
       from public.npd_projects
      where org_id = app.current_org_id()
        and id = $1::uuid
      for update`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function hasProductionCodeConflict(
  ctx: OrgContextLike,
  productionCode: string,
  projectId: string,
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `select id
       from public.items
      where org_id = app.current_org_id()
        and item_code = $1
        -- A genuine conflict is a NON-npd item owning this code, OR an npd item already
        -- claimed by a DIFFERENT project. An npd item with npd_project_id IS NULL is
        -- "unclaimed" (created by the FA/FG create flow without a project link) — this
        -- project legitimately owns the product_code, so it must be adoptable, NOT a
        -- conflict (else generateProductionBom dead-ends with PRODUCTION_CODE_CONFLICT
        -- and the recipe can never be materialised into a BOM).
        and (origin_module is distinct from 'npd'
             or (npd_project_id is not null and npd_project_id is distinct from $2::uuid))
      limit 1`,
    [productionCode, projectId],
  );
  return Boolean(rows[0]);
}

async function loadLockedFormulation(ctx: OrgContextLike, projectId: string): Promise<LockedFormulationRow | null> {
  const { rows } = await ctx.client.query<LockedFormulationRow>(
    `select f.id as formulation_id,
            fv.id as version_id,
            fv.version_number,
            fv.target_yield_pct::text as target_yield_pct
       from public.formulations f
       join public.formulation_versions fv on fv.formulation_id = f.id
      where f.org_id = app.current_org_id()
        and f.project_id = $1::uuid
        and fv.state = 'locked'
      order by fv.version_number desc, fv.created_at desc
      limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function loadIngredients(ctx: OrgContextLike, versionId: string): Promise<IngredientRow[]> {
  const { rows } = await ctx.client.query<IngredientRow>(
    `select rm_code,
            item_id::text as item_id,
            qty_kg::text as qty_kg,
            sequence
       from public.formulation_ingredients
      where version_id = $1::uuid
        and coalesce(qty_kg, 0) > 0
      order by sequence asc`,
    [versionId],
  );
  return rows;
}

async function ensureFgItemAndProduct(
  ctx: OrgContextLike,
  project: ProjectRow,
  formulation: LockedFormulationRow | null,
): Promise<ItemRow> {
  const productCode = deriveProductionCode(project.product_code as string);
  const outputUom = project.pack_weight_g != null ? 'each' : 'base';
  const netQtyPerEach = project.pack_weight_g != null ? Number(project.pack_weight_g) / 1000.0 : null;
  const inserted = await ctx.client.query<ItemRow>(
    `insert into public.items
       (org_id, item_code, item_type, name, status, uom_base, shelf_life_days, output_uom,
        net_qty_per_each, each_per_box, origin_module, npd_project_id, created_by)
     values
       (app.current_org_id(), $1, 'fg', $2, 'active', 'kg', 30, $3, $4::numeric, null,
        'npd', $5::uuid, $6::uuid)
     on conflict (org_id, item_code) do nothing
     returning id, item_code, name, shelf_life_days`,
    [productCode, project.name, outputUom, netQtyPerEach, project.id, ctx.userId],
  );
  const item = inserted.rows[0] ?? (await loadItem(ctx, productCode));
  if (!item) throw new Error(`failed to ensure FG item ${productCode}`);

  // product is a VIEW post-merge-cut → no ON CONFLICT DO UPDATE (42P10). Replicate the upsert as
  // insert-if-absent / targeted-update-if-present: a blind INSERT through the view would re-run the
  // INSTEAD-OF insert and overwrite fg_npd_ext with the sparse NEW values. The UPDATE path touches
  // only the closeout columns; the INSTEAD-OF update preserves every other column (NEW == current).
  const existingProduct = await ctx.client.query(
    `select 1 from public.product where org_id = app.current_org_id() and product_code = $1 limit 1`,
    [productCode],
  );
  if (existingProduct.rows.length === 0) {
    await ctx.client.query(
      `insert into public.product
         (org_id, product_code, product_name, shelf_life, done_mrp, closed_mrp, created_by_user, app_version)
       values
         (app.current_org_id(), $1, $2, $3, true, 'Yes', $4::uuid, 'npd-release-materialize-v1')`,
      [productCode, project.name, String(item.shelf_life_days ?? 30), ctx.userId],
    );
  } else {
    await ctx.client.query(
      `update public.product
          set product_name = coalesce(product_name, $2),
              shelf_life = coalesce(nullif(shelf_life, ''), $3),
              done_mrp = true,
              closed_mrp = 'Yes'
        where org_id = app.current_org_id() and product_code = $1`,
      [productCode, project.name, String(item.shelf_life_days ?? 30)],
    );
  }

  if (formulation) {
    await ctx.client.query(
      `update public.formulations
          set product_code = $2
        where org_id = app.current_org_id()
          and project_id = $1::uuid
          and product_code is null`,
      [project.id, productCode],
    );
  }

  return item;
}

async function loadItem(ctx: OrgContextLike, productCode: string): Promise<ItemRow | null> {
  const { rows } = await ctx.client.query<ItemRow>(
    `select id, item_code, name, shelf_life_days
       from public.items
      where org_id = app.current_org_id()
        and item_code = $1
      limit 1`,
    [productCode],
  );
  return rows[0] ?? null;
}

async function stampProductCloseoutInputs(ctx: OrgContextLike, project: ProjectRow, item: ItemRow): Promise<void> {
  const pilot = await loadPilotEvidence(ctx, project.id);
  const productCode = deriveProductionCode(project.product_code as string);
  await ctx.client.query(
    `update public.product
        set shelf_life = coalesce(nullif(shelf_life, ''), $2),
            done_mrp = true,
            closed_mrp = 'Yes',
            private_jsonb = private_jsonb
              || jsonb_strip_nulls(jsonb_build_object(
                   'npd_project_id', $3::text,
                   'npd_locked_for_release_at', now(),
                   'npd_pilot_run_id', $4::text,
                   'pilot_wo_reference', $5::text
                 ))
      where org_id = app.current_org_id()
        and product_code = $1`,
    [
      productCode,
      String(item.shelf_life_days ?? 30),
      project.id,
      pilot?.id ?? null,
      pilot?.wo_reference ?? null,
    ],
  );
}

async function loadPilotEvidence(ctx: OrgContextLike, projectId: string): Promise<PilotEvidenceRow | null> {
  const { rows } = await ctx.client.query<PilotEvidenceRow>(
    `select id, wo_reference, status
       from public.pilot_runs
      where org_id = app.current_org_id()
        and project_id = $1::uuid
      order by case when status = 'completed' then 0 else 1 end,
               planned_date desc nulls last,
               created_at desc
      limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function loadExistingActiveNpdBom(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string,
): Promise<BomHeaderRow | null> {
  const { rows } = await ctx.client.query<BomHeaderRow>(
    `select h.id, h.version
       from public.bom_headers h
      where h.org_id = app.current_org_id()
        and h.npd_project_id = $1::uuid
        and h.product_id = $2
        and h.origin_module = 'npd'
        and h.status = 'active'
        and exists (
          select 1
            from public.bom_lines l
           where l.org_id = h.org_id
             and l.bom_header_id = h.id
        )
      order by h.version desc, h.created_at desc
      limit 1`,
    [projectId, productCode],
  );
  return rows[0] ?? null;
}

async function createActiveNpdBom(
  ctx: OrgContextLike,
  project: ProjectRow,
  formulation: LockedFormulationRow,
  ingredients: IngredientRow[],
): Promise<BomHeaderRow> {
  const productCode = deriveProductionCode(project.product_code as string);
  const version = await nextBomVersion(ctx, productCode);
  const yieldPct = normalizeBomYieldPct(formulation.target_yield_pct);
  let rows: BomHeaderRow[];
  try {
    ({ rows } = await ctx.client.query<BomHeaderRow>(
      `insert into public.bom_headers
         (org_id, product_id, item_id, npd_project_id, origin_module, status, version, yield_pct,
          effective_from, notes, created_by_user, app_version)
       values
         (app.current_org_id(), $1, (select id from public.items where org_id = app.current_org_id() and item_code = $1), $2::uuid, 'npd', 'draft', $3, $4::numeric,
          current_date, $5, $6::uuid, 'npd-release-materialize-v1')
       returning id, version`,
      [
        productCode,
        project.id,
        version,
        yieldPct,
        `Materialized from locked NPD formulation version ${formulation.version_number}.`,
        ctx.userId,
      ],
    ));
  } catch (error) {
    throw new Error(formatBomHeaderInsertError(error));
  }
  const header = rows[0];
  if (!header) throw new Error('bom_headers insert returned no row');

  const qtyMultiplier = project.pack_weight_g ? Number(project.pack_weight_g) / 1000 : 1;
  for (let index = 0; index < ingredients.length; index++) {
    const ingredient = ingredients[index]!;
    const quantity = (Number(ingredient.qty_kg ?? 0) * qtyMultiplier).toFixed(6);
    await ctx.client.query(
      `insert into public.bom_lines
         (org_id, bom_header_id, line_no, item_id, component_code, component_type, quantity, uom,
          scrap_pct, manufacturing_operation_name, sequence, is_phantom, source)
       values
         (app.current_org_id(), $1::uuid, $2, $3::uuid, $4, 'RM', $5::numeric, 'kg',
          0.00, $6, $7, false, 'npd_locked_formulation')`,
      [
        header.id,
        index + 1,
        ingredient.item_id,
        ingredient.rm_code,
        quantity,
        'NPD formulation',
        ingredient.sequence,
      ],
    );
  }

  const packagingComponents = await loadPackagingComponents(ctx, project.id);
  for (let index = 0; index < packagingComponents.length; index++) {
    const component = packagingComponents[index]!;
    const lineNo = ingredients.length + index + 1;
    await ctx.client.query(
      `insert into public.bom_lines
         (org_id, bom_header_id, line_no, item_id, component_code, component_type, quantity, uom,
          scrap_pct, manufacturing_operation_name, sequence, is_phantom, source)
       values
         (app.current_org_id(), $1::uuid, $2, $3::uuid, $4, 'PM', $5::numeric, 'each',
          0.00, $6, $7, false, 'npd_packaging_components')`,
      [
        header.id,
        lineNo,
        component.item_id,
        component.component_name,
        component.qty,
        'NPD packaging',
        lineNo,
      ],
    );
  }

  await ctx.client.query(
    `update public.bom_headers
        set status = 'active',
            approved_by = $2::uuid,
            approved_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [header.id, ctx.userId],
  );

  return header;
}

async function loadPackagingComponents(ctx: OrgContextLike, projectId: string): Promise<PackagingComponentRow[]> {
  const { rows } = await ctx.client.query<PackagingComponentRow>(
    `select pc.component_name,
            pc.item_id::text as item_id,
            coalesce(pc.qty_per_pack, 1)::text as qty
       from public.packaging_components pc
      where pc.project_id = $1::uuid
        and pc.org_id = app.current_org_id()
        and pc.item_id is not null
      order by pc.display_order nulls last, pc.created_at`,
    [projectId],
  );
  return rows;
}

async function nextBomVersion(ctx: OrgContextLike, productCode: string): Promise<number> {
  const { rows } = await ctx.client.query<{ next_version: string | number }>(
    `select coalesce(max(version), 0) + 1 as next_version
       from public.bom_headers
      where org_id = app.current_org_id()
        and product_id = $1`,
    [productCode],
  );
  return Number(rows[0]?.next_version ?? 1);
}

function normalizeBomYieldPct(targetYieldPct: string | null): string {
  if (targetYieldPct === null) return '100';
  const trimmed = targetYieldPct.trim();
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) return '100';
  return trimmed;
}

function formatBomHeaderInsertError(error: unknown): string {
  const dbError = error as DbErrorLike;
  const constraint = dbError.constraint ? ` (${dbError.constraint})` : '';
  const detail = dbError.detail ?? dbError.message ?? 'unknown database error';
  if (dbError.code === '23514') {
    return `Could not generate production BOM header: database check constraint failed${constraint}. ${detail}`;
  }
  return `Could not generate production BOM header: ${detail}`;
}

async function loadApprovedFactorySpec(ctx: OrgContextLike, fgItemId: string): Promise<FactorySpecRow | null> {
  const { rows } = await ctx.client.query<FactorySpecRow>(
    `select id
       from public.factory_specs
      where org_id = app.current_org_id()
        and fg_item_id = $1::uuid
        and status in ('approved_for_factory', 'released_to_factory')
      order by version desc, updated_at desc
      limit 1`,
    [fgItemId],
  );
  return rows[0] ?? null;
}

async function createApprovedFactorySpec(
  ctx: OrgContextLike,
  project: ProjectRow,
  fgItemId: string,
  bom: BomHeaderRow,
): Promise<FactorySpecRow> {
  const productCode = deriveProductionCode(project.product_code as string);
  const version = await nextFactorySpecVersion(ctx, fgItemId);
  const { rows } = await ctx.client.query<FactorySpecRow>(
    `insert into public.factory_specs
       (org_id, fg_item_id, spec_code, version, status, source, bom_header_id, bom_version,
        approved_by, approved_at, notes, created_by)
     values
       (app.current_org_id(), $1::uuid, $2, $3, 'approved_for_factory', 'technical',
        $4::uuid, $5, $6::uuid, now(), $7, $6::uuid)
     on conflict (org_id, fg_item_id) where status = 'approved_for_factory'
     do nothing
     returning id`,
    [
      fgItemId,
      `FS-${productCode}-v${version}`,
      version,
      bom.id,
      bom.version,
      ctx.userId,
      `Auto-seeded from NPD release ${project.code}; initial Technical factory spec evidence.`,
    ],
  );
  const spec = rows[0] ?? await loadApprovedFactorySpec(ctx, fgItemId);
  if (!spec) throw new Error('factory_specs insert returned no row');
  return spec;
}

async function nextFactorySpecVersion(ctx: OrgContextLike, fgItemId: string): Promise<number> {
  const { rows } = await ctx.client.query<{ next_version: string | number }>(
    `select coalesce(max(version), 0) + 1 as next_version
       from public.factory_specs
      where org_id = app.current_org_id()
        and fg_item_id = $1::uuid`,
    [fgItemId],
  );
  return Number(rows[0]?.next_version ?? 1);
}

function emptyResult(
  projectId: string,
  productCode: string | null,
  productionCode: string | null,
): MaterializeNpdBomResult {
  return {
    projectId,
    productCode,
    productionCode,
    itemId: null,
    bomHeaderId: null,
    factorySpecId: null,
    yieldPromptRequired: false,
    createdBom: false,
    createdFactorySpec: false,
  };
}
