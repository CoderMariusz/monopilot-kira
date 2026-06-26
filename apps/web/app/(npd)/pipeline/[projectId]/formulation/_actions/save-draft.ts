'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createLogger } from '@monopilot/observability';

const logger = createLogger({ name: 'npd-formulation-lifecycle' });

type IngredientInput = {
  rmCode: string;
  /** Lane-B: optional FK to the real items master row (null for legacy free text). */
  itemId: string | null;
  qtyKg: string | null;
  costPerKgEur: string | null;
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
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'VERSION_LOCKED' | 'VERSION_NOT_DRAFT' | 'persistence_failed';
    };

export async function saveDraft(input: {
  projectId?: unknown;
  versionId?: unknown;
  ingredients?: unknown;
}): Promise<SaveDraftResult> {
  const projectId = parseUuid(input?.projectId);
  const versionId = parseUuid(input?.versionId);
  const ingredients = parseIngredients(input?.ingredients);
  if (!projectId || !versionId || !ingredients) return { ok: false, error: 'invalid_input' };

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

      await ctx.client.query(`delete from public.formulation_ingredients where version_id = $1::uuid`, [versionId]);
      const requestedItemIds = [...new Set(ingredients.map((ingredient) => ingredient.itemId).filter(Boolean))] as string[];
      // F-B12: items.cost_per_kg is read alongside the id validation — the item
      // master is the cost source of record; the client value is only a fallback
      // for items with no master cost (or legacy free-text lines).
      const resolvedItems =
        requestedItemIds.length === 0
          ? new Map<string, { costPerKg: string | null }>()
          : new Map(
              (
                await ctx.client.query<{ id: string; cost_per_kg: string | null }>(
                  `select id, cost_per_kg::text as cost_per_kg from public.items
                    where org_id = app.current_org_id()
                      and id = any($1::uuid[])
                      and item_type in ('rm', 'ingredient', 'intermediate', 'co_product')`,
                  [requestedItemIds],
                )
              ).rows.map((item) => [item.id, { costPerKg: item.cost_per_kg }]),
            );
      // F-A06 SSOT resolution: full allergen set per item from
      // public.item_allergen_profiles (org-scoped). ALL intensities (contains /
      // may_contain / trace) are included — a false "Absent" is the food-safety
      // failure mode; the cascade engine unions the same way.
      const resolvedIds = [...resolvedItems.keys()];
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
      const ingredientRows = ingredients.map((ingredient) => {
        const itemId = ingredient.itemId && resolvedItems.has(ingredient.itemId) ? ingredient.itemId : null;
        const masterCost = itemId ? (resolvedItems.get(itemId)?.costPerKg ?? null) : null;
        return {
          rm_code: ingredient.rmCode,
          item_id: itemId,
          qty_kg: ingredient.qtyKg,
          // F-B12: master cost wins; client value is the documented fallback.
          cost_per_kg_eur: masterCost ?? ingredient.costPerKgEur,
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
      if (ingredientRows.length > 0) {
        await ctx.client.query(
          `insert into public.formulation_ingredients
             (version_id, rm_code, item_id, qty_kg, pct, cost_per_kg_eur, allergens_inherited, sequence)
           select
             $1::uuid,
             x.rm_code,
             x.item_id::uuid,
             x.qty_kg::numeric,
             case
               when x.qty_kg::numeric is null then null
               else round(x.qty_kg::numeric / nullif(sum(x.qty_kg::numeric) over (), 0) * 100, 3)
             end,
             x.cost_per_kg_eur::numeric,
             coalesce(
               (select array_agg(e.value order by e.ord)
                  from jsonb_array_elements_text(x.allergens_inherited) with ordinality as e(value, ord)),
               '{}'::text[]
             ),
             x.sequence
           from jsonb_to_recordset($2::jsonb) as x(
             rm_code text,
             item_id text,
             qty_kg text,
             cost_per_kg_eur text,
             allergens_inherited jsonb,
             sequence integer
           )
           order by x.sequence asc`,
          [versionId, JSON.stringify(ingredientRows)],
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

async function hasPermission(
  ctx: { userId: string; orgId: string; client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> } },
  permission: string,
): Promise<boolean> {
  const result = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return result.rows.length > 0;
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
  const qtyKg = normalizeNumeric(candidate.qtyKg);
  const costPerKgEur = normalizeNumeric(candidate.costPerKgEur);
  const sequence = candidate.sequence;
  const allergensInherited = parseTextArray(candidate.allergensInherited);
  if (!rmCode || itemId === undefined || qtyKg === undefined || costPerKgEur === undefined) {
    return null;
  }
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1) return null;
  if (!allergensInherited) return null;
  return { rmCode, itemId, qtyKg, costPerKgEur, sequence, allergensInherited };
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
