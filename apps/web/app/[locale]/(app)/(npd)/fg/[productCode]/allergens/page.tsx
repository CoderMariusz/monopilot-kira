/**
 * Allergen cascade locale sub-route (module-close gap fix) — SCR-09, per-FG.
 *
 * Route: /[locale]/(app)/(npd)/fa/[productCode]/allergens
 *
 * Sibling of the established docs/ + risks/ locale sub-routes. Server Component.
 * Reads REAL, org-scoped allergen data from the T-038 read-model VIEW
 * public.fa_allergen_cascade via the reused readAllergenCascade prefetch
 * (RLS-enforced as app_user with app.current_org_id()). NO mocks.
 *
 * REUSE (does not re-author the engine/actions):
 *   - read:     readAllergenCascade           (T-040 prefetch over the T-038 view)
 *   - refresh:  refreshAllergenCascade         (re-runs the T-038 engine)
 *   - override: submitAllergenOverride          (T-039 setAllergenOverride wrapper)
 *   - UI:       AllergenCascadeWidget + AllergenOverrideModal (T-040)
 * All wired through the shared ./_lib/allergen-cascade helper that the FA-detail
 * Technical-tab loader also uses, so the two reachability surfaces stay in sync.
 *
 * RBAC (`npd.allergen.write`) is resolved server-side inside the reused actions and
 * never trusted from the client (the Refresh + per-allergen Override controls are
 * omitted when the caller lacks the permission — no render-then-disable).
 *
 * Prototype parity source (1:1, unchanged from T-040):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:389-428         (allergen_override_modal)
 */

import {
  AllergenCascadeSection,
  buildAllergenLabels,
  loadAllergenCascade,
  type AllergenCascadeData,
  type AllergenLoad,
  type WidgetState,
} from '../_lib/allergen-cascade';

export const dynamic = 'force-dynamic';

type AllergensPageProps = {
  params?: Promise<{ locale: string; productCode: string }>;
  // Test-only injection seam (mirrors the risks/page.tsx convention).
  data?: AllergenCascadeData | null;
  canWrite?: boolean;
  canAcceptDeclaration?: boolean;
  state?: WidgetState;
};

export default async function AllergensPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as AllergensPageProps;
  const { locale, productCode } = props.params
    ? await props.params
    : { locale: 'en', productCode: '' };

  const labels = await buildAllergenLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const load: AllergenLoad = injected
    ? {
        state: props.state ?? (props.data ? 'ready' : 'empty'),
        data: props.data ?? null,
        canWrite: props.canWrite ?? false,
        canAcceptDeclaration: props.canAcceptDeclaration ?? false,
        displayNames: {},
      }
    : await loadAllergenCascade(productCode, locale);

  return (
    <main className="space-y-4" data-testid="fa-allergens-page">
      <nav aria-label="breadcrumb" className="text-xs text-slate-500">
        NPD / {productCode} / {labels.title}
      </nav>
      <AllergenCascadeSection labels={labels} load={load} />
    </main>
  );
}
