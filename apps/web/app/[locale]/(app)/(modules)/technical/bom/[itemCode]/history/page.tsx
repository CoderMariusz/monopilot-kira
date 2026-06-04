/**
 * T-045 — UI: TEC-089 BOM Change History timeline — Server Component page.
 *
 * Route: /[locale]/(app)/technical/bom/[itemCode]/history
 *   `[itemCode]` resolves to `bom_headers.product_id` (the FG product_code).
 *
 * Reads REAL, org-scoped data via getBomHistory (withOrgContext + RLS as app_user
 * with app.current_org_id()). No mocks. A cross-org / unknown FG → notFound() (404).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:230-263
 *
 * Red-lines: FG canonical (no FA labels); audit_log is read under org RLS only;
 * read-only (no writes here).
 */

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getBomHistory } from '../../_actions/history';
import {
  BomHistoryTimeline,
  type BomHistoryLabels,
  type HistoryActor,
  type HistoryEntryView,
} from '../../_components/bom-history-timeline';

export const dynamic = 'force-dynamic';

const DEFAULT_LABELS: BomHistoryLabels = {
  title: 'Change history',
  subtitle: 'Immutable audit timeline of every change to this BOM — versions, approvals and releases.',
  filterActorLabel: 'Actor',
  filterAllActors: 'All actors',
  empty: 'No history yet for this BOM.',
  emptyFiltered: 'No changes by the selected actor.',
  tagCreated: 'Created',
  tagApprove: 'Approved',
  tagRelease: 'Released',
  tagOther: 'Change',
  versionChip: 'v{version}',
  unknownActor: 'System',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof BomHistoryLabels>;

function translateLabel(t: (key: string) => string, key: keyof BomHistoryLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<BomHistoryLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.bomHistory' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as BomHistoryLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

type BomHistoryPageProps = {
  params?: Promise<{ locale: string; itemCode: string }>;
  // Test-only injection seam.
  entries?: HistoryEntryView[];
  actors?: HistoryActor[];
};

export default async function BomHistoryPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as BomHistoryPageProps;
  const { locale, itemCode } = props.params
    ? await props.params
    : { locale: 'en', itemCode: '' };

  const labels = await buildLabels(locale);

  const injected = props.entries !== undefined || props.actors !== undefined;
  if (injected) {
    return (
      <BomHistoryTimeline entries={props.entries ?? []} actors={props.actors ?? []} labels={labels} />
    );
  }

  const productId = decodeURIComponent(itemCode);
  const result = await getBomHistory(productId);

  if (!result.ok) {
    if (result.error === 'not_found') notFound();
    // load_failed → render the empty timeline (the component shows the empty copy).
    return <BomHistoryTimeline entries={[]} actors={[]} labels={labels} />;
  }

  return (
    <BomHistoryTimeline entries={result.data.entries} actors={result.data.actors} labels={labels} />
  );
}
