/**
 * T-040 — Allergen cascade page (Technical-tab allergen slot, per-FA).
 *
 * Server Component. Reads REAL, org-scoped allergen data from the T-038 read-model
 * VIEW public.fa_allergen_cascade via the readAllergenCascade prefetch (RLS-enforced as
 * app_user with app.current_org_id()). No mocks. Override writes wire to setAllergenOverride
 * (T-039, merged) via submitAllergenOverride; the Refresh button re-runs the T-038 engine
 * via refreshAllergenCascade. RBAC (canWrite) is resolved server-side and never trusted
 * from the client.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:389-428         (allergen_override_modal)
 */

import { getLocale, getTranslations } from 'next-intl/server';

import {
  AllergenCascadeWidget,
  type AllergenCascadeData,
  type AllergenCascadeLabels,
  type WidgetState,
} from '../_components/allergen-cascade-widget';
import { readAllergenCascade } from './_actions/read-allergen-cascade';
import { refreshAllergenCascade } from './_actions/refresh-allergen-cascade';
import { submitAllergenOverride } from './_actions/submit-allergen-override';

export const dynamic = 'force-dynamic';

type AllergensPageProps = {
  params?: Promise<{ productCode: string }>;
  // Test-only injection seam (mirrors the risk-register page convention).
  data?: AllergenCascadeData | null;
  canWrite?: boolean;
  state?: WidgetState;
};

const DEFAULT_LABELS: AllergenCascadeLabels = {
  title: 'Allergen cascade',
  subtitle: 'Derived RM + process allergens, additive overrides, and the FA-final declaration (EU FIC 1169/2011 — 14 mandatory allergens).',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  override: 'Override',
  sectionDerived: 'Derived (RM + process)',
  sectionDerivedSource: 'Auto-derived union of confirmed raw-material and process allergens.',
  sectionDeltas: 'Override deltas',
  sectionFinal: 'FA final',
  contains: 'Contains',
  mayContain: 'May contain',
  deltaAdded: 'Added by override',
  deltaRemoved: 'Removed by override',
  noDeltas: 'No manual overrides applied.',
  manual: 'Manual',
  present: 'Present',
  absent: 'Absent',
  eu14Title: 'EU 14 mandatory allergens',
  derivationNote: 'Contains = union(RM allergens) ∪ union(process allergens), with additive overrides applied. May-contain = precautionary (RM traces + conditional process).',
  loading: 'Loading allergen cascade…',
  empty: 'No allergen data yet',
  emptyBody: 'Add raw materials and processes to derive the allergen declaration for this FA.',
  error: 'Unable to load the allergen cascade. Try again after the backend is available.',
  forbidden: 'You do not have permission to view the allergen cascade for this FA.',
  sourceRm: 'Source: raw material / process (auto-derived)',
  sourceProcess: 'Source: precautionary (RM trace / conditional process)',
  sourceOverride: 'Source: manual override (audit-logged)',
  // override modal
  auditWarning:
    'Overriding the auto-cascaded allergen status requires a reason. This override is audit-logged with your name and timestamp, and flagged for review on the next cascade refresh.',
  fieldAllergen: 'Allergen',
  fieldCurrent: 'Current auto-cascade',
  fieldAction: 'Override to',
  actionAdd: '✓ Include (Contains)',
  actionRemove: '✗ Exclude (Not present)',
  fieldReason: 'Reason',
  reasonPlaceholder: 'Explain why the auto-cascade is overridden…',
  reasonTooShort: 'Reason must be at least 10 characters (max 500).',
  cancel: 'Cancel',
  save: 'Save override',
  statusContains: 'Contains',
  statusAbsent: 'Not present',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof AllergenCascadeLabels>;

function translateLabel(t: (key: string) => string, key: keyof AllergenCascadeLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<AllergenCascadeLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.allergenWidget' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as AllergenCascadeLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

type LoaderResult = {
  state: WidgetState;
  data: AllergenCascadeData | null;
  canWrite: boolean;
  displayNames: Record<string, string>;
};

async function readPageData(productCode: string, locale: string): Promise<LoaderResult> {
  try {
    const result = await readAllergenCascade(productCode, locale);
    if (!result.ok) {
      const state: WidgetState =
        result.code === 'FORBIDDEN'
          ? 'permission_denied'
          : result.code === 'NOT_FOUND'
            ? 'empty'
            : 'error';
      return { state, data: null, canWrite: false, displayNames: {} };
    }
    const data: AllergenCascadeData = {
      productCode: result.data.productCode,
      derivedAllergens: result.data.derivedAllergens,
      publishedAllergens: result.data.publishedAllergens,
      mayContainAllergens: result.data.mayContainAllergens,
      conditionalProcessAllergens: result.data.conditionalProcessAllergens,
    };
    const isEmpty =
      data.derivedAllergens.length === 0 &&
      data.publishedAllergens.length === 0 &&
      data.mayContainAllergens.length === 0;
    return {
      state: isEmpty ? 'empty' : 'ready',
      data: isEmpty ? null : data,
      canWrite: result.data.canWrite,
      displayNames: result.data.displayNames,
    };
  } catch (error) {
    console.error('[allergen-cascade-page] org-scoped read failed:', error);
    return { state: 'error', data: null, canWrite: false, displayNames: {} };
  }
}

export default async function AllergensPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as AllergensPageProps;
  const { productCode } = props.params ? await props.params : { productCode: '' };

  let locale = 'en';
  try {
    locale = await getLocale();
  } catch {
    locale = 'en';
  }

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? (props.data ? 'ready' : 'empty'),
        data: props.data ?? null,
        canWrite: props.canWrite ?? false,
        displayNames: {},
      }
    : await readPageData(productCode, locale);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <nav aria-label="breadcrumb" className="text-xs text-slate-500">
        NPD / {productCode} / {labels.title}
      </nav>
      <AllergenCascadeWidget
        data={loaded.data}
        labels={labels}
        canWrite={loaded.canWrite}
        state={loaded.state}
        refreshAction={refreshAllergenCascade}
        setAllergenOverrideAction={submitAllergenOverride}
        allergenDisplayNames={loaded.displayNames}
      />
    </main>
  );
}
