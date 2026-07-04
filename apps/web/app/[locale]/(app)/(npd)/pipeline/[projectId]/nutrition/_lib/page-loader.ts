/**
 * Nutrition stage page loader + Server Action adapter (shared by costing-nutrition merge).
 */

import { getTranslations } from 'next-intl/server';

import {
  type AllergenPresence,
  type AllergenRow,
  type NutriGrade,
  type NutritionLabels,
  type NutritionRow,
  type NutritionScreenData,
  type PageState,
} from '../_components/nutrition-screen';
import { hasPermission } from '../../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { computeNutrition } from '../../../../../../../(npd)/pipeline/[projectId]/nutrition/_actions/compute';

export type NutritionLoaderResult = {
  state: PageState;
  data: NutritionScreenData | null;
  canCompute: boolean;
  formulationVersionId: string | null;
  portionGrams: string | null;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const READ_PERMISSION = 'npd.fa.read';
const WRITE_PERMISSION = 'npd.formulation.create_draft';

const VALID_PRESENCE: AllergenPresence[] = ['contains', 'may_contain', 'free_from', 'unknown'];

export const DEFAULT_NUTRITION_LABELS: NutritionLabels = {
  title: 'Nutrition declaration (per 100g)',
  subtitle: 'Computed per-100g + per-portion values',
  exportCsv: 'Export CSV',
  generateLabel: 'Generate label PDF',
  generateLabelDisabledHint: 'Label PDF export is not yet available (deferred)',
  colNutrient: 'Nutrient',
  colPer100g: 'Per 100g',
  colPerPortion: 'Per portion',
  colStatus: 'Status',
  statusOk: 'OK',
  statusWarn: 'At limit',
  allergenTitle: 'Allergen declaration',
  allergenColAllergen: 'Allergen',
  allergenColSource: 'Source ingredient',
  allergenColPresence: 'Presence',
  presenceContains: 'Contains',
  presenceMayContain: 'May contain',
  presenceFreeFrom: 'Free from',
  presenceUnknown: 'Unknown',
  allergenEmpty: 'No allergens declared',
  nutriScoreTitle: 'Nutri-Score',
  nutriScoreGradeLabel: 'Nutri-Score grade {grade}',
  loading: 'Loading nutrition data…',
  empty: 'No nutrition data yet',
  emptyBody: 'Nutrition values are computed once the formulation is complete.',
  error: 'Unable to load nutrition data.',
  forbidden: 'You do not have permission to view nutrition data.',
  computeNutriScore: 'Compute NutriScore',
  recomputeNutriScore: 'Recompute NutriScore',
  computing: 'Computing…',
  computeError: 'Could not compute the NutriScore. Try again.',
  computeErrorNotFound: 'No formulation is available to compute from yet.',
};

const LABEL_KEYS = Object.keys(DEFAULT_NUTRITION_LABELS) as Array<keyof NutritionLabels>;

function translateLabel(t: (key: string) => string, key: keyof NutritionLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_NUTRITION_LABELS[key] : value;
  } catch {
    return DEFAULT_NUTRITION_LABELS[key];
  }
}

export async function buildNutritionLabels(locale: string): Promise<NutritionLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.nutrition' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as NutritionLabels);
  } catch {
    return { ...DEFAULT_NUTRITION_LABELS };
  }
}

type ProfileLoaderRow = {
  nutrient_code: string;
  display_name: string;
  unit: string;
  per_100g_value: string;
  per_portion_value: string;
};

type AllergenLoaderRow = {
  allergen_code: string;
  source_ingredient: string | null;
  presence: string;
};

function toAllergenPresence(value: string): AllergenPresence {
  return (VALID_PRESENCE as string[]).includes(value) ? (value as AllergenPresence) : 'unknown';
}

function toGrade(value: string | null | undefined): NutriGrade | null {
  if (value && ['A', 'B', 'C', 'D', 'E'].includes(value)) return value as NutriGrade;
  return null;
}

