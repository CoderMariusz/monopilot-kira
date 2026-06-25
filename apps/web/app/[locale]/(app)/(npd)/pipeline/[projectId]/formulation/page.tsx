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
  type AllergenReference,
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
import { createFormulationDraft } from '../../../../../../(npd)/pipeline/[projectId]/formulation/_actions/create-draft';
// Ghost-button wiring: import the two legacy-tree actions DIRECTLY (relative path).
// They are the actions library; the App-Router page is the only re-export-free seam
// that may thread them down as Server Action props. NEVER wrap them in a local
// 'use server' shim — that breaks the production build.
import { submitForTrial } from '../../../../../../(npd)/pipeline/[projectId]/formulation/_actions/submit-for-trial';
import { compareVersions } from '../../../../../../(npd)/pipeline/[projectId]/formulation/_actions/compare-versions';
// C1 — lock recipe: import the legacy-tree action DIRECTLY (no re-export shim).
import { lockVersion } from '../../../../../../(npd)/pipeline/[projectId]/formulation/_actions/lock-version';
import { loadAllergensConfig } from '../../../../(modules)/technical/allergens-config/_actions/load-config';
// Costing v2 — editable batch size (= pack weight): persist via the brief's
// updateProjectBrief action (batch = pack weight). Imported, never re-authored.
import { updateProjectBrief } from '../brief/_actions/update-project-brief';
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
  submitting: 'Submitting…',
  submittedForTrial: 'Submitted for trial',
  submitError: 'Could not submit for trial. Try again.',
  submitErrorTotalPct: 'Ingredient total must equal 100% before submitting for trial.',
  submitErrorMissingCost: 'Every ingredient needs a cost before submitting for trial.',
  submitErrorMissingNutritionTarget: 'Compute nutrition before submitting for trial.',
  submitErrorNotDraft: 'Only a draft version can be submitted for trial.',
  submitErrorLocked: 'This version is locked and cannot be submitted.',
  submitErrorForbidden: 'You do not have permission to submit for trial.',
  compareVersions: 'Compare versions',
  lockRecipe: 'Lock recipe',
  locking: 'Locking…',
  lockConfirmTitle: 'Lock recipe',
  lockConfirmBody: 'Locking freezes v{n} — it can no longer be edited.',
  lockConfirmConfirm: 'Lock recipe',
  lockConfirmCancel: 'Cancel',
  lockError: 'Could not lock the recipe. Try again.',
  lockErrorForbidden: 'You do not have permission to lock this recipe.',
  lockErrorLocked: 'This version is already locked.',
  lockErrorNotSubmitted: 'Only a draft or trial version can be locked.',
  lockErrorNotFound: 'This version could not be found.',
  compareTitle: 'Compare versions',
  compareVersionA: 'Version A',
  compareVersionB: 'Version B',
  compareClose: 'Close',
  compareRun: 'Compare',
  compareLoading: 'Loading diff…',
  compareError: 'Could not load the comparison.',
  compareColIngredient: 'Ingredient',
  compareColVersionA: 'Version A',
  compareColVersionB: 'Version B',
  compareSamePick: 'Pick two different versions to compare.',
  compareNoChanges: 'No ingredient differences between these versions.',
  compareTruncated: 'Showing the first 50 ingredient rows.',
  compareStatusAdded: 'Added',
  compareStatusRemoved: 'Removed',
  compareStatusChanged: 'Changed',
  compareStatusUnchanged: 'Unchanged',
  ingredients: 'Ingredients',
  addIngredient: 'Add ingredient',
  colIngredient: 'Ingredient',
  colQtyPerPack: 'Qty / pack (kg)',
  colCostPerKg: '€ / kg',
  colContribution: 'Contrib.',
  colAllergen: 'Allergen',
  deleteRow: 'Delete ingredient',
  total: 'Total',
  qtyBalanceWarning:
    'Ingredient total is {qty} kg vs a {pack} kg pack. Adjust to match the pack weight (±1%) before submitting for trial.',
  packWeightUnsetHint:
    'Set the pack weight on the Brief to validate the recipe against the pack size.',
  batchSizeHint: 'Batch size = pack weight; ingredients must total this.',
  composition: 'Composition',
  qtyRangeError: 'Quantity must be a non-negative number.',
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
  createDraft: 'Create draft',
  creatingDraft: 'Creating…',
  createDraftError: 'Could not create the draft. Try again.',
  error: 'Unable to load the formulation.',
  forbidden: 'You do not have permission to edit this formulation.',
  locked: 'This version is locked and cannot be edited.',
  noAllergen: '—',
  chooseItem: 'Choose item',
  // Phase-3 NPD↔Technical shortcut — "↗" link title on each picked ingredient row.
  openInTechnical: 'Open item in Technical',
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

