'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createLogger } from '@monopilot/observability';

const logger = createLogger({ name: 'npd-formulation-lifecycle' });

type IngredientInput = {
  rmCode: string;
  qtyKg: string | null;
  pct: string | null;
  costPerKgEur: string | null;
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

      await ctx.client.query(`delete from public.formulation_ingredients where version_id = $1::uuid`, [versionId]);
      for (const ingredient of ingredients) {
        await ctx.client.query(
          `insert into public.formulation_ingredients
             (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, allergens_inherited, sequence)
           values ($1::uuid, $2, $3::numeric, $4::numeric, $5::numeric, $6::text[], $7::integer)`,
          [
            versionId,
            ingredient.rmCode,
            ingredient.qtyKg,
            ingredient.pct,
            ingredient.costPerKgEur,
            ingredient.allergensInherited,
            ingredient.sequence,
          ],
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

async function hasPermission(
  ctx: { userId: string; orgId: string; client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> } },
  permission: string,
): Promise<boolean> {
  const result = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
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
  const qtyKg = normalizeNumeric(candidate.qtyKg);
  const pct = normalizeNumeric(candidate.pct);
  const costPerKgEur = normalizeNumeric(candidate.costPerKgEur);
  const sequence = candidate.sequence;
  const allergensInherited = parseTextArray(candidate.allergensInherited);
  if (!rmCode || qtyKg === undefined || pct === undefined || costPerKgEur === undefined) return null;
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1) return null;
  if (!allergensInherited) return null;
  return { rmCode, qtyKg, pct, costPerKgEur, sequence, allergensInherited };
}

function normalizeRmCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
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
