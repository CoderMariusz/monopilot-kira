/**
 * T-066 — Formulation editor page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/formulation
 *
 * Server Component. Reads REAL, org-scoped data via the merged T-063 read action
 * `getFormulation` (which itself runs under `withOrgContext` / RLS as app_user
 * with app.current_org_id()). No mocks, no hard-coded rows.
 *
 *   - public.formulations               → formulation header (locked state)
 *   - public.formulation_versions       → current version + batch / yield / price
 *   - public.formulation_ingredients    → editable ingredient rows
 *   - public.formulation_calc_cache     → last computed cost/nutrition/allergen (panel slots)
 *
 * The write path (saveDraft, T-064) and the recompute path (recomputeAndCache,
 * T-065) are imported here and threaded into the client editor as Server Action
 * props — the client never authors or re-grants permission; RBAC is resolved
 * server-side (`canEdit`) and only mirrored as a read-only flag.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:124-264 (IngredientRow + RecipeScreen)
 *   prototypes/design/Monopilot Design System/npd/formulation-screens.jsx:79-153 (FormulationEditor)
 */

import { getTranslations } from 'next-intl/server';

import {
  FormulationEditor,
  type FormulationEditorData,
  type FormulationLabels,
  type FormulationPanelLabels,
  type PageState,
} from './_components/formulation-editor';
import type { CostPanelLabels } from './_components/cost-panel';
import type { NutritionPanelLabels, NutritionTargets } from './_components/nutrition-panel';
import type { AllergenPanelLabels } from './_components/allergen-panel';
import type { CompositionBarLabels } from './_components/composition-bar';
// Import from the PLAIN module (NOT allergen-panel, which is 'use client' — importing
// a const array from a client module into this RSC makes it a client-reference proxy in
// the production bundle, so iterating it threw and crashed the page render).
import { EU14_ALLERGEN_CODES } from './_components/eu14-allergen-codes';
import { getFormulation } from '../../../../../../(npd)/pipeline/[projectId]/formulation/_actions/get-formulation';
import { saveDraft } from '../../../../../../(npd)/pipeline/[projectId]/formulation/_actions/save-draft';
import { recomputeAndCache } from '../../../../../../(npd)/pipeline/[projectId]/formulation/_actions/recompute';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type FormulationPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors nutrition/page.tsx convention).
  data?: FormulationEditorData | null;
  state?: PageState;
  canEdit?: boolean;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const EDIT_PERMISSION = 'npd.formulation.create_draft';

const DEFAULT_LABELS: FormulationLabels = {
  title: 'Recipe',
  subtitle: 'Edit any % or cost — nutrition, allergens, and margin recalculate live.',
  batchSize: 'Batch size',
  version: 'Version',
  targetPrice: 'Target price',
  saveDraft: 'Save draft',
  saving: 'Saving…',
  saved: 'Saved',
  saveError: 'Could not save the draft. Try again.',
  submitForTrial: 'Submit for trial',
  compareVersions: 'Compare versions',
  ingredients: 'Ingredients',
  addIngredient: 'Add ingredient',
  colIngredient: 'Ingredient',
  colPct: '% w/w',
  colCostPerKg: '€ / kg',
  colContribution: 'Contrib.',
  colAllergen: 'Allergen',
  deleteRow: 'Delete ingredient',
  total: 'Total',
  totalPctWarning: 'Ingredient total is {pct}%. Adjust to exactly 100% before submitting for trial.',
  composition: 'Composition',
  pctRangeError: 'Percentage must be between 0 and 100.',
  rmCodeRequired: 'Ingredient code is required.',
  livePanels: 'Live calculations',
  livePanelsHint: 'Cost, nutrition and allergen panels appear here.',
  costPanelTitle: 'Cost',
  nutritionPanelTitle: 'Nutrition',
  allergenPanelTitle: 'Allergens',
  panelPlaceholder: 'Computed on save.',
  loading: 'Loading formulation…',
  empty: 'No formulation draft yet',
  emptyBody: 'Create a draft version to start formulating.',
  error: 'Unable to load the formulation.',
  forbidden: 'You do not have permission to edit this formulation.',
  locked: 'This version is locked and cannot be edited.',
  noAllergen: '—',
  chooseItem: 'Choose item',
  picker: {
    trigger: 'Pick item',
    searchLabel: 'Search items',
    searchPlaceholder: 'Search by code or name…',
    loading: 'Searching…',
    empty: 'No matching items',
    cancel: 'Cancel',
    error: 'Item search failed',
  },
};

