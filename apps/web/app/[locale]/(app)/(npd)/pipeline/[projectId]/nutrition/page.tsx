/**
 * T-074 — Nutrition stage page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/nutrition
 *
 * Server Component. Reads REAL, org-scoped data via `withOrgContext` (RLS as
 * app_user with app.current_org_id()). No mocks, no hard-coded rows.
 *
 *   - npd_projects.product_code      → resolve the FA candidate for [projectId]
 *   - public.nutrition_profiles      → 7-row per-100g + per-portion table (T-072 compute output)
 *   - "Reference"."Nutrients"        → display_name / unit / canonical display_order
 *   - public.nutri_score_results     → latest Nutri-Score grade (A-E)
 *   - public.nutrition_allergens     → allergen declaration (presence enum)
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:4-80 (NutritionScreen)
 *
 * Read-only screen — no Server Action writes from here (compute is owned by T-072).
 */

import { getTranslations } from 'next-intl/server';

import {
  NutritionScreen,
  type AllergenPresence,
  type AllergenRow,
  type NutriGrade,
  type NutritionLabels,
  type NutritionRow,
  type NutritionScreenData,
  type PageState,
} from './_components/nutrition-screen';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type NutritionPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors fa/page.tsx convention).
  data?: NutritionScreenData | null;
  state?: PageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type LoaderResult = { state: PageState; data: NutritionScreenData | null };

const READ_PERMISSION = 'npd.fa.read';

const VALID_PRESENCE: AllergenPresence[] = ['contains', 'may_contain', 'free_from', 'unknown'];

const DEFAULT_LABELS: NutritionLabels = {
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
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof NutritionLabels>;

function translateLabel(t: (key: string) => string, key: keyof NutritionLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<NutritionLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.nutrition' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as NutritionLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
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
  return rows.length > 0;
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

async function readPageData(projectId: string): Promise<LoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LoaderResult> => {
      const ctx = rawCtx as OrgContextLike;

      const canRead = await hasPermission(ctx, READ_PERMISSION);
      if (!canRead) {
        return { state: 'permission_denied', data: null };
      }

      // Resolve the FA candidate for this project. RLS scopes to the org.
      const project = await ctx.client.query<{ product_code: string | null }>(
        `select product_code
           from public.npd_projects
          where id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const productCode = project.rows[0]?.product_code;
      if (!productCode) {
        // Project not found in this org, or no FG candidate mapped yet (pre-G3).
        return { state: 'empty', data: null };
      }

      // 7-row nutrient table, joined to Reference.Nutrients for label/unit and
      // canonical display_order. Money/values stay decimal strings (no float).
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
        return { state: 'empty', data: null };
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
        `select na.allergen_code,
                na.presence,
                null::text as source_ingredient
           from public.nutrition_allergens na
          where na.org_id = app.current_org_id()
            and na.product_code = $1
            and na.presence <> 'free_from'
          order by na.allergen_code asc`,
        [productCode],
      );

      const rows: NutritionRow[] = profiles.rows.map((r) => ({
        nutrientCode: r.nutrient_code,
        label: r.display_name,
        unit: r.unit,
        per100g: r.per_100g_value,
        perPortion: r.per_portion_value,
        // No per-nutrient target column exists in the schema (T-069); status is
        // not fabricated. All computed rows render 'ok'. See deviation log.
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
      };
    });
  } catch (error) {
    console.error('[nutrition] org-scoped read failed:', error);
    return { state: 'error', data: null };
  }
}

export default async function NutritionPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as NutritionPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? { state: props.state ?? (props.data ? 'ready' : 'empty'), data: props.data ?? null }
    : await readPageData(projectId);

  return <NutritionScreen state={loaded.state} data={loaded.data} labels={labels} />;
}
