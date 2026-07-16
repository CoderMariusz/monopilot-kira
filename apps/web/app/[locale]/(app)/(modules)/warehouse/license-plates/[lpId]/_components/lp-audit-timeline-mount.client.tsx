'use client';

/**
 * C085 — LP detail audit timeline mount gate (React #418 / hydration).
 *
 * DocumentAuditTimelinePanel formats timestamps with host-local Intl during SSR
 * (Vercel UTC) vs browser TZ → text mismatch. Defer the panel until after mount so
 * the audit block is client-only on this route (server still loads rows + labels).
 */
import { useEffect, useState } from 'react';

import { DocumentAuditTimelinePanel } from '../../../../_components/audit-timeline/document-audit-timeline.client';
import type { DocumentAuditEntityType, DocumentAuditTimelineRow } from '../../../../_actions/document-audit-timeline.types';
import type { AuditTimelineLabels } from '../../../../_components/audit-timeline/audit-timeline-labels';

export function LpAuditTimelineMount({
  entityType,
  entityId,
  initialRows,
  initialHasMore,
  labels,
}: {
  entityType: DocumentAuditEntityType;
  entityId: string;
  initialRows: DocumentAuditTimelineRow[];
  initialHasMore: boolean;
  labels: AuditTimelineLabels;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <DocumentAuditTimelinePanel
      entityType={entityType}
      entityId={entityId}
      initialRows={initialRows}
      initialHasMore={initialHasMore}
      labels={labels}
    />
  );
}
