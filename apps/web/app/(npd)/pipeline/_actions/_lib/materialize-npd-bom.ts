import { type GateProjectRow } from './gate-helpers';
import { type OrgContextLike } from '../shared';

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

export type MaterializeNpdBomResult = {
  projectId: string;
  productCode: string | null;
  itemId: string | null;
  bomHeaderId: string | null;
  factorySpecId: string | null;
  createdBom: boolean;
  createdFactorySpec: boolean;
};

export async function materializeNpdBom(
  ctx: OrgContextLike,
  input: MaterializeNpdBomInput,
): Promise<MaterializeNpdBomResult> {
  const project = await loadProject(ctx, input.projectId);
  if (!project?.product_code) {
    return emptyResult(input.projectId, project?.product_code ?? null);
  }

  const formulation = await loadLockedFormulation(ctx, project.id);
  if (!formulation) {
    await ensureFgItemAndProduct(ctx, project, null);
    return emptyResult(project.id, project.product_code);
  }

  const ingredients = await loadIngredients(ctx, formulation.version_id);
  const item = await ensureFgItemAndProduct(ctx, project, formulation);
  await stampProductCloseoutInputs(ctx, project, item);

  const existingBom = await loadExistingActiveNpdBom(ctx, project.id, project.product_code);
  const bom = existingBom ?? (ingredients.length > 0
    ? await createActiveNpdBom(ctx, project, formulation, ingredients)
    : null);

  const existingSpec = bom ? await loadApprovedFactorySpec(ctx, item.id) : null;
  const createdSpec = !existingSpec && bom
    ? await createApprovedFactorySpec(ctx, project, item.id, bom)
    : null;

  return {
    projectId: project.id,
    productCode: project.product_code,
    itemId: item.id,
    bomHeaderId: bom?.id ?? null,
    factorySpecId: existingSpec?.id ?? createdSpec?.id ?? null,
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
  const productCode = project.product_code as string;
  const inserted = await ctx.client.query<ItemRow>(
    `insert into public.items
       (org_id, item_code, item_type, name, status, uom_base, shelf_life_days, created_by)
     values
       (app.current_org_id(), $1, 'fg', $2, 'active', 'kg', 30, $3::uuid)
     on conflict (org_id, item_code) do nothing
     returning id, item_code, name, shelf_life_days`,
    [productCode, project.name, ctx.userId],
  );
  const item = inserted.rows[0] ?? (await loadItem(ctx, productCode));
  if (!item) throw new Error(`failed to ensure FG item ${productCode}`);

  await ctx.client.query(
    `insert into public.product
       (org_id, product_code, product_name, shelf_life, done_mrp, closed_mrp, created_by_user, app_version)
     values
       (app.current_org_id(), $1, $2, $3, true, 'Yes', $4::uuid, 'npd-release-materialize-v1')
     on conflict (org_id, product_code) do update
       set product_name = coalesce(public.product.product_name, excluded.product_name),
           shelf_life = coalesce(nullif(public.product.shelf_life, ''), excluded.shelf_life),
           done_mrp = true,
           closed_mrp = 'Yes'`,
    [
      productCode,
      project.name,
      String(item.shelf_life_days ?? 30),
      ctx.userId,
    ],
  );

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
      project.product_code,
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
  const version = await nextBomVersion(ctx, project.product_code as string);
  const yieldPct = formulation.target_yield_pct ?? '100.000';
  const { rows } = await ctx.client.query<BomHeaderRow>(
    `insert into public.bom_headers
       (org_id, product_id, npd_project_id, origin_module, status, version, yield_pct,
        effective_from, notes, created_by_user, app_version)
     values
       (app.current_org_id(), $1, $2::uuid, 'npd', 'draft', $3, $4::numeric,
        current_date, $5, $6::uuid, 'npd-release-materialize-v1')
     returning id, version`,
    [
      project.product_code,
      project.id,
      version,
      yieldPct,
      `Materialized from locked NPD formulation version ${formulation.version_number}.`,
      ctx.userId,
    ],
  );
  const header = rows[0];
  if (!header) throw new Error('bom_headers insert returned no row');

  for (let index = 0; index < ingredients.length; index++) {
    const ingredient = ingredients[index]!;
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
        ingredient.qty_kg,
        'NPD formulation',
        ingredient.sequence,
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
      `FS-${project.product_code}-v${version}`,
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

function emptyResult(projectId: string, productCode: string | null): MaterializeNpdBomResult {
  return {
    projectId,
    productCode,
    itemId: null,
    bomHeaderId: null,
    factorySpecId: null,
    createdBom: false,
    createdFactorySpec: false,
  };
}
