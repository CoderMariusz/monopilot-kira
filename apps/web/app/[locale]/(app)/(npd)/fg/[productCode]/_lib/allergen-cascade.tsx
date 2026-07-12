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
import {
  acceptAllergenDeclaration,
  revokeAllergenDeclaration,
} from '../allergens/_actions/accept-declaration';
import { hasAnyPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { buildAllergenCascadeData } from '../../../../../../../lib/npd/build-allergen-cascade-data';

const DECLARATION_WRITE_PERMISSIONS = [
  'npd.allergen.write',
  'npd.allergen.accept_declaration',
  'technical.write',
  'quality.write',
] as const;

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
  // declaration accept control
  declarationTitle: 'Declaration sign-off',
  declarationDescription:
    'The published FG declaration below (Contains + May contain) is the regulatory output. Accept it to satisfy approval criterion C5 “Allergens declared”.',
  declarationAcceptLabel:
    'I confirm the allergen declaration above is complete and accurate (Declaration accepted).',
  declarationAcceptedBadge: 'Declaration accepted',
  declarationNotAccepted: 'Declaration not yet accepted — approval is blocked until you accept it.',
  declarationAcceptedBy: 'by {name} on {date}',
  declarationPending: 'Saving…',
  declarationError: 'Could not update the declaration. Try again.',
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
  /** Declaration accept/revoke — broader permission OR-list than cascade override. */
  canAcceptDeclaration: boolean;
  displayNames: Record<string, string>;
};

type DeclarationStateRow = {
  accepted: boolean;
  accepted_by: string | null;
  accepted_at: string | null;
};

async function readDeclarationState(
  productCode: string,
): Promise<{ accepted: boolean; acceptedBy: string | null; acceptedAt: string | null }> {
  try {
    return await withOrgContext(async ({ client }) => {
      const queryClient = client as {
        query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
      };
      const res = await queryClient.query<DeclarationStateRow>(
        `select p.allergens_declaration_accepted as accepted,
                coalesce(u.display_name, u.name, p.allergens_declaration_accepted_by::text) as accepted_by,
                p.allergens_declaration_accepted_at::text as accepted_at
           from public.product p
           left join public.users u on u.id = p.allergens_declaration_accepted_by
          where p.product_code = $1
            and p.org_id = app.current_org_id()
            and p.deleted_at is null
          limit 1`,
        [productCode],
      );
      const row = res.rows[0];
      return {
        accepted: row?.accepted === true,
        acceptedBy: row?.accepted_by ?? null,
        acceptedAt: row?.accepted_at ?? null,
      };
    });
  } catch (error) {
    console.error('[allergen-cascade] declaration-state read failed:', error);
    return { accepted: false, acceptedBy: null, acceptedAt: null };
  }
}

async function readCanAcceptDeclaration(): Promise<boolean> {
  try {
    return await withOrgContext(async ({ client, userId, orgId }) => {
      return hasAnyPermission({ client, userId, orgId }, [...DECLARATION_WRITE_PERMISSIONS]);
    });
  } catch {
    return false;
  }
}

async function readProductExists(productCode: string): Promise<boolean> {
  try {
    return await withOrgContext(async ({ client }) => {
      const queryClient = client as {
        query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
      };
      const res = await queryClient.query<{ product_code: string }>(
        `select product_code
           from public.product
          where product_code = $1
            and org_id = app.current_org_id()
            and deleted_at is null
          limit 1`,
        [productCode],
      );
      return res.rows.length > 0;
    });
  } catch {
    return false;
  }
}

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
    const [result, declaration, canAcceptDeclaration, productExists] = await Promise.all([
      readAllergenCascade(productCode, locale),
      readDeclarationState(productCode),
      readCanAcceptDeclaration(),
      readProductExists(productCode),
    ]);

    if (!productExists) {
      return { state: 'empty', data: null, canWrite: false, canAcceptDeclaration: false, displayNames: {} };
    }

    if (!result.ok && result.code !== 'NOT_FOUND') {
      const state: WidgetState =
        result.code === 'FORBIDDEN'
          ? 'permission_denied'
          : 'error';
      return { state, data: null, canWrite: false, canAcceptDeclaration: false, displayNames: {} };
    }

    const cascade = result.ok ? result.data : null;
    const data = buildAllergenCascadeData(productCode, cascade, declaration);

    return {
      state: 'ready',
      data,
      canWrite: cascade?.canWrite ?? false,
      canAcceptDeclaration,
      displayNames: cascade?.displayNames ?? {},
    };
  } catch (error) {
    console.error('[allergen-cascade] org-scoped read failed:', error);
    return { state: 'error', data: null, canWrite: false, canAcceptDeclaration: false, displayNames: {} };
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
      canAcceptDeclaration={load.canAcceptDeclaration}
      state={load.state}
      refreshAction={refreshAllergenCascade}
      setAllergenOverrideAction={submitAllergenOverride}
      allergenDisplayNames={load.displayNames}
      acceptDeclarationAction={acceptAllergenDeclaration}
      revokeDeclarationAction={revokeAllergenDeclaration}
    />
  );
}
