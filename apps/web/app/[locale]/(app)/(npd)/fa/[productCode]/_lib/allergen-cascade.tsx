/**
 * Allergen cascade reachability helper (module-close gap fix).
 *
 * Shared loader + label builder + renderer that makes the BUILT T-040 allergen
 * cascade feature reachable from the canonical locale tree
 * ([locale]/(app)/(npd)/fa/[productCode]). It REUSES the existing engine/actions —
 * it does NOT re-author them:
 *   - read-model:   public.fa_allergen_cascade  (T-038)   via readAllergenCascade
 *   - refresh:      re-runs the T-038 engine               via refreshAllergenCascade
 *   - override:     T-039 setAllergenOverride               via submitAllergenOverride
 *   - presentation: T-040 AllergenCascadeWidget + AllergenOverrideModal
 * All of the above live under the earlier-generation non-locale (npd) tree;
 * Server Actions are not route-bound, so importing them across trees is the same
 * pattern the docs/risks locale sub-routes already use.
 *
 * RBAC (`npd.allergen.write`) is resolved SERVER-SIDE inside readAllergenCascade and
 * re-enforced inside refresh/override; the client never trusts a permission flag.
 * Real org-scoped data only — NO mocks.
 *
 * Prototype parity source (1:1, unchanged from T-040):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:389-428         (allergen_override_modal)
 */

import { getTranslations } from 'next-intl/server';

import {
  AllergenCascadeWidget,
  type AllergenCascadeData,
  type AllergenCascadeLabels,
  type WidgetState,
} from '../../../../../../(npd)/fa/[productCode]/_components/allergen-cascade-widget';
import { readAllergenCascade } from '../../../../../../(npd)/fa/[productCode]/allergens/_actions/read-allergen-cascade';
import { refreshAllergenCascade } from '../../../../../../(npd)/fa/[productCode]/allergens/_actions/refresh-allergen-cascade';
import { submitAllergenOverride } from '../../../../../../(npd)/fa/[productCode]/allergens/_actions/submit-allergen-override';

export type { AllergenCascadeData, AllergenCascadeLabels, WidgetState };

const DEFAULT_LABELS: AllergenCascadeLabels = {
  title: 'Allergen cascade',
  subtitle:
    'Derived RM + process allergens, additive overrides, and the FG-final declaration (EU FIC 1169/2011 — 14 mandatory allergens).',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  override: 'Override',
  sectionDerived: 'Derived (RM + process)',
  sectionDerivedSource: 'Auto-derived union of confirmed raw-material and process allergens.',
  sectionDeltas: 'Override deltas',
  sectionFinal: 'FG final',
  contains: 'Contains',
  mayContain: 'May contain',
  deltaAdded: 'Added by override',
  deltaRemoved: 'Removed by override',
  noDeltas: 'No manual overrides applied.',
  manual: 'Manual',
  present: 'Present',
  absent: 'Absent',
  eu14Title: 'EU 14 mandatory allergens',
  derivationNote:
    'Contains = union(RM allergens) ∪ union(process allergens), with additive overrides applied. May-contain = precautionary (RM traces + conditional process).',
  loading: 'Loading allergen cascade…',
  empty: 'No allergen data yet',
  emptyBody:
    'Add raw materials and processes to derive the allergen declaration for this FG.',
  error: 'Unable to load the allergen cascade. Try again after the backend is available.',
  forbidden: 'You do not have permission to view the allergen cascade for this FG.',
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

export async function buildAllergenLabels(locale: string): Promise<AllergenCascadeLabels> {
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

export type AllergenLoad = {
  state: WidgetState;
  data: AllergenCascadeData | null;
  canWrite: boolean;
  displayNames: Record<string, string>;
};

/**
 * Org-scoped allergen cascade read (REAL data). Reuses the T-040 readAllergenCascade
 * which runs inside withOrgContext (app_user + RLS app.current_org_id()). Maps the
 * read-model into the five discrete widget states. NO mocks.
 */
export async function loadAllergenCascade(
  productCode: string,
  locale: string,
): Promise<AllergenLoad> {
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
    console.error('[allergen-cascade] org-scoped read failed:', error);
    return { state: 'error', data: null, canWrite: false, displayNames: {} };
  }
}

/**
 * Server-rendered allergen cascade section. Drops straight into the Technical-tab
 * slot OR the locale allergens sub-route. Wires the (route-agnostic) reused Server
 * Actions for Refresh + Override.
 */
export function AllergenCascadeSection({
  labels,
  load,
}: {
  labels: AllergenCascadeLabels;
  load: AllergenLoad;
}) {
  return (
    <AllergenCascadeWidget
      data={load.data}
      labels={labels}
      canWrite={load.canWrite}
      state={load.state}
      refreshAction={refreshAllergenCascade}
      setAllergenOverrideAction={submitAllergenOverride}
      allergenDisplayNames={load.displayNames}
    />
  );
}
