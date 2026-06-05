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

import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

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

  const [load, auditLabels, tabLabels, t] = await Promise.all([
    loadAllOverrides(),
    buildOverrideAuditLabels(locale),
    buildAllergensTabLabels(locale),
    getTranslations('technical.allergens.overrides'),
  ]);

  const declarationLabels = tabLabels.modal ?? DEFAULT_TAB_LABELS.modal;

  return (
    <main data-screen="technical-allergen-overrides" className="flex w-full flex-col gap-4 px-6 py-6">
      <PageHeader
        title={auditLabels.title}
        subtitle={auditLabels.subtitle}
        breadcrumb={[
          { label: t('breadcrumb.technical') },
          { label: t('breadcrumb.allergens') },
          { label: t('breadcrumb.overrides') },
        ]}
      />

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
