import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDocumentAuditTimeline } from '../get-document-audit-timeline';
import type { QueryClient } from '../document-audit-timeline.types';

const ORG_PO_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '22222222-2222-4222-8222-222222222222';

type MockRow = Record<string, unknown>;

/**
 * Entity-aware client: rows for audit_events / audit_log / statusHistory are
 * keyed on the FIRST bound parameter (entity id). This ensures the test fails
 * if the query ignores its filter — a different entity id returns no rows.
 */
function makeClient(
  targetEntityId: string,
  handlers: {
    auditEvents?: MockRow[];
    auditLog?: MockRow[];
    statusHistory?: MockRow[];
  },
): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      const boundEntityId = params?.[0];

      if (normalized.includes('from public.audit_events')) {
        // Only return rows when the bound entity id matches the target.
        return { rows: boundEntityId === targetEntityId ? (handlers.auditEvents ?? []) : [] };
      }
      if (normalized.includes('from public.audit_log')) {
        return { rows: boundEntityId === targetEntityId ? (handlers.auditLog ?? []) : [] };
      }
      if (normalized.includes('from public.lp_state_history')) {
        return { rows: boundEntityId === targetEntityId ? (handlers.statusHistory ?? []) : [] };
      }
      return { rows: [] };
    }),
  };
}

describe('getDocumentAuditTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges audit_events + audit_log + status_history newest-first with actor join', async () => {
    const client = makeClient(ORG_PO_ID, {
      auditEvents: [
        {
          id: '10',
          action: 'planning.purchase_order.updated',
          occurred_at: '2026-06-10T12:00:00.000Z',
          actor_user_id: USER_ID,
          actor_name: 'Ada Planner',
          actor_type: 'user',
          before_state: { status: 'draft' },
          after_state: { status: 'sent' },
        },
      ],
      auditLog: [
        {
          id: '20',
          action: 'update',
          occurred_at: '2026-06-11T08:00:00.000Z',
          actor_user_id: USER_ID,
          actor_name: 'Ada Planner',
          actor_type: 'user',
          before_state: null,
          after_state: { notes: 'Rush' },
        },
      ],
      statusHistory: [],
    });

    const result = await getDocumentAuditTimeline('purchase_order', ORG_PO_ID, { client, limit: 50 });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.id).toBe('audit_log:20');
    expect(result.rows[1]?.id).toBe('audit_events:10');
    expect(result.rows[0]?.actorName).toBe('Ada Planner');
    expect(result.rows[1]?.details).toEqual({
      before: { status: 'draft' },
      after: { status: 'sent' },
    });

    const auditEventsCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      sql.toLowerCase().includes('from public.audit_events'),
    );
    expect(auditEventsCall?.[1]).toEqual(
      expect.arrayContaining([ORG_PO_ID, 'purchase_order', 100]),
    );
  });

  it('scopes GRN reads to the GRN id and its line items', async () => {
    const grnId = '99999999-9999-4999-8999-999999999999';
    const client = makeClient(grnId, {
      auditEvents: [
        {
          id: '31',
          action: 'warehouse.receipt.corrected',
          occurred_at: '2026-06-12T09:00:00.000Z',
          actor_user_id: USER_ID,
          actor_name: 'Bob WH',
          actor_type: 'user',
          before_state: { cancelled: false },
          after_state: { cancelled: true },
        },
      ],
      statusHistory: [
        {
          id: '41',
          occurred_at: '2026-06-12T08:30:00.000Z',
          actor_user_id: USER_ID,
          actor_name: 'Bob WH',
          action: 'lp_state.transition',
          from_status: 'received',
          to_status: 'available',
          reason: 'auto_putaway',
          details: { from: 'received', to: 'available' },
        },
      ],
    });

    const result = await getDocumentAuditTimeline('grn', grnId, { client, limit: 50 });

    expect(result.rows.map((r) => r.id)).toEqual(['audit_events:31', 'status_history:41']);

    const auditEventsSql = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => sql.toLowerCase().includes('from public.audit_events'))?.[0];
    expect(auditEventsSql).toContain('grn_item');
    expect(auditEventsSql).toContain('grn_id');
  });

  it('does not return rows for a different entity id (entity isolation)', async () => {
    // Client is seeded for ORG_PO_ID; querying with OTHER_PO_ID must yield 0 rows.
    const client = makeClient(ORG_PO_ID, {
      auditEvents: [
        {
          id: '99',
          action: 'planning.purchase_order.updated',
          occurred_at: '2026-06-10T12:00:00.000Z',
          actor_user_id: USER_ID,
          actor_name: 'Ada Planner',
          actor_type: 'user',
          before_state: null,
          after_state: null,
        },
      ],
    });

    // Query with a DIFFERENT entity id — mock returns empty because params[0] !== ORG_PO_ID.
    const result = await getDocumentAuditTimeline('purchase_order', OTHER_PO_ID, { client });

    // The first bound param must be the queried entity id (not the seeded one).
    const params = vi.mocked(client.query).mock.calls.find(([sql]) =>
      sql.toLowerCase().includes('from public.audit_events'),
    )?.[1];
    expect(params?.[0]).toBe(OTHER_PO_ID);
    expect(params?.[0]).not.toBe(ORG_PO_ID);

    // Rows are empty because the mock gates on entity id mismatch.
    expect(result.rows).toHaveLength(0);
  });

  it('paginates with offset + limit', async () => {
    const client = makeClient(ORG_PO_ID, {
      auditEvents: Array.from({ length: 3 }, (_, i) => ({
        id: String(i + 1),
        action: `planning.purchase_order.event_${i}`,
        occurred_at: `2026-06-1${i}T10:00:00.000Z`,
        actor_user_id: USER_ID,
        actor_name: 'Ada Planner',
        actor_type: 'user',
        before_state: null,
        after_state: null,
      })),
    });

    const page = await getDocumentAuditTimeline('purchase_order', ORG_PO_ID, {
      client,
      limit: 1,
      offset: 1,
    });

    expect(page.rows).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    expect(page.rows[0]?.action).toBe('planning.purchase_order.event_1');
  });
});