// Scalar (string) label keys only — the nested `picker` object is assigned
// separately because the per-key translate pass is string-valued.
type ScalarLabelKey = Exclude<keyof FormulationLabels, 'picker'>;

const LABEL_KEYS = (Object.keys(DEFAULT_LABELS) as Array<keyof FormulationLabels>).filter(
  (k): k is ScalarLabelKey => k !== 'picker',
);

function translateLabel(t: (key: string) => string, key: ScalarLabelKey): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<FormulationLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.formulationEditor' });
    const scalar = LABEL_KEYS.reduce(
      (labels, key) => {
        labels[key] = translateLabel(t, key);
        return labels;
      },
      {} as Record<ScalarLabelKey, string>,
    );
    return { ...(scalar as Omit<FormulationLabels, 'picker'>), picker: { ...DEFAULT_LABELS.picker } };
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

// ── Live-panel i18n bundles (T-113-116) ──────────────────────────────────────
// Each panel is a pure Client island; its visible strings are resolved here
// (RSC) on the panel's own namespace and threaded down via panelLabels. Defaults
// mirror the message-file values so a missing key never leaks the raw key.

const DEFAULT_COST_LABELS: CostPanelLabels = {
  title: 'Cost & margin',
  live: 'live',
  rawMaterial: 'Raw material',
  afterYield: 'After yield ({yieldPct}%)',
  processing: 'Processing ({overheadPct}%)',
  packaging: 'Packaging',
  totalCost: 'Total cost / kg',
  perKgSuffix: '/kg',
  targetPrice: 'Target price',
  expectedYield: 'Expected yield %',
  revenuePerKg: 'Revenue / kg',
  marginPerKg: 'Margin / kg',
  marginPct: 'Margin %',
  loading: 'Computing cost…',
  empty: 'No cost yet',
  emptyBody: 'Add ingredient costs to see the margin.',
  error: 'Unable to compute the cost.',
  forbidden: 'You do not have permission to view costs.',
};

const DEFAULT_NUTRITION_LABELS: NutritionPanelLabels = {
  title: 'Nutrition per 100g',
  liveNote: '· live',
  exportLabel: 'Export label',
  targetsNote: 'Targets: Protein ≥ {protein} · Salt ≤ {salt} · Fat ≤ {fat} per 100g',
  withinTarget: 'Within target',
  overTarget: 'Over target',
  overMax: 'Over max',
  energyLabel: 'Energy',
  fatLabel: 'Fat',
  saturatesLabel: 'Saturates',
  carbsLabel: 'Carbohydrate',
  sugarsLabel: 'Sugars',
  proteinLabel: 'Protein',
  saltLabel: 'Salt',
  loading: 'Computing nutrition…',
  empty: 'No nutrition yet',
  emptyBody: 'Add raw materials with nutrition data to see per-100g values.',
  error: 'Unable to compute nutrition.',
  forbidden: 'You do not have permission to view nutrition.',
};

const DEFAULT_ALLERGEN_LABELS: AllergenPanelLabels = {
  title: 'Allergens',
  subtitle: 'EU 14 mandatory allergens · presence from formulation',
  present: 'Present',
  trace: 'Trace',
  absent: 'Absent',
  detectedHeading: '{count} allergen(s) detected:',
  mustDeclare: 'Must be declared on label.',
  noneDetected: 'No allergens detected from the current ingredients.',
  statusLabel: '{name} — {status}',
};

const DEFAULT_COMPOSITION_LABELS: CompositionBarLabels = {
  title: 'Composition',
  ariaLabel: 'Ingredient composition',
  empty: 'No ingredients to display.',
  segmentLabel: '{name}: {pct}%',
};

