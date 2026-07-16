import { getTranslations } from 'next-intl/server';

import { loadDocumentAuditTimeline } from '../../../../_actions/load-document-audit-timeline';
import type { DocumentAuditEntityType } from '../../../../_actions/document-audit-timeline.types';
import { buildAuditTimelineLabels } from '../../../../_components/audit-timeline/audit-timeline-labels';
import { LpAuditTimelineMount } from './lp-audit-timeline-mount.client';

/**
 * C085 — LP-scoped audit timeline section.
 *
 * Resolves i18n + data on the server, then hands plain serializable props to a
 * client-only mount wrapper so Intl timestamp formatting never participates in SSR
 * hydration on the LP detail route.
 */
export async function LpAuditTimelineSection({
  entityType,
  entityId,
}: {
  entityType: DocumentAuditEntityType;
  entityId: string;
}) {
  const t = await getTranslations('audit.timeline');
  const labels = buildAuditTimelineLabels(t);
  const result = await loadDocumentAuditTimeline({ entityType, entityId, limit: 50 });

  if (!result.ok) {
    return null;
  }

  return (
    <LpAuditTimelineMount
      entityType={entityType}
      entityId={entityId}
      initialRows={result.data.rows}
      initialHasMore={result.data.hasMore}
      labels={labels}
    />
  );
}
