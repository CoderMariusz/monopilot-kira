'use server';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  PROJECT_CREATE_PERMISSION,
  PROJECT_CODE_SEQUENCE,
  PROJECT_CREATED_EVENT,
  type OrgContextLike,
  hasPermission,
  parsePriority,
  trimOptionalString,
} from './shared';
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

/**
 * cloneProject — create a NEW NPD project seeded from an EXISTING one.
 *
 * Backs two previously-dead affordances (map dead-ends #3 + #4):
 *   - the project-header "Duplicate" button (clones the project the user is viewing),
 *   - the create-wizard "Clone existing recipe" start card (clones a picked source,
 *     overriding the brief header fields the user edited in the wizard).
 *
 * What it copies (a fresh DRAFT, never a stateful fork):
 *   - the header/brief fields (name → "… (copy)" unless overridden, type, prio, owner,
 *     pack/sales/audience/claims/constraints/target fields, notes),
 *   - the gate-checklist ITEMS (gate_code/category_code/item_text/required) — but NOT
 *     their completion state (a clone starts unchecked at G0/brief).
 *
 * What it deliberately does NOT copy: current_gate/current_stage (reset to G0/brief),
 * formulation versions / trials / pilot WOs / approvals / product_code linkage — those
 * carry lifecycle + heavy FK chains that must not silently leak into a brand-new draft.
 *
 * RBAC: gated on npd.project.create (same permission that gates create + delete).
 * Multi-tenant: every read/write is org-scoped via app.current_org_id() + RLS.
 */

export type CloneProjectOverrides = {
  /** Replace the source name (else "<source name> (copy)"). Trimmed; max 160. */
  name?: string | null;
  /** Replace the category/type (else the source type). Trimmed; max 120. */
  type?: string | null;
  prio?: 'high' | 'normal' | 'low' | null;
  targetLaunch?: string | null;
  packFormat?: string | null;
  packWeightG?: number | null;
  packsPerCase?: number | null;
  outputUnit?: NpdBriefOutputUnit | null;
  weeklyVolumePacks?: number | null;
  runsPerWeek?: number | null;
  salesChannel?: string | null;
  targetRetailPriceEur?: string | null;
  targetAudience?: string | null;
  marketingClaims?: string | null;
  constraints?: string | null;
  notes?: string | null;
};

export type CloneProjectInput = {
  /** The source project to clone (must belong to the caller's org). */
  sourceProjectId: string;
  /** Optional header overrides (used by the wizard's Clone flow). */
  overrides?: CloneProjectOverrides;
};

export type CloneProjectResult =
  | {
      ok: true;
      data: {
        id: string;
        code: string;
        checklistItemsCloned: number;
        sourceCode: string;
        outboxEventType: typeof PROJECT_CREATED_EVENT;
      };
    }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED' };

type SourceRow = {
  code: string;
  name: string;
  type: string;
  prio: 'high' | 'normal' | 'low';
  owner: string | null;
  target_launch: string | null;
  notes: string | null;
  pack_format: string | null;
  sales_channel: string | null;
  target_retail_price_eur: string | number | null;
  target_audience: string | null;
  marketing_claims: string | null;
  constraints: string | null;
  pack_weight_g: string | number | null;
  packs_per_case: string | number | null;
  output_unit: NpdBriefOutputUnit | null;
  weekly_volume_packs: string | number | null;
  runs_per_week: string | number | null;
};

type InsertRow = { id: string; code: string };
type CountRow = { cloned_count: string | number };