function buildPanelBundle<T extends Record<string, string>>(
  t: (key: string) => string,
  defaults: T,
): T {
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    try {
      const value = t(key as string);
      out[key] = (value === (key as string) ? defaults[key] : value) as T[keyof T];
    } catch {
      out[key] = defaults[key];
    }
  }
  return out;
}

// Panel label interfaces are all-string records; cast through these aliases so the
// shared buildPanelBundle helper accepts them without an index-signature widening.
type StringBundle = Record<string, string>;

async function buildPanelLabels(locale: string): Promise<FormulationPanelLabels> {
  try {
    const [tCost, tNutrition, tAllergen, tComposition] = await Promise.all([
      getTranslations({ locale, namespace: 'npd.costPanel' }),
      getTranslations({ locale, namespace: 'npd.nutritionPanel' }),
      getTranslations({ locale, namespace: 'npd.allergenPanel' }),
      getTranslations({ locale, namespace: 'npd.compositionBar' }),
    ]);
    return {
      cost: buildPanelBundle(tCost, DEFAULT_COST_LABELS as unknown as StringBundle) as unknown as CostPanelLabels,
      nutrition: buildPanelBundle(
        tNutrition,
        DEFAULT_NUTRITION_LABELS as unknown as StringBundle,
      ) as unknown as NutritionPanelLabels,
      allergen: buildPanelBundle(
        tAllergen,
        DEFAULT_ALLERGEN_LABELS as unknown as StringBundle,
      ) as unknown as AllergenPanelLabels,
      composition: buildPanelBundle(
        tComposition,
        DEFAULT_COMPOSITION_LABELS as unknown as StringBundle,
      ) as unknown as CompositionBarLabels,
    };
  } catch {
    return {
      cost: { ...DEFAULT_COST_LABELS },
      nutrition: { ...DEFAULT_NUTRITION_LABELS },
      allergen: { ...DEFAULT_ALLERGEN_LABELS },
      composition: { ...DEFAULT_COMPOSITION_LABELS },
    };
  }
}

/** EU14 allergen display names (npd.allergenNames), keyed by code. */
async function buildAllergenNames(locale: string): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  try {
    const t = await getTranslations({ locale, namespace: 'npd.allergenNames' });
    for (const code of EU14_ALLERGEN_CODES) {
      try {
        const value = t(code);
        names[code] = value === code ? code : value;
      } catch {
        names[code] = code;
      }
    }
  } catch {
    for (const code of EU14_ALLERGEN_CODES) names[code] = code;
  }
  return names;
}

/**
 * Per-100g traffic-light thresholds (reference data). No nutrition-targets table
 * is provisioned yet (PRD §17.11.1 lists it as a later slice), so these EU
 * per-100g guideline defaults stand in. They are CONFIG, not data — the actual
 * nutrient VALUES come from Supabase (Reference.RawMaterials, weighted by pct).
 */
const NUTRITION_TARGETS: NutritionTargets = {
  energy_kj: { target: '1500', max: '3000' },
  fat_g: { target: '17.5', max: '21' },
  saturates_g: { target: '5', max: '6' },
  carbs_g: { target: '50', max: '80' },
  sugars_g: { target: '22.5', max: '27' },
  protein_g: { target: '10', max: '100' },
  salt_g: { target: '1.5', max: '1.8' },
};

interface RmNutritionRow {
  rm_code: string;
  nutrition_per_100g: Record<string, unknown> | null;
}

/** Postgres SQLSTATE for "undefined_table" (relation does not exist). */
const PG_UNDEFINED_TABLE = '42P01';

/**
 * Load per-100g nutrition for the given rm_codes from the canonical
 * Reference.RawMaterials master (the same source the T-065 recompute action
 * uses), so the live NutritionPanel can recompute on pct edits client-side.
 * Degrades gracefully to an empty map when the table is not yet provisioned.
 */
