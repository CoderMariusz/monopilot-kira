/**
 * T-049 — TEC-044 Allergen Manual Override Audit (aggregate cross-item view).
 *
 * Server Component at /technical/allergens/overrides. Loads the append-only
 * override ledger across every item (withOrgContext + RLS, real Supabase data),
 * builds i18n labels (technical.allergens.audit, English fallback) and renders the
 * read-only audit table. Clicking a row re-opens the declaration/override modal
 * (parity: prototypes/design/Monopilot Design System/technical/modals.jsx:309-347)
 * — the write path requires technical.allergens.edit + a reason (V-TEC-42).
 */

import { loadAllOverrides } from './_actions/load-overrides';
import { OverrideAuditPanel } from './_components/override-audit.client';
import {
  buildAllergensTabLabels,
  buildOverrideAuditLabels,
  DEFAULT_TAB_LABELS,
} from '../../items/[item_code]/_components/allergen-labels';
import { saveAllergenOverride } from '../../items/[item_code]/_actions/allergen-profile';

export const dynamic = 'force-dynamic';

export default async function AllergenOverridesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const [load, auditLabels, tabLabels] = await Promise.all([
    loadAllOverrides(),
    buildOverrideAuditLabels(locale),
    buildAllergensTabLabels(locale),
  ]);

  const declarationLabels = tabLabels.modal ?? DEFAULT_TAB_LABELS.modal;

  return (
    <main data-screen="technical-allergen-overrides" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Technical · Allergens</p>
        <h1 className="text-2xl font-semibold tracking-tight">{auditLabels.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{auditLabels.subtitle}</p>
      </header>

      <OverrideAuditPanel
        rows={load.rows}
        labels={auditLabels}
        state={load.state === 'error' ? 'error' : load.state === 'empty' ? 'empty' : 'ready'}
        canReview={load.canReview}
        scope="aggregate"
        declarationLabels={declarationLabels}
        allergens={load.allergens}
        saveOverrideAction={saveAllergenOverride}
      />
    </main>
  );
}
