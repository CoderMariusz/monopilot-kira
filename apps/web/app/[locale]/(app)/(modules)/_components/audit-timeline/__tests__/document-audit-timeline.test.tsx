import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentAuditTimelineRow } from '../../_actions/document-audit-timeline.types';
import { buildAuditTimelineLabels } from '../audit-timeline-labels';
import { DocumentAuditTimelinePanel } from '../document-audit-timeline.client';

vi.mock('../../_actions/load-document-audit-timeline', () => ({
  loadDocumentAuditTimeline: vi.fn(),
}));

// Simulate next-intl's getTranslations('audit.timeline') with a local map of EN strings.
const EN_STRINGS: Record<string, string> = {
  title: 'History',
  subtitle: 'Read-only audit trail for this document.',
  empty: 'No history yet',
  emptyBody: 'Changes to this document will appear here.',
  colWhen: 'When',
  colActor: 'Actor',
  colAction: 'Action',
  detailsToggle: 'Details',
  showMore: 'Show more',
  loadingMore: 'Loading…',
  unknownActor: 'Unknown',
  'source.audit_events': 'Audit event',
  'source.audit_log': 'Audit log',
  'source.status_history': 'Status change',
};

const labels = buildAuditTimelineLabels((key) => EN_STRINGS[key] ?? key);

const sampleRows: DocumentAuditTimelineRow[] = [
  {
    id: 'audit_events:1',
    source: 'audit_events',
    occurredAt: '2026-06-12T10:00:00.000Z',
    actorName: 'Ada Planner',
    actorUserId: '22222222-2222-4222-8222-222222222222',
    action: 'planning.purchase_order.status_changed',
    details: { before: { status: 'draft' }, after: { status: 'sent' } },
  },
];

describe('DocumentAuditTimelinePanel', () => {
  it('renders merged timeline rows with actor, action, and details disclosure', async () => {
    const user = userEvent.setup();
    render(
      <DocumentAuditTimelinePanel
        entityType="purchase_order"
        entityId="33333333-3333-4333-8333-333333333333"
        initialRows={sampleRows}
        initialHasMore={false}
        labels={labels}
      />,
    );

    expect(screen.getByTestId('document-audit-timeline')).toBeInTheDocument();
    expect(screen.getByText('planning.purchase_order.status_changed')).toBeInTheDocument();
    expect(screen.getByText('Ada Planner')).toBeInTheDocument();
    expect(screen.getByText(labels.source.audit_events)).toBeInTheDocument();

    await user.click(screen.getByText(labels.detailsToggle));
    expect(screen.getByTestId('document-audit-payload')).toHaveTextContent('"status": "sent"');
  });

  it('shows the empty state when there are no rows', () => {
    render(
      <DocumentAuditTimelinePanel
        entityType="sales_order"
        entityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        initialRows={[]}
        initialHasMore={false}
        labels={labels}
      />,
    );

    expect(screen.getByText(labels.empty)).toBeInTheDocument();
    expect(screen.getByText(labels.emptyBody)).toBeInTheDocument();
  });
});
