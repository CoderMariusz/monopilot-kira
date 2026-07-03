'use server';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createLogger } from '@monopilot/observability';

const logger = createLogger({ name: 'npd-formulation-lifecycle' });

type IngredientInput = {
  rmCode: string;
  /** Lane-B: optional FK to the real items master row (null for legacy free text). */
  itemId: string | null;
  /** W3-L10: optional reusable WIP definition reference for this recipe line. */
  wipDefinitionId: string | null;
  /** F6-D17: optional component-level substitute item. */
  substituteItemId: string | null;
  qtyKg: string | null;
  costPerKgEur: string | null;
  costCurrency: string | null;
  /**
   * F-A06 (W9-L4): still ACCEPTED for wire back-compat but IGNORED on persist.
   * `allergens_inherited` is a derived cache — the SSOT is
   * `public.item_allergen_profiles` and the full set is resolved server-side
   * from the line's item_id at save time. Client values never reach the DB.
   */
  allergensInherited: string[];
  sequence: number;
};

type VersionRow = {
  formulation_id: string;
  version_id: string;
  state: string;
};

export type SaveDraftResult =
  | { ok: true; data: { versionId: string; ingredientCount: number } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'VERSION_LOCKED'
        | 'VERSION_NOT_DRAFT'
        | 'SUBSTITUTE_ALLERGEN_MISMATCH'
        | 'persistence_failed';
      offendingAllergens?: string[];
    };

