'use server';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { fallbackFgProductCode } from './_lib/gate-helpers';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';
import {
  boxesOutputUnitRequiresPackFactors,
  type NpdBriefOutputUnit,
} from './_lib/materialize-npd-bom';
import { parseOptionalRetailPriceEur } from './_lib/retail-price-eur';
import {
  parseFutureTargetLaunch,
  parseOptionalPackWeightG,
  parseOptionalPacksPerCase,
  parseRequiredRunsPerWeek,
  parseRequiredWeeklyVolumePacks,
  todayIsoDateUtc,
} from './_lib/wizard-basics-validation';
import {
  DEFAULT_TEMPLATE_ID,
  PROJECT_CODE_SEQUENCE,
  PROJECT_CREATE_PERMISSION,
  PROJECT_CREATED_EVENT,
  type OrgContextLike,
  type ProjectPriority,
  hasPermission,
  parsePriority,
  parseStartFrom,
  trimOptionalString,
} from './shared';

export type CreateProjectInput = {
  name: string;
  /** Category (project.jsx wizard "Category" select). Stored in npd_projects.type. */
  type: string;
  prio?: ProjectPriority;
  owner?: string | null;
  targetLaunch?: string | null;
  notes?: string | null;
  // Brief step (folded in — mig 242). All optional.
  packFormat?: string | null;
  /** Costing v2: pack net weight in grams (the recipe batch size). */
  packWeightG?: number | null;
  packsPerCase?: number | null;
  outputUnit?: NpdBriefOutputUnit | null;
  /** Required — labeled * on Basics; must be > 0. */
  weeklyVolumePacks: number;
  /** Required — labeled * on Basics; must be ≥ 1. */
  runsPerWeek: number;
  salesChannel?: string | null;
  targetRetailPriceEur?: string | null;
  targetAudience?: string | null;
  marketingClaims?: string | null;
  constraints?: string | null;
  // Starting point step.
  startFrom: 'blank' | 'clone' | 'template';
  cloneSource?: string | null;
  templateId: string;
};

export type CreateProjectResult =
  | {
      ok: true;
      data: {
        id: string;
        code: string;
        checklistItemsSeeded: number;
        outboxEventType: typeof PROJECT_CREATED_EVENT;
      };
    }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' };

type ProjectInsertRow = {
  id: string;
  code: string;
};

type CountRow = {
  inserted_count: string | number;
};