export async function readNutritionPageData(projectId: string): Promise<NutritionLoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<NutritionLoaderResult> => {
      const ctx = rawCtx as OrgContextLike;

      const canRead = await hasPermission(ctx, READ_PERMISSION);
      if (!canRead) {
        return { state: 'permission_denied', data: null, canCompute: false, formulationVersionId: null, portionGrams: null };
      }

      const [canWrite, versionRow] = await Promise.all([
        hasPermission(ctx, WRITE_PERMISSION),
        ctx.client.query<{ current_version_id: string | null }>(
          `select f.current_version_id::text as current_version_id
             from public.formulations f
            where f.project_id = $1::uuid
              and f.org_id = app.current_org_id()
            limit 1`,
          [projectId],
        ),
      ]);
      const formulationVersionId = versionRow.rows[0]?.current_version_id ?? null;
      const canCompute = canWrite && !!formulationVersionId;

      const project = await ctx.client.query<{ product_code: string | null; pack_weight_g: string | null }>(
        `select product_code,
                pack_weight_g::text as pack_weight_g
           from public.npd_projects
          where id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const productCode = project.rows[0]?.product_code;
      const portionGrams = project.rows[0]?.pack_weight_g ?? null;
      if (!productCode) {
        return { state: 'empty', data: null, canCompute, formulationVersionId, portionGrams };
      }

      const profiles = await ctx.client.query<ProfileLoaderRow>(
        `select np.nutrient_code,
                n.display_name,
                n.unit,
                np.per_100g_value::text   as per_100g_value,
                np.per_portion_value::text as per_portion_value
           from public.nutrition_profiles np
           join "Reference"."Nutrients" n on n.nutrient_code = np.nutrient_code
          where np.org_id = app.current_org_id()
            and np.product_code = $1
          order by n.display_order asc`,
        [productCode],
      );

      if (profiles.rows.length === 0) {
        return { state: 'empty', data: null, canCompute, formulationVersionId, portionGrams };
      }

      const score = await ctx.client.query<{ grade: string }>(
        `select grade
           from public.nutri_score_results
          where org_id = app.current_org_id()
            and product_code = $1
          order by computed_at desc
          limit 1`,
        [productCode],
      );

      const allergens = await ctx.client.query<AllergenLoaderRow>(
        `with cascade as (
           select coalesce(fac.published_allergens, '{}'::text[]) as published_allergens,
                  coalesce(fac.may_contain_allergens, '{}'::text[]) as may_contain_allergens
             from public.fa_allergen_cascade fac
            where fac.org_id = app.current_org_id()
              and fac.product_code = $1
            limit 1
         ), declared as (
           select btrim(a.allergen_code) as allergen_code,
                  'contains'::text as presence
             from cascade
             cross join lateral unnest(cascade.published_allergens) as a(allergen_code)
            where btrim(coalesce(a.allergen_code, '')) <> ''
           union
           select btrim(a.allergen_code) as allergen_code,
                  'may_contain'::text as presence
             from cascade
             cross join lateral unnest(cascade.may_contain_allergens) as a(allergen_code)
            where btrim(coalesce(a.allergen_code, '')) <> ''
         )
         select d.allergen_code,
                d.presence,
                null::text as source_ingredient
           from declared d
           join "Reference"."Allergens" ra
             on ra.org_id = app.current_org_id()
            and ra.allergen_code = d.allergen_code
          order by d.presence asc, d.allergen_code asc`,
        [productCode],
      );

      const rows: NutritionRow[] = profiles.rows.map((r) => ({
        nutrientCode: r.nutrient_code,
        label: r.display_name,
        unit: r.unit,
        per100g: r.per_100g_value,
        perPortion: r.per_portion_value,
        status: 'ok',
      }));

      const allergenRows: AllergenRow[] = allergens.rows.map((a) => ({
        allergenCode: a.allergen_code,
        sourceIngredient: a.source_ingredient,
        presence: toAllergenPresence(a.presence),
      }));

      return {
        state: 'ready',
        data: {
          productCode,
          rows,
          grade: toGrade(score.rows[0]?.grade),
          allergens: allergenRows,
        },
        canCompute,
        formulationVersionId,
        portionGrams,
      };
    });
  } catch (error) {
    console.error('[nutrition] org-scoped read failed:', error);
    return { state: 'error', data: null, canCompute: false, formulationVersionId: null, portionGrams: null };
  }
}

export async function computeNutriScoreAction(input: {
  projectId: string;
  formulationVersionId: string;
  portionGrams?: string;
}): Promise<{ ok: true } | { ok: false; error: string; message?: string }> {
  'use server';
  const result = await computeNutrition(input);
  if (result.ok) return { ok: true };
  return { ok: false, error: result.error, message: result.message };
}
