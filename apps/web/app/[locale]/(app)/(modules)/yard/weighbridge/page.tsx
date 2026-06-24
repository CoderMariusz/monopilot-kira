/**
 * WAVE E5 — SCREEN /yard/weighbridge (mig 317 weighings).
 *
 * A weighing entry form (pick an on-site visit, gross + tare → net shown live)
 * plus the weighings recorded this session. The yard contract exposes
 * recordWeighing's returned WeighingRow but no list action, so the recent panel
 * accumulates the real returned rows rather than fabricating a server list.
 *
 * Prototype anchor: NONE EXISTS (no yard/dock prototype). Spec-driven;
 * prototype_match=false, nearest pattern = planning/carriers list+form.
 *
 * Real data only: on-site visits + weighings go through the org-scoped yard
 * Server Actions (RBAC server-side, they THROW `forbidden`).
 *
 * UI states: loading, empty (no on-site vehicles → form disabled), error,
 * permission-denied (forbidden → amber note), optimistic (submit busy +
 * disabled while the weighing records).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listYardVisits, recordWeighing } from '../_actions/yard-actions';
import { WeighbridgeView } from '../_components/weighbridge-view.client';

export const dynamic = 'force-dynamic';

type WeighbridgePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function WeighbridgePage({ params }: WeighbridgePageProps) {
  const { locale } = await params;
  const t = await getTranslations('Yard');

  return (
    <main
      data-screen="yard-weighbridge"
      data-testid="yard-weighbridge-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('weighbridge.title')}
        subtitle={t('weighbridge.subtitle')}
        breadcrumb={[
          { label: t('board.breadcrumb'), href: `/${locale}/yard` },
          { label: t('weighbridge.breadcrumb') },
        ]}
      />
      <WeighbridgeView
        listYardVisitsAction={listYardVisits}
        recordWeighingAction={recordWeighing}
      />
    </main>
  );
}