export async function saveDraft(input: {
  projectId?: unknown;
  versionId?: unknown;
  ingredients?: unknown;
  batchSizeKg?: unknown;
  targetYieldPct?: unknown;
  targetPriceEur?: unknown;
  processingOverheadPct?: unknown;
}): Promise<SaveDraftResult> {
  const projectId = parseUuid(input?.projectId);
  const versionId = parseUuid(input?.versionId);
  const ingredients = parseIngredients(input?.ingredients);
  const batchSizeKg = normalizePositiveNumeric(input?.batchSizeKg);
  const targetYieldPct = normalizeNumericPct(input?.targetYieldPct);
  const targetPriceEur = normalizeNumeric(input?.targetPriceEur);
  const processingOverheadPct = normalizeNumericPct(input?.processingOverheadPct);
  if (
    !projectId ||
    !versionId ||
    !ingredients ||
    batchSizeKg === undefined ||
    targetYieldPct === undefined ||
    targetPriceEur === undefined ||
    processingOverheadPct === undefined
  ) {
    return { ok: false, error: 'invalid_input' };
  }
  const hasBatchSizeKg = Object.prototype.hasOwnProperty.call(input, 'batchSizeKg');
  const shouldPersistVersionParams =
    hasBatchSizeKg ||
    Object.prototype.hasOwnProperty.call(input, 'targetYieldPct') ||
    Object.prototype.hasOwnProperty.call(input, 'targetPriceEur') ||
    Object.prototype.hasOwnProperty.call(input, 'processingOverheadPct');

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'npd.formulation.create_draft'))) return { ok: false, error: 'forbidden' };

      const loaded = await ctx.client.query<VersionRow>(
        `select f.id as formulation_id, fv.id as version_id, fv.state
           from public.formulations f
           join public.formulation_versions fv on fv.formulation_id = f.id
          where f.project_id = $1::uuid
            and f.org_id = app.current_org_id()
            and fv.id = $2::uuid
          for update of fv`,
        [projectId, versionId],
      );
      const row = loaded.rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      if (row.state === 'locked') return { ok: false, error: 'VERSION_LOCKED' };
      if (row.state !== 'draft') return { ok: false, error: 'VERSION_NOT_DRAFT' };

      // F-A06 carryover seam: legacy free-text lines (no item_id) have NO SSOT
      // source, so their previously PERSISTED allergens are carried over
      // server-side (keyed by rm_code) instead of trusting the wire. Read
      // BEFORE the delete-and-reinsert below.
      const priorAllergensByRmCode = new Map<string, string[]>(
        (
          await ctx.client.query<{ rm_code: string; allergens_inherited: string[] | null }>(
            `select rm_code, allergens_inherited
               from public.formulation_ingredients
              where version_id = $1::uuid`,
            [versionId],
          )
        ).rows.map((prior) => [prior.rm_code, prior.allergens_inherited ?? []]),
      );

      // F8 (W9 cross-review MEDIUM): the free-text carryover above can otherwise
      // perpetuate legacy junk codes forever. Carried codes are validated against
      // the CANONICAL allergen reference — Reference."Allergens".allergen_code
      // (org-scoped EU-14 + org-custom; the ADR-028 soft-reference target that
      // item_allergen_profiles.allergen_code itself points at). Unknown codes are
      // DROPPED on save. Degradation: when the reference table is not provisioned
      // (42P01) validation is impossible and the carryover is kept unchanged.
      const canonicalAllergenCodes = await loadCanonicalAllergenCodes(ctx.client);
      const sanitizeCarriedCodes = (codes: string[]): string[] =>
        canonicalAllergenCodes === null ? codes : codes.filter((code) => canonicalAllergenCodes.has(code));

      const requestedItemIds = [
        ...new Set(
          ingredients
            .flatMap((ingredient) => [ingredient.itemId, ingredient.substituteItemId])
            .filter(Boolean),
        ),
      ] as string[];
      const requestedWipDefinitionIds = [
        ...new Set(ingredients.map((ingredient) => ingredient.wipDefinitionId).filter(Boolean)),
      ] as string[];
      const wipDefinitionById =
        requestedWipDefinitionIds.length === 0
          ? new Map<string, { item_id: string }>()
          : new Map(
              (
                await ctx.client.query<{ id: string; item_id: string }>(
                  `select id::text, item_id::text
                     from public.wip_definitions
                    where org_id = app.current_org_id()
                      and id = any($1::uuid[])
                      and status = 'active'
                      and reusable is true`,
                  [requestedWipDefinitionIds],
                )
              ).rows.map((row) => [row.id, { item_id: row.item_id }]),
            );
      // F-B12: the effective-cost view is the cost source of record; the client
      // value is only a fallback for items with no resolved cost (or legacy
      // free-text lines).
      const resolvedItemRows =
        requestedItemIds.length === 0
          ? []
          : (
              await ctx.client.query<{ id: string; cost_per_kg: string | null; cost_currency: string | null }>(
                `select i.id, vec.amount::text as cost_per_kg, vec.currency as cost_currency
                   from public.items i
                   left join public.v_item_effective_cost vec on vec.item_id = i.id
                  where i.org_id = app.current_org_id()
                    and i.id = any($1::uuid[])
                    and i.item_type in ('rm', 'ingredient', 'intermediate', 'co_product')`,
                [requestedItemIds],
              )
            ).rows;
      const resolvedCostByItemId = new Map(resolvedItemRows.map((item) => [item.id, item.cost_per_kg]));
      const resolvedCurrencyByItemId = new Map(resolvedItemRows.map((item) => [item.id, item.cost_currency]));
      // F-A06 SSOT resolution: full allergen set per item from
      // public.item_allergen_profiles (org-scoped). ALL intensities (contains /
      // may_contain / trace) are included — a false "Absent" is the food-safety
      // failure mode; the cascade engine unions the same way.
      const resolvedIds = [...resolvedCostByItemId.keys()];
      const allergensByItemId =
        resolvedIds.length === 0
          ? new Map<string, string[]>()
          : new Map(
              (
                await ctx.client.query<{ item_id: string; codes: string[] }>(
                  `select item_id, array_agg(distinct allergen_code order by allergen_code) as codes
                     from public.item_allergen_profiles
                    where org_id = app.current_org_id()
                      and item_id = any($1::uuid[])
                    group by item_id`,
                  [resolvedIds],
                )
              ).rows.map((profile) => [profile.item_id, profile.codes]),
            );

      for (const ingredient of ingredients) {
        if (ingredient.wipDefinitionId) {
          const definition = wipDefinitionById.get(ingredient.wipDefinitionId);
          if (!definition) return { ok: false, error: 'invalid_input' };
          if (!ingredient.itemId || ingredient.itemId !== definition.item_id) {
            return { ok: false, error: 'invalid_input' };
          }
        }
        if (!ingredient.substituteItemId) continue;
        const primaryItemId = ingredient.itemId && resolvedCostByItemId.has(ingredient.itemId) ? ingredient.itemId : null;
        const substituteItemId = resolvedCostByItemId.has(ingredient.substituteItemId) ? ingredient.substituteItemId : null;
        if (!primaryItemId || !substituteItemId) return { ok: false, error: 'invalid_input' };
        const primaryAllergens = new Set(allergensByItemId.get(primaryItemId) ?? []);
        const offendingAllergens = (allergensByItemId.get(substituteItemId) ?? []).filter(
          (code) => !primaryAllergens.has(code),
        );
        if (offendingAllergens.length > 0) {
          return {
            ok: false,
            error: 'SUBSTITUTE_ALLERGEN_MISMATCH',
            offendingAllergens,
          };
        }
      }

      const ingredientRows = ingredients.map((ingredient) => {
        const itemId = ingredient.itemId && resolvedCostByItemId.has(ingredient.itemId) ? ingredient.itemId : null;
        const substituteItemId =
          ingredient.substituteItemId && resolvedCostByItemId.has(ingredient.substituteItemId)
            ? ingredient.substituteItemId
            : null;
        const masterCost = itemId ? (resolvedCostByItemId.get(itemId) ?? null) : null;
        const masterCurrency = itemId ? (resolvedCurrencyByItemId.get(itemId) ?? null) : null;
        return {
          rm_code: ingredient.rmCode,
          item_id: itemId,
          wip_definition_id: ingredient.wipDefinitionId,
          substitute_item_id: substituteItemId,
          qty_kg: ingredient.qtyKg,
          // F-B12: master cost wins; client value is the documented fallback.
          // WIP reference rows NEVER take a client cost — their real cost comes
          // from the definition via the cost engine; anything else is fabricated.
          cost_per_kg_eur: ingredient.wipDefinitionId ? masterCost : (masterCost ?? ingredient.costPerKgEur),
          cost_currency: masterCurrency ?? ingredient.costCurrency,
          // F-A06: client payload IGNORED. Item-linked line → profile-derived
          // full array (truly-empty profile → []); free-text line → server-side
          // carryover of what was already persisted (never the wire value).
          // F8: free-text carryover is sanitized against the canonical reference.
          allergens_inherited: itemId
            ? (allergensByItemId.get(itemId) ?? [])
            : sanitizeCarriedCodes(priorAllergensByRmCode.get(ingredient.rmCode) ?? []),
          sequence: ingredient.sequence,
        };
      });
      await ctx.client.query(`delete from public.formulation_ingredients where version_id = $1::uuid`, [versionId]);
      if (ingredientRows.length > 0) {
        await ctx.client.query(
          `insert into public.formulation_ingredients
             (version_id, rm_code, item_id, wip_definition_id, substitute_item_id, qty_kg, pct, cost_per_kg_eur, cost_currency, allergens_inherited, sequence)
           select
             $1::uuid,
             x.rm_code,
             x.item_id::uuid,
             x.wip_definition_id::uuid,
             x.substitute_item_id::uuid,
             x.qty_kg::numeric,
             case
               when x.qty_kg::numeric is null then null
               else round(x.qty_kg::numeric / nullif(sum(x.qty_kg::numeric) over (), 0) * 100, 3)
             end,
             x.cost_per_kg_eur::numeric,
             x.cost_currency,
             coalesce(
               (select array_agg(e.value order by e.ord)
                  from jsonb_array_elements_text(x.allergens_inherited) with ordinality as e(value, ord)),
               '{}'::text[]
             ),
             x.sequence
           from jsonb_to_recordset($2::jsonb) as x(
             rm_code text,
             item_id text,
             wip_definition_id text,
             substitute_item_id text,
             qty_kg text,
             cost_per_kg_eur text,
             cost_currency text,
             allergens_inherited jsonb,
             sequence integer
           )
           order by x.sequence asc`,
          [versionId, JSON.stringify(ingredientRows)],
        );
        // Ack-at-pick baseline: referencing a WIP definition records the version the
        // project adopted, so the stale-definition banner is a pure ack-vs-version
        // comparison. First reference only — accepts of later bumps go through
        // acceptWipDefinitionUpdate and are never overwritten here.
        if (ingredientRows.some((ingredientRow) => ingredientRow.wip_definition_id)) {
          await ctx.client.query(
            `insert into public.wip_definition_acks
               (org_id, wip_definition_id, npd_project_id, accepted_version, accepted_by)
             select distinct d.org_id, d.id, f.project_id, d.version, $2::uuid
               from public.formulation_ingredients fi
               join public.formulation_versions fv on fv.id = fi.version_id
               join public.formulations f on f.id = fv.formulation_id
               join public.wip_definitions d
                 on d.id = fi.wip_definition_id
                and d.org_id = app.current_org_id()
              where fi.version_id = $1::uuid
                and fi.wip_definition_id is not null
             on conflict (org_id, wip_definition_id, npd_project_id) do nothing`,
            [versionId, ctx.userId],
          );
        }
      }

      if (shouldPersistVersionParams) {
        await ctx.client.query(
          `UPDATE public.formulation_versions
              SET target_yield_pct = $2::numeric,
                  target_price_eur = $3::numeric,
                  processing_overhead_pct = $4::numeric,
                  batch_size_kg = case when $5::boolean then $6::numeric else batch_size_kg end
            WHERE id = $1::uuid
              AND state = 'draft'
              AND EXISTS (
                SELECT 1
                  FROM public.formulations f
                 WHERE f.id = formulation_id
                   AND f.org_id = app.current_org_id()
              )`,
          [versionId, targetYieldPct, targetPriceEur, processingOverheadPct, hasBatchSizeKg, batchSizeKg],
        );
      }

      await ctx.client.query(
        `insert into public.formulation_audit_log
           (org_id, formulation_id, version_id, event_type, event_payload, actor_user_id)
         values (app.current_org_id(), $1::uuid, $2::uuid, 'formulation.draft_saved', $3::jsonb, $4::uuid)`,
        [row.formulation_id, versionId, JSON.stringify({ ingredientCount: ingredients.length }), ctx.userId],
      );

      return { ok: true, data: { versionId, ingredientCount: ingredients.length } };
    });
  } catch (error) {
    logger.error(
      { err: error, projectId, versionId, action: 'saveDraft' },
      'formulation lifecycle action failed',
    );
    return { ok: false, error: 'persistence_failed' };
  }
}