export async function createProject(rawInput: unknown): Promise<CreateProjectResult> {
  const input = parseCreateProjectInput(rawInput);
  if (!input) return { ok: false, error: 'INVALID_INPUT' };

  try {
    return await withOrgContext<CreateProjectResult>(async (ctx): Promise<CreateProjectResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, PROJECT_CREATE_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN' };
      }

      const code = await allocateProjectCode(context);
      let draftProductCode = input.startFrom === 'blank' ? fallbackFgProductCode(code) : null;
      const { rows } = await context.client.query<ProjectInsertRow>(
        `insert into public.npd_projects
           (org_id, code, name, type, prio, owner, target_launch, notes,
            pack_format, sales_channel, target_retail_price_eur,
            target_audience, marketing_claims, constraints, pack_weight_g, packs_per_case,
            output_unit, weekly_volume_packs, runs_per_week,
            current_gate, current_stage, start_from, clone_source, created_by_user, app_version)
         values
           ($1::uuid, $2, $3, $4, $5, $6, $7::date, $8,
            $9, $10, $11::numeric,
            $12, $13, $14, $15::numeric, $16::integer, $17, $18::numeric, $19::numeric,
            'G0', $20, $21, $22, $23::uuid, 'npd-project-actions-v1')
         returning id, code`,
        [
          context.orgId,
          code,
          input.name,
          input.type,
          input.prio,
          input.owner,
          input.targetLaunch,
          input.notes,
          input.packFormat ?? null,
          input.salesChannel ?? null,
          input.targetRetailPriceEur ?? null,
          input.targetAudience ?? null,
          input.marketingClaims ?? null,
          input.constraints ?? null,
          input.packWeightG ?? null,
          input.packsPerCase ?? null,
          input.outputUnit ?? null,
          input.weeklyVolumePacks,
          input.runsPerWeek,
          'brief',
          input.startFrom,
          input.cloneSource ?? null,
          context.userId,
        ],
      );
      const project = rows[0];
      if (!project) return { ok: false, error: 'PERSISTENCE_FAILED' };

      if (draftProductCode) {
        draftProductCode = await bootstrapDraftRecipeProduct(context, project.id, draftProductCode, input.name);
      }

      const seeded = await seedChecklistItems(context, project.id, input.templateId);
      const formulationDraft = await seedFormulationDraft(context, project.id, draftProductCode);
      if (!formulationDraft) return { ok: false, error: 'PERSISTENCE_FAILED' };
      await seedBriefTargetPriceOnDraft(
        context,
        project.id,
        formulationDraft,
        input.targetRetailPriceEur ?? null,
      );
      await writeProjectCreatedOutbox(context, project.id, project.code, input, seeded);
      safeRevalidatePath('/pipeline');

      return {
        ok: true,
        data: {
          id: project.id,
          code: project.code,
          checklistItemsSeeded: seeded,
          outboxEventType: PROJECT_CREATED_EVENT,
        },
      };
    });
  } catch (err) {
    // Never swallow silently — a bare catch here once hid the real cause of
    // create failures (the only signal the user got was a generic "try again").
    // Surface it to the server logs so future regressions are diagnosable.
    console.error('[createProject] persistence failed', err);
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

function parseCreateProjectInput(rawInput: unknown): CreateProjectInput | null {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const input = rawInput as Record<string, unknown>;
  const name = trimOptionalString(input.name, 160);
  const type = trimOptionalString(input.type, 120);
  const prio = parsePriority(input.prio);
  const owner = trimOptionalString(input.owner, 120);
  const targetLaunch = parseFutureTargetLaunch(input.targetLaunch, todayIsoDateUtc());
  const notes = trimOptionalString(input.notes, 2000);
  const templateId = trimOptionalString(input.templateId, 80) ?? DEFAULT_TEMPLATE_ID;

  // Brief step — all optional (undefined === over-length/invalid → reject).
  const packFormat = trimOptionalString(input.packFormat, 160);
  const salesChannel = trimOptionalString(input.salesChannel, 80);
  const targetAudience = trimOptionalString(input.targetAudience, 400);
  const marketingClaims = trimOptionalString(input.marketingClaims, 600);
  const constraints = trimOptionalString(input.constraints, 2000);
  const targetRetailPriceEur = parseOptionalRetailPriceEur(input.targetRetailPriceEur);
  const packWeightG = parseOptionalPackWeightG(input.packWeightG);
  const packsPerCase = parseOptionalPacksPerCase(input.packsPerCase);
  const outputUnit = parseOptionalOutputUnit(input.outputUnit);
  // Basics labels mark these required (*): weekly volume > 0, runs/week ≥ 1.
  const weeklyVolumePacks = parseRequiredWeeklyVolumePacks(input.weeklyVolumePacks);
  const runsPerWeek = parseRequiredRunsPerWeek(input.runsPerWeek);
  const startFrom = parseStartFrom(input.startFrom);
  const cloneSource = trimOptionalString(input.cloneSource, 120);

  if (
    !name || !type || !prio || !templateId ||
    owner === undefined || targetLaunch === undefined || notes === undefined ||
    packFormat === undefined || salesChannel === undefined ||
    targetAudience === undefined || marketingClaims === undefined || constraints === undefined ||
    targetRetailPriceEur === undefined || packWeightG === undefined || packsPerCase === undefined ||
    outputUnit === undefined || weeklyVolumePacks === undefined || runsPerWeek === undefined ||
    cloneSource === undefined
  ) {
    return null;
  }

  if (
    boxesOutputUnitRequiresPackFactors({
      output_unit: outputUnit,
      pack_weight_g: packWeightG != null ? String(packWeightG) : null,
      packs_per_case: packsPerCase,
    })
  ) {
    return null;
  }

  return {
    name, type, prio, owner, targetLaunch, notes,
    packFormat, salesChannel, targetRetailPriceEur,
    targetAudience, marketingClaims, constraints, packWeightG, packsPerCase, outputUnit,
    weeklyVolumePacks, runsPerWeek,
    startFrom, cloneSource, templateId,
  };
}

function parseOptionalOutputUnit(value: unknown): NpdBriefOutputUnit | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'kg' || value === 'pieces' || value === 'boxes') return value;
  return undefined;
}

