import { describe, expect, it, vi } from 'vitest';

import { queryPartitionAwareAuditLog } from './audit-log-loader';

type QueryCall = { sql: string; params: readonly unknown[] };

function makeClient() {
  const calls: QueryCall[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.startsWith('select count(*)')) {
        return { rows: [{ total: '2' }] };
      }
      if (normalized.includes('union all') && normalized.includes('from public.audit_events ae')) {
        return {
          rows: [
            {
              id: 'log-1',
              occurred_at: '2026-06-01T10:00:00.000Z',
              actor_name: 'Alice',
              actor_email: 'alice@example.com',
              actor_type: 'user',
              action: 'update',
              resource_type: 'users',
              resource_id: 'user-1',
              before_state: null,
              after_state: { active: true },
              request_id: null,
            },
            {
              id: 'events:42',
              occurred_at: '2026-06-01T09:00:00.000Z',
              actor_name: 'Bob',
              actor_email: 'bob@example.com',
              actor_type: 'user',
              action: 'settings.role_permissions.updated',
              resource_type: 'role',
              resource_id: 'role-1',
              before_state: { permissions: [] },
              after_state: { permissions: ['warehouse.stock.move'] },
              request_id: 'req-1',
            },
          ],
        };
      }
      if (normalized.startsWith('explain')) {
        return { rows: [{ 'QUERY PLAN': 'Seq Scan on audit_log_2026_06' }] };
      }
      return { rows: [] };
    }),
  };
}

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { client: ReturnType<typeof makeClient> }) => Promise<unknown>) =>
    action({ client: makeClient() }),
  ),
}));

describe('audit-log-loader', () => {
  it('unions audit_log with audit_events so RBAC security events are visible', async () => {
    const result = await queryPartitionAwareAuditLog({
      orgId: 'org-1',
      requestedOrgId: 'org-1',
      datePreset: '30d',
      from: '2026-06-01',
      to: '2026-06-30',
      page: 1,
      pageSize: 50,
      user: 'all',
      action: 'all',
      tableContains: '',
      search: '',
    });

    expect(result.totalCount).toBe(2);
    expect(result.entries.map((entry) => entry.id)).toEqual(['log-1', 'events:42']);
    expect(result.entries[1]?.tableName).toBe('role');
    expect(result.entries[1]?.action).toBe('update');
  });
});