export async function cloneProject(rawInput: unknown): Promise<CloneProjectResult> {
  const input = parseCloneInput(rawInput);
  if (!input) return { ok: false, error: 'INVALID_INPUT' };

  try {
    return await withOrgContext<CloneProjectResult>(async (rawCtx): Promise<CloneProjectResult> => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, PROJECT_CREATE_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN' };
      }

      // 1. Load the source (org-scoped — RLS + explicit org_id guard).
      const { rows: sourceRows } = await ctx.client.query<SourceRow>(
        `select code, name, type, prio, owner, target_launch::text as target_launch, notes,
                pack_format, sales_channel, weekly_volume_packs, runs_per_week,
                target_retail_price_eur,
                target_audience, marketing_claims, constraints, pack_weight_g, packs_per_case,
                output_unit
           from public.npd_projects
          where id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [input.sourceProjectId],
      );
      const source = sourceRows[0];
      if (!source) return { ok: false, error: 'NOT_FOUND' };

      // 2. Resolve the cloned header (overrides win; else source; name defaults to
      //    "<source> (copy)" so the duplicate is visibly distinct in the list).
      const o = input.overrides;
      const name = o?.name ?? `${source.name} (copy)`;
      const type = o?.type ?? source.type;
      const prio = o?.prio ?? source.prio;
      const targetLaunch = pick(o, 'targetLaunch', source.target_launch);
      const packFormat = pick(o, 'packFormat', source.pack_format);
      const salesChannel = pick(o, 'salesChannel', source.sales_channel);
      const weeklyVolumePacks =
        o?.weeklyVolumePacks !== undefined && o.weeklyVolumePacks !== null
          ? o.weeklyVolumePacks
          : toNumericOrNull(source.weekly_volume_packs);
      const runsPerWeek =
        o?.runsPerWeek !== undefined && o.runsPerWeek !== null
          ? o.runsPerWeek
          : toNumericOrNull(source.runs_per_week);
      const targetAudience = pick(o, 'targetAudience', source.target_audience);
      const marketingClaims = pick(o, 'marketingClaims', source.marketing_claims);
      const constraints = pick(o, 'constraints', source.constraints);
      const notes = pick(o, 'notes', source.notes);
      const sourceTargetRetailPriceEur = parseOptionalRetailPriceEur(source.target_retail_price_eur);
      if (sourceTargetRetailPriceEur === undefined) return { ok: false, error: 'INVALID_INPUT' };
      const targetRetailPriceEur =
        o?.targetRetailPriceEur !== undefined && o.targetRetailPriceEur !== null
          ? o.targetRetailPriceEur
          : sourceTargetRetailPriceEur;
      const packWeightG =
        o?.packWeightG !== undefined && o.packWeightG !== null
          ? o.packWeightG
          : toNumericOrNull(source.pack_weight_g);
      const packsPerCase =
        o?.packsPerCase !== undefined && o.packsPerCase !== null
          ? o.packsPerCase
          : toNumericOrNull(source.packs_per_case);
      const outputUnit =
        o?.outputUnit != null ? o.outputUnit : source.output_unit;

      if (
        boxesOutputUnitRequiresPackFactors({
          output_unit: outputUnit,
          pack_weight_g: packWeightG != null ? String(packWeightG) : null,
          packs_per_case: packsPerCase,
        })
      ) {
        return { ok: false, error: 'INVALID_INPUT' };
      }

      // 3. Allocate a fresh org-scoped NPD-NNN code (same sequence as create).
      const code = await allocateProjectCode(ctx);

      // 4. Insert the clone — reset to G0/brief, start_from='clone', clone_source=<source code>.
      const { rows: insertRows } = await ctx.client.query<InsertRow>(
        `insert into public.npd_projects
           (org_id, code, name, type, prio, owner, target_launch, notes,
            pack_format, sales_channel, target_retail_price_eur,
            target_audience, marketing_claims, constraints, pack_weight_g, packs_per_case,
            output_unit, weekly_volume_packs, runs_per_week,
            current_gate, current_stage, start_from, clone_source, created_by_user, app_version)
         values
           ($1::uuid, $2, $3, $4, $5, $6, $7::date, $8,
            $9, $10, $11::numeric,
            $12, $13, $14, $15::numeric, $16::integer, $17,
            $18::numeric, $19::numeric,
            'G0', 'brief', 'clone', $20, $21::uuid, 'npd-project-actions-v1')
         returning id, code`,
        [
          ctx.orgId,
          code,
          name,
          type,
          prio,
          source.owner,
          targetLaunch,
          notes,
          packFormat,
          salesChannel,
          targetRetailPriceEur,
          targetAudience,
          marketingClaims,
          constraints,
          packWeightG,
          packsPerCase,
          outputUnit,
          weeklyVolumePacks,
          runsPerWeek,
          source.code,
          ctx.userId,
        ],
      );
      const cloned = insertRows[0];
      if (!cloned) return { ok: false, error: 'PERSISTENCE_FAILED' };

      // 5. Copy the gate-checklist ITEMS (definition only — completion state is reset).
      const { rows: countRows } = await ctx.client.query<CountRow>(
        `with copied as (
           insert into public.gate_checklist_items
             (org_id, project_id, gate_code, category_code, item_text, required)
           select app.current_org_id(), $1::uuid, src.gate_code, src.category_code, src.item_text, src.required
             from public.gate_checklist_items src
            where src.project_id = $2::uuid
              and src.org_id = app.current_org_id()
            order by src.gate_code, src.id
           returning id
         )
         select count(*)::text as cloned_count from copied`,
        [cloned.id, input.sourceProjectId],
      );
      const checklistItemsCloned = Number(countRows[0]?.cloned_count ?? 0);

      // 6. Emit the same created event as a fresh create (downstream consumers treat a
      //    clone as a new project), tagged with the clone source for lineage.
      await ctx.client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
         values
           ($1::uuid, $2, 'npd_project', $3, $4::jsonb, 'npd-project-actions-v1', $5)
         on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
        [
          ctx.orgId,
          PROJECT_CREATED_EVENT,
          cloned.id,
          JSON.stringify({
            org_id: ctx.orgId,
            actor_user_id: ctx.userId,
            project_id: cloned.id,
            code: cloned.code,
            name,
            type,
            prio,
            cloned_from_project_id: input.sourceProjectId,
            cloned_from_code: source.code,
            checklist_items_seeded: checklistItemsCloned,
          }),
          `${PROJECT_CREATED_EVENT}:${cloned.id}`,
        ],
      );

      safeRevalidatePath('/pipeline');

      return {
        ok: true,
        data: {
          id: cloned.id,
          code: cloned.code,
          checklistItemsCloned,
          sourceCode: source.code,
          outboxEventType: PROJECT_CREATED_EVENT,
        },
      };
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}

/** Override value (when explicitly provided) else the source value. */
function pick(
  overrides: CloneProjectOverrides | undefined,
  key: keyof CloneProjectOverrides,
  fallback: string | null,
): string | null {
  const value = overrides?.[key];
  if (value === undefined || value === null) return fallback;
  return value as string;
}

function toNumericOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

function parseCloneInput(rawInput: unknown): CloneProjectInput | null {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const input = rawInput as Record<string, unknown>;
  const sourceProjectId = typeof input.sourceProjectId === 'string' ? input.sourceProjectId.trim() : '';
  if (sourceProjectId.length === 0) return null;

  if (input.overrides === undefined || input.overrides === null) {
    return { sourceProjectId };
  }
  if (typeof input.overrides !== 'object' || Array.isArray(input.overrides)) return null;
  const raw = input.overrides as Record<string, unknown>;

  // Re-use the create-action validators so a clone override can never persist a value
  // the create path would reject (over-length / invalid date / negative number).
  const name = trimOptionalString(raw.name, 160);
  const type = trimOptionalString(raw.type, 120);
  const packFormat = trimOptionalString(raw.packFormat, 160);
  const salesChannel = trimOptionalString(raw.salesChannel, 80);
  const targetAudience = trimOptionalString(raw.targetAudience, 400);
  const marketingClaims = trimOptionalString(raw.marketingClaims, 600);
  const constraints = trimOptionalString(raw.constraints, 2000);
  const notes = trimOptionalString(raw.notes, 2000);
  const targetLaunch =
    raw.targetLaunch === undefined
      ? null
      : parseFutureTargetLaunch(raw.targetLaunch, todayIsoDateUtc());
  const targetRetailPriceEur = parseOptionalRetailPriceEur(raw.targetRetailPriceEur);
  const packWeightG =
    raw.packWeightG === undefined ? null : parseOptionalPackWeightG(raw.packWeightG);
  const packsPerCase =
    raw.packsPerCase === undefined ? null : parseOptionalPacksPerCase(raw.packsPerCase);
  const outputUnit = parseOptionalOutputUnit(raw.outputUnit);
  const weeklyVolumePacks =
    raw.weeklyVolumePacks === undefined
      ? null
      : parseRequiredWeeklyVolumePacks(raw.weeklyVolumePacks);
  const runsPerWeek =
    raw.runsPerWeek === undefined ? null : parseRequiredRunsPerWeek(raw.runsPerWeek);
  const prio = raw.prio === undefined || raw.prio === null ? null : parsePriority(raw.prio);

  if (
    name === undefined || type === undefined || packFormat === undefined ||
    salesChannel === undefined || targetAudience === undefined ||
    marketingClaims === undefined || constraints === undefined || notes === undefined ||
    targetLaunch === undefined ||
    (raw.targetRetailPriceEur !== undefined && targetRetailPriceEur === undefined) ||
    packWeightG === undefined ||
    packsPerCase === undefined || outputUnit === undefined || weeklyVolumePacks === undefined ||
    runsPerWeek === undefined ||
    prio === null
  ) {
    return null;
  }

  return {
    sourceProjectId,
    overrides: {
      name, type, prio, targetLaunch, packFormat, salesChannel,
      targetAudience, marketingClaims, constraints, notes, targetRetailPriceEur, packWeightG, packsPerCase,
      outputUnit, weeklyVolumePacks, runsPerWeek,
    },
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