/** Postgres SQLSTATE for "undefined_table" (relation does not exist). */
const PG_UNDEFINED_TABLE = '42P01';

/**
 * F8 — load the org's canonical allergen code list from Reference."Allergens"
 * (EU-14 seed + org-custom rows, mig 082). Returns null when the reference
 * table is not provisioned (42P01) — the caller then skips validation rather
 * than dropping every carried code blind.
 */
async function loadCanonicalAllergenCodes(client: {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
}): Promise<Set<string> | null> {
  try {
    const { rows } = await client.query<{ allergen_code: string }>(
      `select allergen_code
         from "Reference"."Allergens"
        where org_id = app.current_org_id()`,
    );
    return new Set(rows.map((row) => row.allergen_code));
  } catch (error) {
    if ((error as { code?: string })?.code === PG_UNDEFINED_TABLE) return null;
    throw error;
  }
}

function parseIngredients(value: unknown): IngredientInput[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<number>();
  const parsed = value.map(parseIngredient);
  if (parsed.some((item) => item === null)) return null;
  for (const item of parsed) {
    if (!item || seen.has(item.sequence)) return null;
    seen.add(item.sequence);
  }
  return parsed as IngredientInput[];
}

function parseIngredient(value: unknown): IngredientInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const rmCode = normalizeRmCode(candidate.rmCode);
  const itemId = normalizeUuidOrNull(candidate.itemId);
  const wipDefinitionId = normalizeUuidOrNull(candidate.wipDefinitionId);
  const substituteItemId = normalizeUuidOrNull(candidate.substituteItemId);
  const qtyKg = normalizeNumeric(candidate.qtyKg);
  const costPerKgEur = normalizeNumeric(candidate.costPerKgEur);
  const costCurrency = normalizeOptionalText(candidate.costCurrency);
  const sequence = candidate.sequence;
  const allergensInherited = parseTextArray(candidate.allergensInherited);
  if (!rmCode || itemId === undefined || wipDefinitionId === undefined || substituteItemId === undefined || qtyKg === undefined || costPerKgEur === undefined) {
    return null;
  }
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1) return null;
  if (!allergensInherited) return null;
  return { rmCode, itemId, wipDefinitionId, substituteItemId, qtyKg, costPerKgEur, costCurrency, sequence, allergensInherited };
}

function normalizeRmCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
}

/** Lane-B: optional uuid → string | null (valid/absent) or undefined (malformed → reject). */
function normalizeUuidOrNull(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  return parseUuid(value) ?? undefined;
}

function normalizeNumeric(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return undefined;
  return text;
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 32 ? trimmed : null;
}

function normalizeNumericPct(value: unknown): string | null | undefined {
  const normalized = normalizeNumeric(value);
  if (normalized === null || normalized === undefined) return normalized;
  const asNumber = Number(normalized);
  if (!Number.isFinite(asNumber) || asNumber < 0 || asNumber > 100) return undefined;
  return normalized;
}

function normalizePositiveNumeric(value: unknown): string | null | undefined {
  const normalized = normalizeNumeric(value);
  if (normalized === null || normalized === undefined) return normalized;
  const asNumber = Number(normalized);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return undefined;
  return normalized;
}

function parseTextArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === 'string' && item.trim().length <= 80)
    ? value.map((item) => item.trim()).filter(Boolean)
    : null;
}

function parseUuid(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
