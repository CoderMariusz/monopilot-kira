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
  packs_per_case: number | null;
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
  substitute_item_id: string | null;
  qty_kg: string | null;
  sequence: number;
  wip_definition_id: string | null;
};

type WipDefinitionRow = {
  id: string;
  item_id: string | null;
  item_code: string | null;
  name: string;
  base_uom: string;
  yield_pct: string;
  version: number;
};

type WipDefinitionIngredientRow = {
  item_id: string;
  item_code: string;
  qty_per_unit: string;
  uom: string;
  sequence: number;
};

type PackagingComponentRow = {
  component_name: string;
  item_id: string;
  substitute_item_id: string | null;
  qty: string;
  scrap_pct: string;
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

type ExpectedBomLine = {
  line_no: number;
  item_id: string | null;
  substitute_item_id: string | null;
  component_code: string;
  component_type: 'RM' | 'WIP' | 'PM';
  quantity: string;
  uom: string;
  scrap_pct: string;
  manufacturing_operation_name: string;
  sequence: number;
  is_phantom: boolean;
  source: string;
};

type ProductProcessYields = {
  all: number[];
  byIngredientItemId: Map<string, number[]>;
  byWipItemId: Map<string, number[]>;
  /** Distinct prod_detail component rows carrying processes. */
  componentCount: number;
};

type FactorySpecRow = {
  id: string;
  /** Bound BOM header — null on legacy rows; used to detect regen drift. */
  bom_header_id?: string | null;
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
  code?: 'PRODUCTION_CODE_CONFLICT' | 'PACKS_PER_BOX_REQUIRED' | 'WIP_ITEM_REQUIRED';
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
  const plainIngredients = ingredients.filter((ingredient) => !ingredient.wip_definition_id);
  const wipIngredients = ingredients.filter((ingredient) => !!ingredient.wip_definition_id);

  const existingBom = await loadExistingActiveNpdBom(ctx, project.id, productionCode);
  const wipComponents = await resolveWipComponents(ctx, wipIngredients);
  if (wipComponents.some((component) => !component.itemId)) {
    return {
      code: 'WIP_ITEM_REQUIRED',
      ...emptyResult(project.id, project.product_code, productionCode),
    };
  }

  const packagingComponents = await loadPackagingComponents(ctx, project.id);
  const processYields = await loadProductProcessYields(ctx, productionCode);
  const expectedLines = buildExpectedBomLines(
    project,
    plainIngredients,
    wipComponents,
    packagingComponents,
    processYields,
  );
  const existingBomMatches = existingBom
    ? await npdBomContentMatches(ctx, existingBom.id, formulation, expectedLines)
    : false;

  // v2 anchor #2: a production BOM is built PER BOX, so packs-per-box must be set before we can
  // create or regenerate one. This gate MUST run BEFORE ensureFgItemAndProduct/stampProductCloseoutInputs:
  // those WRITE and this function RETURNS (not throws) on the missing-packs path, so withOrgContext
  // would COMMIT those writes. An unchanged active BOM is still reused idempotently.
  if (!existingBomMatches && expectedLines.length > 0 && Number(project.packs_per_case ?? 0) <= 0) {
    return {
      code: 'PACKS_PER_BOX_REQUIRED',
      ...emptyResult(project.id, project.product_code, productionCode),
    };
  }

  const item = await ensureFgItemAndProduct(ctx, project, formulation);
  await stampProductCloseoutInputs(ctx, project, item);
  await ensureWipDefinitionBoms(ctx, wipComponents);

  const bom = existingBomMatches && existingBom ? existingBom : (expectedLines.length > 0
    ? await createActiveNpdBom(ctx, project, formulation, expectedLines, existingBom)
    : null);

  const existingSpec = bom ? await loadApprovedFactorySpec(ctx, item.id) : null;
  let createdSpec: FactorySpecRow | null = null;
  if (bom && !existingSpec) {
    createdSpec = await createApprovedFactorySpec(ctx, project, item.id, bom);
  } else if (bom && existingSpec && existingSpec.bom_header_id != null && existingSpec.bom_header_id !== bom.id) {
    // Regen produced a NEW BOM version while the frozen approved spec still
    // points at the superseded header — check_factory_release_consistency
    // rejects the release on that mismatch (walk-6 HIGH-1). Mirror the BOM's
    // clone-on-write: supersede the stale spec FIRST (frees the partial-unique
    // approved slot), then mint the next spec version bound to the new BOM.
    await ctx.client.query(
      `update public.factory_specs
          set status = 'superseded',
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid
          and status = 'approved_for_factory'`,
      [existingSpec.id],
    );
    createdSpec = await createApprovedFactorySpec(ctx, project, item.id, bom);
  }

  // Recompute the allergen cascade over the just-materialized BOM and stamp the
  // close-out timestamp — closeOutLegacyStagesForLaunch requires
  // trial_allergens_cascade_recomputed_at, and nothing else in the pipeline ever
  // writes it (live walk-5: every project 409'd at handoff→launched on it). The
  // stamp is honest: the recompute genuinely ran here, right after the BOM landed.
  if (bom) {
    const cascadeItemIds = [
      ...plainIngredients.map((ingredient) => ingredient.item_id),
      ...wipComponents.map((component) => component.itemId),
    ];
    for (const itemId of cascadeItemIds) {
      if (!itemId) continue;
      await cascadeAllergensForChangedItem(
        ctx.client as Parameters<typeof cascadeAllergensForChangedItem>[0],
        ctx.orgId,
        itemId,
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
    createdBom: !(existingBomMatches && existingBom) && !!bom,
    createdFactorySpec: !!createdSpec,
  };
}

async function loadProject(ctx: OrgContextLike, projectId: string): Promise<ProjectRow | null> {
  const { rows } = await ctx.client.query<ProjectRow>(
    `select id, code, name, type, current_gate, current_stage, product_code, pack_weight_g::text as pack_weight_g, packs_per_case
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
            substitute_item_id::text as substitute_item_id,
            qty_kg::text as qty_kg,
            sequence,
            wip_definition_id::text as wip_definition_id
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
  const outputUom = project.pack_weight_g != null
    ? (Number(project.packs_per_case ?? 0) > 0 ? 'box' : 'each')
    : 'base';
  const netQtyPerEach = project.pack_weight_g != null ? Number(project.pack_weight_g) / 1000.0 : null;
  const inserted = await ctx.client.query<ItemRow>(
    `insert into public.items
       (org_id, item_code, item_type, name, status, uom_base, shelf_life_days, output_uom,
        net_qty_per_each, each_per_box, origin_module, npd_project_id, created_by)
     values
       (app.current_org_id(), $1, 'fg', $2, 'active', 'kg', 30, $3, $4::numeric, $5::int,
        'npd', $6::uuid, $7::uuid)
     on conflict (org_id, item_code) do nothing
     returning id, item_code, name, shelf_life_days`,
    [productCode, project.name, outputUom, netQtyPerEach, project.packs_per_case, project.id, ctx.userId],
  );
  const item = inserted.rows[0] ?? (await loadItem(ctx, productCode));
  if (!item) throw new Error(`failed to ensure FG item ${productCode}`);

  if (project.packs_per_case != null && project.packs_per_case > 0) {
    // ONE atomic statement: items_output_uom_pack_factors_check (mig 267) demands
    // net_qty_per_each AND each_per_box be NOT NULL the moment output_uom becomes
    // 'box' — flipping the uom in a separate UPDATE from the factors violated the
    // CHECK for a pre-existing FG created before its pack weight was set (walk-2
    // H-1). If neither the stored nor the incoming pack weight is known, keep the
    // current output_uom rather than write an unsatisfiable 'box'.
    await ctx.client.query(
      `update public.items
          set each_per_box = $2::int,
              net_qty_per_each = coalesce(net_qty_per_each, $3::numeric),
              output_uom = case
                when coalesce(net_qty_per_each, $3::numeric) is not null then 'box'
                else output_uom
              end
        where org_id = app.current_org_id()
          and item_code = $1
          and (coalesce(each_per_box, 0) <> $2
               or output_uom is distinct from 'box'
               or (net_qty_per_each is null and $3::numeric is not null))`,
      [productCode, project.packs_per_case, netQtyPerEach],
    );
  }
  // Pair each_per_box with net_qty_per_each (kg per pack) so per-box WO consumption scaling
  // (kg_per_box = each_per_box × net_qty_per_each, slice S2-WO) has both factors even for an
  // FG item created before its pack weight was set. Idempotent: only fills a NULL.
  if (netQtyPerEach != null) {
    await ctx.client.query(
      `update public.items set net_qty_per_each = $2::numeric where org_id = app.current_org_id() and item_code = $1 and net_qty_per_each is null`,
      [productCode, netQtyPerEach],
    );
    // A discrete pack product (it has a per-each weight) must be orderable in each/box on the WO,
    // not silently treated as bulk kg. The INSERT above is "on conflict do nothing", so an FG item
    // first created as a draft before its pack weight was set keeps output_uom='base' and the WO
    // modal then shows "Quantity (kg)" with no each/box conversion (owner: "FG-NPD-012 → automatically
    // kg"). Upgrade base→each here; never clobber an already-chosen 'box'/'each'.
    await ctx.client.query(
      `update public.items set output_uom = 'each'
        where org_id = app.current_org_id()
          and item_code = $1
          and output_uom = 'base'
          and coalesce(each_per_box, 0) <= 0`,
      [productCode],
    );
    await ctx.client.query(
      `update public.items set uom_base = 'kg'
        where org_id = app.current_org_id()
          and item_code = $1
          and uom_base in ('szt', 'g')`,
      [productCode],
    );
  }

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
  lines: ExpectedBomLine[],
  supersedesBom: BomHeaderRow | null,
): Promise<BomHeaderRow> {
  const productCode = deriveProductionCode(project.product_code as string);
  const version = await nextBomVersion(ctx, productCode);
  const yieldPct = normalizeBomYieldPct(formulation.target_yield_pct);
  let rows: BomHeaderRow[];
  try {
    ({ rows } = await ctx.client.query<BomHeaderRow>(
      `insert into public.bom_headers
         (org_id, product_id, item_id, npd_project_id, origin_module, status, version, yield_pct,
          supersedes_bom_header_id, line_basis, effective_from, notes, created_by_user, app_version)
       values
         (app.current_org_id(), $1, (select id from public.items where org_id = app.current_org_id() and item_code = $1), $2::uuid, 'npd', 'draft', $3, $4::numeric,
          $5::uuid, 'per_box', current_date, $6, $7::uuid, 'npd-release-materialize-v1')
       returning id, version`,
      [
        productCode,
        project.id,
        version,
        yieldPct,
        supersedesBom?.id ?? null,
        `Materialized from locked NPD formulation version ${formulation.version_number}.`,
        ctx.userId,
      ],
    ));
  } catch (error) {
    throw new Error(formatBomHeaderInsertError(error));
  }
  const header = rows[0];
  if (!header) throw new Error('bom_headers insert returned no row');

  for (const line of lines) {
    await ctx.client.query(
      `insert into public.bom_lines
         (org_id, bom_header_id, line_no, item_id, substitute_item_id, component_code, component_type, quantity, uom,
          scrap_pct, manufacturing_operation_name, sequence, is_phantom, source)
       values
         (app.current_org_id(), $1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7::numeric, $8,
          $9::numeric, $10, $11, $12::boolean, $13)`,
      [
        header.id,
        line.line_no,
        line.item_id,
        line.substitute_item_id,
        line.component_code,
        line.component_type,
        line.quantity,
        line.uom,
        line.scrap_pct,
        line.manufacturing_operation_name,
        line.sequence,
        line.is_phantom,
        line.source,
      ],
    );
  }

  // ORDER MATTERS (walk-4 blocker): bom_headers_active_version_idx is a partial
  // UNIQUE on (org_id, product_id) WHERE status='active' — the OLD active header
  // must be superseded BEFORE the new one flips to active, or the flip violates
  // the index and the whole promote rolls back.
  if (supersedesBom) {
    await ctx.client.query(
      `update public.bom_headers
          set status = 'superseded',
              effective_to = current_date,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid
          and status = 'active'`,
      [supersedesBom.id],
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

function buildExpectedBomLines(
  project: ProjectRow,
  ingredients: IngredientRow[],
  wipComponents: Array<{ itemId: string; itemCode: string; qtyKg: string; sequence: number }>,
  packagingComponents: PackagingComponentRow[],
  processYields: ProductProcessYields,
): ExpectedBomLine[] {
  const packsPerBox = Number(project.packs_per_case ?? 0);
  const lines: ExpectedBomLine[] = [];
  for (let index = 0; index < ingredients.length; index++) {
    const ingredient = ingredients[index]!;
    const quantity = computeBomLineQty(
      Number(ingredient.qty_kg ?? 0),
      packsPerBox,
      compoundedYieldPctForComponent(processYields, ingredient.item_id),
    ).toFixed(6);
    lines.push({
      line_no: index + 1,
      item_id: ingredient.item_id,
      substitute_item_id: ingredient.substitute_item_id,
      component_code: ingredient.rm_code,
      component_type: 'RM',
      quantity,
      uom: 'kg',
      scrap_pct: '0.00',
      manufacturing_operation_name: 'NPD formulation',
      sequence: ingredient.sequence,
      is_phantom: false,
      source: 'npd_locked_formulation',
    });
  }

  for (let index = 0; index < wipComponents.length; index++) {
    const component = wipComponents[index]!;
    const quantity = computeBomLineQty(
      Number(component.qtyKg),
      packsPerBox,
      compoundedYieldPctForComponent(processYields, component.itemId),
    ).toFixed(6);
    lines.push({
      line_no: ingredients.length + index + 1,
      item_id: component.itemId,
      substitute_item_id: null,
      component_code: component.itemCode,
      component_type: 'WIP',
      quantity,
      uom: 'kg',
      scrap_pct: '0.00',
      manufacturing_operation_name: 'NPD WIP formulation',
      sequence: component.sequence,
      is_phantom: false,
      source: 'npd_locked_formulation_wip',
    });
  }

  for (let index = 0; index < packagingComponents.length; index++) {
    const component = packagingComponents[index]!;
    const lineNo = ingredients.length + wipComponents.length + index + 1;
    lines.push({
      line_no: lineNo,
      item_id: component.item_id,
      substitute_item_id: component.substitute_item_id,
      component_code: component.component_name,
      component_type: 'PM',
      quantity: (Number(component.qty) * packsPerBox).toFixed(6),
      uom: 'each',
      scrap_pct: clampScrapPct(component.scrap_pct),
      manufacturing_operation_name: 'NPD packaging',
      sequence: lineNo,
      is_phantom: false,
      source: 'npd_packaging_components',
    });
  }
  return lines;
}

async function loadProductProcessYields(ctx: OrgContextLike, productCode: string): Promise<ProductProcessYields> {
  const { rows } = await ctx.client.query<{
    prod_detail_id: string;
    ingredient_item_id: string | null;
    wip_item_id: string | null;
    display_order: number;
    yield_pct: string | number | null;
  }>(
    `select pd.id::text as prod_detail_id,
            pd.item_id::text as ingredient_item_id,
            wp.wip_item_id::text as wip_item_id,
            wp.display_order,
            wp.yield_pct::text as yield_pct
       from public.prod_detail pd
       join public.npd_wip_processes wp
         on wp.org_id = pd.org_id
        and wp.prod_detail_id = pd.id
      where pd.org_id = app.current_org_id()
        and pd.product_code = $1
      order by pd.component_index asc, wp.display_order asc`,
    [productCode],
  );

  const byDetail = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byDetail.get(row.prod_detail_id) ?? [];
    list.push(row);
    byDetail.set(row.prod_detail_id, list);
  }

  const all = rows.map((row) => Number(row.yield_pct ?? 100));
  const byIngredientItemId = new Map<string, number[]>();
  const byWipItemId = new Map<string, number[]>();
  for (const detailRows of byDetail.values()) {
    const sorted = [...detailRows].sort((a, b) => Number(a.display_order) - Number(b.display_order));
    const ingredientItemId = sorted.find((row) => row.ingredient_item_id)?.ingredient_item_id;
    if (ingredientItemId) {
      byIngredientItemId.set(ingredientItemId, sorted.map((row) => Number(row.yield_pct ?? 100)));
    }
    for (let index = 0; index < sorted.length; index++) {
      const row = sorted[index]!;
      if (row.wip_item_id) {
        byWipItemId.set(row.wip_item_id, sorted.slice(index).map((suffix) => Number(suffix.yield_pct ?? 100)));
      }
    }
  }

  return { all, byIngredientItemId, byWipItemId, componentCount: byDetail.size };
}

function compoundedYieldPctForComponent(processYields: ProductProcessYields, itemId: string | null): number {
  // Unlinked components may only inherit the FULL process chain when the product
  // has a SINGLE prod_detail component (the chain unambiguously IS the product's
  // chain — the owner's canonical 0.300/0.95/0.95 case). With multiple components
  // the union of every sibling's processes would over-compound (divide by
  // 0.95^(2×N)), so an unlinked component takes no yield adjustment until it is
  // explicitly linked to its component chain.
  const fallback = processYields.componentCount <= 1 ? processYields.all : [];
  const yields = itemId
    ? processYields.byIngredientItemId.get(itemId) ?? processYields.byWipItemId.get(itemId) ?? fallback
    : fallback;
  if (yields.length === 0) return 100;
  return yields.reduce((factor, yieldPct) => {
    if (!Number.isFinite(yieldPct) || yieldPct <= 0 || yieldPct > 100) return factor;
    return factor * (yieldPct / 100);
  }, 1) * 100;
}

async function npdBomContentMatches(
  ctx: OrgContextLike,
  bomHeaderId: string,
  formulation: LockedFormulationRow,
  expectedLines: ExpectedBomLine[],
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ matches: boolean }>(
    `with expected as (
       select *
         from jsonb_to_recordset($2::jsonb)
              as x(line_no int, item_id uuid, substitute_item_id uuid, component_code text, component_type text,
                   quantity numeric, uom text, scrap_pct numeric, manufacturing_operation_name text,
                   sequence int, is_phantom boolean, source text)
     ),
     header_ok as (
       select true as ok
         from public.bom_headers
        where org_id = app.current_org_id()
          and id = $1::uuid
          and line_basis = 'per_box'
          and yield_pct = $3::numeric
     ),
     line_diff as (
       (
         select line_no, item_id, substitute_item_id, component_code, component_type, quantity, uom,
                scrap_pct, manufacturing_operation_name, sequence, is_phantom, source
           from public.bom_lines
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
       )
       except
       select line_no, item_id, substitute_item_id, component_code, component_type, quantity, uom,
              scrap_pct, manufacturing_operation_name, sequence, is_phantom, source
         from expected
       union all
       select line_no, item_id, substitute_item_id, component_code, component_type, quantity, uom,
              scrap_pct, manufacturing_operation_name, sequence, is_phantom, source
         from expected
       except
       (
         select line_no, item_id, substitute_item_id, component_code, component_type, quantity, uom,
                scrap_pct, manufacturing_operation_name, sequence, is_phantom, source
           from public.bom_lines
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
       )
     )
     select exists(select 1 from header_ok) and not exists(select 1 from line_diff) as matches`,
    [
      bomHeaderId,
      JSON.stringify(expectedLines),
      normalizeBomYieldPct(formulation.target_yield_pct),
    ],
  );
  return rows[0]?.matches === true;
}

async function resolveWipComponents(
  ctx: OrgContextLike,
  wipIngredients: IngredientRow[],
): Promise<Array<{ itemId: string; itemCode: string; qtyKg: string; sequence: number }>> {
  const components: Array<{ itemId: string; itemCode: string; qtyKg: string; sequence: number }> = [];
  for (const row of wipIngredients) {
    const definitionId = row.wip_definition_id;
    if (!definitionId) continue;
    const definition = await loadWipDefinition(ctx, definitionId);
    if (!definition?.item_id || !definition.item_code) {
      components.push({ itemId: '', itemCode: '', qtyKg: row.qty_kg ?? '0', sequence: row.sequence });
      continue;
    }
    components.push({
      itemId: definition.item_id,
      itemCode: definition.item_code,
      qtyKg: row.qty_kg ?? '0',
      sequence: row.sequence,
    });
  }
  return components;
}

async function ensureWipDefinitionBoms(
  ctx: OrgContextLike,
  wipComponents: Array<{ itemId: string; itemCode: string }>,
): Promise<void> {
  const seenItemIds = new Set<string>();
  for (const component of wipComponents) {
    if (seenItemIds.has(component.itemId)) continue;
    const definition = await loadWipDefinitionByItem(ctx, component.itemId);
    if (definition) await ensureActiveWipBom(ctx, definition);
    seenItemIds.add(component.itemId);
  }
}

async function loadWipDefinition(ctx: OrgContextLike, definitionId: string): Promise<WipDefinitionRow | null> {
  const { rows } = await ctx.client.query<WipDefinitionRow>(
    `select wd.id::text as id,
            wd.item_id::text as item_id,
            i.item_code,
            wd.name,
            wd.base_uom,
            wd.yield_pct::text as yield_pct,
            wd.version
       from public.wip_definitions wd
       left join public.items i
         on i.org_id = wd.org_id
        and i.id = wd.item_id
      where wd.org_id = app.current_org_id()
        and wd.id = $1::uuid
        and wd.status = 'active'
      limit 1`,
    [definitionId],
  );
  return rows[0] ?? null;
}

async function loadWipDefinitionByItem(ctx: OrgContextLike, itemId: string): Promise<WipDefinitionRow | null> {
  const { rows } = await ctx.client.query<WipDefinitionRow>(
    `select wd.id::text as id,
            wd.item_id::text as item_id,
            i.item_code,
            wd.name,
            wd.base_uom,
            wd.yield_pct::text as yield_pct,
            wd.version
       from public.wip_definitions wd
       join public.items i
         on i.org_id = wd.org_id
        and i.id = wd.item_id
      where wd.org_id = app.current_org_id()
        and wd.item_id = $1::uuid
        and wd.status = 'active'
      order by wd.version desc, wd.updated_at desc
      limit 1`,
    [itemId],
  );
  return rows[0] ?? null;
}

async function loadWipDefinitionIngredients(
  ctx: OrgContextLike,
  definitionId: string,
): Promise<WipDefinitionIngredientRow[]> {
  const { rows } = await ctx.client.query<WipDefinitionIngredientRow>(
    `select wdi.item_id::text as item_id,
            i.item_code,
            wdi.qty_per_unit::text as qty_per_unit,
            wdi.uom,
            wdi.sequence
       from public.wip_definition_ingredients wdi
       join public.items i
         on i.org_id = wdi.org_id
        and i.id = wdi.item_id
      where wdi.org_id = app.current_org_id()
        and wdi.wip_definition_id = $1::uuid
      order by wdi.sequence, i.item_code`,
    [definitionId],
  );
  return rows;
}

async function ensureActiveWipBom(ctx: OrgContextLike, definition: WipDefinitionRow): Promise<BomHeaderRow | null> {
  if (!definition.item_id || !definition.item_code) return null;
  const ingredients = await loadWipDefinitionIngredients(ctx, definition.id);
  if (ingredients.length === 0) return null;

  const existing = await loadActiveWipBom(ctx, definition.item_id);
  if (existing && await wipBomContentMatches(ctx, existing.id, definition, ingredients)) {
    return existing;
  }

  const version = await nextBomVersion(ctx, definition.item_code);
  const { rows } = await ctx.client.query<BomHeaderRow>(
    `insert into public.bom_headers
       (org_id, product_id, item_id, origin_module, status, version, supersedes_bom_header_id,
        yield_pct, line_basis, effective_from, notes, created_by_user, approved_by, approved_at, app_version)
     values
       (app.current_org_id(), $1, $2::uuid, 'npd', 'active', $3, $4::uuid,
        $5::numeric, 'per_base', current_date, $6, $7::uuid, $7::uuid, now(), 'npd-wip-materialize-v2')
     returning id, version`,
    [
      definition.item_code,
      definition.item_id,
      version,
      existing?.id ?? null,
      normalizeBomYieldPct(definition.yield_pct),
      `Materialized from WIP definition ${definition.name} v${definition.version}.`,
      ctx.userId,
    ],
  );
  const header = rows[0];
  if (!header) throw new Error('wip bom_headers insert returned no row');

  for (let index = 0; index < ingredients.length; index++) {
    const ingredient = ingredients[index]!;
    await ctx.client.query(
      `insert into public.bom_lines
         (org_id, bom_header_id, line_no, item_id, component_code, component_type, quantity, uom,
          scrap_pct, manufacturing_operation_name, sequence, is_phantom, source)
       values
         (app.current_org_id(), $1::uuid, $2, $3::uuid, $4, 'RM', $5::numeric, $6,
          0.00, $7, $8, false, 'npd_wip_definition')`,
      [
        header.id,
        index + 1,
        ingredient.item_id,
        ingredient.item_code,
        ingredient.qty_per_unit,
        ingredient.uom,
        'NPD WIP definition',
        ingredient.sequence,
      ],
    );
  }

  if (existing) {
    await ctx.client.query(
      `update public.bom_headers
          set status = 'superseded',
              effective_to = current_date,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid
          and status = 'active'`,
      [existing.id],
    );
  }
  return header;
}

async function loadActiveWipBom(ctx: OrgContextLike, itemId: string): Promise<BomHeaderRow | null> {
  const { rows } = await ctx.client.query<BomHeaderRow>(
    `select id, version
       from public.bom_headers
      where org_id = app.current_org_id()
        and item_id = $1::uuid
        and origin_module = 'npd'
        and status = 'active'
      order by version desc, created_at desc
      limit 1`,
    [itemId],
  );
  return rows[0] ?? null;
}

async function wipBomContentMatches(
  ctx: OrgContextLike,
  bomHeaderId: string,
  definition: WipDefinitionRow,
  ingredients: WipDefinitionIngredientRow[],
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ matches: boolean }>(
    `with expected as (
       select *
         from jsonb_to_recordset($3::jsonb)
              as x(item_id uuid, component_code text, quantity numeric, uom text, sequence int, line_no int)
     ),
     header_ok as (
       select true as ok
         from public.bom_headers
        where org_id = app.current_org_id()
          and id = $1::uuid
          and item_id = $2::uuid
          and line_basis = 'per_base'
          and yield_pct = $4::numeric
     ),
     line_diff as (
       (
         select item_id, component_code, quantity, uom, sequence, line_no
           from public.bom_lines
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and component_type = 'RM'
       )
       except
       select item_id, component_code, quantity, uom, sequence, line_no from expected
       union all
       select item_id, component_code, quantity, uom, sequence, line_no from expected
       except
       (
         select item_id, component_code, quantity, uom, sequence, line_no
           from public.bom_lines
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and component_type = 'RM'
       )
     )
     select exists(select 1 from header_ok) and not exists(select 1 from line_diff) as matches`,
    [
      bomHeaderId,
      definition.item_id,
      JSON.stringify(ingredients.map((ingredient, index) => ({
        item_id: ingredient.item_id,
        component_code: ingredient.item_code,
        quantity: ingredient.qty_per_unit,
        uom: ingredient.uom,
        sequence: ingredient.sequence,
        line_no: index + 1,
      }))),
      normalizeBomYieldPct(definition.yield_pct),
    ],
  );
  return rows[0]?.matches === true;
}

// Defensive clamp: scrap_pct is bounded 0..100 by the DB check, but guard against NULL/NaN/legacy
// rows so a stray value can never produce a negative or >100 BOM-line scrap.
function clampScrapPct(raw: string | null | undefined): string {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  return (n > 100 ? 100 : n).toFixed(2);
}

async function loadPackagingComponents(ctx: OrgContextLike, projectId: string): Promise<PackagingComponentRow[]> {
  const { rows } = await ctx.client.query<PackagingComponentRow>(
    `select coalesce(i.item_code, pc.component_name) as component_name,
            pc.item_id::text as item_id,
            pc.substitute_item_id::text as substitute_item_id,
            coalesce(pc.qty_per_pack, 1)::text as qty,
            coalesce(pc.scrap_pct, 0)::text as scrap_pct
       from public.packaging_components pc
       left join public.items i
         on i.org_id = pc.org_id
        and i.id = pc.item_id
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

/**
 * Per-box, compounded-yield-adjusted BOM line quantity.
 * formulation_ingredients.qty_kg is per PACK. A box holds packsPerBox packs, and real
 * consumption divides by the compounded process yield fraction for the process where the
 * component enters plus downstream processes. Components without process linkage use all
 * product processes, which is the safest interpretation of the product chain.
 */
export function computeBomLineQty(qtyKgPerPack: number, packsPerBox: number, yieldPct = 100): number {
  const nominalPerBox = qtyKgPerPack * packsPerBox;
  const yieldFraction = yieldPct > 0 && yieldPct <= 100 ? yieldPct / 100 : 1;
  return nominalPerBox / yieldFraction;
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
    `select id, bom_header_id
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
