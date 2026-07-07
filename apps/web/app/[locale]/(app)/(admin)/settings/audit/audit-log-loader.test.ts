import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryPartitionAwareAuditLog } from './audit-log-loader';

type QueryCall = { sql: string; params: readonly unknown[] };

type AuditFixtureRow = {
  id: string;
  occurred_at: string;
  actor_name: string;
  actor_email: string;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  before_state: unknown;
  after_state: unknown;
  request_id: string | null;
  source_priority: number;
  source_id: string;
};

const DEDUPED_ROWS: AuditFixtureRow[] = [
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
    source_priority: 1,
    source_id: 'log-1',
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
    source_priority: 2,
    source_id: '42',
  },
];

const TIED_TIMESTAMP_ROWS: AuditFixtureRow[] = [
  {
    id: 'log-2',
    occurred_at: '2026-06-01T10:00:00.000Z',
    actor_name: 'Earlier event',
    actor_email: 'earlier@example.com',
    actor_type: 'user',
    action: 'update',
    resource_type: 'users',
    resource_id: 'user-2',
    before_state: null,
    after_state: { active: true },
    request_id: 'req-2',
    source_priority: 1,
    source_id: 'log-2',
  },
  {
    id: 'events:9',
    occurred_at: '2026-06-01T10:00:00.000Z',
    actor_name: 'Later event',
    actor_email: 'later@example.com',
    actor_type: 'user',
    action: 'update',
    resource_type: 'users',
    resource_id: 'user-9',
    before_state: null,
    after_state: { active: false },
    request_id: 'req-9',
    source_priority: 2,
    source_id: '9',
  },
];


const { _withOrgContextRunner, _setClient, _makeDefaultClient } = vi.hoisted(() => {
  function sortDedupedRows(rows: Array<{
    id: string;
    occurred_at: string;
    actor_name: string;
    actor_email: string;
    actor_type: string;
    action: string;
    resource_type: string;
    resource_id: string;
    before_state: unknown;
    after_state: unknown;
    request_id: string | null;
    source_priority: number;
    source_id: string;
  }>) {
    return [...rows].sort((left, right) => {
      const leftTime = Date.parse(left.occurred_at);
      const rightTime = Date.parse(right.occurred_at);
      if (rightTime !== leftTime) return rightTime - leftTime;
      if (left.source_priority !== right.source_priority) return left.source_priority - right.source_priority;
      return right.source_id.localeCompare(left.source_id);
    });
  }

  function makeClient(rows: Array<{
    id: string;
    occurred_at: string;
    actor_name: string;
    actor_email: string;
    actor_type: string;
    action: string;
    resource_type: string;
    resource_id: string;
    before_state: unknown;
    after_state: unknown;
    request_id: string | null;
    source_priority: number;
    source_id: string;
  }>) {
    const calls: QueryCall[] = [];
    const deduped = sortDedupedRows(rows);
    return {
      calls,
      deduped,
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (normalized.includes('select count(*)') && normalized.includes('from deduped')) {
          return { rows: [{ total: String(deduped.length) }] };
        }
        if (normalized.includes('from deduped') && normalized.includes('order by occurred_at desc')) {
          const limit = Number(params[12] ?? 50);
          const offset = Number(params[13] ?? 0);
          return { rows: deduped.slice(offset, offset + limit) };
        }
        if (normalized.startsWith('explain')) {
          return { rows: [{ 'QUERY PLAN': 'Seq Scan on audit_log_2026_06' }] };
        }
        return { rows: [] };
      }),
    };
  }

  const defaultRows = [
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
      source_priority: 1,
      source_id: 'log-1',
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
      source_priority: 2,
      source_id: '42',
    },
  ];

  let currentClient = makeClient(defaultRows);
  return {
    _withOrgContextRunner: vi.fn(async (action: (ctx: { client: ReturnType<typeof makeClient> }) => Promise<unknown>) =>
      action({ client: currentClient }),
    ),
    _setClient: (client: ReturnType<typeof makeClient>) => {
      currentClient = client;
    },
    _makeDefaultClient: makeClient,
  };
});

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { client: ReturnType<typeof _makeDefaultClient> }) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

const baseInput = {
  orgId: 'org-1',
  requestedOrgId: 'org-1',
  datePreset: '30d' as const,
  from: '2026-06-01',
  to: '2026-06-30',
  user: 'all',
  action: 'all',
  tableContains: '',
  search: '',
};

beforeEach(() => {
  _setClient(_makeDefaultClient(DEDUPED_ROWS));
});

describe('audit-log-loader', () => {
  it('unions audit_log with audit_events so RBAC security events are visible', async () => {
    const result = await queryPartitionAwareAuditLog({
      ...baseInput,
      page: 1,
      pageSize: 50,
    });

    expect(result.totalCount).toBe(2);
    expect(result.entries.map((entry) => entry.id)).toEqual(['log-1', 'events:42']);
    expect(result.entries[1]?.tableName).toBe('role');
    expect(result.entries[1]?.action).toBe('update');
  });

  it('dedupes the same logical event when it exists in both audit_log and audit_events', async () => {
    const client = _makeDefaultClient([
      {
        id: 'log-dup',
        occurred_at: '2026-06-01T11:00:00.000Z',
        actor_name: 'Alice',
        actor_email: 'alice@example.com',
        actor_type: 'user',
        action: 'settings.user.deactivated',
        resource_type: 'org_security_policies',
        resource_id: 'user-dup',
        before_state: null,
        after_state: { is_active: false },
        request_id: 'req-dup',
        source_priority: 1,
        source_id: 'log-dup',
      },
    ]);
    _setClient(client);

    const result = await queryPartitionAwareAuditLog({
      ...baseInput,
      page: 1,
      pageSize: 50,
    });

    expect(result.totalCount).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.id).toBe('log-dup');

    const dataQuery = client.calls.find(
      (call) =>
        call.sql.toLowerCase().includes('from deduped') &&
        call.sql.toLowerCase().includes('limit $13 offset $14'),
    );
    expect(dataQuery?.sql).toContain('distinct on');
    expect(dataQuery?.sql).toContain('order by occurred_at desc, source_priority asc, source_id desc');
  });

  it('keeps stable ordering for equal-timestamp rows across pages', async () => {
    const client = _makeDefaultClient(TIED_TIMESTAMP_ROWS);
    _setClient(client);

    const pageOne = await queryPartitionAwareAuditLog({
      ...baseInput,
      page: 1,
      pageSize: 1,
    });
    const pageTwo = await queryPartitionAwareAuditLog({
      ...baseInput,
      page: 2,
      pageSize: 1,
    });

    expect(pageOne.entries.map((entry) => entry.id)).toEqual(['log-2']);
    expect(pageTwo.entries.map((entry) => entry.id)).toEqual(['events:9']);
    expect([...pageOne.entries, ...pageTwo.entries].map((entry) => entry.id)).toEqual(['log-2', 'events:9']);
  });
});