async function allocateProjectCode(ctx: OrgContextLike): Promise<string> {
  for (let attempts = 0; attempts < 999; attempts += 1) {
    const { rows } = await ctx.client.query<{ next_value: string }>(
      `insert into public.org_sequences (org_id, seq_name, current_value, updated_at)
       values ($1::uuid, $2, 1, now())
       on conflict (org_id, seq_name) do update
          set current_value = public.org_sequences.current_value + 1,
              updated_at = now()
        where public.org_sequences.current_value < 999
       returning current_value::text as next_value`,
      [ctx.orgId, PROJECT_CODE_SEQUENCE],
    );
    const nextValue = Number(rows[0]?.next_value);
    if (!Number.isInteger(nextValue) || nextValue < 1 || nextValue > 999) {
      throw new Error('NPD project code sequence exhausted');
    }

    const code = `NPD-${String(nextValue).padStart(3, '0')}`;
    const existing = await ctx.client.query<{ id: string }>(
      `select id
         from public.npd_projects
        where org_id = app.current_org_id()
          and code = $1
        limit 1`,
      [code],
    );
    if (existing.rows.length === 0) return code;
  }

  throw new Error('Unable to allocate an unused NPD project code');
}

async function isProductCodeLinkedToOtherProject(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string,
): Promise<boolean> {
  const onProject = await ctx.client.query<{ id: string }>(
    `select id
       from public.npd_projects
      where org_id = app.current_org_id()
        and id <> $1::uuid
        and product_code = $2
      limit 1`,
    [projectId, productCode],
  );
  if (onProject.rows.length > 0) return true;

  const onFormulation = await ctx.client.query<{ project_id: string }>(
    `select project_id
       from public.formulations
      where org_id = app.current_org_id()
        and project_id <> $1::uuid
        and product_code = $2
      limit 1`,
    [projectId, productCode],
  );
  return onFormulation.rows.length > 0;
}

function nextFgProductCodeCandidate(baseCode: string, attempt: number): string {
  const match = baseCode.match(/^(FG-)(\d+)$/i);
  if (match?.[2]) {
    const width = match[2].length;
    const next = Number(match[2]) + attempt;
    return `FG-${String(next).padStart(width, '0')}`;
  }
  return `${baseCode}-${attempt + 1}`;
}

async function resolveAvailableDraftProductCode(
  ctx: OrgContextLike,
  projectId: string,
  requestedProductCode: string,
): Promise<string> {
  for (let attempt = 0; attempt < 999; attempt += 1) {
    const candidate = attempt === 0 ? requestedProductCode : nextFgProductCodeCandidate(requestedProductCode, attempt);
    if (!(await isProductCodeLinkedToOtherProject(ctx, projectId, candidate))) {
      return candidate;
    }
  }
  throw new Error('Unable to allocate an unused FG product code');
}

async function bootstrapDraftRecipeProduct(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string,
  productName: string,
): Promise<string> {
  const resolvedProductCode = await resolveAvailableDraftProductCode(ctx, projectId, productCode);

  const existing = await ctx.client.query<{ product_code: string }>(
    `select product_code
       from public.product
      where org_id = app.current_org_id()
        and product_code = $1
        and deleted_at is null
      limit 1`,
    [resolvedProductCode],
  );
  if (existing.rows.length === 0) {
    await ctx.client.query(
      `insert into public.product
         (org_id, product_code, product_name, created_by_user, app_version)
       values
         (app.current_org_id(), $1, $2, $3::uuid, 'npd-create-project-v1')`,
      [resolvedProductCode, productName, ctx.userId],
    );
  }

  await ctx.client.query(
    `update public.npd_projects
        set product_code = $2
      where id = $1::uuid
        and org_id = app.current_org_id()
        and product_code is null`,
    [projectId, resolvedProductCode],
  );

  return resolvedProductCode;
}