async function loadRmNutrition(
  ctx: OrgContextLike,
  rmCodes: string[],
): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  const unique = [...new Set(rmCodes)].filter(Boolean);
  if (unique.length === 0) return out;
  let rows: RmNutritionRow[];
  try {
    const res = await ctx.client.query<RmNutritionRow>(
      `select rm_code, nutrition_per_100g
         from "Reference"."RawMaterials"
        where rm_code = any($1::text[])`,
      [unique],
    );
    rows = res.rows;
  } catch (err) {
    if ((err as { code?: string })?.code === PG_UNDEFINED_TABLE) return out;
    throw err;
  }
  for (const row of rows) {
    const src = row.nutrition_per_100g;
    if (!src || typeof src !== 'object') continue;
    const per: Record<string, string> = {};
    for (const [k, v] of Object.entries(src)) {
      if (v === null || v === undefined) continue;
      per[k] = String(v);
    }
    out.set(row.rm_code, per);
  }
  return out;
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

type LoaderResult = { state: PageState; data: FormulationEditorData | null; canEdit: boolean };

async function readPageData(projectId: string): Promise<LoaderResult> {
  const result = await getFormulation({ projectId });

  // RM codes needed for the per-100g nutrition load (only when we have rows).
  const rmCodes =
    result.ok && result.data.ingredients ? result.data.ingredients.map((i) => i.rm_code) : [];

  // One org-context round-trip: editability (RBAC, server-side) + per-RM
  // nutrition (Reference.RawMaterials, the same source the recompute uses).
  let canEdit = false;
  let nutritionByRm = new Map<string, Record<string, string>>();
  try {
    ({ canEdit, nutritionByRm } = await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      return {
        canEdit: await hasPermission(ctx, EDIT_PERMISSION),
        nutritionByRm: await loadRmNutrition(ctx, rmCodes),
      };
    }));
  } catch {
    canEdit = false;
    nutritionByRm = new Map();
  }

  if (!result.ok) {
    if (result.error === 'not_found') return { state: 'empty', data: null, canEdit };
    if (result.error === 'invalid_input') return { state: 'empty', data: null, canEdit };
    return { state: 'error', data: null, canEdit };
  }

  const { formulation, currentVersion, ingredients } = result.data;
  if (!currentVersion) {
    return { state: 'empty', data: null, canEdit };
  }

  const data: FormulationEditorData = {
    projectId: formulation.projectId,
    versionId: currentVersion.id,
    versionNumber: currentVersion.versionNumber,
    state: formulation.lockedAt ? 'locked' : currentVersion.state,
    productCode: formulation.productCode,
    batchSizeKg: currentVersion.batchSizeKg,
    targetPriceEur: currentVersion.targetPriceEur,
    targetYieldPct: currentVersion.targetYieldPct,
    versions: [{ id: currentVersion.id, versionNumber: currentVersion.versionNumber }],
    ingredients: ingredients.map((ing) => {
      const nutrition = nutritionByRm.get(ing.rm_code);
      return {
        id: ing.id,
        rmCode: ing.rm_code,
        // Lane-B: item_id wires the real items-master row; name comes from the join.
        itemId: ing.item_id,
        name: ing.item_name ?? '',
        pct: ing.pct,
        costPerKgEur: ing.cost_per_kg_eur,
        allergen: ing.allergens_inherited?.[0] ?? null,
        sequence: ing.sequence,
        ...(nutrition ? { nutritionPer100g: nutrition } : {}),
      };
    }),
  };

  return { state: 'ready', data, canEdit };
}

export default async function FormulationPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FormulationPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const [labels, panelLabels, allergenNames] = await Promise.all([
    buildLabels(locale),
    buildPanelLabels(locale),
    buildAllergenNames(locale),
  ]);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? (props.data ? 'ready' : 'empty'),
        data: props.data ?? null,
        canEdit: props.canEdit ?? false,
      }
    : await readPageData(projectId);

  return (
    <FormulationEditor
      state={loaded.state}
      data={loaded.data}
      labels={labels}
      panelLabels={panelLabels}
      nutritionTargets={NUTRITION_TARGETS}
      allergenNames={allergenNames}
      currency="EUR"
      canEdit={loaded.canEdit}
      saveDraftAction={saveDraft}
      recomputeAction={recomputeAndCache}
    />
  );
}
