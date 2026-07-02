import { getTranslations } from 'next-intl/server';

import { loadDocumentAuditTimeline } from '../../_actions/load-document-audit-timeline';
import type { DocumentAuditEntityType } from '../../_actions/document-audit-timeline.types';
import { buildAuditTimelineLabels } from './audit-timeline-labels';
import { DocumentAuditTimelinePanel } from './document-audit-timeline.client';

export async function DocumentAuditTimelineSection({
  entityType,
  entityId,
}: {
  entityType: DocumentAuditEntityType;
  entityId: string;
  /** @deprecated locale is no longer needed — i18n is resolved server-side via getTranslations. */
  locale?: string;
}) {
  const t = await getTranslations('audit.timeline');
  const labels = buildAuditTimelineLabels(t);
  const result = await loadDocumentAuditTimeline({ entityType, entityId, limit: 50 });

  if (!result.ok) {
    return null;
  }

  return (
    <DocumentAuditTimelinePanel
      entityType={entityType}
      entityId={entityId}
      initialRows={result.data.rows}
      initialHasMore={result.data.hasMore}
      labels={labels}
    />
  );
}