/**
 * Auto-create the first formulation draft (v1) promised by the create-project wizard.
 * Mirrors createFormulationDraft (formulation/_actions/create-draft.ts) inside the
 * same org-scoped transaction as the project insert.
 */
async function seedFormulationDraft(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string | null,
): Promise<string | null> {
  const existing = await ctx.client.query<{ formulation_id: string; current_version_id: string | null }>(
    `select id as formulation_id, current_version_id from public.formulations
      where project_id = $1::uuid and org_id = app.current_org_id() limit 1`,
    [projectId],
  );

  let formulationId: string;
  if (existing.rows[0]) {
    formulationId = existing.rows[0].formulation_id;
    if (existing.rows[0].current_version_id) {
      return existing.rows[0].current_version_id;
    }
  } else {
    const inserted = await ctx.client.query<{ id: string }>(
      `insert into public.formulations (org_id, project_id, product_code, created_by_user)
       values (app.current_org_id(), $1::uuid, $2, $3::uuid)
       returning id`,
      [projectId, productCode, ctx.userId],
    );
    formulationId = inserted.rows[0]?.id ?? '';
    if (!formulationId) return null;
  }

  const nextNum = await ctx.client.query<{ n: number }>(
    `select coalesce(max(version_number), 0) + 1 as n
       from public.formulation_versions where formulation_id = $1::uuid`,
    [formulationId],
  );
  const version = await ctx.client.query<{ id: string }>(
    `insert into public.formulation_versions (formulation_id, version_number, state, created_by_user)
     values ($1::uuid, $2, 'draft', $3::uuid)
     returning id`,
    [formulationId, nextNum.rows[0]?.n ?? 1, ctx.userId],
  );
  const versionId = version.rows[0]?.id ?? null;
  if (!versionId) return null;

  await ctx.client.query(
    `update public.formulations set current_version_id = $2::uuid
      where id = $1::uuid and org_id = app.current_org_id()`,
    [formulationId, versionId],
  );

  return versionId;
}

async function seedBriefTargetPriceOnDraft(
  ctx: OrgContextLike,
  projectId: string,
  versionId: string,
  targetRetailPriceEur: string | null,
): Promise<void> {
  if (targetRetailPriceEur === null) return;
  await ctx.client.query(
    `update public.formulation_versions fv
        set target_price_eur = $3::numeric
       from public.formulations f
      where fv.id = $2::uuid
        and f.id = fv.formulation_id
        and f.project_id = $1::uuid
        and f.org_id = app.current_org_id()
        and fv.state = 'draft'`,
    [projectId, versionId, targetRetailPriceEur],
  );
}

async function seedChecklistItems(ctx: OrgContextLike, projectId: string, templateId: string): Promise<number> {
  const { rows } = await ctx.client.query<CountRow>(
    `with inserted as (
       insert into public.gate_checklist_items
         (org_id, project_id, gate_code, category_code, item_text, required)
       select $1::uuid, $2::uuid, template.gate_code, template.category_code, template.item_text, template.required
         from "Reference"."GateChecklistTemplates" template
        where template.org_id = app.current_org_id()
          and template.template_id = $3
        order by template.gate_code, template.sequence
       returning id
     )
     select count(*)::text as inserted_count from inserted`,
    [ctx.orgId, projectId, templateId],
  );
  return Number(rows[0]?.inserted_count ?? 0);
}

async function writeProjectCreatedOutbox(
  ctx: OrgContextLike,
  projectId: string,
  code: string,
  input: CreateProjectInput,
  checklistItemsSeeded: number,
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       ($1::uuid, $2, 'npd_project', $3, $4::jsonb, 'npd-project-actions-v1', $5)`,
    [
      ctx.orgId,
      PROJECT_CREATED_EVENT,
      projectId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        project_id: projectId,
        code,
        name: input.name,
        type: input.type,
        prio: input.prio,
        checklist_items_seeded: checklistItemsSeeded,
      }),
      `${PROJECT_CREATED_EVENT}:${projectId}`,
    ],
  );
}
