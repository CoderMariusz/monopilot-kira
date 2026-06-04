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
  type PageState,
} from './_components/formulation-editor';
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
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof FormulationLabels>;

function translateLabel(t: (key: string) => string, key: keyof FormulationLabels): string {
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
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as FormulationLabels);
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

type LoaderResult = { state: PageState; data: FormulationEditorData | null; canEdit: boolean };

async function readPageData(projectId: string): Promise<LoaderResult> {
  // Editability is RBAC-gated server-side; the read itself is RLS-scoped.
  let canEdit = false;
  try {
    canEdit = await withOrgContext(async (rawCtx) => hasPermission(rawCtx as OrgContextLike, EDIT_PERMISSION));
  } catch {
    canEdit = false;
  }

  const result = await getFormulation({ projectId });
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
    ingredients: ingredients.map((ing) => ({
      id: ing.id,
      rmCode: ing.rm_code,
      // rm_code is the canonical key; a friendly name is not on this row (T-063).
      name: '',
      pct: ing.pct,
      costPerKgEur: ing.cost_per_kg_eur,
      allergen: ing.allergens_inherited?.[0] ?? null,
      sequence: ing.sequence,
    })),
  };

  return { state: 'ready', data, canEdit };
}

export default async function FormulationPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FormulationPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

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
      canEdit={loaded.canEdit}
      saveDraftAction={saveDraft}
      recomputeAction={recomputeAndCache}
    />
  );
}