/**
 * F-B05 (W9-L4): per-100g nutrition now arrives JOINED on each ingredient row
 * (getFormulation reads Reference.RawMaterials.nutrition_per_100g — the same
 * canonical source the T-065 recompute action uses), so the page no longer runs
 * its own round-trip. This helper only coerces the jsonb values to NUMERIC
 * strings at the boundary (never a binary float on the nutrition path).
 */
function coerceNutritionPer100g(src: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!src || typeof src !== 'object') return null;
  const per: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v === null || v === undefined) continue;
    per[k] = String(v);
  }
  return Object.keys(per).length > 0 ? per : null;
}

/**
 * Costing v2 — load the project's pack net weight in grams (the recipe batch
 * size / per-kg divisor) from `public.npd_projects`, org-scoped via
 * app.current_org_id(). Returns the NUMERIC value as a string (never a float);
 * null when unset or the project row is not visible.
 */
async function loadPackWeightG(ctx: OrgContextLike, projectId: string): Promise<string | null> {
  if (!projectId) return null;
  const { rows } = await ctx.client.query<{ pack_weight_g: string | null }>(
    `select pack_weight_g::text as pack_weight_g
       from public.npd_projects
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [projectId],
  );
  return rows[0]?.pack_weight_g ?? null;
}

async function loadCurrentStage(ctx: OrgContextLike, projectId: string): Promise<string | null> {
  if (!projectId) return null;
  const { rows } = await ctx.client.query<{ current_stage: string | null }>(
    `select current_stage
       from public.npd_projects
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [projectId],
  );
  return rows[0]?.current_stage ?? null;
}

interface VersionRow {
  id: string;
  version_number: number;
}

async function loadCanonicalAllergenReference(): Promise<AllergenReference[]> {
  const result = await loadAllergensConfig();
  if (result.state === 'error') return [];
  return result.allergens.map((allergen) => ({
    code: allergen.allergenCode,
    name: allergen.allergenName,
  }));
}

/**
 * Compare-versions data source: load the project's FULL version history (id +
 * number) so the picker can offer every version and the diff can run across any
 * two. Cheapest correct source — a single org-scoped read of
 * `formulation_versions` joined to the project's formulation (getFormulation
 * only returns the current version, which is not enough to compare). Degrades to
 * an empty list on any error so the editor still renders.
 */
