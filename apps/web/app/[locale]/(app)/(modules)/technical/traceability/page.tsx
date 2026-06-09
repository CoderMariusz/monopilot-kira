/**
 * Traceability search screen — /technical/traceability.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:694-773 (TraceabilityScreen). FSMA-204 / GS1-style trace:
 *   enter an LP / batch / lot / WO to follow components in and shipments out.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Wired to the reviewed searchTraceability Server Action (bounded LIMITs over
 * license_plates / wo_outputs / wo_material_consumption / work_orders /
 * bom_lines) — withOrgContext + RLS, real Supabase data, no mocks. Read-only by
 * design (RLS-scoped, any org user — no permission gate). Production tables are
 * sparse, so the prompt + no-results states are first-class. Five states:
 * loading (Suspense over the static shell), empty/prompt, no-results, error,
 * permission-denied (shared contract), ready.
 */

import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { searchTraceability } from './_actions/search-traceability';
import {
  TraceabilityClient,
  type TraceabilityLabels,
} from './_components/traceability.client';

export const dynamic = 'force-dynamic';

export default async function TraceabilityPage() {
  const t = await getTranslations('technical.traceability');

  const labels: TraceabilityLabels = {
    searchPlaceholder: t('searchPlaceholder'),
    searchLabel: t('searchLabel'),
    search: t('search'),
    directionLabel: t('direction.label'),
    directionBackward: t('direction.backward'),
    directionForward: t('direction.forward'),
    directionBoth: t('direction.both'),
    hint: t('hint'),
    prompt: t('prompt'),
    promptBody: t('promptBody'),
    noResults: t('noResults'),
    noResultsBody: t('noResultsBody'),
    error: t('error'),
    denied: t('denied'),
    resultCount: t('resultCount'),
    kind: {
      license_plate: t('kind.license_plate'),
      wo_output: t('kind.wo_output'),
      wo_consumption: t('kind.wo_consumption'),
      work_order: t('kind.work_order'),
      bom_line: t('kind.bom_line'),
    },
    relation: {
      contains: t('relation.contains'),
      consumed_by: t('relation.consumed_by'),
      produced: t('relation.produced'),
      requires_component: t('relation.requires_component'),
    },
    qtyLabel: t('qtyLabel'),
    lotLabel: t('lotLabel'),
    statusLabel: t('statusLabel'),
  };

  return (
    <main data-screen="technical-traceability" className="flex w-full flex-col gap-4 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.traceability') }]}
      />
      <TraceabilityClient labels={labels} searchAction={searchTraceability} />
    </main>
  );
}