async function loadVersionHistory(
  ctx: OrgContextLike,
  projectId: string,
): Promise<Array<{ id: string; versionNumber: number }>> {
  if (!projectId) return [];
  const { rows } = await ctx.client.query<VersionRow>(
    `select fv.id::text as id, fv.version_number
       from public.formulation_versions fv
       join public.formulations f on f.id = fv.formulation_id
      where f.project_id = $1::uuid
        and f.org_id = app.current_org_id()
      order by fv.version_number desc`,
    [projectId],
  );
  return rows.map((r) => ({ id: r.id, versionNumber: r.version_number }));
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

type LoaderResult = {
  state: PageState;
  data: FormulationEditorData | null;
  canEdit: boolean;
  submitAllowed: boolean;
  allergenReference: AllergenReference[];
};

async function readPageData(projectId: string): Promise<LoaderResult> {
  // Perf (#1 + #3): editability (RBAC) + pack weight do NOT depend on the
  // formulation, so resolve them CONCURRENTLY with getFormulation. Per-request
  // context caching (#1) means the JWT/org resolution is shared across both.
  const [result, basics] = await Promise.all([
    getFormulation({ projectId }),
    (async (): Promise<{
      canEdit: boolean;
      packWeightG: string | null;
      versions: Array<{ id: string; versionNumber: number }>;
      currentStage: string | null;
      allergenReference: AllergenReference[];
    }> => {
      try {
        return await withOrgContext(async (rawCtx) => {
          const ctx = rawCtx as OrgContextLike;
          const [canEdit, packWeightG, versions, currentStage, allergenReference] = await Promise.all([
            hasPermission(ctx, EDIT_PERMISSION),
            loadPackWeightG(ctx, projectId),
            loadVersionHistory(ctx, projectId),
            loadCurrentStage(ctx, projectId),
            loadCanonicalAllergenReference(),
          ]);
          return { canEdit, packWeightG, versions, currentStage, allergenReference };
        });
      } catch (e) {
        console.error('formulation loader error:', e);
        return { canEdit: false, packWeightG: null, versions: [], currentStage: null, allergenReference: [] };
      }
    })(),
  ]);
  const canEdit = basics.canEdit;
  const submitAllowed = basics.currentStage === 'recipe';
  const packWeightG = basics.packWeightG;
  const versionHistory = basics.versions;
  const allergenReference = basics.allergenReference;

  if (!result.ok) {
    if (result.error === 'not_found') return { state: 'empty', data: null, canEdit, submitAllowed, allergenReference };
    if (result.error === 'invalid_input') return { state: 'empty', data: null, canEdit, submitAllowed, allergenReference };
    return { state: 'error', data: null, canEdit, submitAllowed, allergenReference };
  }

  const { formulation, currentVersion, ingredients } = result.data;
  if (!currentVersion) {
    return { state: 'empty', data: null, canEdit, submitAllowed, allergenReference };
  }

  const data: FormulationEditorData = {
    projectId: formulation.projectId,
    versionId: currentVersion.id,
    versionNumber: currentVersion.versionNumber,
    state: formulation.lockedAt ? 'locked' : currentVersion.state,
    productCode: formulation.productCode,
    batchSizeKg: currentVersion.batchSizeKg,
    // Costing v2: pack weight (g) from the project — the read-only batch size.
    packWeightG,
    targetPriceEur: currentVersion.targetPriceEur,
    targetYieldPct: currentVersion.targetYieldPct,
    // Full version history (v1, v2…) for the picker + Compare modal. Falls back
    // to just the current version when the history read returned nothing, and
    // guarantees the current version is always present (defensive union).
    versions:
      versionHistory.length > 0
        ? versionHistory.some((v) => v.id === currentVersion.id)
          ? versionHistory
          : [{ id: currentVersion.id, versionNumber: currentVersion.versionNumber }, ...versionHistory]
        : [{ id: currentVersion.id, versionNumber: currentVersion.versionNumber }],
    ingredients: ingredients.map((ing) => {
      // F-B05: nutrition is joined per ingredient by getFormulation now.
      const nutrition = coerceNutritionPer100g(ing.nutrition_per_100g);
      return {
        id: ing.id,
        rmCode: ing.rm_code,
        // Lane-B: item_id wires the real items-master row; name comes from the join.
        itemId: ing.item_id,
        name: ing.item_name ?? '',
        // Costing v2: the entered qty/pack (kg) is the primary editable field.
        qtyKg: ing.qty_kg,
        pct: ing.pct,
        costPerKgEur: ing.cost_per_kg_eur,
        // F-A08: FULL derived allergen array (SSOT-resolved server-side) — the
        // old `?.[0]` silently truncated multi-allergen items to one entry.
        allergens: ing.allergens_inherited ?? [],
        sequence: ing.sequence,
        ...(nutrition ? { nutritionPer100g: nutrition } : {}),
      };
    }),
  };

  return { state: 'ready', data, canEdit, submitAllowed, allergenReference };
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
        submitAllowed: true,
        allergenReference: [],
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
      allergenReference={loaded.allergenReference}
      currency="EUR"
      canEdit={loaded.canEdit}
      submitAllowed={loaded.submitAllowed}
      saveDraftAction={saveDraft}
      recomputeAction={recomputeAndCache}
      submitForTrialAction={submitForTrial}
      compareVersionsAction={compareVersions}
      // C1 — lock recipe: only thread the action when the user can write (same
      // gate as save). The action ALSO enforces `npd.formulation.lock` server-side
      // and surfaces `forbidden` inline if the user lacks the lock grant.
      lockVersionAction={loaded.canEdit ? lockVersion : undefined}
      // Costing v2 — editable batch size (= pack weight). Only threaded when the
      // user can write (same gate as save); the action also enforces RBAC server-side.
      updatePackWeightAction={loaded.canEdit ? updatePackWeightAdapter : undefined}
      projectId={projectId}
      createDraftAction={loaded.canEdit ? createDraftAdapter : undefined}
    />
  );
}

// Create-draft Server Action adapter (RBAC enforced inside the action + only injected
// when canEdit). Returns the minimal { ok } the editor's empty-state button needs.
async function createDraftAdapter(input: { projectId: string }): Promise<{ ok: boolean }> {
  'use server';
  const result = await createFormulationDraft(input);
  return { ok: result.ok };
}

// Costing v2 — batch size (= pack weight, grams) commit adapter. Narrow shim over
// the brief's updateProjectBrief action: it builds the EXACT zod patch
// ({ projectId, patch: { packWeightG } }) the reviewed action expects (packWeightG
// is an optionalDecimal NUMERIC string; null clears it). RBAC (npd.core.write) is
// enforced inside the action; only injected when canEdit. Never re-authored.
async function updatePackWeightAdapter(input: {
  projectId: string;
  packWeightG: string | null;
}): Promise<{ ok: boolean }> {
  'use server';
  const result = await updateProjectBrief({
    projectId: input.projectId,
    patch: { packWeightG: input.packWeightG },
  });
  return { ok: result.ok };
}
